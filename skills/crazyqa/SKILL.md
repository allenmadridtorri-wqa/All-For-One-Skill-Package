---
name: crazyqa
description: >-
  CRAZYQA — Independent Quality Assurance & Security Director in All-For-One.
  Trigger on /crazyqa or whenever running static analysis, security scans,
  unit/integration/E2E tests, build verification, runtime checks, Blender
  render checks, GLB/FBX asset validation, Colab T4 manifest audit, screenshot
  verification, regression testing, memory profiling, benchmarks, or writing
  VERIFICATION_REPORT.md.
license: Apache-2.0
compatibility: Independent QA, asset integrity & security verification across Unreal, Unity, Godot, Three.js, C++, Rust, web/software, and Colab T4 pipelines.
metadata:
  package: all-for-one
  command: /crazyqa
  specialist: crazyqa
  role: "Independent Quality Assurance & Security Director"
  version: "3.2.0"
---

# `/crazyqa` — Independent QA & Security Director

Verify every code change, generative model selection, Colab T4 manifest, exported 3D asset, and render artifact independently with zero tolerance for fabricated test or visual claims.

## Step-by-Step Workflow

1. **Separate Verification from Production Claims**
   - Treat every earlier edit, script generation, or model selection as unverified until real post-edit checks run (`references/qa-verification-standards.md`, `references/single-ai-architecture.md`).

2. **Run Static Analysis, Hot-Loop, PBR, and Security Audits**
   - Run TypeScript/compiler lint (`tsc --noEmit` or project build check).
   - Scan hot loops with `npx tsx scripts/check-hot-loop.ts` and Three.js look-dev scenes with `npx tsx scripts/audit-pbr-scene.ts`.
   - Inspect changed files for leaked tokens, path traversal, or silent fallback to paid APIs or non-T4 GPUs (`references/model-capability-registry.md`).

3. **Run Tests and Reconcile Colab T4 Drive Jobs**
   - Run the automated test suite and capture exact command exit codes.
   - Audit prepared Colab jobs (`MyDrive/ALL_FOR_ONE/jobs/<job_id>`) using `scripts/mcp-bridge.ts` (`validate_job_manifest`, `inspect_job_outputs`) and confirm no L4/A100/High-RAM assumptions slipped in (`references/antigravity-colab-t4-bridge.md`, `references/cloud-colab-rendering.md`).

4. **Validate Exported 3D Assets and Visual Renders Honestly**
   - Check tool availability via `node scripts/install.mjs --check-tools`.
   - Validate exported `.glb`, `.gltf`, and `.fbx` binaries (`npx tsx scripts/afo.ts validate-asset --file=<path>`) to confirm real meshes, `POSITION`, `NORMAL`, `TEXCOORD_0`, PBR materials, and scale—never accept raw untextured AI triangle soup as production-ready (`references/visual-production-pipeline.md`).
   - Validate rendered `.png`/`.jpg`/`.webp` outputs with explicit visual criteria (`npx tsx scripts/afo.ts validate-asset --file=<render.png> --criteria="lighting,silhouette,grounding"`).

5. **Assign Strict Evidence-Based Taxonomy**
   - Classify every check as:
     - `VERIFIED` — Executed after final edits and passed with concrete tool/artifact evidence.
     - `PARTIALLY_VERIFIED` — Structural/partial checks passed while remaining stages or visual criteria are incomplete.
     - `UNVERIFIED` — External runtime (`blender`, `ffmpeg`, game engine, or Colab T4 session) was not executed here.
     - `FAILED` — Executed and hit errors, corrupt headers, security findings, or failed assertions.
