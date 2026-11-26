# CRAZY QA Verification Report — All-For-One V3.1

- **Generated At:** 2026-11-26T06:42:10Z
- **Overall Status:** `PARTIALLY_VERIFIED`
- **Reason for `PARTIALLY_VERIFIED`:** All local TypeScript checks, unit/integration suites (41/41), policy evaluations (159/159), trigger checks (8/8), target builds, workspace SHA-256 verification, and secret scans passed cleanly; external optional binaries (`blender`, `ffmpeg`), remote Colab GPU runtimes, native Windows OS PowerShell execution, and live paid LLM API runners are absent in this Linux container and strictly marked **`UNVERIFIED`**.

---

## Engineering, Security, Asset & Runtime Checks

| ID | Category | Status | Exit Code | Command / Source | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| QA-TSC-LINT | static-analysis | `VERIFIED` | 0 | `npm run lint` (`tsc --noEmit`) | Zero TypeScript errors across `core/`, `scripts/`, and `src/`. |
| QA-VITE-BUILD | build | `VERIFIED` | 0 | `npm run build` (`vite build`) | Production bundle compiled cleanly. |
| QA-PKG-VAL | dependency | `VERIFIED` | 0 | `npx tsx scripts/afo.ts validate` | 5 skills checked, 28 indexed references verified; 0 errors/warnings. |
| QA-UNIT-INT | integration-test | `VERIFIED` | 0 | `npm run afo:test` (`afo`, `v2`, `v3`, `v3_1`) | 41/41 tests passed (Single-AI modes, caching, Blender security, 90s/2160-frame cinematics, Colab PNG reconciliation, Windows PS1 parity). |
| QA-EVAL-V3 | integration-test | `VERIFIED` | 0 | `npx tsx scripts/afo.ts eval` | 159/159 deterministic policy cases passed across V2 + 13 V3 benchmark domains (`evals/report.json`). |
| QA-EVAL-TRIG | integration-test | `VERIFIED` | 0 | `npx tsx scripts/afo.ts eval-triggers` | 8/8 legacy trigger routing cases passed. |
| QA-HOT-LOOP | static-analysis | `VERIFIED` | 0 | `npx tsx scripts/check-hot-loop.ts` | Zero per-frame hot-loop allocation issues detected in `src/`. |
| QA-SEC-SECRETS | security | `VERIFIED` | 0 | Repo-wide `core/security.ts#scanForSecrets` | Scanned entire canonical repository (`core`, `scripts`, `skills`, `references`, `assets`, `docs`); 0 secret findings. |
| QA-SYNC-VERIFY | security | `VERIFIED` | 0 | `npx tsx scripts/afo.ts sync --force` + `node scripts/install.mjs --verify --workspace` | Synced Claude/Antigravity/ChatGPT workspace targets and verified SHA-256 checksums. |
| QA-BUILD-DIST | build | `VERIFIED` | 0 | `npx tsx scripts/afo.ts build` | Built 13 cross-frontier artifacts across Claude, Antigravity, and ChatGPT/Codex. |
| QA-RELEASE-ZIP | packaging | `VERIFIED` | 0 | `npx tsx scripts/afo.ts package-zip --out=release/All-For-One-Skill-Package-V3.1.zip` | Valid PKZIP (`504b0304`), 322 files, excludes `node_modules/`, `dist/`, `.git/`, `.afo-backups/`, `.env`. |
| QA-BLENDER-RUNTIME | blender-render | `UNVERIFIED` | n/a | `blender --version` | Blender executable unavailable in container; headless `bpy` execution not run here. |
| QA-FFMPEG-RUNTIME | video-assembly | `UNVERIFIED` | n/a | `ffmpeg -version` | FFmpeg executable unavailable in container; video assembly commands generated and marked `UNVERIFIED`. |
| QA-COLAB-GPU | cloud-render | `UNVERIFIED` | n/a | Google Colab GPU / Drive runtime | Generated reproducible `.ipynb`, manifest, and Python worker locally; remote Colab GPU execution requires interactive user session. |
| QA-WINDOWS-OS | os-runtime | `UNVERIFIED` | n/a | `install.ps1` on native Windows PowerShell | Verified statically & via shared JS installer tests on Linux; live Windows host execution not run in container. |
| QA-LIVE-LLM | model-runner | `UNVERIFIED` | n/a | Live OpenAI/Anthropic/Gemini API calls | Offline deterministic adapter & mocked HTTP tests verified; live external API calls omitted to preserve zero paid-API requirement. |

---

## Verification Taxonomy Policy

- **`VERIFIED`:** Executed and passed with concrete tool/artifact evidence in this environment.
- **`PARTIALLY_VERIFIED`:** Core suite and local validations passed; optional external runtimes explicitly marked `UNVERIFIED`.
- **`UNVERIFIED`:** Not executed because external binary, OS, cloud session, or live API runner was unavailable.
- **`FAILED`:** Executed and produced an error, security finding, or failed assertion.
