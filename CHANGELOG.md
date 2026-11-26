# Changelog

All notable changes to the **All-For-One Skill Package** are documented in this file.

## [3.0.0] — V3 Advanced Engineering Upgrade

### Added
- **Security Hardening Module (`core/security.ts`)**: Added symlink-aware `assertSafeSubpathSync`, temp-sibling `atomicWriteFileSync`, exclusive `wx` lockfiles (`withAdvisoryLock`), `redactSecrets` / `scanForSecrets` (API keys, Bearer tokens, PEM blocks, DB URIs), `assertDestructiveApproved`, and `isDangerousShellCommand`.
- **Engineering Intelligence (`core/engineering-intelligence.ts`)**: Extended architecture, multi-manifest dependency analysis (`package.json`, `Cargo.toml`, `CMakeLists.txt`, `.csproj`, `project.godot`, `.uproject`), deprecated/incompatible API checks, error-log diagnosis, and code review across 8 stacks (all 6 game engines + `web-fullstack` + `general-software`).
- **Headless Blender Automation Bridge (`core/blender-bridge.ts`, `assets/blender/export_engine_asset.py`, `references/blender-automation-pipeline.md`)**: Added safe `detectBlenderInstallation()`, sandboxed CLI execution (`--background --factory-startup --python-exit-code 1`), and hardware-bounded `bpy` script generation (metric scale, Geometry Nodes, Principled BSDF, 3-point lighting, optional Rigify/physics, Cycles/EEVEE, FBX/GLB export). Marks Blender steps `UNVERIFIED` when absent.
- **Game-Engine Asset Pipeline Validation (`core/asset-pipeline.ts`, `references/game-engine-asset-pipelines.md`)**: Added `ENGINE_ASSET_EXPORT_SPECS` and binary GLB/glTF/FBX validation (`validateExportedAsset` checking meshes, UVs, normals, materials, skins, animations, and non-unit scales).
- **Visual Iteration Controller (`core/visual-iteration.ts`)**: Enforces `Create -> Render -> Inspect -> Diagnose -> Improve -> Re-render`, validates PNG/JPEG/WEBP file signatures, rejects existence-only claims as `PARTIALLY_VERIFIED`, and preserves highest-scoring verified renders.
- **Model Adapter Abstraction (`core/model-adapter.ts`)**: Added zero-cost `OfflineDeterministicAdapter` default and optional `ConfigurableModelAdapter` (`local-http` / `env-configured`) with graceful offline fallback.
- **13-Domain V3 Evaluation Suite (`evals/suite-v3.json`, `scripts/v3-framework.test.ts`)**: Added 39 V3 benchmark cases (159 total cases with V2 baseline) and 10 V3 unit/integration test suites.
- **V3 Documentation**: Added `SECURITY_AUDIT.md`, `MIGRATION_V2_TO_V3.md`, and `docs/BLENDER_AND_ASSET_PIPELINES.md`; updated `README.md` and `VERIFICATION_REPORT.md`.

### Changed
- **Installer Integrity & Guards (`core/installer-engine.mjs`, `scripts/install.mjs`, `install.sh`, `install.ps1`)**: Added symlink escape blocking, atomic writes, `.afo-install.lock` locking, SHA-256 `verifyInstallIntegrity` (`--verify`), `detectExternalTools` (`--check-tools`), and explicit `--yes` approval gating for `--force`.
- **Inter-Agent Collaboration (`core/collaboration.ts`)**: Added `AgentMessage` exchange (`REVIEW_FEEDBACK`, `FAILURE_ESCALATION`, `HANDOFF`), `raiseConflict` / `resolveConflict`, `registerArtifact`, and `decomposeGoalIntoTasks`.
- **Corruption-Protected & Secret-Scrubbed Memory (`core/production-memory.ts`, `core/production-intelligence.ts`)**: Added automatic secret scrubbing, `.afo-memory-state.json` SHA-256 checksums (`verifyIntegrity()`), `recordSuccessPattern`, `preserveKnownGoodOutput`, `getRecurringProblems`, and hardware-clamped `runBoundedSchedule`.
- **Provenance-Aware Knowledge Retrieval (`core/knowledge-retrieval.ts`, `references/index.json`)**: Expanded catalog to 25 documents (`version: 3.0.0`), added `official-spec` / `engine-profile` weighting, deduplication, outdated-reference detection, and query caching.
- **All 5 Specialist Skills (`skills/*/SKILL.md`), `manifest.yaml`, `package.json`, `scripts/afo.ts`**: Upgraded to `3.0.0` and set default ZIP output to `release/All-For-One-Skill-Package-V3.zip`.

## [2.0.0] — V2 Engineering Upgrade

### Added
- **Fifth Core Specialist (`/crazyqa`)**: Added Quality Assurance Director (`skills/crazyqa/SKILL.md`) with strict anti-fabrication evidence taxonomy (`VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `FAILED`) and `core/qa-verification.ts`.
- **Structured Collaboration System (`core/collaboration.ts`)**: Added `TaskContract` objects, DAG dependency cycle detection, specialist handoff records, retry budgets, review/approval states, mandatory verification evidence checks, and `EXTENSION_HOOKS` (`audio_engineering`, `multiplayer_networking`, `world_generation`, `technical_art`, `animation`, `build_engineering`, `narrative_design`).
- **Six Engine Technical Profiles (`core/engine-profiles.ts`, `references/engines/*.md`)**: Added isolated technical profiles and cross-engine API mismatch validation for `unreal5`, `unity`, `godot`, `threejs`, `cpp-native`, and `rust`.
- **Production Intelligence (`core/production-intelligence.ts`)**: Added hardware profile detection & clamping, quality contracts, bounded continuous improvement loop (`ContinuousImprovementEngine`), variant comparison, input-hashed `RenderSafetyManager`, interrupted checkpoint tracking, and backup-before-overwrite protection.
- **Persistent Production Memory (`core/production-memory.ts`)**: Added `ProductionMemoryLedger` managing `PROJECT_BRIEF.md`, `QUALITY_STANDARDS.md`, `PROJECT_DECISIONS.md`, `ITERATION_HISTORY.md`, `PERFORMANCE_LEDGER.md`, `VISUAL_REFERENCE.md`, `VERIFICATION_REPORT.md`, and failed-approach tracking.
- **Selective Knowledge Retrieval (`core/knowledge-retrieval.ts`, `references/index.json`)**: Added engine-filtered, token-budgeted knowledge retrieval over 23 indexed documents.
- **Expanded Domain References**: Added `references/genre-profiles.md`, `references/visual-production-pipeline.md`, `references/animation-motion-pipeline.md`, `references/qa-verification-standards.md`, `references/networking-and-persistence.md`, and `assets/README.md`.
- **Resource Lifecycle & Benchmarking (`assets/ecs/resource-tracker.ts`)**: Added `ResourceLifecycleTracker` leak detection and `runMicroBenchmark`.
- **120-Case Evaluation Suite (`core/evaluator.ts`, `evals/suite-v2.json`)**: Added deterministic evaluation across 8 categories (specialist selection, multi-skill routing, ambiguous requests, conflicting instructions, tool-use decisions, instruction compliance, technical correctness, failure recovery).
- **Clean ZIP Packaging (`scripts/afo.ts package-zip`)**: Pure-Node PKZIP archive generation excluding `node_modules/`, `dist/`, `.git/`, and `.afo-backups/`.

### Changed
- **Canonical Safe Installer (`core/installer-engine.mjs`, `core/installer-engine.d.ts`)**: Unified `scripts/install.mjs`, `install.sh`, and `install.ps1` around one shared implementation supporting `--dry-run`, `--force`, `--uninstall`, path-traversal guards, non-destructive merging, timestamped `.afo-backups/`, manifest tracking, and atomic rollback on mid-install errors.
- **Upgraded Specialist Skills**: Updated `skills/crazy/SKILL.md`, `skills/crazymaker/SKILL.md`, `skills/crazydesigner/SKILL.md`, and `skills/crazycoder/SKILL.md` for V2 collaboration contracts, multi-engine awareness, and open-source media/mocap tooling.
- **Manifest & Package Configuration**: Upgraded `manifest.yaml` and `package.json` to version `2.0.0`.
- **Documentation & Benchmarks**: Rewrote `README.md` and updated `evals/benchmarks.md` to remove unverified marketing/years claims and document V2 architecture and limitations accurately.

## [1.0.0] — Initial Portable Skill Package
- Initial 4-skill structure (`crazy`, `crazymaker`, `crazydesigner`, `crazycoder`), core Three.js/WebGL references, GLSL shaders, fixed-timestep ECS helpers, static analyzers (`check-hot-loop.ts`, `audit-pbr-scene.ts`), legacy 8-case trigger evaluator, and target sync/build scripts.
