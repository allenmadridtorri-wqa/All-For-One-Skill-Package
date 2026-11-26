import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { EngineId } from './engine-profiles.ts';
import { detectHardwareProfile, type HardwareProfile } from './production-intelligence.ts';
import { assertSafeSubpathSync, atomicWriteFileSync } from './security.ts';

export interface BlenderDetectionResult {
  available: boolean;
  binary: string;
  version: string | null;
  majorMinor: string | null;
  status: 'AVAILABLE' | 'UNAVAILABLE';
  note: string;
}

export interface BlenderScriptSpec {
  sceneName: string;
  targetEngine: EngineId;
  blendOutputPath: string;
  renderOutputPath?: string;
  exportFormat?: 'glb' | 'gltf' | 'fbx';
  exportOutputPath?: string;
  useGeometryNodes?: boolean;
  renderEngine?: 'BLENDER_EEVEE_NEXT' | 'CYCLES';
  samples?: number;
  resolutionX?: number;
  resolutionY?: number;
  createArmatureRig?: boolean;
  enablePhysicsSim?: boolean;
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

/**
 * Safely detects if optional external Blender CLI is installed on the host.
 * Never assumes installation and never attempts to auto-install Blender.
 */
export function detectBlenderInstallation(customBinary = 'blender'): BlenderDetectionResult {
  try {
    const out = execFileSync(customBinary, ['--version'], {
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
      binary: customBinary,
      version,
      majorMinor: majorMinorMatch ? majorMinorMatch[1] : null,
      status: 'AVAILABLE',
      note: `Detected ${firstLine}`,
    };
  } catch {
    return {
      available: false,
      binary: customBinary,
      version: null,
      majorMinor: null,
      status: 'UNAVAILABLE',
      note: 'Blender executable not found in PATH. Optional Blender automation runs as script generation + offline validation only.',
    };
  }
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

/**
 * Generates a deterministic, hardware-clamped Blender Python (`bpy`) automation script
 * supporting procedural modeling, Geometry Nodes, PBR materials, lighting/camera,
 * optional rigging/physics, optimized rendering, and engine-specific FBX/glTF export.
 */
export function generateBlenderAutomationScript(
  spec: BlenderScriptSpec,
  hardware: HardwareProfile = detectHardwareProfile(),
): string {
  const maxRes = hardware.tier === 'constrained' ? 960 : 1920;
  const maxSamples = hardware.tier === 'constrained' ? 32 : 128;
  const resX = Math.min(spec.resolutionX ?? 1280, maxRes);
  const resY = Math.min(spec.resolutionY ?? 720, maxRes);
  const samples = Math.min(spec.samples ?? 64, maxSamples);
  const renderEngine = spec.renderEngine ?? 'BLENDER_EEVEE_NEXT';

  const exportBlock =
    spec.exportOutputPath && spec.exportFormat === 'fbx'
      ? `
# Engine-calibrated FBX export (${spec.targetEngine})
os.makedirs(os.path.dirname(r"${spec.exportOutputPath}"), exist_ok=True)
bpy.ops.export_scene.fbx(
    filepath=r"${spec.exportOutputPath}",
    use_selection=False,
    apply_scale_options='FBX_SCALE_UNITS',
    axis_forward='-Y' if "${spec.targetEngine}" == "unreal5" else '-Z',
    axis_up='Z' if "${spec.targetEngine}" == "unreal5" else 'Y',
    mesh_smooth_type='FACE',
    use_mesh_modifiers=True,
    add_leaf_bones=False,
)
`
      : spec.exportOutputPath
        ? `
# Engine-calibrated glTF/GLB export (${spec.targetEngine})
os.makedirs(os.path.dirname(r"${spec.exportOutputPath}"), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=r"${spec.exportOutputPath}",
    export_format='${spec.exportFormat === 'gltf' ? 'GLTF_SEPARATE' : 'GLB'}',
    export_apply=True,
    export_yup=True,
    export_texcoords=True,
    export_normals=True,
    export_materials='EXPORT',
    export_animations=True,
)
`
        : '';

  return `"""All-For-One V3 Blender Automation Script — ${spec.sceneName} (${spec.targetEngine})"""
import math
import os
import bpy

# 1. Clean factory scene & metric 1 unit = 1m scale
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0

# 2. Procedural base hero asset + optional Geometry Nodes modifier
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.5))
hero = bpy.context.active_object
hero.name = "${spec.sceneName.replace(/[^a-zA-Z0-9_]/g, '_')}_Hero"
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

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

# 3. Calibrated PBR Material (Principled BSDF)
mat = bpy.data.materials.new(name="AFO_CalibratedPBR")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.36, 0.40, 0.44, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.15
    bsdf.inputs["Roughness"].default_value = 0.45
hero.data.materials.append(mat)

# 4. Studio 3-Point Lighting + Grounding Plane + Camera
bpy.ops.mesh.primitive_plane_add(size=12.0, location=(0.0, 0.0, 0.0))
ground = bpy.context.active_object
ground.name = "GroundPlane"

bpy.ops.object.light_add(type='SUN', location=(4.0, -4.0, 6.0))
key_light = bpy.context.active_object
key_light.data.energy = 3.2
key_light.rotation_euler = (math.radians(48.0), 0.0, math.radians(38.0))

bpy.ops.object.light_add(type='AREA', location=(-3.5, -2.5, 3.0))
fill_light = bpy.context.active_object
fill_light.data.energy = 80.0

bpy.ops.object.camera_add(location=(3.2, -3.4, 2.1))
cam = bpy.context.active_object
cam.rotation_euler = (math.radians(66.0), 0.0, math.radians(43.0))
scene.camera = cam

${
  spec.createArmatureRig
    ? `# 5. Basic Armature Rig Setup
bpy.ops.object.armature_add(location=(0.0, 0.0, 0.0))
rig = bpy.context.active_object
rig.name = "${spec.sceneName.replace(/[^a-zA-Z0-9_]/g, '_')}_Rig"`
    : ''
}

${
  spec.enablePhysicsSim
    ? `# 6. Rigid-body Physics Setup
bpy.context.view_layer.objects.active = hero
bpy.ops.rigidbody.object_add(type='ACTIVE')
bpy.context.view_layer.objects.active = ground
bpy.ops.rigidbody.object_add(type='PASSIVE')`
    : ''
}

# 7. Hardware-bounded Render Configuration + Filmic Color Management
scene.render.engine = "${renderEngine}"
scene.render.resolution_x = ${resX}
scene.render.resolution_y = ${resY}
scene.view_settings.view_transform = 'Filmic'
if hasattr(scene, "cycles") and scene.render.engine == 'CYCLES':
    scene.cycles.samples = ${samples}
    scene.cycles.use_denoising = True
elif hasattr(scene, "eevee"):
    scene.eevee.taa_render_samples = ${samples}

# 8. Save .blend Project
os.makedirs(os.path.dirname(r"${spec.blendOutputPath}"), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=r"${spec.blendOutputPath}")
${
  spec.renderOutputPath
    ? `
os.makedirs(os.path.dirname(r"${spec.renderOutputPath}"), exist_ok=True)
scene.render.filepath = r"${spec.renderOutputPath}"
bpy.ops.render.render(write_still=True)
`
    : ''
}
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
  const code = generateBlenderAutomationScript(spec, hardware);
  atomicWriteFileSync(safePath, code);
  return safePath;
}
