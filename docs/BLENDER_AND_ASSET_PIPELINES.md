# Blender Automation & Game-Engine Asset Pipelines (All-For-One V3)

All-For-One V3 upgrades `/crazydesigner` and `/crazyqa` with deterministic headless Blender Python (`bpy`) automation, hardware-bounded rendering, and multi-engine 3D asset validation. **Blender is an optional external dependency**: All-For-One never assumes Blender is installed and never attempts to auto-install it.

---

## 1. Checking Optional Blender Availability

```bash
node scripts/install.mjs --check-tools
# or via core API:
# detectBlenderInstallation() -> { available, binary, version, majorMinor, status, note }
```

- When `blender` is installed (recommended **Blender 4.0+**), `runBlenderPythonScript()` executes headless background scripts safely via `execFileSync('blender', ['--background', '--factory-startup', '--python-exit-code', '1', '--python', safeScript])`.
- When `blender` is unavailable, script generation (`generateBlenderAutomationScript`) and offline asset/render validation still function, while runtime Blender execution honestly reports `status: 'UNVERIFIED'`.

---

## 2. Generated `bpy` Automation Features (`core/blender-bridge.ts`)

`generateBlenderAutomationScript(spec, hardware)` produces deterministic Blender scripts enforcing:
- **Metric 1:1 Scale:** `scene.unit_settings.system = 'METRIC'`, `scale_length = 1.0`, applied object transforms.
- **Procedural Modeling & Geometry Nodes:** Attaches a `GeometryNodeTree` (`Nodes` modifier) with `GeometryNodeSubdivisionSurface` when `useGeometryNodes !== false`.
- **Calibrated PBR Materials:** Builds node-based `Principled BSDF` materials within realistic dielectric/metallic ranges.
- **Studio Lighting & Camera:** Adds key `SUN` + fill `AREA` light, grounding plane, and framed camera.
- **Optional Rigging & Physics:** Adds Armature setup (`createArmatureRig: true`) and rigid-body active/passive physics (`enablePhysicsSim: true`).
- **Hardware-Bounded Rendering:** Automatically clamps resolution (`<= 960px` on constrained hardware, `<= 1920px` otherwise) and Cycles/EEVEE sample counts (`<= 32` constrained, `<= 128` standard) with `Filmic` color management and Cycles denoising.

---

## 3. Standalone CLI Asset Export Helper

Use `assets/blender/export_engine_asset.py` inside any existing `.blend` scene:

```bash
blender --background --factory-startup scene.blend \
  --python-exit-code 1 \
  --python assets/blender/export_engine_asset.py -- \
  --engine=unreal5 --format=fbx --out=exports/hero.fbx
```

---

## 4. Target Engine Export Calibration (`core/asset-pipeline.ts`)

| Engine | Preferred Format | Axes | Key Export Rules |
| :--- | :--- | :--- | :--- |
| **`unreal5`** | `.fbx` | `Z`-up, `-Y` forward | `mesh_smooth_type='FACE'`, `add_leaf_bones=False`, `FBX_SCALE_UNITS`, max 8 bone influences |
| **`unity`** | `.fbx` | `Y`-up, `-Z` forward | Clamp skin weights `<= 4` bones/vertex, freeze non-uniform scale, MikkTSpace tangents |
| **`godot`** | `.glb` | `Y`-up, `-Z` forward | Binary glTF 2.0 with packed `metallicRoughness`, applied transforms, verified animation tracks |
| **`threejs`** | `.glb` | `Y`-up, `-Z` forward | `<= 4` material slots per hero prop, PoT textures (`<= 2048px`), `1 unit = 1m` |
| **`cpp-native`** | `.glb` | `Y`-up, `-Z` forward | Indexed triangle buffers ready for `cgltf` / `meshoptimizer` |
| **`rust`** | `.glb` | `Y`-up, `-Z` forward | Bevy PBR `.glb` with `TEXCOORD_0`, vertex normals, skins, and `NamedAnimations` |

### Automated Validation (`validateExportedAsset`)
- **`.glb` / `.gltf`:** Parses glTF 2.0 JSON/binary chunks and checks mesh count (`> 0`), `TEXCOORD_0` UVs, vertex `NORMAL` attributes, PBR materials, skins/animations, and node scale `(1,1,1)` compliance.
- **`.fbx`:** Verifies `Kaydara FBX Binary` or ASCII `; FBX` signatures and honestly flags deep bone/UV inspection as `PARTIALLY_VERIFIED` unless verified inside Blender or the target engine importer.

---

## 5. Visual Iteration Loop (`core/visual-iteration.ts`)

`VisualIterationController` structures `/crazydesigner` visual refinement across:
`CREATE` -> `RENDER` -> `INSPECT` -> `DIAGNOSE` -> `IMPROVE` -> `RE_RENDER`

- Validates image signatures (PNG `89 50 4E 47`, JPEG `FF D8 FF`, WEBP `RIFF...WEBP`).
- Rejects existence-only checks without visual acceptance criteria (`PARTIALLY_VERIFIED`, never `VERIFIED`).
- Tracks `bestVerifiedRender` and stops cleanly on target score met, max iterations, or plateau.
