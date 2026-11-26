import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { advanceFixedTimestep, createFixedTimestep } from '../assets/ecs/fixed-timestep.ts';
import { ObjectPool } from '../assets/ecs/object-pool.ts';
import { ResourceLifecycleTracker, runMicroBenchmark } from '../assets/ecs/resource-tracker.ts';
import {
  CollaborationCoordinator,
  createStandardCrazyPipeline,
  EXTENSION_HOOKS,
} from '../core/collaboration.ts';
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
import { LEDGER_FILES, ProductionMemoryLedger } from '../core/production-memory.ts';
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
// 1. Installer Safety (Section 11)
// ---------------------------------------------------------------------------

test('installer blocks path traversal, null bytes, and root directory deletion', () => {
  assert.throws(() => assertSafeSubpath('/tmp/safe-root', '../escape.txt'), /Path traversal blocked/);
  assert.throws(() => assertSafeSubpath('/tmp/safe-root', 'foo\0bar'), /Unsafe path rejected/);
  assert.throws(() => validateDestinationRoot(path.parse(process.cwd()).root), /filesystem root/);
});

test('installer dry-run makes zero filesystem mutations, preserves custom files, backs up, force-replaces, and uninstalls safely', () => {
  const tmpTarget = makeTempDir('afo-install-safety-');
  try {
    // Pre-create an unrelated user custom skill file that must NEVER be deleted
    const customDir = path.join(tmpTarget, '.claude', 'skills', 'my-custom-skill');
    fs.mkdirSync(customDir, { recursive: true });
    const customFile = path.join(customDir, 'SKILL.md');
    fs.writeFileSync(customFile, '# My Custom User Skill\n');

    // Dry-run must leave workspace untouched
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

    // Real install
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

    // Simulate user customizing an owned file
    const ownedSkill = path.join(tmpTarget, '.claude', 'skills', 'crazymaker', 'SKILL.md');
    fs.writeFileSync(ownedSkill, '# User Customized CrazyMaker\n');

    // Non-destructive re-install must skip user-modified file
    const res2 = safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: tmpTarget,
      target: 'claude',
      global: false,
    });
    assert.equal(res2.summary.skippedUserModified, 1);
    assert.equal(fs.readFileSync(ownedSkill, 'utf8'), '# User Customized CrazyMaker\n');

    // Force install must create backup before overwriting
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

    // Safe uninstall removes only package files and leaves user custom skill intact
    const uninstallRes = safeUninstall({ targetRoot: tmpTarget, global: false });
    assert.ok(uninstallRes.removed.length > 0);
    assert.equal(fs.existsSync(customFile), true);
    assert.equal(fs.existsSync(path.join(tmpTarget, '.claude/skills/crazy/SKILL.md')), false);
  } finally {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

test('installer performs atomic rollback on mid-install failure', () => {
  const tmpTarget = makeTempDir('afo-rollback-');
  try {
    // First install succeeds
    safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: tmpTarget,
      target: 'claude',
      global: false,
    });

    const targetFile = path.join(tmpTarget, '.claude', 'skills', 'crazymaker', 'SKILL.md');
    const originalContent = fs.readFileSync(targetFile, 'utf8');
    // Pre-modify an unrelated file to verify rollback doesn't touch it
    const userNote = path.join(tmpTarget, '.claude', 'skills', 'user-note.txt');
    fs.writeFileSync(userNote, 'keep-me');

    // Simulate failure mid-install
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
// 2. Collaboration Architecture (Section 3 & 13)
// ---------------------------------------------------------------------------

test('CollaborationCoordinator enforces DAG, anti-fabrication, handoffs, retries, and extensions', () => {
  const ctx = {
    projectId: 'proj-1',
    title: 'Neon Harbour',
    engine: 'threejs' as const,
    genre: 'open-world',
    createdAt: new Date().toISOString(),
    decisions: [],
    artifacts: {},
  };
  const coord = createStandardCrazyPipeline(ctx);

  // Extension hooks can be registered cleanly
  coord.registerSpecialist(EXTENSION_HOOKS.audio_engineering);
  assert.ok(coord.listSpecialists().some((s) => s.id === 'audio_engineering'));

  // Only T1 is ready initially
  assert.deepEqual(
    coord.getReadyTasks().map((t) => t.id),
    ['T1-GAME-DESIGN'],
  );
  assert.throws(() => coord.startTask('T2-VISUAL-AUDIO-SPEC'), /blocked/i);

  coord.startTask('T1-GAME-DESIGN');
  // Anti-fabrication guard rejects empty evidence
  assert.throws(
    () => coord.submitForReview('T1-GAME-DESIGN', { summary: '', timestamp: new Date().toISOString() }),
    /Anti-fabrication/,
  );

  coord.submitForReview('T1-GAME-DESIGN', {
    summary: 'Spec written with balancing formulas and 4 acceptance tests.',
    artifacts: ['PROJECT_BRIEF.md'],
    timestamp: new Date().toISOString(),
  });
  coord.reviewTask('T1-GAME-DESIGN', 'APPROVE', 'Design criteria complete.');
  const handoff = coord.handoff('T1-GAME-DESIGN', 'T2-VISUAL-AUDIO-SPEC', 'Proceed with look-dev.');
  assert.equal(handoff.toSpecialist, 'crazydesigner');

  // T2 now unlocked
  assert.deepEqual(
    coord.getReadyTasks().map((t) => t.id),
    ['T2-VISUAL-AUDIO-SPEC'],
  );

  // Test retry exhaustion on T2
  coord.startTask('T2-VISUAL-AUDIO-SPEC');
  coord.recordFailure('T2-VISUAL-AUDIO-SPEC', 'Attempt 1 missing lighting metrics');
  coord.startTask('T2-VISUAL-AUDIO-SPEC');
  coord.recordFailure('T2-VISUAL-AUDIO-SPEC', 'Attempt 2 missing audio spec');
  coord.startTask('T2-VISUAL-AUDIO-SPEC');
  const finalFail = coord.recordFailure('T2-VISUAL-AUDIO-SPEC', 'Attempt 3 exhausted');
  assert.equal(finalFail.canRetry, false);
  assert.equal(finalFail.task.status, 'FAILED');
});

test('CollaborationCoordinator detects dependency cycles', () => {
  const coord = new CollaborationCoordinator({
    projectId: 'p',
    title: 'Cycle Test',
    engine: 'unity',
    genre: 'rpg',
    createdAt: new Date().toISOString(),
    decisions: [],
    artifacts: {},
  });
  coord.addTask({
    id: 'A',
    assignedSpecialist: 'crazymaker',
    objective: 'A',
    requiredInputs: [],
    expectedOutputs: [],
    dependencies: ['B'],
    acceptanceCriteria: ['x'],
  });
  assert.throws(
    () =>
      coord.addTask({
        id: 'B',
        assignedSpecialist: 'crazycoder',
        objective: 'B',
        requiredInputs: [],
        expectedOutputs: [],
        dependencies: ['A'],
        acceptanceCriteria: ['y'],
      }),
    /cycle detected/i,
  );
});

// ---------------------------------------------------------------------------
// 3. Engine-Aware Profiles (Section 4)
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
// 4. Production Intelligence, Quality Bars, Memory Ledger & Render Safety (Sec 17)
// ---------------------------------------------------------------------------

test('ContinuousImprovementEngine enforces stop conditions and hardware limits', () => {
  const constrained = detectHardwareProfile({ cpuCores: 2, totalMemoryMb: 2048, freeMemoryMb: 1024 });
  assert.equal(constrained.tier, 'constrained');
  assert.equal(constrained.recommendedMaxParallelJobs, 1);

  const loop = new ContinuousImprovementEngine(0.5, {
    qualityThreshold: 0.85,
    maxStaleStreak: 2,
    minDelta: 0.05,
  }, constrained, 1000);

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

  // Stale iterations stop endless churn
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
    const first = mgr.commitOutputSafe(tmpDir, 'renders/shot01.png', Buffer.from('PNGDATA_V1'), inputHash1, 'preview-done');
    assert.equal(first.backedUpTo, null);
    assert.equal(mgr.isOutputStale('renders/shot01.png', inputHash1, tmpDir), false);

    // Interrupted job detection
    const interrupted = mgr.detectInterruptedCheckpoints();
    assert.equal(interrupted.interrupted, true);
    assert.deepEqual(interrupted.completedCheckpoints, ['preview-done']);

    // Input changed -> stale -> new commit backs up old file
    const inputHash2 = hashInputs(['scene-v2']);
    assert.equal(mgr.isOutputStale('renders/shot01.png', inputHash2, tmpDir), true);
    const second = mgr.commitOutputSafe(tmpDir, 'renders/shot01.png', Buffer.from('PNGDATA_V2'), inputHash2, 'final-done');
    assert.ok(second.backedUpTo && fs.existsSync(second.backedUpTo));
    assert.equal(fs.readFileSync(second.backedUpTo, 'utf8'), 'PNGDATA_V1');

    mgr.markJobState('COMPLETED');
    assert.equal(mgr.detectInterruptedCheckpoints().interrupted, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ProductionMemoryLedger initializes all 7 records and tracks failed approaches', () => {
  const tmpDir = makeTempDir('afo-ledger-');
  try {
    const ledger = new ProductionMemoryLedger(tmpDir);
    ledger.initLedger({
      projectName: 'Skyline Courier',
      engine: 'godot',
      genre: 'open-world',
      objective: 'Build rooftop traversal slice',
      qualityStandards: ['60 FPS target'],
      visualReferences: ['Dusk storm palette'],
    });
    assert.deepEqual(ledger.listLedgerFiles(), [...LEDGER_FILES]);

    ledger.recordFailedApproach('naive-raycast-each-frame', 'Caused 4ms stall per 50 NPCs');
    assert.equal(ledger.hasFailedApproach('naive-raycast-each-frame'), true);
    assert.equal(ledger.hasFailedApproach('never-tried'), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. Task-Based Knowledge Retrieval (Section 17H)
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
  // Must NOT load Three.js-only engine doc when targeting Unreal 5
  assert.equal(
    ueLighting.selected.some((d) => d.entry.id === 'engines/threejs'),
    false,
  );
});

// ---------------------------------------------------------------------------
// 6. CRAZY QA Verification & 120-Case Eval Suite (Sections 8 & 9)
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

test('Evaluation V2 suite contains >= 100 cases and passes 100% deterministic policy checks', () => {
  const evalReport = runEvaluationSuiteV2(ROOT_DIR);
  assert.ok(evalReport.totalCases >= 100, `Expected >= 100 cases, got ${evalReport.totalCases}`);
  assert.equal(evalReport.liveModelEvaluationStatus, 'UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER');
  const failed = evalReport.results.filter((r) => !r.passed);
  assert.equal(
    evalReport.passedCases,
    evalReport.totalCases,
    `Failed eval cases: ${JSON.stringify(failed.slice(0, 5), null, 2)}`,
  );
});

// ---------------------------------------------------------------------------
// 7. Reusable Engineering Library (Section 10)
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
