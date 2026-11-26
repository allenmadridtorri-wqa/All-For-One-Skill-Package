import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseFrontmatter, validateSkillPackage } from './validate-skill-package.ts';

export type FrontierTarget = 'claude' | 'antigravity' | 'chatgpt';

export interface SyncOptions {
  rootDir: string;
  target?: FrontierTarget | 'all';
  global?: boolean;
  homeDir?: string;
}

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

const COMMANDS = ['crazy', 'crazydesigner', 'crazymaker', 'crazycoder'] as const;

// ---------------------------------------------------------------------------
// Minimal Pure-Node ZIP Builder (Deflate + CRC32, zero external dependencies)
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

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // compression method: deflate
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x5421, 12); // mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(fileNameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localChunks.push(localHeader, fileNameBuf, compressed);

    // Central directory header (46 bytes + filename)
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

function collectFilesForZip(dir: string, prefix = ''): ZipEntryInput[] {
  const out: ZipEntryInput[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...collectFilesForZip(full, rel));
    } else {
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

function ensureCleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function generateAntigravityWorkflow(skillName: string, skillMarkdown: string): string {
  const { frontmatter, body } = parseFrontmatter(skillMarkdown);
  const description =
    typeof frontmatter.description === 'string'
      ? frontmatter.description
      : `Execute All For One /${skillName} workflow.`;

  return `---
description: ${description}
---

<!-- Generated by All For One CLI (scripts/afo.ts). Source: skills/${skillName}/SKILL.md -->

${body.trim()}

## Antigravity Execution Reminder

- Load referenced Tier-3 guides from \`.agent/skills/all-for-one/references/\` (or global \`~/.gemini/antigravity/skills/all-for-one/references/\`) on demand before authoring shaders, materials, physics, or ECS systems.
- Reuse GLSL shader chunks from \`assets/shaders/\` and zero-GC utilities from \`assets/ecs/\`.
- Run \`npx tsx scripts/check-hot-loop.ts\` and \`npx tsx scripts/audit-pbr-scene.ts\` before completing delivery.
`;
}

function copySharedVaultInto(targetSkillDir: string, rootDir: string): void {
  for (const folder of ['references', 'scripts', 'assets']) {
    const src = path.join(rootDir, folder);
    if (fs.existsSync(src)) {
      copyDirRecursive(src, path.join(targetSkillDir, folder));
    }
  }
}

function buildCustomGptInstructions(rootDir: string): string {
  const sections: string[] = [
    '# All For One — Ultimate AAA Game Development Custom GPT',
    '',
    'You embody the **All For One** package: 40 years of Hollywood 3D/VFX/Spatial Audio (`/crazydesigner`), 40 years of Rockstar-tier AAA Game Design (`/crazymaker`), and 50 years of Principal Engine & Systems Engineering (`/crazycoder`), unified under `/crazy`.',
    '',
    '## Slash Command Routing',
    '- If the user starts with `/crazydesigner`, execute the **CrazyDesigner** doctrine below.',
    '- If the user starts with `/crazymaker`, execute the **CrazyMaker** doctrine below.',
    '- If the user starts with `/crazycoder`, execute the **CrazyCoder** doctrine below.',
    '- If the user starts with `/crazy` (or requests a complete playable 3D game/scene), execute the **Crazy** 5-Stage AAA Studio Pipeline.',
    '- Consult attached Knowledge files (`references/*.md`, `assets/shaders/*.glsl`, `assets/ecs/*.ts`) whenever writing shaders, lighting, audio, physics, AI, or ECS loops.',
    '',
  ];

  for (const cmd of COMMANDS) {
    const raw = fs.readFileSync(path.join(rootDir, 'skills', cmd, 'SKILL.md'), 'utf8');
    const { body } = parseFrontmatter(raw);
    sections.push('---', '', body.trim(), '');
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Build & Sync Commands
// ---------------------------------------------------------------------------

export function buildAllTargets(rootDir: string): { artifacts: string[] } {
  const distDir = path.join(rootDir, 'dist');
  const artifacts: string[] = [];

  // 1. Claude Desktop & Code Bundle
  const claudeDist = path.join(distDir, 'claude');
  ensureCleanDir(claudeDist);

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
  ensureCleanDir(agDist);
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
  ensureCleanDir(gptDist);
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
  ];
  const knowledgeZip = path.join(customGptDir, 'all-for-one-knowledge.zip');
  fs.writeFileSync(knowledgeZip, createZipBuffer(knowledgeEntries));
  artifacts.push(path.relative(rootDir, knowledgeZip));

  return { artifacts };
}

export function syncTargets(options: SyncOptions): { syncedPaths: string[]; lockFile: string } {
  const { rootDir, target = 'all', global = false, homeDir = os.homedir() } = options;
  const targets: FrontierTarget[] =
    target === 'all' ? ['claude', 'antigravity', 'chatgpt'] : [target];

  const syncedPaths: string[] = [];
  const lockEntries: Record<string, { target: FrontierTarget; paths: string[]; sha256: string }> = {};

  const hash = crypto.createHash('sha256');
  for (const cmd of COMMANDS) {
    hash.update(fs.readFileSync(path.join(rootDir, 'skills', cmd, 'SKILL.md')));
  }
  const packageDigest = hash.digest('hex');

  if (targets.includes('claude')) {
    const baseDir = global
      ? path.join(homeDir, '.claude', 'skills')
      : path.join(rootDir, '.claude', 'skills');
    const paths: string[] = [];
    for (const cmd of COMMANDS) {
      const dest = path.join(baseDir, cmd);
      ensureCleanDir(dest);
      copyDirRecursive(path.join(rootDir, 'skills', cmd), dest);
      if (cmd === 'crazy') {
        copySharedVaultInto(dest, rootDir);
      }
      paths.push(dest);
      syncedPaths.push(dest);
    }
    lockEntries.claude = { target: 'claude', paths, sha256: packageDigest };
  }

  if (targets.includes('antigravity')) {
    const skillDest = global
      ? path.join(homeDir, '.gemini', 'antigravity', 'skills', 'all-for-one')
      : path.join(rootDir, '.agent', 'skills', 'all-for-one');
    const wfDestDir = global
      ? path.join(homeDir, '.gemini', 'antigravity', 'global_workflows')
      : path.join(rootDir, '.agent', 'workflows');

    ensureCleanDir(skillDest);
    copyDirRecursive(path.join(rootDir, 'skills', 'crazy'), skillDest);
    copySharedVaultInto(skillDest, rootDir);

    fs.mkdirSync(wfDestDir, { recursive: true });
    const paths = [skillDest];
    syncedPaths.push(skillDest);

    for (const cmd of COMMANDS) {
      const raw = fs.readFileSync(path.join(rootDir, 'skills', cmd, 'SKILL.md'), 'utf8');
      const wfFile = path.join(wfDestDir, `${cmd}.md`);
      fs.writeFileSync(wfFile, generateAntigravityWorkflow(cmd, raw));
      paths.push(wfFile);
      syncedPaths.push(wfFile);
    }
    lockEntries.antigravity = { target: 'antigravity', paths, sha256: packageDigest };
  }

  if (targets.includes('chatgpt')) {
    const baseDir = global
      ? path.join(homeDir, '.codex', 'skills')
      : path.join(rootDir, '.agents', 'skills');
    const paths: string[] = [];
    for (const cmd of COMMANDS) {
      const dest = path.join(baseDir, cmd);
      ensureCleanDir(dest);
      copyDirRecursive(path.join(rootDir, 'skills', cmd), dest);
      if (cmd === 'crazy') {
        copySharedVaultInto(dest, rootDir);
      }
      paths.push(dest);
      syncedPaths.push(dest);
    }
    lockEntries.chatgpt = { target: 'chatgpt', paths, sha256: packageDigest };
  }

  const lockFile = path.join(rootDir, 'oneskill.lock.json');
  const lockPayload = {
    package: 'all-for-one',
    version: '1.0.0',
    scope: global ? 'global' : 'workspace',
    syncedAt: new Date().toISOString(),
    targets: lockEntries,
  };
  fs.writeFileSync(lockFile, JSON.stringify(lockPayload, null, 2) + '\n');

  return { syncedPaths, lockFile };
}

// ---------------------------------------------------------------------------
// Deterministic Tier-1 Trigger Routing Evaluator
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
    // 1. Explicit slash command wins immediately
    const slashMatch = tc.prompt.match(/\/(crazydesigner|crazymaker|crazycoder|crazy)\b/i);
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

      // If multiple specialist domains overlap strongly, orchestrate with /crazy
      const specialistHits = scores.filter((s) => s.name !== 'crazy' && s.overlap >= 2);
      if (specialistHits.length >= 2) {
        predicted = 'crazy';
      } else {
        predicted = scores[0]?.name ?? 'crazy';
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

  const targetFlag = args.find((a) => a.startsWith('--target='));
  const target = (targetFlag ? targetFlag.split('=')[1] : 'all') as FrontierTarget | 'all';
  const isGlobal = args.includes('--global');

  if (subcommand === 'validate') {
    const report = validateSkillPackage(rootDir);
    console.log(`Validated ${report.skillsChecked} skills.`);
    for (const issue of report.issues) {
      console.log(`[${issue.severity.toUpperCase()}] ${issue.file}: ${issue.message}`);
    }
    if (!report.ok) process.exit(1);
    console.log('All For One package validation passed.');
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

  if (subcommand === 'sync' || subcommand === 'install') {
    const report = validateSkillPackage(rootDir);
    if (!report.ok) {
      console.error('Validation failed. Fix errors before syncing.');
      process.exit(1);
    }
    const { syncedPaths, lockFile } = syncTargets({
      rootDir,
      target,
      global: isGlobal,
    });
    console.log(`Synced All For One (${isGlobal ? 'global' : 'workspace'}, target=${target}):`);
    for (const p of syncedPaths) console.log(`  - ${p}`);
    console.log(`Lockfile updated: ${path.relative(rootDir, lockFile)}`);
    return;
  }

  if (subcommand === 'eval-triggers') {
    const res = scoreTriggerRouting(rootDir);
    for (const d of res.details) {
      console.log(`[${d.ok ? 'PASS' : 'FAIL'}] ${d.id}: expected=${d.expected} predicted=${d.predicted}`);
    }
    console.log(`Trigger accuracy: ${res.passed}/${res.total}`);
    if (res.passed < res.total) process.exit(1);
    return;
  }

  console.log(`All For One (afo) Cross-Frontier Skill CLI

Usage:
  npx tsx scripts/afo.ts validate
  npx tsx scripts/afo.ts build
  npx tsx scripts/afo.ts sync [--target=claude|antigravity|chatgpt|all] [--global]
  npx tsx scripts/afo.ts eval-triggers
`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
