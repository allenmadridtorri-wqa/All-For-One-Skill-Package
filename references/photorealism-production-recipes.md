# Photorealistic 3D Production Recipes (Hollywood Look-Dev Standards)

## 1. Purpose
Codify 40-year Hollywood 3D, VFX, surface storytelling, camera, and lighting production recipes so AI direction never falls back to flat "Python primitive" placeholder scenes or claims photorealism from uncalibrated meshes.

## 2. Applicable Specialist
- Primary: `crazydesigner` (Visual & 3D Production Director)
- Verification: `crazyqa` (Asset & Render Verification)

## 3. Relevant Tools
- Multi-stage router: `npx tsx scripts/afo.ts route --domain=<product-vehicle|architecture-interior|natural-landscape|character-creature|playable-3d-scene>`
- Blender headless export: `assets/blender/export_engine_asset.py`
- Three.js PBR audit: `scripts/audit-pbr-scene.ts`
- Asset validator: `npx tsx scripts/afo.ts validate-asset --file=<relPath>`

## 4. Production Methodology

### Strict Artifact Distinction Rule
Never conflate these five distinct deliverables:
1. **Concept Image (2D PNG)** — Inspiration/orthographic plate only.
2. **AI-Generated Raw Mesh (TripoSR / SF3D)** — Rough sculptural blockout with baked lighting/triangulated topology; **never** ship directly.
3. **Refined PBR Asset** — Retopologized quads, clean `TEXCOORD_0` UVs, `1u = 1m` applied scale, calibrated albedo (`0.04–0.85` linear), roughness micro-detail, normals.
4. **Completed Scene** — Calibrated HDRI + key/fill/rim lighting, atmospheric depth, optical camera/DoF, ACES Filmic look-dev render.
5. **Playable Environment** — LODs, collision volumes, draw-call batching, lightprobes, fixed-timestep integration verified at 60 FPS.

### Recipe A — Photorealistic Products & Vehicles
- **Modeling:** Prefer precision Sub-D / Bevel + Mirror hard-surface topology over raw AI 3D reconstruction for crisp panel seams (2–4 mm chamfers on body edges catch rim specular highlights).
- **Shaders:** Dual-layer car paint (`Base Color` + `Metallic` flake + `Coat Weight = 1.0`, `Coat Roughness = 0.03–0.08`, subtle orange-peel bump on coat normal). Separate brushed/machined brake rotor anisotropy, matte rubber tires (`roughness 0.72–0.88`), refractive headlamp glass (`IOR 1.48–1.52`, `Transmission`).
- **Lighting:** Softbox Area Lights reflecting sleek studio gradients along fender curvature + real ground contact shadow catcher (`AO` + micro-rough asphalt).

### Recipe B — Photorealistic Architecture & Interiors
- **Scale & Imperfection:** Lock exact real-world metrics (doorways `0.9m x 2.1m`, counters `0.9m`, ceilings `2.7m–3.2m`). Never leave razor-sharp 90° edges—add subtle bevels and edge wear.
- **Materials:** `ambientCG` CC0 stone, oak timber grain along structural length, warm matte plaster (`roughness 0.75–0.92`, roughness variation map breaks flat plastic look).
- **Lighting:** Motivatable sunlight/sky portals outside windows combined with warm interior fixtures (`2700K–3200K`) vs cool sky fill (`6500K–8000K`). Enable `OPENIMAGEDENOISE` albedo+normal passes.

### Recipe C — Natural Landscapes & Environments
- **Layering:** Separate macro terrain heightfields (`Depth-Anything-V2-Small` or sculpted erosion), mid-scale hero cliffs/boulders, instanced foliage clumps, and foreground ground scatter (`Quaternius` / Geometry Nodes).
- **Materials:** Distance-blended triplanar terrain shaders (cliff slope mask -> exposed granite; flat valley -> damp soil + moss roughness).
- **Atmosphere:** Height-falloff volumetric haze + Nishita/Poly Haven sky HDRI so distant mountain ridges lose saturation/contrast naturally.

### Recipe D — Characters & Creatures
- **Workflow:** Orthographic turnaround (`SDXL`) -> blockout mesh -> **mandatory Blender retopology** (concentric loops around shoulders, elbows, knees, mouth, eyes) -> baked tangent-space normals + subsurface skin shader (`Subsurface Weight` with warm scatter radius) -> `Rigify` / IK-FK weight-paint test across extreme poses.

## 5. Technical Requirements
- Color management: ACES Filmic (`AgX` / `ACESFilmicToneMapping`) + sRGB display transform.
- Units: `1 Blender unit = 1 meter`, applied rotations and `[1, 1, 1]` scale before export.
- PBR albedo clamped (`>= 0.03` charcoal, `<= 0.85` fresh snow/plaster).

## 6. Important Constraints
- Never replace entire multi-part visual environments with simplistic procedural primitives and label them "photorealistic".
- Never skip the 8-stage progress chain (`SCRIPT_GENERATED` -> `SCRIPT_EXECUTED` -> `ASSET_CREATED` -> `ASSET_REFINED` -> `ASSET_EXPORTED` -> `ASSET_IMPORTED` -> `VISUALLY_INSPECTED` -> `QA_VERIFIED`).

## 7. Common Failures
- Pure `1.0` white albedo blowing out ACES highlights or `0.0` uniform roughness creating toy-plastic reflections.
- Missing `NORMAL` or `TEXCOORD_0` attributes in raw `.glb` exports.
- Flat unmotivated ambient fill killing depth cues and contact shadows.

## 8. Quality Standards
- Visually inspect every render from at least two angles (hero 35–50 mm cinematic camera + utility inspection angle) checking silhouette, material separation, shadow grounding, and specular rolloff.

## 9. Performance Considerations
- Real-time engine exports cap draw calls with shared texture atlases, ORM channel packing (`Occlusion/Roughness/Metallic`), and `LOD1`/`LOD2` decimation chains.

## 10. Validation Procedure
- Inspect `.glb`/`.gltf`/`.fbx` using `validate_generated_asset` and inspect rendered `.png` passes using `inspect_render_artifacts` with explicit lighting/composition criteria.

## 11. Known Limitations
- True photorealism requires external Blender Cycles/engine rendering + visual inspection; headless code validation checks structural correctness (`GLB`, UVs, normals, PBR material slots), not aesthetic beauty alone.

## 12. Authoritative Sources
- Blender 4.2 Principled BSDF & Cycles Documentation: https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/principled.html
- Khronos glTF 2.0 PBR Specification: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
- Academy ACES Filmic Color Pipeline: https://acescentral.com/
