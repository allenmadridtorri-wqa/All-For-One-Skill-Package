# All-For-One V2 — AI Game Development Engineering Framework

**All-For-One V2** is a portable, engine-aware multi-specialist skill framework for **Claude**, **Google Antigravity**, and **ChatGPT / OpenAI Codex**. It organizes game production across four specialist disciplines coordinated by `/crazy` with structured task contracts, persistent production memory, engine-isolated technical profiles, selective knowledge retrieval, and strict verification rules.

---

## Specialist Disciplines & Commands

| Command | Specialist Role | Core Responsibilities |
| :--- | :--- | :--- |
| **`/crazy`** | **Unified Multi-Specialist Orchestrator** | Coordinates sequential `TaskContract` workflows across all four specialists, enforces dependencies and DAG ordering, manages retry budgets, persists `.afo-memory/` ledger records, and supports extension hooks (`audio_engineering`, `multiplayer_networking`, `world_generation`, `technical_art`, `animation`, `build_engineering`, `narrative_design`). |
| **`/crazymaker`** | **Game Director** | Designs genre-specific gameplay systems (open-world, sandbox, MMORPG, RPG, survival, simulation/life, strategy, multiplayer), procedural world constraints, NPC behavior/AI, dynamic economies, quests, progression, emergent loops, balancing criteria, and acceptance tests before coding. |
| **`/crazydesigner`** | **Visual Director** | Directs engine-specific PBR calibration, lighting, shaders, VFX, procedural materials, character appearance, animation/open-source mocap (`FreeMoCap`, `ToyXYZ`, `Mesh2Motion`, `Blender Rigify`), cinematics, environmental storytelling, spatial audio, and variant/render safety checks. |
| **`/crazycoder`** | **Engineering Director** | Implements clean, engine-idiomatic modular architecture, fixed-timestep simulation (`1/60s`), zero-GC hot paths, object pooling, `ResourceLifecycleTracker` leak detection, networking/replication, serialization/save integrity, and performance benchmarks. |
| **`/crazyqa`** | **Quality Assurance Director** | Performs independent verification across unit tests, integration tests, static analysis, build checks, memory profiling, benchmarks, and screenshot inspection using strict status reporting (`VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `FAILED`). |

---

## Supported Game Engines

Engine profiles live in `core/engine-profiles.ts` and `references/engines/`. Implementation rules remain strictly isolated per target engine—Web/Three.js APIs are never mixed into Unreal, Unity, Godot, C++, or Rust codebases:

| Engine ID | Stack | Reference Profile |
| :--- | :--- | :--- |
| `unreal5` | Unreal Engine 5 / C++ | `references/engines/unreal5.md` |
| `unity` | Unity / C# | `references/engines/unity.md` |
| `godot` | Godot 4 / GDScript / C++ | `references/engines/godot.md` |
| `threejs` | Three.js / TypeScript | `references/engines/threejs.md` |
| `cpp-native` | Native C++ Engine / ECS | `references/engines/cpp-native.md` |
| `rust` | Rust / Bevy / wgpu | `references/engines/rust.md` |

---

## V2 Architecture Highlights

1. **Structured Collaboration (`core/collaboration.ts`)**:
   - Every task uses a `TaskContract` with a unique ID, assigned specialist, objective, inputs, outputs, dependencies (DAG cycle-checked), acceptance criteria, retry limits, review states, and mandatory `verificationEvidence` before review or approval.
   - Executes sequentially when an environment cannot run concurrent subagents, without fabricating parallel communication.
2. **Production Intelligence (`core/production-intelligence.ts`)**:
   - **Hardware Guardrails**: Inspects host CPU/RAM and clamps render resolution, thread counts, and texture budgets.
   - **Quality Contracts & Bounded Refinement**: Evaluates outputs against explicit thresholds and halts cleanly on `QUALITY_THRESHOLD_MET`, `NO_MEASURABLE_IMPROVEMENT`, `MAX_ITERATIONS_REACHED`, `TIME_BUDGET_EXHAUSTED`, or `REGRESSION_DETECTED`.
   - **Variant Testing & Render Safety**: Compares parameter variants against shared quality contracts, tracks input hashes to detect stale renders, saves interrupted checkpoints, and backs up overwritten outputs.
3. **Persistent Production Memory (`core/production-memory.ts`)**:
   - Maintains durable markdown records (`PROJECT_BRIEF.md`, `QUALITY_STANDARDS.md`, `PROJECT_DECISIONS.md`, `ITERATION_HISTORY.md`, `PERFORMANCE_LEDGER.md`, `VISUAL_REFERENCE.md`, `VERIFICATION_REPORT.md`) plus failed-approach deduplication.
4. **Selective Knowledge Retrieval (`core/knowledge-retrieval.ts`, `references/index.json`)**:
   - Retrieves only engine-compatible, specialist-relevant documents within a strict token budget (`--budget=4000`), avoiding full-library context bloat.
5. **Independent QA & Anti-Fabrication (`core/qa-verification.ts`)**:
   - Enforces four explicit statuses: `VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `FAILED`. Never claims unexecuted tests, unverified visual screenshots, or external engine builds passed.

---

## Safe Cross-Platform Installation

All installers (`install.sh`, `install.ps1`, and `scripts/install.mjs`) route through a single canonical engine (`core/installer-engine.mjs`) featuring:
- **Path-traversal & null-byte protection** and destination-root deletion guards.
- **Non-destructive merge**: Preserves unrelated custom files and user-modified owned files unless `--force` is passed.
- **Timestamped backups**: Saves modified files to `.afo-backups/<timestamp>/` before overwrite.
- **Atomic rollback**: Restores prior state if an installation step fails mid-flight.
- **Dry-run preview & safe uninstall**: `--dry-run` previews all changes; `--uninstall` removes only unmodified package-owned files tracked in `.afo-install-manifest.json`.

### macOS / Linux
```bash
git clone https://github.com/allenmadridtorri-wqa/All-For-One-Skill-Package.git
cd All-For-One-Skill-Package
chmod +x install.sh
./install.sh --dry-run            # Preview global install
./install.sh --global             # Install globally across Claude, Antigravity, ChatGPT/Codex
```

### Windows (PowerShell)
```powershell
git clone https://github.com/allenmadridtorri-wqa/All-For-One-Skill-Package.git
cd All-For-One-Skill-Package
.\install.ps1 -DryRun             # Preview global install
.\install.ps1                     # Install globally
.\install.ps1 -Workspace          # Install into current workspace only
.\install.ps1 -Uninstall          # Safe uninstall preserving custom files
```

### Direct Node CLI Flags (`scripts/install.mjs`)
```bash
node scripts/install.mjs --target=claude --global
node scripts/install.mjs --target=antigravity --workspace
node scripts/install.mjs --target=chatgpt --global --force
node scripts/install.mjs --uninstall --global
```

### Frontier Target Locations

| Target | Workspace Paths | Global Paths (`--global`) |
| :--- | :--- | :--- |
| **Claude** | `.claude/skills/{crazy,crazymaker,crazydesigner,crazycoder,crazyqa}/` | `~/.claude/skills/` |
| **Antigravity** | `.agent/skills/all-for-one/` + `.agent/workflows/*.md` | `~/.gemini/antigravity/skills/all-for-one/` + `~/.gemini/antigravity/global_workflows/` |
| **ChatGPT / Codex** | `.agents/skills/{crazy,crazymaker,crazydesigner,crazycoder,crazyqa}/` | `~/.codex/skills/` |

---

## CLI Commands, Validation & Packaging

Requires **Node.js >= 18**.

```bash
npm run lint              # TypeScript typecheck (tsc --noEmit)
npm run afo:validate      # Validate skills, frontmatter, links, and 23-doc knowledge index
npm run afo:test          # Run 24 unit/integration tests (afo.test.ts + v2-framework.test.ts)
npm run afo:eval          # Run 120-case V2 deterministic policy & routing evaluation suite
npm run afo:eval:legacy   # Run 8-case backward-compatible trigger test
npm run afo:retrieve -- --query="client prediction" --engine=unreal5 --budget=3500
npm run afo:sync          # Safely sync workspace .claude/, .agent/, and .agents/
npm run afo:build         # Build Claude ZIPs, Antigravity bundle, and ChatGPT Custom GPT bundle
npm run afo:package-zip   # Create clean release/all-for-one-v2-complete.zip (no node_modules)
```

---

## Limitations & Compatibility

- **Offline / No Paid API Lock-in**: Core validation, collaboration contracts, retrieval, installer, and deterministic evaluation run locally on Node.js without paid APIs.
- **External Engine Binaries**: Unreal Engine 5 (`UnrealBuildTool`), Unity CLI, Godot CLI, CMake/C++, and Rust/Cargo compilation checks are documented per engine profile; they only transition from `UNVERIFIED` to `VERIFIED` when executed in an environment where those toolchains are installed.
- **Live LLM Model Evaluation**: `afo:eval` verifies deterministic routing, conflict rejection, tool policies, and retrieval coverage (`evaluationMode: deterministic-static-and-policy`), explicitly reporting `liveModelEvaluationStatus: UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER` when no live model runner is attached.
- **Zero-Paid-API Media Tooling**: Animation/mocap workflows standardize on open-source pipelines (`FreeMoCap`, `ToyXYZ`, `ComfyUI-MotionCapture`, `Mesh2Motion`, `Blender Rigify`).

---

## Troubleshooting

- **Installer skips a modified file**: By design, `safeInstall` skips files you edited locally unless `--force` is passed. With `--force`, your prior version is saved under `.afo-backups/<timestamp>/` before updating.
- **Broken or missing references after adding docs**: Update `references/index.json` with accurate `engine`, `specialist`, `dependencies`, and `estimatedTokens`, then run `npm run afo:validate`.
- **Workspace targets out of date after editing `skills/` or `core/`**: Run `npx tsx scripts/afo.ts sync --force`.
