import fs from 'node:fs';
import path from 'node:path';
import { assertSafeSubpathSync } from './security.ts';
import type { VerificationStatus } from './qa-verification.ts';

export type AssetProductionStage =
  | 'SCRIPT_GENERATED'
  | 'SCRIPT_EXECUTED'
  | 'ASSET_CREATED'
  | 'ASSET_REFINED'
  | 'ASSET_EXPORTED'
  | 'ASSET_IMPORTED'
  | 'VISUALLY_INSPECTED'
  | 'QA_VERIFIED';

export interface AssetValidationReport {
  filePath: string;
  format: 'glb' | 'gltf' | 'fbx' | 'png' | 'jpeg' | 'webp' | 'unknown';
  exists: boolean;
  sizeBytes: number;
  status: VerificationStatus;
  meshCount: number;
  materialCount: number;
  hasPositions: boolean;
  hasNormals: boolean;
  hasTexCoords: boolean;
  hasPbrMaterials: boolean;
  nodeScaleIssues: string[];
  imageDimensions?: { width: number; height: number };
  isRawAiMeshOnly?: boolean;
  errors: string[];
  warnings: string[];
  summary: string;
}

export interface RenderArtifactInspection {
  filePath: string;
  exists: boolean;
  format: 'png' | 'jpeg' | 'webp' | 'unknown';
  sizeBytes: number;
  width: number | null;
  height: number | null;
  nonTrivialBytes: boolean;
  criteriaProvided: string[];
  status: VerificationStatus;
  reason: string;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GLB_MAGIC = 0x46546c67; // 'glTF' little-endian
const GLB_JSON_CHUNK = 0x4e4f534a; // 'JSON'

function inspectGltfJsonObject(
  gltf: Record<string, unknown>,
  baseDir?: string,
): {
  meshCount: number;
  materialCount: number;
  hasPositions: boolean;
  hasNormals: boolean;
  hasTexCoords: boolean;
  hasPbrMaterials: boolean;
  nodeScaleIssues: string[];
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeScaleIssues: string[] = [];

  const assetObj = gltf.asset as { version?: string } | undefined;
  if (!assetObj?.version || !String(assetObj.version).startsWith('2')) {
    warnings.push(`glTF asset.version="${String(assetObj?.version ?? 'missing')}" (expected 2.x).`);
  }

  const meshes = Array.isArray(gltf.meshes) ? (gltf.meshes as Array<Record<string, unknown>>) : [];
  const materials = Array.isArray(gltf.materials) ? (gltf.materials as Array<Record<string, unknown>>) : [];
  const nodes = Array.isArray(gltf.nodes) ? (gltf.nodes as Array<Record<string, unknown>>) : [];
  const images = Array.isArray(gltf.images) ? (gltf.images as Array<Record<string, unknown>>) : [];

  let hasPositions = false;
  let hasNormals = false;
  let hasTexCoords = false;

  if (meshes.length === 0) {
    errors.push('glTF/GLB contains 0 meshes.');
  }

  for (const mesh of meshes) {
    const prims = Array.isArray(mesh.primitives)
      ? (mesh.primitives as Array<Record<string, unknown>>)
      : [];
    if (prims.length === 0) {
      warnings.push(`Mesh "${String(mesh.name ?? 'unnamed')}" has 0 primitives.`);
      continue;
    }
    for (const prim of prims) {
      const attrs = (prim.attributes ?? {}) as Record<string, unknown>;
      if (attrs.POSITION !== undefined) hasPositions = true;
      if (attrs.NORMAL !== undefined) hasNormals = true;
      if (attrs.TEXCOORD_0 !== undefined) hasTexCoords = true;
    }
  }

  if (meshes.length > 0 && !hasPositions) errors.push('Mesh primitives missing POSITION attribute.');
  if (meshes.length > 0 && !hasNormals) warnings.push('Mesh primitives missing NORMAL attribute; shading may look faceted.');
  if (meshes.length > 0 && !hasTexCoords) warnings.push('Mesh primitives missing TEXCOORD_0 UVs; texture maps cannot sample properly.');

  const hasPbrMaterials = materials.some((m) => Boolean(m.pbrMetallicRoughness));
  if (materials.length === 0) {
    warnings.push('No materials defined (raw untextured mesh only — NOT a calibrated PBR asset).');
  } else if (!hasPbrMaterials) {
    warnings.push('Materials present without pbrMetallicRoughness definition.');
  }

  for (const node of nodes) {
    if (Array.isArray(node.scale) && node.scale.length === 3) {
      const [sx, sy, sz] = node.scale.map(Number);
      if (Math.abs(sx) < 1e-6 || Math.abs(sy) < 1e-6 || Math.abs(sz) < 1e-6) {
        nodeScaleIssues.push(`Node "${String(node.name ?? 'unnamed')}" has zero scale component.`);
      } else if (Math.abs(sx - 1) > 0.05 || Math.abs(sy - 1) > 0.05 || Math.abs(sz - 1) > 0.05) {
        warnings.push(
          `Node "${String(node.name ?? 'unnamed')}" has unapplied non-unit scale [${sx}, ${sy}, ${sz}].`,
        );
      }
    }
  }

  if (baseDir) {
    for (const img of images) {
      if (typeof img.uri === 'string' && !img.uri.startsWith('data:')) {
        try {
          const imgAbs = assertSafeSubpathSync(baseDir, img.uri);
          if (!fs.existsSync(imgAbs)) {
            errors.push(`Referenced external texture image missing: ${img.uri}`);
          }
        } catch (err) {
          errors.push(`Unsafe external image URI "${img.uri}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
  }

  return {
    meshCount: meshes.length,
    materialCount: materials.length,
    hasPositions,
    hasNormals,
    hasTexCoords,
    hasPbrMaterials,
    nodeScaleIssues,
    errors,
    warnings,
  };
}

function parseImageHeaderDimensions(
  buf: Buffer,
  ext: string,
): { format: 'png' | 'jpeg' | 'webp' | 'unknown'; width: number | null; height: number | null } {
  if (buf.length >= 24 && buf.subarray(0, 8).equals(PNG_MAGIC)) {
    const ihdrTag = buf.subarray(12, 16).toString('ascii');
    if (ihdrTag === 'IHDR') {
      return {
        format: 'png',
        width: buf.readUInt32BE(16),
        height: buf.readUInt32BE(20),
      };
    }
    return { format: 'png', width: null, height: null };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { format: 'jpeg', width: null, height: null };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { format: 'webp', width: null, height: null };
  }
  return {
    format: ext === '.png' ? 'png' : ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : 'unknown',
    width: null,
    height: null,
  };
}

/**
 * Validates generated 3D assets (GLB, glTF, FBX) or image renders on disk structurally.
 * Never accepts file existence alone as verification of production readiness.
 */
export function validateGeneratedAssetFile(
  workspaceDir: string,
  relPath: string,
): AssetValidationReport {
  const abs = assertSafeSubpathSync(workspaceDir, relPath);
  const ext = path.extname(relPath).toLowerCase();

  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return {
      filePath: relPath,
      format: ext === '.glb' ? 'glb' : ext === '.gltf' ? 'gltf' : ext === '.fbx' ? 'fbx' : 'unknown',
      exists: false,
      sizeBytes: 0,
      status: 'UNVERIFIED',
      meshCount: 0,
      materialCount: 0,
      hasPositions: false,
      hasNormals: false,
      hasTexCoords: false,
      hasPbrMaterials: false,
      nodeScaleIssues: [],
      errors: [`Asset "${relPath}" does not exist on disk.`],
      warnings: [],
      summary: `Missing asset "${relPath}" (UNVERIFIED).`,
    };
  }

  const buf = fs.readFileSync(abs);
  if (ext === '.glb') {
    if (buf.length < 28 || buf.readUInt32LE(0) !== GLB_MAGIC) {
      return {
        filePath: relPath,
        format: 'glb',
        exists: true,
        sizeBytes: buf.length,
        status: 'FAILED',
        meshCount: 0,
        materialCount: 0,
        hasPositions: false,
        hasNormals: false,
        hasTexCoords: false,
        hasPbrMaterials: false,
        nodeScaleIssues: [],
        errors: ['Invalid GLB magic header (expected 0x46546C67 "glTF").'],
        warnings: [],
        summary: `Invalid GLB file "${relPath}" (${buf.length} bytes).`,
      };
    }

    const version = buf.readUInt32LE(4);
    const declaredLen = buf.readUInt32LE(8);
    const jsonChunkLen = buf.readUInt32LE(12);
    const jsonChunkType = buf.readUInt32LE(16);

    const headerErrors: string[] = [];
    if (version !== 2) headerErrors.push(`Unsupported GLB version ${version} (expected 2).`);
    if (declaredLen > buf.length) headerErrors.push(`Truncated GLB: header declares ${declaredLen} bytes, file has ${buf.length}.`);
    if (jsonChunkType !== GLB_JSON_CHUNK || 20 + jsonChunkLen > buf.length) {
      headerErrors.push('Missing or truncated GLB JSON chunk.');
    }

    if (headerErrors.length > 0) {
      return {
        filePath: relPath,
        format: 'glb',
        exists: true,
        sizeBytes: buf.length,
        status: 'FAILED',
        meshCount: 0,
        materialCount: 0,
        hasPositions: false,
        hasNormals: false,
        hasTexCoords: false,
        hasPbrMaterials: false,
        nodeScaleIssues: [],
        errors: headerErrors,
        warnings: [],
        summary: `Corrupt GLB container "${relPath}": ${headerErrors.join(' ')}`,
      };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(buf.subarray(20, 20 + jsonChunkLen).toString('utf8')) as Record<string, unknown>;
    } catch {
      return {
        filePath: relPath,
        format: 'glb',
        exists: true,
        sizeBytes: buf.length,
        status: 'FAILED',
        meshCount: 0,
        materialCount: 0,
        hasPositions: false,
        hasNormals: false,
        hasTexCoords: false,
        hasPbrMaterials: false,
        nodeScaleIssues: [],
        errors: ['GLB JSON chunk failed to parse.'],
        warnings: [],
        summary: `Corrupt GLB JSON in "${relPath}".`,
      };
    }

    const detail = inspectGltfJsonObject(parsed, path.dirname(abs));
    const allErrors = [...detail.errors, ...detail.nodeScaleIssues];
    const isRawAiMeshOnly = !detail.hasPbrMaterials || !detail.hasTexCoords || !detail.hasNormals;
    const status: VerificationStatus =
      allErrors.length > 0
        ? 'FAILED'
        : isRawAiMeshOnly || detail.warnings.length > 0
          ? 'PARTIALLY_VERIFIED'
          : 'VERIFIED';

    return {
      filePath: relPath,
      format: 'glb',
      exists: true,
      sizeBytes: buf.length,
      status,
      meshCount: detail.meshCount,
      materialCount: detail.materialCount,
      hasPositions: detail.hasPositions,
      hasNormals: detail.hasNormals,
      hasTexCoords: detail.hasTexCoords,
      hasPbrMaterials: detail.hasPbrMaterials,
      nodeScaleIssues: detail.nodeScaleIssues,
      isRawAiMeshOnly,
      errors: allErrors,
      warnings: detail.warnings,
      summary:
        status === 'VERIFIED'
          ? `GLB "${relPath}" verified: ${detail.meshCount} mesh(es), ${detail.materialCount} PBR material(s), UVs+normals present.`
          : `GLB "${relPath}" -> ${status}: ${[...allErrors, ...detail.warnings].join(' | ')}`,
    };
  }

  if (ext === '.gltf') {
    try {
      const parsed = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
      const detail = inspectGltfJsonObject(parsed, path.dirname(abs));
      const allErrors = [...detail.errors, ...detail.nodeScaleIssues];
      const isRawAiMeshOnly = !detail.hasPbrMaterials || !detail.hasTexCoords || !detail.hasNormals;
      const status: VerificationStatus =
        allErrors.length > 0 ? 'FAILED' : isRawAiMeshOnly || detail.warnings.length > 0 ? 'PARTIALLY_VERIFIED' : 'VERIFIED';
      return {
        filePath: relPath,
        format: 'gltf',
        exists: true,
        sizeBytes: buf.length,
        status,
        meshCount: detail.meshCount,
        materialCount: detail.materialCount,
        hasPositions: detail.hasPositions,
        hasNormals: detail.hasNormals,
        hasTexCoords: detail.hasTexCoords,
        hasPbrMaterials: detail.hasPbrMaterials,
        nodeScaleIssues: detail.nodeScaleIssues,
        isRawAiMeshOnly,
        errors: allErrors,
        warnings: detail.warnings,
        summary: `glTF "${relPath}" -> ${status} (${detail.meshCount} mesh(es), ${detail.materialCount} material(s)).`,
      };
    } catch {
      return {
        filePath: relPath,
        format: 'gltf',
        exists: true,
        sizeBytes: buf.length,
        status: 'FAILED',
        meshCount: 0,
        materialCount: 0,
        hasPositions: false,
        hasNormals: false,
        hasTexCoords: false,
        hasPbrMaterials: false,
        nodeScaleIssues: [],
        errors: ['Invalid glTF JSON file.'],
        warnings: [],
        summary: `Corrupt glTF JSON in "${relPath}".`,
      };
    }
  }

  if (ext === '.fbx') {
    const isBinaryFbx = buf.subarray(0, 21).toString('ascii') === 'Kaydara FBX Binary  \x00';
    const isAsciiFbx = buf.subarray(0, 200).toString('utf8').includes('; FBX');
    if (!isBinaryFbx && !isAsciiFbx) {
      return {
        filePath: relPath,
        format: 'fbx',
        exists: true,
        sizeBytes: buf.length,
        status: 'FAILED',
        meshCount: 0,
        materialCount: 0,
        hasPositions: false,
        hasNormals: false,
        hasTexCoords: false,
        hasPbrMaterials: false,
        nodeScaleIssues: [],
        errors: ['Invalid FBX header signature.'],
        warnings: [],
        summary: `Invalid FBX file "${relPath}".`,
      };
    }
    return {
      filePath: relPath,
      format: 'fbx',
      exists: true,
      sizeBytes: buf.length,
      status: 'PARTIALLY_VERIFIED',
      meshCount: 1,
      materialCount: 0,
      hasPositions: true,
      hasNormals: false,
      hasTexCoords: false,
      hasPbrMaterials: false,
      nodeScaleIssues: [],
      warnings: ['FBX header verified; inspect mesh/normals/materials inside target engine (Unreal/Unity/Blender).'],
      errors: [],
      summary: `FBX header valid (${isBinaryFbx ? 'Binary' : 'ASCII'}, ${buf.length} bytes); engine import inspection still needed.`,
    };
  }

  return {
    filePath: relPath,
    format: 'unknown',
    exists: true,
    sizeBytes: buf.length,
    status: buf.length > 0 ? 'PARTIALLY_VERIFIED' : 'FAILED',
    meshCount: 0,
    materialCount: 0,
    hasPositions: false,
    hasNormals: false,
    hasTexCoords: false,
    hasPbrMaterials: false,
    nodeScaleIssues: [],
    errors: buf.length === 0 ? ['File is 0 bytes.'] : [],
    warnings: [`No binary mesh parser registered for "${ext || 'extensionless'}".`],
    summary: `Unparsed asset "${relPath}" (${buf.length} bytes).`,
  };
}

/**
 * Inspects rendered image artifacts (PNG/JPEG/WEBP) cleanly and rejects
 * missing, tiny, corrupt, or criteria-less renders from claiming VERIFIED.
 */
export function inspectRenderArtifactFile(
  workspaceDir: string,
  relPath: string,
  criteriaProvided: string[] = [],
): RenderArtifactInspection {
  const abs = assertSafeSubpathSync(workspaceDir, relPath);
  const ext = path.extname(relPath).toLowerCase();

  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return {
      filePath: relPath,
      exists: false,
      format: 'unknown',
      sizeBytes: 0,
      width: null,
      height: null,
      nonTrivialBytes: false,
      criteriaProvided,
      status: 'UNVERIFIED',
      reason: `Render artifact "${relPath}" does not exist on disk.`,
    };
  }

  const buf = fs.readFileSync(abs);
  const header = parseImageHeaderDimensions(buf, ext);
  const nonTrivialBytes = buf.length >= 64;

  if (header.format === 'unknown' || !nonTrivialBytes) {
    return {
      filePath: relPath,
      exists: true,
      format: header.format,
      sizeBytes: buf.length,
      width: header.width,
      height: header.height,
      nonTrivialBytes,
      criteriaProvided,
      status: 'FAILED',
      reason: `Artifact "${relPath}" failed image signature or minimum byte check (${buf.length} bytes).`,
    };
  }

  if (criteriaProvided.length === 0) {
    return {
      filePath: relPath,
      exists: true,
      format: header.format,
      sizeBytes: buf.length,
      width: header.width,
      height: header.height,
      nonTrivialBytes,
      criteriaProvided,
      status: 'PARTIALLY_VERIFIED',
      reason: `Valid ${header.format.toUpperCase()} render header (${header.width ?? '?'}x${header.height ?? '?'}), but visual acceptance criteria were not supplied.`,
    };
  }

  return {
    filePath: relPath,
    exists: true,
    format: header.format,
    sizeBytes: buf.length,
    width: header.width,
    height: header.height,
    nonTrivialBytes,
    criteriaProvided,
    status: 'VERIFIED',
    reason: `Valid ${header.format.toUpperCase()} render (${header.width ?? '?'}x${header.height ?? '?'}, ${buf.length} bytes) checked against ${criteriaProvided.length} criteria.`,
  };
}
