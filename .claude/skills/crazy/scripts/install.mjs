#!/usr/bin/env node
/**
 * All For One — Cross-Platform Installer CLI
 * Delegates directly to the single canonical engine in core/installer-engine.mjs.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeInstall, safeUninstall } from '../core/installer-engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_ROOT = path.resolve(__dirname, '..');

function parseCliArgs(argv) {
  const args = new Set(argv);
  const targetArg = argv.find((a) => a.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'all';
  const dryRun = args.has('--dry-run');
  const force = args.has('--force');
  const uninstall = args.has('--uninstall');
  const global = args.has('--global') || !args.has('--workspace');
  const help = args.has('--help') || args.has('-h');
  return { target, dryRun, force, uninstall, global, help };
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`All For One V2 Safe Installer

Usage:
  node scripts/install.mjs [options]

Options:
  --global               Install to user home directories (default)
  --workspace            Install into current working directory
  --target=<name>        claude | antigravity | chatgpt | all (default: all)
  --dry-run              Preview planned changes without writing files
  --force                Overwrite user-modified owned files (creates backup first)
  --uninstall            Safely remove only package-owned unmodified files
`);
    return;
  }

  if (opts.uninstall) {
    const res = safeUninstall({
      targetRoot: process.cwd(),
      global: opts.global,
      dryRun: opts.dryRun,
      force: opts.force,
    });
    console.log(
      `${opts.dryRun ? '[DRY-RUN] ' : ''}${res.message} (removed=${res.removed.length}, preservedUserModified=${res.skippedUserModified.length})`,
    );
    return;
  }

  const res = safeInstall({
    sourceRoot: SOURCE_ROOT,
    targetRoot: process.cwd(),
    target: opts.target,
    global: opts.global,
    dryRun: opts.dryRun,
    force: opts.force,
  });

  console.log(
    `${opts.dryRun ? '[DRY-RUN] ' : ''}All For One V2 (${res.scope}, targets=${res.targets.join(',')}): ` +
      `created=${res.summary.created}, updated=${res.summary.updated}, ` +
      `unchanged=${res.summary.unchanged}, skippedUserModified=${res.summary.skippedUserModified}`,
  );
  if (res.backupRoot) {
    console.log(`Backups saved to: ${res.backupRoot}`);
  }
}

main();
