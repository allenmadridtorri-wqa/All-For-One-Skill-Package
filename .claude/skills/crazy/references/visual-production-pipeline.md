# Visual Production Pipeline & Shot-by-Shot Verification

Reference manual for `/crazydesigner` — structured cinematic & game environment production workflow inspired by studio look-dev pipelines.

## 1. Structured Visual Production Stages

1. **Reference Analysis (`VISUAL_REFERENCE.md`):** Capture explicit lighting mood, color palette bounds, material contrast ratios, silhouette hierarchy, and camera focal lengths before writing scene/shader code.
2. **Shot & Camera Planning:**
   - **Cinematics:** Define numbered shots (`SHOT-01`..`SHOT-N`) with camera focal length (`24mm`/`35mm`/`50mm`/`85mm`), aperture/DoF, subject framing (rule of thirds / leading lines), and camera motion curve (dolly/pan/crane).
   - **Games:** Define gameplay camera rig, hero landmark sightlines, foreground/midground/background depth separation, and photo/inspect viewpoints.
3. **Composition & Lighting Breakdown:** Separate key light (Kelvin + direction), sky/bounce fill, rim separation, practical accents, and atmospheric fog/volumetrics.
4. **Material Specifications:** Document surface micro/meso/macro frequencies, roughness contrast (matte `0.75–0.90` vs specular accents `0.05–0.25`), and weathering masks.
5. **Render Previews & Manifest Safety (`core/production-intelligence.ts`):**
   - Generate fast preview passes first (`low-res / reduced samples`) to validate silhouette, composition, and exposure before committing to expensive final renders.
   - Track every render output in `.afo/render-manifest.json` (input hashes, checkpoints, backup-before-overwrite).
6. **Final Render Verification (Visual Evidence Rule):**
   - Inspect actual screenshots/renders via `/crazyqa` (`verifyVisualEvidenceFile`) against every documented criterion in `VISUAL_REFERENCE.md`.
   - **Never claim visual quality passed without inspecting real rendered images or live viewport captures.**
