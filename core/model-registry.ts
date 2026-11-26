import fs from 'node:fs';
import os from 'node:os';

export type ModelCategory =
  | 'image-generation'
  | '3d-generation'
  | 'asset-enhancement'
  | 'animation-video';

export type ModelLifecycleStatus =
  | 'DISCOVERED'
  | 'LICENSE_REVIEWED'
  | 'HARDWARE_ASSESSED'
  | 'ADAPTER_IMPLEMENTED'
  | 'ENDPOINT_TESTED'
  | 'INFERENCE_TESTED'
  | 'OUTPUT_VERIFIED';

export type T4CompatibilityClass =
  | 'fits-natively'
  | 'fits-with-reduced-settings'
  | 'experimental-offload'
  | 'incompatible-exceeds-vram'
  | 'requires-paid-api';

export interface ModelCapabilityEntry {
  id: string;
  name: string;
  category: ModelCategory;
  purpose: string;
  providerOrAuthors: string;
  repoUrl: string;
  modelCardUrl?: string;
  hfSpaceId?: string;
  colabNotebookSupported: boolean;
  codeLicense: string;
  weightLicense: string;
  commercialAllowed: boolean;
  commercialRestrictions: string;
  geographicRestrictions: string[];
  minVramMb: number;
  recommendedVramMb: number;
  minSystemRamMb: number;
  minDiskMb: number;
  quantizationOptions: string[];
  t4Compatibility: T4CompatibilityClass;
  t4Notes: string;
  paidApiRequired: boolean;
  verificationStatus: ModelLifecycleStatus;
  lastCheckedDate: string;
  notes: string;
}

export interface ComputeProfile {
  environment: 'local' | 'colab-t4-target';
  cpuCores: number;
  systemRamTotalMb: number;
  systemRamFreeMb: number;
  targetGpuName: 'NVIDIA T4' | 'NONE_DETECTED';
  targetVramTotalMb: number;
  safeUsableVramMb: number;
  gpuDetectedLocally: boolean;
  dynamicRamSource: 'proc-meminfo' | 'os-totalmem' | 'override';
  enforcedConstraints: string[];
}

export interface ModelCompatibilityAssessment {
  modelId: string;
  compatible: boolean;
  classification: T4CompatibilityClass;
  commercialEligible: boolean;
  headroomVramMb: number;
  headroomSystemRamMb: number;
  blockers: string[];
  warnings: string[];
  recommendedSettings: string[];
}

export interface OpenAssetSourceEntry {
  id: string;
  name: string;
  sourceUrl: string;
  assetTypes: string[];
  defaultLicense: string;
  requiresAttribution: boolean;
  commercialUseAllowed: boolean;
  redistributionNotes: string;
  supportedFormats: string[];
  requiresPerAssetLicenseCheck: boolean;
}

export const T4_VRAM_TOTAL_MB = 16384;
export const T4_SAFE_USABLE_VRAM_MB = 15360; // Account for PyTorch CUDA context (~1 GB overhead)

export const MODEL_CAPABILITY_REGISTRY: ModelCapabilityEntry[] = [
  // -------------------------------------------------------------------------
  // 3D Generation Models
  // -------------------------------------------------------------------------
  {
    id: 'triposr',
    name: 'TripoSR',
    category: '3d-generation',
    purpose: 'Fast single-image feedforward 3D mesh reconstruction (GLB/OBJ)',
    providerOrAuthors: 'VAST AI Research & Stability AI',
    repoUrl: 'https://github.com/VAST-AI-Research/TripoSR',
    modelCardUrl: 'https://huggingface.co/stabilityai/TripoSR',
    hfSpaceId: 'stabilityai/TripoSR',
    colabNotebookSupported: true,
    codeLicense: 'MIT',
    weightLicense: 'MIT',
    commercialAllowed: true,
    commercialRestrictions: 'None beyond MIT copyright notice preservation.',
    geographicRestrictions: [],
    minVramMb: 6144,
    recommendedVramMb: 8192,
    minSystemRamMb: 12288,
    minDiskMb: 4096,
    quantizationOptions: ['fp16', 'chunk-size-4096', 'chunk-size-8192'],
    t4Compatibility: 'fits-natively',
    t4Notes: 'Runs cleanly on 16 GB T4 (~6 GB VRAM default; adjustable marching-cubes chunk_size keeps RAM low).',
    paidApiRequired: false,
    verificationStatus: 'ADAPTER_IMPLEMENTED',
    lastCheckedDate: '2026-11-26',
    notes: 'Fast T4 3D blockout generator; raw outputs require retopology and PBR cleanup in Blender for AAA quality.',
  },
  {
    id: 'stable-fast-3d',
    name: 'Stable Fast 3D (SF3D)',
    category: '3d-generation',
    purpose: 'Single-image 3D asset generation with UV unwrapping and delighting',
    providerOrAuthors: 'Stability AI',
    repoUrl: 'https://github.com/Stability-AI/stable-fast-3d',
    modelCardUrl: 'https://huggingface.co/stabilityai/stable-fast-3d',
    hfSpaceId: 'stabilityai/stable-fast-3d',
    colabNotebookSupported: true,
    codeLicense: 'MIT',
    weightLicense: 'Stability AI Community License',
    commercialAllowed: true,
    commercialRestrictions:
      'Weights require accepting gated HF license; free commercial use only under USD $1,000,000 annual gross revenue.',
    geographicRestrictions: [],
    minVramMb: 6500,
    recommendedVramMb: 8192,
    minSystemRamMb: 12288,
    minDiskMb: 6144,
    quantizationOptions: ['fp16', 'remesh-quad'],
    t4Compatibility: 'fits-natively',
    t4Notes: 'Fits comfortably on 16 GB T4 (~6–7 GB VRAM) with standard Colab RAM; requires HF token for gated weight download.',
    paidApiRequired: false,
    verificationStatus: 'ADAPTER_IMPLEMENTED',
    lastCheckedDate: '2026-11-26',
    notes: 'Useful for prop/asset blockouts with initial UV/albedo bake; still needs look-dev refinement for hero assets.',
  },
  {
    id: 'trellis',
    name: 'Microsoft TRELLIS (Original SLAT)',
    category: '3d-generation',
    purpose: 'Structured 3D latent generation to GLB/3DGS/radiance field',
    providerOrAuthors: 'Microsoft',
    repoUrl: 'https://github.com/microsoft/TRELLIS',
    modelCardUrl: 'https://huggingface.co/microsoft/TRELLIS-image-large',
    colabNotebookSupported: true,
    codeLicense: 'MIT',
    weightLicense: 'MIT',
    commercialAllowed: true,
    commercialRestrictions:
      'Core code/weights are MIT; optional rasterization dependency nvdiffrast carries non-commercial terms.',
    geographicRestrictions: [],
    minVramMb: 14500,
    recommendedVramMb: 16384,
    minSystemRamMb: 12288,
    minDiskMb: 12288,
    quantizationOptions: ['fp16', 'single-stage-sparse-offload', 'low-vram-attention'],
    t4Compatibility: 'fits-with-reduced-settings',
    t4Notes: 'Tight fit near the 15.3 GB usable T4 ceiling; requires single-job isolation and aggressive cache clearing.',
    paidApiRequired: false,
    verificationStatus: 'HARDWARE_ASSESSED',
    lastCheckedDate: '2026-11-26',
    notes: 'Heavy CUDA compilation/dependencies in Colab; check nvdiffrast licensing before commercial use.',
  },
  {
    id: 'trellis-2',
    name: 'Microsoft TRELLIS.2 (4B)',
    category: '3d-generation',
    purpose: 'High-resolution 4B 3D asset synthesis with O-Voxel PBR geometry',
    providerOrAuthors: 'Microsoft',
    repoUrl: 'https://github.com/microsoft/TRELLIS.2',
    modelCardUrl: 'https://huggingface.co/microsoft/TRELLIS.2-4B',
    colabNotebookSupported: false,
    codeLicense: 'MIT',
    weightLicense: 'MIT',
    commercialAllowed: true,
    commercialRestrictions:
      'MIT core; verify optional nvdiffrast dependency terms. Exceeds T4 16 GB baseline VRAM.',
    geographicRestrictions: [],
    minVramMb: 24576,
    recommendedVramMb: 24576,
    minSystemRamMb: 24576,
    minDiskMb: 24576,
    quantizationOptions: ['fp16-512-to-1536-res'],
    t4Compatibility: 'incompatible-exceeds-vram',
    t4Notes:
      'BLOCKED ON T4: Official Microsoft documentation requires >= 24 GB VRAM (A100/H100 class). Do not schedule on T4 + standard RAM.',
    paidApiRequired: false,
    verificationStatus: 'HARDWARE_ASSESSED',
    lastCheckedDate: '2026-11-26',
    notes: 'Listed explicitly so compatibility checks prevent OOM failures on free Colab T4 runtimes.',
  },
  {
    id: 'hunyuan3d-2',
    name: 'Tencent Hunyuan3D-2.0',
    category: '3d-generation',
    purpose: 'Diffusion shape synthesis (2.0 shape stage fits T4; full texture + 2.1 require higher VRAM)',
    providerOrAuthors: 'Tencent Hunyuan',
    repoUrl: 'https://github.com/Tencent-Hunyuan/Hunyuan3D-2',
    modelCardUrl: 'https://huggingface.co/tencent/Hunyuan3D-2',
    colabNotebookSupported: true,
    codeLicense: 'Tencent Hunyuan 3D Community License',
    weightLicense: 'Tencent Hunyuan 3D Community License',
    commercialAllowed: true,
    commercialRestrictions:
      'Community license applies outside excluded jurisdictions; separate commercial agreement required at scale.',
    geographicRestrictions: ['EU', 'UK', 'South Korea'],
    minVramMb: 6144,
    recommendedVramMb: 16384,
    minSystemRamMb: 16384,
    minDiskMb: 18432,
    quantizationOptions: ['shape-only-6gb', 'mini-turbo', 'sequential-cpu-offload'],
    t4Compatibility: 'fits-with-reduced-settings',
    t4Notes:
      'Hunyuan3D-2.0 shape-only (~6 GB VRAM) fits T4; full shape+texture (~16 GB) is borderline and Hunyuan3D-2.1 full (~29 GB) does NOT fit T4.',
    paidApiRequired: false,
    verificationStatus: 'HARDWARE_ASSESSED',
    lastCheckedDate: '2026-11-26',
    notes: 'Enforce jurisdiction check (excluded in EU, UK, and South Korea per community license) before selection.',
  },

  // -------------------------------------------------------------------------
  // Image Generation Models (Concept Art & Reference Plates)
  // -------------------------------------------------------------------------
  {
    id: 'sdxl-base-1.0',
    name: 'Stable Diffusion XL Base 1.0',
    category: 'image-generation',
    purpose: 'Photorealistic concept art, moodboards, orthographic turnarounds, and texture references',
    providerOrAuthors: 'Stability AI',
    repoUrl: 'https://github.com/Stability-AI/generative-models',
    modelCardUrl: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0',
    colabNotebookSupported: true,
    codeLicense: 'MIT',
    weightLicense: 'CreativeML Open RAIL++-M',
    commercialAllowed: true,
    commercialRestrictions:
      'Open RAIL++-M permits commercial use subject to use-based restrictions and license propagation.',
    geographicRestrictions: [],
    minVramMb: 8192,
    recommendedVramMb: 11264,
    minSystemRamMb: 12288,
    minDiskMb: 10240,
    quantizationOptions: ['fp16', 'vae-slicing', 'attention-slicing'],
    t4Compatibility: 'fits-natively',
    t4Notes: 'Runs reliably in FP16 on 16 GB T4 (~8–11 GB VRAM) at 1024x1024.',
    paidApiRequired: false,
    verificationStatus: 'ADAPTER_IMPLEMENTED',
    lastCheckedDate: '2026-11-26',
    notes: 'Use for concept exploration & reference sheets; never present generated concept images as 3D assets.',
  },
  {
    id: 'flux-1-schnell',
    name: 'FLUX.1-schnell',
    category: 'image-generation',
    purpose: '4-step Apache-2.0 concept art and lighting reference generation',
    providerOrAuthors: 'Black Forest Labs',
    repoUrl: 'https://github.com/black-forest-labs/flux',
    modelCardUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell',
    colabNotebookSupported: true,
    codeLicense: 'Apache-2.0',
    weightLicense: 'Apache-2.0',
    commercialAllowed: true,
    commercialRestrictions: 'Permissive Apache-2.0 for both code and weights (unlike non-commercial FLUX.1-dev).',
    geographicRestrictions: [],
    minVramMb: 12288,
    recommendedVramMb: 24576,
    minSystemRamMb: 16384,
    minDiskMb: 24576,
    quantizationOptions: ['nf4-4bit', 'fp8', 'enable_model_cpu_offload'],
    t4Compatibility: 'experimental-offload',
    t4Notes:
      'Unquantized FP16 (~24 GB) OOMs on 16 GB T4. Requires 4-bit NF4 quantization + CPU offloading; monitor standard Colab 12.7 GB system RAM carefully.',
    paidApiRequired: false,
    verificationStatus: 'HARDWARE_ASSESSED',
    lastCheckedDate: '2026-11-26',
    notes: 'Prefer SDXL Base 1.0 when running on standard 12.7 GB Colab system RAM alongside other steps.',
  },

  // -------------------------------------------------------------------------
  // Asset Enhancement Models (Upscaling & Depth)
  // -------------------------------------------------------------------------
  {
    id: 'real-esrgan',
    name: 'Real-ESRGAN (x4plus)',
    category: 'asset-enhancement',
    purpose: 'Tiled PBR texture & concept reference upscaling on low VRAM',
    providerOrAuthors: 'Xintao Wang et al.',
    repoUrl: 'https://github.com/xinntao/Real-ESRGAN',
    colabNotebookSupported: true,
    codeLicense: 'BSD-3-Clause',
    weightLicense: 'BSD-3-Clause',
    commercialAllowed: true,
    commercialRestrictions: 'Permissive BSD-3-Clause license.',
    geographicRestrictions: [],
    minVramMb: 2560,
    recommendedVramMb: 4096,
    minSystemRamMb: 8192,
    minDiskMb: 1024,
    quantizationOptions: ['fp16', 'tile-256', 'tile-512'],
    t4Compatibility: 'fits-natively',
    t4Notes: 'Extremely lightweight on T4 (~2.5–4 GB VRAM) when using --tile 512 and FP16.',
    paidApiRequired: false,
    verificationStatus: 'ADAPTER_IMPLEMENTED',
    lastCheckedDate: '2026-11-26',
    notes: 'Ideal for sharpening low-res AI textures before Blender PBR calibration.',
  },
  {
    id: 'depth-anything-v2-small',
    name: 'Depth Anything V2 Small',
    category: 'asset-enhancement',
    purpose: 'Monocular depth/heightmap extraction for terrain & displacement prototyping',
    providerOrAuthors: 'Depth Anything Team',
    repoUrl: 'https://github.com/DepthAnything/Depth-Anything-V2',
    modelCardUrl: 'https://huggingface.co/depth-anything/Depth-Anything-V2-Small',
    colabNotebookSupported: true,
    codeLicense: 'Apache-2.0',
    weightLicense: 'Apache-2.0',
    commercialAllowed: true,
    commercialRestrictions:
      'Only the Small variant is Apache-2.0 commercial-friendly; Base/Large/Giant checkpoints carry CC-BY-NC-4.0.',
    geographicRestrictions: [],
    minVramMb: 2048,
    recommendedVramMb: 4096,
    minSystemRamMb: 8192,
    minDiskMb: 1024,
    quantizationOptions: ['fp16', 'fp32'],
    t4Compatibility: 'fits-natively',
    t4Notes: 'Small variant runs effortlessly on T4 (< 4 GB VRAM) with fast inference.',
    paidApiRequired: false,
    verificationStatus: 'HARDWARE_ASSESSED',
    lastCheckedDate: '2026-11-26',
    notes: 'Never swap in Base/Large/Giant checkpoints for commercial projects without noticing their NC license.',
  },

  // -------------------------------------------------------------------------
  // Animation & Video Previz Models
  // -------------------------------------------------------------------------
  {
    id: 'wan2.1-t2v-1.3b',
    name: 'Wan2.1 T2V-1.3B',
    category: 'animation-video',
    purpose: 'Lightweight motion pre-visualization & animatic reference clips on T4',
    providerOrAuthors: 'Wan-AI / Alibaba',
    repoUrl: 'https://github.com/Wan-AI/Wan2.1',
    modelCardUrl: 'https://huggingface.co/Wan-AI/Wan2.1-T2V-1.3B',
    colabNotebookSupported: true,
    codeLicense: 'Apache-2.0',
    weightLicense: 'Apache-2.0',
    commercialAllowed: true,
    commercialRestrictions: 'Apache-2.0 permissive commercial license.',
    geographicRestrictions: [],
    minVramMb: 12288,
    recommendedVramMb: 16384,
    minSystemRamMb: 14336,
    minDiskMb: 16384,
    quantizationOptions: ['fp8', 'vae-slicing', 'cpu-offload'],
    t4Compatibility: 'fits-with-reduced-settings',
    t4Notes:
      'Runs near the 16 GB T4 ceiling only with VAE slicing and CPU offload at 480p; never run concurrently with Blender.',
    paidApiRequired: false,
    verificationStatus: 'HARDWARE_ASSESSED',
    lastCheckedDate: '2026-11-26',
    notes: 'Use solely for animatic previz; final photoreal cinematics should use deterministic Blender Cycles or engine rendering.',
  },
];

export const OPEN_ASSET_SOURCES: OpenAssetSourceEntry[] = [
  {
    id: 'poly-haven',
    name: 'Poly Haven',
    sourceUrl: 'https://polyhaven.com',
    assetTypes: ['HDRIs (up to 16K EXR)', 'PBR Texture Sets', '3D Models'],
    defaultLicense: 'CC0 1.0 Universal (Public Domain)',
    requiresAttribution: false,
    commercialUseAllowed: true,
    redistributionNotes: 'All hosted assets are CC0; attribution is appreciated but not legally required.',
    supportedFormats: ['EXR', 'HDR', 'GLTF', 'FBX', 'BLEND', 'PNG'],
    requiresPerAssetLicenseCheck: false,
  },
  {
    id: 'ambientcg',
    name: 'ambientCG',
    sourceUrl: 'https://ambientcg.com',
    assetTypes: ['PBR Materials (Albedo/Normal/Roughness/Displacement)', 'HDRIs', 'Decals'],
    defaultLicense: 'CC0 1.0 Universal (Public Domain)',
    requiresAttribution: false,
    commercialUseAllowed: true,
    redistributionNotes: 'CC0 assets safe for game/film production and bundling inside compiled projects.',
    supportedFormats: ['PNG', 'JPG', 'EXR', 'SBSAR'],
    requiresPerAssetLicenseCheck: false,
  },
  {
    id: 'kenney',
    name: 'Kenney Assets',
    sourceUrl: 'https://kenney.nl/assets',
    assetTypes: ['Modular 3D Kitbash Sets', 'UI Icons', 'Audio SFX', '2D Sprites'],
    defaultLicense: 'CC0 1.0 Universal (Public Domain)',
    requiresAttribution: false,
    commercialUseAllowed: true,
    redistributionNotes: 'CC0 kits ideal for rapid whiteboxing, modular props, and prototype SFX.',
    supportedFormats: ['GLB', 'FBX', 'OBJ', 'PNG', 'OGG', 'WAV'],
    requiresPerAssetLicenseCheck: false,
  },
  {
    id: 'quaternius',
    name: 'Quaternius',
    sourceUrl: 'https://quaternius.com',
    assetTypes: ['Low/Mid-Poly Modular Characters', 'Vegetation & Nature Packs', 'Architecture'],
    defaultLicense: 'CC0 1.0 Universal (Public Domain)',
    requiresAttribution: false,
    commercialUseAllowed: true,
    redistributionNotes: 'CC0 packs compatible with Unity/Godot/Three.js; upgrade shaders/textures before photoreal renders.',
    supportedFormats: ['GLTF', 'FBX', 'OBJ', 'BLEND'],
    requiresPerAssetLicenseCheck: false,
  },
  {
    id: 'opengameart',
    name: 'OpenGameArt.org',
    sourceUrl: 'https://opengameart.org',
    assetTypes: ['Community 3D Meshes', 'Textures', 'Music & SFX', '2D Art'],
    defaultLicense: 'Mixed (CC0, CC-BY-3.0/4.0, CC-BY-SA, GPL-2/3, OGA-BY)',
    requiresAttribution: true,
    commercialUseAllowed: true,
    redistributionNotes:
      'CAUTION: Each individual upload chooses its own license. GPL/CC-BY-SA assets can trigger copyleft obligations; inspect per-asset license before commercial shipping.',
    supportedFormats: ['OBJ', 'FBX', 'BLEND', 'PNG', 'OGG', 'WAV'],
    requiresPerAssetLicenseCheck: true,
  },
];

function readLinuxProcMeminfoMb(): { totalMb: number; availableMb: number } | null {
  try {
    if (process.platform !== 'linux' || !fs.existsSync('/proc/meminfo')) return null;
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const totalMatch = raw.match(/MemTotal:\s+(\d+)\s+kB/);
    const availMatch = raw.match(/MemAvailable:\s+(\d+)\s+kB/);
    if (!totalMatch) return null;
    const totalMb = Math.round(Number(totalMatch[1]) / 1024);
    const availableMb = availMatch
      ? Math.round(Number(availMatch[1]) / 1024)
      : Math.round(os.freemem() / (1024 * 1024));
    return { totalMb, availableMb };
  } catch {
    return null;
  }
}

/**
 * Dynamically detects local host RAM/CPU while enforcing the mandatory Colab T4 target contract
 * (NVIDIA T4 16 GB VRAM + detected/standard Colab system RAM; never assumes L4/A100/H100 or High-RAM).
 */
export function detectComputeProfile(
  targetMode: 'local' | 'colab-t4-target' = 'colab-t4-target',
  override?: Partial<{
    cpuCores: number;
    systemRamTotalMb: number;
    systemRamFreeMb: number;
    targetVramTotalMb: number;
    gpuDetectedLocally: boolean;
  }>,
): ComputeProfile {
  const cpuCores = override?.cpuCores ?? Math.max(1, os.cpus().length);
  const procMem = override?.systemRamTotalMb ? null : readLinuxProcMeminfoMb();
  const systemRamTotalMb =
    override?.systemRamTotalMb ?? procMem?.totalMb ?? Math.round(os.totalmem() / (1024 * 1024));
  const systemRamFreeMb =
    override?.systemRamFreeMb ?? procMem?.availableMb ?? Math.round(os.freemem() / (1024 * 1024));

  const targetVramTotalMb =
    override?.targetVramTotalMb ?? (targetMode === 'colab-t4-target' ? T4_VRAM_TOTAL_MB : 0);
  const safeUsableVramMb =
    targetVramTotalMb > 0 ? Math.max(0, Math.min(targetVramTotalMb - 1024, T4_SAFE_USABLE_VRAM_MB)) : 0;

  return {
    environment: targetMode,
    cpuCores,
    systemRamTotalMb,
    systemRamFreeMb,
    targetGpuName: targetMode === 'colab-t4-target' ? 'NVIDIA T4' : 'NONE_DETECTED',
    targetVramTotalMb,
    safeUsableVramMb,
    gpuDetectedLocally: override?.gpuDetectedLocally ?? false,
    dynamicRamSource: override?.systemRamTotalMb
      ? 'override'
      : procMem
        ? 'proc-meminfo'
        : 'os-totalmem',
    enforcedConstraints: [
      'Colab target GPU is strictly NVIDIA T4 (16 GB VRAM / ~15,360 MB safe usable). Never assume L4, A100, or H100.',
      'Detect system RAM dynamically at runtime; never assume Colab High-RAM.',
      'Run only one heavy GPU job at a time (never concurrent 3D model inference + Cycles rendering).',
      'Always verify nvidia-smi GPU model and free RAM before launching Colab jobs.',
    ],
  };
}

export function getModelById(modelId: string): ModelCapabilityEntry | undefined {
  return MODEL_CAPABILITY_REGISTRY.find((m) => m.id === modelId);
}

export function listModels(filter?: {
  category?: ModelCategory;
  t4Only?: boolean;
  commercialOnly?: boolean;
}): ModelCapabilityEntry[] {
  return MODEL_CAPABILITY_REGISTRY.filter((m) => {
    if (filter?.category && m.category !== filter.category) return false;
    if (filter?.commercialOnly && !m.commercialAllowed) return false;
    if (
      filter?.t4Only &&
      (m.t4Compatibility === 'incompatible-exceeds-vram' || m.t4Compatibility === 'requires-paid-api')
    ) {
      return false;
    }
    return true;
  });
}

export function assessModelCompatibility(
  modelId: string,
  compute: ComputeProfile = detectComputeProfile('colab-t4-target'),
  options?: {
    requireCommercial?: boolean;
    userRegion?: string;
    allowPaidApi?: boolean;
  },
): ModelCompatibilityAssessment {
  const model = getModelById(modelId);
  if (!model) {
    return {
      modelId,
      compatible: false,
      classification: 'incompatible-exceeds-vram',
      commercialEligible: false,
      headroomVramMb: 0,
      headroomSystemRamMb: 0,
      blockers: [`Unknown model "${modelId}" is not in the verified registry.`],
      warnings: [],
      recommendedSettings: [],
    };
  }

  const blockers: string[] = [];
  const warnings: string[] = [];
  const recommendedSettings: string[] = [...model.quantizationOptions];

  if (model.paidApiRequired && !options?.allowPaidApi) {
    blockers.push('Model requires a paid API; zero-budget policy blocks paid APIs without explicit opt-in.');
  }

  const headroomVramMb = compute.safeUsableVramMb - model.minVramMb;
  const headroomSystemRamMb = compute.systemRamTotalMb - model.minSystemRamMb;

  if (model.t4Compatibility === 'incompatible-exceeds-vram' || headroomVramMb < 0) {
    blockers.push(
      `Requires >= ${model.minVramMb} MB VRAM, which exceeds target T4 safe usable VRAM (${compute.safeUsableVramMb} MB).`,
    );
  }

  if (headroomSystemRamMb < 0) {
    warnings.push(
      `Model expects ~${model.minSystemRamMb} MB system RAM; host currently reports ${compute.systemRamTotalMb} MB total RAM — enable sequential CPU swap/offload cautiously or skip.`,
    );
  }

  let commercialEligible = model.commercialAllowed;
  if (options?.userRegion && model.geographicRestrictions.includes(options.userRegion.toUpperCase())) {
    commercialEligible = false;
    blockers.push(
      `License excludes jurisdiction "${options.userRegion}" (excluded regions: ${model.geographicRestrictions.join(', ')}).`,
    );
  } else if (model.geographicRestrictions.length > 0) {
    warnings.push(
      `License excludes jurisdictions: ${model.geographicRestrictions.join(', ')}. Verify region before commercial deployment.`,
    );
  }

  if (options?.requireCommercial && !commercialEligible) {
    blockers.push(`Commercial eligibility failed for "${model.name}" (${model.weightLicense}).`);
  }

  if (model.commercialRestrictions) {
    warnings.push(model.commercialRestrictions);
  }

  const compatible = blockers.length === 0;
  return {
    modelId: model.id,
    compatible,
    classification: blockers.some((b) => b.includes('VRAM'))
      ? 'incompatible-exceeds-vram'
      : model.t4Compatibility,
    commercialEligible,
    headroomVramMb,
    headroomSystemRamMb,
    blockers,
    warnings,
    recommendedSettings,
  };
}
