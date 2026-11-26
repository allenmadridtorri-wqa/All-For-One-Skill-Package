# All For One — Cross-Frontier AAA Benchmark Suite

Use these three flagship prompts to verify behavioral parity across **Claude**, **Google Antigravity**, and **ChatGPT / Codex**.

---

## Benchmark 1 — `/crazydesigner`: Hollywood Photorealistic Interactive 3D Scene

**Prompt:**
> `/crazydesigner` Create an interactive 3D storm-swept lighthouse cliff at dusk in Three.js with real-world metric scale, ACES Filmic tone mapping, Gerstner ocean water with Fresnel reflections, volumetric height fog, swaying coastal grass, and layered Web Audio wind/surf spatial sound.

**Pass Criteria:**
- Real-world scale (`1 unit = 1 meter`), `ACESFilmicToneMapping`, `SRGBColorSpace`.
- Custom GLSL water + height fog + wind sway shaders (no flat colored planes).
- Interactive orbit/first-person inspection + working Web Audio soundscape toggle.
- Zero `audit-pbr-scene.ts` failures and zero WebGL console errors.

---

## Benchmark 2 — `/crazymaker`: Rockstar-Tier AAA Traversal & Combat Feel

**Prompt:**
> `/crazymaker` Build a playable 3D third-person rooftop courier & combat vertical slice with coyote time, 120ms input buffering, melee hitstop, trauma-squared camera shake, patrolling AI guards with vision cones, and instant zero-reload restart.

**Pass Criteria:**
- Launches directly into the live 3D arena (supports `?autostart=1`).
- Crisp input buffering + coyote time + visible hitstop + smooth trauma camera shake.
- Guards transition cleanly across `PATROL -> SUSPICIOUS -> ALERT -> COMBAT -> SEARCH`.
- Pure gameplay state machine decoupled and verified via `node:test`.

---

## Benchmark 3 — `/crazycoder`: 50-Year Zero-GC Engine Refactor

**Prompt:**
> `/crazycoder` Build a deterministic 2,000-entity boid & projectile simulation using fixed-timestep accumulation (`1/60s`), `ObjectPool`, `InstancedMesh` single-draw-call rendering, zero per-frame heap allocations, and clean GPU `.dispose()` teardown.

**Pass Criteria:**
- Passes `scripts/check-hot-loop.ts` with 0 per-frame allocation findings.
- Fixed-timestep simulation decoupled in `core/` and covered by `node:test` determinism tests.
- All 2,000+ entities render via `InstancedMesh` in `<= 5` draw calls.

---

## Benchmark 4 — `/crazy`: Full "All For One" AAA Studio Deliverable

**Prompt:**
> `/crazy` Build a playable rain-soaked neon canyon hover-bike pursuit vertical slice with photorealistic wet asphalt reflections, spatial engine + rain audio, dynamic traffic/pursuit AI, drift physics, diegetic HUD, and locked 60 FPS.

**Pass Criteria:**
- Executes all 5 `/crazy` studio stages cleanly.
- Passes `check-hot-loop.ts`, `audit-pbr-scene.ts`, unit tests, and live browser visual inspection.
