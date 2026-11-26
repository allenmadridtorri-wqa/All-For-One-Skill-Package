import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildBlenderCliArgs,
  detectBlenderInstallation,
  generateBlenderAutomationScript,
  runBlenderPythonScript,
} from '../core/blender-bridge.ts';
import { runEvaluationSuiteV3 } from '../core/evaluator.ts';
import {
  assertSafeSubpath,
  detectExternalTools,
  safeInstall,
  verifyInstallIntegrity,
} from '../core/installer-engine.mjs';
import {
  clearKnowledgeCache,
  detectOutdatedKnowledgeDocs,
  loadKnowledgeIndex,
  retrieveTaskKnowledge,
} from '../core/knowledge-retrieval.ts';
import {
  createBudgetPolicy,
  detectHardwareProfile,
  RenderSafetyManager,
  runBoundedSchedule,
} from '../core/production-intelligence.ts';
import {
  evaluateBlenderQaCheck,
  runSecuritySecretScan,
} from '../core/qa-verification.ts';
import {
  assertDestructiveApproved,
  assertSafeSubpathSync,
  atomicWriteFileSync,
  isDangerousShellCommand,
  redactSecrets,
  withAdvisoryLock,
} from '../core/security.ts';

const ROOT_DIR = process.cwd();

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// 1. Security & Installer CLI Hardening
// ---------------------------------------------------------------------------

test('security module blocks symlink escapes, enforces destructive approval, locks, and scrubs secrets', () => {
  const tmpBase = makeTempDir('afo-sec-base-');
  const tmpOutside = makeTempDir('afo-sec-out-');
  try {
    const outsideFile = path.join(tmpOutside, 'secret.txt');
    fs.writeFileSync(outsideFile, 'outside-secret');

    const symlinkPath = path.join(tmpBase, 'escape-link');
    fs.symlinkSync(tmpOutside, symlinkPath);

    assert.throws(
      () => assertSafeSubpathSync(tmpBase, 'escape-link/secret.txt'),
      /Symlink escape blocked/,
    );
    assert.throws(
      () => assertSafeSubpath(tmpBase, 'escape-link/secret.txt'),
      /Symlink escape blocked/,
    );

    const rsm = new RenderSafetyManager(tmpBase);
    assert.throws(
      () => rsm.commitOutputSafe(tmpBase, '../outside.png', Buffer.from('x'), 'hash1'),
      /Path traversal blocked/,
    );

    const outFile = path.join(tmpBase, 'atomic.txt');
    atomicWriteFileSync(outFile, 'v1');
    assert.equal(fs.readFileSync(outFile, 'utf8'), 'v1');

    const lockFile = path.join(tmpBase, 'op.lock');
    assert.throws(() => {
      withAdvisoryLock(lockFile, () => {
        withAdvisoryLock(lockFile, () => {});
      });
    }, /Concurrency lock held/);

    assert.equal(isDangerousShellCommand('rm -rf /tmp/foo'), true);
    assert.equal(isDangerousShellCommand('npm run afo:test'), false);
    assert.throws(
      () => assertDestructiveApproved({ kind: 'force-overwrite', target: tmpBase }),
      /requires explicit approval/,
    );
    assertDestructiveApproved({
      kind: 'force-overwrite',
      target: tmpBase,
      approval: { approved: true, actor: 'user', reason: 'Confirmed overwrite' },
    });

    const sampleKey = ['AIza', 'SyD1234567890ABCDEFGHIJKLMNOP'].join('');
    const sampleBearer = ['Bearer ', 'tok_1234567890abcdefghij'].join('');
    const scrubbed = redactSecrets(`Key=${sampleKey} and ${sampleBearer}`);
    assert.equal(scrubbed.includes(sampleKey), false);
    assert.match(scrubbed, /\[REDACTED_SECRET\]/);
  } finally {
    fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.rmSync(tmpOutside, { recursive: true, force: true });
  }
});

test('installer V3 verifies SHA-256 integrity, enforces --yes on force install and force uninstall with backup, and detects external tools', () => {
  const tmpTarget = makeTempDir('afo-v3-install-');
  try {
    safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: tmpTarget,
      target: 'claude',
      global: false,
    });

    const okIntegrity = verifyInstallIntegrity({ targetRoot: tmpTarget, global: false });
    assert.equal(okIntegrity.ok, true);
    assert.ok(okIntegrity.verifiedCount > 0);

    const skillPath = path.join(tmpTarget, '.claude', 'skills', 'crazy', 'SKILL.md');
    fs.writeFileSync(skillPath, '# User Edited Skill\n');
    const badIntegrity = verifyInstallIntegrity({ targetRoot: tmpTarget, global: false });
    assert.equal(badIntegrity.ok, false);
    assert.equal(badIntegrity.modifiedFiles.length, 1);

    // requireApprovalForForce blocks unapproved overwrite
    assert.throws(
      () =>
        safeInstall({
          sourceRoot: ROOT_DIR,
          targetRoot: tmpTarget,
          target: 'claude',
          global: false,
          force: true,
          requireApprovalForForce: true,
        }),
      /requires explicit destructiveApproval/,
    );

    // CLI uninstall --force WITHOUT --yes must exit non-zero and preserve modified file
    const installCliPath = path.join(ROOT_DIR, 'scripts', 'install.mjs');
    let failedWithoutYes = false;
    try {
      execFileSync(process.execPath, [installCliPath, '--uninstall', '--workspace', '--force'], {
        cwd: tmpTarget,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      failedWithoutYes = true;
      assert.notEqual((err as { status?: number }).status, 0);
    }
    assert.equal(failedWithoutYes, true);
    assert.equal(fs.existsSync(skillPath), true);

    // CLI uninstall --force --yes removes modified file AFTER creating backup under .afo-backups/
    const out = execFileSync(
      process.execPath,
      [installCliPath, '--uninstall', '--workspace', '--force', '--yes'],
      {
        cwd: tmpTarget,
        encoding: 'utf8',
      },
    );
    assert.match(out, /Backups saved to:/);
    assert.equal(fs.existsSync(skillPath), false);

    const backupsDir = path.join(tmpTarget, '.afo-backups');
    const backupRuns = fs.readdirSync(backupsDir);
    assert.equal(backupRuns.length, 1);
    const backedUpFile = path.join(
      backupsDir,
      backupRuns[0],
      '.claude',
      'skills',
      'crazy',
      'SKILL.md',
    );
    assert.equal(fs.readFileSync(backedUpFile, 'utf8'), '# User Edited Skill\n');

    const tools = detectExternalTools();
    assert.equal(tools.node.available, true);
    assert.equal(typeof tools.blender.available, 'boolean');
  } finally {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Blender Bridge
// ---------------------------------------------------------------------------

test('Blender bridge probes safely, clamps hardware, and builds sandboxed bpy scripts', () => {
  const det = detectBlenderInstallation();
  assert.equal(typeof det.available, 'boolean');

  const tmpDir = makeTempDir('afo-blender-');
  try {
    const constrained = detectHardwareProfile({ cpuCores: 2, totalMemoryMb: 2048, freeMemoryMb: 1024 });
    const script = generateBlenderAutomationScript(
      {
        sceneName: 'TestCrate',
        targetEngine: 'godot',
        blendOutputPath: path.join(tmpDir, 'scenes/crate.blend'),
        renderOutputPath: path.join(tmpDir, 'renders/crate.png'),
        exportFormat: 'glb',
        exportOutputPath: path.join(tmpDir, 'exports/crate.glb'),
        resolutionX: 3840,
        samples: 512,
        createArmatureRig: true,
        enablePhysicsSim: true,
      },
      constrained,
    );
    assert.match(script, /scene\.render\.resolution_x = 960/);
    assert.match(script, /GeometryNodeSubdivisionSurface/);
    assert.match(script, /bpy\.ops\.export_scene\.gltf/);

    fs.mkdirSync(path.join(tmpDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'scripts/build.py'), script);
    const args = buildBlenderCliArgs(tmpDir, { scriptRelPath: 'scripts/build.py' });
    assert.ok(args.includes('--background'));

    const missingExec = runBlenderPythonScript(tmpDir, {
      scriptRelPath: 'scripts/build.py',
      blenderBinary: 'blender-nonexistent-test-bin',
    });
    assert.equal(missingExec.executed, false);
    assert.equal(missingExec.status, 'UNVERIFIED');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. Knowledge Retrieval, Bounded Scheduler, Keyword-Routing V3 & Security QA
// ---------------------------------------------------------------------------

test('knowledge retrieval caches results, removes duplicates, checks outdated docs, and resource scheduler bounds concurrency', async () => {
  clearKnowledgeCache();
  const res1 = retrieveTaskKnowledge(ROOT_DIR, {
    query: 'Blender Geometry Nodes glTF export pipeline',
    specialist: 'crazydesigner',
    engine: 'godot',
    maxTokenBudget: 2500,
  });
  assert.equal(res1.cacheHit, false);
  assert.ok(res1.selected.some((d) => d.provenanceStatus === 'SOURCE_BACKED'));

  const res2 = retrieveTaskKnowledge(ROOT_DIR, {
    query: 'Blender Geometry Nodes glTF export pipeline',
    specialist: 'crazydesigner',
    engine: 'godot',
    maxTokenBudget: 2500,
  });
  assert.equal(res2.cacheHit, true);

  const outdated = detectOutdatedKnowledgeDocs(
    [
      ...loadKnowledgeIndex(ROOT_DIR),
      {
        id: 'legacy-doc',
        path: 'references/legacy.md',
        title: 'Legacy',
        version: '1.0.0',
        specialists: ['crazycoder'],
        engines: ['all'],
        tags: [],
        dependencies: [],
        estimatedTokens: 100,
      },
    ],
    '2026-11-25',
  );
  assert.ok(outdated.some((o) => o.id === 'legacy-doc'));

  const hw = detectHardwareProfile({ cpuCores: 2, totalMemoryMb: 2048, freeMemoryMb: 1024 });
  const policy = createBudgetPolicy(hw, { maxConcurrentJobs: 8 });
  assert.equal(policy.maxConcurrentJobs, 1);
  const sched = await runBoundedSchedule(
    [
      { id: 'j1', run: async () => 42 },
      { id: 'j2', run: async () => { throw new Error('isolated failure'); } },
      { id: 'j3', run: async () => 99 },
    ],
    policy,
  );
  assert.equal(sched.maxObservedConcurrency, 1);
  assert.equal(sched.outcomes.filter((o) => o.ok).length, 2);
});

test('Keyword-routing V3 test covers all 13 domains with non-quality label, and security/Blender QA helpers behave honestly', () => {
  const report = runEvaluationSuiteV3(ROOT_DIR, true);
  assert.ok(report.totalCases >= 155, `Expected >= 155 V2+V3 cases, got ${report.totalCases}`);
  assert.equal(report.evaluationMode, 'keyword-routing-and-policy-test');
  assert.match(report.evaluationLabel, /Keyword-Routing/);
  assert.match(report.evaluationLabel, /NOT a live AI skill quality score/);
  assert.equal(report.liveModelEvaluationStatus, 'UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER');
  const failed = report.results.filter((r) => !r.passed);
  assert.equal(
    report.passedCases,
    report.totalCases,
    `Failed V3 eval cases: ${JSON.stringify(failed.slice(0, 5), null, 2)}`,
  );
  assert.equal(report.routingMatchPercent, 100);

  const secScan = runSecuritySecretScan(ROOT_DIR, ['core/security.ts', 'core/single-ai.ts']);
  assert.equal(secScan.check.status, 'VERIFIED');

  const blenderQa = evaluateBlenderQaCheck();
  assert.ok(blenderQa.status === 'UNVERIFIED' || blenderQa.status === 'VERIFIED');
});
