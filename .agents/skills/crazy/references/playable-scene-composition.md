# Playable 3D Scene Composition & Real-World Scale

Reference manual for `/crazydesigner` — staging interactive 3D worlds that feel huge, coherent, and effortless to explore.

## 1. Real-World Metric Scale Law (`1 unit = 1 meter`)

- **Character Eye Height:** `1.62m–1.72m` (total character height `1.75m–1.85m`, capsule radius `0.35m`).
- **Architecture:** Doorway `0.95m x 2.15m`, floor-to-ceiling `3.0m–3.6m`, stair riser `0.17m`, stair tread `0.28m`, street lane `3.5m` wide, sidewalk curb `0.15m` high.
- **Vehicles:** Sedan `4.5m x 1.85m x 1.45m`, wheel radius `0.34m`.
- Consistent metric scale guarantees realistic camera parallax, shadow resolution, physics gravity (`9.81 m/s²`), and spatial audio falloff.

## 2. Cinematic Camera Optics & Framing

- **Focal Lengths:**
  - `24mm–28mm` (`fov ~65°–74°`): Sweeping landscapes, high-speed driving, claustrophobic interiors.
  - `35mm–42mm` (`fov ~50°–58°`): Default AAA third-person action / cinematic exploration.
  - `50mm–85mm` (`fov ~28°–42°`): Dramatic character close-ups, inspect views, sniper/photo mode.
- **Three-Plane Depth Composition:**
  1. **Foreground:** Framing silhouette (overhanging beams, railings, foliage, doorway edge) to establish depth parallax.
  2. **Midground:** Primary playable arena, hero landmarks, clear leading lines toward objectives.
  3. **Background:** Distant skyline, mountain ridges, haze-muted mega-structures anchoring horizon scale.

## 3. Interactive World Readability

- **Sightlines & Light Breadcrumbs:** Use warm pools of light, distinct architectural landmarks, and contrasting silhouette values to guide players without giant floating arrows.
- **Collision Shells vs. Visual Meshes:** Pair high-detail composite visual meshes with simple, clean capsule/box/heightfield collision volumes so characters and cameras never snag on decorative trim.
- **Camera Spring-Arm Collision:** Raycast/spherecast from player pivot to desired camera position and pull the camera forward cleanly when walls intervene.
