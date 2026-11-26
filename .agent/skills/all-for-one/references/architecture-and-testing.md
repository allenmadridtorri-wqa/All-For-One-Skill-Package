# Engine Architecture, Determinism & Verification Standards

Reference manual for `/crazycoder` — modular boundaries, deterministic PRNG, unit testing, and headless verification.

## 1. Strict 4-Layer Boundary

```text
core/   ──▶ Pure TypeScript/math/ECS/physics/state machines (0 DOM/WebGL imports)
audio/  ──▶ Web Audio bus graph + spatial emitters (cleanly mockable/optional)
render/ ──▶ Renderer, shaders, instanced meshes, camera optics (mounts once)
ui/     ──▶ React/HTML HUD & overlays (subscribes to throttled snapshots only)
```

- **Why:** `core/` runs at native speed in `node:test` (`npx tsx --test`) with zero browser overhead, catching physics, collision, scoring, and state-machine bugs in milliseconds.

## 2. Deterministic Seeded Randomness

- Never scatter `Math.random()` inside gameplay rules or procedural world builders.
- Pass a seeded `mulberry32(seed)` PRNG (`assets/ecs/math-scratch.ts`) so terrains, cities, loot, and AI test runs are 100% reproducible.

## 3. Software-WebGL & Verification Discipline

- Detect software WebGL renderers (`SwiftShader`, `llvmpipe`, `Mesa`) via `WEBGL_debug_renderer_info` and scale shadow resolution/post-FX gracefully so automated browser tests never time out.
- Expose clean state attributes (`data-game-state="playing"`, accessible HUD readouts) and support `?autostart=1` so automated QA can enter gameplay and verify live renders directly.
- Always run `scripts/check-hot-loop.ts` and `scripts/audit-pbr-scene.ts` before declaring a build complete.
