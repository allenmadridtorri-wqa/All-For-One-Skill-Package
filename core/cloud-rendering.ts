import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FrameRangeChunk } from './blender-bridge.ts';
import type { CinematicProductionPlan } from './cinematic-production.ts';
import {
  assessModelCompatibility,
  detectComputeProfile,
  T4_SAFE_USABLE_VRAM_MB,
  T4_VRAM_TOTAL_MB,
} from './model-registry.ts';
import { detectHardwareProfile, type HardwareProfile } from './production-intelligence.ts';
import { assertSafeSubpathSync, atomicWriteFileSync } from './security.ts';

export type RemoteProviderId = 'google-colab' | 'google-cloud-gce' | (string & {});

export type T4QualityProfileId = 'PREVIEW' | 'LOOK_DEVELOPMENT' | 'FINAL_T4_RENDER';

export type ColabDriveJobStatus =
  | 'CREATED'
  | 'READY'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'UNVERIFIED';

export type ColabJobType = 'blender-render' | 't4-model-inference';

export interface T4QualityProfileSpec {
  id: T4QualityProfileId;
  resolutionX: number;
  resolutionY: number;
  samples: number;
  denoiser: 'OPENIMAGEDENOISE' | 'NONE';
  maxChunkFrames: number;
  description: string;
}

export const T4_QUALITY_PROFILES: Record<T4QualityProfileId, T4QualityProfileSpec> = {
  PREVIEW: {
    id: 'PREVIEW',
    resolutionX: 960,
    resolutionY: 540,
    samples: 24,
    denoiser: 'OPENIMAGEDENOISE',
    maxChunkFrames: 48,
    description: 'Fast layout, silhouette, and lighting validation on NVIDIA T4 (16 GB VRAM).',
  },
  LOOK_DEVELOPMENT: {
    id: 'LOOK_DEVELOPMENT',
    resolutionX: 1280,
    resolutionY: 720,
    samples: 64,
    denoiser: 'OPENIMAGEDENOISE',
    maxChunkFrames: 24,
    description: 'Material, reflection, and volumetric look-dev pass on NVIDIA T4.',
  },
  FINAL_T4_RENDER: {
    id: 'FINAL_T4_RENDER',
    resolutionX: 1920,
    resolutionY: 1080,
    samples: 128,
    denoiser: 'OPENIMAGEDENOISE',
    maxChunkFrames: 12,
    description: 'Final 1080p production pass tuned for 16 GB T4 + standard Colab RAM with small chunks.',
  },
};

export interface RemoteProviderProfile {
  id: RemoteProviderId;
  displayName: string;
  supportsPersistentDrive: boolean;
  typicalSessionLimitHours: number | null;
  requiresInteractiveAuth: boolean;
  targetGpuClass?: string;
  vramLimitMb?: number | null;
  notes: string;
}

export interface RemoteRenderRoutingDecision {
  recommendOffload: boolean;
  provider: RemoteProviderId;
  reason: string;
  localHardwareSummary: string;
  targetGpuContract: string;
  sessionCaveats: string[];
}

export interface ColabJobManifest {
  version: '3.2.0';
  provider: RemoteProviderId;
  jobType?: ColabJobType;
  projectId: string;
  blendRelPath: string;
  driveProjectRoot: string;
  targetGpuRequirement: {
    gpuModel: 'NVIDIA T4';
    vramTotalMb: number;
    safeUsableVramMb: number;
    requireDynamicSystemRamCheck: true;
    abortIfNonT4OrMissingGpu: boolean;
    singleHeavyJobOnly: true;
  };
  qualityProfile: T4QualityProfileId;
  modelId?: string;
  outputFormat: 'PNG' | 'GLB';
  fps: number;
  resolutionX: number;
  resolutionY: number;
  samples: number;
  preferredDevice: 'T4_GPU_STRICT' | 'AUTO_GPU_ELSE_CPU';
  assetFiles: Array<{ relPath: string; sha256: string; sizeBytes: number }>;
  chunks: Array<
    FrameRangeChunk & {
      shotId: string;
      remoteOutputDir: string;
    }
  >;
  lifecycleState: ColabDriveJobStatus;
  executionStatus: 'UNVERIFIED_PREPARED_FOR_COLAB' | 'PARTIALLY_VERIFIED' | 'VERIFIED' | 'FAILED';
  createdAt: string;
}

export interface ColabPackageOutput {
  packageDir: string;
  manifestPath: string;
  workerScriptPath: string;
  notebookPath: string;
  checkpointsPath: string;
  manifest: ColabJobManifest;
}

export interface RemoteReconciliationReport {
  status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'UNVERIFIED' | 'FAILED';
  completedChunks: number;
  totalChunks: number;
  missingFrames: number[];
  corruptFrames: string[];
  resumeManifestChunkIds: string[];
  notes: string;
}

export class RemoteRenderProviderRegistry {
  private readonly providers = new Map<RemoteProviderId, RemoteProviderProfile>();

  constructor() {
    this.register({
      id: 'google-colab',
      displayName: 'Google Colab NVIDIA T4 GPU Runtime (16 GB VRAM + Drive Persistence)',
      supportsPersistentDrive: true,
      typicalSessionLimitHours: 12,
      requiresInteractiveAuth: true,
      targetGpuClass: 'NVIDIA T4 (16 GB VRAM) + Standard Dynamic System RAM',
      vramLimitMb: T4_VRAM_TOTAL_MB,
      notes:
        'User-initiated interactive Colab notebook only (NO always-on free server). Mount Google Drive at MyDrive/ALL_FOR_ONE/jobs/<job_id> and detect actual RAM + T4 GPU before running.',
    });
    this.register({
      id: 'google-cloud-gce',
      displayName: 'Google Cloud Compute Engine GPU VM (Optional Paid Opt-In + GCS)',
      supportsPersistentDrive: true,
      typicalSessionLimitHours: null,
      requiresInteractiveAuth: true,
      targetGpuClass: 'Custom GCE GPU',
      vramLimitMb: null,
      notes: 'Optional paid GCP infrastructure; never selected automatically under zero-budget policy.',
    });
  }

  register(profile: RemoteProviderProfile): void {
    this.providers.set(profile.id, profile);
  }

  get(id: RemoteProviderId): RemoteProviderProfile | undefined {
    return this.providers.get(id);
  }

  list(): RemoteProviderProfile[] {
    return [...this.providers.values()];
  }
}

/**
 * Evaluates whether local hardware (e.g., 2-core / 4GB RAM / iGPU laptop)
 * should offload Blender Cycles or AI 3D tasks to a user-initiated Google Colab T4 session.
 */
export function evaluateHardwareRenderRouting(
  hardware: HardwareProfile = detectHardwareProfile(),
  totalFrames = 1,
  renderEngine: 'CYCLES' | 'BLENDER_EEVEE_NEXT' = 'CYCLES',
): RemoteRenderRoutingDecision {
  const needsOffload =
    hardware.tier === 'constrained' || (renderEngine === 'CYCLES' && totalFrames >= 24 && hardware.cpuCores <= 4);

  return {
    recommendOffload: needsOffload,
    provider: 'google-colab',
    reason: needsOffload
      ? `Local hardware (${hardware.cpuCores} cores, ${hardware.totalMemoryMb} MB RAM, tier=${hardware.tier}) is unsuitable for sustained ${renderEngine} multi-frame rendering (${totalFrames} frames). Package an interactive Google Colab T4 (16 GB VRAM) Drive job at MyDrive/ALL_FOR_ONE/jobs/<job_id>.`
      : `Local workstation (${hardware.cpuCores} cores, ${hardware.totalMemoryMb} MB RAM) can run local renders or optionally offload to a Colab T4 Drive job.`,
    localHardwareSummary: `${hardware.cpuCores} CPU cores, ${hardware.totalMemoryMb} MB total RAM (${hardware.freeMemoryMb} MB free), tier=${hardware.tier}`,
    targetGpuContract: `NVIDIA T4 (${T4_VRAM_TOTAL_MB} MB total / ${T4_SAFE_USABLE_VRAM_MB} MB safe usable VRAM) + Dynamic Standard RAM Check`,
    sessionCaveats: [
      'Google Colab sessions are NOT permanent and disconnect after idle or max runtime limits (~12h or quota cap).',
      'Free Colab CANNOT act as an always-on server/SSH/HTTP MCP daemon — user must open and run the generated notebook.',
      'Always mount Google Drive (/content/drive/MyDrive/ALL_FOR_ONE/jobs/<job_id>) and write outputs per chunk.',
      'Worker strictly inspects nvidia-smi and free system RAM at startup; never assume L4, A100, H100, or High-RAM.',
    ],
  };
}

function sha256File(absPath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function buildColabNotebookJson(manifest: ColabJobManifest): string {
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      accelerator: 'GPU',
      colab: { name: `AllForOne_${manifest.projectId}_T4_Worker.ipynb`, proven_gpu: true },
    },
    cells: [
      {
        cell_type: 'markdown',
        metadata: {},
        source: [
          `# All-For-One — Interactive Google Colab T4 Worker (\`${manifest.projectId}\`)\n\n`,
          `- **Target Hardware:** NVIDIA T4 (16 GB VRAM) + Standard Colab System RAM (dynamically probed)\n`,
          `- **Drive Job Folder:** \`${manifest.driveProjectRoot}\`\n`,
          `- **Job Type:** \`${manifest.jobType ?? 'blender-render'}\` | **Quality Profile:** \`${manifest.qualityProfile}\`\n`,
          `- **Rules:** User-initiated notebook execution only; halts GPU inference cleanly if no T4 GPU or insufficient RAM is detected.\n`,
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# Cell 1 — Mount Google Drive & Verify Hardware (T4 GPU + Dynamic System RAM + Disk)\n',
          'import os, shutil, subprocess\n',
          'from google.colab import drive\n',
          "drive.mount('/content/drive')\n",
          'mem_kb = int([l.split()[1] for l in open("/proc/meminfo") if "MemTotal:" in l][0])\n',
          'print(f"[AFO-Colab] Detected System RAM: {mem_kb / (1024*1024):.2f} GB")\n',
          'disk = shutil.disk_usage("/content")\n',
          'print(f"[AFO-Colab] Free Disk: {disk.free / (1024**3):.2f} GB")\n',
          'gpu_out = subprocess.check_output(["nvidia-smi", "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader"], text=True).strip()\n',
          'print(f"[AFO-Colab] Detected GPU: {gpu_out}")\n',
          'if "T4" not in gpu_out:\n',
          '    print("[AFO-Colab] WARNING: Non-T4 runtime detected. Worker T4 verification enforces 16 GB ceiling.")\n',
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# Cell 2 — Install Required Runtime Only (Blender 4.2 LTS for render jobs OR model-specific T4 inference deps)\n',
          `JOB_TYPE = ${JSON.stringify(manifest.jobType ?? 'blender-render')}\n`,
          `MODEL_ID = ${JSON.stringify(manifest.modelId ?? 'triposr')}\n`,
          'import shutil\n',
          'if JOB_TYPE == "blender-render" and not shutil.which("blender"):\n',
          '    !wget -q https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz -O /tmp/blender.tar.xz\n',
          '    !tar -xf /tmp/blender.tar.xz -C /opt && ln -sf /opt/blender-4.2.3-linux-x64/blender /usr/local/bin/blender\n',
          '    !blender --version\n',
          'elif JOB_TYPE == "t4-model-inference":\n',
          '    print(f"[AFO-Colab] Preparing T4 inference dependencies for model: {MODEL_ID}")\n',
          '    !pip install -q --upgrade trimesh pillow einops huggingface_hub omegaconf\n',
          '    if MODEL_ID == "sdxl-base-1.0":\n',
          '        !pip install -q --upgrade diffusers transformers accelerate safetensors\n',
          '    elif MODEL_ID == "depth-anything-v2-small":\n',
          '        !pip install -q --upgrade transformers accelerate\n',
          '    elif MODEL_ID == "real-esrgan":\n',
          '        !pip install -q --upgrade basicsr facexlib gfpgan realesrgan\n',
          '    elif MODEL_ID in ("triposr", "stable-fast-3d"):\n',
          '        !pip install -q --upgrade rembg onnxruntime torchmcubes\n',
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# Cell 3 — Execute Single-Job Worker with Checkpointing & Persistent Drive Outputs\n',
          `JOB_ROOT = ${JSON.stringify(manifest.driveProjectRoot)}\n`,
          'WORKER_PATH = f"{JOB_ROOT}/scripts/colab_blender_worker.py"\n',
          'MANIFEST_PATH = f"{JOB_ROOT}/job_manifest.json"\n',
          'if not os.path.exists(WORKER_PATH):\n',
          '    WORKER_PATH = f"{JOB_ROOT}/colab_blender_worker.py"\n',
          'if not os.path.exists(MANIFEST_PATH):\n',
          '    MANIFEST_PATH = f"{JOB_ROOT}/colab_job_manifest.json"\n',
          '!python3 "{WORKER_PATH}" --manifest "{MANIFEST_PATH}" --require-t4\n',
        ],
      },
    ],
  };
  return JSON.stringify(nb, null, 2) + '\n';
}

/**
 * Prepares a self-contained, hash-verified Google Colab render package inside the workspace.
 * Uses standard Drive layout `MyDrive/ALL_FOR_ONE/jobs/<job_id>` and marks status
 * UNVERIFIED_PREPARED_FOR_COLAB (never claims remote execution succeeded without proof).
 */
export function prepareColabRenderPackage(
  workspaceDir: string,
  input: {
    plan: CinematicProductionPlan;
    blendRelPath: string;
    extraAssetRelPaths?: string[];
    packageDirRel?: string;
    driveBaseDir?: string;
    workerScriptTemplatePath?: string;
    qualityProfile?: T4QualityProfileId;
  },
): ColabPackageOutput {
  const pkgRel = input.packageDirRel ?? path.join('jobs', input.plan.projectId);
  const pkgAbs = assertSafeSubpathSync(workspaceDir, pkgRel);
  for (const sub of ['input', 'config', 'scripts', 'output', 'logs']) {
    fs.mkdirSync(assertSafeSubpathSync(pkgAbs, sub), { recursive: true });
  }

  const driveRoot = `${(input.driveBaseDir ?? '/content/drive/MyDrive/ALL_FOR_ONE/jobs').replace(/\/+$/, '')}/${input.plan.projectId}`;
  const qualityProfile: T4QualityProfileId = input.qualityProfile ?? 'LOOK_DEVELOPMENT';
  const profileSpec = T4_QUALITY_PROFILES[qualityProfile];

  const assetFiles: ColabJobManifest['assetFiles'] = [];
  const candidateRelPaths = [input.blendRelPath, ...(input.extraAssetRelPaths ?? [])];
  for (const rel of candidateRelPaths) {
    const abs = assertSafeSubpathSync(workspaceDir, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      assetFiles.push({
        relPath: rel.replace(/\\/g, '/'),
        sha256: sha256File(abs),
        sizeBytes: fs.statSync(abs).size,
      });
    }
  }

  const allChunks: ColabJobManifest['chunks'] = [];
  for (const shot of input.plan.shots) {
    for (const c of shot.chunks) {
      allChunks.push({
        ...c,
        shotId: shot.shotId,
        remoteOutputDir: `${driveRoot}/output/frames/${shot.shotId}`,
      });
    }
  }

  const firstShotCfg = input.plan.shots[0]?.renderConfig;
  const manifest: ColabJobManifest = {
    version: '3.2.0',
    provider: 'google-colab',
    jobType: 'blender-render',
    projectId: input.plan.projectId,
    blendRelPath: input.blendRelPath.replace(/\\/g, '/'),
    driveProjectRoot: driveRoot,
    targetGpuRequirement: {
      gpuModel: 'NVIDIA T4',
      vramTotalMb: T4_VRAM_TOTAL_MB,
      safeUsableVramMb: T4_SAFE_USABLE_VRAM_MB,
      requireDynamicSystemRamCheck: true,
      abortIfNonT4OrMissingGpu: false, // Cycles allows fallback only if explicit, strict T4 check on notebook
      singleHeavyJobOnly: true,
    },
    qualityProfile,
    outputFormat: 'PNG',
    fps: input.plan.fps,
    resolutionX: firstShotCfg?.resolutionX ?? profileSpec.resolutionX,
    resolutionY: firstShotCfg?.resolutionY ?? profileSpec.resolutionY,
    samples: firstShotCfg?.samples ?? profileSpec.samples,
    preferredDevice: 'T4_GPU_STRICT',
    assetFiles,
    chunks: allChunks,
    lifecycleState: 'READY',
    executionStatus: 'UNVERIFIED_PREPARED_FOR_COLAB',
    createdAt: new Date().toISOString(),
  };

  // Write both canonical V3.2 paths and backward-compatible top-level filenames
  const manifestPath = assertSafeSubpathSync(pkgAbs, 'colab_job_manifest.json');
  atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  atomicWriteFileSync(
    assertSafeSubpathSync(pkgAbs, 'job_manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  const checkpointsPayload = {
    jobId: input.plan.projectId,
    lifecycleState: 'READY',
    completedChunks: [] as string[],
    failedChunks: [] as string[],
    updatedAt: manifest.createdAt,
  };
  const checkpointsPath = assertSafeSubpathSync(pkgAbs, 'checkpoints.json');
  atomicWriteFileSync(checkpointsPath, JSON.stringify(checkpointsPayload, null, 2) + '\n');

  const notebookJson = buildColabNotebookJson(manifest);
  const notebookPath = assertSafeSubpathSync(pkgAbs, `afo_colab_${input.plan.projectId}.ipynb`);
  atomicWriteFileSync(notebookPath, notebookJson);

  const workerSrc =
    input.workerScriptTemplatePath && fs.existsSync(input.workerScriptTemplatePath)
      ? fs.readFileSync(input.workerScriptTemplatePath, 'utf8')
      : `# Run assets/colab/colab_blender_worker.py on Colab T4 runtime\n`;
  const workerScriptPath = assertSafeSubpathSync(pkgAbs, 'colab_blender_worker.py');
  atomicWriteFileSync(workerScriptPath, workerSrc);
  atomicWriteFileSync(assertSafeSubpathSync(pkgAbs, path.join('scripts', 'colab_blender_worker.py')), workerSrc);

  return {
    packageDir: pkgAbs,
    manifestPath,
    workerScriptPath,
    notebookPath,
    checkpointsPath,
    manifest,
  };
}

/**
 * Prepares a T4 open-weight model inference Drive job (`MyDrive/ALL_FOR_ONE/jobs/<job_id>`)
 * after verifying the selected model fits the NVIDIA T4 (16 GB VRAM) ceiling.
 */
export function prepareColabT4InferenceJob(
  workspaceDir: string,
  input: {
    jobId: string;
    modelId: string;
    inputAssetRelPaths?: string[];
    qualityProfile?: T4QualityProfileId;
    workerScriptTemplatePath?: string;
    prompt?: string;
    seed?: number;
    chunkSize?: number;
    tileSize?: number;
  },
): ColabPackageOutput {
  const compute = detectComputeProfile('colab-t4-target');
  const compat = assessModelCompatibility(input.modelId, compute);
  if (!compat.compatible) {
    throw new Error(
      `Refusing to schedule "${input.modelId}" on Colab T4: ${compat.blockers.join(' ')}`,
    );
  }

  const pkgAbs = assertSafeSubpathSync(workspaceDir, path.join('jobs', input.jobId));
  for (const sub of ['input', 'config', 'scripts', 'output', 'logs']) {
    fs.mkdirSync(assertSafeSubpathSync(pkgAbs, sub), { recursive: true });
  }

  const driveRoot = `/content/drive/MyDrive/ALL_FOR_ONE/jobs/${input.jobId}`;
  const assetFiles: ColabJobManifest['assetFiles'] = [];
  for (const rel of input.inputAssetRelPaths ?? []) {
    const abs = assertSafeSubpathSync(workspaceDir, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      assetFiles.push({
        relPath: rel.replace(/\\/g, '/'),
        sha256: sha256File(abs),
        sizeBytes: fs.statSync(abs).size,
      });
    }
  }

  const qualityProfile = input.qualityProfile ?? 'LOOK_DEVELOPMENT';
  const profileSpec = T4_QUALITY_PROFILES[qualityProfile];
  const manifest: ColabJobManifest = {
    version: '3.2.0',
    provider: 'google-colab',
    jobType: 't4-model-inference',
    projectId: input.jobId,
    blendRelPath: '',
    driveProjectRoot: driveRoot,
    targetGpuRequirement: {
      gpuModel: 'NVIDIA T4',
      vramTotalMb: T4_VRAM_TOTAL_MB,
      safeUsableVramMb: T4_SAFE_USABLE_VRAM_MB,
      requireDynamicSystemRamCheck: true,
      abortIfNonT4OrMissingGpu: true,
      singleHeavyJobOnly: true,
    },
    qualityProfile,
    modelId: input.modelId,
    outputFormat: 'GLB',
    fps: 24,
    resolutionX: profileSpec.resolutionX,
    resolutionY: profileSpec.resolutionY,
    samples: profileSpec.samples,
    preferredDevice: 'T4_GPU_STRICT',
    assetFiles,
    chunks: [
      {
        chunkId: `${input.jobId}_INFER_01`,
        shotId: 'inference',
        frameStart: 1,
        frameEnd: 1,
        frameCount: 1,
        attempts: 0,
        status: 'PENDING',
        remoteOutputDir: `${driveRoot}/output`,
      },
    ],
    lifecycleState: 'READY',
    executionStatus: 'UNVERIFIED_PREPARED_FOR_COLAB',
    createdAt: new Date().toISOString(),
  };

  const outputFormat: 'PNG' | 'GLB' =
    input.modelId === 'sdxl-base-1.0' ||
    input.modelId === 'real-esrgan' ||
    input.modelId === 'depth-anything-v2-small'
      ? 'PNG'
      : 'GLB';
  manifest.outputFormat = outputFormat;

  const manifestPath = assertSafeSubpathSync(pkgAbs, 'job_manifest.json');
  atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  atomicWriteFileSync(
    assertSafeSubpathSync(pkgAbs, 'colab_job_manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  const inferenceConfigPath = assertSafeSubpathSync(pkgAbs, path.join('config', 'inference_config.json'));
  atomicWriteFileSync(
    inferenceConfigPath,
    JSON.stringify(
      {
        modelId: input.modelId,
        fp16: true,
        outputFormat,
        chunkSize: input.chunkSize ?? 4096,
        tileSize: input.tileSize ?? 512,
        sdxlWidth: Math.min(1024, profileSpec.resolutionX),
        sdxlHeight: Math.min(1024, profileSpec.resolutionY),
        seed: input.seed ?? 42,
        prompt:
          input.prompt ??
          'Photorealistic studio render reference, physically plausible lighting, neutral background, sharp focus',
      },
      null,
      2,
    ) + '\n',
  );

  const checkpointsPath = assertSafeSubpathSync(pkgAbs, 'checkpoints.json');
  atomicWriteFileSync(
    checkpointsPath,
    JSON.stringify(
      {
        jobId: input.jobId,
        modelId: input.modelId,
        lifecycleState: 'READY',
        completedChunks: [],
        failedChunks: [],
        updatedAt: manifest.createdAt,
      },
      null,
      2,
    ) + '\n',
  );

  const notebookPath = assertSafeSubpathSync(pkgAbs, `afo_colab_${input.jobId}.ipynb`);
  atomicWriteFileSync(notebookPath, buildColabNotebookJson(manifest));

  const workerSrc =
    input.workerScriptTemplatePath && fs.existsSync(input.workerScriptTemplatePath)
      ? fs.readFileSync(input.workerScriptTemplatePath, 'utf8')
      : `# Run assets/colab/colab_blender_worker.py on Colab T4 runtime\n`;
  const workerScriptPath = assertSafeSubpathSync(pkgAbs, path.join('scripts', 'colab_blender_worker.py'));
  atomicWriteFileSync(workerScriptPath, workerSrc);

  return {
    packageDir: pkgAbs,
    manifestPath,
    workerScriptPath,
    notebookPath,
    checkpointsPath,
    manifest,
  };
}

/**
 * Validates any Colab job manifest against V3.2 Drive & T4 safety rules.
 */
export function validateColabJobManifest(
  workspaceDir: string,
  manifestRelPath: string,
): { valid: boolean; errors: string[]; warnings: string[]; manifest: ColabJobManifest | null } {
  const abs = assertSafeSubpathSync(workspaceDir, manifestRelPath);
  if (!fs.existsSync(abs)) {
    return { valid: false, errors: [`Manifest not found: ${manifestRelPath}`], warnings: [], manifest: null };
  }

  let parsed: ColabJobManifest;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8')) as ColabJobManifest;
  } catch {
    return { valid: false, errors: [`Manifest is not valid JSON: ${manifestRelPath}`], warnings: [], manifest: null };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!parsed.projectId) errors.push('Missing projectId.');
  if (!parsed.driveProjectRoot || !parsed.driveProjectRoot.includes('ALL_FOR_ONE/jobs/')) {
    warnings.push(
      `Drive root "${parsed.driveProjectRoot ?? ''}" does not follow standard MyDrive/ALL_FOR_ONE/jobs/<job_id> layout.`,
    );
  }
  if (!parsed.targetGpuRequirement || parsed.targetGpuRequirement.gpuModel !== 'NVIDIA T4') {
    errors.push('Manifest must explicitly target NVIDIA T4 (16 GB VRAM) without assuming L4/A100/H100.');
  }
  if (parsed.modelId) {
    const compat = assessModelCompatibility(parsed.modelId, detectComputeProfile('colab-t4-target'));
    if (!compat.compatible) {
      errors.push(`Model "${parsed.modelId}" failed T4 compatibility check: ${compat.blockers.join(' ')}`);
    }
  }
  if (!Array.isArray(parsed.chunks) || parsed.chunks.length === 0) {
    errors.push('Manifest contains no execution chunks.');
  }

  return { valid: errors.length === 0, errors, warnings, manifest: parsed };
}

/**
 * Reconciles downloaded remote render outputs against the expected frame ranges
 * and validates non-empty PNG signatures locally.
 */
export function reconcileRemoteRenderOutputs(
  workspaceDir: string,
  manifestRelPath: string,
  downloadedFramesRootRel: string,
): RemoteReconciliationReport {
  const manifestAbs = assertSafeSubpathSync(workspaceDir, manifestRelPath);
  const manifest = JSON.parse(fs.readFileSync(manifestAbs, 'utf8')) as ColabJobManifest;
  const framesRootAbs = assertSafeSubpathSync(workspaceDir, downloadedFramesRootRel);

  let completedChunks = 0;
  const missingFrames: number[] = [];
  const corruptFrames: string[] = [];
  const resumeManifestChunkIds: string[] = [];

  for (const chunk of manifest.chunks) {
    const shotDir = assertSafeSubpathSync(framesRootAbs, chunk.shotId);
    let chunkOk = true;
    for (let f = chunk.frameStart; f <= chunk.frameEnd; f++) {
      const fname = `frame_${String(f).padStart(4, '0')}.png`;
      const full = path.join(shotDir, fname);
      if (!fs.existsSync(full)) {
        missingFrames.push(f);
        chunkOk = false;
        continue;
      }
      const buf = fs.readFileSync(full);
      const isPng =
        buf.length >= 64 &&
        buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      if (!isPng) {
        corruptFrames.push(path.join(chunk.shotId, fname));
        chunkOk = false;
      }
    }
    if (chunkOk) {
      completedChunks += 1;
      chunk.status = 'COMPLETED';
    } else {
      chunk.status = 'PENDING';
      resumeManifestChunkIds.push(chunk.chunkId);
    }
  }

  const totalChunks = manifest.chunks.length;
  const status: RemoteReconciliationReport['status'] =
    corruptFrames.length > 0
      ? 'FAILED'
      : completedChunks === totalChunks && totalChunks > 0
        ? 'VERIFIED'
        : completedChunks > 0
          ? 'PARTIALLY_VERIFIED'
          : 'UNVERIFIED';

  manifest.executionStatus =
    status === 'VERIFIED'
      ? 'VERIFIED'
      : status === 'FAILED'
        ? 'FAILED'
        : status === 'PARTIALLY_VERIFIED'
          ? 'PARTIALLY_VERIFIED'
          : 'UNVERIFIED_PREPARED_FOR_COLAB';
  manifest.lifecycleState =
    status === 'VERIFIED'
      ? 'COMPLETED'
      : status === 'FAILED'
        ? 'FAILED'
        : status === 'PARTIALLY_VERIFIED'
          ? 'PARTIALLY_COMPLETED'
          : 'UNVERIFIED';
  atomicWriteFileSync(manifestAbs, JSON.stringify(manifest, null, 2) + '\n');

  return {
    status,
    completedChunks,
    totalChunks,
    missingFrames,
    corruptFrames,
    resumeManifestChunkIds,
    notes:
      status === 'VERIFIED'
        ? `All ${totalChunks} remote chunk(s) verified with valid PNG frames.`
        : `${completedChunks}/${totalChunks} chunk(s) verified; ${missingFrames.length} missing and ${corruptFrames.length} corrupt frame(s) queued for resume.`,
  };
}
