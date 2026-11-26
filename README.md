# All-For-One V3 — AI Game Development & Software Engineering Framework

**All-For-One V3** is a portable, security-hardened multi-specialist engineering framework for **Claude**, **Google Antigravity**, and **ChatGPT / OpenAI Codex**. It preserves all V2 game-development orchestration, task contracts, and engine isolation while adding engineering intelligence across 8 stacks (6 game engines + full-stack web + general software), optional headless **Blender Python (`bpy`)** 3D automation, validated UE5/Unity/Godot/Three.js asset export pipelines, structured visual iteration, corruption-protected/secret-scrubbed memory, optional model adapters, and SHA-256 install verification.

---

## Specialist Disciplines & Commands

| Command | Specialist Role | Core Responsibilities |
| :--- | :--- | :--- |
| **`/crazy`** | **Main Orchestrator** | Intelligently decomposes goals into sequential DAG `TaskContract` workflows, routes specialists, manages inter-agent messaging & conflict resolution (`core/collaboration.ts`), enforces retry/hardware budgets, persists `.afo-memory/`, and coordinates extension hooks (`audio_engineering`, `multiplayer_networking`, `world_generation`, `technical_art`, `animation`, `build_engineering`, `narrative_design`). |
| **`/crazymaker`** | **Game Director & Technical Producer** | Designs genre-specific gameplay systems (open-world, sandbox, MMORPG, RPG, survival, simulation/life, strategy, multiplayer), procedural world rules, NPC behavior/utility AI, dynamic economies, quests, combat feel, balancing criteria, and pre-code acceptance tests. |
| **`/crazydesigner`** | **Visual, 3D & Blender Production Director** | Directs art direction, reference analysis, optional headless Blender `bpy` automation (Geometry Nodes, Principled BSDF, Cycles/EEVEE hardware-bounded rendering, Rigify armatures, rigid-body physics), engine-calibrated FBX/glTF/GLB export, open-source mocap (`FreeMoCap`, `ToyXYZ`, `Mesh2Motion`), spatial audio, and the `Create -> Render -> Inspect -> Diagnose -> Improve -> Re-render` visual loop. |
| **`/crazycoder`** | **Engineering Director** | Implements clean, modular, engine-idiomatic code across 6 game engines plus `web-fullstack` and `general-software`, analyzes dependencies (`package.json`, `Cargo.toml`, `CMakeLists.txt`, `.csproj`, `project.godot`, `.uproject`), diagnoses build errors, checks API/version deprecations, enforces fixed-timestep zero-GC hot paths, and writes companion tests. |
| **`/crazyqa`** | **Independent QA & Security Director** | Executes independent unit/integration/regression tests, static checks (`tsc`, hot-loop, PBR), GLB/FBX asset audits, secret scanning (`scanForSecrets`), security verification, Blender runtime checks, and screenshot validation under strict status reporting (`VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `FAILED`). |

---

## Supported Engineering Stacks & Game Engines

V3 maintains strict per-engine API isolation (`core/engine-profiles.ts`) while extending architecture, dependency, error-diagnosis, and code-review intelligence (`core/engineering-intelligence.ts`) to general and web software:

| Stack / Engine ID | Scope | Asset Format (if 3D) | Key References |
| :--- | :--- | :--- | :--- |
| `unreal5` | Unreal Engine 5 / C++20 & Blueprints | FBX (Z-up, `-Y` fwd, smoothing `FACE`) | `references/engines/unreal5.md` |
| `unity` | Unity / C# / URP / HDRP | FBX (Y-up, `-Z` fwd, `<= 4` bone weights) | `references/engines/unity.md` |
| `godot` | Godot 4 / GDScript / GDExtension C++ | GLB (Y-up, `-Z` fwd, packed PBR) | `references/engines/godot.md` |
| `threejs` | Three.js / TypeScript / GLSL / WGSL | GLB (Y-up, 1u=1m, `<= 4` mat slots) | `references/engines/threejs.md` |
| `cpp-native` | Native C++20/23 / ECS / CMake | GLB (indexed triangle buffers) | `references/engines/cpp-native.md` |
| `rust` | Rust / Bevy / wgpu / Cargo | GLB (native Bevy PBR + NamedAnimations) | `references/engines/rust.md` |
| `web-fullstack` | TypeScript, React, Express, Vite, REST/DTOs | — | `core/engineering-intelligence.ts` |
| `general-software` | CLIs, Python, Node/TS, Systems & Automation | — | `core/engineering-intelligence.ts` |

---

## V3 Architecture Highlights

1. **Security & Atomicity Layer (`core/security.ts`)**:
   - **Symlink-Aware Path Confinement (`assertSafeSubpathSync`)**: Blocks `..`, null bytes, filesystem-root ops, and symlink escapes across ancestor and target path segments.
   - **Atomic Writes & Advisory Locks**: Temp-sibling + rename writes (`atomicWriteFileSync`) and exclusive `wx` lockfiles (`withAdvisoryLock`) with stale-lock recovery prevent partial-write corruption and concurrent installer/ledger races.
   - **Secret Redaction & Scanning**: Detects and redacts API keys, Bearer tokens, PEM keys, and database credential URIs before persisting memory ledgers (`redactSecrets`) and scans source files (`scanForSecrets`).
   - **Destructive Action Guards**: Requires explicit `--yes` / `destructiveApproval` before `--force` overwrites.
2. **Inter-Agent Collaboration & Goal Decomposition (`core/collaboration.ts`)**:
   - Extends `TaskContract` workflows with `AgentMessage` handoffs, review feedback, failure escalations, conflict raising/resolution (`raiseConflict` / `resolveConflict`), artifact registries, and `decomposeGoalIntoTasks`.
   - Executes sequentially unless an external host genuinely supports concurrent workers, without fabricating parallel activity.
3. **Engineering Intelligence (`core/engineering-intelligence.ts`)**:
   - Multi-manifest dependency inspection, deprecated/incompatible API detection (e.g., Unity `UnityEngine.WWW`, Godot 3 `KinematicBody`, cross-engine `THREE.*` leaks), error-log diagnosis, and automated code review checks.
4. **Headless Blender Automation, Asset Pipelines & Visual Iteration**:
   - **Blender Bridge (`core/blender-bridge.ts`, `assets/blender/export_engine_asset.py`)**: Probes `blender --version` without assuming installation; generates hardware-clamped `bpy` scripts (metric 1u=1m, Geometry Nodes, Principled BSDF, 3-point lighting, optional Rigify/armature + rigid-body physics, Cycles/EEVEE, FBX/GLB export); marks execution `UNVERIFIED` if Blender is absent.
   - **Asset Validation (`core/asset-pipeline.ts`)**: Parses GLB binary headers/JSON chunks to verify meshes, `POSITION`/`NORMAL`/`TEXCOORD_0` UVs, materials, skins, animations, and unit scale; checks Kaydara/ASCII FBX headers.
   - **Visual Iteration (`core/visual-iteration.ts`)**: Enforces `CREATE -> RENDER -> INSPECT -> DIAGNOSE -> IMPROVE -> RE_RENDER`, validates PNG/JPEG/WEBP magic bytes, rejects file-existence-only claims as `PARTIALLY_VERIFIED`, and preserves the highest-scoring verified render.
5. **Corruption-Protected Memory & Provenance-Aware Retrieval (`core/production-memory.ts`, `core/knowledge-retrieval.ts`)**:
   - `.afo-memory-state.json` stores SHA-256 checksums (`verifyIntegrity()`), tracks recurring failures and known-good artifacts, and automatically scrubs secrets.
   - Knowledge retrieval across **25 indexed documents** adds `official-spec` / `engine-profile` priority weighting, title/ID deduplication, outdated-version checks, provenance tags, and query caching.
6. **Optional Model Adapters (`core/model-adapter.ts`)**:
   - Defaults to `OfflineDeterministicAdapter` (zero API cost, no paid keys or local GPU required); supports optional `local-http` or environment-configured providers with graceful offline fallback.

---

## Safe Cross-Platform Installation

All installers (`install.sh`, `install.ps1`, `scripts/install.mjs`) use `core/installer-engine.mjs`:

### macOS / Linux
```bash
git clone https://github.com/allenmadridtorri-wqa/All-For-One-Skill-Package.git
cd All-For-One-Skill-Package
chmod +x install.sh
./install.sh --check-tools        # Check Node.js, Git, and optional Blender availability
./install.sh --dry-run            # Preview global install with zero writes
./install.sh --global             # Install globally across Claude, Antigravity, ChatGPT/Codex
./install.sh --verify             # Verify SHA-256 integrity of installed files
```

### Windows (PowerShell)
```powershell
.\install.ps1 -CheckTools         # Check Node.js, Git, and optional Blender availability
.\install.ps1 -DryRun             # Preview global install
.\install.ps1                     # Install globally
.\install.ps1 -Workspace          # Install into current workspace only
.\install.ps1 -Verify             # Verify SHA-256 integrity
.\install.ps1 -Uninstall          # Safe uninstall preserving custom files
```

### Direct Node CLI (`scripts/install.mjs`)
```bash
node scripts/install.mjs --check-tools
node scripts/install.mjs --target=claude --global
node scripts/install.mjs --target=antigravity --workspace
node scripts/install.mjs --target=chatgpt --workspace --force --yes   # --yes required for --force
node scripts/install.mjs --verify --workspace
node scripts/install.mjs --uninstall --global
```

### Frontier Target Locations

| Target | Workspace Paths | Global Paths (`--global`) |
| :--- | :--- | :--- |
| **Claude** | `.claude/skills/{crazy,crazymaker,crazydesigner,crazycoder,crazyqa}/` | `~/.claude/skills/` |
| **Antigravity** | `.agent/skills/all-for-one/` + `.agent/workflows/*.md` | `~/.gemini/antigravity/skills/all-for-one/` + `~/.gemini/antigravity/global_workflows/` |
| **ChatGPT / Codex** | `.agents/skills/{crazy,crazymaker,crazydesigner,crazycoder,crazyqa}/` | `~/.codex/skills/` |

---

## CLI Commands, Verification & Packaging

Requires **Node.js >= 18** (`blender` is optional).

```bash
npm run lint              # TypeScript typecheck (tsc --noEmit)
npm run afo:validate      # Validate 5 skills, frontmatter, links, and 25-doc knowledge index
npm run afo:test          # Run 34 unit/integration tests (afo, v2-framework, v3-framework)
npm run afo:eval          # Run 159-case V2+V3 evaluation suite across 13 V3 benchmark domains
npm run afo:eval:legacy   # Run 8-case backward-compatible trigger test
npm run afo:check-tools   # Report Node.js, Git, and optional Blender availability
npm run afo:verify-install # Verify SHA-256 checksums of workspace target installs
npm run afo:retrieve -- --query="blender gltf export" --engine=godot --budget=3500
npm run afo:sync          # Safely sync workspace .claude/, .agent/, and .agents/
npm run afo:build         # Build Claude ZIPs, Antigravity bundle, and ChatGPT Custom GPT bundle
npm run afo:package-zip   # Create clean release/All-For-One-Skill-Package-V3.zip
npm run afo:qa            # Generate VERIFICATION_REPORT.md with security & Blender probes
```

---

## Documentation Index

- **Blender & 3D Asset Pipelines:** `docs/BLENDER_AND_ASSET_PIPELINES.md`
- **Security Audit & Mitigations:** `SECURITY_AUDIT.md`
- **V2 to V3 Migration Guide:** `MIGRATION_V2_TO_V3.md`
- **Verification Status Report:** `VERIFICATION_REPORT.md`
- **Cross-Frontier Flagship Benchmarks:** `evals/benchmarks.md`
- **Changelog:** `CHANGELOG.md`

---

## Limitations & Honesty Guarantees

- **Optional External Binaries:** Blender (`blender`), Unreal (`UnrealBuildTool`), Unity CLI, Godot CLI, CMake/C++, and Rust/Cargo are external toolchains. If any binary is unavailable on the host machine, checks depending on it explicitly report `UNVERIFIED` rather than fabricating pass results.
- **Offline Evaluation Scope:** `afo:eval` (`159` cases across V2 + 13 V3 benchmark domains) verifies deterministic routing, policy enforcement, conflict rejection, security checks, and retrieval offline (`evaluationMode: deterministic-static-and-policy`), explicitly marking `liveModelEvaluationStatus: UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER` when no live LLM API runner is attached.
- **Visual Inspection Boundary:** Automated file/magic-byte and metadata validation (`inspectVisualRender`, `validateExportedAsset`) cannot replace subjective aesthetic review of rendered pixels without explicit visual acceptance criteria or a multimodal vision pass.

---

## Troubleshooting

- **`--force` rejected on CLI:** V3 requires `--yes` alongside `--force` to prevent accidental unapproved overwrites (`node scripts/install.mjs --workspace --force --yes`). Prior owned files are always backed up under `.afo-backups/<timestamp>/`.
- **`Integrity check failed` (`--verify`):** Indicates local edits or missing files in `.claude/`, `.agent/`, or `.agents/`. Run `npx tsx scripts/afo.ts sync --force` to re-align with canonical files, or inspect the diff in `.afo-backups/`.
- **`Blender unavailable` during 3D pipelines:** Install Blender 4.0+ and ensure `blender` is in your system `PATH`, then re-run `npm run afo:check-tools`. Offline `bpy` script generation and GLB/FBX inspection continue to work without Blender installed.
- **`Concurrency lock held` error:** Remove a stale `.afo-install.lock` or `.afo-memory/.afo-memory.lock` only after confirming no other All-For-One process is actively writing (locks older than 30s auto-recover).
