import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { advanceFixedTimestep, createFixedTimestep } from '../assets/ecs/fixed-timestep.ts';
import { ObjectPool } from '../assets/ecs/object-pool.ts';
import { ResourceLifecycleTracker, runMicroBenchmark } from '../assets/ecs/resource-tracker.ts';
import {
  detectEngineFromText,
  ENGINE_PROFILES,
  validateEngineCompatibility,
} from '../core/engine-profiles.ts';
import { runEvaluationSuiteV2 } from '../core/evaluator.ts';
import {
  assertSafeSubpath,
  safeInstall,
  safeUninstall,
  validateDestinationRoot,
} from '../core/installer-engine.mjs';
import { retrieveTaskKnowledge } from '../core/knowledge-retrieval.ts';
import {
  compareVariants,
  ContinuousImprovementEngine,
  createQualityContract,
  detectHardwareProfile,
  evaluateQualityContract,
  hashInputs,
  RenderSafetyManager,
} from '../core/production-intelligence.ts';
import {
  aggregateOverallStatus,
  buildVerificationReport,
  formatVerificationReportMarkdown,
  verifyVisualEvidenceFile,
} from '../core/qa-verification.ts';

const ROOT_DIR = process.cwd();

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// 1. Installer Safety & Force Uninstall Backup
// ---------------------------------------------------------------------------

test('installer blocks path traversal, null bytes, and root directory deletion', () => {
  assert.throws(() => assertSafeSubpath('/tmp/safe-root', '../escape.txt'), /Path traversal blocked/);
  assert.throws(() => assertSafeSubpath('/tmp/safe-root', 'foo\0bar'), /Unsafe path rejected/);
  assert.throws(() => validateDestinationRoot(path.parse(process.cwd()).root), /filesystem root/);
});

test('installer dry-run makes zero filesystem mutations, preserves custom files, backs up, force-replaces, and uninstalls safely', () => {
  const tmpTarget = makeTempDir('afo-install-safety-');
  try {
    const customDir = path.join(tmpTarget, '.claude', 'skills', 'my-custom-skill');
    fs.mkdirSync(customDir, { recursive: true });
    const customFile = path.join(customDir, 'SKILL.md');
    fs.writeFileSync(customFile, '# My Custom User Skill\n');

    const dryRes = safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: tmpTarget,
      target: 'all',
      global: false,
      dryRun: true,
    });
    assert.equal(dryRes.dryRun, true);
    assert.ok(dryRes.summary.created > 0);
    assert.equal(fs.existsSync(path.join(tmpTarget, 'oneskill.lock.json')), false);

    const res1 = safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: tmpTarget,
      target: 'all',
      global: false,
    });
    assert.equal(res1.ok, true);
    assert.equal(fs.existsSync(customFile), true);
    assert.equal(fs.readFileSync(customFile, 'utf8'), '# My Custom User Skill\n');
    assert.equal(fs.existsSync(path.join(tmpTarget, '.claude/skills/crazyqa/SKILL.md')), true);

    const ownedSkill = path.join(tmpTarget, '.claude', 'skills', 'crazymaker', 'SKILL.md');
    fs.writeFileSync(ownedSkill, '# User Customized CrazyMaker\n');

    const res2 = safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: tmpTarget,
      target: 'claude',
      global: false,
    });
    assert.equal(res2.summary.skippedUserModified, 1);
    assert.equal(fs.readFileSync(ownedSkill, 'utf8'), '# User Customized CrazyMaker\n');

    const res3 = safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: tmpTarget,
      target: 'claude',
      global: false,
      force: true,
    });
    assert.equal(res3.summary.updated, 1);
    assert.ok(res3.backupRoot && fs.existsSync(res3.backupRoot));
    const backedUpCustom = path.join(res3.backupRoot, '.claude', 'skills', 'crazymaker', 'SKILL.md');
    assert.equal(fs.existsSync(backedUpCustom), true);
    assert.equal(fs.readFileSync(backedUpCustom, 'utf8'), '# User Customized CrazyMaker\n');

    // Modify again and test safeUninstall without force (preserves) vs with force + approval (backs up then removes)
    fs.writeFileSync(ownedSkill, '# User Modified Before Uninstall\n');
    const safeU = safeUninstall({ targetRoot: tmpTarget, global: false });
    assert.ok(safeU.skippedUserModified.includes('.claude/skills/crazymaker/SKILL.md'));
    assert.equal(fs.existsSync(ownedSkill), true);

    assert.throws(
      () =>
        safeUninstall({
          targetRoot: tmpTarget,
          global: false,
          force: true,
          requireApprovalForForce: true,
        }),
      /requires explicit destructiveApproval/,
    );

    const forceU = safeUninstall({
      targetRoot: tmpTarget,
      global: false,
      force: true,
      requireApprovalForForce: true,
      destructiveApproval: { approved: true, actor: 'test', reason: 'test force uninstall' },
    });
    assert.equal(fs.existsSync(ownedSkill), false);
    assert.ok(forceU.backupRoot && fs.existsSync(forceU.backupRoot));
    const backedUpUninstalled = path.join(
      forceU.backupRoot,
      '.claude',
      'skills',
      'crazymaker',
      'SKILL.md',
    );
    assert.equal(fs.readFileSync(backedUpUninstalled, 'utf8'), '# User Modified Before Uninstall\n');
    assert.equal(fs.existsSync(customFile), true);
  } finally {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

test('installer performs atomic rollback on mid-install failure', () => {
  const tmpTarget = makeTempDir('afo-rollback-');
  try {
    safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: tmpTarget,
      target: 'claude',
      global: false,
    });

    const targetFile = path.join(tmpTarget, '.claude', 'skills', 'crazymaker', 'SKILL.md');
    const originalContent = fs.readFileSync(targetFile, 'utf8');
    const userNote = path.join(tmpTarget, '.claude', 'skills', 'user-note.txt');
    fs.writeFileSync(userNote, 'keep-me');

    assert.throws(
      () =>
        safeInstall({
          sourceRoot: ROOT_DIR,
          targetRoot: tmpTarget,
          target: 'all',
          global: false,
          simulateFailureAtIndex: 5,
        }),
      /Simulated write failure/,
    );

    assert.equal(fs.readFileSync(targetFile, 'utf8'), originalContent);
    assert.equal(fs.readFileSync(userNote, 'utf8'), 'keep-me');
    assert.equal(fs.existsSync(path.join(tmpTarget, '.agents/skills/crazy/SKILL.md')), false);
  } finally {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Engine-Aware Profiles
// ---------------------------------------------------------------------------

test('Engine profiles cover all 6 engines and enforce API isolation', () => {
  assert.deepEqual(Object.keys(ENGINE_PROFILES).sort(), [
    'cpp-native',
    'godot',
    'rust',
    'threejs',
    'unity',
    'unreal5',
  ]);
  assert.equal(detectEngineFromText('Build a Lumen scene in UE5 C++'), 'unreal5');
  assert.equal(detectEngineFromText('Optimize Bevy ECS WGSL shaders in Rust'), 'rust');

  const ueViolations = validateEngineCompatibility('unreal5', `import * as THREE from 'three';`);
  assert.equal(ueViolations.length, 1);
  assert.equal(ueViolations[0].foreignEngine, 'threejs');

  const threeViolations = validateEngineCompatibility('threejs', `UCLASS() class AHero : public AActor {};`);
  assert.equal(threeViolations.length, 1);
});

// ---------------------------------------------------------------------------
// 3. Production Intelligence & Render Safety
// ---------------------------------------------------------------------------

test('ContinuousImprovementEngine enforces stop conditions and hardware limits', () => {
  const constrained = detectHardwareProfile({ cpuCores: 2, totalMemoryMb: 2048, freeMemoryMb: 1024 });
  assert.equal(constrained.tier, 'constrained');
  assert.equal(constrained.recommendedMaxParallelJobs, 1);

  const loop = new ContinuousImprovementEngine(
    0.5,
    {
      qualityThreshold: 0.85,
      maxStaleStreak: 2,
      minDelta: 0.05,
    },
    constrained,
    1000,
  );

  const r1 = loop.recordIteration(
    {
      domain: 'shaders',
      hypothesis: 'Add ACES exposure curve',
      weaknessesIdentified: ['Blown highlights'],
      changesApplied: ['Set ACESFilmicToneMapping'],
      measuredScore: 0.72,
    },
    2000,
  );
  assert.equal(r1.record.accepted, true);
  assert.equal(r1.status, 'RUNNING');

  loop.recordIteration(
    {
      domain: 'shaders',
      hypothesis: 'Micro tweak 1',
      weaknessesIdentified: ['Minor noise'],
      changesApplied: ['Adjusted grain'],
      measuredScore: 0.73,
    },
    3000,
  );
  const r3 = loop.recordIteration(
    {
      domain: 'shaders',
      hypothesis: 'Micro tweak 2',
      weaknessesIdentified: ['Minor noise'],
      changesApplied: ['Adjusted vignette'],
      measuredScore: 0.73,
    },
    4000,
  );
  assert.equal(r3.status, 'NO_MEASURABLE_IMPROVEMENT');
  assert.equal(loop.canContinue(5000).ok, false);
});

test('Variant comparison and QualityContract enforce evidence-backed decisions', () => {
  const cmp = compareVariants(
    [
      {
        id: 'v1',
        label: 'PBR Clustered Forward+',
        approachSummary: 'Single-pass forward lighting',
        scores: { visual: 0.9, performance: 0.85, maintainability: 0.8 },
        tradeOffs: ['Higher shader complexity'],
      },
      {
        id: 'v2',
        label: 'Unlit Baked Fallback',
        approachSummary: 'Flat lightmaps',
        scores: { visual: 0.45, performance: 0.95, maintainability: 0.9 },
        tradeOffs: ['No dynamic speculars'],
      },
    ],
    { visual: 0.5, performance: 0.3, maintainability: 0.2 },
  );
  assert.equal(cmp.winnerId, 'v1');
  assert.match(cmp.selectionRationale, /PBR Clustered Forward\+/);

  const contract = createQualityContract('p1', 'threejs', 'rpg', ['Save/Load works']);
  const partial = evaluateQualityContract(contract, [
    { targetId: 'FUNC-CORE-TESTS', measuredValue: '12/12 passed', passed: true },
  ]);
  assert.equal(partial.allRequiredPassed, false);
  assert.ok(partial.unmeasured.includes('VIS-PIPELINE'));
});

test('RenderSafetyManager tracks stale outputs, checkpoints, and backs up overwritten renders', () => {
  const tmpDir = makeTempDir('afo-render-safe-');
  try {
    const mgr = new RenderSafetyManager(tmpDir);
    const inputHash1 = hashInputs(['scene-v1']);
    const first = mgr.commitOutputSafe(
      tmpDir,
      'renders/shot01.png',
      Buffer.from('PNGDATA_V1'),
      inputHash1,
      'preview-done',
    );
    assert.equal(first.backedUpTo, null);
    assert.equal(mgr.isOutputStale('renders/shot01.png', inputHash1, tmpDir), false);

    const interrupted = mgr.detectInterruptedCheckpoints();
    assert.equal(interrupted.interrupted, true);
    assert.deepEqual(interrupted.completedCheckpoints, ['preview-done']);

    const inputHash2 = hashInputs(['scene-v2']);
    assert.equal(mgr.isOutputStale('renders/shot01.png', inputHash2, tmpDir), true);
    const second = mgr.commitOutputSafe(
      tmpDir,
      'renders/shot01.png',
      Buffer.from('PNGDATA_V2'),
      inputHash2,
      'final-done',
    );
    assert.ok(second.backedUpTo && fs.existsSync(second.backedUpTo));
    assert.equal(fs.readFileSync(second.backedUpTo, 'utf8'), 'PNGDATA_V1');

    mgr.markJobState('COMPLETED');
    assert.equal(mgr.detectInterruptedCheckpoints().interrupted, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Task-Based Knowledge Retrieval
// ---------------------------------------------------------------------------

test('retrieveTaskKnowledge respects engine filtering and token budgets', () => {
  const ueLighting = retrieveTaskKnowledge(ROOT_DIR, {
    query: 'Lumen lighting ACES PBR materials',
    specialist: 'crazydesigner',
    engine: 'unreal5',
    maxTokenBudget: 2500,
    maxDocs: 4,
  });
  assert.ok(ueLighting.selected.length >= 1);
  assert.ok(ueLighting.totalTokensLoaded <= 2500);
  assert.ok(ueLighting.tokenSavingsPercent >= 50);
  assert.equal(
    ueLighting.selected.some((d) => d.entry.id === 'engines/threejs'),
    false,
  );
});

// ---------------------------------------------------------------------------
// 5. CRAZY QA Verification & Keyword-Routing V2 Suite
// ---------------------------------------------------------------------------

test('CRAZY QA verifies screenshot existence and enforces strict status precedence', () => {
  const tmpDir = makeTempDir('afo-qa-');
  try {
    const missing = verifyVisualEvidenceFile(tmpDir, 'shots/missing.png', ['Lighting balanced']);
    assert.equal(missing.status, 'UNVERIFIED');

    fs.mkdirSync(path.join(tmpDir, 'shots'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'shots/valid.png'), Buffer.alloc(256, 0x42));
    const ok = verifyVisualEvidenceFile(tmpDir, 'shots/valid.png', ['Lighting balanced']);
    assert.equal(ok.status, 'VERIFIED');

    const report = buildVerificationReport(
      'Demo',
      [
        {
          id: 'C1',
          category: 'unit-test',
          description: 'Core unit tests',
          status: 'VERIFIED',
          commandOrSource: 'tsx --test',
          evidence: '10/10 passed',
        },
        {
          id: 'C2',
          category: 'runtime',
          description: 'External engine binary',
          status: 'UNVERIFIED',
          commandOrSource: 'ue5-editor',
          evidence: 'Not installed in container',
        },
      ],
      [ok],
    );
    assert.equal(aggregateOverallStatus(report.checks, report.visualChecks), 'PARTIALLY_VERIFIED');
    const md = formatVerificationReportMarkdown(report);
    assert.match(md, /PARTIALLY_VERIFIED/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Keyword-routing V2 suite contains >= 100 cases, carries explicit non-quality label, and matches 100%', () => {
  const evalReport = runEvaluationSuiteV2(ROOT_DIR);
  assert.ok(evalReport.totalCases >= 100, `Expected >= 100 cases, got ${evalReport.totalCases}`);
  assert.equal(evalReport.evaluationMode, 'keyword-routing-and-policy-test');
  assert.match(evalReport.evaluationLabel, /Keyword-Routing/);
  assert.match(evalReport.evaluationLabel, /NOT a live AI skill quality score/);
  assert.equal(evalReport.liveModelEvaluationStatus, 'UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER');
  const failed = evalReport.results.filter((r) => !r.passed);
  assert.equal(
    evalReport.passedCases,
    evalReport.totalCases,
    `Failed eval cases: ${JSON.stringify(failed.slice(0, 5), null, 2)}`,
  );
  assert.equal(evalReport.routingMatchPercent, 100);
});

// ---------------------------------------------------------------------------
// 6. Reusable Engineering Library
// ---------------------------------------------------------------------------

test('ResourceLifecycleTracker detects leaks and micro-benchmark measures ops/sec', () => {
  const tracker = new ResourceLifecycleTracker();
  let disposedCount = 0;
  tracker.track('geo-1', 'geometry', () => {
    disposedCount += 1;
  });
  tracker.track('tex-1', 'texture', () => {
    disposedCount += 1;
  });
  assert.equal(tracker.detectLeaks().length, 2);
  tracker.disposeOne('geo-1');
  assert.equal(tracker.detectLeaks().length, 1);
  const res = tracker.disposeAll();
  assert.equal(res.disposedCount, 1);
  assert.equal(disposedCount, 2);
  assert.equal(tracker.detectLeaks().length, 0);

  const pool = new ObjectPool(256, () => ({ x: 0, y: 0 }));
  const bench = runMicroBenchmark('ObjectPool acquire+release', 5000, () => {
    const idx = pool.acquireIndex();
    if (idx >= 0) pool.release(idx);
  });
  assert.equal(bench.iterations, 5000);
  assert.ok(bench.opsPerSec > 0);
});

test('fixed-timestep simulation stays mathematically stable across 60 steps', () => {
  const loop = createFixedTimestep({ fixedDt: 1 / 60, maxFrameDt: 0.1, maxSubsteps: 5 });
  let simTime = 0;
  advanceFixedTimestep(loop, 0, () => {});
  for (let frame = 1; frame <= 60; frame++) {
    advanceFixedTimestep(loop, frame * (1000 / 60), (dt) => {
      simTime += dt;
    });
  }
  assert.ok(Math.abs(simTime - 1.0) <= 1 / 60 + 1e-6, `Expected ~1.0s simTime, got ${simTime}`);
});
