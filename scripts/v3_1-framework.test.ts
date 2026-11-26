import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertExecutionModeAllowed,
  estimateExecutionModeUsage,
} from '../core/single-ai.ts';
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
// 1. Single-AI-First Mode Gating & Cost Estimation
// ---------------------------------------------------------------------------

test('Single-AI execution modes default to ECONOMY and block ACCELERATION without explicit approval', () => {
  const eco = estimateExecutionModeUsage('ECONOMY', 4, 2);
  assert.equal(eco.agentCount, 1);
  assert.equal(eco.requiresExplicitUserApproval, false);

  const bal = estimateExecutionModeUsage('BALANCED', 4, 2);
  assert.equal(bal.agentCount, 1);
  assert.equal(bal.requiresExplicitUserApproval, false);

  assertExecutionModeAllowed('ECONOMY');
  assertExecutionModeAllowed('BALANCED');
  assert.throws(() => assertExecutionModeAllowed('ACCELERATION'), /explicit user approval/);
  assert.throws(
    () =>
      assertExecutionModeAllowed('ACCELERATION', {
        approved: true,
        actor: '',
        reason: 'missing actor',
        acknowledgedCostMultiplier: 3.5,
      }),
    /non-empty actor and reason/,
  );

  assertExecutionModeAllowed('ACCELERATION', {
    approved: true,
    actor: 'user',
    reason: 'Explicitly requested multi-agent sprint',
    acknowledgedCostMultiplier: 3.5,
  });
  assert.ok(estimateExecutionModeUsage('ACCELERATION').warning?.includes('significantly increases'));
});

// ---------------------------------------------------------------------------
// 2. Hardened Blender Bridge Security & V3.1 Script Features
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

    const exporterPy = fs.readFileSync(path.join(ROOT_DIR, 'assets/blender/export_engine_asset.py'), 'utf8');
    assert.match(exporterPy, /--base-dir/);
    assert.match(exporterPy, /os\.path\.realpath/);

    const framesDir = path.join(tmpDir, 'renders/shot01');
    fs.mkdirSync(framesDir, { recursive: true });
    fs.writeFileSync(path.join(framesDir, 'frame_0001.png'), VALID_PNG_BYTES);
    fs.writeFileSync(path.join(framesDir, 'frame_0003.png'), VALID_PNG_BYTES);
    const missing = findMissingFramesInRange(tmpDir, 'renders/shot01', 1, 4);
    assert.deepEqual(missing, [2, 4]);

    const chunks = splitFrameRange(1, 48, 24, 'SHOT1');
    assert.equal(chunks.length, 2);

    const det = detectBlenderInstallation('nonexistent-blender-exe-v31');
    assert.equal(det.available, false);
    assert.equal(det.status, 'UNAVAILABLE');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. Cinematic Production Engine (90s @ 24fps = 2,160 frames, resume & FFmpeg gate)
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

    const shotDirAbs = path.join(tmpDir, firstShot.outputDir);
    fs.mkdirSync(shotDirAbs, { recursive: true });
    for (let f = firstChunk.frameStart + 1; f <= firstChunk.frameEnd; f++) {
      fs.writeFileSync(path.join(shotDirAbs, `frame_${String(f).padStart(4, '0')}.png`), VALID_PNG_BYTES);
    }

    const reconciled = tracker.reconcileShotFramesFromDisk(firstShot.shotId);
    assert.ok(reconciled.missingFrames.includes(firstChunk.frameStart));

    const reloaded = tracker.loadPlan();
    const updatedChunk = reloaded.shots[0].chunks[0];
    assert.equal(updatedChunk.status, 'FAILED');

    fs.writeFileSync(
      path.join(shotDirAbs, `frame_${String(firstChunk.frameStart).padStart(4, '0')}.png`),
      VALID_PNG_BYTES,
    );
    const recovered = tracker.reconcileShotFramesFromDisk(firstShot.shotId);
    assert.equal(recovered.verifiedChunks >= 1, true);

    const progress = tracker.getProgressReport();
    assert.equal(progress.completedFrames, firstChunk.frameCount);
    assert.ok(progress.pendingChunks.length > 0);

    const assembly = tracker.buildVideoAssemblyPlan();
    assert.equal(assembly.status, 'UNVERIFIED');
    assert.equal(assembly.ffmpegCommand[0], 'ffmpeg');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Cloud / Google Colab GPU Rendering & PNG Magic-Byte Reconciliation
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

    const framesRel = 'downloaded-frames';
    fs.mkdirSync(path.join(tmpDir, framesRel), { recursive: true });
    const manifestRel = path.relative(tmpDir, pkg.manifestPath);
    const emptyRecon = reconcileRemoteRenderOutputs(tmpDir, manifestRel, framesRel);
    assert.equal(emptyRecon.status, 'UNVERIFIED');
    assert.equal(emptyRecon.completedChunks, 0);

    const s0 = pkg.manifest.chunks.filter((c) => c.shotId === plan.shots[0].shotId);
    const shot0Dir = path.join(tmpDir, framesRel, plan.shots[0].shotId);
    fs.mkdirSync(shot0Dir, { recursive: true });
    for (let f = s0[0].frameStart; f <= s0[0].frameEnd; f++) {
      fs.writeFileSync(path.join(shot0Dir, `frame_${String(f).padStart(4, '0')}.png`), VALID_PNG_BYTES);
    }
    const corruptRecon = reconcileRemoteRenderOutputs(tmpDir, manifestRel, framesRel);
    assert.equal(corruptRecon.status, 'PARTIALLY_VERIFIED');
    assert.equal(corruptRecon.completedChunks, 1);

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
// 5. Windows Compatibility & Installer Checks
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
