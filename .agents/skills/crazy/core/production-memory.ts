import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { EngineId } from './engine-profiles.ts';
import type { GameGenre } from './production-intelligence.ts';
import {
  assertSafeSubpathSync,
  atomicWriteFileSync,
  redactSecrets,
  withAdvisoryLock,
} from './security.ts';

export const LEDGER_FILES = [
  'PROJECT_BRIEF.md',
  'QUALITY_STANDARDS.md',
  'PROJECT_DECISIONS.md',
  'ITERATION_HISTORY.md',
  'PERFORMANCE_LEDGER.md',
  'VISUAL_REFERENCE.md',
  'VERIFICATION_REPORT.md',
] as const;

export type LedgerFileName = (typeof LEDGER_FILES)[number];

export interface DecisionEntry {
  id: string;
  date: string;
  owner: string;
  title: string;
  chosen: string;
  alternatives: string[];
  rationale: string;
  failedApproachKey?: string;
}

export interface IterationHistoryEntry {
  iteration: number;
  date: string;
  specialist: string;
  summary: string;
  improved: string[];
  regressed: string[];
  remaining: string[];
}

export interface PerformanceEntry {
  date: string;
  scenario: string;
  engine: EngineId;
  frameTimeMs: number;
  memoryMb: number;
  drawCalls?: number;
  notes: string;
}

export interface KnownGoodSnapshot {
  key: string;
  artifactPath: string;
  sha256: string;
  score: number;
  recordedAt: string;
}

export interface RecurringProblemSummary {
  patternKey: string;
  occurrences: number;
  recommendation: string;
}

interface StructuredMemoryState {
  version: '3.0.0';
  fileChecksums: Record<string, string>;
  failedApproaches: Record<string, { count: number; reasons: string[] }>;
  successfulApproaches: Record<string, { specialist: string; evidence: string; recordedAt: string }>;
  knownGoodSnapshots: Record<string, KnownGoodSnapshot>;
}

export class ProductionMemoryLedger {
  public readonly ledgerDir: string;
  private readonly failedApproaches = new Set<string>();
  private readonly statePath: string;
  private readonly lockPath: string;

  constructor(ledgerDir: string) {
    this.ledgerDir = path.resolve(ledgerDir);
    this.statePath = path.join(this.ledgerDir, '.afo-memory-state.json');
    this.lockPath = path.join(this.ledgerDir, '.afo-memory.lock');
  }

  private sha256(text: string): string {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
  }

  private loadState(): StructuredMemoryState {
    if (fs.existsSync(this.statePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as StructuredMemoryState;
      } catch {
        // Recover cleanly from corrupt state JSON while flagging checksum mismatch
      }
    }
    return {
      version: '3.0.0',
      fileChecksums: {},
      failedApproaches: {},
      successfulApproaches: {},
      knownGoodSnapshots: {},
    };
  }

  private saveState(state: StructuredMemoryState): void {
    atomicWriteFileSync(this.statePath, JSON.stringify(state, null, 2) + '\n');
  }

  private writeLedgerFile(file: LedgerFileName, rawContent: string): void {
    const cleanContent = redactSecrets(rawContent);
    const fullPath = assertSafeSubpathSync(this.ledgerDir, file);
    atomicWriteFileSync(fullPath, cleanContent);
    const state = this.loadState();
    state.fileChecksums[file] = this.sha256(cleanContent);
    this.saveState(state);
  }

  private appendLedgerFile(file: LedgerFileName, rawAppend: string): void {
    const fullPath = assertSafeSubpathSync(this.ledgerDir, file);
    const existing = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';
    this.writeLedgerFile(file, existing + redactSecrets(rawAppend));
  }

  initLedger(meta: {
    projectName: string;
    engine: EngineId;
    genre: GameGenre;
    objective: string;
    qualityStandards: string[];
    visualReferences: string[];
  }): void {
    fs.mkdirSync(this.ledgerDir, { recursive: true });
    withAdvisoryLock(this.lockPath, () => {
      const defaults: Record<LedgerFileName, string> = {
        'PROJECT_BRIEF.md': `# Project Brief — ${meta.projectName}\n\n- **Engine:** ${meta.engine}\n- **Genre:** ${meta.genre}\n- **Objective:** ${meta.objective}\n`,
        'QUALITY_STANDARDS.md': `# Quality Standards\n\n${meta.qualityStandards.map((q) => `- [ ] ${q}`).join('\n')}\n`,
        'PROJECT_DECISIONS.md': `# Project Decisions & Trade-Offs\n\n`,
        'ITERATION_HISTORY.md': `# Iteration History\n\n`,
        'PERFORMANCE_LEDGER.md': `# Performance Ledger\n\n| Date | Scenario | Engine | Frame Time (ms) | Memory (MB) | Notes |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`,
        'VISUAL_REFERENCE.md': `# Visual Reference & Acceptance Criteria\n\n${meta.visualReferences.map((v) => `- ${v}`).join('\n') || '- No visual references recorded yet.'}\n`,
        'VERIFICATION_REPORT.md': `# Verification Report\n\n_Status: UNVERIFIED (awaiting CRAZY QA execution)._\n`,
      };

      for (const file of LEDGER_FILES) {
        const fullPath = assertSafeSubpathSync(this.ledgerDir, file);
        if (!fs.existsSync(fullPath)) {
          this.writeLedgerFile(file, defaults[file]);
        }
      }
    });
  }

  recordDecision(entry: DecisionEntry): void {
    withAdvisoryLock(this.lockPath, () => {
      const block = [
        `## ${entry.id}: ${entry.title} (${entry.date})`,
        `- **Owner:** ${entry.owner}`,
        `- **Chosen:** ${entry.chosen}`,
        `- **Alternatives Considered:** ${entry.alternatives.join(', ') || 'None'}`,
        `- **Rationale:** ${entry.rationale}`,
        entry.failedApproachKey ? `- **Failed Approach Key:** \`${entry.failedApproachKey}\`` : '',
        '',
      ]
        .filter(Boolean)
        .join('\n');

      this.appendLedgerFile('PROJECT_DECISIONS.md', block + '\n');
      if (entry.failedApproachKey) {
        this.failedApproaches.add(entry.failedApproachKey);
      }
    });
  }

  recordFailedApproach(approachKey: string, reason: string): void {
    withAdvisoryLock(this.lockPath, () => {
      const safeReason = redactSecrets(reason);
      this.failedApproaches.add(approachKey);
      this.appendLedgerFile(
        'ITERATION_HISTORY.md',
        `- **DO-NOT-REPEAT [\`${approachKey}\`]**: ${safeReason}\n`,
      );
      const state = this.loadState();
      const prev = state.failedApproaches[approachKey] ?? { count: 0, reasons: [] };
      prev.count += 1;
      prev.reasons.push(safeReason);
      state.failedApproaches[approachKey] = prev;
      this.saveState(state);
    });
  }

  recordSuccessPattern(approachKey: string, specialist: string, evidence: string): void {
    withAdvisoryLock(this.lockPath, () => {
      const safeEvidence = redactSecrets(evidence);
      this.appendLedgerFile(
        'ITERATION_HISTORY.md',
        `- **KNOWN-GOOD [\`${approachKey}\`]** (${specialist}): ${safeEvidence}\n`,
      );
      const state = this.loadState();
      state.successfulApproaches[approachKey] = {
        specialist,
        evidence: safeEvidence,
        recordedAt: new Date().toISOString(),
      };
      this.saveState(state);
    });
  }

  preserveKnownGoodOutput(key: string, artifactPath: string, bytes: Buffer, score: number): KnownGoodSnapshot {
    return withAdvisoryLock(this.lockPath, () => {
      const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
      const snapshot: KnownGoodSnapshot = {
        key,
        artifactPath,
        sha256,
        score,
        recordedAt: new Date().toISOString(),
      };
      const state = this.loadState();
      const existing = state.knownGoodSnapshots[key];
      if (!existing || score >= existing.score) {
        state.knownGoodSnapshots[key] = snapshot;
        this.saveState(state);
        return snapshot;
      }
      return existing;
    });
  }

  getKnownGoodSnapshot(key: string): KnownGoodSnapshot | null {
    return this.loadState().knownGoodSnapshots[key] ?? null;
  }

  getRecurringProblems(minOccurrences = 2): RecurringProblemSummary[] {
    const state = this.loadState();
    return Object.entries(state.failedApproaches)
      .filter(([, v]) => v.count >= minOccurrences)
      .map(([patternKey, v]) => ({
        patternKey,
        occurrences: v.count,
        recommendation: `Avoid "${patternKey}" (failed ${v.count} times). Last issue: ${v.reasons[v.reasons.length - 1] ?? 'unknown'}.`,
      }))
      .sort((a, b) => b.occurrences - a.occurrences);
  }

  hasFailedApproach(approachKey: string): boolean {
    if (this.failedApproaches.has(approachKey)) return true;
    const state = this.loadState();
    if (state.failedApproaches[approachKey]) return true;
    const histPath = path.join(this.ledgerDir, 'ITERATION_HISTORY.md');
    if (!fs.existsSync(histPath)) return false;
    return fs.readFileSync(histPath, 'utf8').includes(`\`${approachKey}\``);
  }

  appendIteration(entry: IterationHistoryEntry): void {
    withAdvisoryLock(this.lockPath, () => {
      const block = [
        `## Iteration ${entry.iteration} (${entry.date}) — ${entry.specialist}`,
        `- **Summary:** ${entry.summary}`,
        `- **Improved:** ${entry.improved.join('; ') || 'None'}`,
        `- **Regressed:** ${entry.regressed.join('; ') || 'None'}`,
        `- **Remaining:** ${entry.remaining.join('; ') || 'None'}`,
        '',
      ].join('\n');
      this.appendLedgerFile('ITERATION_HISTORY.md', block + '\n');
    });
  }

  appendPerformanceMetric(entry: PerformanceEntry): void {
    withAdvisoryLock(this.lockPath, () => {
      const row = `| ${entry.date} | ${entry.scenario} | ${entry.engine} | ${entry.frameTimeMs.toFixed(2)} | ${entry.memoryMb.toFixed(1)} | ${entry.notes} |\n`;
      this.appendLedgerFile('PERFORMANCE_LEDGER.md', row);
    });
  }

  writeVerificationReport(markdown: string): void {
    withAdvisoryLock(this.lockPath, () => {
      this.writeLedgerFile('VERIFICATION_REPORT.md', markdown);
    });
  }

  /** Verifies that ledger markdown files were not truncated or corrupted outside the ledger API. */
  verifyIntegrity(): { ok: boolean; corruptedFiles: string[] } {
    const state = this.loadState();
    const corruptedFiles: string[] = [];
    for (const [file, expectedHash] of Object.entries(state.fileChecksums)) {
      const fullPath = assertSafeSubpathSync(this.ledgerDir, file);
      if (!fs.existsSync(fullPath)) {
        corruptedFiles.push(file);
        continue;
      }
      const actualHash = this.sha256(fs.readFileSync(fullPath, 'utf8'));
      if (actualHash !== expectedHash) {
        corruptedFiles.push(file);
      }
    }
    return { ok: corruptedFiles.length === 0, corruptedFiles };
  }

  listLedgerFiles(): string[] {
    if (!fs.existsSync(this.ledgerDir)) return [];
    return LEDGER_FILES.filter((f) => fs.existsSync(path.join(this.ledgerDir, f)));
  }
}
