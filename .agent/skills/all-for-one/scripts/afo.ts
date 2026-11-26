import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import { createCinematicProductionPlan } from '../core/cinematic-production.ts';
import { type CoreSpecialistId } from '../core/collaboration.ts';
import { evaluateHardwareRenderRouting } from '../core/cloud-rendering.ts';
import { type EngineId } from '../core/engine-profiles.ts';
import { runEvaluationSuiteV2, runEvaluationSuiteV3 } from '../core/evaluator.ts';
import {
  detectExternalTools,
  safeInstall,
  safeUninstall,
  verifyInstallIntegrity,
} from '../core/installer-engine.mjs';
import { loadKnowledgeIndex, retrieveTaskKnowledge } from '../core/knowledge-retrieval.ts';
import { detectHardwareProfile } from '../core/production-intelligence.ts';
import {
  buildVerificationReport,
  evaluateBlenderQaCheck,
  formatVerificationReportMarkdown,
  runSecuritySecretScan,
  type VerificationCheckRecord,
} from '../core/qa-verification.ts';
import { estimateExecutionModeUsage, type ExecutionMode } from '../core/single-ai.ts';
import { parseFrontmatter, validateSkillPackage } from './validate-skill-package.ts';

export type FrontierTarget = 'claude' | 'antigravity' | 'chatgpt';

export interface TriggerCase {
  id: string;
  prompt: string;
  expectedSkill: string;
}

export interface TriggerEvalResult {
  total: number;
  passed: number;
  details: Array<{ id: string; expected: string; predicted: string; ok: boolean }>;
}

const COMMANDS = ['crazy', 'crazydesigner', 'crazymaker', 'crazycoder', 'crazyqa'] as const;

// ---------------------------------------------------------------------------
// Pure-Node PKZIP Builder (Deflate + CRC32, zero external dependencies)
// ---------------------------------------------------------------------------

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  name: string;
  data: Buffer;
}

export function createZipBuffer(entries: ZipEntryInput[]): Buffer {
  const localChunks: Buffer[] = [];
  const centralChunks: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileNameBuf = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const compressed = zlib.deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x5421, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(fileNameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, fileNameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(fileNameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralChunks.push(centralHeader, fileNameBuf);
    offset += localHeader.length + fileNameBuf.length + compressed.length;
  }

  const centralDirBuf = Buffer.concat(centralChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, centralDirBuf, eocd]);
}

function collectFilesForZip(
  dir: string,
  prefix = '',
  excludeNames = new Set([
    'node_modules',
    'dist',
    'release',
    '.git',
    '.afo',
    '.afo-memory',
    '.afo-backups',
    '.afo-install.lock',
    '.afo-global-manifest.json',
    '.playwright-cli',
    '.env',
  ]),
): ZipEntryInput[] {
  const out: ZipEntryInput[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (excludeNames.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...collectFilesForZip(full, rel, excludeNames));
    } else if (entry.isFile()) {
      out.push({ name: rel, data: fs.readFileSync(full) });
    }
  }
  return out;
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureCleanBuildDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copySharedVaultInto(targetSkillDir: string, rootDir: string): void {
  for (const folder of ['references', 'scripts', 'assets', 'core']) {
    const src = path.join(rootDir, folder);
    if (fs.existsSync(src)) {
      copyDirRecursive(src, path.join(targetSkillDir, folder));
    }
  }
}

function generateAntigravityWorkflow(skillName: string, skillMarkdown: string): string {
  const { frontmatter, body } = parseFrontmatter(skillMarkdown);
  const description =
    typeof frontmatter.description === 'string'
      ? frontmatter.description
      : `Execute All-For-One /${skillName} workflow.`;

  return `---
description: ${description}
---

<!-- Generated by All-For-One V3.1 CLI (scripts/afo.ts). Source: skills/${skillName}/SKILL.md -->

${body.trim()}

## Antigravity Execution Reminder

- Single-AI-First (\`ECONOMY\` default): retrieve only task-relevant references via \`npx tsx scripts/afo.ts retrieve --query="..."\` instead of loading the entire library.
- Always run \`/crazyqa\` independent verification before marking any milestone VERIFIED.
`;
}

function buildCustomGptInstructions(rootDir: string): string {
  const sections: string[] = [
    '# All-For-One V3.1 — Single-AI-First Engineering & Creative Production Framework (Custom GPT)',
    '',
    'You operate Single-AI-First (`ECONOMY` default) across four specialist disciplines: CRAZYMAKER (Game Director), CRAZYDESIGNER (Visual, Blender, Cinematics & Cloud GPU Director), CRAZYCODER (Engineering Director), and CRAZYQA (Independent QA & Security Director), orchestrated by `/crazy`.',
    '',
    '## Slash Command Routing',
    '- `/crazymaker` — Gameplay specifications, genre profiles, economies, quests, AI, balancing criteria, screenplay beats.',
    '- `/crazydesigner` — Engine-specific rendering, PBR, lighting, VFX, Blender automation, Toggle Studio motion choreography, long-form shot chunking, Google Colab GPU offloading, spatial audio.',
    '- `/crazycoder` — Structure & feasibility analysis, API compatibility, zero-GC engine systems, provider-flexible model caching, security.',
    '- `/crazyqa` — Independent static, test, build, runtime, PNG signature, FFmpeg, and screenshot verification (`VERIFIED` / `PARTIALLY_VERIFIED` / `UNVERIFIED` / `FAILED`).',
    '- `/crazy` — Sequential Single-AI-First orchestration pipeline (`ECONOMY` default, `BALANCED` internal lenses, `ACCELERATION` opt-in only).',
    '',
  ];

  for (const cmd of COMMANDS) {
    const raw = fs.readFileSync(path.join(rootDir, 'skills', cmd, 'SKILL.md'), 'utf8');
    const { body } = parseFrontmatter(raw);
    sections.push('---', '', body.trim(), '');
  }

  return sections.join('\n');
}

export function buildAllTargets(rootDir: string): { artifacts: string[] } {
  const distDir = path.join(rootDir, 'dist');
  const artifacts: string[] = [];

  // 1. Claude Desktop & Code Bundle
  const claudeDist = path.join(distDir, 'claude');
  ensureCleanBuildDir(claudeDist);

  const combinedClaudeEntries: ZipEntryInput[] = [];
  for (const cmd of COMMANDS) {
    const skillOutDir = path.join(claudeDist, cmd);
    copyDirRecursive(path.join(rootDir, 'skills', cmd), skillOutDir);
    if (cmd === 'crazy') {
      copySharedVaultInto(skillOutDir, rootDir);
    }

    const zipEntries = collectFilesForZip(skillOutDir, cmd);
    const zipPath = path.join(claudeDist, `${cmd}.zip`);
    fs.writeFileSync(zipPath, createZipBuffer(zipEntries));
    artifacts.push(path.relative(rootDir, zipPath));
    combinedClaudeEntries.push(...zipEntries);
  }
  const allClaudeZip = path.join(claudeDist, 'all-for-one-claude.zip');
  fs.writeFileSync(allClaudeZip, createZipBuffer(combinedClaudeEntries));
  artifacts.push(path.relative(rootDir, allClaudeZip));

  // 2. Antigravity Bundle
  const agDist = path.join(distDir, 'antigravity');
  ensureCleanBuildDir(agDist);
  const agSkillDir = path.join(agDist, 'skills', 'all-for-one');
  copyDirRecursive(path.join(rootDir, 'skills', 'crazy'), agSkillDir);
  copySharedVaultInto(agSkillDir, rootDir);
  for (const cmd of COMMANDS) {
    const srcSkill = fs.readFileSync(path.join(rootDir, 'skills', cmd, 'SKILL.md'), 'utf8');
    const wfDir = path.join(agDist, 'workflows');
    fs.mkdirSync(wfDir, { recursive: true });
    const wfPath = path.join(wfDir, `${cmd}.md`);
    fs.writeFileSync(wfPath, generateAntigravityWorkflow(cmd, srcSkill));
    artifacts.push(path.relative(rootDir, wfPath));
  }

  // 3. ChatGPT / Codex + Custom GPT Bundle
  const gptDist = path.join(distDir, 'chatgpt');
  ensureCleanBuildDir(gptDist);
  for (const cmd of COMMANDS) {
    const codexOut = path.join(gptDist, 'codex-skills', cmd);
    copyDirRecursive(path.join(rootDir, 'skills', cmd), codexOut);
    if (cmd === 'crazy') {
      copySharedVaultInto(codexOut, rootDir);
    }
  }
  const customGptDir = path.join(gptDist, 'custom-gpt');
  fs.mkdirSync(customGptDir, { recursive: true });
  const instrPath = path.join(customGptDir, 'instructions.md');
  fs.writeFileSync(instrPath, buildCustomGptInstructions(rootDir));
  artifacts.push(path.relative(rootDir, instrPath));

  const knowledgeEntries = [
    ...collectFilesForZip(path.join(rootDir, 'references'), 'references'),
    ...collectFilesForZip(path.join(rootDir, 'assets'), 'assets'),
    ...collectFilesForZip(path.join(rootDir, 'core'), 'core'),
  ];
  const knowledgeZip = path.join(customGptDir, 'all-for-one-knowledge.zip');
  fs.writeFileSync(knowledgeZip, createZipBuffer(knowledgeEntries));
  artifacts.push(path.relative(rootDir, knowledgeZip));

  return { artifacts };
}

/**
 * Packages the complete clean project into a portable ZIP archive without node_modules or build caches.
 */
export function packageCompleteProjectZip(
  rootDir: string,
  outRelPath = path.join('release', 'All-For-One-Skill-Package-V3.1.zip'),
): { zipPath: string; entryCount: number; sizeBytes: number } {
  const entries = collectFilesForZip(rootDir, 'All-For-One-Skill-Package');
  const buf = createZipBuffer(entries);
  const absOut = path.resolve(rootDir, outRelPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, buf);
  return { zipPath: absOut, entryCount: entries.length, sizeBytes: buf.length };
}

export function syncTargets(options: {
  rootDir: string;
  target?: FrontierTarget | 'all';
  global?: boolean;
  homeDir?: string;
  dryRun?: boolean;
  force?: boolean;
}) {
  return safeInstall({
    sourceRoot: options.rootDir,
    targetRoot: options.rootDir,
    target: options.target ?? 'all',
    global: options.global ?? false,
    homeDir: options.homeDir ?? os.homedir(),
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
  });
}

// ---------------------------------------------------------------------------
// Legacy 8-case quick trigger check (preserved for backward compatibility)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'about',
  'when', 'where', 'build', 'create', 'make', 'using', 'trigger', 'whenever',
  'across', 'every', 'works', 'years', 'year', 'grade', 'level',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9/+-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

export function scoreTriggerRouting(rootDir: string): TriggerEvalResult {
  const triggersPath = path.join(rootDir, 'evals', 'triggers.json');
  const parsed = JSON.parse(fs.readFileSync(triggersPath, 'utf8')) as { cases: TriggerCase[] };

  const skillMeta = COMMANDS.map((cmd) => {
    const raw = fs.readFileSync(path.join(rootDir, 'skills', cmd, 'SKILL.md'), 'utf8');
    const { frontmatter } = parseFrontmatter(raw);
    const desc = String(frontmatter.description ?? '');
    return {
      name: cmd,
      tokens: new Set(tokenize(desc)),
    };
  });

  const details: TriggerEvalResult['details'] = [];
  let passed = 0;

  for (const tc of parsed.cases) {
    const slashMatch = tc.prompt.match(/\/(crazydesigner|crazymaker|crazycoder|crazyqa|crazy)\b/i);
    let predicted = 'crazy';

    if (slashMatch) {
      predicted = slashMatch[1].toLowerCase();
    } else {
      const promptTokens = tokenize(tc.prompt);
      const scores = skillMeta.map((s) => {
        let overlap = 0;
        for (const tok of promptTokens) {
          if (s.tokens.has(tok)) overlap += 1;
        }
        return { name: s.name, overlap };
      });
      scores.sort((a, b) => b.overlap - a.overlap);

      const specialistHits = scores.filter((s) => s.name !== 'crazy' && s.overlap >= 2);
      const top = scores[0];
      const second = scores[1];
      if (
        /\bend-to-end\b/i.test(tc.prompt) ||
        (specialistHits.length >= 2 && top && second && top.overlap - second.overlap <= 1)
      ) {
        predicted = 'crazy';
      } else {
        predicted = top?.name ?? 'crazy';
      }
    }

    const ok = predicted === tc.expectedSkill;
    if (ok) passed += 1;
    details.push({ id: tc.id, expected: tc.expectedSkill, predicted, ok });
  }

  return { total: parsed.cases.length, passed, details };
}

// ---------------------------------------------------------------------------
// CLI Entrypoint
// ---------------------------------------------------------------------------

function main(): void {
  const args = process.argv.slice(2);
  const subcommand = args[0] ?? 'help';
  const rootDir = process.cwd();

  const getFlag = (prefix: string): string | undefined => {
    const found = args.find((a) => a.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
  };

  const target = (getFlag('--target=') ?? 'all') as FrontierTarget | 'all';
  const isGlobal = args.includes('--global');
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  if (subcommand === 'validate') {
    const report = validateSkillPackage(rootDir);
    const indexDocs = loadKnowledgeIndex(rootDir);
    for (const doc of indexDocs) {
      if (!fs.existsSync(path.join(rootDir, doc.path))) {
        report.issues.push({
          severity: 'error',
          file: 'references/index.json',
          message: `Indexed document missing on disk: ${doc.path}`,
        });
        report.ok = false;
      }
    }
    console.log(`Validated ${report.skillsChecked} skills and ${indexDocs.length} indexed references.`);
    for (const issue of report.issues) {
      console.log(`[${issue.severity.toUpperCase()}] ${issue.file}: ${issue.message}`);
    }
    if (!report.ok) process.exit(1);
    console.log('All-For-One V3.1 package validation passed.');
    return;
  }

  if (subcommand === 'build') {
    const report = validateSkillPackage(rootDir);
    if (!report.ok) {
      console.error('Validation failed. Fix errors before building.');
      process.exit(1);
    }
    const { artifacts } = buildAllTargets(rootDir);
    console.log(`Built ${artifacts.length} cross-frontier artifacts:`);
    for (const art of artifacts) console.log(`  - ${art}`);
    return;
  }

  if (subcommand === 'package-zip') {
    const outPath = getFlag('--out=') ?? path.join('release', 'All-For-One-Skill-Package-V3.1.zip');
    const res = packageCompleteProjectZip(rootDir, outPath);
    console.log(`Packaged ${res.entryCount} files -> ${path.relative(rootDir, res.zipPath)} (${res.sizeBytes} bytes)`);
    return;
  }

  if (subcommand === 'check-tools') {
    const tools = detectExternalTools();
    console.log(JSON.stringify(tools, null, 2));
    return;
  }

  if (subcommand === 'single-ai-check') {
    const mode = ((getFlag('--mode=') ?? 'ECONOMY').toUpperCase() as ExecutionMode);
    const estimate = estimateExecutionModeUsage(mode);
    console.log(JSON.stringify(estimate, null, 2));
    return;
  }

  if (subcommand === 'colab-check') {
    const hw = detectHardwareProfile();
    const frames = Number(getFlag('--frames=') ?? '240');
    const engine = (getFlag('--engine=') ?? 'CYCLES') as 'CYCLES' | 'BLENDER_EEVEE_NEXT';
    const routing = evaluateHardwareRenderRouting(hw, frames, engine);
    console.log(JSON.stringify({ hardware: hw, routing }, null, 2));
    return;
  }

  if (subcommand === 'cinematic-plan') {
    const duration = Number(getFlag('--duration=') ?? '90');
    const fps = Number(getFlag('--fps=') ?? '24');
    const brief =
      getFlag('--brief=') ??
      '90-second superhero city night trailer with rooftop entrance and skyline climax';
    const plan = createCinematicProductionPlan({
      projectId: 'cli-preview',
      title: 'Trailer Plan',
      creativeBrief: brief,
      durationSec: duration,
      fps,
      chunkSizeFrames: 24,
    });
    const totalChunks = plan.shots.reduce((sum, s) => sum + s.chunks.length, 0);
    console.log(
      JSON.stringify(
        {
          totalDurationSec: plan.totalDurationSec,
          fps: plan.fps,
          totalFrames: plan.totalFrames,
          scenes: plan.scenes.length,
          shots: plan.shots.length,
          chunks: totalChunks,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (subcommand === 'verify-install') {
    const res = verifyInstallIntegrity({ targetRoot: rootDir, global: isGlobal });
    console.log(res.message);
    if (!res.ok) process.exit(1);
    return;
  }

  if (subcommand === 'sync' || subcommand === 'install') {
    const report = validateSkillPackage(rootDir);
    if (!report.ok) {
      console.error('Validation failed. Fix errors before syncing.');
      process.exit(1);
    }
    const res = syncTargets({ rootDir, target, global: isGlobal, dryRun, force });
    console.log(
      `${dryRun ? '[DRY-RUN] ' : ''}Synced All-For-One V3.1 (${res.scope}, targets=${res.targets.join(',')}): ` +
        `created=${res.summary.created}, updated=${res.summary.updated}, ` +
        `unchanged=${res.summary.unchanged}, skippedUserModified=${res.summary.skippedUserModified}`,
    );
    if (res.backupRoot) console.log(`Backups: ${res.backupRoot}`);
    return;
  }

  if (subcommand === 'uninstall') {
    const res = safeUninstall({ targetRoot: rootDir, global: isGlobal, dryRun, force });
    console.log(`${dryRun ? '[DRY-RUN] ' : ''}${res.message} (removed=${res.removed.length}, preserved=${res.skippedUserModified.length})`);
    return;
  }

  if (subcommand === 'eval-triggers') {
    const res = scoreTriggerRouting(rootDir);
    for (const d of res.details) {
      console.log(`[${d.ok ? 'PASS' : 'FAIL'}] ${d.id}: expected=${d.expected} predicted=${d.predicted}`);
    }
    console.log(`Legacy trigger accuracy: ${res.passed}/${res.total}`);
    if (res.passed < res.total) process.exit(1);
    return;
  }

  if (subcommand === 'eval-v2') {
    const report = runEvaluationSuiteV2(rootDir);
    console.log(`Evaluation V2 (${report.evaluationMode}): ${report.passedCases}/${report.totalCases} (${report.accuracyPercent}%)`);
    if (report.passedCases < report.totalCases) process.exit(1);
    return;
  }

  if (subcommand === 'eval' || subcommand === 'eval-v3') {
    const report = runEvaluationSuiteV3(rootDir, true);
    const outPath = path.join(rootDir, 'evals', 'report.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`Evaluation Suite (${report.evaluationMode}): ${report.passedCases}/${report.totalCases} (${report.accuracyPercent}%)`);
    console.log(`Live Model Evaluation Status: ${report.liveModelEvaluationStatus}`);
    console.log(`Environment: node=${report.environment.nodeVersion}, os=${report.environment.platform}, blender=${report.environment.blenderAvailable ? report.environment.blenderVersion : 'unavailable'}`);
    for (const [cat, stats] of Object.entries(report.byCategory)) {
      console.log(`  - ${cat}: ${stats.passed}/${stats.total} (${stats.accuracyPercent}%)`);
    }
    console.log(`Machine-readable report written to ${path.relative(rootDir, outPath)}`);
    if (report.passedCases < report.totalCases) process.exit(1);
    return;
  }

  if (subcommand === 'retrieve') {
    const query = getFlag('--query=') ?? '';
    const specialist = getFlag('--specialist=') as CoreSpecialistId | undefined;
    const engine = getFlag('--engine=') as EngineId | undefined;
    const budget = Number(getFlag('--budget=') ?? '4000');
    const res = retrieveTaskKnowledge(rootDir, {
      query,
      specialist,
      engine,
      maxTokenBudget: budget,
    });
    console.log(
      `Retrieved ${res.selected.length} doc(s), ${res.totalTokensLoaded}/${res.totalCatalogTokens} tokens (${res.tokenSavingsPercent}% saved, cacheHit=${res.cacheHit}):`,
    );
    for (const item of res.selected) {
      console.log(`  - ${item.entry.path} [${item.provenanceStatus}] (score=${item.relevanceScore}, ~${item.entry.estimatedTokens} tokens)`);
    }
    return;
  }

  if (subcommand === 'qa-report') {
    const valReport = validateSkillPackage(rootDir);
    const evalV3 = runEvaluationSuiteV3(rootDir, true);
    const secFiles = fs
      .readdirSync(path.join(rootDir, 'core'))
      .map((f) => path.join('core', f));
    const secScan = runSecuritySecretScan(rootDir, secFiles);
    const blenderCheck = evaluateBlenderQaCheck();
    const checks: VerificationCheckRecord[] = [
      {
        id: 'QA-PKG-VAL',
        category: 'dependency',
        description: 'Validate canonical skills, frontmatter, links, and reference index',
        status: valReport.ok ? 'VERIFIED' : 'FAILED',
        commandOrSource: 'npx tsx scripts/afo.ts validate',
        exitCode: valReport.ok ? 0 : 1,
        evidence: `${valReport.skillsChecked} skills checked; ${valReport.issues.length} issues.`,
      },
      {
        id: 'QA-EVAL-V3',
        category: 'integration-test',
        description: 'Run 159-case deterministic 13-domain policy evaluation',
        status: evalV3.passedCases === evalV3.totalCases ? 'VERIFIED' : 'FAILED',
        commandOrSource: 'npx tsx scripts/afo.ts eval',
        exitCode: evalV3.passedCases === evalV3.totalCases ? 0 : 1,
        evidence: `${evalV3.passedCases}/${evalV3.totalCases} passed (${evalV3.accuracyPercent}%).`,
      },
      secScan.check,
      blenderCheck,
    ];
    const report = buildVerificationReport('All-For-One V3.1', checks, []);
    const md = formatVerificationReportMarkdown(report);
    fs.writeFileSync(path.join(rootDir, 'VERIFICATION_REPORT.md'), md);
    console.log(`Generated VERIFICATION_REPORT.md (overall=${report.overallStatus}).`);
    return;
  }

  console.log(`All-For-One V3.1 CLI (scripts/afo.ts)

Usage:
  npx tsx scripts/afo.ts validate
  npx tsx scripts/afo.ts build
  npx tsx scripts/afo.ts package-zip [--out=release/All-For-One-Skill-Package-V3.1.zip]
  npx tsx scripts/afo.ts sync [--target=claude|antigravity|chatgpt|all] [--global] [--dry-run] [--force]
  npx tsx scripts/afo.ts uninstall [--global] [--dry-run] [--force]
  npx tsx scripts/afo.ts verify-install [--global]
  npx tsx scripts/afo.ts check-tools
  npx tsx scripts/afo.ts single-ai-check [--mode=ECONOMY|BALANCED|ACCELERATION]
  npx tsx scripts/afo.ts colab-check [--width=1920] [--height=1080] [--samples=128] [--frames=240]
  npx tsx scripts/afo.ts cinematic-plan [--duration=90] [--fps=24]
  npx tsx scripts/afo.ts eval
  npx tsx scripts/afo.ts retrieve --query="..." [--specialist=...] [--engine=...] [--budget=4000]
  npx tsx scripts/afo.ts qa-report
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
