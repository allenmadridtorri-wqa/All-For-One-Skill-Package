import fs from 'node:fs';
import path from 'node:path';
import type { EngineId } from './engine-profiles.ts';
import type { GameGenre } from './production-intelligence.ts';

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

export class ProductionMemoryLedger {
  public readonly ledgerDir: string;
  private readonly failedApproaches = new Set<string>();

  constructor(ledgerDir: string) {
    this.ledgerDir = path.resolve(ledgerDir);
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
      const fullPath = path.join(this.ledgerDir, file);
      if (!fs.existsSync(fullPath)) {
        fs.writeFileSync(fullPath, defaults[file], 'utf8');
      }
    }
  }

  recordDecision(entry: DecisionEntry): void {
    const fullPath = path.join(this.ledgerDir, 'PROJECT_DECISIONS.md');
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

    fs.appendFileSync(fullPath, block + '\n', 'utf8');
    if (entry.failedApproachKey) {
      this.failedApproaches.add(entry.failedApproachKey);
    }
  }

  recordFailedApproach(approachKey: string, reason: string): void {
    this.failedApproaches.add(approachKey);
    const fullPath = path.join(this.ledgerDir, 'ITERATION_HISTORY.md');
    fs.appendFileSync(
      fullPath,
      `- **DO-NOT-REPEAT [\`${approachKey}\`]**: ${reason}\n`,
      'utf8',
    );
  }

  hasFailedApproach(approachKey: string): boolean {
    if (this.failedApproaches.has(approachKey)) return true;
    const histPath = path.join(this.ledgerDir, 'ITERATION_HISTORY.md');
    if (!fs.existsSync(histPath)) return false;
    return fs.readFileSync(histPath, 'utf8').includes(`\`${approachKey}\``);
  }

  appendIteration(entry: IterationHistoryEntry): void {
    const fullPath = path.join(this.ledgerDir, 'ITERATION_HISTORY.md');
    const block = [
      `## Iteration ${entry.iteration} (${entry.date}) — ${entry.specialist}`,
      `- **Summary:** ${entry.summary}`,
      `- **Improved:** ${entry.improved.join('; ') || 'None'}`,
      `- **Regressed:** ${entry.regressed.join('; ') || 'None'}`,
      `- **Remaining:** ${entry.remaining.join('; ') || 'None'}`,
      '',
    ].join('\n');
    fs.appendFileSync(fullPath, block + '\n', 'utf8');
  }

  appendPerformanceMetric(entry: PerformanceEntry): void {
    const fullPath = path.join(this.ledgerDir, 'PERFORMANCE_LEDGER.md');
    const row = `| ${entry.date} | ${entry.scenario} | ${entry.engine} | ${entry.frameTimeMs.toFixed(2)} | ${entry.memoryMb.toFixed(1)} | ${entry.notes} |\n`;
    fs.appendFileSync(fullPath, row, 'utf8');
  }

  writeVerificationReport(markdown: string): void {
    fs.writeFileSync(path.join(this.ledgerDir, 'VERIFICATION_REPORT.md'), markdown, 'utf8');
  }

  listLedgerFiles(): string[] {
    if (!fs.existsSync(this.ledgerDir)) return [];
    return LEDGER_FILES.filter((f) => fs.existsSync(path.join(this.ledgerDir, f)));
  }
}
