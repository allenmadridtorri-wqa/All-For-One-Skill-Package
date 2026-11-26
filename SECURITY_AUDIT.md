# Security Audit & Hardening Report — All-For-One V3.1

This document records the security vulnerabilities identified and resolved across V3 and **V3.1**, including the V3.1 audit of Blender automation, remote GPU packaging, model adapter error paths, and Windows PowerShell installer parity.

---

## 1. Security Vulnerabilities Identified & Resolved in V3.1 Audit

| ID | Severity | Component | Finding & V3.1 Resolution |
| :--- | :--- | :--- | :--- |
| `SEC-31-01` | **High** | `core/blender-bridge.ts` | **V3 Weakness:** Interpolated paths directly into Python raw strings (`r"${spec.blendOutputPath}"`), allowing quote (`"`), newline (`\n`), or code-injection breakout if a caller supplied an untrusted filename. **V3.1 Fix:** Replaced all template interpolation with `serializePythonString()` (`JSON.stringify` + null-byte rejection) and enforced `validateBlenderWorkspacePath()` (blocks `\r`/`\n`, `..`, and paths outside `workspaceDir` / `os.tmpdir()` / `cwd`) plus Python-side `_resolve_safe_path()` `os.path.realpath` enforcement. |
| `SEC-31-02` | **Medium** | `assets/blender/export_engine_asset.py` | **V3 Weakness:** Export script wrote to `--out` directly without checking base directory bounds. **V3.1 Fix:** Added `--base-dir` CLI confinement using `os.path.realpath` boundary checks before exporting `.fbx` / `.glb` / `.gltf`. |
| `SEC-31-03` | **Medium** | `core/model-adapter.ts` | **V3 Weakness:** Network or provider errors passed through to fallback notes could inadvertently echo request headers or token strings. **V3.1 Fix:** Sanitized all caught provider exceptions with `redactSecrets()` before building response notes, and required `envApiKeyName` env-var lookup rather than literal key parameters. |
| `SEC-31-04` | **Medium** | `install.ps1` | **V3 Weakness:** `install.ps1` omitted `-Yes` forwarding even though V3 `scripts/install.mjs` blocked `--force` without `--yes`, breaking safe Windows forced updates. **V3.1 Fix:** Added `-Yes`, `-Verify`, `-CheckTools`, explicit `-Force` requires `-Yes` validation, and `$LASTEXITCODE` exit-code forwarding. |
| `SEC-31-05` | **Low** | `core/production-memory.ts` | **V3 Weakness:** Repeated decision calls with the same ID could append duplicate decision entries. **V3.1 Fix:** Locked decision IDs in `.afo-memory-state.json` so duplicate `DecisionEntry.id` calls throw explicitly, enforcing append-only superseding decisions. |

---

## 2. Preserved V3 Security Architecture

All V3 baseline controls (`SEC-01` through `SEC-06`) remain enforced in V3.1:
1. **Symlink-Aware Path Confinement (`core/security.ts#assertSafeSubpathSync`, `core/installer-engine.mjs#assertSafeSubpath`)**: Walks every path segment with `fs.lstatSync` + `fs.realpathSync` to block symlink escapes across installers, memory ledgers, Blender bridges, Colab packagers, and shot render trackers.
2. **Atomic File Writes & Advisory Locking (`atomicWriteFileSync`, `withAdvisoryLock`)**: Uses temp-sibling + rename (with Windows `EPERM`/`EBUSY`/`EACCES` retry backoff in `core/installer-engine.mjs`) and stale-lock-safe `wx` locks.
3. **Secret Scanning & Automatic Redaction (`redactSecrets`, `scanForSecrets`)**: Scans source and ledger outputs for API keys, Bearer tokens, PEM private keys, and credential URIs.
4. **Destructive Action Guards (`assertDestructiveApproved`, `isDangerousShellCommand`)**: Requires explicit approval before `--force` or multi-agent `ACCELERATION` escalation.

---

## 3. Remaining Residual Security Caveats

- Generated `.ipynb` / Python render scripts executed externally by the user on **Google Colab** or local **Blender** run under the user's host or Colab Python environment; always review custom `.blend` scene files before running headless scripts from untrusted third parties (`--factory-startup` disables user add-ons but `.blend` driver expressions still require standard `--disable-autoexec` caution if untrusted).
- Windows PowerShell execution of `install.ps1` could not run natively inside this Linux test container and is verified statically + via shared `core/installer-engine.mjs` unit tests.

---

## 4. Automated Verification Evidence

- `scripts/v3-framework.test.ts`: Verifies symlink escape blocking, advisory locks, secret scrubbing, `--force` approval gating, SHA-256 install integrity, and ledger tamper detection.
- `scripts/v3_1-framework.test.ts`: Verifies Blender path/newline/quote breakout rejection, `export_engine_asset.py` `--base-dir` confinement, `ConfigurableModelAdapter` error credential redaction, `ProductionMemoryLedger` decision immutability, `install.ps1` parameter parity, and PNG magic-byte verification.
- Repository-wide secret scan (`runSecuritySecretScan`): `0` findings across canonical core/script/asset files.
