#!/usr/bin/env node
/**
 * All For One — Zero-Dependency Node.js Installer
 * Installs /crazy, /crazydesigner, /crazymaker, and /crazycoder for:
 *   - Claude (~/.claude/skills or .claude/skills)
 *   - Google Antigravity (~/.gemini/antigravity/ or .agent/)
 *   - ChatGPT / OpenAI Codex (~/.codex/skills or .agents/skills)
 *
 * Works with plain Node.js >= 18 without requiring npm install or tsx.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const COMMANDS = ['crazy', 'crazydesigner', 'crazymaker', 'crazycoder'];

function parseArgs(argv) {
  const args = new Set(argv);
  const targetArg = argv.find((a) => a.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'all';
  const global = args.has('--global') || !args.has('--workspace');
  return { target, global };
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyVault(dest) {
  for (const folder of ['references', 'scripts', 'assets']) {
    const src = path.join(ROOT_DIR, folder);
    if (fs.existsSync(src)) copyDir(src, path.join(dest, folder));
  }
}

function extractDescriptionAndBody(markdown) {
  const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { description: 'All For One skill workflow.', body: markdown };
  const descMatch = m[1].match(/description:\s*(?:>-|>)?\s*\r?\n((?:\s+.*\r?\n?)*)/);
  const singleDesc = m[1].match(/description:\s*["']?([^\r\n"']+)["']?/);
  const description = descMatch
    ? descMatch[1].replace(/\s+/g, ' ').trim()
    : singleDesc
      ? singleDesc[1].trim()
      : 'All For One skill workflow.';
  return { description, body: m[2].trim() };
}

function installClaude(baseDir) {
  for (const cmd of COMMANDS) {
    const dest = path.join(baseDir, cmd);
    cleanDir(dest);
    copyDir(path.join(ROOT_DIR, 'skills', cmd), dest);
    if (cmd === 'crazy') copyVault(dest);
  }
  console.log(`[Claude] Installed /crazy, /crazydesigner, /crazymaker, /crazycoder -> ${baseDir}`);
}

function installAntigravity(skillDest, workflowDir) {
  cleanDir(skillDest);
  copyDir(path.join(ROOT_DIR, 'skills', 'crazy'), skillDest);
  copyVault(skillDest);
  fs.mkdirSync(workflowDir, { recursive: true });
  for (const cmd of COMMANDS) {
    const raw = fs.readFileSync(path.join(ROOT_DIR, 'skills', cmd, 'SKILL.md'), 'utf8');
    const { description, body } = extractDescriptionAndBody(raw);
    const wf = `---\ndescription: ${description}\n---\n\n${body}\n`;
    fs.writeFileSync(path.join(workflowDir, `${cmd}.md`), wf);
  }
  console.log(`[Antigravity] Installed skill -> ${skillDest}`);
  console.log(`[Antigravity] Installed workflows -> ${workflowDir}`);
}

function installChatGPT(baseDir) {
  for (const cmd of COMMANDS) {
    const dest = path.join(baseDir, cmd);
    cleanDir(dest);
    copyDir(path.join(ROOT_DIR, 'skills', cmd), dest);
    if (cmd === 'crazy') copyVault(dest);
  }
  console.log(`[ChatGPT/Codex] Installed /crazy, /crazydesigner, /crazymaker, /crazycoder -> ${baseDir}`);
}

function main() {
  const { target, global } = parseArgs(process.argv.slice(2));
  const home = os.homedir();
  const cwd = process.cwd();
  const targets = target === 'all' ? ['claude', 'antigravity', 'chatgpt'] : [target];

  console.log(`Installing "All For One" (${global ? 'global' : 'workspace'} scope)...`);

  if (targets.includes('claude')) {
    installClaude(global ? path.join(home, '.claude', 'skills') : path.join(cwd, '.claude', 'skills'));
  }
  if (targets.includes('antigravity')) {
    installAntigravity(
      global
        ? path.join(home, '.gemini', 'antigravity', 'skills', 'all-for-one')
        : path.join(cwd, '.agent', 'skills', 'all-for-one'),
      global
        ? path.join(home, '.gemini', 'antigravity', 'global_workflows')
        : path.join(cwd, '.agent', 'workflows'),
    );
  }
  if (targets.includes('chatgpt')) {
    installChatGPT(global ? path.join(home, '.codex', 'skills') : path.join(cwd, '.agents', 'skills'));
  }

  console.log('Done! Restart or refresh your AI agent session to use /crazy, /crazydesigner, /crazymaker, and /crazycoder.');
}

main();
