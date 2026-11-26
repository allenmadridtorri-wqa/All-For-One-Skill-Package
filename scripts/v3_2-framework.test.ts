import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  inspectRenderArtifactFile,
  validateGeneratedAssetFile,
} from '../core/asset-validation.ts';
import {
  prepareColabT4InferenceJob,
  T4_QUALITY_PROFILES,
  validateColabJobManifest,
} from '../core/cloud-rendering.ts';
import { executeMcpTool, MCP_BRIDGE_TOOLS } from '../core/mcp-bridge.ts';
import {
  assessModelCompatibility,
  detectComputeProfile,
  listModels,
  MODEL_CAPABILITY_REGISTRY,
  OPEN_ASSET_SOURCES,
} from '../core/model-registry.ts';
import { routeProductionTask } from '../core/model-routing.ts';
import { evaluateAssetValidationQa } from '../core/qa-verification.ts';
import { handleMcpJsonRpcMessage } from './mcp-bridge.ts';

const ROOT_DIR = process.cwd();

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeGlbBuffer(gltfObj: Record<string, unknown>): Buffer {
  const jsonText = JSON.stringify(gltfObj);
  const padLen = (4 - (Buffer.byteLength(jsonText) % 4)) % 4;
  const jsonBuf = Buffer.from(jsonText + ' '.repeat(padLen), 'utf8');
  const totalLen = 12 + 8 + jsonBuf.length;

  const out = Buffer.alloc(totalLen);
  out.writeUInt32LE(0x46546c67, 0); // 'glTF'
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // 'JSON'
  jsonBuf.copy(out, 20);
  return out;
}

function makePngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(80, 0xaa);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

test('Model capability registry separates code vs weight licenses, blocks TRELLIS.2 on T4, and checks Hunyuan regions', () => {
  const compute = detectComputeProfile('colab-t4-target');
  assert.equal(compute.targetGpuName, 'NVIDIA T4');
  assert.equal(compute.targetVramTotalMb, 16384);
  assert.ok(compute.systemRamTotalMb > 0);

  for (const m of MODEL_CAPABILITY_REGISTRY) {
    assert.ok(m.codeLicense.length > 0);
    assert.ok(m.weightLicense.length > 0);
    assert.ok(m.repoUrl.startsWith('https://'));
    // Must not fabricate live inference runs when only statically assessed
    assert.notEqual(m.verificationStatus, 'INFERENCE_TESTED');
    assert.notEqual(m.verificationStatus, 'OUTPUT_VERIFIED');
  }

  // TRELLIS.2 requires >= 24 GB VRAM and MUST NOT pass on T4
  const trellis2 = assessModelCompatibility('trellis-2', compute);
  assert.equal(trellis2.compatible, false);
  assert.equal(trellis2.classification, 'incompatible-exceeds-vram');

  // TripoSR & SF3D fit cleanly on T4
  assert.equal(assessModelCompatibility('triposr', compute).compatible, true);
  assert.equal(assessModelCompatibility('stable-fast-3d', compute).compatible, true);

  // Hunyuan3D-2 excludes EU, UK, South Korea
  const hunyuanEu = assessModelCompatibility('hunyuan3d-2', compute, {
    requireCommercial: true,
    userRegion: 'EU',
  });
  assert.equal(hunyuanEu.compatible, false);
  assert.equal(hunyuanEu.commercialEligible, false);

  const t4Models = listModels({ t4Only: true });
  assert.equal(t4Models.some((m) => m.id === 'trellis-2'), false);
  assert.equal(t4Models.some((m) => m.id === 'triposr'), true);

  // Open-source asset ecosystem checks
  assert.ok(OPEN_ASSET_SOURCES.some((s) => s.id === 'poly-haven' && !s.requiresPerAssetLicenseCheck));
  assert.ok(OPEN_ASSET_SOURCES.some((s) => s.id === 'opengameart' && s.requiresPerAssetLicenseCheck));
});

test('Model router enforces zero paid APIs, stage separation, and Colab fallback when HF Space is unreachable', () => {
  const plan = routeProductionTask({
    taskDomain: 'product-vehicle',
    engine: 'unreal5',
    preferHostedSpace: true,
    hostedSpaceReachable: false,
  });

  assert.equal(plan.zeroPaidApiEnforced, true);
  assert.equal(plan.hostedSpaceFallbackToColab, true);
  assert.equal(plan.executionBackend, 'colab-t4-drive-job');
  assert.equal(plan.rejectedModels.some((r) => r.modelId === 'trellis-2'), true);
  assert.ok(plan.stages.length >= 3);
  assert.equal(plan.artifactDistinctionPolicy.length, 5);
});

test('Colab T4 Drive job packaging enforces MyDrive/ALL_FOR_ONE/jobs layout, T4 profiles, and blocks TRELLIS.2', () => {
  const tmpDir = makeTempDir('afo-v32-colab-');
  try {
    assert.equal(T4_QUALITY_PROFILES.PREVIEW.resolutionX, 960);
    assert.equal(T4_QUALITY_PROFILES.LOOK_DEVELOPMENT.resolutionX, 1280);
    assert.equal(T4_QUALITY_PROFILES.FINAL_T4_RENDER.resolutionX, 1920);

    assert.throws(
      () =>
        prepareColabT4InferenceJob(tmpDir, {
          jobId: 'bad_trellis2',
          modelId: 'trellis-2',
        }),
      /Refusing to schedule "trellis-2" on Colab T4/,
    );

    const pkg = prepareColabT4InferenceJob(tmpDir, {
      jobId: 'hero_prop_01',
      modelId: 'triposr',
      qualityProfile: 'LOOK_DEVELOPMENT',
      workerScriptTemplatePath: path.join(ROOT_DIR, 'assets/colab/colab_blender_worker.py'),
    });

    assert.equal(pkg.manifest.driveProjectRoot, '/content/drive/MyDrive/ALL_FOR_ONE/jobs/hero_prop_01');
    assert.equal(pkg.manifest.targetGpuRequirement.gpuModel, 'NVIDIA T4');
    assert.equal(pkg.manifest.lifecycleState, 'READY');
    assert.ok(fs.existsSync(pkg.checkpointsPath));
    assert.ok(fs.existsSync(path.join(pkg.packageDir, 'input')));
    assert.ok(fs.existsSync(path.join(pkg.packageDir, 'output')));

    const val = validateColabJobManifest(tmpDir, 'jobs/hero_prop_01/job_manifest.json');
    assert.equal(val.valid, true, val.errors.join(' '));

    // Verify Python worker CLI executes --dry-run cleanly
    const dryOut = execFileSync(
      'python3',
      [pkg.workerScriptPath, '--manifest', pkg.manifestPath, '--dry-run'],
      { cwd: tmpDir, encoding: 'utf8' },
    );
    assert.match(dryOut, /\[DRY-RUN\] T4 inference planned for triposr/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Asset validator inspects GLB attributes/PBR materials/scale and rejects corrupt or untextured claims', () => {
  const tmpDir = makeTempDir('afo-v32-asset-');
  try {
    fs.mkdirSync(path.join(tmpDir, 'exports'), { recursive: true });

    // 1. Valid PBR GLB
    const validGlb = makeGlbBuffer({
      asset: { version: '2.0' },
      meshes: [{ name: 'HeroProp', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0 }] }],
      materials: [{ name: 'PaintedSteel', pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1] } }],
      nodes: [{ mesh: 0, scale: [1, 1, 1] }],
    });
    fs.writeFileSync(path.join(tmpDir, 'exports/hero.glb'), validGlb);
    const validRes = validateGeneratedAssetFile(tmpDir, 'exports/hero.glb');
    assert.equal(validRes.status, 'VERIFIED');
    assert.equal(validRes.hasPositions, true);
    assert.equal(validRes.hasNormals, true);
    assert.equal(validRes.hasTexCoords, true);
    assert.equal(validRes.hasPbrMaterials, true);

    // 2. Raw untextured GLB -> PARTIALLY_VERIFIED & isRawAiMeshOnly
    const rawGlb = makeGlbBuffer({
      asset: { version: '2.0' },
      meshes: [{ name: 'RawMesh', primitives: [{ attributes: { POSITION: 0 } }] }],
    });
    fs.writeFileSync(path.join(tmpDir, 'exports/raw.glb'), rawGlb);
    const rawRes = validateGeneratedAssetFile(tmpDir, 'exports/raw.glb');
    assert.equal(rawRes.status, 'PARTIALLY_VERIFIED');
    assert.equal(rawRes.isRawAiMeshOnly, true);

    // 3. Zero-scale corrupt GLB -> FAILED
    const badScaleGlb = makeGlbBuffer({
      asset: { version: '2.0' },
      meshes: [{ name: 'ZeroScale', primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0, scale: [0, 1, 1] }],
    });
    fs.writeFileSync(path.join(tmpDir, 'exports/bad.glb'), badScaleGlb);
    const badRes = validateGeneratedAssetFile(tmpDir, 'exports/bad.glb');
    assert.equal(badRes.status, 'FAILED');

    // 4. Render artifact PNG dimension & criteria check
    fs.writeFileSync(path.join(tmpDir, 'exports/render.png'), makePngBuffer(1280, 720));
    const partialPng = inspectRenderArtifactFile(tmpDir, 'exports/render.png', []);
    assert.equal(partialPng.status, 'PARTIALLY_VERIFIED');
    assert.equal(partialPng.width, 1280);
    assert.equal(partialPng.height, 720);

    const verifiedPng = inspectRenderArtifactFile(tmpDir, 'exports/render.png', ['lighting', 'silhouette']);
    assert.equal(verifiedPng.status, 'VERIFIED');

    const qaCheck = evaluateAssetValidationQa(tmpDir, 'exports/hero.glb');
    assert.equal(qaCheck.status, 'VERIFIED');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Local Antigravity MCP bridge exposes all 10 tools and runs JSON-RPC lifecycle cleanly', () => {
  const tmpDir = makeTempDir('afo-v32-mcp-');
  try {
    fs.cpSync(path.join(ROOT_DIR, 'assets'), path.join(tmpDir, 'assets'), { recursive: true });

    const listResp = handleMcpJsonRpcMessage({ id: 1, method: 'tools/list' }, tmpDir);
    const listedTools = (listResp.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name);
    assert.equal(MCP_BRIDGE_TOOLS.length, 10);
    for (const expectedName of [
      'get_compute_profile',
      'list_compatible_models',
      'inspect_model_requirements',
      'prepare_colab_job',
      'validate_job_manifest',
      'get_job_status',
      'inspect_job_outputs',
      'import_colab_results',
      'validate_generated_asset',
      'inspect_render_artifacts',
    ]) {
      assert.ok(listedTools.includes(expectedName), `Missing MCP tool ${expectedName}`);
    }

    const prepCall = handleMcpJsonRpcMessage(
      {
        id: 2,
        method: 'tools/call',
        params: {
          name: 'prepare_colab_job',
          arguments: { jobId: 'mcp_job_01', jobType: 't4-model-inference', modelId: 'triposr' },
        },
      },
      tmpDir,
    );
    assert.equal((prepCall.result as { isError: boolean }).isError, false);

    const valCall = executeMcpTool(
      'validate_job_manifest',
      { manifestRelPath: 'jobs/mcp_job_01/job_manifest.json' },
      tmpDir,
    );
    assert.equal(valCall.ok, true);

    const statusCall = executeMcpTool('get_job_status', { jobId: 'mcp_job_01' }, tmpDir);
    assert.equal((statusCall.data as { lifecycleState: string }).lifecycleState, 'READY');

    const outputsCall = executeMcpTool('inspect_job_outputs', { jobId: 'mcp_job_01' }, tmpDir);
    assert.equal((outputsCall.data as { outputCount: number }).outputCount, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
