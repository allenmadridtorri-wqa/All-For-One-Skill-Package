# CRAZY QA — Independent Verification & Reporting Standards

Reference manual for `/crazyqa` — strict evidence-based verification across code, builds, runtime, performance, and visual output.

## 1. The 12-Point QA Verification Matrix

1. **Static Analysis:** TypeScript `tsc --noEmit`, ESLint / `cargo clippy` / compiler `-Wall -Wextra`, hot-loop allocation check (`scripts/check-hot-loop.ts`), cross-engine API isolation (`core/engine-profiles.ts`).
2. **Dependency Validation:** Lockfile integrity, zero broken relative paths (`scripts/validate-skill-package.ts`), zero circular task dependencies (`CollaborationCoordinator.assertAcyclicGraph()`).
3. **Unit Testing:** Pure simulation, physics, math, economy, and state-machine tests (`node:test`, Catch2, `cargo test`, Unity EditMode, GUT).
4. **Integration Testing:** Cross-module handoffs (e.g., installer backup/rollback, ledger updates, multi-system gameplay flows).
5. **End-to-End Testing:** Full user flows (`Start -> Gameplay -> Restart -> Save/Load`).
6. **Build Verification:** Clean release/production build (`vite build`, `cargo build --release`, UBT/Unity/Godot headless export).
7. **Runtime Testing:** Executed application startup, input responsiveness, zero uncaught exceptions.
8. **Crash Detection:** Error boundaries, invalid-input fuzzing, tab-switch `dt` spike tests, null/disconnect resilience.
9. **Memory Profiling & Leak Detection:** `ResourceLifecycleTracker.detectLeaks()`, GPU `.dispose()` verification, ASan/heap snapshot checks.
10. **Performance Benchmarking:** `runMicroBenchmark()` + frame-time profiling recorded in `PERFORMANCE_LEDGER.md`.
11. **Regression Testing:** Re-run full suite after every fix; update `ITERATION_HISTORY.md` with any regressions caught.
12. **Screenshot & Visual Verification:** `verifyVisualEvidenceFile()` verifying non-empty captures on disk matched against `VISUAL_REFERENCE.md`.

## 2. Anti-Fabrication Status Taxonomy

Never collapse unexecuted checks into "pass". Every report row in `VERIFICATION_REPORT.md` MUST use:
- `VERIFIED` — Executed with logged output/exit code/artifact evidence.
- `PARTIALLY_VERIFIED` — Some sub-checks passed; remaining gaps documented.
- `UNVERIFIED` — Not executed (missing external binary, display, or API key).
- `FAILED` — Executed and failed.
