import fs from 'node:fs';
import type { EngineId } from './engine-profiles.ts';
import { assertSafeSubpathSync } from './security.ts';

export type AssetFormat = 'glb' | 'gltf' | 'fbx';

export interface EngineAssetExportSpec {
  engine: EngineId;
  preferredFormat: AssetFormat;
  unitScaleMeters: number;
  upAxis: 'Y' | 'Z';
  forwardAxis: '-Z' | '-Y';
  requireUv0: boolean;
  requireNormals: boolean;
  maxBoneInfluencesPerVertex: number;
  recommendedPolyBudget: number;
  notes: string[];
}

export const ENGINE_ASSET_EXPORT_SPECS: Record<EngineId, EngineAssetExportSpec> = {
  unreal5: {
    engine: 'unreal5',
    preferredFormat: 'fbx',
    unitScaleMeters: 1.0,
    upAxis: 'Z',
    forwardAxis: '-Y',
    requireUv0: true,
    requireNormals: true,
    maxBoneInfluencesPerVertex: 8,
    recommendedPolyBudget: 150_000,
    notes: [
      'Use FBX binary or Interchange glTF with smoothing=FACE and add_leaf_bones=False.',
      'Apply object scale transforms (1,1,1) before export; UE5 expects Z-up.',
    ],
  },
  unity: {
    engine: 'unity',
    preferredFormat: 'fbx',
    unitScaleMeters: 1.0,
    upAxis: 'Y',
    forwardAxis: '-Z',
    requireUv0: true,
    requireNormals: true,
    maxBoneInfluencesPerVertex: 4,
    recommendedPolyBudget: 80_000,
    notes: [
      'Keep skin weights <= 4 bones per vertex for Unity Standard/URP skinning.',
      'Freeze non-uniform scale and verify MikkTSpace normal map tangent space.',
    ],
  },
  godot: {
    engine: 'godot',
    preferredFormat: 'glb',
    unitScaleMeters: 1.0,
    upAxis: 'Y',
    forwardAxis: '-Z',
    requireUv0: true,
    requireNormals: true,
    maxBoneInfluencesPerVertex: 4,
    recommendedPolyBudget: 80_000,
    notes: [
      'Prefer binary glTF (.glb) for native Godot 4.x import with packed metallicRoughness.',
      'Verify animation track names and root motion bone alignment.',
    ],
  },
  threejs: {
    engine: 'threejs',
    preferredFormat: 'glb',
    unitScaleMeters: 1.0,
    upAxis: 'Y',
    forwardAxis: '-Z',
    requireUv0: true,
    requireNormals: true,
    maxBoneInfluencesPerVertex: 4,
    recommendedPolyBudget: 50_000,
    notes: [
      'Export binary .glb with Y-up, 1 unit = 1m, <= 4 material slots per hero prop.',
      'Keep textures power-of-two (max 2048px unless desktop hero) for WebGL/WebGPU VRAM.',
    ],
  },
  'cpp-native': {
    engine: 'cpp-native',
    preferredFormat: 'glb',
    unitScaleMeters: 1.0,
    upAxis: 'Y',
    forwardAxis: '-Z',
    requireUv0: true,
    requireNormals: true,
    maxBoneInfluencesPerVertex: 4,
    recommendedPolyBudget: 120_000,
    notes: ['Export glTF/GLB with indexed triangle buffers for fast cgltf/meshoptimizer cooking.'],
  },
  rust: {
    engine: 'rust',
    preferredFormat: 'glb',
    unitScaleMeters: 1.0,
    upAxis: 'Y',
    forwardAxis: '-Z',
    requireUv0: true,
    requireNormals: true,
    maxBoneInfluencesPerVertex: 4,
    recommendedPolyBudget: 100_000,
    notes: ['Bevy natively loads .glb with PBR materials, skins, and NamedAnimations.'],
  },
};

export interface AssetValidationReport {
  file: string;
  format: AssetFormat | 'unknown';
  targetEngine: EngineId;
  status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'FAILED';
  meshCount: number;
  materialCount: number;
  hasUvs: boolean;
  hasNormals: boolean;
  hasRigSkin: boolean;
  animationCount: number;
  nonUnitScalesFound: number;
  issues: string[];
  warnings: string[];
}

interface GltfDocumentJson {
  asset?: { version?: string };
  meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number>; material?: number }> }>;
  materials?: Array<{ pbrMetallicRoughness?: unknown; name?: string }>;
  nodes?: Array<{ name?: string; scale?: [number, number, number] }>;
  skins?: Array<{ joints?: number[] }>;
  animations?: Array<{ name?: string }>;
  textures?: unknown[];
}

function parseGlbOrGltfJson(bytes: Buffer, format: 'glb' | 'gltf'): GltfDocumentJson {
  if (format === 'gltf') {
    return JSON.parse(bytes.toString('utf8')) as GltfDocumentJson;
  }
  if (bytes.length < 20) {
    throw new Error('GLB file truncated (< 20 bytes header).');
  }
  const magic = bytes.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    throw new Error(`Invalid GLB magic header: 0x${magic.toString(16)} (expected glTF).`);
  }
  const version = bytes.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported GLB version ${version} (expected 2).`);
  }
  const chunk0Length = bytes.readUInt32LE(12);
  const chunk0Type = bytes.readUInt32LE(16);
  if (chunk0Type !== 0x4e4f534a) {
    throw new Error('GLB first chunk is not JSON.');
  }
  const jsonEnd = 20 + chunk0Length;
  if (jsonEnd > bytes.length) {
    throw new Error('GLB JSON chunk length exceeds file bounds.');
  }
  const jsonText = bytes.subarray(20, jsonEnd).toString('utf8');
  return JSON.parse(jsonText) as GltfDocumentJson;
}

/**
 * Validates exported 3D assets (.glb / .gltf / .fbx) for mesh, UV, material,
 * scale, rig/skin, and target engine compatibility.
 */
export function validateExportedAsset(
  workspaceDir: string,
  assetRelPath: string,
  targetEngine: EngineId,
): AssetValidationReport {
  const absPath = assertSafeSubpathSync(workspaceDir, assetRelPath);
  const spec = ENGINE_ASSET_EXPORT_SPECS[targetEngine];
  const ext = assetRelPath.toLowerCase().endsWith('.glb')
    ? 'glb'
    : assetRelPath.toLowerCase().endsWith('.gltf')
      ? 'gltf'
      : assetRelPath.toLowerCase().endsWith('.fbx')
        ? 'fbx'
        : 'unknown';

  const base: AssetValidationReport = {
    file: assetRelPath,
    format: ext,
    targetEngine,
    status: 'FAILED',
    meshCount: 0,
    materialCount: 0,
    hasUvs: false,
    hasNormals: false,
    hasRigSkin: false,
    animationCount: 0,
    nonUnitScalesFound: 0,
    issues: [],
    warnings: [],
  };

  if (!fs.existsSync(absPath)) {
    base.issues.push(`Exported asset "${assetRelPath}" does not exist.`);
    return base;
  }

  const bytes = fs.readFileSync(absPath);
  if (bytes.length < 16) {
    base.issues.push(`Exported asset "${assetRelPath}" is empty or corrupt (${bytes.length} bytes).`);
    return base;
  }

  if (ext === 'unknown') {
    base.issues.push(`Unsupported 3D asset extension for "${assetRelPath}". Expected .glb, .gltf, or .fbx.`);
    return base;
  }

  if (ext === 'fbx') {
    const isBinaryFbx = bytes.subarray(0, 18).toString('ascii') === 'Kaydara FBX Binary';
    const isAsciiFbx = bytes.subarray(0, 256).toString('utf8').includes('; FBX ');
    if (!isBinaryFbx && !isAsciiFbx) {
      base.issues.push('Invalid FBX header (neither Kaydara binary nor ASCII FBX signature found).');
      return base;
    }
    base.status = 'PARTIALLY_VERIFIED';
    base.warnings.push(
      'FBX container header verified; deep bone/UV/triangle inspection requires Blender or engine importer run.',
    );
    return base;
  }

  // Deep glTF 2.0 / GLB structural validation
  try {
    const gltf = parseGlbOrGltfJson(bytes, ext);
    const meshes = gltf.meshes ?? [];
    const materials = gltf.materials ?? [];
    const nodes = gltf.nodes ?? [];
    const skins = gltf.skins ?? [];
    const animations = gltf.animations ?? [];

    base.meshCount = meshes.length;
    base.materialCount = materials.length;
    base.hasRigSkin = skins.length > 0;
    base.animationCount = animations.length;

    if (meshes.length === 0) {
      base.issues.push('Asset contains 0 meshes.');
    }

    let uvCount = 0;
    let normalCount = 0;
    let totalPrimitives = 0;
    for (const m of meshes) {
      for (const p of m.primitives ?? []) {
        totalPrimitives += 1;
        if (p.attributes?.TEXCOORD_0 !== undefined) uvCount += 1;
        if (p.attributes?.NORMAL !== undefined) normalCount += 1;
      }
    }

    base.hasUvs = totalPrimitives > 0 && uvCount === totalPrimitives;
    base.hasNormals = totalPrimitives > 0 && normalCount === totalPrimitives;

    if (spec.requireUv0 && !base.hasUvs) {
      base.issues.push('One or more mesh primitives lack TEXCOORD_0 UVs.');
    }
    if (spec.requireNormals && !base.hasNormals) {
      base.issues.push('One or more mesh primitives lack vertex NORMAL attributes.');
    }
    if (materials.length === 0) {
      base.warnings.push('No materials defined in glTF; default engine material will be assigned.');
    }

    for (const n of nodes) {
      if (n.scale && n.scale.some((s) => Math.abs(s - 1.0) > 1e-3)) {
        base.nonUnitScalesFound += 1;
      }
    }
    if (base.nonUnitScalesFound > 0) {
      base.warnings.push(
        `${base.nonUnitScalesFound} node(s) have unapplied non-unit scale; freeze/apply transforms before engine import.`,
      );
    }

    base.status = base.issues.length === 0 ? 'VERIFIED' : 'FAILED';
    return base;
  } catch (err) {
    base.issues.push(`glTF/GLB parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return base;
  }
}
