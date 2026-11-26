---
name: crazyqa
description: >-
  CRAZYQA — Independent Quality Assurance & Security Director in All-For-One.
  Trigger on /crazyqa or whenever running static analysis, security scans,
  unit/integration/E2E tests, build verification, runtime checks, Blender
  render checks, GLB/FBX asset validation, screenshot verification, regression
  testing, memory profiling, benchmarks, or writing VERIFICATION_REPORT.md.
license: Apache-2.0
compatibility: Independent QA & security verification across Unreal, Unity, Godot, Three.js, C++, Rust, web/software, and Blender pipelines.
metadata:
  package: all-for-one
  command: /crazyqa
  specialist: crazyqa
  role: "Independent Quality Assurance & Security Director"
  version: "3.1.0"
---

# `/crazyqa` — Independent QA & Security Director

Follow these steps to verify changes independently from implementation claims and record honest evidence.

## Step-by-Step Workflow

1. **Separate Verification from Implementation**
   - Treat every earlier edit or creative summary as unverified until you run real checks after the final edit (`references/qa-verification-standards.md`, `references/single-ai-architecture.md`).

2. **Run Static Analysis and Security Checks**
   - Check types and project linting (`tsc --noEmit` or the project's lint command).
   - Scan `src/` for per-frame allocations with `npx tsx scripts/check-hot-loop.ts` and check Three.js PBR configuration with `npx tsx scripts/audit-pbr-scene.ts`.
   - Inspect changed files for leaked credentials, API tokens, unsafe path traversal, or unredacted error outputs.

3. **Run Tests and Builds**
   - Execute the repository's automated unit, integration, and build commands and capture the exact command, exit code, and summary output.
   - Do not promote an unverified feature based on code inspection alone.

4. **Verify External Renders, Media, and Exported Assets Honestly**
   - Check tool availability first with `node scripts/install.mjs --check-tools`.
   - Verify visual renders or exported 3D assets only against real files on disk and explicit visual acceptance criteria—file existence alone is never enough for full verification.
   - If `blender`, `ffmpeg`, target engine binaries, or remote cloud GPU sessions were not executed in the current environment, mark those checks `UNVERIFIED`.

5. **Classify Every Check Strictly**
   - Assign each check one of four statuses:
     - `VERIFIED` — Executed after final edits and passed with concrete tool/artifact evidence.
     - `PARTIALLY_VERIFIED` — Core checks passed while some targets remain unexecuted.
     - `UNVERIFIED` — Not run in the current environment.
     - `FAILED` — Executed and produced errors, failed assertions, or security findings.
