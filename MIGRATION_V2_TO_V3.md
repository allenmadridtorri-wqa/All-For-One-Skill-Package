# Migration Guide: All-For-One V2 to V3

All-For-One V3 preserves full backward compatibility with V2 slash commands (`/crazy`, `/crazymaker`, `/crazydesigner`, `/crazycoder`, `/crazyqa`), `ENGINE_PROFILES`, `TaskContract` schemas, and the 120-case V2 evaluation baseline, while introducing security hardening, Blender/3D asset pipelines, general software engineering intelligence, and integrity verification.

---

## Key Behavioral & Breaking Changes

1. **Explicit Approval Required for `--force` CLI Overwrites**:
   - **V2:** `node scripts/install.mjs --force` overwrote modified owned files (after backup) without an extra confirmation flag.
   - **V3:** CLI invocations (`scripts/install.mjs`) enable `requireApprovalForForce: true` and require `--yes` alongside `--force` (e.g., `node scripts/install.mjs --workspace --force --yes`). Direct JS callers of `safeInstall` remain non-breaking unless they opt into `requireApprovalForForce: true`.
2. **Symlink Escapes Are Now Blocked**:
   - **V2:** `assertSafeSubpath` checked lexical `path.resolve` containment only.
   - **V3:** `assertSafeSubpath` and `assertSafeSubpathSync` inspect existing ancestor and target segments via `lstatSync` + `realpathSync` and throw if a symlink resolves outside the target base directory.
3. **Release ZIP Output Filename**:
   - **V2:** `npm run afo:package-zip` wrote `release/all-for-one-v2-complete.zip`.
   - **V3:** `npm run afo:package-zip` writes `release/All-For-One-Skill-Package-V3.zip` (override via `--out=<path>`).
4. **Manifest Version & Integrity Verification**:
   - `oneskill.lock.json` / `.afo-global-manifest.json` now record `"version": "3.0.0"` and SHA-256 hashes verified via `--verify`.
   - `ProductionMemoryLedger` now writes `.afo-memory-state.json` checksums and automatically redacts secret patterns on write.

---

## Step-by-Step Upgrade Checklist

1. **Pull V3 files or unpack `All-For-One-Skill-Package-V3.zip`**.
2. **Check host tools (optional Blender probe):**
   ```bash
   node scripts/install.mjs --check-tools
   ```
3. **Preview workspace/global sync without modifying files:**
   ```bash
   node scripts/install.mjs --workspace --dry-run
   ```
4. **Upgrade workspace targets (creates timestamped `.afo-backups/`):**
   ```bash
   npx tsx scripts/afo.ts sync --force
   # Or via direct installer CLI:
   node scripts/install.mjs --workspace --force --yes
   ```
5. **Verify installation integrity & V3 validation suite:**
   ```bash
   node scripts/install.mjs --verify --workspace
   npm run lint
   npm run afo:validate
   npm run afo:test
   npm run afo:eval
   ```

---

## New V3 Modules Summary

| Module | Purpose |
| :--- | :--- |
| `core/security.ts` | Symlink-aware subpath checks, atomic file writes, advisory locks, secret scanning/redaction, destructive action approval guards |
| `core/engineering-intelligence.ts` | 8-stack profiles (`SOFTWARE_STACK_PROFILES`), multi-manifest dependency audits, API deprecation checks, error log diagnosis, code review |
| `core/blender-bridge.ts` | Optional `blender` CLI probing, sandboxed CLI args, hardware-bounded `bpy` automation script generator |
| `core/asset-pipeline.ts` | Engine export specs (`unreal5`, `unity`, `godot`, `threejs`, `cpp-native`, `rust`) and GLB/glTF/FBX binary validation |
| `core/visual-iteration.ts` | `Create -> Render -> Inspect -> Diagnose -> Improve -> Re-render` controller, render signature validation, best-render retention |
| `core/model-adapter.ts` | Zero-cost `OfflineDeterministicAdapter` + optional `ConfigurableModelAdapter` with offline fallback |
| `assets/blender/export_engine_asset.py` | Standalone headless Blender CLI export script (`--engine=... --format=glb|gltf|fbx --out=...`) |
