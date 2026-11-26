import {
  assessModelCompatibility,
  detectComputeProfile,
  OPEN_ASSET_SOURCES,
  type ComputeProfile,
  type ModelCompatibilityAssessment,
} from './model-registry.ts';
import type { EngineId } from './engine-profiles.ts';

export type VisualTaskDomain =
  | 'product-vehicle'
  | 'architecture-interior'
  | 'natural-landscape'
  | 'character-creature'
  | 'playable-3d-scene';

export type ExecutionBackend =
  | 'local-blender-and-engine'
  | 'hosted-free-hf-space-with-colab-fallback'
  | 'colab-t4-drive-job'
  | 'blocked-paid-api-disabled';

export type ProductionArtifactKind =
  | 'concept-image'
  | 'ai-raw-mesh'
  | 'refined-pbr-asset'
  | 'completed-scene'
  | 'playable-environment';

export interface ProductionStageRecommendation {
  stageNumber: number;
  stageName: string;
  targetArtifact: ProductionArtifactKind;
  recommendedToolOrModel: string;
  modelCompatibility?: ModelCompatibilityAssessment;
  openAssetSources: string[];
  criticalQualityRule: string;
}

export interface TaskRoutingPlan {
  taskDomain: VisualTaskDomain;
  engine: EngineId | 'blender-only';
  executionBackend: ExecutionBackend;
  zeroPaidApiEnforced: boolean;
  hostedSpaceFallbackToColab: boolean;
  computeProfile: ComputeProfile;
  artifactDistinctionPolicy: string[];
  stages: ProductionStageRecommendation[];
  selectedModelIds: string[];
  rejectedModels: Array<{ modelId: string; reason: string }>;
  warnings: string[];
}

export interface RouteProductionOptions {
  taskDomain: VisualTaskDomain;
  engine?: EngineId | 'blender-only';
  allowPaidApi?: boolean;
  preferHostedSpace?: boolean;
  hostedSpaceReachable?: boolean;
  requireCommercialLicense?: boolean;
  userRegion?: string;
  computeProfile?: ComputeProfile;
}

const ARTIFACT_DISTINCTION_POLICY = [
  '1. Concept Image (2D PNG) is NEVER a 3D asset.',
  '2. AI-Generated Raw Mesh (TripoSR / SF3D / Hunyuan3D) is a sculptural blockout — NEVER production-ready without retopology, UV validation, and PBR calibration.',
  '3. Refined PBR Asset requires clean geometry, normalized real-world scale, UVs, and roughness/metallic/normal maps.',
  '4. Completed Scene combines assets, lighting, atmosphere, and ACES camera framing — not yet gameplay-ready.',
  '5. Playable Environment requires collision meshes, LODs, frame-time budgeting, and engine verification.',
];

/**
 * Selects appropriate tools, free/open assets, and T4-compatible generative models
 * per production stage without forcing one model across every task or relying on paid APIs.
 */
export function routeProductionTask(options: RouteProductionOptions): TaskRoutingPlan {
  const compute = options.computeProfile ?? detectComputeProfile('colab-t4-target');
  const engine = options.engine ?? 'blender-only';
  const allowPaid = options.allowPaidApi ?? false;
  const preferHosted = options.preferHostedSpace ?? false;
  const hostedReachable = options.hostedSpaceReachable ?? false;

  const evalOpts = {
    requireCommercial: options.requireCommercialLicense ?? false,
    userRegion: options.userRegion,
    allowPaidApi: allowPaid,
  };

  const evalModel = (id: string) => assessModelCompatibility(id, compute, evalOpts);
  const warnings: string[] = [];
  const rejectedModels: Array<{ modelId: string; reason: string }> = [];

  // Explicitly evaluate TRELLIS.2 to surface T4 rejection transparently
  const trellis2Check = evalModel('trellis-2');
  if (!trellis2Check.compatible) {
    rejectedModels.push({
      modelId: 'trellis-2',
      reason: trellis2Check.blockers.join(' '),
    });
  }

  // Pick best compatible 3D blockout generator for T4 when needed
  const pickBlockout3dModel = (): { id: string; assessment: ModelCompatibilityAssessment } => {
    for (const candidate of ['triposr', 'stable-fast-3d', 'hunyuan3d-2']) {
      const res = evalModel(candidate);
      if (res.compatible) return { id: candidate, assessment: res };
      rejectedModels.push({ modelId: candidate, reason: res.blockers.join(' ') });
    }
    return { id: 'triposr', assessment: evalModel('triposr') };
  };

  const conceptEval = evalModel('sdxl-base-1.0');
  const upscaleEval = evalModel('real-esrgan');
  const depthEval = evalModel('depth-anything-v2-small');
  const blockout3d = pickBlockout3dModel();

  let executionBackend: ExecutionBackend = 'colab-t4-drive-job';
  let hostedSpaceFallbackToColab = false;

  if (!compute.gpuDetectedLocally && !preferHosted) {
    executionBackend = 'colab-t4-drive-job';
  } else if (preferHosted) {
    if (hostedReachable) {
      executionBackend = 'hosted-free-hf-space-with-colab-fallback';
    } else {
      executionBackend = 'colab-t4-drive-job';
      hostedSpaceFallbackToColab = true;
      warnings.push(
        'Hosted Hugging Face Space unavailable or cold-sleeping; routed cleanly to Google Colab T4 Drive job fallback.',
      );
    }
  } else if (compute.gpuDetectedLocally && engine !== 'blender-only') {
    executionBackend = 'local-blender-and-engine';
  }

  if (!allowPaid) {
    warnings.push('Zero-paid-API mode active: proprietary paid inference APIs are disabled.');
  }

  const stages: ProductionStageRecommendation[] = [];
  const selectedModelIds = new Set<string>();

  if (options.taskDomain === 'product-vehicle') {
    selectedModelIds.add('sdxl-base-1.0');
    selectedModelIds.add('real-esrgan');
    stages.push(
      {
        stageNumber: 1,
        stageName: 'Reference & Silhouette Concept',
        targetArtifact: 'concept-image',
        recommendedToolOrModel: 'SDXL Base 1.0 (FP16 on T4) + orthographic reference sheets',
        modelCompatibility: conceptEval,
        openAssetSources: ['poly-haven'],
        criticalQualityRule: 'Lock wheel base, ground clearance, and real-world metric dimensions before modeling.',
      },
      {
        stageNumber: 2,
        stageName: 'Hard-Surface Hero Modeling',
        targetArtifact: 'ai-raw-mesh',
        recommendedToolOrModel:
          'Blender Sub-D / Bevel + Mirror modeling (prefer manual/scripted hard-surface topology over raw AI 3D for crisp car/product panels)',
        openAssetSources: ['kenney'],
        criticalQualityRule: 'Maintain clean quad loops around panel gaps, headlights, and wheel arches.',
      },
      {
        stageNumber: 3,
        stageName: 'Automotive / Product PBR Shading',
        targetArtifact: 'refined-pbr-asset',
        recommendedToolOrModel: 'Blender Principled BSDF (Coat Weight, Metallic, Micro-Roughness) + Real-ESRGAN tiled textures',
        modelCompatibility: upscaleEval,
        openAssetSources: ['ambientcg', 'poly-haven'],
        criticalQualityRule: 'Verify UVs, non-zero roughness micro-detail, glass IOR (1.45-1.52), and brake/tire roughness contrast.',
      },
      {
        stageNumber: 4,
        stageName: 'Studio / Road Look-Dev Lighting',
        targetArtifact: 'completed-scene',
        recommendedToolOrModel: 'Poly Haven CC0 HDRI + softbox Area Lights + ACES Filmic (Colab T4 Look-Dev / Final Profile)',
        openAssetSources: ['poly-haven'],
        criticalQualityRule: 'Inspect specular rolloff across curved fenders before final render.',
      },
    );
  } else if (options.taskDomain === 'architecture-interior') {
    selectedModelIds.add('sdxl-base-1.0');
    selectedModelIds.add('real-esrgan');
    stages.push(
      {
        stageNumber: 1,
        stageName: 'Architectural Floorplan & Lighting Mood',
        targetArtifact: 'concept-image',
        recommendedToolOrModel: 'SDXL Base 1.0 + real-world ceiling/doorway dimensions (2.7m-3.2m ceilings, 0.9m doors)',
        modelCompatibility: conceptEval,
        openAssetSources: ['poly-haven'],
        criticalQualityRule: 'Enforce strict 1 unit = 1 meter scale and real wall thickness.',
      },
      {
        stageNumber: 2,
        stageName: 'Modular Structural Shell & Hero Props',
        targetArtifact: 'ai-raw-mesh',
        recommendedToolOrModel: `Blender architectural kit + ${blockout3d.id} only for secondary organic decor props`,
        modelCompatibility: blockout3d.assessment,
        openAssetSources: ['quaternius', 'kenney'],
        criticalQualityRule: 'Add bevel modifiers (2-5 mm) to architectural edges so rim highlights catch light naturally.',
      },
      {
        stageNumber: 3,
        stageName: 'Calibrated Interior PBR & Portal Lighting',
        targetArtifact: 'completed-scene',
        recommendedToolOrModel: 'ambientCG CC0 wood/stone/plaster + Cycles Light Portals + OIDN Denoiser',
        modelCompatibility: upscaleEval,
        openAssetSources: ['ambientcg', 'poly-haven'],
        criticalQualityRule: 'Avoid clipped whites; keep plaster albedo <= 0.85 linear.',
      },
    );
  } else if (options.taskDomain === 'natural-landscape') {
    selectedModelIds.add('depth-anything-v2-small');
    selectedModelIds.add('real-esrgan');
    stages.push(
      {
        stageNumber: 1,
        stageName: 'Heightmap & Atmospheric Mood Reference',
        targetArtifact: 'concept-image',
        recommendedToolOrModel: 'Depth Anything V2 Small (Apache-2.0 depth map) + terrain elevation design',
        modelCompatibility: depthEval,
        openAssetSources: ['poly-haven'],
        criticalQualityRule: 'Keep terrain slope transitions eroded and believable; separate macro/micro scales.',
      },
      {
        stageNumber: 2,
        stageName: 'Foliage, Rocks & Scatter Instancing',
        targetArtifact: 'refined-pbr-asset',
        recommendedToolOrModel: 'CC0 nature kits (Quaternius) / Blender Geometry Nodes scatter + triplanar ground blending',
        openAssetSources: ['quaternius', 'ambientcg'],
        criticalQualityRule: 'Use instancing + LODs; never duplicate heavy hero trees without instancing.',
      },
      {
        stageNumber: 3,
        stageName: 'Sky Atmosphere & Volumetric Depth',
        targetArtifact: 'completed-scene',
        recommendedToolOrModel: 'Nishita Sky Texture / Poly Haven HDRI + height-falloff distance fog (Colab T4)',
        openAssetSources: ['poly-haven'],
        criticalQualityRule: 'Verify horizon fade, foreground/midground/background contrast layers.',
      },
    );
  } else if (options.taskDomain === 'character-creature') {
    selectedModelIds.add('sdxl-base-1.0');
    selectedModelIds.add(blockout3d.id);
    stages.push(
      {
        stageNumber: 1,
        stageName: 'Character Orthographic Turnaround',
        targetArtifact: 'concept-image',
        recommendedToolOrModel: 'SDXL Base 1.0 A-Pose front/side reference',
        modelCompatibility: conceptEval,
        openAssetSources: [],
        criticalQualityRule: 'Lock proportions and silhouette readability before 3D sculpting/generation.',
      },
      {
        stageNumber: 2,
        stageName: 'Base Blockout & Clean Deformation Retopology',
        targetArtifact: 'ai-raw-mesh',
        recommendedToolOrModel: `${blockout3d.id} (Colab T4 single-job) -> Mandatory Blender retopology`,
        modelCompatibility: blockout3d.assessment,
        openAssetSources: ['quaternius'],
        criticalQualityRule: 'AI triangle soup MUST be retopologized into clean joint edge loops before rigging.',
      },
      {
        stageNumber: 3,
        stageName: 'PBR Skin/Cloth, Weight Painting & Rigify/Mocap',
        targetArtifact: 'refined-pbr-asset',
        recommendedToolOrModel: 'Rigify / IK-FK + SSS skin shader + <= 4 bone weights/vertex export',
        openAssetSources: ['ambientcg'],
        criticalQualityRule: 'Test extreme shoulder/knee poses to eliminate skinning collapse.',
      },
    );
  } else {
    // playable-3d-scene
    selectedModelIds.add(blockout3d.id);
    selectedModelIds.add('real-esrgan');
    stages.push(
      {
        stageNumber: 1,
        stageName: 'Gameplay Layout & Sightlines Blockout',
        targetArtifact: 'completed-scene',
        recommendedToolOrModel: `Modular whitebox + ${blockout3d.id} prop accents -> GLB/FBX export`,
        modelCompatibility: blockout3d.assessment,
        openAssetSources: ['kenney', 'quaternius', 'poly-haven'],
        criticalQualityRule: 'Verify player spawn clearance, camera sightlines, and traversal dimensions first.',
      },
      {
        stageNumber: 2,
        stageName: 'PBR Optimization & LOD/Collision Baking',
        targetArtifact: 'refined-pbr-asset',
        recommendedToolOrModel: 'BlenderLOD decimation + Real-ESRGAN texture atlas + collision bounds',
        modelCompatibility: upscaleEval,
        openAssetSources: ['ambientcg'],
        criticalQualityRule: 'Enforce engine material/draw-call budgets and real PBR texture packing.',
      },
      {
        stageNumber: 3,
        stageName: `Playable Engine Integration (${engine})`,
        targetArtifact: 'playable-environment',
        recommendedToolOrModel: `${engine} zero-GC ECS loop + frustum culling + interactive QA capture`,
        openAssetSources: OPEN_ASSET_SOURCES.filter((s) => !s.requiresPerAssetLicenseCheck).map((s) => s.id),
        criticalQualityRule: 'Do not confuse a static beauty render with a playable environment; verify runtime frame time.',
      },
    );
  }

  return {
    taskDomain: options.taskDomain,
    engine,
    executionBackend,
    zeroPaidApiEnforced: !allowPaid,
    hostedSpaceFallbackToColab,
    computeProfile: compute,
    artifactDistinctionPolicy: ARTIFACT_DISTINCTION_POLICY,
    stages,
    selectedModelIds: [...selectedModelIds],
    rejectedModels,
    warnings,
  };
}
