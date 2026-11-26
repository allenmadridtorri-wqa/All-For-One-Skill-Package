# Blender Automation & Game-Engine Asset Pipelines (All-For-One V3.1)

All-For-One V3.1 upgrades `/crazydesigner` and `/crazyqa` with **injection-hardened** headless Blender Python (`bpy`) automation, expanded Toggle Studio parameterized scene/motion templates, frame-range chunk splitting, and multi-engine 3D asset validation. **Blender remains an optional external dependency**: All-For-One never assumes Blender is installed and never attempts to auto-install it locally.

---

## 1. Checking Optional Blender & FFmpeg Availability

```bash
node scripts/install.mjs --check-tools
# Checks PATH, BLENDER_PATH, BLENDER_BIN, Windows "C:\Program Files\Blender Foundation\Blender *", and macOS /Applications/Blender.app
```

- When `blender` is installed (recommended **Blender 4.0+**), `runBlenderPythonScript()` executes headless background scripts safely via `execFileSync`.
- When `blender` is unavailable, script generation (`generateBlenderAutomationScript`), Colab GPU offloading (`core/cloud-rendering.ts`), and offline GLB/FBX validation still function, while local Blender execution honestly reports `status: 'UNVERIFIED'`.

---

## 2. Security & Path Confinement (V3.1 Hardening)

- **`validateBlenderWorkspacePath(candidatePath, workspaceDir?)`:** Blocks `..` traversal, null bytes, newline characters (`\r`/`\n`), and arbitrary system absolute paths outside `workspaceDir` / `os.tmpdir()` / `cwd`.
- **`serializePythonString()`:** Serializes all injected strings via `JSON.stringify` instead of unsafe raw `r"..."` interpolation, eliminating quote or newline breakout inside generated `.py` scripts.
- **Python-Side Enforcement:** Generated scripts resolve every `.blend`, render, and export path through `_resolve_safe_path()` (`os.path.realpath`), and `assets/blender/export_engine_asset.py` enforces `--base-dir` confinement.

---

## 3. Expanded Procedural `bpy` Capabilities (`core/blender-bridge.ts`)

`generateBlenderAutomationScript(spec, hardware, workspaceDir)` supports asset categories (`environment`, `hard-surface`, `character`, `creature`, `architecture`, `vehicle`, `prop`, `cinematic-shot`) with:
- **Metric 1:1 Scale & Smart UV:** `scene.unit_settings.scale_length = 1.0`, applied transforms, and `bpy.ops.uv.smart_project`.
- **Geometry Nodes & Automated LOD Chains:** Optional `GeometryNodeSubdivisionSurface` plus `LOD1` (50%) and `LOD2` (20%) decimate modifiers (`generateLods: true`).
- **Procedural PBR Shader Graph:** `ShaderNodeTexNoise` -> `ShaderNodeValToRGB` roughness variation + `ShaderNodeBump` normal relief wired into `Principled BSDF`.
- **Three-Point Lighting, Tracked Cameras & Choreography:** `SUN` + `AREA` + `SPOT` lights, depth-of-field tracking (`TRACK_TO` constraint), focal length/f-stop controls, and start/end keyframes (`static`, `orbit`, `dolly`, `crane`, `track-to`).
- **Character Rigs, Physics & Atmosphere:** Optional Armature with `IK_Target_Hand` and `Head_Jaw` facial bones, `AFO_ClothSim`, `AFO_HairParticles`, rigid-body physics, `ShaderNodeVolumePrincipled` volumetric domain (`volumetricFog`), and `CompositorNodeGlare` (`FOG_GLOW`) bloom.
- **Hardware-Clamped Cycles / EEVEE Fallback & Frame Splitting:** Clamps constrained 4GB/CPU laptops (`<= 960x540`, `<= 32` samples, `CPU` fallback) and exposes `splitFrameRange()` + `findMissingFramesInRange()` for recoverable batch rendering.

---

## 4. Standalone CLI Export & Engine Validation

```bash
blender --background --factory-startup scene.blend \
  --python-exit-code 1 \
  --python assets/blender/export_engine_asset.py -- \
  --base-dir=. --engine=unreal5 --format=fbx --out=exports/hero.fbx
```

| Engine | Preferred Format | Axes | Key Export Rules (`core/asset-pipeline.ts`) |
| :--- | :--- | :--- | :--- |
| **`unreal5`** | `.fbx` | `Z`-up, `-Y` forward | `mesh_smooth_type='FACE'`, `add_leaf_bones=False`, `FBX_SCALE_UNITS` |
| **`unity`** | `.fbx` | `Y`-up, `-Z` forward | Clamp skin weights `<= 4` bones/vertex, MikkTSpace tangents |
| **`godot`** | `.glb` | `Y`-up, `-Z` forward | Binary glTF 2.0 with packed `metallicRoughness` and animations |
| **`threejs`** | `.glb` | `Y`-up, `-Z` forward | `<= 4` material slots per prop, PoT textures (`<= 2048px`), `1u = 1m` |
| **`cpp-native` / `rust`** | `.glb` | `Y`-up, `-Z` forward | Indexed buffers, `TEXCOORD_0`, normals, skins, `NamedAnimations` |
