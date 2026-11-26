import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const FRONTIER_TARGETS = ['claude', 'antigravity', 'chatgpt'];
export const SKILL_COMMANDS = ['crazy', 'crazydesigner', 'crazymaker', 'crazycoder', 'crazyqa'];

/**
 * Validates that `candidatePath` resolves strictly inside `allowedBaseDir`
 * and contains no null bytes or traversal segments.
 */
export function assertSafeSubpath(baseDir, candidatePath) {
  if (typeof candidatePath !== 'string' || candidatePath.includes('\0')) {
    throw new Error(`Unsafe path rejected: invalid characters in "${String(candidatePath)}"`);
  }
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, candidatePath);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error(
      `Path traversal blocked: "${candidatePath}" resolves outside "${resolvedBase}"`,
    );
  }
  return resolvedTarget;
}

/**
 * Validates an explicit destination directory (must be non-empty, absolute after resolve,
 * and not a dangerous filesystem root).
 */
export function validateDestinationRoot(destRoot) {
  if (typeof destRoot !== 'string' || destRoot.trim() === '' || destRoot.includes('\0')) {
    throw new Error('Destination root must be a non-empty valid path.');
  }
  const resolved = path.resolve(destRoot);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw new Error(`Refusing to operate on filesystem root "${resolved}".`);
  }
  return resolved;
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function parseSkillMarkdown(markdown) {
  const m = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { description: 'All For One skill workflow.', body: markdown.trim() };
  const yaml = m[1];
  const body = m[2].trim();

  const folded = yaml.match(/description:\s*(?:>-|>|\|-|\|)\s*\r?\n((?:\s+.*\r?\n?)*)/);
  if (folded) {
    return {
      description: folded[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' '),
      body,
    };
  }
  const single = yaml.match(/description:\s*["']?([^\r\n"']+)["']?/);
  return {
    description: single ? single[1].trim() : 'All For One skill workflow.',
    body,
  };
}

function generateAntigravityWorkflow(cmd, skillMarkdown) {
  const { description, body } = parseSkillMarkdown(skillMarkdown);
  return `---
description: ${description}
---

<!-- Managed by All For One Installer (core/installer-engine.mjs). Source: skills/${cmd}/SKILL.md -->

${body}

## Antigravity Execution Notes

- Retrieve only task-relevant references via \`npx tsx scripts/afo.ts retrieve --query="..."\` or inspect \`.agent/skills/all-for-one/references/\`.
- Always run \`crazyqa\` verification before marking any milestone VERIFIED.
`;
}

function collectRelativeFiles(srcDir, relPrefix = '') {
  const results = [];
  if (!fs.existsSync(srcDir)) return results;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') {
      continue;
    }
    const full = path.join(srcDir, entry.name);
    const rel = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectRelativeFiles(full, rel));
    } else if (entry.isFile()) {
      results.push({ rel, full });
    }
  }
  return results;
}

/**
 * Builds the declarative file plan (destPath -> content Buffer) for a given target + scope.
 * Never mutates the filesystem.
 */
export function buildInstallFilePlan({
  sourceRoot,
  targetRoot,
  target = 'all',
  global = false,
  homeDir = os.homedir(),
}) {
  const resolvedSource = validateDestinationRoot(sourceRoot);
  const resolvedTargetRoot = validateDestinationRoot(global ? homeDir : targetRoot);
  const targets = target === 'all' ? [...FRONTIER_TARGETS] : [target];

  for (const t of targets) {
    if (!FRONTIER_TARGETS.includes(t)) {
      throw new Error(`Unsupported frontier target "${t}". Allowed: ${FRONTIER_TARGETS.join(', ')}`);
    }
  }

  const availableCommands = SKILL_COMMANDS.filter((cmd) =>
    fs.existsSync(path.join(resolvedSource, 'skills', cmd, 'SKILL.md')),
  );

  if (availableCommands.length === 0) {
    throw new Error(`No skills found under ${path.join(resolvedSource, 'skills')}`);
  }

  /** @type {Array<{ destPath: string; relToBase: string; baseDir: string; content: Buffer; target: string }>} */
  const plannedFiles = [];
  const sharedVaultFolders = ['references', 'scripts', 'assets', 'core'];

  const addSkillTree = (baseDir, cmd, targetName, includeVault) => {
    const skillFiles = collectRelativeFiles(path.join(resolvedSource, 'skills', cmd));
    for (const f of skillFiles) {
      const destPath = assertSafeSubpath(baseDir, path.join(cmd, f.rel));
      plannedFiles.push({
        destPath,
        relToBase: path.relative(resolvedTargetRoot, destPath),
        baseDir,
        content: fs.readFileSync(f.full),
        target: targetName,
      });
    }
    if (includeVault) {
      for (const folder of sharedVaultFolders) {
        const vaultFiles = collectRelativeFiles(path.join(resolvedSource, folder), folder);
        for (const f of vaultFiles) {
          const destPath = assertSafeSubpath(baseDir, path.join(cmd, f.rel));
          plannedFiles.push({
            destPath,
            relToBase: path.relative(resolvedTargetRoot, destPath),
            baseDir,
            content: fs.readFileSync(f.full),
            target: targetName,
          });
        }
      }
    }
  };

  if (targets.includes('claude')) {
    const claudeBase = global
      ? assertSafeSubpath(resolvedTargetRoot, path.join('.claude', 'skills'))
      : assertSafeSubpath(resolvedTargetRoot, path.join('.claude', 'skills'));
    for (const cmd of availableCommands) {
      addSkillTree(claudeBase, cmd, 'claude', cmd === 'crazy');
    }
  }

  if (targets.includes('antigravity')) {
    const agSkillBase = global
      ? assertSafeSubpath(resolvedTargetRoot, path.join('.gemini', 'antigravity', 'skills'))
      : assertSafeSubpath(resolvedTargetRoot, path.join('.agent', 'skills'));
    const agWfBase = global
      ? assertSafeSubpath(resolvedTargetRoot, path.join('.gemini', 'antigravity', 'global_workflows'))
      : assertSafeSubpath(resolvedTargetRoot, path.join('.agent', 'workflows'));

    // Primary skill directory: all-for-one/
    const crazyFiles = collectRelativeFiles(path.join(resolvedSource, 'skills', 'crazy'));
    for (const f of crazyFiles) {
      const destPath = assertSafeSubpath(agSkillBase, path.join('all-for-one', f.rel));
      plannedFiles.push({
        destPath,
        relToBase: path.relative(resolvedTargetRoot, destPath),
        baseDir: agSkillBase,
        content: fs.readFileSync(f.full),
        target: 'antigravity',
      });
    }
    for (const folder of sharedVaultFolders) {
      const vaultFiles = collectRelativeFiles(path.join(resolvedSource, folder), folder);
      for (const f of vaultFiles) {
        const destPath = assertSafeSubpath(agSkillBase, path.join('all-for-one', f.rel));
        plannedFiles.push({
          destPath,
          relToBase: path.relative(resolvedTargetRoot, destPath),
          baseDir: agSkillBase,
          content: fs.readFileSync(f.full),
          target: 'antigravity',
        });
      }
    }

    // Workflows for each slash command
    for (const cmd of availableCommands) {
      const rawSkill = fs.readFileSync(path.join(resolvedSource, 'skills', cmd, 'SKILL.md'), 'utf8');
      const wfText = generateAntigravityWorkflow(cmd, rawSkill);
      const destPath = assertSafeSubpath(agWfBase, `${cmd}.md`);
      plannedFiles.push({
        destPath,
        relToBase: path.relative(resolvedTargetRoot, destPath),
        baseDir: agWfBase,
        content: Buffer.from(wfText, 'utf8'),
        target: 'antigravity',
      });
    }
  }

  if (targets.includes('chatgpt')) {
    const gptBase = global
      ? assertSafeSubpath(resolvedTargetRoot, path.join('.codex', 'skills'))
      : assertSafeSubpath(resolvedTargetRoot, path.join('.agents', 'skills'));
    for (const cmd of availableCommands) {
      addSkillTree(gptBase, cmd, 'chatgpt', cmd === 'crazy');
    }
  }

  return {
    resolvedSource,
    resolvedTargetRoot,
    targets,
    availableCommands,
    plannedFiles,
  };
}

function getManifestPath(resolvedTargetRoot, global) {
  return global
    ? assertSafeSubpath(resolvedTargetRoot, '.afo-global-manifest.json')
    : assertSafeSubpath(resolvedTargetRoot, 'oneskill.lock.json');
}

function readExistingManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Safe non-destructive installer with backup, dry-run, user-customization preservation,
 * force-overwrite (still backed up), and automatic transactional rollback on failure.
 */
export function safeInstall({
  sourceRoot,
  targetRoot,
  target = 'all',
  global = false,
  homeDir = os.homedir(),
  dryRun = false,
  force = false,
  simulateFailureAtIndex = -1,
}) {
  const plan = buildInstallFilePlan({ sourceRoot, targetRoot, target, global, homeDir });
  const manifestPath = getManifestPath(plan.resolvedTargetRoot, global);
  const existingManifest = readExistingManifest(manifestPath);

  /** @type {Record<string, string>} */
  const previousHashes = {};
  if (existingManifest && existingManifest.ownedFiles && typeof existingManifest.ownedFiles === 'object') {
    for (const [k, v] of Object.entries(existingManifest.ownedFiles)) {
      if (typeof v === 'string') previousHashes[k] = v;
    }
  }

  const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = assertSafeSubpath(
    plan.resolvedTargetRoot,
    path.join('.afo-backups', backupTimestamp),
  );

  const actions = [];
  const nextOwnedFiles = { ...previousHashes };

  // Rollback journal
  const createdFiles = [];
  const createdDirs = [];
  const backedUpFiles = []; // { destPath, backupPath }

  const ensureDirTracked = (dirPath) => {
    if (fs.existsSync(dirPath)) return;
    const missing = [];
    let cur = dirPath;
    while (!fs.existsSync(cur)) {
      missing.unshift(cur);
      const parent = path.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    fs.mkdirSync(dirPath, { recursive: true });
    for (const d of missing) createdDirs.push(d);
  };

  try {
    for (let i = 0; i < plan.plannedFiles.length; i++) {
      if (simulateFailureAtIndex === i) {
        throw new Error(`Simulated write failure at file index ${i}`);
      }

      const item = plan.plannedFiles[i];
      const nextHash = sha256Buffer(item.content);
      const relKey = item.relToBase.replace(/\\/g, '/');
      const exists = fs.existsSync(item.destPath);

      if (!exists) {
        actions.push({ action: 'create', path: item.destPath, rel: relKey, target: item.target });
        nextOwnedFiles[relKey] = nextHash;
        if (!dryRun) {
          ensureDirTracked(path.dirname(item.destPath));
          fs.writeFileSync(item.destPath, item.content);
          createdFiles.push(item.destPath);
        }
        continue;
      }

      // Check existing content
      const currentBytes = fs.readFileSync(item.destPath);
      const currentHash = sha256Buffer(currentBytes);

      if (currentHash === nextHash) {
        actions.push({ action: 'unchanged', path: item.destPath, rel: relKey, target: item.target });
        nextOwnedFiles[relKey] = nextHash;
        continue;
      }

      const recordedHash = previousHashes[relKey];
      const isUserModified = !recordedHash || currentHash !== recordedHash;

      if (isUserModified && !force) {
        actions.push({
          action: 'skip-user-modified',
          path: item.destPath,
          rel: relKey,
          target: item.target,
        });
        continue;
      }

      const backupPath = assertSafeSubpath(backupRoot, relKey);
      actions.push({
        action: force && isUserModified ? 'force-replace-with-backup' : 'update-with-backup',
        path: item.destPath,
        rel: relKey,
        backupPath,
        target: item.target,
      });
      nextOwnedFiles[relKey] = nextHash;

      if (!dryRun) {
        ensureDirTracked(path.dirname(backupPath));
        fs.copyFileSync(item.destPath, backupPath);
        backedUpFiles.push({ destPath: item.destPath, backupPath });
        fs.writeFileSync(item.destPath, item.content);
      }
    }

    const lockPayload = {
      package: 'all-for-one',
      version: '2.0.0',
      scope: global ? 'global' : 'workspace',
      targets: plan.targets,
      commands: plan.availableCommands,
      syncedAt: new Date().toISOString(),
      ownedFiles: nextOwnedFiles,
    };

    if (!dryRun) {
      if (fs.existsSync(manifestPath)) {
        const manifestBackup = assertSafeSubpath(backupRoot, path.basename(manifestPath));
        ensureDirTracked(path.dirname(manifestBackup));
        fs.copyFileSync(manifestPath, manifestBackup);
        backedUpFiles.push({ destPath: manifestPath, backupPath: manifestBackup });
      }
      ensureDirTracked(path.dirname(manifestPath));
      fs.writeFileSync(manifestPath, JSON.stringify(lockPayload, null, 2) + '\n');
    }

    return {
      ok: true,
      dryRun,
      force,
      scope: global ? 'global' : 'workspace',
      targets: plan.targets,
      manifestPath,
      backupRoot: backedUpFiles.length > 0 ? backupRoot : null,
      actions,
      summary: {
        created: actions.filter((a) => a.action === 'create').length,
        updated: actions.filter(
          (a) => a.action === 'update-with-backup' || a.action === 'force-replace-with-backup',
        ).length,
        unchanged: actions.filter((a) => a.action === 'unchanged').length,
        skippedUserModified: actions.filter((a) => a.action === 'skip-user-modified').length,
      },
    };
  } catch (err) {
    // Rollback on failure!
    if (!dryRun) {
      for (const entry of backedUpFiles.reverse()) {
        if (fs.existsSync(entry.backupPath)) {
          fs.copyFileSync(entry.backupPath, entry.destPath);
        }
      }
      for (const created of createdFiles.reverse()) {
        if (fs.existsSync(created)) {
          fs.unlinkSync(created);
        }
      }
      for (const dir of createdDirs.reverse()) {
        try {
          if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
          }
        } catch {
          // Ignore non-empty dir cleanup errors during rollback
        }
      }
    }
    throw err;
  }
}

/**
 * Safely uninstalls ONLY package-owned files recorded in the manifest, preserving
 * user-modified files (unless `force: true`) and never deleting unrelated user files.
 */
export function safeUninstall({
  targetRoot,
  global = false,
  homeDir = os.homedir(),
  dryRun = false,
  force = false,
}) {
  const resolvedTargetRoot = validateDestinationRoot(global ? homeDir : targetRoot);
  const manifestPath = getManifestPath(resolvedTargetRoot, global);
  const manifest = readExistingManifest(manifestPath);

  if (!manifest || !manifest.ownedFiles || typeof manifest.ownedFiles !== 'object') {
    return {
      ok: true,
      dryRun,
      removed: [],
      skippedUserModified: [],
      message: 'No All For One installation manifest found; nothing removed.',
    };
  }

  const removed = [];
  const skippedUserModified = [];
  const candidateDirs = new Set();
  const remainingOwned = {};

  for (const [relKey, expectedHash] of Object.entries(manifest.ownedFiles)) {
    const absPath = assertSafeSubpath(resolvedTargetRoot, relKey);
    if (!fs.existsSync(absPath)) continue;

    const currentHash = sha256Buffer(fs.readFileSync(absPath));
    if (currentHash !== expectedHash && !force) {
      skippedUserModified.push(relKey);
      remainingOwned[relKey] = expectedHash;
      continue;
    }

    removed.push(relKey);
    if (!dryRun) {
      fs.unlinkSync(absPath);
      let dir = path.dirname(absPath);
      while (dir !== resolvedTargetRoot && dir.startsWith(resolvedTargetRoot + path.sep)) {
        candidateDirs.add(dir);
        dir = path.dirname(dir);
      }
    }
  }

  if (!dryRun) {
    // Prune only empty directories deepest-first
    const sortedDirs = [...candidateDirs].sort((a, b) => b.length - a.length);
    for (const d of sortedDirs) {
      try {
        if (fs.existsSync(d) && fs.readdirSync(d).length === 0) {
          fs.rmdirSync(d);
        }
      } catch {
        // Leave non-empty directories intact
      }
    }

    if (Object.keys(remainingOwned).length === 0) {
      if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    } else {
      manifest.ownedFiles = remainingOwned;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    }
  }

  return {
    ok: true,
    dryRun,
    removed,
    skippedUserModified,
    message:
      removed.length === 0
        ? 'No unmodified package-owned files were removed.'
        : `Safely removed ${removed.length} package-owned file(s).`,
  };
}
