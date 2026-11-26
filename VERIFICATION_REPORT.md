# CRAZY QA Verification Report — All-For-One V3.1

- **Generated At:** 2026-11-26T09:18:38Z
- **Overall Status:** `PARTIALLY_VERIFIED`
- **Reason for `PARTIALLY_VERIFIED`:** All local TypeScript checks, Vite builds, package validations, installed-skill link parity tests, CLI option & force-uninstall backup tests (33/33), keyword-routing & static policy tests (159/159 and 8/8), and secret scans passed; external optional binaries (`blender`, `ffmpeg`), remote Colab GPU runtimes, native Windows OS PowerShell execution, and live LLM evaluations are absent in this Linux container and remain strictly **`UNVERIFIED`**.

---

## Engineering, Security, Asset & Runtime Checks

| ID | Category | Status | Exit Code | Command / Source | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| QA-TSC-LINT | static-analysis | `VERIFIED` | 0 | `npm run lint` (`tsc --noEmit`) | Zero TypeScript errors across `core/`, `scripts/`, and `src/`. |
| QA-VITE-BUILD | build | `VERIFIED` | 0 | `npm run build` (`vite build`) | Production bundle compiled cleanly. |
| QA-PKG-VAL | dependency | `VERIFIED` | 0 | `npm run afo:validate` | 5 skills checked, 28 indexed references verified; 0 errors/warnings; plain step-by-step `SKILL.md` files without unrunnable TS symbol references. |
| QA-UNIT-INT | integration-test | `VERIFIED` | 0 | `npm run afo:test` (`afo`, `v2`, `v3`, `v3_1`) | 33/33 tests passed (including installed-skill link parity across Claude/Antigravity/ChatGPT workspace/global/dist, `install.mjs` invalid-flag rejection, `--uninstall --force --yes` backup enforcement, Blender path/quote/newline confinement, 90s/2160-frame cinematics, Colab PNG reconciliation, and Windows PS1 parity). |
| QA-KEYWORD-ROUTING | integration-test | `VERIFIED` | 0 | `npm run afo:eval` | 159/159 deterministic keyword-routing and static policy cases matched (`Keyword-Routing & Static Policy Test — NOT a live AI skill quality score`). |
| QA-KEYWORD-TRIGGERS | integration-test | `VERIFIED` | 0 | `npm run afo:eval:legacy` | 8/8 legacy keyword-routing trigger cases matched (`NOT a live AI skill quality score`). |
| QA-HOT-LOOP | static-analysis | `VERIFIED` | 0 | `npx tsx scripts/check-hot-loop.ts` | Zero per-frame hot-loop allocation issues detected in `src/`. |
| QA-SEC-SECRETS | security | `VERIFIED` | 0 | Repo-wide `core/security.ts#scanForSecrets` | Scanned canonical repository (`core`, `scripts`, `skills`, `references`, `assets`, `docs`); 0 secret findings. |
| QA-BLENDER-RUNTIME | blender-render | `UNVERIFIED` | n/a | `blender --version` | Blender executable unavailable in container; headless `bpy` execution not run here. |
| QA-FFMPEG-RUNTIME | video-assembly | `UNVERIFIED` | n/a | `ffmpeg -version` | FFmpeg executable unavailable in container; video assembly commands generated and marked `UNVERIFIED`. |
| QA-COLAB-GPU | cloud-render | `UNVERIFIED` | n/a | Google Colab GPU / Drive runtime | Generated reproducible `.ipynb`, manifest, and Python worker locally; remote Colab GPU execution requires interactive user session. |
| QA-WINDOWS-OS | os-runtime | `UNVERIFIED` | n/a | `install.ps1` on native Windows PowerShell | Verified statically & via shared JS installer tests on Linux; live Windows host execution not run in container. |
| QA-LIVE-LLM | model-runner | `UNVERIFIED` | n/a | Live LLM evaluation | Automated suite tests deterministic keyword-routing only; live frontier model quality remains `UNVERIFIED`. |

---

## Verification Taxonomy Policy

- **`VERIFIED`:** Executed and passed with concrete tool/artifact evidence in this environment.
- **`PARTIALLY_VERIFIED`:** Core suite and local validations passed; optional external runtimes explicitly marked `UNVERIFIED`.
- **`UNVERIFIED`:** Not executed because external binary, OS, cloud session, or live LLM runner was unavailable.
- **`FAILED`:** Executed and produced an error, security finding, or failed assertion.
