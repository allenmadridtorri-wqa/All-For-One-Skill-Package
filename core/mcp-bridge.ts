import fs from 'node:fs';
import path from 'node:path';
import {
  inspectRenderArtifactFile,
  validateGeneratedAssetFile,
} from './asset-validation.ts';
import { createCinematicProductionPlan } from './cinematic-production.ts';
import {
  prepareColabRenderPackage,
  prepareColabT4InferenceJob,
  reconcileRemoteRenderOutputs,
  T4_QUALITY_PROFILES,
  validateColabJobManifest,
  type ColabJobManifest,
  type T4QualityProfileId,
} from './cloud-rendering.ts';
import {
  assessModelCompatibility,
  detectComputeProfile,
  getModelById,
  listModels,
  OPEN_ASSET_SOURCES,
  type ModelCategory,
} from './model-registry.ts';
import { assertSafeSubpathSync } from './security.ts';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface McpToolCallResult {
  ok: boolean;
  tool: string;
  data?: unknown;
  error?: string;
}

export const MCP_BRIDGE_TOOLS: McpToolDefinition[] = [
  {
    name: 'get_compute_profile',
    description:
      'Detect host CPU/RAM dynamically and return enforced Google Colab NVIDIA T4 (16 GB VRAM) + Standard RAM execution constraints.',
    inputSchema: {
      type: 'object',
      properties: {
        targetMode: { type: 'string', enum: ['local', 'colab-t4-target'] },
      },
    },
  },
  {
    name: 'list_compatible_models',
    description:
      'List verified open-weight models filtered by T4 (16 GB VRAM) compatibility, category, license, and open-source asset catalogs.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['image-generation', '3d-generation', 'asset-enhancement', 'animation-video'],
        },
        t4Only: { type: 'boolean' },
        commercialOnly: { type: 'boolean' },
        includeOpenAssetSources: { type: 'boolean' },
      },
    },
  },
  {
    name: 'inspect_model_requirements',
    description:
      'Inspect exact code license, weight license, commercial terms, geographic exclusions, VRAM/RAM headroom, and T4 status for one model.',
    inputSchema: {
      type: 'object',
      properties: {
        modelId: { type: 'string' },
        requireCommercial: { type: 'boolean' },
        userRegion: { type: 'string' },
      },
      required: ['modelId'],
    },
  },
  {
    name: 'prepare_colab_job',
    description:
      'Package a persistent Google Drive Colab T4 job under jobs/<job_id>/ (MyDrive/ALL_FOR_ONE/jobs/<job_id>) without requiring any always-on Colab server.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        jobType: { type: 'string', enum: ['blender-render', 't4-model-inference'] },
        modelId: { type: 'string' },
        blendRelPath: { type: 'string' },
        inputAssetRelPaths: { type: 'array', items: { type: 'string' } },
        durationSec: { type: 'number' },
        fps: { type: 'number' },
        qualityProfile: { type: 'string', enum: ['PREVIEW', 'LOOK_DEVELOPMENT', 'FINAL_T4_RENDER'] },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'validate_job_manifest',
    description: 'Validate a prepared Colab T4 Drive job manifest against VRAM, Drive layout, and safety constraints.',
    inputSchema: {
      type: 'object',
      properties: {
        manifestRelPath: { type: 'string' },
      },
      required: ['manifestRelPath'],
    },
  },
  {
    name: 'get_job_status',
    description: 'Read current checkpoint status and lifecycle state from a Colab Drive job directory.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'inspect_job_outputs',
    description: 'List and inspect output files (GLB, PNG, logs) inside jobs/<job_id>/output.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'import_colab_results',
    description:
      'Verify and reconcile downloaded Colab Drive job results (PNG frames or GLB meshes) against the manifest.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string' },
        framesRootRel: { type: 'string' },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'validate_generated_asset',
    description:
      'Validate binary GLB, glTF, or FBX geometry, attributes (POSITION/NORMAL/TEXCOORD_0), PBR materials, and scale.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'inspect_render_artifacts',
    description:
      'Inspect rendered PNG/JPEG/WEBP files on disk for magic bytes, resolution, and explicit visual acceptance criteria.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        criteria: { type: 'array', items: { type: 'string' } },
      },
      required: ['filePath'],
    },
  },
];

function collectOutputFiles(dir: string, root: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectOutputFiles(full, root));
    } else if (entry.isFile()) {
      out.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

export function executeMcpTool(
  toolName: string,
  rawArgs: Record<string, unknown> = {},
  workspaceDir: string = process.cwd(),
): McpToolCallResult {
  try {
    if (toolName === 'get_compute_profile') {
      const targetMode =
        rawArgs.targetMode === 'local' ? 'local' : 'colab-t4-target';
      return {
        ok: true,
        tool: toolName,
        data: {
          computeProfile: detectComputeProfile(targetMode),
          t4QualityProfiles: T4_QUALITY_PROFILES,
        },
      };
    }

    if (toolName === 'list_compatible_models') {
      const models = listModels({
        category: rawArgs.category as ModelCategory | undefined,
        t4Only: rawArgs.t4Only !== false,
        commercialOnly: Boolean(rawArgs.commercialOnly),
      });
      return {
        ok: true,
        tool: toolName,
        data: {
          models,
          openAssetSources: rawArgs.includeOpenAssetSources ? OPEN_ASSET_SOURCES : undefined,
        },
      };
    }

    if (toolName === 'inspect_model_requirements') {
      const modelId = String(rawArgs.modelId ?? '').trim();
      if (!modelId) return { ok: false, tool: toolName, error: 'Missing required parameter: modelId' };
      const model = getModelById(modelId);
      const compute = detectComputeProfile('colab-t4-target');
      const compatibility = assessModelCompatibility(modelId, compute, {
        requireCommercial: Boolean(rawArgs.requireCommercial),
        userRegion: typeof rawArgs.userRegion === 'string' ? rawArgs.userRegion : undefined,
      });
      return {
        ok: Boolean(model),
        tool: toolName,
        data: { model: model ?? null, compatibility, computeProfile: compute },
        error: model ? undefined : `Unknown modelId "${modelId}"`,
      };
    }

    if (toolName === 'prepare_colab_job') {
      const jobId = String(rawArgs.jobId ?? '').trim();
      if (!jobId) return { ok: false, tool: toolName, error: 'Missing required parameter: jobId' };
      const workerTemplate = path.join(workspaceDir, 'assets', 'colab', 'colab_blender_worker.py');
      const qualityProfile =
        (rawArgs.qualityProfile as T4QualityProfileId | undefined) ?? 'LOOK_DEVELOPMENT';
      const jobType = rawArgs.jobType === 't4-model-inference' ? 't4-model-inference' : 'blender-render';

      if (jobType === 't4-model-inference') {
        const modelId = String(rawArgs.modelId ?? 'triposr');
        const pkg = prepareColabT4InferenceJob(workspaceDir, {
          jobId,
          modelId,
          inputAssetRelPaths: Array.isArray(rawArgs.inputAssetRelPaths)
            ? rawArgs.inputAssetRelPaths.map(String)
            : [],
          qualityProfile,
          workerScriptTemplatePath: fs.existsSync(workerTemplate) ? workerTemplate : undefined,
        });
        return { ok: true, tool: toolName, data: pkg };
      }

      const plan = createCinematicProductionPlan({
        projectId: jobId,
        title: `Colab T4 Job ${jobId}`,
        creativeBrief: 'T4 chunked render job',
        durationSec: Number(rawArgs.durationSec ?? 4),
        fps: Number(rawArgs.fps ?? 24),
        chunkSizeFrames: 24,
      });
      const pkg = prepareColabRenderPackage(workspaceDir, {
        plan,
        blendRelPath: String(rawArgs.blendRelPath ?? 'scenes/scene.blend'),
        extraAssetRelPaths: Array.isArray(rawArgs.inputAssetRelPaths)
          ? rawArgs.inputAssetRelPaths.map(String)
          : [],
        qualityProfile,
        workerScriptTemplatePath: fs.existsSync(workerTemplate) ? workerTemplate : undefined,
      });
      return { ok: true, tool: toolName, data: pkg };
    }

    if (toolName === 'validate_job_manifest') {
      const manifestRelPath = String(rawArgs.manifestRelPath ?? '').trim();
      if (!manifestRelPath) {
        return { ok: false, tool: toolName, error: 'Missing required parameter: manifestRelPath' };
      }
      const res = validateColabJobManifest(workspaceDir, manifestRelPath);
      return { ok: res.valid, tool: toolName, data: res, error: res.errors.join(' ') || undefined };
    }

    if (toolName === 'get_job_status') {
      const jobId = String(rawArgs.jobId ?? '').trim();
      if (!jobId) return { ok: false, tool: toolName, error: 'Missing required parameter: jobId' };
      const jobDir = assertSafeSubpathSync(workspaceDir, path.join('jobs', jobId));
      const manifestAbs = path.join(jobDir, 'job_manifest.json');
      const compatAbs = path.join(jobDir, 'colab_job_manifest.json');
      const targetManifest = fs.existsSync(manifestAbs) ? manifestAbs : compatAbs;
      if (!fs.existsSync(targetManifest)) {
        return {
          ok: true,
          tool: toolName,
          data: { jobId, lifecycleState: 'UNVERIFIED', exists: false },
        };
      }
      const manifest = JSON.parse(fs.readFileSync(targetManifest, 'utf8')) as ColabJobManifest;
      const ckptPath = path.join(jobDir, 'checkpoints.json');
      const checkpoints = fs.existsSync(ckptPath)
        ? JSON.parse(fs.readFileSync(ckptPath, 'utf8'))
        : null;
      return {
        ok: true,
        tool: toolName,
        data: {
          jobId,
          exists: true,
          lifecycleState: manifest.lifecycleState ?? 'UNVERIFIED',
          executionStatus: manifest.executionStatus,
          completedChunks: manifest.chunks.filter((c) => c.status === 'COMPLETED').length,
          totalChunks: manifest.chunks.length,
          checkpoints,
        },
      };
    }

    if (toolName === 'inspect_job_outputs') {
      const jobId = String(rawArgs.jobId ?? '').trim();
      if (!jobId) return { ok: false, tool: toolName, error: 'Missing required parameter: jobId' };
      const outDir = assertSafeSubpathSync(workspaceDir, path.join('jobs', jobId, 'output'));
      const files = collectOutputFiles(outDir, workspaceDir);
      return {
        ok: true,
        tool: toolName,
        data: { jobId, outputCount: files.length, files },
      };
    }

    if (toolName === 'import_colab_results') {
      const jobId = String(rawArgs.jobId ?? '').trim();
      if (!jobId) return { ok: false, tool: toolName, error: 'Missing required parameter: jobId' };
      const manifestRel = fs.existsSync(
        assertSafeSubpathSync(workspaceDir, path.join('jobs', jobId, 'job_manifest.json')),
      )
        ? path.join('jobs', jobId, 'job_manifest.json')
        : path.join('jobs', jobId, 'colab_job_manifest.json');
      const framesRootRel = String(rawArgs.framesRootRel ?? path.join('jobs', jobId, 'output', 'frames'));
      const reconciliation = reconcileRemoteRenderOutputs(workspaceDir, manifestRel, framesRootRel);
      return { ok: true, tool: toolName, data: reconciliation };
    }

    if (toolName === 'validate_generated_asset') {
      const filePath = String(rawArgs.filePath ?? '').trim();
      if (!filePath) return { ok: false, tool: toolName, error: 'Missing required parameter: filePath' };
      const report = validateGeneratedAssetFile(workspaceDir, filePath);
      return { ok: report.status !== 'FAILED', tool: toolName, data: report };
    }

    if (toolName === 'inspect_render_artifacts') {
      const filePath = String(rawArgs.filePath ?? '').trim();
      if (!filePath) return { ok: false, tool: toolName, error: 'Missing required parameter: filePath' };
      const criteria = Array.isArray(rawArgs.criteria) ? rawArgs.criteria.map(String) : [];
      const inspection = inspectRenderArtifactFile(workspaceDir, filePath, criteria);
      return { ok: inspection.status !== 'FAILED', tool: toolName, data: inspection };
    }

    return { ok: false, tool: toolName, error: `Unknown MCP bridge tool: "${toolName}"` };
  } catch (err) {
    return {
      ok: false,
      tool: toolName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
