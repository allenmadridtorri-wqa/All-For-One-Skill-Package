# Hollywood VFX, Shaders & Post-Processing Pipeline

Reference manual for `/crazydesigner` — custom GLSL/WGSL optical effects, volumetrics, water, particles, and post-FX ordering.

## 1. Feature-Film Post-Processing Stack Order

Apply screen-space passes in physically sensible order (HDR linear space before tone mapping):
1. **HDR Scene Render** (`HalfFloatType` render target, MSAA or depth-aware AA).
2. **Ambient Occlusion (GTAO / SSAO)** — grounds contact crevices before lighting accumulation.
3. **Volumetric Fog / God-Rays** — depth-aware raymarch or analytical height-fog + sun scattering (`assets/shaders/atmosphere-fog.glsl`).
4. **Thresholded Bloom** — `threshold >= 1.0` (only true HDR emissives, sun glints, sparks, and neon bloom—never wash out midtones!). `strength: 0.25–0.55`, `radius: 0.4–0.65`.
5. **ACES Filmic Tone Mapping + sRGB Output**.
6. **Subtle Optical Finish** — Micro vignette (`<= 18%` edge darkening), negligible chromatic aberration (`0.001–0.002` at screen corners only), subtle temporal film grain (`0.015–0.025`).

## 2. Shader Craft Recipes

Reuse the verified GLSL building blocks in `assets/shaders/`:
- **Noise & Turbulence (`assets/shaders/common-noise.glsl`)**: 3D simplex noise, multi-octave FBM, and divergence-free curl noise for realistic smoke, sparks, and fire plumes.
- **Photoreal Water (`assets/shaders/pbr-water.glsl`)**: Sum of 4+ directional Gerstner waves, analytical tangent-space normals, Schlick Fresnel (`F0 = 0.02`), Beer-Lambert depth absorption (`exp(-depth * extinction)`), and crisp GGX sun specular glints.
- **Atmosphere & Height Fog (`assets/shaders/atmosphere-fog.glsl`)**: Exponential density falloff with altitude + Henyey-Greenstein Mie forward-scattering toward the key light.
- **Foliage Wind (`assets/shaders/foliage-wind.glsl`)**: Root-pinned (`uv.y` or vertex color weight) primary trunk bend + high-frequency leaf flutter driven by world-space gust waves.

## 3. GPU Particle & VFX Layering

Never spawn single-sprite explosions or bare spheres. Layer every VFX event into 4 sub-emitters using pooled/instanced quads:
1. **Flash / Core (0–60ms):** High-HDR emissive core (`intensity > 2.5`) driving clean bloom.
2. **Velocity Sparks / Debris (100–600ms):** Stretched along velocity vector, gravity + ground bounce.
3. **Volumetric Smoke / Dust (300–2500ms):** Soft-alpha curl-drifted puffs with normal-lit hemisphere shading.
4. **Residual Atmosphere:** Lingering embers, heat shimmer, or scorch/puddle decals.
