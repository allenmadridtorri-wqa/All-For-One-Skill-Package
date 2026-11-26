#!/usr/bin/env node
/**
 * All For One — Cross-Platform Installer CLI
 * Delegates directly to the single canonical engine in core/installer-engine.mjs.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  detectExternalTools,
  safeInstall,
  safeUninstall,
  SUPPORTED_TARGETS,
  verifyInstallIntegrity,
} from '../core/installer-engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_ROOT = path.resolve(__dirname, '..');

const VALID_TARGETS = new Set(['all', ...SUPPORTED_TARGETS]);
const BOOLEAN_FLAGS = new Set([
  '--global',
  '--workspace',
  '--dry-run',
  '--force',
  '--yes',
  '--uninstall',
  '--verify',
  '--check-tools',
  '--help',
  '-h',
]);

export function parseCliArgs(argv) {
  let target;
  let seenGlobal = false;
  let seenWorkspace = false;
  let dryRun = false;
  let force = false;
  let yes = false;
  let uninstall = false;
  let verify = false;
  let checkTools = false;
  let help = false;

  for (const arg of argv) {
    if (!arg.startsWith('-')) {
      throw new Error(`Unexpected positional argument "${arg}". Run --help for valid options.`);
    }

    if (arg === '--target') {
      throw new Error(
        `Malformed option "--target". Expected --target=<all|${SUPPORTED_TARGETS.join('|')}>.`,
      );
    }

    if (arg.startsWith('--target=')) {
      const value = arg.slice('--target='.length);
      if (!value || !VALID_TARGETS.has(value)) {
        throw new Error(
          `Invalid target "${value}". Allowed values: ${[...VALID_TARGETS].join(', ')}.`,
        );
      }
      if (target !== undefined) {
        throw new Error('Duplicate --target= option provided.');
      }
      target = value;
      continue;
    }

    const eqIdx = arg.indexOf('=');
    if (eqIdx !== -1) {
      const flagName = arg.slice(0, eqIdx);
      if (BOOLEAN_FLAGS.has(flagName)) {
        throw new Error(`Option "${flagName}" does not take a value ("${arg}").`);
      }
      throw new Error(`Unknown option "${arg}". Run --help for valid options.`);
    }

    if (!BOOLEAN_FLAGS.has(arg)) {
      throw new Error(`Unknown option "${arg}". Run --help for valid options.`);
    }

    if (arg === '--global') seenGlobal = true;
    else if (arg === '--workspace') seenWorkspace = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--force') force = true;
    else if (arg === '--yes') yes = true;
    else if (arg === '--uninstall') uninstall = true;
    else if (arg === '--verify') verify = true;
    else if (arg === '--check-tools') checkTools = true;
    else if (arg === '--help' || arg === '-h') help = true;
  }

  if (seenGlobal && seenWorkspace) {
    throw new Error('Conflicting scope flags: specify either --global or --workspace, not both.');
  }

  if (uninstall && verify) {
    throw new Error('Conflicting actions: cannot combine --uninstall and --verify.');
  }
  if (checkTools && (uninstall || verify)) {
    throw new Error('Conflicting actions: --check-tools cannot be combined with --uninstall or --verify.');
  }

  return {
    target: target ?? 'all',
    dryRun,
    force,
    yes,
    uninstall,
    verify,
    checkTools,
    global: seenGlobal || !seenWorkspace,
    help,
  };
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`All For One V3.2 Safe Installer

Usage:
  node scripts/install.mjs [options]

Options:
  --global               Install to user home directories (default)
  --workspace            Install into current working directory
  --target=<name>        ${SUPPORTED_TARGETS.join(' | ')} | all (default: all)
  --dry-run              Preview planned changes without writing files
  --force                Overwrite or remove user-modified owned files (requires --yes; creates backup first)
  --yes                  Confirm destructive --force operations
  --uninstall            Safely remove only package-owned unmodified files (or backed-up modified files with --force --yes)
  --verify               Verify SHA-256 integrity of installed files against manifest
  --check-tools          Detect Node.js, Git, and optional Blender / FFmpeg availability
  --help, -h             Show this help output
`);
    return;
  }

  if (opts.checkTools) {
    const tools = detectExternalTools();
    console.log('External Tools Availability:');
    console.log(`  node:    ${tools.node.available ? `AVAILABLE (${tools.node.version})` : 'MISSING (REQUIRED)'}`);
    console.log(`  git:     ${tools.git.available ? `AVAILABLE (${tools.git.version})` : 'NOT FOUND (optional)'}`);
    console.log(`  blender: ${tools.blender.available ? `AVAILABLE (${tools.blender.version})` : 'NOT FOUND (optional local 3D/Blender rendering unavailable; remote Colab supported)'}`);
    console.log(`  ffmpeg:  ${tools.ffmpeg.available ? `AVAILABLE (${tools.ffmpeg.version})` : 'NOT FOUND (optional video assembly unavailable)'}`);
    return;
  }

  if (opts.verify) {
    const integrity = verifyInstallIntegrity({ targetRoot: process.cwd(), global: opts.global });
    console.log(integrity.message);
    if (!integrity.ok) process.exit(1);
    return;
  }

  const destructiveApproval = opts.yes
    ? { approved: true, actor: 'cli-user', reason: 'Passed --yes on installer CLI' }
    : undefined;

  if (opts.uninstall) {
    const res = safeUninstall({
      targetRoot: process.cwd(),
      global: opts.global,
      dryRun: opts.dryRun,
      force: opts.force,
      requireApprovalForForce: true,
      destructiveApproval,
    });
    console.log(
      `${opts.dryRun ? '[DRY-RUN] ' : ''}${res.message} (removed=${res.removed.length}, preservedUserModified=${res.skippedUserModified.length})`,
    );
    if (res.backupRoot) {
      console.log(`Backups saved to: ${res.backupRoot}`);
    }
    return;
  }

  const res = safeInstall({
    sourceRoot: SOURCE_ROOT,
    targetRoot: process.cwd(),
    target: opts.target,
    global: opts.global,
    dryRun: opts.dryRun,
    force: opts.force,
    requireApprovalForForce: true,
    destructiveApproval,
  });

  console.log(
    `${opts.dryRun ? '[DRY-RUN] ' : ''}All For One V3.2 (${res.scope}, targets=${res.targets.join(',')}): ` +
      `created=${res.summary.created}, updated=${res.summary.updated}, ` +
      `unchanged=${res.summary.unchanged}, skippedUserModified=${res.summary.skippedUserModified}`,
  );
  if (res.backupRoot) {
    console.log(`Backups saved to: ${res.backupRoot}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (err) {
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
