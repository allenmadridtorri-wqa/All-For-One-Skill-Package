# Visual Production Pipeline, 8-Stage Asset Tracking & Verification

Reference manual for `/crazydesigner` and `/crazyqa` — structured 40-year studio look-dev, asset-refinement, and visual verification pipeline.

## 1. Strict 5-Way Deliverable Distinction

Never mislabel an earlier artifact as a finished downstream deliverable:
1. **Concept Image (2D PNG/JPG)** — Art direction or orthographic turnaround only; **never** a 3D asset.
2. **AI-Generated Raw Mesh (TripoSR / SF3D / Hunyuan3D)** — Sculptural blockout only; requires Blender retopology, UV cleanup, and PBR textures.
3. **Refined PBR Asset (GLB / FBX)** — Clean topology, `TEXCOORD_0` UVs, `1u = 1m` applied scale, calibrated albedo (`0.03–0.85`), roughness micro-detail, normals.
4. **Completed Scene** — Calibrated HDRI + key/fill/rim lighting, optical camera/DoF, atmospheric depth, ACES Filmic look-dev render.
5. **Playable Environment** — LODs, collision volumes, lightprobes, draw-call batching, and verified target engine frame pacing.

## 2. Mandatory 8-Stage Production Chain

Track every visual deliverable honestly across all 8 checkpoints (`core/asset-validation.ts`):
`SCRIPT_GENERATED` -> `SCRIPT_EXECUTED` -> `ASSET_CREATED` -> `ASSET_REFINED` -> `ASSET_EXPORTED` -> `ASSET_IMPORTED` -> `VISUALLY_INSPECTED` -> `QA_VERIFIED`.

## 3. Structured Production Workflow

1. **Reference & Recipe Selection (`references/photorealism-production-recipes.md`):** Pick the matching recipe (Product/Vehicle, Architecture, Natural Landscape, Character, or Playable 3D Scene) via `npx tsx scripts/afo.ts route --domain=<...>`.
2. **Lighting & PBR Standards:** Separate key/fill/rim Kelvin temperatures, apply roughness contrast (`0.72–0.90` matte vs `0.05–0.25` specular), use ACES Filmic tone mapping.
3. **Preview -> Look-Dev -> Final Render Ladder:** Run `PREVIEW` (`960x540`), calibrate materials in `LOOK_DEVELOPMENT` (`1280x720`), and commit `FINAL_T4_RENDER` (`1920x1080`) only after passing visual inspection.
4. **Structural & Visual QA Verification:**
   - Validate 3D binaries (`POSITION`, `NORMAL`, `TEXCOORD_0`, PBR materials, non-zero scale) with `npx tsx scripts/afo.ts validate-asset --file=<path.glb>`.
   - Inspect rendered images with `npx tsx scripts/afo.ts validate-asset --file=<render.png> --criteria="lighting,silhouette,grounding"`.
   - **Never claim visual quality passed from file existence or script generation alone.**
