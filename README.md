# All-For-One V3.1 — Single-AI-First Engineering & Creative Production Framework

**All-For-One V3.1** is a portable, security-hardened **Single-AI-First** engineering and creative production framework for **Claude**, **Google Antigravity**, and **ChatGPT / OpenAI Codex**. It preserves full backward compatibility with V2 and V3 while introducing a low-usage `ECONOMY` Single-AI default, a dedicated Cinematic Production Engine (`2,160`-frame / 90s trailer splitting & resume), hardened Blender Python (`bpy`) procedural 3D automation, **Google Colab GPU** offloading for 4GB/iGPU laptops, and repaired Windows PowerShell compatibility.

---

## Single-AI-First Execution Modes (`core/single-ai.ts`)

All-For-One V3.1 is engineered to work at full depth using **one AI model** so developers on usage-capped plans never suffer runaway agent-swarm costs:

| Mode | Default? | Active AI Agents | Behavior |
| :--- | :--- | :--- | :--- |
| **`ECONOMY`** | **Yes (Default)** | 1 primary AI + local deterministic helpers | Sequential execution, compact `< ~1,200`-token memory summaries, deterministic local offloading (`0` AI calls for validation, hashes, frame splits, PNG checks, secret scans). |
| **`BALANCED`** | Opt-in | 1 primary AI switching specialist lenses internally | Enables explicit `/crazymaker` / `/crazydesigner` / `/crazycoder` lens switches plus a mandatory separate `/crazyqa` verification phase with zero extra agents. |
| **`ACCELERATION`** | **Blocked by Default** | Multiple parallel agents | Strictly gated behind `assertExecutionModeAllowed` requiring explicit user approval acknowledging `~3x–5x` higher AI request usage. |

---

## Specialist Disciplines & Slash Commands

| Command | Specialist Role | Core V3.1 Responsibilities |
| :--- | :--- | :--- |
| **`/crazy`** | **Single-AI-First Master Orchestrator** | Coordinates work in `ECONOMY` mode by default, routes specialist lenses, checks optional host tools, retrieves budgeted references, and enforces separate QA truth gating. |
| **`/crazymaker`** | **Game Director & Technical Producer** | Authors gameplay specifications, genre profiles, economies, NPC AI, balancing rules, screenplay beats, and pre-code acceptance criteria. |
| **`/crazydesigner`** | **Visual, Blender, Cinematic & Cloud GPU Director** | Directs art direction, hardened headless Blender `bpy` automation (procedural environments/vehicles/architecture, `Smart UV`, `LOD1/LOD2`, `IK/FK` + facial rigs, cloth/hair, tracked camera rigs, volumetrics, compositor glare), parameterized choreography, long-form shot chunking, Google Colab GPU packaging, engine export specs, spatial audio, and visual iteration. |
| **`/crazycoder`** | **Engineering Director** | Implements clean, modular code across 6 game engines (`unreal5`, `unity`, `godot`, `threejs`, `cpp-native`, `rust`) plus `web-fullstack` and `general-software`, maintains zero-GC hot loops, enforces security path/secret checks, and adds unit tests. |
| **`/crazyqa`** | **Independent QA & Security Director** | Runs independent static checks, unit/integration tests, PNG magic-byte verification, FFmpeg availability checks, and secret scanning (`scanForSecrets`) under strict anti-fabrication statuses (`VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `FAILED`). |

---

## Safe Cross-Platform Installation

### Windows (PowerShell)
```powershell
.\install.ps1 -CheckTools             # Check Node.js, Git, optional Blender, and FFmpeg
.\install.ps1 -DryRun                 # Preview global install with zero writes
.\install.ps1                         # Safe global install across all frontiers
.\install.ps1 -Workspace              # Workspace install (.claude/, .agent/, .agents/)
.\install.ps1 -Workspace -Force -Yes  # Backup modified files to .afo-backups/ and overwrite
.\install.ps1 -Verify -Workspace      # Verify SHA-256 integrity of installed files
.\install.ps1 -Uninstall              # Safe uninstall preserving user-modified files
.\install.ps1 -Uninstall -Force -Yes  # Back up modified files to .afo-backups/ and remove owned files
```

### macOS / Linux
```bash
git clone https://github.com/allenmadridtorri-wqa/All-For-One-Skill-Package.git
cd All-For-One-Skill-Package
chmod +x install.sh
./install.sh --check-tools
./install.sh --dry-run
./install.sh --global
./install.sh --verify
```

---

## CLI Commands, Verification & Packaging

Requires **Node.js >= 18** (`blender` and `ffmpeg` are optional external binaries).

```bash
npm run lint                  # TypeScript typecheck (tsc --noEmit)
npm run afo:validate          # Validate 5 skills, frontmatter, links, and 28-doc knowledge index
npm run afo:test              # Run all unit & integration tests (afo, v2, v3, v3_1)
npm run afo:eval              # Run 159-case keyword-routing & static policy test (not a live quality score)
npm run afo:eval:legacy       # Run 8-case legacy keyword-routing trigger check (not a live quality score)
npm run afo:check-tools       # Detect Node.js, Git, optional Blender (incl. Windows paths), and FFmpeg
npm run afo:verify-install    # Verify SHA-256 install integrity in workspace
npm run afo:retrieve -- --query="colab gpu render" --budget=3500
npx tsx scripts/afo.ts single-ai-check --mode=ECONOMY
npx tsx scripts/afo.ts colab-check --frames=2160 --engine=CYCLES
npx tsx scripts/afo.ts cinematic-plan --duration=90 --fps=24
npm run afo:build             # Build Claude ZIPs, Antigravity bundle, and ChatGPT Custom GPT bundle
npm run afo:qa                # Generate VERIFICATION_REPORT.md
```

---

## Documentation Index

- **Single-AI-First Architecture:** `docs/SINGLE_AI_ARCHITECTURE.md`
- **Cinematic Production Engine:** `docs/CINEMATIC_PRODUCTION.md`
- **Cloud & Google Colab GPU Rendering:** `docs/CLOUD_RENDERING.md`
- **Blender & 3D Asset Pipelines:** `docs/BLENDER_AND_ASSET_PIPELINES.md`
- **Windows Compatibility & Fixes:** `docs/WINDOWS_COMPATIBILITY.md`
- **Security Audit & Hardening:** `SECURITY_AUDIT.md`
- **Migration Guide (V3 to V3.1):** `MIGRATION_V3_TO_V3_1.md`
- **Verification Report:** `VERIFICATION_REPORT.md`
- **Changelog:** `CHANGELOG.md`

---

## Honest Limitations & Verification Boundaries

- **Optional External Binaries:** `blender`, `ffmpeg`, Unreal (`UnrealBuildTool`), Unity CLI, Godot CLI, CMake/C++, and Rust/Cargo are external toolchains. Whenever a binary is absent in the execution environment, checks relying on it strictly report **`UNVERIFIED`** rather than fabricating pass results.
- **Google Colab GPU Sessions:** Colab runtimes are ephemeral and require interactive Google Drive authentication. Remote renders remain **`UNVERIFIED_PREPARED_FOR_COLAB`** until downloaded PNG frames pass magic-byte verification locally (`reconcileRemoteRenderOutputs`).
- **Windows Execution Environment:** Windows PowerShell scripts and path probing were verified on Linux via unit tests and static checks; actual Windows OS execution remains **`UNVERIFIED`** until run on Windows.
- **Keyword-Routing Test Scope:** `npm run afo:eval` and `npm run afo:eval:legacy` verify offline keyword/regex routing, conflict rules, and reference retrieval (`liveModelEvaluationStatus: UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER`); they do **not** measure live LLM output or skill quality.
