import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import {
  inspectRenderArtifactFile,
  validateGeneratedAssetFile,
} from '../core/asset-validation.ts';
import { createCinematicProductionPlan } from '../core/cinematic-production.ts';
import {
  evaluateHardwareRenderRouting,
  prepareColabRenderPackage,
  prepareColabT4InferenceJob,
  T4_QUALITY_PROFILES,
  type T4QualityProfileId,
} from '../core/cloud-rendering.ts';
import { type EngineId } from '../core/engine-profiles.ts';
import { runEvaluationSuiteV2, runEvaluationSuiteV3 } from '../core/evaluator.ts';
import type { SupportedTarget } from '../core/installer-engine.d.ts';
import {
  collectSkillSupportFiles,
  detectExternalTools,
  generateAntigravityWorkflow,
  generateCompactTargetRouter,
  safeInstall,
  safeUninstall,
  verifyInstallIntegrity,
} from '../core/installer-engine.mjs';
import {
  loadKnowledgeIndex,
  retrieveTaskKnowledge,
  type CoreSpecialistId,
} from '../core/knowledge-retrieval.ts';
import { inspectGradioSpaceSchema } from '../core/hosted-providers.ts';
import { MCP_BRIDGE_TOOLS } from '../core/mcp-bridge.ts';
import {
  assessModelCompatibility,
  detectComputeProfile,
  listModels,
  OPEN_ASSET_SOURCES,
  type ModelCategory,
} from '../core/model-registry.ts';
import { routeProductionTask, type VisualTaskDomain } from '../core/model-routing.ts';
import { detectHardwareProfile } from '../core/production-intelligence.ts';
import {
  buildVerificationReport,
  evaluateAssetValidationQa,
  evaluateBlenderQaCheck,
  formatVerificationReportMarkdown,
  runSecuritySecretScan,
  type VerificationCheckRecord,
} from '../core/qa-verification.ts';
import { estimateExecutionModeUsage, type ExecutionMode } from '../core/single-ai.ts';
import {
  ALL_BUDGET_TARGETS,
  auditAllTargetsTokenBudget,
  buildCompactTargetRouterMarkdown,
  measureTargetTokenBudget,
  type BudgetTargetId,
} from '../core/token-budget.ts';
import { parseFrontmatter, validateSkillPackage } from './validate-skill-package.ts';

export type FrontierTarget = SupportedTarget;

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

function copySkillReferencedFilesInto(
  targetSkillDir: string,
  rootDir: string,
  skillMarkdown: string,
): void {
  const supportFiles = collectSkillSupportFiles(rootDir, skillMarkdown);
  for (const file of supportFiles) {
    const dest = path.join(targetSkillDir, file.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file.full, dest);
  }
}

function buildCustomGptInstructions(_rootDir: string): string {
  // Token-budgeted router (< 600 tokens, <= 4,000 chars) replacing legacy full-skill dump (>= 85% reduction)
  return buildCompactTargetRouterMarkdown('custom-gpt');
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
    } else {
      const skillMd = fs.readFileSync(path.join(rootDir, 'skills', cmd, 'SKILL.md'), 'utf8');
      copySkillReferencedFilesInto(skillOutDir, rootDir, skillMd);
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
  const agRulesDir = path.join(agDist, 'rules');
  fs.mkdirSync(agRulesDir, { recursive: true });
  const agRulePath = path.join(agRulesDir, 'all-for-one.md');
  fs.writeFileSync(agRulePath, generateCompactTargetRouter('antigravity', '../skills/all-for-one'));
  artifacts.push(path.relative(rootDir, agRulePath));
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
    } else {
      const skillMd = fs.readFileSync(path.join(rootDir, 'skills', cmd, 'SKILL.md'), 'utf8');
      copySkillReferencedFilesInto(codexOut, rootDir, skillMd);
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

  // 4. Compact Token-Budgeted Extended IDE/CLI Adapters (Cursor, Windsurf, Cline, Copilot, Gemini CLI, OpenCode)
  const targetsDist = path.join(distDir, 'targets');
  ensureCleanBuildDir(targetsDist);
  const extendedAdapterFiles: Array<{ target: BudgetTargetId; rel: string }> = [
    { target: 'cursor', rel: 'cursor/.cursor/rules/all-for-one.mdc' },
    { target: 'windsurf', rel: 'windsurf/.windsurf/rules/all-for-one.md' },
    { target: 'cline', rel: 'cline/.clinerules/all-for-one.md' },
    { target: 'copilot', rel: 'copilot/.github/copilot-instructions.md' },
    { target: 'gemini-cli', rel: 'gemini-cli/.gemini/GEMINI.md' },
    { target: 'opencode', rel: 'opencode/AGENTS.md' },
  ];
  for (const item of extendedAdapterFiles) {
    const outPath = path.join(targetsDist, item.rel);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buildCompactTargetRouterMarkdown(item.target));
    artifacts.push(path.relative(rootDir, outPath));
  }

  return { artifacts };
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

async function main(): Promise<void> {
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
  const yes = args.includes('--yes');

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
    const compute = detectComputeProfile('colab-t4-target');
    const frames = Number(getFlag('--frames=') ?? '240');
    const engine = (getFlag('--engine=') ?? 'CYCLES') as 'CYCLES' | 'BLENDER_EEVEE_NEXT';
    const routing = evaluateHardwareRenderRouting(hw, frames, engine);
    console.log(
      JSON.stringify(
        {
          hardware: hw,
          colabTarget: compute,
          t4QualityProfiles: T4_QUALITY_PROFILES,
          routing,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (subcommand === 'models') {
    const category = getFlag('--category=') as ModelCategory | undefined;
    const t4Only = args.includes('--t4-only');
    const commercialOnly = args.includes('--commercial-only');
    const compute = detectComputeProfile('colab-t4-target');
    const selected = listModels({ category, t4Only, commercialOnly }).map((m) => ({
      ...m,
      compatibility: assessModelCompatibility(m.id, compute, {
        requireCommercial: commercialOnly,
      }),
    }));
    console.log(
      JSON.stringify(
        {
          computeTarget: compute,
          models: selected,
          openAssetSources: OPEN_ASSET_SOURCES,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (subcommand === 'route') {
    const domain = (getFlag('--domain=') ?? 'product-vehicle') as VisualTaskDomain;
    const engine = (getFlag('--engine=') ?? 'blender-only') as EngineId | 'blender-only';
    const preferHosted = args.includes('--prefer-hosted');
    const hostedReachable = args.includes('--hosted-reachable');
    const plan = routeProductionTask({
      taskDomain: domain,
      engine,
      preferHostedSpace: preferHosted,
      hostedSpaceReachable: hostedReachable,
    });
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (subcommand === 'validate-asset') {
    const fileRel = getFlag('--file=');
    if (!fileRel) {
      console.error('Missing --file=<relative-path>');
      process.exit(1);
    }
    const ext = path.extname(fileRel).toLowerCase();
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
      const criteriaRaw = getFlag('--criteria=') ?? '';
      const criteria = criteriaRaw ? criteriaRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
      const res = inspectRenderArtifactFile(rootDir, fileRel, criteria);
      console.log(JSON.stringify(res, null, 2));
      if (res.status === 'FAILED') process.exit(1);
      return;
    }
    const res = validateGeneratedAssetFile(rootDir, fileRel);
    console.log(JSON.stringify(res, null, 2));
    if (res.status === 'FAILED') process.exit(1);
    return;
  }

  if (subcommand === 'prepare-colab-t4') {
    const jobId = getFlag('--job=') ?? 'afo_t4_job';
    const jobType = getFlag('--type=') === 'inference' ? 't4-model-inference' : 'blender-render';
    const profile = (getFlag('--profile=') ?? 'LOOK_DEVELOPMENT').toUpperCase() as T4QualityProfileId;
    const workerTemplate = path.join(rootDir, 'assets', 'colab', 'colab_blender_worker.py');
    if (jobType === 't4-model-inference') {
      const modelId = getFlag('--model=') ?? 'triposr';
      const pkg = prepareColabT4InferenceJob(rootDir, {
        jobId,
        modelId,
        qualityProfile: profile,
        workerScriptTemplatePath: fs.existsSync(workerTemplate) ? workerTemplate : undefined,
      });
      console.log(JSON.stringify({ ok: true, jobDir: pkg.packageDir, manifest: pkg.manifestPath }, null, 2));
      return;
    }
    const plan = createCinematicProductionPlan({
      projectId: jobId,
      title: `Colab T4 Render ${jobId}`,
      creativeBrief: 'T4 chunked render job',
      durationSec: Number(getFlag('--duration=') ?? '4'),
      fps: Number(getFlag('--fps=') ?? '24'),
      chunkSizeFrames: 24,
    });
    const pkg = prepareColabRenderPackage(rootDir, {
      plan,
      blendRelPath: getFlag('--blend=') ?? 'scenes/scene.blend',
      qualityProfile: profile,
      workerScriptTemplatePath: fs.existsSync(workerTemplate) ? workerTemplate : undefined,
    });
    console.log(JSON.stringify({ ok: true, jobDir: pkg.packageDir, manifest: pkg.manifestPath }, null, 2));
    return;
  }

  if (subcommand === 'mcp-tools') {
    console.log(JSON.stringify({ server: 'scripts/mcp-bridge.ts', tools: MCP_BRIDGE_TOOLS }, null, 2));
    return;
  }

  if (subcommand === 'token-budget') {
    const targetFlag = getFlag('--target=') ?? 'all';
    const query = getFlag('--query=') ?? 'photorealistic vehicle lighting pbr';
    if (targetFlag !== 'all') {
      if (!(ALL_BUDGET_TARGETS as readonly string[]).includes(targetFlag)) {
        console.error(`Unknown budget target "${targetFlag}". Allowed: all, ${ALL_BUDGET_TARGETS.join(', ')}`);
        process.exit(1);
      }
      const single = measureTargetTokenBudget(rootDir, targetFlag as BudgetTargetId, query);
      console.log(JSON.stringify(single, null, 2));
      if (!single.meets85PercentTargetReduction || !single.withinHardCaps) process.exit(1);
      return;
    }
    const report = auditAllTargetsTokenBudget(rootDir, query);
    console.log(JSON.stringify(report, null, 2));
    if (!report.allTargetsMeet85PercentReduction) process.exit(1);
    return;
  }

  if (subcommand === 'inspect-space') {
    const space = getFlag('--space=');
    if (!space) {
      console.error('Missing --space=<owner/space-or-https-url>');
      process.exit(1);
    }
    const modelId = getFlag('--model=');
    const inspected = await inspectGradioSpaceSchema(space, {
      modelId,
      hfToken: process.env.HF_TOKEN,
    });
    console.log(JSON.stringify(inspected, null, 2));
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
    const res = safeInstall({
      sourceRoot: rootDir,
      targetRoot: rootDir,
      target,
      global: isGlobal,
      dryRun,
      force,
      requireApprovalForForce: true,
      destructiveApproval: yes
        ? { approved: true, actor: 'cli-user', reason: 'Passed --yes on afo CLI' }
        : undefined,
    });
    console.log(
      `${dryRun ? '[DRY-RUN] ' : ''}Synced All-For-One V3.1 (${res.scope}, targets=${res.targets.join(',')}): ` +
        `created=${res.summary.created}, updated=${res.summary.updated}, ` +
        `unchanged=${res.summary.unchanged}, skippedUserModified=${res.summary.skippedUserModified}`,
    );
    if (res.backupRoot) console.log(`Backups: ${res.backupRoot}`);
    return;
  }

  if (subcommand === 'uninstall') {
    const res = safeUninstall({
      targetRoot: rootDir,
      global: isGlobal,
      dryRun,
      force,
      requireApprovalForForce: true,
      destructiveApproval: yes
        ? { approved: true, actor: 'cli-user', reason: 'Passed --yes on afo CLI' }
        : undefined,
    });
    console.log(
      `${dryRun ? '[DRY-RUN] ' : ''}${res.message} (removed=${res.removed.length}, preserved=${res.skippedUserModified.length})`,
    );
    if (res.backupRoot) console.log(`Backups: ${res.backupRoot}`);
    return;
  }

  if (subcommand === 'eval-triggers') {
    const res = scoreTriggerRouting(rootDir);
    for (const d of res.details) {
      console.log(`[${d.ok ? 'PASS' : 'FAIL'}] ${d.id}: expected=${d.expected} predicted=${d.predicted}`);
    }
    console.log(
      `Legacy keyword-routing check (NOT a skill quality score): ${res.passed}/${res.total}`,
    );
    if (res.passed < res.total) process.exit(1);
    return;
  }

  if (subcommand === 'eval-v2') {
    const report = runEvaluationSuiteV2(rootDir);
    console.log(
      `${report.evaluationLabel}: ${report.passedCases}/${report.totalCases} (${report.routingMatchPercent}%)`,
    );
    if (report.passedCases < report.totalCases) process.exit(1);
    return;
  }

  if (subcommand === 'eval' || subcommand === 'eval-v3') {
    const report = runEvaluationSuiteV3(rootDir, true);
    const outPath = path.join(rootDir, 'evals', 'report.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
    console.log(
      `${report.evaluationLabel}: ${report.passedCases}/${report.totalCases} (${report.routingMatchPercent}%)`,
    );
    console.log(`Scope: ${report.scoreMeaning}`);
    console.log(`Live Model Evaluation Status: ${report.liveModelEvaluationStatus}`);
    console.log(`Environment: node=${report.environment.nodeVersion}, os=${report.environment.platform}, blender=${report.environment.blenderAvailable ? report.environment.blenderVersion : 'unavailable'}`);
    for (const [cat, stats] of Object.entries(report.byCategory)) {
      console.log(`  - ${cat}: ${stats.passed}/${stats.total} (${stats.routingMatchPercent}%)`);
    }
    console.log(`Machine-readable report written to ${path.relative(rootDir, outPath)}`);
    if (report.passedCases < report.totalCases) process.exit(1);
    return;
  }

  if (subcommand === 'retrieve') {
    const query = getFlag('--query=') ?? '';
    const specialist = getFlag('--specialist=') as CoreSpecialistId | undefined;
    const engine = getFlag('--engine=') as EngineId | undefined;
    const budget = Number(getFlag('--budget=') ?? '1800');
    const compact = args.includes('--compact');
    const res = retrieveTaskKnowledge(rootDir, {
      query,
      specialist,
      engine,
      maxTokenBudget: budget,
      compactSections: compact,
      maxSectionTokens: compact ? Math.floor(budget * 0.85) : undefined,
    });
    console.log(
      `Retrieved ${res.selected.length} doc(s), ${res.totalTokensLoaded}/${res.totalCatalogTokens} tokens (${res.tokenSavingsPercent}% saved, compact=${compact}, cacheHit=${res.cacheHit}):`,
    );
    for (const item of res.selected) {
      console.log(`  - ${item.entry.path} [${item.provenanceStatus}] (score=${item.relevanceScore}, ~${item.effectiveTokens ?? item.entry.estimatedTokens} tokens)`);
    }
    return;
  }

  if (subcommand === 'qa-report') {
    const valReport = validateSkillPackage(rootDir);
    const evalV3 = runEvaluationSuiteV3(rootDir, true);
    const budgetAudit = auditAllTargetsTokenBudget(rootDir);
    const secFiles = fs
      .readdirSync(path.join(rootDir, 'core'))
      .map((f) => path.join('core', f));
    const secScan = runSecuritySecretScan(rootDir, secFiles);
    const blenderCheck = evaluateBlenderQaCheck();
    const minSavings = Math.min(...budgetAudit.targets.map((t) => t.activeTaskSavingsPercentVsFull));
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
        id: 'QA-TOKEN-BUDGET-85',
        category: 'memory-profile',
        description: 'Verify >= 85% token reduction across all 10 AI targets (Antigravity, Claude, Codex, Custom GPT, Cursor, Windsurf, Cline, Copilot, Gemini CLI, OpenCode)',
        status: budgetAudit.allTargetsMeet85PercentReduction ? 'VERIFIED' : 'FAILED',
        commandOrSource: 'npx tsx scripts/afo.ts token-budget',
        exitCode: budgetAudit.allTargetsMeet85PercentReduction ? 0 : 1,
        evidence: `${budgetAudit.targets.length} targets measured against ${budgetAudit.baseline.totalFullPackageTokens} baseline tokens; minimum savings=${minSavings}%.`,
      },
      {
        id: 'QA-KEYWORD-ROUTING',
        category: 'integration-test',
        description: 'Run 159-case keyword-routing and static policy test (not a skill quality score)',
        status: evalV3.passedCases === evalV3.totalCases ? 'VERIFIED' : 'FAILED',
        commandOrSource: 'npx tsx scripts/afo.ts eval',
        exitCode: evalV3.passedCases === evalV3.totalCases ? 0 : 1,
        evidence: `${evalV3.passedCases}/${evalV3.totalCases} routing/policy cases matched (${evalV3.routingMatchPercent}%; not a live AI quality score).`,
      },
      secScan.check,
      blenderCheck,
    ];
    const assetCheckPath = getFlag('--asset=');
    const assetChecks = assetCheckPath ? [evaluateAssetValidationQa(rootDir, assetCheckPath)] : [];
    const report = buildVerificationReport('All-For-One V3.2', [...checks, ...assetChecks], []);
    const md = formatVerificationReportMarkdown(report);
    fs.writeFileSync(path.join(rootDir, 'VERIFICATION_REPORT.md'), md);
    console.log(`Generated VERIFICATION_REPORT.md (overall=${report.overallStatus}).`);
    return;
  }

  console.log(`All-For-One V3.2 CLI (scripts/afo.ts)

Usage:
  npx tsx scripts/afo.ts validate
  npx tsx scripts/afo.ts build
  npx tsx scripts/afo.ts sync [--target=<target>|all] [--global] [--dry-run] [--force --yes]
  npx tsx scripts/afo.ts uninstall [--global] [--dry-run] [--force --yes]
  npx tsx scripts/afo.ts verify-install [--global]
  npx tsx scripts/afo.ts check-tools
  npx tsx scripts/afo.ts single-ai-check [--mode=ECONOMY|BALANCED|ACCELERATION]
  npx tsx scripts/afo.ts token-budget [--target=all|<target>] [--query="..."]
  npx tsx scripts/afo.ts colab-check [--frames=240] [--engine=CYCLES|BLENDER_EEVEE_NEXT]
  npx tsx scripts/afo.ts models [--category=3d-generation|image-generation|asset-enhancement|animation-video] [--t4-only] [--commercial-only]
  npx tsx scripts/afo.ts inspect-space --space=<owner/name> [--model=triposr]
  npx tsx scripts/afo.ts route --domain=product-vehicle|architecture-interior|natural-landscape|character-creature|playable-3d-scene [--engine=...]
  npx tsx scripts/afo.ts validate-asset --file=<relative-path> [--criteria="lighting,silhouette"]
  npx tsx scripts/afo.ts prepare-colab-t4 --job=<id> [--type=render|inference] [--model=triposr] [--profile=LOOK_DEVELOPMENT]
  npx tsx scripts/afo.ts mcp-tools
  npx tsx scripts/afo.ts cinematic-plan [--duration=90] [--fps=24]
  npx tsx scripts/afo.ts eval
  npx tsx scripts/afo.ts retrieve --query="..." [--specialist=...] [--engine=...] [--budget=1800] [--compact]
  npx tsx scripts/afo.ts qa-report
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
