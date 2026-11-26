# Blender Automation & Procedural 3D Pipeline (V3)

Reference guide for `/crazydesigner` and `/crazyqa` when driving Blender (`bpy`) via headless automation (`core/blender-bridge.ts`, `assets/blender/export_engine_asset.py`).

## 1. Optional Dependency Policy
- Detect Blender safely via `detectBlenderInstallation()` (`blender --version` without shell interpolation).
- **Never** assume Blender is pre-installed and **never** auto-install Blender silently.
- When Blender is unavailable on the host, generate syntax-clean `.py` automation scripts, mark actual Blender render execution as `UNVERIFIED`, and proceed honestly.

## 2. Procedural Modeling, Geometry Nodes & Scene Setup
- Initialize clean state with `bpy.ops.wm.read_factory_settings(use_empty=True)` and metric units (`unit_settings.system = 'METRIC'`, `scale_length = 1.0`).
- Prefer **Geometry Nodes** (`GeometryNodeTree`) for repeatable parametric props, foliage scatter, modular architecture, and bevel/array setups so `.blend` scenes stay non-destructive.
- Calibrate Principled BSDF materials (`Base Color` linear sRGB bounds `0.02–0.85`, realistic `Metallic` and `Roughness` maps, normal tangent space).
- Configure deterministic 3-point lighting or HDRI World nodes, camera focal length + depth-of-field, and `AgX` or `Filmic` view transform.

## 3. Physics, Particles, Rigging & Render Optimization
- Rigid-body / cloth / fluid simulations must bake caches explicitly before batch frame rendering.
- Apply hardware clamping (`detectHardwareProfile()`): cap render resolution (`<= 960px` on constrained hosts) and Cycles/EEVEE sample counts (`<= 32` on constrained hosts), enable Cycles denoising, and save `.blend` before rendering.

## 4. Visual Iteration Loop
Execute **Create → Render → Inspect → Diagnose → Improve → Render Again** (`core/visual-iteration.ts`):
1. File existence alone never proves visual quality.
2. Inspect rendered image validity, lighting contrast, silhouette, grounding, and material response.
3. Preserve the highest-scoring verified render via `ProductionMemoryLedger.preserveKnownGoodOutput`.
