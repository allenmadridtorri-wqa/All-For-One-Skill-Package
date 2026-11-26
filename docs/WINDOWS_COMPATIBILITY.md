# Windows Compatibility & Installer Guide (All-For-One V3.1)

All-For-One V3.1 resolves Windows PowerShell and ESM entrypoint friction discovered in V3.0 and expands tool detection for Windows workstations.

---

## 1. Windows Fixes Shipped in V3.1

1. **`install.ps1` `-Force -Yes` Parity, `-Verify`, and `-CheckTools`:**
   - V3.0 `scripts/install.mjs` required `--yes` when `--force` was set, but `install.ps1` lacked a `-Yes` switch. V3.1 adds `[switch]$Yes`, `[switch]$Verify`, `[switch]$CheckTools`, validates `-Force` requires `-Yes`, forwards `--yes` / `--verify` / `--check-tools`, and propagates exit codes via `exit $LASTEXITCODE`.
2. **Windows ESM Main-Module Entrypoint Guards (`scripts/*.ts`):**
   - Replaced raw `import.meta.url === \`file://${process.argv[1]}\`` comparisons (which broke on Windows backslashes and drive letters like `C:\...`) with `import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href` in `scripts/afo.ts`, `scripts/validate-skill-package.ts`, `scripts/check-hot-loop.ts`, and `scripts/audit-pbr-scene.ts`.
3. **Windows Atomic Write Rename Retry (`core/installer-engine.mjs`):**
   - `atomicWriteFileSync` now retries `fs.renameSync` up to 4 times on transient Windows antivirus / indexer file locks (`EPERM`, `EBUSY`, `EACCES`).
4. **Windows Blender & FFmpeg Probing (`core/blender-bridge.ts`, `core/installer-engine.mjs`):**
   - `detectBlenderInstallation()` and `--check-tools` now check `BLENDER_PATH`, `BLENDER_BIN`, `PATH`, and `C:\Program Files\Blender Foundation\Blender *\blender.exe`, alongside `ffmpeg -version`.

---

## 2. Recommended Windows PowerShell Usage

```powershell
.\install.ps1 -CheckTools
.\install.ps1 -DryRun
.\install.ps1 -Workspace -Force -Yes
.\install.ps1 -Verify -Workspace
```

> **Verification Boundary Note:** Windows PowerShell execution and Windows Blender installation path probing were verified via static checks and unit tests inside a Linux Node.js test container; actual native Windows PowerShell runtime execution remains **`UNVERIFIED`** until executed on Windows.
