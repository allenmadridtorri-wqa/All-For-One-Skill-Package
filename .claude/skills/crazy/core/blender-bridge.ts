import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EngineId } from './engine-profiles.ts';
import { detectHardwareProfile, type HardwareProfile } from './production-intelligence.ts';
import { assertSafeSubpathSync, atomicWriteFileSync } from './security.ts';

export interface BlenderDetectionResult {
  available: boolean;
  binary: string;
  version: string | null;
  majorMinor: string | null;
  gpuBackend: 'CUDA' | 'OPTIX' | 'HIP' | 'METAL' | 'CPU_ONLY' | 'UNKNOWN';
  status: 'AVAILABLE' | 'UNAVAILABLE';
  note: string;
}

export type BlenderAssetCategory =
  | 'environment'
  | 'hard-surface'
  | 'character'
  | 'creature'
  | 'architecture'
  | 'vehicle'
  | 'prop'
  | 'cinematic-shot';

export type BlenderRenderProfileId =
  | 'laptop-cpu-preview'
  | 'draft-720p'
  | 'production-1080p'
  | '4k-master';

export type BlenderCameraRigMode = 'static' | 'dolly' | 'orbit' | 'crane' | 'track-to';

export interface BlenderScriptSpec {
  sceneName: string;
  targetEngine: EngineId;
  blendOutputPath: string;
  renderOutputPath?: string;
  exportFormat?: 'glb' | 'gltf' | 'fbx';
  exportOutputPath?: string;
  category?: BlenderAssetCategory;
  renderProfile?: BlenderRenderProfileId;
  useGeometryNodes?: boolean;
  generateLods?: boolean;
  smartUvProject?: boolean;
  renderEngine?: 'BLENDER_EEVEE_NEXT' | 'CYCLES';
  samples?: number;
  resolutionX?: number;
  resolutionY?: number;
  frameStart?: number;
  frameEnd?: number;
  fps?: number;
  createArmatureRig?: boolean;
  enableIkFk?: boolean;
  enableFacialRig?: boolean;
  enableClothSim?: boolean;
  enableHairParticles?: boolean;
  enablePhysicsSim?: boolean;
  enableDestructionFracture?: boolean;
  bakeAnimations?: boolean;
  cameraRig?: BlenderCameraRigMode;
  focalLengthMm?: number;
  dofFstop?: number;
  motionBlur?: boolean;
  volumetricFog?: boolean;
  compositorBloom?: boolean;
  colorTransform?: 'AgX' | 'Filmic';
}

export interface BlenderExecutionResult {
  executed: boolean;
  status: 'VERIFIED' | 'UNVERIFIED' | 'FAILED';
  exitCode: number | null;
  command: string[];
  stdout: string;
  stderr: string;
  reason: string;
}

export interface FrameRangeChunk {
  chunkId: string;
  frameStart: number;
  frameEnd: number;
  frameCount: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  attempts: number;
}

/**
 * Serializes any string into a double-quoted Python string literal safely using JSON escaping,
 * preventing quote breakout, newline injection, backslash escapes, or arbitrary code injection.
 */
export function serializePythonString(value: string): string {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new Error('Invalid string literal for Python serialization.');
  }
  return JSON.stringify(value);
}

/**
 * Validates and normalizes an output or scene path so it cannot escape workspace bounds,
 * contain traversal segments (`..`), null bytes, or point to filesystem roots.
 */
export function validateBlenderWorkspacePath(
  candidatePath: string,
  workspaceDir?: string,
): string {
  if (typeof candidatePath !== 'string' || candidatePath.trim() === '' || candidatePath.includes('\0')) {
    throw new Error(`Unsafe Blender path rejected: "${String(candidatePath)}"`);
  }
  if (/[\r\n]/.test(candidatePath)) {
    throw new Error(`Unsafe Blender path rejected: newline characters are not permitted.`);
  }
  if (workspaceDir) {
    return assertSafeSubpathSync(workspaceDir, candidatePath);
  }
  if (path.isAbsolute(candidatePath)) {
    const resolved = path.resolve(candidatePath);
    const allowedRoots = [path.resolve(os.tmpdir()), path.resolve(process.cwd())];
    for (const root of allowedRoots) {
      if (resolved === root || resolved.startsWith(root + path.sep)) {
        return assertSafeSubpathSync(root, resolved);
      }
    }
    throw new Error(
      `Unsafe Blender path "${candidatePath}": pass workspaceDir or use a relative workspace subpath.`,
    );
  }
  const normalized = candidatePath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.some((s) => s === '..')) {
    throw new Error(`Path traversal blocked in Blender path: "${candidatePath}"`);
  }
  return normalized;
}

function getCandidateBlenderBinaries(customBinary?: string): string[] {
  const candidates: string[] = [];
  if (customBinary) candidates.push(customBinary);
  if (process.env.BLENDER_PATH) candidates.push(process.env.BLENDER_PATH);
  if (process.env.BLENDER_BIN) candidates.push(process.env.BLENDER_BIN);
  candidates.push('blender');

  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const base = path.join(programFiles, 'Blender Foundation');
    if (fs.existsSync(base)) {
      try {
        const dirs = fs
          .readdirSync(base, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => path.join(base, d.name, 'blender.exe'))
          .reverse();
        candidates.push(...dirs);
      } catch {
        // Ignore directory probe failure
      }
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
  }

  return [...new Set(candidates)];
}

/**
 * Safely detects if optional external Blender CLI is installed on the host.
 * Checks custom binary, env vars, PATH, and standard Windows/macOS install locations.
 * Never assumes installation and never attempts to auto-install Blender.
 */
export function detectBlenderInstallation(customBinary?: string): BlenderDetectionResult {
  const candidates = getCandidateBlenderBinaries(customBinary);

  for (const bin of candidates) {
    try {
      const out = execFileSync(bin, ['--version'], {
        encoding: 'utf8',
        timeout: 4000,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      const firstLine = out.split(/\r?\n/)[0] || '';
      const verMatch = firstLine.match(/Blender\s+(\d+\.\d+(?:\.\d+)?)/i);
      const version = verMatch ? verMatch[1] : firstLine || 'unknown';
      const majorMinorMatch = version.match(/^(\d+\.\d+)/);
      return {
        available: true,
        binary: bin,
        version,
        majorMinor: majorMinorMatch ? majorMinorMatch[1] : null,
        gpuBackend: 'UNKNOWN',
        status: 'AVAILABLE',
        note: `Detected ${firstLine} at "${bin}"`,
      };
    } catch {
      // Try next candidate
    }
  }

  return {
    available: false,
    binary: customBinary || 'blender',
    version: null,
    majorMinor: null,
    gpuBackend: 'CPU_ONLY',
    status: 'UNAVAILABLE',
    note: 'Blender executable not found on PATH or standard OS install folders. Optional Blender automation runs as script generation + offline validation only.',
  };
}

export function buildBlenderCliArgs(
  workspaceDir: string,
  options: {
    scriptRelPath: string;
    blendFileRelPath?: string;
    extraArgs?: string[];
  },
): string[] {
  const safeScript = assertSafeSubpathSync(workspaceDir, options.scriptRelPath);
  const args = ['--background', '--factory-startup'];
  if (options.blendFileRelPath) {
    const safeBlend = assertSafeSubpathSync(workspaceDir, options.blendFileRelPath);
    args.push(safeBlend);
  }
  args.push('--python-exit-code', '1', '--python', safeScript);
  if (options.extraArgs && options.extraArgs.length > 0) {
    args.push('--', ...options.extraArgs);
  }
  return args;
}

export function runBlenderPythonScript(
  workspaceDir: string,
  options: {
    scriptRelPath: string;
    blendFileRelPath?: string;
    extraArgs?: string[];
    blenderBinary?: string;
    timeoutMs?: number;
  },
): BlenderExecutionResult {
  const detection = detectBlenderInstallation(options.blenderBinary);
  const args = buildBlenderCliArgs(workspaceDir, options);

  if (!detection.available) {
    return {
      executed: false,
      status: 'UNVERIFIED',
      exitCode: null,
      command: [detection.binary, ...args],
      stdout: '',
      stderr: '',
      reason: detection.note,
    };
  }

  try {
    const stdout = execFileSync(detection.binary, args, {
      cwd: path.resolve(workspaceDir),
      encoding: 'utf8',
      timeout: options.timeoutMs ?? 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
      executed: true,
      status: 'VERIFIED',
      exitCode: 0,
      command: [detection.binary, ...args],
      stdout,
      stderr: '',
      reason: 'Blender headless background script executed with exit code 0.',
    };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    return {
      executed: true,
      status: 'FAILED',
      exitCode: typeof e.status === 'number' ? e.status : 1,
      command: [detection.binary, ...args],
      stdout: e.stdout ? String(e.stdout) : '',
      stderr: e.stderr ? String(e.stderr) : e.message ?? 'Blender execution failed.',
      reason: `Blender exited with non-zero code (${e.status ?? 1}).`,
    };
  }
}

export function resolveBlenderRenderSettings(
  spec: BlenderScriptSpec,
  hardware: HardwareProfile = detectHardwareProfile(),
): {
  resX: number;
  resY: number;
  samples: number;
  renderEngine: 'BLENDER_EEVEE_NEXT' | 'CYCLES';
  useGpuCompute: boolean;
} {
  const profileDefaults: Record<
    BlenderRenderProfileId,
    { w: number; h: number; samples: number }
  > = {
    'laptop-cpu-preview': { w: 854, h: 480, samples: 16 },
    'draft-720p': { w: 1280, h: 720, samples: 32 },
    'production-1080p': { w: 1920, h: 1080, samples: 64 },
    '4k-master': { w: 3840, h: 2160, samples: 128 },
  };

  const preset = profileDefaults[spec.renderProfile ?? (hardware.tier === 'constrained' ? 'laptop-cpu-preview' : 'draft-720p')];
  const maxWidth = hardware.tier === 'constrained' ? 960 : 3840;
  const maxHeight = hardware.tier === 'constrained' ? 540 : 2160;
  const maxSamples = hardware.tier === 'constrained' ? 32 : 256;

  return {
    resX: Math.min(spec.resolutionX ?? preset.w, maxWidth),
    resY: Math.min(spec.resolutionY ?? preset.h, maxHeight),
    samples: Math.min(spec.samples ?? preset.samples, maxSamples),
    renderEngine: spec.renderEngine ?? (hardware.tier === 'constrained' ? 'BLENDER_EEVEE_NEXT' : 'CYCLES'),
    useGpuCompute: hardware.tier !== 'constrained',
  };
}

/**
 * Generates a secure, deterministic, hardware-clamped Blender Python (`bpy`) automation script.
 * All paths and strings are workspace-validated and safely serialized via JSON string escaping.
 */
export function generateBlenderAutomationScript(
  spec: BlenderScriptSpec,
  hardware: HardwareProfile = detectHardwareProfile(),
  workspaceDir?: string,
): string {
  const safeSceneId = spec.sceneName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'AFO_Scene';
  const safeBlendPath = validateBlenderWorkspacePath(spec.blendOutputPath, workspaceDir);
  const safeRenderPath = spec.renderOutputPath
    ? validateBlenderWorkspacePath(spec.renderOutputPath, workspaceDir)
    : undefined;
  const safeExportPath = spec.exportOutputPath
    ? validateBlenderWorkspacePath(spec.exportOutputPath, workspaceDir)
    : undefined;

  const renderCfg = resolveBlenderRenderSettings(spec, hardware);
  const category = spec.category ?? 'prop';
  const fps = Math.max(12, Math.min(120, spec.fps ?? 24));
  const frameStart = Math.max(1, spec.frameStart ?? 1);
  const frameEnd = Math.max(frameStart, spec.frameEnd ?? frameStart);
  const cameraRig = spec.cameraRig ?? 'track-to';
  const focalLength = Math.max(12, Math.min(200, spec.focalLengthMm ?? 35));
  const dofFstop = Math.max(1.2, Math.min(22, spec.dofFstop ?? 4.0));
  const colorTransform = spec.colorTransform ?? 'Filmic';

  const pyBaseDirLit = serializePythonString(path.resolve(workspaceDir ?? '.'));
  const pyBlendLit = serializePythonString(safeBlendPath);
  const pySceneLit = serializePythonString(safeSceneId);
  const pyEngineLit = serializePythonString(spec.targetEngine);
  const pyRenderLit = safeRenderPath ? serializePythonString(safeRenderPath) : 'None';
  const pyExportLit = safeExportPath ? serializePythonString(safeExportPath) : 'None';

  const modelingBlock =
    category === 'architecture'
      ? `bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0.0, 0.0, 1.0))
hero = bpy.context.active_object
hero.scale = (2.2, 1.4, 1.8)
bevel = hero.modifiers.new(name="AFO_ArchBevel", type='BEVEL')
bevel.width = 0.04
bevel.segments = 2`
      : category === 'environment'
        ? `bpy.ops.mesh.primitive_grid_add(x_subdivisions=32, y_subdivisions=32, size=18.0, location=(0.0, 0.0, 0.0))
hero = bpy.context.active_object
disp = hero.modifiers.new(name="AFO_TerrainDisp", type='DISPLACE')
tex = bpy.data.textures.new("AFO_TerrainNoise", type='CLOUDS')
tex.noise_scale = 2.4
disp.texture = tex
disp.strength = 1.2`
        : category === 'vehicle'
          ? `bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.6))
hero = bpy.context.active_object
hero.scale = (2.1, 0.95, 0.55)
bevel = hero.modifiers.new(name="AFO_ChassisBevel", type='BEVEL')
bevel.width = 0.06
bevel.segments = 3`
          : `bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.5))
hero = bpy.context.active_object
bevel = hero.modifiers.new(name="AFO_HardSurfaceBevel", type='BEVEL')
bevel.width = 0.03
bevel.segments = 2`;

  const exportBlock =
    safeExportPath && spec.exportFormat === 'fbx'
      ? `
# Engine-calibrated FBX export (${spec.targetEngine})
export_path = _resolve_safe_path(EXPORT_OUTPUT_PATH)
os.makedirs(os.path.dirname(export_path), exist_ok=True)
bpy.ops.export_scene.fbx(
    filepath=export_path,
    use_selection=False,
    apply_scale_options='FBX_SCALE_UNITS',
    axis_forward='-Y' if TARGET_ENGINE == 'unreal5' else '-Z',
    axis_up='Z' if TARGET_ENGINE == 'unreal5' else 'Y',
    mesh_smooth_type='FACE',
    use_mesh_modifiers=True,
    add_leaf_bones=False,
    bake_anim=${spec.bakeAnimations !== false ? 'True' : 'False'},
)`
      : safeExportPath
        ? `
# Engine-calibrated glTF/GLB export (${spec.targetEngine})
export_path = _resolve_safe_path(EXPORT_OUTPUT_PATH)
os.makedirs(os.path.dirname(export_path), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=export_path,
    export_format=${serializePythonString(spec.exportFormat === 'gltf' ? 'GLTF_SEPARATE' : 'GLB')},
    export_apply=True,
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_animations=True,
)`
        : '';

  return `"""All-For-One V3.1 Secure Blender Automation Script (${category} / ${spec.targetEngine})"""
import math
import os
import bpy

WORKSPACE_ROOT = os.path.realpath(${pyBaseDirLit})
SCENE_NAME = ${pySceneLit}
TARGET_ENGINE = ${pyEngineLit}
BLEND_OUTPUT_PATH = ${pyBlendLit}
RENDER_OUTPUT_PATH = ${pyRenderLit}
EXPORT_OUTPUT_PATH = ${pyExportLit}


def _resolve_safe_path(rel_or_abs):
    target = os.path.realpath(rel_or_abs if os.path.isabs(rel_or_abs) else os.path.join(WORKSPACE_ROOT, rel_or_abs))
    if target != WORKSPACE_ROOT and not target.startswith(WORKSPACE_ROOT + os.sep):
        raise ValueError(f"Blocked out-of-workspace path: {target}")
    return target


# 1. Clean factory scene & metric 1 unit = 1m scale
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
scene.render.fps = ${fps}
scene.frame_start = ${frameStart}
scene.frame_end = ${frameEnd}

assets_col = bpy.data.collections.new("AFO_Assets")
lighting_col = bpy.data.collections.new("AFO_LightingAndCam")
scene.collection.children.link(assets_col)
scene.collection.children.link(lighting_col)

# 2. Procedural 3D Hero Asset (${category})
${modelingBlock}
hero.name = f"{SCENE_NAME}_Hero"
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

${
  spec.smartUvProject !== false
    ? `bpy.context.view_layer.objects.active = hero
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')`
    : ''
}

${
  spec.useGeometryNodes !== false
    ? `mod = hero.modifiers.new(name="AFO_ProceduralGeo", type='NODES')
node_group = bpy.data.node_groups.new("AFO_GeoTree", 'GeometryNodeTree')
mod.node_group = node_group
iface = node_group.interface
iface.new_socket(name="Geometry", in_out='INPUT', socket_type='NodeSocketGeometry')
iface.new_socket(name="Geometry", in_out='OUTPUT', socket_type='NodeSocketGeometry')
in_node = node_group.nodes.new('NodeGroupInput')
out_node = node_group.nodes.new('NodeGroupOutput')
subdiv = node_group.nodes.new('GeometryNodeSubdivisionSurface')
subdiv.inputs['Level'].default_value = 1
node_group.links.new(in_node.outputs['Geometry'], subdiv.inputs['Mesh'])
node_group.links.new(subdiv.outputs['Mesh'], out_node.inputs['Geometry'])`
    : ''
}

${
  spec.generateLods
    ? `# 2b. Automated LOD Chain (LOD1 @ 50%, LOD2 @ 20%)
for lod_idx, ratio in [(1, 0.5), (2, 0.2)]:
    lod_obj = hero.copy()
    lod_obj.data = hero.data.copy()
    lod_obj.name = f"{SCENE_NAME}_LOD{lod_idx}"
    lod_obj.location.x += lod_idx * 3.0
    dec = lod_obj.modifiers.new(name=f"LOD{lod_idx}_Decimate", type='DECIMATE')
    dec.ratio = ratio
    assets_col.objects.link(lod_obj)`
    : ''
}

# 3. Procedural PBR Material Graph (Noise -> ColorRamp -> Principled BSDF + Bump)
mat = bpy.data.materials.new(name="AFO_ProceduralPBR")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes.get("Principled BSDF")
if bsdf:
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 6.5
    noise.inputs["Detail"].default_value = 4.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.30, 0.30, 0.30, 1.0)
    ramp.color_ramp.elements[1].color = (0.62, 0.62, 0.62, 1.0)
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Base Color"].default_value = (0.34, 0.38, 0.43, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.18
hero.data.materials.append(mat)

# 4. Grounding Plane, Three-Point Lighting & Cinematic Camera Rig (${cameraRig})
bpy.ops.mesh.primitive_plane_add(size=18.0, location=(0.0, 0.0, 0.0))
ground = bpy.context.active_object
ground.name = "GroundPlane"

bpy.ops.object.light_add(type='SUN', location=(4.5, -4.5, 6.5))
key_light = bpy.context.active_object
key_light.data.energy = 3.2
key_light.rotation_euler = (math.radians(48.0), 0.0, math.radians(38.0))

bpy.ops.object.light_add(type='AREA', location=(-3.8, -2.5, 3.0))
fill_light = bpy.context.active_object
fill_light.data.energy = 85.0

bpy.ops.object.light_add(type='SPOT', location=(-1.5, 4.2, 3.6))
rim_light = bpy.context.active_object
rim_light.data.energy = 140.0

bpy.ops.object.camera_add(location=(3.4, -3.6, 2.0))
cam = bpy.context.active_object
cam.name = "AFO_CinematicCamera"
cam.data.lens = ${focalLength}
cam.data.dof.use_dof = True
cam.data.dof.focus_object = hero
cam.data.dof.aperture_fstop = ${dofFstop}
track = cam.constraints.new(type='TRACK_TO')
track.target = hero
track.track_axis = 'TRACK_NEGATIVE_Z'
track.up_axis = 'UP_Y'
scene.camera = cam

${
  cameraRig !== 'static' && frameEnd > frameStart
    ? `# Camera Choreography Keyframes (${cameraRig})
cam.location = (3.6, -3.8, 1.9)
cam.keyframe_insert(data_path="location", frame=${frameStart})
cam.location = ${cameraRig === 'crane' ? '(2.2, -2.6, 3.6)' : cameraRig === 'orbit' ? '(-3.4, -3.2, 2.1)' : '(2.2, -2.4, 1.75)'}
cam.keyframe_insert(data_path="location", frame=${frameEnd})`
    : ''
}

${
  spec.volumetricFog
    ? `# 4b. Volumetric Atmosphere Box
bpy.ops.mesh.primitive_cube_add(size=24.0, location=(0.0, 0.0, 4.0))
vol_box = bpy.context.active_object
vol_box.name = "AFO_VolumetricDomain"
vol_mat = bpy.data.materials.new("AFO_VolFog")
vol_mat.use_nodes = True
vnt = vol_mat.node_tree
vnt.nodes.clear()
vout = vnt.nodes.new("ShaderNodeOutputMaterial")
pvol = vnt.nodes.new("ShaderNodeVolumePrincipled")
pvol.inputs["Density"].default_value = 0.015
pvol.inputs["Anisotropy"].default_value = 0.45
vnt.links.new(pvol.outputs["Volume"], vout.inputs["Volume"])
vol_box.data.materials.append(vol_mat)`
    : ''
}

${
  spec.createArmatureRig
    ? `# 5. Character Armature + IK/FK & Facial Rig Skeleton
bpy.ops.object.armature_add(location=(0.0, 0.0, 0.0))
rig = bpy.context.active_object
rig.name = f"{SCENE_NAME}_Rig"
${
  spec.enableIkFk || spec.enableFacialRig
    ? `bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
root_b = eb[0]
root_b.name = "Root"
${
  spec.enableIkFk
    ? `ik_t = eb.new("IK_Target_Hand")
ik_t.head = (0.4, 0.0, 1.0)
ik_t.tail = (0.4, 0.2, 1.0)`
    : ''
}
${
  spec.enableFacialRig
    ? `jaw = eb.new("Head_Jaw")
jaw.head = (0.0, 0.0, 1.55)
jaw.tail = (0.0, -0.12, 1.50)`
    : ''
}
bpy.ops.object.mode_set(mode='OBJECT')`
    : ''
}`
    : ''
}

${
  spec.enableClothSim
    ? `hero.modifiers.new(name="AFO_ClothSim", type='CLOTH')`
    : ''
}
${
  spec.enableHairParticles
    ? `ps = hero.modifiers.new(name="AFO_HairParticles", type='PARTICLE_SYSTEM')
ps.particle_system.settings.type = 'HAIR'
ps.particle_system.settings.count = ${hardware.tier === 'constrained' ? 120 : 600}`
    : ''
}
${
  spec.enablePhysicsSim
    ? `bpy.context.view_layer.objects.active = hero
bpy.ops.rigidbody.object_add(type='ACTIVE')
bpy.context.view_layer.objects.active = ground
bpy.ops.rigidbody.object_add(type='PASSIVE')`
    : ''
}

# 6. Hardware-Bounded Render Configuration + Safe GPU/CPU Fallback
try:
    scene.render.engine = ${serializePythonString(renderCfg.renderEngine)}
except Exception:
    scene.render.engine = 'BLENDER_EEVEE'

scene.render.resolution_x = ${renderCfg.resX}
scene.render.resolution_y = ${renderCfg.resY}
scene.render.use_motion_blur = ${spec.motionBlur ? 'True' : 'False'}

try:
    scene.view_settings.view_transform = ${serializePythonString(colorTransform)}
except Exception:
    scene.view_settings.view_transform = 'Filmic'

if scene.render.engine == 'CYCLES' and hasattr(scene, "cycles"):
    scene.cycles.samples = ${renderCfg.samples}
    scene.cycles.use_denoising = True
    scene.cycles.device = 'GPU' if ${renderCfg.useGpuCompute ? 'True' : 'False'} else 'CPU'
elif hasattr(scene, "eevee"):
    scene.eevee.taa_render_samples = ${renderCfg.samples}

${
  spec.compositorBloom
    ? `scene.use_nodes = True
comp = scene.node_tree
rl = comp.nodes.get("Render Layers")
co = comp.nodes.get("Composite")
if rl and co:
    glare = comp.nodes.new("CompositorNodeGlare")
    glare.glare_type = 'FOG_GLOW'
    glare.threshold = 1.1
    comp.links.new(rl.outputs["Image"], glare.inputs["Image"])
    comp.links.new(glare.outputs["Image"], co.inputs["Image"])`
    : ''
}

# 7. Save .blend Project
blend_path = _resolve_safe_path(BLEND_OUTPUT_PATH)
os.makedirs(os.path.dirname(blend_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

if RENDER_OUTPUT_PATH:
    render_path = _resolve_safe_path(RENDER_OUTPUT_PATH)
    os.makedirs(os.path.dirname(render_path), exist_ok=True)
    scene.render.filepath = render_path
    bpy.ops.render.render(write_still=${frameEnd === frameStart ? 'True' : 'False'}, animation=${frameEnd > frameStart ? 'True' : 'False'})
${exportBlock}
print("AFO_BLENDER_PIPELINE_DONE")
`;
}

export function writeBlenderAutomationScript(
  workspaceDir: string,
  scriptRelPath: string,
  spec: BlenderScriptSpec,
  hardware?: HardwareProfile,
): string {
  const safePath = assertSafeSubpathSync(workspaceDir, scriptRelPath);
  const code = generateBlenderAutomationScript(spec, hardware, workspaceDir);
  atomicWriteFileSync(safePath, code);
  return safePath;
}

/**
 * Deterministic frame-range splitter so long cinematics (e.g. 2,160 frames)
 * run as recoverable, hardware-safe render chunks instead of one brittle job.
 */
export function splitFrameRange(
  frameStart: number,
  frameEnd: number,
  chunkSize: number,
  prefix = 'CHUNK',
): FrameRangeChunk[] {
  if (frameStart < 1 || frameEnd < frameStart) {
    throw new Error(`Invalid frame range ${frameStart}..${frameEnd}`);
  }
  const safeSize = Math.max(1, Math.floor(chunkSize));
  const chunks: FrameRangeChunk[] = [];
  let cursor = frameStart;
  let index = 1;
  while (cursor <= frameEnd) {
    const end = Math.min(frameEnd, cursor + safeSize - 1);
    chunks.push({
      chunkId: `${prefix}-${String(index).padStart(3, '0')}`,
      frameStart: cursor,
      frameEnd: end,
      frameCount: end - cursor + 1,
      status: 'PENDING',
      attempts: 0,
    });
    cursor = end + 1;
    index += 1;
  }
  return chunks;
}

/**
 * Computes missing or failed frame numbers in an output directory for checkpoint recovery.
 */
export function findMissingFramesInRange(
  workspaceDir: string,
  outputDirRel: string,
  frameStart: number,
  frameEnd: number,
  ext = '.png',
  prefix = 'frame_',
  padDigits = 4,
): number[] {
  const absDir = assertSafeSubpathSync(workspaceDir, outputDirRel);
  const missing: number[] = [];
  for (let f = frameStart; f <= frameEnd; f++) {
    const filename = `${prefix}${String(f).padStart(padDigits, '0')}${ext}`;
    const fullPath = path.join(absDir, filename);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size < 64) {
      missing.push(f);
    }
  }
  return missing;
}
