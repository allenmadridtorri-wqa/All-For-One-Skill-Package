import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EngineId } from './engine-profiles.ts';

// ---------------------------------------------------------------------------
// 1. Hardware Resource Awareness
// ---------------------------------------------------------------------------

export interface HardwareProfile {
  cpuCores: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  tier: 'constrained' | 'standard' | 'workstation';
  recommendedMaxParallelJobs: number;
}

export function detectHardwareProfile(
  override?: Partial<{ cpuCores: number; totalMemoryMb: number; freeMemoryMb: number }>,
): HardwareProfile {
  const cpuCores = override?.cpuCores ?? Math.max(1, os.cpus().length);
  const totalMemoryMb = override?.totalMemoryMb ?? Math.round(os.totalmem() / (1024 * 1024));
  const freeMemoryMb = override?.freeMemoryMb ?? Math.round(os.freemem() / (1024 * 1024));

  let tier: HardwareProfile['tier'] = 'standard';
  let recommendedMaxParallelJobs = Math.max(1, Math.min(4, Math.floor(cpuCores / 2)));

  if (cpuCores <= 2 || freeMemoryMb < 2048 || totalMemoryMb < 4096) {
    tier = 'constrained';
    recommendedMaxParallelJobs = 1;
  } else if (cpuCores >= 8 && freeMemoryMb >= 6144) {
    tier = 'workstation';
    recommendedMaxParallelJobs = Math.min(6, Math.floor(cpuCores / 2));
  }

  return {
    cpuCores,
    totalMemoryMb,
    freeMemoryMb,
    tier,
    recommendedMaxParallelJobs,
  };
}

// ---------------------------------------------------------------------------
// 2. Project Quality Bars (Genre + Engine Contracts)
// ---------------------------------------------------------------------------

export type GameGenre =
  | 'open-world'
  | 'sandbox'
  | 'mmorpg'
  | 'rpg'
  | 'survival'
  | 'simulation'
  | 'strategy'
  | 'multiplayer'
  | 'action-3d'
  | 'cinematic';

export interface QualityMetricTarget {
  id: string;
  category:
    | 'functional'
    | 'visual'
    | 'performance'
    | 'stability'
    | 'maintainability'
    | 'compatibility'
    | 'user-requirement';
  description: string;
  thresholdLabel: string;
  required: boolean;
}

export interface QualityContract {
  projectId: string;
  engine: EngineId;
  genre: GameGenre;
  targets: QualityMetricTarget[];
}

export interface QualityEvidenceInput {
  targetId: string;
  measuredValue: string;
  passed: boolean;
  evidenceArtifact?: string;
}

export interface QualityEvaluationSummary {
  allRequiredPassed: boolean;
  achieved: string[];
  failed: string[];
  unmeasured: string[];
}

export function createQualityContract(
  projectId: string,
  engine: EngineId,
  genre: GameGenre,
  userRequirements: string[] = [],
): QualityContract {
  const targets: QualityMetricTarget[] = [
    {
      id: 'FUNC-CORE-TESTS',
      category: 'functional',
      description: 'Core simulation and state transitions pass deterministic tests.',
      thresholdLabel: '100% core unit tests pass',
      required: true,
    },
    {
      id: 'VIS-PIPELINE',
      category: 'visual',
      description: `Visual assets, lighting, and tone mapping conform to ${engine} pipeline.`,
      thresholdLabel: 'Visual reference + audit checks pass with real render evidence',
      required: true,
    },
    {
      id: 'PERF-FRAME-BUDGET',
      category: 'performance',
      description:
        engine === 'threejs'
          ? 'Web frame pacing and draw-call budget respected.'
          : 'Native/engine frame-time and memory ceiling respected.',
      thresholdLabel:
        genre === 'mmorpg' || genre === 'open-world'
          ? '<= 16.6ms frame time with streaming cell LODs'
          : '<= 16.6ms average frame time (60 FPS target)',
      required: true,
    },
    {
      id: 'STAB-LIFECYCLE',
      category: 'stability',
      description: 'Resource lifecycle cleanup and error recovery verified with zero crashes.',
      thresholdLabel: '0 unhandled exceptions; 0 leaked GPU/audio handles',
      required: true,
    },
    {
      id: 'MAINT-MODULAR',
      category: 'maintainability',
      description: 'Engine-appropriate modular boundaries and documented trade-offs.',
      thresholdLabel: 'Static analysis & type checks pass',
      required: true,
    },
    {
      id: 'COMPAT-ENGINE',
      category: 'compatibility',
      description: `No foreign engine APIs mixed into ${engine} modules.`,
      thresholdLabel: '0 cross-engine API violations',
      required: true,
    },
  ];

  userRequirements.forEach((req, idx) => {
    targets.push({
      id: `USER-REQ-${idx + 1}`,
      category: 'user-requirement',
      description: req,
      thresholdLabel: 'Demonstrably satisfied and verified',
      required: true,
    });
  });

  return { projectId, engine, genre, targets };
}

export function evaluateQualityContract(
  contract: QualityContract,
  evidence: QualityEvidenceInput[],
): QualityEvaluationSummary {
  const byId = new Map(evidence.map((e) => [e.targetId, e]));
  const achieved: string[] = [];
  const failed: string[] = [];
  const unmeasured: string[] = [];

  for (const target of contract.targets) {
    const ev = byId.get(target.id);
    if (!ev || !ev.measuredValue) {
      unmeasured.push(target.id);
    } else if (ev.passed) {
      achieved.push(target.id);
    } else {
      failed.push(target.id);
    }
  }

  const allRequiredPassed = contract.targets
    .filter((t) => t.required)
    .every((t) => {
      const ev = byId.get(t.id);
      return Boolean(ev && ev.passed && ev.measuredValue);
    });

  return { allRequiredPassed, achieved, failed, unmeasured };
}

// ---------------------------------------------------------------------------
// 3. Continuous Improvement Engine (Bounded 10-Step Loop)
// ---------------------------------------------------------------------------

export type ImprovementDomain =
  | 'mechanics'
  | 'environment-3d'
  | 'characters'
  | 'materials'
  | 'animations'
  | 'shaders'
  | 'ui'
  | 'networking'
  | 'architecture'
  | 'performance';

export type LoopStopReason =
  | 'RUNNING'
  | 'QUALITY_THRESHOLD_MET'
  | 'MAX_ITERATIONS_REACHED'
  | 'TIME_BUDGET_EXHAUSTED'
  | 'NO_MEASURABLE_IMPROVEMENT'
  | 'REGRESSION_DETECTED';

export interface IterationRecord {
  iteration: number;
  domain: ImprovementDomain;
  hypothesis: string;
  weaknessesIdentified: string[];
  changesApplied: string[];
  previousScore: number;
  newScore: number;
  delta: number;
  elapsedMs: number;
  accepted: boolean;
}

export interface ImprovementBudget {
  maxIterations: number;
  timeBudgetMs: number;
  qualityThreshold: number;
  minDelta: number;
  maxStaleStreak: number;
}

export class ContinuousImprovementEngine {
  public readonly budget: ImprovementBudget;
  public readonly hardware: HardwareProfile;
  private readonly startMs: number;
  private readonly history: IterationRecord[] = [];
  private staleStreak = 0;
  private currentScore: number;
  private stopReason: LoopStopReason = 'RUNNING';

  constructor(
    initialScore: number,
    budget: Partial<ImprovementBudget> = {},
    hardware: HardwareProfile = detectHardwareProfile(),
    startMs = Date.now(),
  ) {
    this.currentScore = initialScore;
    this.hardware = hardware;
    this.startMs = startMs;
    this.budget = {
      maxIterations:
        budget.maxIterations ?? (hardware.tier === 'constrained' ? 3 : 6),
      timeBudgetMs: budget.timeBudgetMs ?? 120_000,
      qualityThreshold: budget.qualityThreshold ?? 0.9,
      minDelta: budget.minDelta ?? 0.01,
      maxStaleStreak: budget.maxStaleStreak ?? 2,
    };
  }

  canContinue(nowMs = Date.now()): { ok: boolean; reason: LoopStopReason } {
    if (this.stopReason !== 'RUNNING') {
      return { ok: false, reason: this.stopReason };
    }
    if (this.currentScore >= this.budget.qualityThreshold) {
      this.stopReason = 'QUALITY_THRESHOLD_MET';
      return { ok: false, reason: this.stopReason };
    }
    if (this.staleStreak >= this.budget.maxStaleStreak) {
      this.stopReason = 'NO_MEASURABLE_IMPROVEMENT';
      return { ok: false, reason: this.stopReason };
    }
    if (nowMs - this.startMs >= this.budget.timeBudgetMs) {
      this.stopReason = 'TIME_BUDGET_EXHAUSTED';
      return { ok: false, reason: this.stopReason };
    }
    if (this.history.length >= this.budget.maxIterations) {
      this.stopReason = 'MAX_ITERATIONS_REACHED';
      return { ok: false, reason: this.stopReason };
    }
    return { ok: true, reason: 'RUNNING' };
  }

  recordIteration(
    input: {
      domain: ImprovementDomain;
      hypothesis: string;
      weaknessesIdentified: string[];
      changesApplied: string[];
      measuredScore: number;
    },
    nowMs = Date.now(),
  ): { record: IterationRecord; status: LoopStopReason } {
    const check = this.canContinue(nowMs);
    if (!check.ok) {
      throw new Error(`Improvement loop already stopped (${check.reason}).`);
    }

    const previousScore = this.currentScore;
    const delta = Number((input.measuredScore - previousScore).toFixed(4));
    const accepted = delta >= this.budget.minDelta;

    if (delta < 0) {
      this.stopReason = 'REGRESSION_DETECTED';
    } else if (!accepted) {
      this.staleStreak += 1;
    } else {
      this.staleStreak = 0;
      this.currentScore = input.measuredScore;
    }

    const record: IterationRecord = {
      iteration: this.history.length + 1,
      domain: input.domain,
      hypothesis: input.hypothesis,
      weaknessesIdentified: input.weaknessesIdentified,
      changesApplied: input.changesApplied,
      previousScore,
      newScore: input.measuredScore,
      delta,
      elapsedMs: Math.max(0, nowMs - this.startMs),
      accepted,
    };
    this.history.push(record);

    // Re-evaluate stop conditions after applying iteration
    this.canContinue(nowMs);
    return { record, status: this.stopReason };
  }

  getHistory(): IterationRecord[] {
    return [...this.history];
  }

  getCurrentScore(): number {
    return this.currentScore;
  }

  getStopReason(): LoopStopReason {
    return this.stopReason;
  }
}

// ---------------------------------------------------------------------------
// 4. Variant Generation & Comparison
// ---------------------------------------------------------------------------

export interface VariantCandidate {
  id: string;
  label: string;
  approachSummary: string;
  scores: Record<string, number>; // normalized 0..1 per criterion
  tradeOffs: string[];
}

export interface VariantComparisonReport {
  winnerId: string;
  rankings: Array<{
    id: string;
    label: string;
    weightedScore: number;
    tradeOffs: string[];
  }>;
  selectionRationale: string;
}

export function compareVariants(
  candidates: VariantCandidate[],
  weights: Record<string, number>,
): VariantComparisonReport {
  if (candidates.length < 2) {
    throw new Error('Variant comparison requires at least 2 candidates.');
  }
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    throw new Error('Criteria weights sum must be > 0.');
  }

  const rankings = candidates
    .map((c) => {
      let total = 0;
      for (const [criterion, w] of Object.entries(weights)) {
        const s = Math.max(0, Math.min(1, c.scores[criterion] ?? 0));
        total += s * (w / weightSum);
      }
      return {
        id: c.id,
        label: c.label,
        weightedScore: Number(total.toFixed(4)),
        tradeOffs: c.tradeOffs,
      };
    })
    .sort((a, b) => b.weightedScore - a.weightedScore);

  const winner = rankings[0];
  const runnerUp = rankings[1];
  const margin = Number((winner.weightedScore - runnerUp.weightedScore).toFixed(4));

  return {
    winnerId: winner.id,
    rankings,
    selectionRationale:
      `Selected "${winner.label}" (${winner.weightedScore}) over "${runnerUp.label}" (${runnerUp.weightedScore}) ` +
      `by a weighted margin of ${margin}. Key trade-offs: ${winner.tradeOffs.join('; ') || 'none noted'}.`,
  };
}

// ---------------------------------------------------------------------------
// 5. Render & Build Safety (Manifests, Stale Detection, Checkpointing, Backup)
// ---------------------------------------------------------------------------

export type JobState = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'INTERRUPTED' | 'FAILED';

export interface RenderOutputEntry {
  outputPath: string;
  inputHash: string;
  outputHash: string;
  sizeBytes: number;
  verified: boolean;
  updatedAt: string;
}

export interface RenderManifest {
  version: string;
  jobId: string;
  state: JobState;
  checkpoints: string[];
  outputs: Record<string, RenderOutputEntry>;
}

export function hashInputs(parts: Array<string | Buffer>): string {
  const h = crypto.createHash('sha256');
  for (const p of parts) {
    h.update(typeof p === 'string' ? Buffer.from(p, 'utf8') : p);
  }
  return h.digest('hex');
}

export class RenderSafetyManager {
  private readonly manifestPath: string;
  private readonly backupDir: string;

  constructor(workspaceDir: string, manifestRelPath = '.afo/render-manifest.json') {
    this.manifestPath = path.resolve(workspaceDir, manifestRelPath);
    this.backupDir = path.resolve(workspaceDir, '.afo/render-backups');
  }

  loadManifest(jobId = 'default-job'): RenderManifest {
    if (fs.existsSync(this.manifestPath)) {
      return JSON.parse(fs.readFileSync(this.manifestPath, 'utf8')) as RenderManifest;
    }
    return {
      version: '2.0.0',
      jobId,
      state: 'PENDING',
      checkpoints: [],
      outputs: {},
    };
  }

  saveManifest(manifest: RenderManifest): void {
    fs.mkdirSync(path.dirname(this.manifestPath), { recursive: true });
    fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  }

  isOutputStale(outputRelPath: string, expectedInputHash: string, baseDir: string): boolean {
    const manifest = this.loadManifest();
    const record = manifest.outputs[outputRelPath];
    const absOutput = path.resolve(baseDir, outputRelPath);
    if (!record || !fs.existsSync(absOutput)) return true;
    if (record.inputHash !== expectedInputHash) return true;
    const currentOutputHash = hashInputs([fs.readFileSync(absOutput)]);
    return currentOutputHash !== record.outputHash;
  }

  /** Backs up any existing verified output before replacing it with new output bytes. */
  commitOutputSafe(
    baseDir: string,
    outputRelPath: string,
    data: Buffer,
    inputHash: string,
    checkpointLabel?: string,
  ): { outputPath: string; backedUpTo: string | null } {
    const absOutput = path.resolve(baseDir, outputRelPath);
    let backedUpTo: string | null = null;

    if (fs.existsSync(absOutput)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupTarget = path.join(this.backupDir, ts, outputRelPath);
      fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
      fs.copyFileSync(absOutput, backupTarget);
      backedUpTo = backupTarget;
    }

    fs.mkdirSync(path.dirname(absOutput), { recursive: true });
    fs.writeFileSync(absOutput, data);

    const manifest = this.loadManifest();
    manifest.state = 'IN_PROGRESS';
    if (checkpointLabel && !manifest.checkpoints.includes(checkpointLabel)) {
      manifest.checkpoints.push(checkpointLabel);
    }
    manifest.outputs[outputRelPath] = {
      outputPath: outputRelPath,
      inputHash,
      outputHash: hashInputs([data]),
      sizeBytes: data.length,
      verified: data.length > 0,
      updatedAt: new Date().toISOString(),
    };
    this.saveManifest(manifest);

    return { outputPath: absOutput, backedUpTo };
  }

  markJobState(state: JobState): RenderManifest {
    const manifest = this.loadManifest();
    manifest.state = state;
    this.saveManifest(manifest);
    return manifest;
  }

  detectInterruptedCheckpoints(): { interrupted: boolean; completedCheckpoints: string[] } {
    const manifest = this.loadManifest();
    return {
      interrupted: manifest.state === 'IN_PROGRESS' || manifest.state === 'INTERRUPTED',
      completedCheckpoints: [...manifest.checkpoints],
    };
  }
}
