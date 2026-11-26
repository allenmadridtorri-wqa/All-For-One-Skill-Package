# Changelog

All notable changes to the **All-For-One Skill Package** are documented in this file.

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
