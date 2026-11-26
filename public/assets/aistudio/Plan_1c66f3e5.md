# All For One — Ultimate AAA Game Development One Skill Package Plan

**Package Name:** `All For One`  
**Target:** Frontier AI Models (**Claude**, **Google Antigravity**, **ChatGPT / OpenAI Codex**)  
**Mission:** Unify **40 years of Hollywood-grade 3D/VFX/Audio mastery**, **40 years of Rockstar-tier AAA game development**, and **50 years of principal systems & engine coding** into a single, portable **One Skill Package** with dedicated specialist slash commands (`/crazydesigner`, `/crazymaker`, `/crazycoder`) and a unified master orchestrator (`/crazy`).

---

## 1. Core Vision & Slash Command Architecture

Instead of vague "make a 3D game" prompts that produce plastic lighting, floaty controls, and spaghetti code, **All For One** encodes three world-class veteran disciplines into modular, triggerable workflows:

| Slash Command | Veteran Persona & Domain | Core Responsibilities |
| :--- | :--- | :--- |
| **`/crazydesigner`** | **40 Years — Hollywood 3D Modeler, VFX Supervisor, Look-Dev & Spatial Audio Director** | Super-hyperrealistic photorealistic 3D scenes, physically accurate PBR/Disney BSDF materials, real-world lighting rigs (HDRI/IBL, volumetric fog, Kelvin light temperatures, ACES Filmic tone mapping), cinematic camera optics (DoF, anamorphic bloom, motion blur), procedural geometry/terrain/foliage, custom GLSL/WGSL VFX shaders, Foley & 3D spatial audio, and interactive playable 3D environments. |
| **`/crazymaker`** | **40 Years — Rockstar-Tier AAA Game Director & Systems Designer** | Open-world & AAA game architecture, addictive core loops, visceral "game feel" (hitstop, camera trauma, input buffering, animation state blending, coyote time), mission/quest state machines, believable AI NPC perception & crowd/combat behaviors, vehicle & character physics tuning, diegetic HUD/UX, and vertical-slice pacing. |
| **`/crazycoder`** | **50 Years — Principal Engine, Graphics & Systems Architect** | Zero-GC hot loops, Entity-Component-System (ECS) architecture, fixed-timestep physics accumulators, spatial partitioning (BVH, octrees, spatial hash grids), GPU instancing & draw-call budgeting, LOD streaming, WebGPU/WebGL2/Three.js/TypeScript/C++/Rust/GLSL mastery, deterministic unit tests, and frame-time profiling. |
| **`/crazy`** | **All For One — Full-Stack AAA Studio Pipeline** | Combines `/crazydesigner` + `/crazymaker` + `/crazycoder` in a synchronized multi-stage pipeline—producing complete, playable, hyperrealistic, rock-solid AAA 3D games and interactive experiences from a single command. |

---

## 2. How "One Skill Package" Works Across Frontier Models

Modern AI platforms share the open **Agent Skills (`SKILL.md`)** convention while differing in discovery paths and slash-command registration. **All For One** authors everything once and maps cleanly to every frontier:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CANONICAL PACKAGE: all-for-one/                           │
│                                                                             │
│  ├── manifest.yaml                 # Cross-frontier package metadata & map  │
│  ├── skills/                                                                │
│  │   ├── crazy/SKILL.md            # /crazy         (Unified Orchestrator)  │
│  │   ├── crazydesigner/SKILL.md    # /crazydesigner (3D, VFX, Audio, Look)  │
│  │   ├── crazymaker/SKILL.md       # /crazymaker    (AAA Game Design & AI)  │
│  │   └── crazycoder/SKILL.md       # /crazycoder    (50yr Engine & Systems) │
│  ├── references/                   # Tier-3 deep technical & artistic specs │
│  ├── scripts/                      # Deterministic validators & profilers   │
│  ├── assets/                       # PBR presets, shader libs, ECS starters │
│  └── evals/                        # Cross-model trigger & AAA quality evals│
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          ▼                            ▼                            ▼
┌───────────────────┐        ┌───────────────────┐        ┌───────────────────┐
│      CLAUDE       │        │    ANTIGRAVITY    │        │  CHATGPT / CODEX  │
│                   │        │                   │        │                   │
│ .claude/skills/   │        │ .agent/skills/    │        │ .agents/skills/   │
│  ├─ crazy/        │        │  ├─ all-for-one/  │        │  ├─ crazy/        │
│  ├─ crazydesigner/│        │ .agent/workflows/ │        │  ├─ crazydesigner/│
│  ├─ crazymaker/   │        │  ├─ crazy.md      │        │  ├─ crazymaker/   │
│  └─ crazycoder/   │        │  ├─ crazydesigner │        │  └─ crazycoder/   │
│                   │        │  ├─ crazymaker.md │        │                   │
│ + Desktop .zip    │        │  └─ crazycoder.md │        │ + Custom GPT pkg  │
└───────────────────┘        └───────────────────┘        └───────────────────┘
```

### Platform Mapping Details

1. **Claude (Claude Code, Claude Desktop, Anthropic API)**
   - In Claude Code, each directory inside `.claude/skills/<command>/SKILL.md` (or `~/.claude/skills/`) automatically registers `/<command>` as a slash command **and** enables auto-discovery.
   - Generates `.zip` skill bundles for Claude Desktop / claude.ai web upload.
   - Maps tool hints to Claude conventions (`allowed-tools`, subagent delegation for `/crazy`).

2. **Google Antigravity (Antigravity IDE & Gemini CLI)**
   - Installs core domain knowledge in `.agent/skills/` (workspace) or `~/.gemini/antigravity/skills/` (global).
   - Emits explicit slash-command workflows in `.agent/workflows/` (`crazy.md`, `crazydesigner.md`, `crazymaker.md`, `crazycoder.md`) so `/crazy`, `/crazydesigner`, `/crazymaker`, and `/crazycoder` execute deterministically step-by-step.

3. **ChatGPT / OpenAI (Codex CLI, ChatGPT Desktop, Custom GPTs)**
   - Installs Agent Skills directories into `.agents/skills/` and `~/.codex/skills/` for native Codex & ChatGPT Desktop support.
   - Compiles a flattened `dist/chatgpt/custom-gpt/` bundle (master system instructions + zipped `references/` knowledge files) for ChatGPT web/Custom GPT users.

---

## 3. Progressive Disclosure & Context Engineering

Encoding 130 combined years of 3D, VFX, AAA design, and systems engineering into a single monolithic prompt would blow up context windows and degrade reasoning on every model. **All For One** uses strict **3-Tier Progressive Disclosure**:

- **Tier 1 — Frontmatter Index (~100 tokens per skill)**
  - Only `name` and high-signal `description` load at startup so the agent knows *when* to invoke `/crazydesigner`, `/crazymaker`, `/crazycoder`, or `/crazy` with zero idle token bloat.
- **Tier 2 — Discipline Doctrine (< 3,500 tokens per `SKILL.md`)**
  - Contains non-negotiable engineering/artistic laws, step-by-step execution checklists, and routing tables pointing to `references/` and `scripts/`.
- **Tier 3 — Deep Craft Vault (`references/`, `scripts/`, `assets/`)**
  - Loaded **only** when the current task requires that specific domain.

### Planned Tier-3 Reference & Asset Library

#### `/crazydesigner` Vault (Hollywood 3D, VFX, Audio & Playable Scenes)
- `references/photoreal-lighting-aces.md` — Real-world Kelvin/lux values, HDRI IBL setup, shadow cascade tuning, ACES Filmic tone mapping, physical camera exposure (EV100, f-stop, focal length).
- `references/pbr-material-calibration.md` — Measured albedo/roughness/metalness ranges (no pure `#000`/`#fff`, proper dielectric F0 = 0.04, subsurface scattering, clearcoat, anisotropy, triplanar terrain blending).
- `references/hollywood-vfx-shaders.md` — Custom GLSL/WGSL shaders: volumetric god-rays, height/exponential fog, curl-noise smoke & embers, physically plausible water (Gerstner + Fresnel + caustics), post-processing stack (GTAO, bloom, chromatic aberration, film grain).
- `references/playable-scene-composition.md` — Hero framing, rule of thirds, sightlines, real-world scale (`1 unit = 1 meter`), micro/meso/macro surface detail layering, interactive props & collision shells.
- `references/aaa-spatial-audio.md` — Procedural & layered Web Audio / spatial HRTF soundscapes, distance attenuation, Doppler, dynamic combat/exploration stems, occlusion, and UI foley.

#### `/crazymaker` Vault (Rockstar-Tier AAA Game Design)
- `references/aaa-game-feel-juice.md` — Frame-accurate hitstop, trauma-based procedural camera shake, input buffering, animation blending & IK grounding, coyote time, tactile feedback curves.
- `references/open-world-systems.md` — Streaming zones, day/night & weather cycles, dynamic world events, wanted/faction heat systems, mission state machines, diegetic HUD & minimal-friction onboarding.
- `references/npc-ai-and-combat.md` — Utility AI & behavior trees, sensory cones (sight/hearing), squad flanking/cover tactics, telegraphing attacks, difficulty pacing.
- `references/physics-and-traversal.md` — Character controller state machines (walk/sprint/slide/climb/vault), arcade-sim vehicle suspension & drift tuning, ragdoll/impact reactions.

#### `/crazycoder` Vault (50-Year Principal Engine & Systems Craft)
- `references/ecs-and-hot-loop.md` — Cache-friendly ECS patterns, fixed-timestep physics + interpolated render state, object pooling, zero-allocation `tick()` rules.
- `references/gpu-budget-and-profiling.md` — Draw-call batching & `InstancedMesh`, LODs, frustum/occlusion culling, texture compression/mipmaps, shader uniform caching, disposal lifecycle (zero GPU memory leaks).
- `references/architecture-and-testing.md` — Clean separation of pure simulation/math from renderer/UI, deterministic seeded RNG, automated unit tests (`node:test` / `pytest`), runtime telemetry & invariant assertions.

#### Deterministic `scripts/` & Reusable `assets/`
- `scripts/audit-pbr-scene.ts` — Validates material parameters, scale consistency, shadow/light budgets, and tone mapping settings.
- `scripts/check-hot-loop.ts` — Static analyzer flagging per-frame allocations (`new THREE.Vector3`, array spreads, React `setState`) inside `requestAnimationFrame` / `tick` loops.
- `scripts/validate-skill-package.ts` — Cross-frontier package linter checking YAML frontmatter, token budgets, broken links, and vendor-neutral phrasing.
- `assets/shaders/` — Production-tested GLSL/WGSL chunks (noise, triplanar, atmospheric scattering, water, foliage wind sway).
- `assets/ecs/` — Minimal, zero-dependency TypeScript fixed-timestep + ECS starter scaffolding.

---

## 4. How `/crazy` Orchestrates All Three Disciplines

When the user invokes **`/crazy <prompt>`** (e.g., *"/crazy build a playable photorealistic rain-soaked cyberpunk alley detective scene with drivable hovercar and NPC crowds"*), the unified orchestrator enforces a strict 5-stage AAA studio pipeline:

```text
[User Prompt via /crazy]
         │
         ▼
Stage 1: Creative & Systems Blueprint (/crazymaker)
         ├─ Core gameplay loop, camera/control feel, world rules, HUD, audio cues
         └─ Defines vertical slice scope & player success/fail states
         │
         ▼
Stage 2: Look-Dev, 3D World, VFX & Audio Spec (/crazydesigner)
         ├─ Real-world scale, ACES lighting rig, PBR material palette, volumetric VFX
         └─ Spatial audio layers & interactive/destructible scene elements
         │
         ▼
Stage 3: Engine & Zero-GC Implementation (/crazycoder)
         ├─ Fixed-timestep simulation + decoupled pure logic + ECS/instanced rendering
         └─ Custom shaders, asset disposal, input handling, and strict TypeScript
         │
         ▼
Stage 4: Studio QA & Profiling Gate (/crazycoder + /crazymaker + /crazydesigner)
         ├─ Unit tests pass, zero console/WebGL errors, draw-call & FPS targets met
         └─ Visual inspection of lighting, materials, camera framing, controls, & audio
         │
         ▼
Stage 5: Playable AAA Deliverable
```

---

## 5. Key Design Decisions & Trade-Offs

- **Four Linked Skills Under One Package vs. One Giant `SKILL.md`**
  - *Decision*: Ship `All For One` as a coordinated multi-skill package exposing `/crazydesigner`, `/crazymaker`, `/crazycoder`, and `/crazy` with shared `references/`, `scripts/`, and `assets/`.
  - *Why*: Users can summon a single specialist (`/crazydesigner` for a pure Hollywood VFX/3D scene, `/crazycoder` to optimize an engine) without paying the token cost of unrelated instructions, while `/crazy` chains all three for full AAA game production.
- **Tool-Neutral Canonical Prompts with Platform Adapters**
  - *Decision*: Author instructions using capability verbs (*inspect file*, *run validation script*) and let the build/sync step map platform metadata for Claude, Antigravity, and ChatGPT.
  - *Why*: Eliminates cross-model tool hallucinations while preserving native ergonomics on each platform.
- **Playable & Verifiable Over Static Mockups**
  - *Decision*: Embed automated hot-loop linters, unit-test requirements for pure game math, and visual/gameplay QA gates directly into `/crazycoder` and `/crazy`.
  - *Why*: Ensures "Hollywood-grade" output isn't just pretty screenshots—it actually runs smoothly, responds crisply to input, and has zero memory leaks.

---

## 6. Phased Implementation Roadmap

### Phase 1 — Package Foundation & Core Doctrine
- [ ] Create canonical `all-for-one/` directory layout (`manifest.yaml`, `skills/`, `references/`, `scripts/`, `assets/`, `evals/`).
- [ ] Author the 4 core `SKILL.md` files (`/crazydesigner`, `/crazymaker`, `/crazycoder`, `/crazy`) with razor-sharp Tier-1 trigger descriptions and Tier-2 execution laws.
- [ ] Write the Tier-3 `references/` vault covering PBR/ACES look-dev, shaders/VFX, spatial audio, AAA game feel, AI NPCs, and zero-GC ECS architecture.

### Phase 2 — Reusable Shaders, Starters & Deterministic Scripts
- [ ] Build `assets/shaders/` (atmospheric scattering, PBR water, procedural terrain/foliage wind, post-FX) and `assets/ecs/` (fixed-timestep loop + pool utilities).
- [ ] Implement `scripts/validate-skill-package.ts`, `scripts/check-hot-loop.ts`, and `scripts/audit-pbr-scene.ts`.

### Phase 3 — Cross-Frontier Sync CLI (`all-for-one` / `afo`)
- [ ] Implement `afo validate` (frontmatter, token caps, broken links, vendor-neutrality check).
- [ ] Implement `afo build` and `afo sync` for:
  - **Claude**: `.claude/skills/` + Claude Desktop `.zip` bundles.
  - **Antigravity**: `.agent/skills/` + `.agent/workflows/` slash commands.
  - **ChatGPT / Codex**: `.agents/skills/` + `~/.codex/skills/` + Custom GPT export.

### Phase 4 — Cross-Model AAA Benchmark & Evals
- [ ] Build `evals/triggers.json` verifying accurate routing across `/crazydesigner`, `/crazymaker`, `/crazycoder`, and `/crazy`.
- [ ] Create 3 flagship benchmark prompts (e.g., *Photorealistic Cinematic 3D Scene*, *AAA Third-Person Action/Vehicle Vertical Slice*, *Custom WebGPU/GLSL Engine Optimization*) and verify parity across **Claude**, **Antigravity**, and **ChatGPT**.
