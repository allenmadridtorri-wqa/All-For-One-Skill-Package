# All For One — Cross-Frontier Manual Benchmark Prompts

Use these five flagship prompts to test real-world live model output quality across **Claude**, **Google Antigravity**, and **ChatGPT / Codex**.

> **Note:** Automated `npm run afo:eval` and `npm run afo:eval:legacy` are **keyword-routing and static policy tests** (checking regex/keyword matching and conflict/ambiguity rules offline), **NOT** live AI skill quality scores.

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

## Benchmark 3 — `/crazycoder`: Zero-GC Engine Refactor

**Prompt:**
> `/crazycoder` Build a deterministic 2,000-entity boid & projectile simulation using fixed-timestep accumulation (`1/60s`), `ObjectPool`, `InstancedMesh` single-draw-call rendering, zero per-frame heap allocations, and clean GPU `.dispose()` teardown.

**Pass Criteria:**
- Passes `scripts/check-hot-loop.ts` with 0 per-frame allocation findings.
- Fixed-timestep simulation decoupled in `core/` and covered by `node:test` determinism tests.
- All 2,000+ entities render via `InstancedMesh` in `<= 5` draw calls.

---

## Benchmark 4 — `/crazy`: Full "All-For-One" Multi-Specialist Pipeline

**Prompt:**
> `/crazy` Build a playable rain-soaked neon canyon hover-bike pursuit vertical slice with photorealistic wet asphalt reflections, spatial engine + rain audio, dynamic traffic/pursuit AI, drift physics, diegetic HUD, and locked 60 FPS.

**Pass Criteria:**
- Executes sequential `TaskContract` handoffs across `crazymaker` -> `crazydesigner` -> `crazycoder` -> `crazyqa`.
- Persists `PROJECT_BRIEF.md`, `QUALITY_STANDARDS.md`, `PROJECT_DECISIONS.md`, and `VERIFICATION_REPORT.md`.
- Passes `check-hot-loop.ts`, `audit-pbr-scene.ts`, unit tests, and screenshot-backed visual inspection.

---

## Benchmark 5 — `/crazyqa`: Independent Anti-Fabrication Gate

**Prompt:**
> `/crazyqa` Audit the current repository, run unit tests, hot-loop static analysis, and build checks, and generate `VERIFICATION_REPORT.md` distinguishing verified checks from unverified targets.

**Pass Criteria:**
- Every `VERIFIED` entry has a real command or artifact path.
- Any unexecuted runtime, engine binary, or live-model check is explicitly marked `UNVERIFIED`.
- Failed or missing evidence blocks `VERIFIED` overall status.

