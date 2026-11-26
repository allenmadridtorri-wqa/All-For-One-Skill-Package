# Engine Profile: Three.js / TypeScript

- **Architecture:** Strict 4-layer separation: `core/` (pure TypeScript simulation, math, AI, state machines with 0 DOM/WebGL imports), `audio/` (Web Audio HRTF bus), `render/` (Three.js renderer mounted once), and `ui/` (thin React/DOM HUD fed by throttled snapshots).
- **Project Structure:**
  - `src/core/`, `src/render/`, `src/audio/`, `src/ui/`
  - Reusable helpers in `assets/ecs/` and `assets/shaders/`
- **Rendering Pipeline:** `WebGLRenderer` (or `WebGPURenderer` with WebGL2 fallback), `ACESFilmicToneMapping`, `SRGBColorSpace`, `PMREMGenerator` environment lighting, `PCFSoftShadowMap`, `EffectComposer` with thresholded bloom (`>= 1.0`).
- **Physics Integration:** Fixed-timestep accumulator (`assets/ecs/fixed-timestep.ts`) with Rapier WASM or custom swept-capsule / BVH collision in `src/core/`.
- **Asset Management:** `GLTFLoader` + `DRACOLoader` + `KTX2Loader` wrapped in a ref-counted asset registry; procedural `CanvasTexture`/`DataTexture` PBR fallbacks when external assets are absent.
- **Memory Management:** Pre-allocated scratch math (`assets/ecs/math-scratch.ts`), `ObjectPool<T>` for projectiles/particles, `ResourceLifecycleTracker` (`assets/ecs/resource-tracker.ts`) guaranteeing `.dispose()` on geometries, materials, textures, and render targets.
- **Performance Guidelines:** Clamp `setPixelRatio(Math.min(devicePixelRatio, 2))`; batch static/repeated props with `InstancedMesh`; run `scripts/check-hot-loop.ts` and `scripts/audit-pbr-scene.ts`.
- **Testing:** `node:test` via `tsx --test` for `src/core/` + headless browser WebGL screenshot & console error verification.
- **Build & Deploy:** `tsc --noEmit && vite build` with verified asset bundling.
