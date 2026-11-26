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

export interface KnownBugRecord {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  status: 'OPEN' | 'RESOLVED';
  detectedAt: string;
  resolvedAt?: string;
}

export interface TaskProgressRecord {
  taskId: string;
  title: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'IMPLEMENTED' | 'TESTED' | 'VERIFIED' | 'UNVERIFIED' | 'FAILED';
  updatedAt: string;
}

export interface BuildInfoRecord {
  stack: string;
  command: string;
  status: 'VERIFIED' | 'FAILED' | 'UNVERIFIED';
  timestamp: string;
  summary: string;
}

export interface AssetReferenceRecord {
  key: string;
  assetPath: string;
  kind: string;
  engine: string;
  verified: boolean;
}

interface StructuredMemoryState {
  version: '3.1.0';
  projectSummary?: {
    projectName: string;
    engine: EngineId;
    genre: GameGenre;
    objective: string;
  };
  fileChecksums: Record<string, string>;
  lockedDecisionIds: string[];
  failedApproaches: Record<string, { count: number; reasons: string[] }>;
  successfulApproaches: Record<string, { specialist: string; evidence: string; recordedAt: string }>;
  knownGoodSnapshots: Record<string, KnownGoodSnapshot>;
  knownBugs: Record<string, KnownBugRecord>;
  taskProgress: Record<string, TaskProgressRecord>;
  buildHistory: BuildInfoRecord[];
  assetReferences: Record<string, AssetReferenceRecord>;
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
        const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as Partial<StructuredMemoryState>;
        return {
          version: '3.1.0',
          projectSummary: raw.projectSummary,
          fileChecksums: raw.fileChecksums ?? {},
          lockedDecisionIds: raw.lockedDecisionIds ?? [],
          failedApproaches: raw.failedApproaches ?? {},
          successfulApproaches: raw.successfulApproaches ?? {},
          knownGoodSnapshots: raw.knownGoodSnapshots ?? {},
          knownBugs: raw.knownBugs ?? {},
          taskProgress: raw.taskProgress ?? {},
          buildHistory: raw.buildHistory ?? [],
          assetReferences: raw.assetReferences ?? {},
        };
      } catch {
        // Recover cleanly from corrupt state JSON while preserving checksum detection
      }
    }
    return {
      version: '3.1.0',
      fileChecksums: {},
      lockedDecisionIds: [],
      failedApproaches: {},
      successfulApproaches: {},
      knownGoodSnapshots: {},
      knownBugs: {},
      taskProgress: {},
      buildHistory: [],
      assetReferences: {},
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

      const state = this.loadState();
      state.projectSummary = {
        projectName: meta.projectName,
        engine: meta.engine,
        genre: meta.genre,
        objective: redactSecrets(meta.objective),
      };
      this.saveState(state);
    });
  }

  /**
   * Appends a project decision; prevents silently overwriting an already-recorded decision ID.
   */
  recordDecision(entry: DecisionEntry): void {
    withAdvisoryLock(this.lockPath, () => {
      const state = this.loadState();
      if (state.lockedDecisionIds.includes(entry.id)) {
        throw new Error(
          `Decision "${entry.id}" already exists. Create a new superseding decision ID instead of silently overwriting prior decisions.`,
        );
      }

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
      const nextState = this.loadState();
      nextState.lockedDecisionIds.push(entry.id);
      this.saveState(nextState);
      if (entry.failedApproachKey) {
        this.failedApproaches.add(entry.failedApproachKey);
      }
    });
  }

  recordKnownBug(bug: Omit<KnownBugRecord, 'status' | 'detectedAt'>): KnownBugRecord {
    return withAdvisoryLock(this.lockPath, () => {
      const state = this.loadState();
      const rec: KnownBugRecord = {
        ...bug,
        summary: redactSecrets(bug.summary),
        status: 'OPEN',
        detectedAt: new Date().toISOString(),
      };
      state.knownBugs[bug.id] = rec;
      this.saveState(state);
      return rec;
    });
  }

  resolveKnownBug(bugId: string): KnownBugRecord {
    return withAdvisoryLock(this.lockPath, () => {
      const state = this.loadState();
      const existing = state.knownBugs[bugId];
      if (!existing) throw new Error(`Unknown bug "${bugId}".`);
      existing.status = 'RESOLVED';
      existing.resolvedAt = new Date().toISOString();
      this.saveState(state);
      return existing;
    });
  }

  updateTaskProgress(
    taskId: string,
    title: string,
    status: TaskProgressRecord['status'],
  ): TaskProgressRecord {
    return withAdvisoryLock(this.lockPath, () => {
      const state = this.loadState();
      const rec: TaskProgressRecord = {
        taskId,
        title: redactSecrets(title),
        status,
        updatedAt: new Date().toISOString(),
      };
      state.taskProgress[taskId] = rec;
      this.saveState(state);
      return rec;
    });
  }

  recordBuildInfo(info: Omit<BuildInfoRecord, 'timestamp'>): BuildInfoRecord {
    return withAdvisoryLock(this.lockPath, () => {
      const state = this.loadState();
      const rec: BuildInfoRecord = {
        ...info,
        summary: redactSecrets(info.summary),
        timestamp: new Date().toISOString(),
      };
      state.buildHistory.push(rec);
      if (state.buildHistory.length > 25) state.buildHistory.shift();
      this.saveState(state);
      return rec;
    });
  }

  recordAssetReference(ref: AssetReferenceRecord): void {
    withAdvisoryLock(this.lockPath, () => {
      const state = this.loadState();
      state.assetReferences[ref.key] = ref;
      this.saveState(state);
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

  /**
   * Builds a compact, token-efficient context summary (< maxChars) for single-AI session
   * continuity without re-reading the entire workspace.
   */
  buildCompactContextSummary(maxChars = 3600): string {
    const state = this.loadState();
    const openBugs = Object.values(state.knownBugs).filter((b) => b.status === 'OPEN');
    const tasks = Object.values(state.taskProgress);
    const verifiedTasks = tasks.filter((t) => t.status === 'VERIFIED').length;
    const failedTasks = tasks.filter((t) => t.status === 'FAILED');
    const lastBuild = state.buildHistory[state.buildHistory.length - 1];
    const failedKeys = Object.keys(state.failedApproaches);
    const assets = Object.values(state.assetReferences);

    const lines: string[] = [
      `# Compact Project Context`,
      state.projectSummary
        ? `- Project: ${state.projectSummary.projectName} (${state.projectSummary.engine} / ${state.projectSummary.genre}) — ${state.projectSummary.objective}`
        : `- Ledger Dir: ${path.basename(this.ledgerDir)}`,
      `- Locked Decisions: ${state.lockedDecisionIds.join(', ') || 'None'}`,
      `- Tasks: ${verifiedTasks}/${tasks.length} VERIFIED${failedTasks.length > 0 ? ` | FAILED: ${failedTasks.map((t) => t.taskId).join(',')}` : ''}`,
      `- Open Bugs: ${openBugs.length > 0 ? openBugs.map((b) => `[${b.severity}] ${b.id}: ${b.summary}`).join('; ') : 'None'}`,
      lastBuild ? `- Latest Build: ${lastBuild.stack} -> ${lastBuild.status} (${lastBuild.summary})` : `- Latest Build: None recorded`,
      `- Do-Not-Repeat Keys: ${failedKeys.join(', ') || 'None'}`,
      `- Assets Tracked: ${assets.length} (${assets.filter((a) => a.verified).length} verified)`,
    ];

    const summary = lines.join('\n');
    return summary.length <= maxChars ? summary : summary.slice(0, maxChars - 16) + '\n...[truncated]';
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
