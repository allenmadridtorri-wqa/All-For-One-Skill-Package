import fs from 'node:fs';
import { ProductionMemoryLedger } from './production-memory.ts';
import { assertSafeSubpathSync } from './security.ts';

export type VisualIterationPhase =
  | 'CREATE'
  | 'RENDER'
  | 'INSPECT'
  | 'DIAGNOSE'
  | 'IMPROVE'
  | 'RE_RENDER';

export interface RenderInspectionInput {
  artifactRelPath: string;
  criteriaChecklist: Array<{ criterion: string; passed: boolean; notes: string }>;
  inspectorNotes: string;
  qualityScore: number; // 0..1
}

export interface VisualInspectionResult {
  artifactPath: string;
  fileValid: boolean;
  fileSizeBytes: number;
  imageFormat: 'png' | 'jpeg' | 'webp' | 'unknown';
  inspected: boolean;
  status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'FAILED';
  qualityScore: number;
  failedCriteria: string[];
  diagnosis: string;
}

export interface VisualIterationStepRecord {
  iteration: number;
  phaseSequence: VisualIterationPhase[];
  inspection: VisualInspectionResult;
  improvementAction: string;
  keptAsBest: boolean;
}

function detectImageSignature(bytes: Buffer): 'png' | 'jpeg' | 'webp' | 'unknown' {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return 'unknown';
}

/**
 * Inspects a rendered artifact honestly: file existence alone is NEVER sufficient
 * to mark visual quality VERIFIED—valid image signature AND passed acceptance
 * criteria + explicit inspection notes are mandatory.
 */
export function inspectVisualRender(
  workspaceDir: string,
  input: RenderInspectionInput,
): VisualInspectionResult {
  const absPath = assertSafeSubpathSync(workspaceDir, input.artifactRelPath);
  if (!fs.existsSync(absPath)) {
    return {
      artifactPath: input.artifactRelPath,
      fileValid: false,
      fileSizeBytes: 0,
      imageFormat: 'unknown',
      inspected: false,
      status: 'UNVERIFIED',
      qualityScore: 0,
      failedCriteria: input.criteriaChecklist.map((c) => c.criterion),
      diagnosis: 'Render artifact missing on disk; cannot claim visual quality.',
    };
  }

  const bytes = fs.readFileSync(absPath);
  const imageFormat = detectImageSignature(bytes);
  if (bytes.length < 64 || imageFormat === 'unknown') {
    return {
      artifactPath: input.artifactRelPath,
      fileValid: false,
      fileSizeBytes: bytes.length,
      imageFormat,
      inspected: true,
      status: 'FAILED',
      qualityScore: 0,
      failedCriteria: ['Valid non-empty PNG/JPEG/WEBP render output'],
      diagnosis: `Render file "${input.artifactRelPath}" is empty, corrupt, or unrecognized image format (${bytes.length} bytes).`,
    };
  }

  if (input.criteriaChecklist.length === 0 || input.inspectorNotes.trim().length < 8) {
    return {
      artifactPath: input.artifactRelPath,
      fileValid: true,
      fileSizeBytes: bytes.length,
      imageFormat,
      inspected: false,
      status: 'PARTIALLY_VERIFIED',
      qualityScore: input.qualityScore,
      failedCriteria: ['Visual inspection checklist & written diagnostic review'],
      diagnosis: 'File exists and has valid image header, but file existence alone does not prove visual quality.',
    };
  }

  const failedCriteria = input.criteriaChecklist.filter((c) => !c.passed).map((c) => c.criterion);
  const status = failedCriteria.length === 0 ? 'VERIFIED' : 'PARTIALLY_VERIFIED';

  return {
    artifactPath: input.artifactRelPath,
    fileValid: true,
    fileSizeBytes: bytes.length,
    imageFormat,
    inspected: true,
    status,
    qualityScore: Math.max(0, Math.min(1, input.qualityScore)),
    failedCriteria,
    diagnosis:
      failedCriteria.length === 0
        ? `Visual inspection passed all ${input.criteriaChecklist.length} criteria: ${input.inspectorNotes}`
        : `Visual issues diagnosed on ${failedCriteria.length} criterion/criteria: ${failedCriteria.join('; ')}`,
  };
}

/**
 * Manages the bounded Create -> Render -> Inspect -> Diagnose -> Improve -> Render Again
 * visual iteration loop and preserves the highest-scoring verified output.
 */
export class VisualIterationController {
  private readonly workspaceDir: string;
  private readonly ledger?: ProductionMemoryLedger;
  private readonly maxIterations: number;
  private readonly targetScore: number;
  private readonly steps: VisualIterationStepRecord[] = [];
  private bestScore = -1;
  private bestArtifactPath: string | null = null;

  constructor(
    workspaceDir: string,
    options: { maxIterations?: number; targetScore?: number; ledger?: ProductionMemoryLedger } = {},
  ) {
    this.workspaceDir = workspaceDir;
    this.maxIterations = options.maxIterations ?? 4;
    this.targetScore = options.targetScore ?? 0.9;
    this.ledger = options.ledger;
  }

  canIterate(): boolean {
    if (this.steps.length >= this.maxIterations) return false;
    if (this.bestScore >= this.targetScore) return false;
    return true;
  }

  runStep(
    input: RenderInspectionInput,
    improvementAction: string,
  ): VisualIterationStepRecord {
    if (!this.canIterate()) {
      throw new Error('Visual iteration budget reached or target score already satisfied.');
    }

    const inspection = inspectVisualRender(this.workspaceDir, input);
    const isInitial = this.steps.length === 0;
    const phaseSequence: VisualIterationPhase[] = isInitial
      ? ['CREATE', 'RENDER', 'INSPECT', 'DIAGNOSE']
      : ['IMPROVE', 'RE_RENDER', 'INSPECT', 'DIAGNOSE'];

    let keptAsBest = false;
    if (inspection.fileValid && inspection.inspected && inspection.qualityScore > this.bestScore) {
      this.bestScore = inspection.qualityScore;
      this.bestArtifactPath = inspection.artifactPath;
      keptAsBest = true;

      if (this.ledger) {
        const abs = assertSafeSubpathSync(this.workspaceDir, inspection.artifactPath);
        this.ledger.preserveKnownGoodOutput(
          'best-visual-render',
          inspection.artifactPath,
          fs.readFileSync(abs),
          inspection.qualityScore,
        );
      }
    }

    const record: VisualIterationStepRecord = {
      iteration: this.steps.length + 1,
      phaseSequence,
      inspection,
      improvementAction,
      keptAsBest,
    };
    this.steps.push(record);
    return record;
  }

  getBestVerifiedOutput(): { artifactPath: string | null; score: number } {
    return {
      artifactPath: this.bestArtifactPath,
      score: Math.max(0, this.bestScore),
    };
  }

  getHistory(): VisualIterationStepRecord[] {
    return [...this.steps];
  }
}
