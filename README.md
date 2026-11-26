# All-For-One V3.2 — 130-Year Expertise Engineering & Creative Production Framework

**All-For-One V3.2** is a portable, security-hardened, **Single-AI-First (`ECONOMY` default)** engineering and creative production framework with **>= 85% token budget reduction** across **Google Antigravity**, **Claude**, **ChatGPT / Custom GPT / OpenAI Codex**, **Cursor**, **Windsurf**, **Cline**, **GitHub Copilot**, **Gemini CLI**, and **OpenCode**.

Built around the **130-Year Aspirational Expertise Architecture**:
- **`/crazymaker`** — 40-year AAA Game Direction, gameplay systems, economies, NPC AI, and production discipline
- **`/crazydesigner`** — 40-year Hollywood 3D, VFX, photorealistic materials/lighting/camera look-dev, cinematics, open CC0 asset curation, and T4 generative routing
- **`/crazycoder`** — 50-year Principal Software, graphics, game-engine (`unreal5`, `unity`, `godot`, `threejs`, `cpp-native`, `rust`), ECS, zero-GC hot-loop, and security engineering
- **`/crazyqa`** — Independent Verification & Security Director validating builds, >= 85% token budgets, binary GLB/glTF/FBX geometry, PNG/render headers, and strict anti-fabrication gates (`VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `FAILED`)
- **`/crazy`** — Unified Single-AI-First orchestrator keeping usage-capped plans safe in **`ECONOMY`** mode by default

---

## Key V3.2 Capabilities

1. **>= 85% Cross-Target Token Budgeting (`core/token-budget.ts`, `references/token-budget-architecture.md`)**
   - Enforces compact startup routers (`<= 460–600` tokens), Custom GPT adapters under `4,000` chars (replacing raw full-skill concatenation), lazy single-skill loading, and section-level markdown extraction (`retrieve --compact`) across all **10 targets** (`antigravity`, `claude`, `chatgpt`, `custom-gpt`, `cursor`, `windsurf`, `cline`, `copilot`, `gemini-cli`, `opencode`).
2. **Verified Open-Weight Model Registry, Zero-Paid-API Router & Live HF Space Inspector (`core/model-registry.ts`, `core/model-routing.ts`, `core/hosted-providers.ts`)**
   - Separates `codeLicense` from `weightLicense`, flags regional license restrictions (`Hunyuan3D-2` EU/UK/South Korea exclusion) and commercial revenue caps (`Stable Fast 3D` < $1M), blocks 24 GB+ models (`TRELLIS.2`) from T4 queues, and safely inspects live Hugging Face Gradio Space API schemas with HTTP 429 Colab T4 fallback.
   - Multi-stage task recipes (`product-vehicle`, `architecture-interior`, `natural-landscape`, `character-creature`, `playable-3d-scene`) distinguish `Concept Image` -> `AI Raw Mesh` -> `Refined PBR Asset` -> `Completed Scene` -> `Playable Environment`.
3. **Strict NVIDIA T4 (16 GB VRAM) + Dynamic Standard RAM Colab Workflow & T4 Model Runners (`core/cloud-rendering.ts`, `assets/colab/colab_blender_worker.py`)**
   - Targets **NVIDIA T4 (16 GB VRAM / `15,360` MB safe usable)** and detects host system RAM dynamically without assuming `L4`, `A100`, `H100`, or High-RAM Colab.
   - Automated per-model T4 inference runners (`triposr`, `stable-fast-3d`, `sdxl-base-1.0`, `real-esrgan`, `depth-anything-v2-small`) with OOM retry fallbacks, binary GLB/PNG verification, and SHA-256 `output_checksums.json` under **`MyDrive/ALL_FOR_ONE/jobs/<job_id>/`** with `PREVIEW`, `LOOK_DEVELOPMENT`, and `FINAL_T4_RENDER` profiles.
4. **Antigravity Local MCP-Compatible Bridge (`scripts/mcp-bridge.ts`, `core/mcp-bridge.ts`)**
   - Local stdio JSON-RPC 2.0 server exposing **12 tools**: `get_compute_profile`, `list_compatible_models`, `inspect_model_requirements`, `prepare_colab_job`, `validate_job_manifest`, `get_job_status`, `inspect_job_outputs`, `import_colab_results`, `validate_generated_asset`, `inspect_render_artifacts`, `get_token_budget_report`, and `inspect_hosted_space`.
5. **Structural 3D Asset Validation & Free CC0 Asset Ecosystem (`core/asset-validation.ts`, `references/open-asset-ecosystem.md`)**
   - Inspects `.glb` / `.gltf` binary headers, `POSITION` / `NORMAL` / `TEXCOORD_0` attributes, `pbrMetallicRoughness` materials, external texture paths, node scale issues, `.fbx` headers, and `.png` IHDR dimensions alongside CC0 sourcing rules (`Poly Haven`, `ambientCG`, `Kenney`, `Quaternius`, audited `OpenGameArt`).

---

## Safe Cross-Platform Installation

### Windows (PowerShell)
```powershell
.\install.ps1 -CheckTools             # Check Node.js, Git, optional Blender, and FFmpeg
.\install.ps1 -DryRun                 # Preview global install with zero writes
.\install.ps1                         # Safe global install across all targets
.\install.ps1 -Workspace              # Workspace install (.claude/, .agent/, .agents/, IDE rules)
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

## CLI Commands, Verification & MCP Bridge

Requires **Node.js >= 18** (`blender`, `ffmpeg`, and Google Colab are optional external environments).

```bash
npm run lint                  # TypeScript typecheck (tsc --noEmit)
npm run afo:validate          # Validate 5 skills, frontmatter, links, and 33-doc knowledge index
npm run afo:test              # Run all unit & integration tests (afo, v2, v3, v3_1, v3_2)
npm run afo:token-budget      # Audit >= 85% token savings across all 10 targets
npm run afo:eval              # Run 159-case keyword-routing & static policy test (not a live quality score)
npm run afo:eval:legacy       # Run 8-case legacy keyword-routing trigger check (not a live quality score)
npm run afo:check-tools       # Detect Node.js, Git, optional Blender, and FFmpeg
npm run afo:models            # Inspect T4-compatible models, licenses & CC0 asset catalogs
npm run afo:mcp -- --list-tools
npx tsx scripts/afo.ts retrieve --query="vehicle lighting pbr" --budget=1800 --compact
npx tsx scripts/afo.ts inspect-space --space=stabilityai/TripoSR
npx tsx scripts/afo.ts route --domain=product-vehicle --engine=unreal5
npx tsx scripts/afo.ts colab-check --frames=240 --engine=CYCLES
npx tsx scripts/afo.ts prepare-colab-t4 --job=hero_prop --type=inference --model=triposr
npx tsx scripts/afo.ts validate-asset --file=exports/hero.glb
npm run afo:build             # Build Antigravity, Claude ZIPs, Custom GPT & compact target adapters into dist/
npm run afo:qa                # Generate VERIFICATION_REPORT.md
```

---

## Documentation Index

- **Single-AI-First Architecture:** `docs/SINGLE_AI_ARCHITECTURE.md`
- **Cinematic Production Engine:** `docs/CINEMATIC_PRODUCTION.md`
- **Cloud & Colab NVIDIA T4 Rendering:** `docs/CLOUD_RENDERING.md`
- **Blender & 3D Asset Pipelines:** `docs/BLENDER_AND_ASSET_PIPELINES.md`
- **Windows Compatibility & Fixes:** `docs/WINDOWS_COMPATIBILITY.md`
- **Security Audit & Hardening:** `SECURITY_AUDIT.md`
- **Migration Guide (V3.1 to V3.2):** `MIGRATION_V3_1_TO_V3_2.md`
- **Verification Report:** `VERIFICATION_REPORT.md`
- **Changelog:** `CHANGELOG.md`

---

## Honest Limitations & Verification Boundaries

- **Optional External Binaries:** `blender`, `ffmpeg`, Unreal Engine, Unity, Godot, CMake/C++, and Rust/Cargo are external toolchains. Checks requiring absent binaries strictly report **`UNVERIFIED`**.
- **Google Colab NVIDIA T4 Sessions:** Colab sessions are interactive, user-initiated, and ephemeral. Remote inference or Cycles rendering cannot act as a permanent server and remains **`UNVERIFIED_PREPARED_FOR_COLAB`** until outputs are returned via Drive and inspected locally.
- **Keyword-Routing Evaluation Scope:** `npm run afo:eval` and `npm run afo:eval:legacy` test offline keyword/regex routing and static policy rules (`liveModelEvaluationStatus: UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER`); they are **not** a live AI skill quality benchmark.
