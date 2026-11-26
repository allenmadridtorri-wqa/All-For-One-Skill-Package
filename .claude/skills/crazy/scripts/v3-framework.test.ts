import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateExportedAsset } from '../core/asset-pipeline.ts';
import {
  buildBlenderCliArgs,
  detectBlenderInstallation,
  generateBlenderAutomationScript,
  runBlenderPythonScript,
} from '../core/blender-bridge.ts';
import {
  CollaborationCoordinator,
  decomposeGoalIntoTasks,
} from '../core/collaboration.ts';
import {
  analyzeProjectDependencies,
  checkApiAndVersionCompatibility,
  diagnoseErrorLog,
  reviewCodeSnippet,
  SOFTWARE_STACK_PROFILES,
} from '../core/engineering-intelligence.ts';
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
import { createModelAdapter } from '../core/model-adapter.ts';
import {
  createBudgetPolicy,
  detectHardwareProfile,
  RenderSafetyManager,
  runBoundedSchedule,
} from '../core/production-intelligence.ts';
import { ProductionMemoryLedger } from '../core/production-memory.ts';
import {
  evaluateBlenderQaCheck,
  evaluateExportedAssetQaCheck,
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
import {
  inspectVisualRender,
  VisualIterationController,
} from '../core/visual-iteration.ts';

const ROOT_DIR = process.cwd();

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createValidGlbBuffer(options: { includeUvs?: boolean; nonUnitScale?: boolean } = {}): Buffer {
  const gltfJson = {
    asset: { version: '2.0', generator: 'AFO-Test' },
    meshes: [
      {
        name: 'HeroCube',
        primitives: [
          {
            attributes: options.includeUvs === false
              ? { POSITION: 0, NORMAL: 1 }
              : { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
            material: 0,
          },
        ],
      },
    ],
    materials: [{ name: 'SteelPBR', pbrMetallicRoughness: { metallicFactor: 0.9, roughnessFactor: 0.35 } }],
    nodes: [{ name: 'HeroCube', mesh: 0, scale: options.nonUnitScale ? [2, 1, 1] : [1, 1, 1] }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  while (jsonBuf.length % 4 !== 0) {
    jsonBuf = Buffer.concat([jsonBuf, Buffer.from(' ')]);
  }
  const totalLen = 12 + 8 + jsonBuf.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); // glTF
  header.writeUInt32LE(2, 4); // version 2
  header.writeUInt32LE(totalLen, 8);
  header.writeUInt32LE(jsonBuf.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16); // JSON
  return Buffer.concat([header, jsonBuf]);
}

// ---------------------------------------------------------------------------
// 1. Security & Reliability Tests (Section 7)
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

    // RenderSafetyManager also blocks traversal
    const rsm = new RenderSafetyManager(tmpBase);
    assert.throws(
      () => rsm.commitOutputSafe(tmpBase, '../outside.png', Buffer.from('x'), 'hash1'),
      /Path traversal blocked/,
    );

    // Atomic write & advisory locking
    const outFile = path.join(tmpBase, 'atomic.txt');
    atomicWriteFileSync(outFile, 'v1');
    assert.equal(fs.readFileSync(outFile, 'utf8'), 'v1');

    const lockFile = path.join(tmpBase, 'op.lock');
    assert.throws(() => {
      withAdvisoryLock(lockFile, () => {
        withAdvisoryLock(lockFile, () => {});
      });
    }, /Concurrency lock held/);

    // Destructive approval gate & dangerous shell checks
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

    // Secret redaction
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

test('installer V3 verifies SHA-256 integrity, enforces approval on force, and detects external tools', () => {
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

    // Tamper with installed file -> integrity report catches it
    const skillPath = path.join(tmpTarget, '.claude', 'skills', 'crazy', 'SKILL.md');
    fs.writeFileSync(skillPath, '# Tampered\n');
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

    const tools = detectExternalTools();
    assert.equal(tools.node.available, true);
    assert.equal(typeof tools.blender.available, 'boolean');
  } finally {
    fs.rmSync(tmpTarget, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Collaboration, Conflict Resolution & Task Decomposition (Section 2)
// ---------------------------------------------------------------------------

test('V3 collaboration decomposes goals, exchanges messages, and resolves conflicts', () => {
  const ctx = {
    projectId: 'v3-proj',
    title: 'Horizon Forge',
    engine: 'godot' as const,
    genre: 'survival',
    createdAt: new Date().toISOString(),
    decisions: [],
    artifacts: {},
  };

  const coord = decomposeGoalIntoTasks(
    'Create a Blender 3D glTF prop pipeline and Godot GDScript inventory API',
    ctx,
  );
  const tasks = coord.listTasks();
  assert.ok(tasks.some((t) => t.assignedSpecialist === 'crazydesigner'));
  assert.ok(tasks.some((t) => t.assignedSpecialist === 'crazycoder'));
  assert.ok(tasks.some((t) => t.assignedSpecialist === 'crazyqa'));

  coord.raiseConflict('C1', 'crazycoder', ['crazydesigner', 'crazycoder'], '4K textures exceed WebGL VRAM budget');
  const resolved = coord.resolveConflict('C1', 'Clamp textures to 2048px PoT for WebGL/mobile', 'crazy');
  assert.equal(resolved.status, 'RESOLVED');
  assert.equal(ctx.decisions.length, 1);
  assert.ok(coord.getMessages().length >= 2);

  // Full messaging flow on handoff
  const baseCoord = new CollaborationCoordinator(ctx);
  baseCoord.addTask({
    id: 'T1',
    assignedSpecialist: 'crazymaker',
    objective: 'Design',
    requiredInputs: [],
    expectedOutputs: ['Spec'],
    dependencies: [],
    acceptanceCriteria: ['Defined'],
  });
  baseCoord.addTask({
    id: 'T2',
    assignedSpecialist: 'crazycoder',
    objective: 'Implement',
    requiredInputs: ['Spec'],
    expectedOutputs: ['Code'],
    dependencies: ['T1'],
    acceptanceCriteria: ['Tested'],
  });
  baseCoord.startTask('T1');
  baseCoord.submitForReview('T1', { summary: 'Spec reviewed.', timestamp: new Date().toISOString() });
  baseCoord.reviewTask('T1', 'APPROVE', 'Looks solid');
  baseCoord.handoff('T1', 'T2', 'Implement per spec');
  assert.ok(baseCoord.getMessages().some((m) => m.kind === 'HANDOFF'));
  assert.ok(baseCoord.getMessages().some((m) => m.kind === 'REVIEW_FEEDBACK'));
});

// ---------------------------------------------------------------------------
// 3. Engineering Intelligence (Section 3)
// ---------------------------------------------------------------------------

test('engineering intelligence covers web/software stacks, deps, API compatibility, error diagnosis, and code review', () => {
  assert.ok('web-fullstack' in SOFTWARE_STACK_PROFILES);
  assert.ok('general-software' in SOFTWARE_STACK_PROFILES);

  const deps = analyzeProjectDependencies(ROOT_DIR);
  assert.ok(deps.buildFilesFound.includes('package.json'));
  assert.ok(deps.detectedStacks.includes('web-fullstack'));

  const godotCompat = checkApiAndVersionCompatibility('godot', 'extends KinematicBody');
  assert.equal(godotCompat.compatible, false);
  assert.match(godotCompat.issues[0], /Godot 3\.x/);

  const tsDiag = diagnoseErrorLog('error TS2345: Argument of type string is not assignable');
  assert.equal(tsDiag.category, 'type-error');

  const sampleSecret = ['ghp_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234'].join('');
  const badReview = reviewCodeSnippet('web-fullstack', 'api.ts', `const tok = "${sampleSecret}";`);
  assert.equal(badReview.approved, false);
  assert.equal(badReview.secretFindings.length, 1);
});

// ---------------------------------------------------------------------------
// 4. Blender Automation, Game Engine Asset Pipeline & Visual Iteration (Sec 4)
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

    // Running against non-existent binary must honestly return UNVERIFIED
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

test('asset pipeline validates GLB meshes/UVs/normals/scale and FBX headers', () => {
  const tmpDir = makeTempDir('afo-asset-pipe-');
  try {
    fs.mkdirSync(path.join(tmpDir, 'exports'), { recursive: true });

    // Valid GLB for Godot
    fs.writeFileSync(path.join(tmpDir, 'exports/valid.glb'), createValidGlbBuffer({ includeUvs: true }));
    const okReport = validateExportedAsset(tmpDir, 'exports/valid.glb', 'godot');
    assert.equal(okReport.status, 'VERIFIED');
    assert.equal(okReport.hasUvs, true);
    assert.equal(okReport.hasNormals, true);

    // Missing UVs -> FAILED
    fs.writeFileSync(path.join(tmpDir, 'exports/no-uv.glb'), createValidGlbBuffer({ includeUvs: false }));
    const badReport = validateExportedAsset(tmpDir, 'exports/no-uv.glb', 'threejs');
    assert.equal(badReport.status, 'FAILED');
    assert.ok(badReport.issues.some((i) => i.includes('TEXCOORD_0')));

    // FBX binary container check -> PARTIALLY_VERIFIED (honest limit)
    fs.writeFileSync(
      path.join(tmpDir, 'exports/hero.fbx'),
      Buffer.concat([Buffer.from('Kaydara FBX Binary  \x00\x1a\x00', 'binary'), Buffer.alloc(32)]),
    );
    const fbxQa = evaluateExportedAssetQaCheck(tmpDir, 'exports/hero.fbx', 'unreal5');
    assert.equal(fbxQa.check.status, 'PARTIALLY_VERIFIED');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('visual iteration enforces Create->Render->Inspect->Diagnose->Improve and rejects existence-only claims', () => {
  const tmpDir = makeTempDir('afo-vis-iter-');
  try {
    const ledger = new ProductionMemoryLedger(path.join(tmpDir, 'memory'));
    ledger.initLedger({
      projectName: 'VisualTest',
      engine: 'threejs',
      genre: 'cinematic',
      objective: 'Render verification test',
      qualityStandards: ['Valid PNG'],
      visualReferences: ['Contrast'],
    });

    const pngHeader = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(128, 0x22),
    ]);
    fs.mkdirSync(path.join(tmpDir, 'renders'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'renders/v1.png'), pngHeader);
    fs.writeFileSync(path.join(tmpDir, 'renders/v2.png'), pngHeader);

    // Existence alone without criteria/notes is PARTIALLY_VERIFIED, NOT VERIFIED
    const shallow = inspectVisualRender(tmpDir, {
      artifactRelPath: 'renders/v1.png',
      criteriaChecklist: [],
      inspectorNotes: '',
      qualityScore: 0.95,
    });
    assert.equal(shallow.status, 'PARTIALLY_VERIFIED');

    const ctrl = new VisualIterationController(tmpDir, { maxIterations: 3, targetScore: 0.9, ledger });
    const s1 = ctrl.runStep(
      {
        artifactRelPath: 'renders/v1.png',
        criteriaChecklist: [
          { criterion: 'Key-to-fill contrast balanced', passed: false, notes: 'Fill too bright' },
        ],
        inspectorNotes: 'First pass has flat fill lighting.',
        qualityScore: 0.65,
      },
      'Reduce fill light energy by 40%',
    );
    assert.deepEqual(s1.phaseSequence, ['CREATE', 'RENDER', 'INSPECT', 'DIAGNOSE']);

    const s2 = ctrl.runStep(
      {
        artifactRelPath: 'renders/v2.png',
        criteriaChecklist: [
          { criterion: 'Key-to-fill contrast balanced', passed: true, notes: 'Crisp rim & grounded shadow' },
        ],
        inspectorNotes: 'Lighting contrast and material specular rolloff pass criteria.',
        qualityScore: 0.92,
      },
      'Accepted final render',
    );
    assert.deepEqual(s2.phaseSequence, ['IMPROVE', 'RE_RENDER', 'INSPECT', 'DIAGNOSE']);
    assert.equal(ctrl.getBestVerifiedOutput().artifactPath, 'renders/v2.png');
    assert.equal(ledger.getKnownGoodSnapshot('best-visual-render')?.artifactPath, 'renders/v2.png');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. Memory Integrity, Knowledge Retrieval, Scheduler, Model Adapter & QA (Sec 5,6,8,9,10)
// ---------------------------------------------------------------------------

test('memory ledger scrubs secrets, detects file corruption, and flags recurring problems', () => {
  const tmpDir = makeTempDir('afo-mem-v3-');
  try {
    const ledger = new ProductionMemoryLedger(tmpDir);
    const leaked = ['sk-', 'live_1234567890abcdefghij'].join('');
    ledger.initLedger({
      projectName: 'MemCheck',
      engine: 'rust',
      genre: 'action-3d',
      objective: `Never store ${leaked}`,
      qualityStandards: ['Clean'],
      visualReferences: [],
    });

    const brief = fs.readFileSync(path.join(tmpDir, 'PROJECT_BRIEF.md'), 'utf8');
    assert.equal(brief.includes(leaked), false);
    assert.match(brief, /\[REDACTED_SECRET\]/);
    assert.equal(ledger.verifyIntegrity().ok, true);

    ledger.recordFailedApproach('sync-blocking-io', 'Stalled main loop 18ms');
    ledger.recordFailedApproach('sync-blocking-io', 'Stalled main loop 22ms');
    const recurring = ledger.getRecurringProblems(2);
    assert.equal(recurring.length, 1);
    assert.equal(recurring[0].occurrences, 2);

    // Corrupt a file externally -> verifyIntegrity catches it
    fs.writeFileSync(path.join(tmpDir, 'PROJECT_BRIEF.md'), 'CORRUPTED');
    const integrity = ledger.verifyIntegrity();
    assert.equal(integrity.ok, false);
    assert.ok(integrity.corruptedFiles.includes('PROJECT_BRIEF.md'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

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

  // Bounded scheduler
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

  // Zero-cost model adapter fallback
  const adapter = createModelAdapter({ kind: 'offline-deterministic' });
  const resp = await adapter.generate({ systemPrompt: 'sys', userPrompt: 'test' });
  assert.equal(resp.status, 'OFFLINE_FALLBACK');
});

test('Evaluation V3 suite covers all 13 benchmark domains and security/Blender QA helpers behave honestly', () => {
  const report = runEvaluationSuiteV3(ROOT_DIR, true);
  assert.ok(report.totalCases >= 155, `Expected >= 155 V2+V3 cases, got ${report.totalCases}`);
  assert.equal(report.liveModelEvaluationStatus, 'UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER');
  const failed = report.results.filter((r) => !r.passed);
  assert.equal(
    report.passedCases,
    report.totalCases,
    `Failed V3 eval cases: ${JSON.stringify(failed.slice(0, 5), null, 2)}`,
  );

  const secScan = runSecuritySecretScan(ROOT_DIR, ['core/security.ts', 'core/collaboration.ts']);
  assert.equal(secScan.check.status, 'VERIFIED');

  const blenderQa = evaluateBlenderQaCheck();
  assert.ok(blenderQa.status === 'UNVERIFIED' || blenderQa.status === 'VERIFIED');
});
