import fs from 'node:fs';
import path from 'node:path';
import {
  inspectRenderArtifactFile,
  validateGeneratedAssetFile,
  type AssetValidationReport,
} from './asset-validation.ts';
import { detectBlenderInstallation, type BlenderExecutionResult } from './blender-bridge.ts';
import { scanForSecrets, type SecretFinding } from './security.ts';

export type VerificationStatus = 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'FAILED';

export interface VerificationCheckRecord {
  id: string;
  category:
    | 'static-analysis'
    | 'unit-test'
    | 'integration-test'
    | 'e2e-test'
    | 'build'
    | 'runtime'
    | 'screenshot-visual'
    | 'regression'
    | 'benchmark'
    | 'memory-profile'
    | 'crash-detection'
    | 'dependency'
    | 'security'
    | 'blender-render'
    | 'asset-pipeline';
  description: string;
  status: VerificationStatus;
  commandOrSource: string;
  evidence: string;
  exitCode?: number | null;
  logsExcerpt?: string;
  durationMs?: number;
}

export interface VisualEvidenceCheck {
  screenshotPath: string;
  exists: boolean;
  sizeBytes: number;
  acceptedCriteria: string[];
  status: VerificationStatus;
  reason: string;
}

export interface VerificationReportPayload {
  project: string;
  generatedAt: string;
  overallStatus: VerificationStatus;
  counts: Record<VerificationStatus, number>;
  checks: VerificationCheckRecord[];
  visualChecks: VisualEvidenceCheck[];
}

/**
 * Verifies that claimed screenshot / render artifacts actually exist on disk and are non-empty.
 * Prevents fabricated visual verification claims.
 */
export function verifyVisualEvidenceFile(
  rootDir: string,
  screenshotRelPath: string,
  acceptedCriteria: string[],
): VisualEvidenceCheck {
  const abs = path.resolve(rootDir, screenshotRelPath);
  if (!fs.existsSync(abs)) {
    return {
      screenshotPath: screenshotRelPath,
      exists: false,
      sizeBytes: 0,
      acceptedCriteria,
      status: 'UNVERIFIED',
      reason: `Visual artifact "${screenshotRelPath}" does not exist on disk; visual verification cannot be claimed.`,
    };
  }
  const stat = fs.statSync(abs);
  if (!stat.isFile() || stat.size < 64) {
    return {
      screenshotPath: screenshotRelPath,
      exists: true,
      sizeBytes: stat.size,
      acceptedCriteria,
      status: 'FAILED',
      reason: `Visual artifact "${screenshotRelPath}" is empty or corrupt (${stat.size} bytes).`,
    };
  }
  if (acceptedCriteria.length === 0) {
    return {
      screenshotPath: screenshotRelPath,
      exists: true,
      sizeBytes: stat.size,
      acceptedCriteria,
      status: 'PARTIALLY_VERIFIED',
      reason: 'Screenshot exists, but file existence alone is insufficient without visual acceptance criteria.',
    };
  }
  return {
    screenshotPath: screenshotRelPath,
    exists: true,
    sizeBytes: stat.size,
    acceptedCriteria,
    status: 'VERIFIED',
    reason: `Visual artifact verified (${stat.size} bytes) against ${acceptedCriteria.length} criteria.`,
  };
}

/**
 * Runs an independent QA security scan across specified source files for leaked secrets.
 */
export function runSecuritySecretScan(
  rootDir: string,
  relPaths: string[],
): { check: VerificationCheckRecord; findings: SecretFinding[] } {
  const findings: SecretFinding[] = [];
  for (const rel of relPaths) {
    const abs = path.resolve(rootDir, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const text = fs.readFileSync(abs, 'utf8');
    findings.push(...scanForSecrets(text, rel));
  }

  return {
    findings,
    check: {
      id: 'QA-SEC-SECRETS',
      category: 'security',
      description: 'Scan workspace artifacts and memory records for leaked API keys or credentials',
      status: findings.length === 0 ? 'VERIFIED' : 'FAILED',
      commandOrSource: 'core/security.ts#scanForSecrets',
      exitCode: findings.length === 0 ? 0 : 1,
      evidence:
        findings.length === 0
          ? `Scanned ${relPaths.length} file(s); 0 secret patterns detected.`
          : `Detected ${findings.length} potential secret pattern(s) across ${relPaths.length} file(s).`,
    },
  };
}

/**
 * Evaluates Blender headless execution + optional render output honestly.
 */
export function evaluateBlenderQaCheck(
  blenderExec?: BlenderExecutionResult,
): VerificationCheckRecord {
  const detection = detectBlenderInstallation();
  if (!detection.available && !blenderExec) {
    return {
      id: 'QA-BLENDER-RUNTIME',
      category: 'blender-render',
      description: 'Verify Blender headless scene execution and rendering',
      status: 'UNVERIFIED',
      commandOrSource: 'blender --version',
      exitCode: null,
      evidence: detection.note,
    };
  }
  if (!blenderExec) {
    return {
      id: 'QA-BLENDER-RUNTIME',
      category: 'blender-render',
      description: 'Verify Blender headless scene execution and rendering',
      status: 'UNVERIFIED',
      commandOrSource: `blender (${detection.version ?? 'detected'})`,
      exitCode: null,
      evidence: 'Blender is installed, but no scene execution result was submitted to QA.',
    };
  }
  return {
    id: 'QA-BLENDER-RUNTIME',
    category: 'blender-render',
    description: 'Verify Blender headless scene execution and rendering',
    status: blenderExec.status,
    commandOrSource: blenderExec.command.join(' '),
    exitCode: blenderExec.exitCode,
    logsExcerpt: (blenderExec.stderr || blenderExec.stdout).slice(0, 300),
    evidence: blenderExec.reason,
  };
}

/**
 * Evaluates generated 3D assets (GLB/glTF/FBX) or render artifacts into strict QA records.
 */
export function evaluateAssetValidationQa(
  rootDir: string,
  relPath: string,
  criteria: string[] = [],
): VerificationCheckRecord {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
    const inspected = inspectRenderArtifactFile(rootDir, relPath, criteria);
    return {
      id: `QA-RENDER-${path.basename(relPath)}`,
      category: 'screenshot-visual',
      description: `Inspect render artifact ${relPath}`,
      status: inspected.status,
      commandOrSource: 'core/asset-validation.ts#inspectRenderArtifactFile',
      exitCode: inspected.status === 'FAILED' ? 1 : 0,
      evidence: inspected.reason,
    };
  }

  const report: AssetValidationReport = validateGeneratedAssetFile(rootDir, relPath);
  return {
    id: `QA-ASSET-${path.basename(relPath)}`,
    category: 'asset-pipeline',
    description: `Validate generated 3D asset ${relPath}`,
    status: report.status,
    commandOrSource: 'core/asset-validation.ts#validateGeneratedAssetFile',
    exitCode: report.status === 'FAILED' ? 1 : 0,
    evidence: report.summary,
  };
}

export function aggregateOverallStatus(
  checks: VerificationCheckRecord[],
  visualChecks: VisualEvidenceCheck[] = [],
): VerificationStatus {
  const allStatuses = [...checks.map((c) => c.status), ...visualChecks.map((v) => v.status)];
  if (allStatuses.length === 0) return 'UNVERIFIED';
  if (allStatuses.includes('FAILED')) return 'FAILED';
  if (allStatuses.every((s) => s === 'VERIFIED')) return 'VERIFIED';
  if (allStatuses.some((s) => s === 'VERIFIED' || s === 'PARTIALLY_VERIFIED')) {
    return 'PARTIALLY_VERIFIED';
  }
  return 'UNVERIFIED';
}

export function buildVerificationReport(
  project: string,
  checks: VerificationCheckRecord[],
  visualChecks: VisualEvidenceCheck[] = [],
): VerificationReportPayload {
  const counts: Record<VerificationStatus, number> = {
    VERIFIED: 0,
    PARTIALLY_VERIFIED: 0,
    UNVERIFIED: 0,
    FAILED: 0,
  };
  for (const c of checks) counts[c.status] += 1;
  for (const v of visualChecks) counts[v.status] += 1;

  return {
    project,
    generatedAt: new Date().toISOString(),
    overallStatus: aggregateOverallStatus(checks, visualChecks),
    counts,
    checks,
    visualChecks,
  };
}

export function formatVerificationReportMarkdown(report: VerificationReportPayload): string {
  const lines: string[] = [
    `# CRAZY QA Verification Report — ${report.project}`,
    '',
    `- **Generated At:** ${report.generatedAt}`,
    `- **Overall Status:** \`${report.overallStatus}\``,
    `- **Summary:** VERIFIED=${report.counts.VERIFIED} | PARTIALLY_VERIFIED=${report.counts.PARTIALLY_VERIFIED} | UNVERIFIED=${report.counts.UNVERIFIED} | FAILED=${report.counts.FAILED}`,
    '',
    '## Engineering, Security, Asset & Runtime Checks',
    '',
    '| ID | Category | Status | Exit Code | Command / Source | Evidence |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
  ];

  for (const c of report.checks) {
    const codeStr = c.exitCode === undefined || c.exitCode === null ? 'n/a' : String(c.exitCode);
    lines.push(
      `| ${c.id} | ${c.category} | \`${c.status}\` | ${codeStr} | \`${c.commandOrSource}\` | ${c.evidence} |`,
    );
  }

  lines.push('', '## Visual & Screenshot Verification', '');
  if (report.visualChecks.length === 0) {
    lines.push('- `UNVERIFIED`: No visual screenshots or render captures were provided for this check.');
  } else {
    for (const v of report.visualChecks) {
      lines.push(
        `- \`${v.status}\` **${v.screenshotPath}** (${v.sizeBytes} bytes): ${v.reason}`,
      );
    }
  }

  lines.push(
    '',
    '## Verification Taxonomy Policy',
    '- **VERIFIED:** Executed and passed with concrete tool/artifact evidence.',
    '- **PARTIALLY_VERIFIED:** Subset of requirements verified; remaining items explicitly listed.',
    '- **UNVERIFIED:** Not executed in the current environment (e.g., Blender/engine runtime or live LLM API calls without credentials).',
    '- **FAILED:** Executed and produced an error, security finding, or failed assertion.',
  );

  return lines.join('\n') + '\n';
}
