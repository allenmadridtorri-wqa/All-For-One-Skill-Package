import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FrameRangeChunk } from './blender-bridge.ts';
import type { CinematicProductionPlan } from './cinematic-production.ts';
import { detectHardwareProfile, type HardwareProfile } from './production-intelligence.ts';
import { assertSafeSubpathSync, atomicWriteFileSync } from './security.ts';

export type RemoteProviderId = 'google-colab' | 'google-cloud-gce' | (string & {});

export interface RemoteProviderProfile {
  id: RemoteProviderId;
  displayName: string;
  supportsPersistentDrive: boolean;
  typicalSessionLimitHours: number | null;
  requiresInteractiveAuth: boolean;
  notes: string;
}

export interface RemoteRenderRoutingDecision {
  recommendOffload: boolean;
  provider: RemoteProviderId;
  reason: string;
  localHardwareSummary: string;
  sessionCaveats: string[];
}

export interface ColabJobManifest {
  version: '3.1.0';
  provider: RemoteProviderId;
  projectId: string;
  blendRelPath: string;
  driveProjectRoot: string;
  outputFormat: 'PNG';
  fps: number;
  resolutionX: number;
  resolutionY: number;
  samples: number;
  preferredDevice: 'AUTO_GPU_ELSE_CPU';
  assetFiles: Array<{ relPath: string; sha256: string; sizeBytes: number }>;
  chunks: Array<
    FrameRangeChunk & {
      shotId: string;
      remoteOutputDir: string;
    }
  >;
  executionStatus: 'UNVERIFIED_PREPARED_FOR_COLAB' | 'PARTIALLY_VERIFIED' | 'VERIFIED' | 'FAILED';
  createdAt: string;
}

export interface ColabPackageOutput {
  packageDir: string;
  manifestPath: string;
  workerScriptPath: string;
  notebookPath: string;
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
      displayName: 'Google Colab GPU Runtime (T4 / L4 / A100 + Drive Persistence)',
      supportsPersistentDrive: true,
      typicalSessionLimitHours: 12,
      requiresInteractiveAuth: true,
      notes:
        'Sessions are ephemeral and can disconnect or time out; mount Google Drive for every checkpoint and frame output.',
    });
    this.register({
      id: 'google-cloud-gce',
      displayName: 'Google Cloud Compute Engine GPU VM (Preemptible/Standard + GCS)',
      supportsPersistentDrive: true,
      typicalSessionLimitHours: null,
      requiresInteractiveAuth: true,
      notes: 'Requires active GCP billing/project quotas and gsutil/GCS bucket configuration.',
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
 * should offload Blender rendering to Google Colab / Cloud GPU.
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
      ? `Local hardware (${hardware.cpuCores} cores, ${hardware.totalMemoryMb} MB RAM, tier=${hardware.tier}) is unsuitable for sustained ${renderEngine} multi-frame rendering (${totalFrames} frames). Offload chunks to Google Colab GPU with Google Drive checkpoint persistence.`
      : `Local workstation (${hardware.cpuCores} cores, ${hardware.totalMemoryMb} MB RAM) can run local renders or optionally burst to Colab.`,
    localHardwareSummary: `${hardware.cpuCores} CPU cores, ${hardware.totalMemoryMb} MB total RAM (${hardware.freeMemoryMb} MB free), tier=${hardware.tier}`,
    sessionCaveats: [
      'Google Colab sessions are NOT permanent and disconnect after idle or max runtime limits (~12h or quota cap).',
      'Always mount Google Drive (/content/drive/MyDrive/AFO_Renders) and write frames per chunk so interrupted jobs resume without data loss.',
      'User must authenticate Google Drive and select a GPU runtime in Colab.',
    ],
  };
}

function sha256File(absPath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function buildColabNotebookJson(projectId: string, driveProjectRoot: string): string {
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      accelerator: 'GPU',
      colab: { name: `AllForOne_${projectId}_Render.ipynb`, proven_gpu: true },
    },
    cells: [
      {
        cell_type: 'markdown',
        metadata: {},
        source: [
          `# All-For-One V3.1 — Remote Colab Blender GPU Renderer (${projectId})\n`,
          `- Persistent Drive Root: \`${driveProjectRoot}\`\n`,
          `- Safe against Colab disconnects: renders frame-range chunks directly into Drive with JSON checkpoints.\n`,
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          'from google.colab import drive\n',
          "drive.mount('/content/drive')\n",
          '!nvidia-smi || echo "No GPU attached; worker will fall back to CPU safely."\n',
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# Install Blender 4.2 LTS on Colab Linux runtime if missing\n',
          'import os, shutil\n',
          'if not shutil.which("blender"):\n',
          '    !wget -q https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz -O /tmp/blender.tar.xz\n',
          '    !tar -xf /tmp/blender.tar.xz -C /opt && ln -sf /opt/blender-4.2.3-linux-x64/blender /usr/local/bin/blender\n',
          '!blender --version\n',
        ],
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          `PROJECT_ROOT = ${JSON.stringify(driveProjectRoot)}\n`,
          '!python3 "{PROJECT_ROOT}/colab_blender_worker.py" --manifest "{PROJECT_ROOT}/colab_job_manifest.json"\n',
        ],
      },
    ],
  };
  return JSON.stringify(nb, null, 2) + '\n';
}

/**
 * Prepares a self-contained, hash-verified Google Colab render package inside the workspace.
 * Marks status UNVERIFIED_PREPARED_FOR_COLAB (never claims remote execution succeeded without proof).
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
  },
): ColabPackageOutput {
  const pkgRel = input.packageDirRel ?? path.join('remote-jobs', input.plan.projectId);
  const pkgAbs = assertSafeSubpathSync(workspaceDir, pkgRel);
  fs.mkdirSync(pkgAbs, { recursive: true });

  const driveRoot = `${(input.driveBaseDir ?? '/content/drive/MyDrive/AFO_Renders').replace(/\/+$/, '')}/${input.plan.projectId}`;

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
        remoteOutputDir: `${driveRoot}/frames/${shot.shotId}`,
      });
    }
  }

  const firstShotCfg = input.plan.shots[0]?.renderConfig;
  const manifest: ColabJobManifest = {
    version: '3.1.0',
    provider: 'google-colab',
    projectId: input.plan.projectId,
    blendRelPath: input.blendRelPath.replace(/\\/g, '/'),
    driveProjectRoot: driveRoot,
    outputFormat: 'PNG',
    fps: input.plan.fps,
    resolutionX: firstShotCfg?.resolutionX ?? 1920,
    resolutionY: firstShotCfg?.resolutionY ?? 1080,
    samples: firstShotCfg?.samples ?? 64,
    preferredDevice: 'AUTO_GPU_ELSE_CPU',
    assetFiles,
    chunks: allChunks,
    executionStatus: 'UNVERIFIED_PREPARED_FOR_COLAB',
    createdAt: new Date().toISOString(),
  };

  const manifestPath = assertSafeSubpathSync(pkgAbs, 'colab_job_manifest.json');
  atomicWriteFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const notebookPath = assertSafeSubpathSync(pkgAbs, `afo_colab_${input.plan.projectId}.ipynb`);
  atomicWriteFileSync(notebookPath, buildColabNotebookJson(input.plan.projectId, driveRoot));

  const workerSrc =
    input.workerScriptTemplatePath && fs.existsSync(input.workerScriptTemplatePath)
      ? fs.readFileSync(input.workerScriptTemplatePath, 'utf8')
      : `# Run assets/colab/colab_blender_worker.py on Colab runtime\n`;
  const workerScriptPath = assertSafeSubpathSync(pkgAbs, 'colab_blender_worker.py');
  atomicWriteFileSync(workerScriptPath, workerSrc);

  return {
    packageDir: pkgAbs,
    manifestPath,
    workerScriptPath,
    notebookPath,
    manifest,
  };
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
