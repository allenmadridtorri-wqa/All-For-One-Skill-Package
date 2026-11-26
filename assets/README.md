# All For One — Reusable Engineering & Shader Assets

Each utility in `assets/` is **engine-scoped**. Do not force TypeScript or GLSL web helpers into Unreal C++, Unity C#, Godot GDScript, or native C++ projects.

## Engine Applicability Matrix

| Asset | Applicable Engines | Purpose |
| :--- | :--- | :--- |
| `assets/ecs/fixed-timestep.ts` | Three.js / TypeScript / Node sims | Deterministic `1/60s` accumulator with spiral-of-death clamping and render interpolation `alpha`. (Use `_physics_process` in Godot, `FixedUpdate` in Unity, `AsyncPhysicsTick` in UE5.) |
| `assets/ecs/object-pool.ts` | Three.js / TypeScript | Zero-GC pre-allocated pool for bullets, particles, and transient events. (Use `UnityEngine.Pool.ObjectPool<T>` in Unity, `Niagara`/Actor pools in UE5.) |
| `assets/ecs/math-scratch.ts` | Three.js / TypeScript | Seeded `mulberry32` PRNG, exponential damping, and pre-allocated `Float64Array` scratch buffers. |
| `assets/ecs/resource-tracker.ts` | Three.js / TypeScript / WebAudio | Explicit GPU/audio `.dispose()` leak detector and synchronous micro-benchmark harness. |
| `assets/shaders/*.glsl` | Three.js / WebGL2 / OpenGL | Reusable GLSL chunks (`common-noise`, `pbr-water`, `atmosphere-fog`, `foliage-wind`). Port math to HLSL for UE5/Unity or Godot Shading Language (`shader_type spatial`) when targeting those engines. |
