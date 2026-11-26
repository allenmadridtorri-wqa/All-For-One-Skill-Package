import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertExecutionModeAllowed,
  estimateExecutionModeUsage,
  SingleAiOrchestrator,
} from '../core/single-ai.ts';
import {
  ConfigurableModelAdapter,
  createModelAdapter,
  OfflineDeterministicAdapter,
} from '../core/model-adapter.ts';
import {
  analyzeProjectStructure,
  assessTechnicalFeasibility,
  ImplementationStatusTracker,
} from '../core/engineering-intelligence.ts';
import { ProductionMemoryLedger } from '../core/production-memory.ts';
import {
  detectBlenderInstallation,
  findMissingFramesInRange,
  generateBlenderAutomationScript,
  resolveBlenderRenderSettings,
  serializePythonString,
  splitFrameRange,
  validateBlenderWorkspacePath,
} from '../core/blender-bridge.ts';
import {
  CinematicProductionTracker,
  createCinematicProductionPlan,
} from '../core/cinematic-production.ts';
import {
  evaluateHardwareRenderRouting,
  prepareColabRenderPackage,
  reconcileRemoteRenderOutputs,
  RemoteRenderProviderRegistry,
} from '../core/cloud-rendering.ts';
import { detectHardwareProfile } from '../core/production-intelligence.ts';
import { detectExternalTools } from '../core/installer-engine.mjs';

const ROOT_DIR = process.cwd();
const VALID_PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(128, 0x5a),
]);

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// 1. Single-AI-First Architecture (ECONOMY default, BALANCED, gated ACCELERATION)
// ---------------------------------------------------------------------------

test('SingleAiOrchestrator defaults to ECONOMY, offloads deterministic tasks, and gates ACCELERATION', async () => {
  const ctx = {
    projectId: 'afo-test-v31',
    title: 'Single-AI Action Prototype',
    engine: 'threejs' as const,
    genre: 'action' as const,
    objectives: ['Zero-GC gameplay loop'],
    constraints: ['One AI model only'],
    decisions: [],
    artifacts: {},
    createdAt: new Date().toISOString(),
  };

  const orch = new SingleAiOrchestrator(ctx);
  assert.equal(orch.getMode(), 'ECONOMY');
  assert.equal(orch.isMultiAgentEnabled(), false);

  const det = orch.runDeterministicTask('DET-1', 'crazycoder', 'Split shot frames', () =>
    splitFrameRange(1, 48, 24, 'SHOT1'),
  );
  assert.equal(det.result.length, 2);
  assert.equal(det.record.aiRequestsConsumed, 0);
  assert.equal(det.record.status, 'VERIFIED');

  const lensOut = await orch.executeSpecialistLens(
    'LENS-1',
    'crazymaker',
    'Draft combat loop acceptance criteria',
  );
  assert.equal(lensOut.record.status, 'IMPLEMENTED');
  assert.equal(lensOut.record.aiRequestsConsumed, 0);

  // Separate QA verification phase honestly reports VERIFIED, UNVERIFIED, or FAILED
  const qaPass = orch.runSeparateQaVerificationPhase('QA-1', 'Check frame chunks', () => ({
    passed: det.result.length === 2,
    evidence: '2 deterministic chunks verified',
  }));
  assert.equal(qaPass.status, 'VERIFIED');

  const qaUnverified = orch.runSeparateQaVerificationPhase('QA-2', 'External Blender run', () => ({
    passed: false,
    evidence: '',
    unverifiedReason: 'Blender CLI absent in CI container',
  }));
  assert.equal(qaUnverified.status, 'UNVERIFIED');

  // ACCELERATION blocked without explicit approval
  assert.throws(() => assertExecutionModeAllowed('ACCELERATION'), /explicit user approval/);
  assert.throws(() => orch.setMode('ACCELERATION'), /explicit user approval/);

  const balEstimate = orch.setMode('BALANCED');
  assert.equal(balEstimate.requiresExplicitUserApproval, false);
  assert.equal(orch.isMultiAgentEnabled(), false);

  const accelEstimate = orch.setMode('ACCELERATION', {
    approved: true,
    actor: 'user',
    reason: 'Explicitly requested multi-agent sprint',
    acknowledgedCostMultiplier: 3.5,
  });
  assert.equal(accelEstimate.requiresExplicitUserApproval, true);
  assert.equal(orch.isMultiAgentEnabled(), true);
  assert.ok(estimateExecutionModeUsage('ACCELERATION').warning?.includes('significantly increases'));
});

// ---------------------------------------------------------------------------
// 2. Provider-Flexible Model Adapter (Caching, URL routing & Secret Redaction)
// ---------------------------------------------------------------------------

test('ConfigurableModelAdapter caches responses, resolves provider URLs, and redacts leaked credentials on errors', async () => {
  const offline = createModelAdapter();
  assert.ok(offline instanceof OfflineDeterministicAdapter);
  const offlineRes = await offline.generate({ systemPrompt: 'sys', userPrompt: 'hello' });
  assert.equal(offlineRes.status, 'OFFLINE_FALLBACK');
  assert.equal(offline.getUsageStats().aiRequestsExecuted, 0);

  // Without API key in env, openai-compatible is unavailable and falls back deterministically
  const missingKeyAdapter = new ConfigurableModelAdapter({
    kind: 'openai-compatible',
    modelName: 'gpt-4o-mini',
    baseUrl: 'https://api.example.invalid/v1',
    envApiKeyName: 'AFO_NONEXISTENT_KEY_VAR',
  });
  assert.equal(missingKeyAdapter.isAvailable(), false);
  const fbRes = await missingKeyAdapter.generate({ systemPrompt: 's', userPrompt: 'u' });
  assert.equal(fbRes.status, 'OFFLINE_FALLBACK');

  // Mock fetch on local-http adapter to verify caching & error secret redaction
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  const syntheticSecret = ['sk', '-proj-', 'secretValue1234567890'].join('');

  try {
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ response: 'Cached local answer' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const localAdapter = new ConfigurableModelAdapter({
      kind: 'local-http',
      modelName: 'llama3.2',
      baseUrl: 'http://127.0.0.1:11434/api/generate',
    });
    assert.equal(localAdapter.isAvailable(), true);

    const r1 = await localAdapter.generate({ systemPrompt: 's', userPrompt: 'prompt-1' });
    const r2 = await localAdapter.generate({ systemPrompt: 's', userPrompt: 'prompt-1' });
    assert.equal(r1.status, 'VERIFIED_ADAPTER_RESPONSE');
    assert.equal(r2.status, 'CACHED_RESPONSE');
    assert.equal(r2.cached, true);
    assert.equal(fetchCalls, 1);
    assert.equal(localAdapter.getUsageStats().cacheHits, 1);

    // Provider error containing credential pattern must be redacted
    globalThis.fetch = (async () => {
      throw new Error(`Upstream failed with token ${syntheticSecret}`);
    }) as typeof fetch;

    const errRes = await localAdapter.generate({ systemPrompt: 's', userPrompt: 'uncached-prompt' });
    assert.equal(errRes.status, 'OFFLINE_FALLBACK');
    assert.equal(errRes.notes.includes(syntheticSecret), false);
    assert.match(errRes.notes, /REDACTED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// 3. Engineering Intelligence & Compact Production Memory
// ---------------------------------------------------------------------------

test('analyzeProjectStructure, assessTechnicalFeasibility, ImplementationStatusTracker, and compact memory enforce honesty', () => {
  const struct = analyzeProjectStructure(ROOT_DIR);
  assert.ok(struct.totalFilesScanned > 10);
  assert.ok(struct.modules.some((m) => m === 'core/single-ai.ts'));
  assert.ok(struct.testFiles.some((t) => t === 'scripts/v3-framework.test.ts'));
  assert.equal(
    struct.modules.some((m) => m.startsWith('node_modules/') || m.startsWith('dist/')),
    false,
  );

  // Acer Aspire A514-53 profile (2 physical cores, 4GB RAM)
  const laptopHw = detectHardwareProfile({ cpuCores: 2, totalMemoryMb: 4096, freeMemoryMb: 1200 });
  const feasibility = assessTechnicalFeasibility({
    goal: 'Render 90-second 3D cinematic trailer',
    stack: 'threejs',
    hardware: laptopHw,
    requiresHeavy3DRendering: true,
    frameCount: 2160,
  });
  assert.equal(feasibility.recommendRemoteGpuOffload, true);
  assert.equal(feasibility.riskLevel, 'high');

  const tracker = new ImplementationStatusTracker();
  tracker.plan('FEAT-1', 'Implement frame reconciler');
  tracker.markInProgress('FEAT-1');
  tracker.markImplemented('FEAT-1');
  // Cannot jump directly from IMPLEMENTED -> VERIFIED
  assert.throws(
    () => tracker.markVerified('FEAT-1', 'Skipped tests'),
    /execute tests\/verification first/,
  );
  tracker.markTested('FEAT-1', 'tsx --test passed 10/10');
  const verified = tracker.markVerified('FEAT-1', 'All assertions passed after edit');
  assert.equal(verified.status, 'VERIFIED');

  // Compact memory & immutable decision ledger
  const tmpDir = makeTempDir('afo-mem-v31-');
  try {
    const ledger = new ProductionMemoryLedger(tmpDir);
    ledger.initLedger({
      projectName: 'Single-AI Demo',
      engine: 'godot',
      genre: 'rpg',
      objective: 'Test compact recovery context',
      qualityStandards: ['Zero secrets'],
      visualReferences: [],
    });
    ledger.recordDecision({
      id: 'DEC-001',
      date: '2026-11-25',
      owner: 'crazycoder',
      title: 'Use Forward+ Renderer',
      chosen: 'Forward+',
      alternatives: ['Compatibility'],
      rationale: 'Needed for volumetrics',
    });
    assert.throws(
      () =>
        ledger.recordDecision({
          id: 'DEC-001',
          date: '2026-11-26',
          owner: 'crazycoder',
          title: 'Overwrite attempt',
          chosen: 'Mobile',
          alternatives: [],
          rationale: 'Should fail',
        }),
      /already exists/,
    );
    ledger.recordKnownBug({ id: 'BUG-7', severity: 'high', summary: 'Chunk overlap off-by-one' });
    ledger.updateTaskProgress('T-1', 'Frame splitter', 'VERIFIED');
    ledger.recordBuildInfo({
      stack: 'threejs',
      command: 'tsc --noEmit',
      status: 'VERIFIED',
      summary: '0 errors',
    });
    ledger.recordAssetReference({
      key: 'hero_glb',
      assetPath: 'assets/hero.glb',
      kind: 'glb',
      engine: 'godot',
      verified: true,
    });

    const compact = ledger.buildCompactContextSummary(1200);
    assert.ok(compact.length <= 1200);
    assert.match(compact, /DEC-001/);
    assert.match(compact, /BUG-7/);
    assert.match(compact, /1\/1 VERIFIED/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Hardened Blender Bridge Security & V3.1 Script Features
// ---------------------------------------------------------------------------

test('Blender bridge blocks path/quote/newline injection and builds hardened V3.1 scripts', () => {
  const tmpDir = makeTempDir('afo-blender-v31-');
  try {
    assert.throws(
      () => validateBlenderWorkspacePath('../escape.blend', tmpDir),
      /Path traversal blocked|Unsafe path|escapes root/i,
    );
    assert.throws(
      () => validateBlenderWorkspacePath('scenes/bad\nimport os.blend', tmpDir),
      /newline/i,
    );
    assert.throws(
      () => validateBlenderWorkspacePath('/etc/passwd'),
      /Unsafe Blender path/,
    );
    assert.throws(() => serializePythonString('ok\x00bad'), /Invalid string literal/i);

    const quotePath = 'scenes/my "quoted" prop.blend';
    const serialized = serializePythonString(quotePath);
    assert.equal(JSON.parse(serialized), quotePath);

    const laptopHw = detectHardwareProfile({ cpuCores: 2, totalMemoryMb: 4096, freeMemoryMb: 1200 });
    const renderCfg = resolveBlenderRenderSettings(
      {
        sceneName: 'HeroRigScene',
        targetEngine: 'unreal5',
        blendOutputPath: 'scenes/hero.blend',
        resolutionX: 3840,
        resolutionY: 2160,
        samples: 256,
        renderEngine: 'CYCLES',
      },
      laptopHw,
    );
    assert.equal(renderCfg.resX, 960);
    assert.equal(renderCfg.resY, 540);
    assert.equal(renderCfg.samples, 32);
    assert.equal(renderCfg.useGpuCompute, false);

    const script = generateBlenderAutomationScript(
      {
        sceneName: 'Metropolis_Shot01',
        category: 'architecture',
        targetEngine: 'unreal5',
        blendOutputPath: 'scenes/metropolis.blend',
        renderOutputPath: 'renders/shot01/frame_',
        exportFormat: 'fbx',
        exportOutputPath: 'exports/metropolis.fbx',
        frameStart: 1,
        frameEnd: 48,
        fps: 24,
        cameraRig: 'crane',
        generateLods: true,
        createArmatureRig: true,
        enableIkFk: true,
        enableFacialRig: true,
        enableClothSim: true,
        enableHairParticles: true,
        volumetricFog: true,
        compositorBloom: true,
      },
      laptopHw,
      tmpDir,
    );

    assert.match(script, /_resolve_safe_path/);
    assert.match(script, /LOD\{lod_idx\}_Decimate/);
    assert.match(script, /IK_Target_Hand/);
    assert.match(script, /Head_Jaw/);
    assert.match(script, /AFO_ClothSim/);
    assert.match(script, /AFO_HairParticles/);
    assert.match(script, /AFO_VolumetricDomain/);
    assert.match(script, /CompositorNodeGlare/);
    assert.match(script, /bpy\.ops\.uv\.smart_project/);
    assert.match(script, /bpy\.ops\.export_scene\.fbx/);

    // Verify Python exporter asset enforces --base-dir confinement
    const exporterPy = fs.readFileSync(path.join(ROOT_DIR, 'assets/blender/export_engine_asset.py'), 'utf8');
    assert.match(exporterPy, /--base-dir/);
    assert.match(exporterPy, /os\.path\.realpath/);

    // Verify missing frames helper
    const framesDir = path.join(tmpDir, 'renders/shot01');
    fs.mkdirSync(framesDir, { recursive: true });
    fs.writeFileSync(path.join(framesDir, 'frame_0001.png'), VALID_PNG_BYTES);
    fs.writeFileSync(path.join(framesDir, 'frame_0003.png'), VALID_PNG_BYTES);
    const missing = findMissingFramesInRange(tmpDir, 'renders/shot01', 1, 4);
    assert.deepEqual(missing, [2, 4]);

    // Safe detection even with non-existent custom override
    const det = detectBlenderInstallation('nonexistent-blender-exe-v31');
    assert.equal(det.available, false);
    assert.equal(det.status, 'UNAVAILABLE');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. Cinematic Production Engine (90s @ 24fps = 2,160 frames, resume & FFmpeg gate)
// ---------------------------------------------------------------------------

test('CinematicProductionTracker plans 90s (2,160 frames), reconciles disk frames, resumes, and gates FFmpeg honestly', () => {
  const tmpDir = makeTempDir('afo-cine-v31-');
  try {
    const hw = detectHardwareProfile({ cpuCores: 2, totalMemoryMb: 4096, freeMemoryMb: 1200 });
    const plan = createCinematicProductionPlan({
      projectId: 'hero-trailer-90s',
      title: 'Skyline Guardian Trailer',
      creativeBrief: '90-second superhero city trailer with rooftop entrance, cape physics, and skyline climax',
      durationSec: 90,
      fps: 24,
      chunkSizeFrames: 24,
      hardware: hw,
    });

    assert.equal(plan.totalDurationSec, 90);
    assert.equal(plan.fps, 24);
    assert.equal(plan.totalFrames, 2160);
    assert.equal(plan.scenes.length, 5);
    assert.ok(plan.shots.length >= 8);
    const plannedFrameSum = plan.shots.reduce((sum, s) => sum + s.frameCount, 0);
    assert.equal(plannedFrameSum, 2160);
    assert.ok(plan.shots.every((s) => s.chunks.length >= 1 && s.characterDependencies.length >= 1));

    const tracker = new CinematicProductionTracker(tmpDir);
    tracker.savePlan(plan);

    const firstShot = plan.shots[0];
    const firstChunk = firstShot.chunks[0];
    tracker.markChunkStatus(firstShot.shotId, firstChunk.chunkId, 'COMPLETED');

    // Write valid PNG frames for firstChunk minus 1 deleted frame to simulate interruption
    const shotDirAbs = path.join(tmpDir, firstShot.outputDir);
    fs.mkdirSync(shotDirAbs, { recursive: true });
    for (let f = firstChunk.frameStart + 1; f <= firstChunk.frameEnd; f++) {
      fs.writeFileSync(path.join(shotDirAbs, `frame_${String(f).padStart(4, '0')}.png`), VALID_PNG_BYTES);
    }

    const reconciled = tracker.reconcileShotFramesFromDisk(firstShot.shotId);
    assert.ok(reconciled.missingFrames.includes(firstChunk.frameStart));

    // Re-loading from disk preserves failed chunk recovery status
    const reloaded = tracker.loadPlan();
    const updatedChunk = reloaded.shots[0].chunks[0];
    assert.equal(updatedChunk.status, 'FAILED');

    // Fill the missing frame and re-reconcile -> chunk recovers to COMPLETED
    fs.writeFileSync(
      path.join(shotDirAbs, `frame_${String(firstChunk.frameStart).padStart(4, '0')}.png`),
      VALID_PNG_BYTES,
    );
    const recovered = tracker.reconcileShotFramesFromDisk(firstShot.shotId);
    assert.equal(recovered.verifiedChunks >= 1, true);

    const progress = tracker.getProgressReport();
    assert.equal(progress.completedFrames, firstChunk.frameCount);
    assert.ok(progress.pendingChunks.length > 0);

    // Since only partial frames exist (or ffmpeg is absent), assembly MUST remain UNVERIFIED
    const assembly = tracker.buildVideoAssemblyPlan();
    assert.equal(assembly.status, 'UNVERIFIED');
    assert.equal(assembly.ffmpegCommand[0], 'ffmpeg');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. Cloud / Google Colab GPU Rendering & PNG Magic-Byte Reconciliation
// ---------------------------------------------------------------------------

test('RemoteRenderProviderRegistry & Colab workflow package assets, warn on ephemeral sessions, and verify PNG bytes', () => {
  const tmpDir = makeTempDir('afo-colab-v31-');
  try {
    const registry = new RemoteRenderProviderRegistry();
    assert.ok(registry.get('google-colab'));
    assert.ok(registry.get('google-cloud-gce'));
    registry.register({
      id: 'custom-gpu-farm',
      displayName: 'Custom GPU Farm',
      supportsPersistentDrive: false,
      typicalSessionLimitHours: 8,
      requiresInteractiveAuth: false,
      notes: 'Custom farm profile',
    });
    assert.equal(registry.list().length, 3);

    const acerHw = detectHardwareProfile({ cpuCores: 2, totalMemoryMb: 4096, freeMemoryMb: 1200 });
    const routing = evaluateHardwareRenderRouting(acerHw, 2160, 'CYCLES');
    assert.equal(routing.recommendOffload, true);
    assert.equal(routing.provider, 'google-colab');
    assert.ok(routing.sessionCaveats.some((c) => /NOT permanent|disconnect/i.test(c)));

    fs.mkdirSync(path.join(tmpDir, 'scenes'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'scenes/hero.blend'), Buffer.from('BLENDER-v402TESTDATA'));

    const plan = createCinematicProductionPlan({
      projectId: 'colab-test',
      title: 'Colab Batch Test',
      creativeBrief: 'Short 10s test',
      durationSec: 10,
      fps: 24,
      chunkSizeFrames: 48,
      hardware: acerHw,
    });

    const pkg = prepareColabRenderPackage(tmpDir, {
      plan,
      blendRelPath: 'scenes/hero.blend',
      workerScriptTemplatePath: path.join(ROOT_DIR, 'assets/colab/colab_blender_worker.py'),
    });

    assert.ok(fs.existsSync(pkg.manifestPath));
    assert.ok(fs.existsSync(pkg.notebookPath));
    assert.ok(fs.existsSync(pkg.workerScriptPath));
    assert.equal(pkg.manifest.executionStatus, 'UNVERIFIED_PREPARED_FOR_COLAB');
    assert.equal(pkg.manifest.assetFiles[0].sha256.length, 64);

    // Reconcile when zero frames downloaded -> stays UNVERIFIED
    const framesRel = 'downloaded-frames';
    fs.mkdirSync(path.join(tmpDir, framesRel), { recursive: true });
    const manifestRel = path.relative(tmpDir, pkg.manifestPath);
    const emptyRecon = reconcileRemoteRenderOutputs(tmpDir, manifestRel, framesRel);
    assert.equal(emptyRecon.status, 'UNVERIFIED');
    assert.equal(emptyRecon.completedChunks, 0);

    // Provide one valid PNG chunk and one corrupt/empty PNG file -> detects FAILED corrupt frame
    const s0 = pkg.manifest.chunks.filter((c) => c.shotId === plan.shots[0].shotId);
    const shot0Dir = path.join(tmpDir, framesRel, plan.shots[0].shotId);
    fs.mkdirSync(shot0Dir, { recursive: true });
    for (let f = s0[0].frameStart; f <= s0[0].frameEnd; f++) {
      fs.writeFileSync(path.join(shot0Dir, `frame_${String(f).padStart(4, '0')}.png`), VALID_PNG_BYTES);
    }
    const corruptRecon = reconcileRemoteRenderOutputs(tmpDir, manifestRel, framesRel);
    assert.equal(corruptRecon.status, 'PARTIALLY_VERIFIED');
    assert.equal(corruptRecon.completedChunks, 1);

    // Now write a fake non-PNG file into chunk 2
    const chunk2 = pkg.manifest.chunks[1];
    const shot2Dir = path.join(tmpDir, framesRel, chunk2.shotId);
    fs.mkdirSync(shot2Dir, { recursive: true });
    fs.writeFileSync(
      path.join(shot2Dir, `frame_${String(chunk2.frameStart).padStart(4, '0')}.png`),
      Buffer.from('not-a-valid-png-header-and-too-short'),
    );
    const badPngRecon = reconcileRemoteRenderOutputs(tmpDir, manifestRel, framesRel);
    assert.equal(badPngRecon.status, 'FAILED');
    assert.ok(badPngRecon.corruptFrames.length >= 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 7. Windows Compatibility & Installer Checks
// ---------------------------------------------------------------------------

test('Windows install.ps1 supports -Yes, -Verify, -CheckTools and detectExternalTools probes blender & ffmpeg cleanly', () => {
  const ps1 = fs.readFileSync(path.join(ROOT_DIR, 'install.ps1'), 'utf8');
  assert.match(ps1, /\[switch\]\$Yes/);
  assert.match(ps1, /\[switch\]\$Verify/);
  assert.match(ps1, /\[switch\]\$CheckTools/);
  assert.match(ps1, /--yes/);
  assert.match(ps1, /\$LASTEXITCODE/);

  const tools = detectExternalTools();
  assert.ok('node' in tools);
  assert.ok('blender' in tools);
  assert.ok('ffmpeg' in tools);
});
