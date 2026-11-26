# All For One — Ultimate AAA Game Development One Skill Package

> **40 years of Hollywood 3D, VFX & Spatial Audio** + **40 years of Rockstar-tier AAA Game Design** + **50 years of Principal Engine & Systems Coding** — unified into one portable skill package for **Claude**, **Google Antigravity**, and **ChatGPT / OpenAI Codex**.

---

## Slash Commands Included

| Command | Discipline | What It Delivers |
| :--- | :--- | :--- |
| **`/crazydesigner`** | **40 Years — Hollywood 3D, VFX, Look-Dev & Spatial Audio** | Super-hyperrealistic photorealistic 3D scenes, `1 unit = 1m` real-world scale, ACES Filmic tone mapping, measured PBR materials, custom GLSL/WGSL shaders (water, volumetric height fog, curl smoke, wind sway), cinematic cameras, and HRTF 3D spatial audio. |
| **`/crazymaker`** | **40 Years — Rockstar-Tier AAA Game Director** | First-frame playable worlds, hitstop, trauma-squared camera shake, input buffering, coyote time, NPC perception & combat AI, open-world systems, vehicle drift physics, and diegetic HUDs. |
| **`/crazycoder`** | **50 Years — Principal Engine & Systems Architect** | Zero-GC hot loops, fixed-timestep physics (`1/60s`), `ObjectPool` & scratch buffers, `InstancedMesh` draw-call budgeting, GPU `.dispose()` cleanup, and deterministic `node:test` verification. |
| **`/crazy`** | **All For One — Unified AAA Studio Pipeline** | Combines `/crazymaker` → `/crazydesigner` → `/crazycoder` → QA Gate to build complete, playable, hyperrealistic AAA 3D games end-to-end. |

---

## Quick Install (After Pushing to GitHub)

### Option 1: Universal Open Agent Skills CLI (`npx skills`)
Works automatically across Claude Code, Antigravity, Codex, Cursor, and Copilot:
```bash
npx skills add <YOUR_GITHUB_USERNAME>/all-for-one
```

### Option 2: Zero-Dependency Global Installer (Recommended)
Clone once and install all 4 slash commands globally for **Claude**, **Antigravity**, and **ChatGPT/Codex**:

**macOS / Linux:**
```bash
git clone https://github.com/<YOUR_GITHUB_USERNAME>/all-for-one.git
cd all-for-one
chmod +x install.sh && ./install.sh --global
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/<YOUR_GITHUB_USERNAME>/all-for-one.git
cd all-for-one
.\install.ps1
```

**Target a single platform or workspace scope:**
```bash
node scripts/install.mjs --target=claude --global
node scripts/install.mjs --target=antigravity --global
node scripts/install.mjs --target=chatgpt --global
node scripts/install.mjs --workspace   # Installs into current project only
```

### Option 3: Uploadable Desktop / Web Bundles (Claude Desktop & ChatGPT Custom GPT)
Generate ready-to-upload `.zip` bundles locally:
```bash
npm run afo:build
```
- **Claude Desktop / claude.ai:** Upload `dist/claude/all-for-one-claude.zip` (or individual `dist/claude/crazy.zip`, `crazydesigner.zip`, `crazymaker.zip`, `crazycoder.zip`).
- **ChatGPT Custom GPT:** Paste `dist/chatgpt/custom-gpt/instructions.md` into GPT Instructions and upload `dist/chatgpt/custom-gpt/all-for-one-knowledge.zip` to Knowledge.

### Option 4: Tell Any Frontier Model to Install It Directly
Paste this prompt into **Claude Code**, **Antigravity**, or **ChatGPT / Codex**:
> Clone `https://github.com/<YOUR_GITHUB_USERNAME>/all-for-one.git` into a temporary folder and run `node scripts/install.mjs --global` (or `--workspace` for this project) to install `/crazy`, `/crazydesigner`, `/crazymaker`, and `/crazycoder`.

---

## Where Skills Are Installed

| Platform | Workspace Paths (Included in Repo) | Global Paths (`--global`) |
| :--- | :--- | :--- |
| **Claude** | `.claude/skills/{crazy,crazydesigner,crazymaker,crazycoder}/` | `~/.claude/skills/` |
| **Antigravity** | `.agent/skills/all-for-one/` + `.agent/workflows/*.md` | `~/.gemini/antigravity/skills/all-for-one/` + `global_workflows/` |
| **ChatGPT / Codex** | `.agents/skills/{crazy,crazydesigner,crazymaker,crazycoder}/` | `~/.codex/skills/` |

---

## Package Structure

- `manifest.yaml` — Canonical cross-frontier package definition.
- `skills/` — Tier-1 & Tier-2 `SKILL.md` definitions (`crazy`, `crazydesigner`, `crazymaker`, `crazycoder`).
- `references/` — Tier-3 deep craft vault (ACES lighting, PBR calibration, GLSL VFX, spatial audio, AAA game feel, NPC AI, vehicle/character physics, zero-GC ECS, GPU budgets).
- `assets/shaders/` — Production GLSL chunks (`common-noise.glsl`, `pbr-water.glsl`, `atmosphere-fog.glsl`, `foliage-wind.glsl`).
- `assets/ecs/` — Zero-GC fixed-timestep loop, `ObjectPool`, and deterministic math/PRNG utilities.
- `scripts/` — CLI (`afo.ts`), zero-dependency installer (`install.mjs`), skill validator (`validate-skill-package.ts`), hot-loop static analyzer (`check-hot-loop.ts`), PBR scene auditor (`audit-pbr-scene.ts`), and unit tests (`afo.test.ts`).
- `evals/` — Trigger routing tests (`triggers.json`) and cross-frontier AAA benchmarks (`benchmarks.md`).

---

## Validate, Build & Test

```bash
npm run afo:validate      # Lint frontmatter, token budgets, and reference links
npm run afo:build         # Build Claude .zip + Antigravity + ChatGPT Custom GPT bundles
npm run afo:sync          # Sync workspace .claude/, .agent/, and .agents/ folders
npm run afo:test          # Run unit tests (validation, hot-loop scanner, PBR audit, triggers, ECS)
```
