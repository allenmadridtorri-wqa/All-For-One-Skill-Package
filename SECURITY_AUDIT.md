# Security Audit & Hardening Report — All-For-One V3

This document records the security vulnerabilities identified during the V3 audit of All-For-One V2, the concrete mitigations implemented in V3, and the automated security verification coverage.

---

## 1. Vulnerabilities Identified in V2 Audit

| ID | Severity | Component | Finding |
| :--- | :--- | :--- | :--- |
| `SEC-01` | **High** | `core/installer-engine.mjs` | `assertSafeSubpath` checked lexical `path.resolve` containment only; an existing symlink inside `.claude/`, `.agent/`, or `.agents/` pointing outside the workspace root could escape containment during file reads/writes. |
| `SEC-02` | **Medium** | `core/installer-engine.mjs`, `core/production-memory.ts`, `core/production-intelligence.ts` | Direct `fs.writeFileSync` calls could leave truncated/corrupt manifests, memory ledgers, or checkpoints on mid-write interruption and lacked cooperative locking against concurrent processes. |
| `SEC-03` | **Medium** | `core/production-intelligence.ts` | `RenderSafetyManager` accepted caller-supplied relative paths without enforcing `assertSafeSubpathSync` confinement and lacked corruption-free atomic writes. |
| `SEC-04` | **High** | `core/production-memory.ts` | `ProductionMemoryLedger` wrote free-form decision/iteration notes to disk without scrubbing accidental API keys, tokens, PEM blocks, or DB credentials, and had no integrity checksum to detect file tampering/corruption. |
| `SEC-05` | **Medium** | `core/installer-engine.mjs`, `scripts/install.mjs` | Destructive `--force` overwrites did not support explicit confirmation gating (`requireApprovalForForce` / `--yes`), and installers lacked post-install SHA-256 manifest verification (`--verify`). |
| `SEC-06` | **Medium** | `core/qa-verification.ts` | QA pipeline lacked an automated workspace secret scanner (`scanForSecrets`) and lacked verification helpers for Blender command sandboxing and exported 3D asset integrity. |

---

## 2. Mitigations Implemented in V3

1. **Symlink-Aware Path Confinement (`core/security.ts#assertSafeSubpathSync` & `core/installer-engine.mjs#assertSafeSubpath`)**:
   - Rejects empty paths, null bytes (`\0`), filesystem root targets, and lexical `..` escapes.
   - Walks existing path segments from `baseDir` to target using `fs.lstatSync` and verifies every symlink's `fs.realpathSync` stays within `realBase`.
   - Applied consistently across installer operations, `RenderSafetyManager`, `ProductionMemoryLedger`, `blender-bridge.ts`, `asset-pipeline.ts`, and `visual-iteration.ts`.
2. **Atomic File Writes & Advisory Locking (`core/security.ts#atomicWriteFileSync`, `withAdvisoryLock`)**:
   - Writes payloads to a temporary sibling file (`<name>.tmp-<pid>-<rand>`) before calling `fs.renameSync`.
   - Protects installer writes (`.afo-install.lock`) and memory ledger updates (`.afo-memory/.afo-memory.lock`) with exclusive `wx` lockfiles and automatic stale-lock recovery (`> 30s`).
3. **Secret Scanning & Automatic Ledger Redaction (`core/security.ts#redactSecrets`, `scanForSecrets`)**:
   - Detects Google/Gemini (`AIza...`), OpenAI/Stripe (`sk-...`), GitHub (`ghp_`/`gho_`/etc.), AWS (`AKIA...`), `Bearer` tokens, PEM private keys, and DB credential URIs.
   - `ProductionMemoryLedger` passes all persisted markdown records through `redactSecrets()` on every write and tracks SHA-256 hashes in `.afo-memory-state.json` (`verifyIntegrity()`).
   - `runSecuritySecretScan()` integrates directly into `crazyqa` reporting (`scripts/afo.ts qa-report`).
4. **Destructive Action Confirmation & Dangerous Command Detection**:
   - `assertDestructiveApproved()` requires `{ approved: true, actor, reason }` for guarded destructive operations.
   - `scripts/install.mjs` enforces `--yes` whenever `--force` is passed.
   - `isDangerousShellCommand()` flags unapproved `rm -rf`, `git reset --hard`, `git push --force`, `mkfs.`, `dd if=`, and `DROP TABLE`/`DROP DATABASE`.
5. **Sandboxed Blender CLI Invocation (`core/blender-bridge.ts#buildBlenderCliArgs`)**:
   - Uses `execFileSync` (argument array, no shell interpolation) with `--background --factory-startup --python-exit-code 1` and path-confined script/blend paths.

---

## 3. Verification Status

- Unit tests in `scripts/v3-framework.test.ts` verify:
  - Symlink escape rejection (`assertSafeSubpathSync`)
  - Exclusive lock contention handling (`withAdvisoryLock`)
  - Secret redaction & pattern detection (`redactSecrets`, `scanForSecrets`, `ProductionMemoryLedger`)
  - Unapproved destructive force-overwrite rejection (`requireApprovalForForce`)
  - SHA-256 install integrity verification & tamper detection (`verifyInstallIntegrity`)
  - Ledger file corruption detection (`verifyIntegrity`)
- Workspace secret scan (`runSecuritySecretScan` across `core/`) executes as part of `npm run afo:qa`.
