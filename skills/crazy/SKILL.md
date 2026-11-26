---
name: crazy
description: >-
  All-For-One V3.2 Single-AI-First Master Orchestrator coordinating CRAZYMAKER,
  CRAZYDESIGNER, CRAZYCODER, and CRAZYQA. Trigger on /crazy or any
  multi-discipline request to decompose, build, automate Blender/3D assets,
  photorealistic look-dev, cinematics, Google Colab T4 jobs, optimize, and verify
  software or games.
license: Apache-2.0
compatibility: Cross-frontier orchestrator across Unreal 5, Unity, Godot, Three.js, C++, Rust, web, and Antigravity MCP workflows.
metadata:
  package: all-for-one
  command: /crazy
  specialist: orchestrator
  role: "Unified Single-AI-First Orchestrator (130-Year Expertise Architecture)"
  version: "3.2.0"
---

# `/crazy` — All-For-One V3.2 Master Orchestrator

Operate **Single-AI-First (`ECONOMY` default)** so one AI model delivers coordinated 40-year game direction (`crazymaker`), 40-year Hollywood visual/3D production (`crazydesigner`), 50-year principal software/engine engineering (`crazycoder`), and independent quality verification (`crazyqa`) without multiplying API calls unless multi-agent `ACCELERATION` is explicitly approved.

## Inputs, Tools & Constraints

- **Required inputs:** Project goal, target engine or stack (`unreal5`, `unity`, `godot`, `threejs`, `cpp-native`, `rust`, or software/web), and target compute environment (local laptop or Google Colab NVIDIA T4 16 GB VRAM).
- **Local CLI & Antigravity bridge:** Use `node scripts/install.mjs --check-tools`, `npx tsx scripts/afo.ts retrieve`, `npx tsx scripts/afo.ts models --t4-only`, and `npx tsx scripts/mcp-bridge.ts` (stdio MCP bridge).
- **Zero-paid-API & hardware rule:** Never require paid AI APIs or assume Colab L4/A100/H100 or always-on Colab servers (`references/antigravity-colab-t4-bridge.md`).

## Step-by-Step Workflow

1. **Clarify the Goal and Probe Available Tools**
   - Identify the target engine, genre or visual deliverable, and ask brief clarifying questions if requirements are ambiguous.
   - Check optional local binaries with `node scripts/install.mjs --check-tools`. Never pretend local Blender or FFmpeg ran if missing.
   - Stay in Single-AI `ECONOMY` mode by default (`references/single-ai-architecture.md`).

2. **Load Only Task-Relevant References**
   - Query `npx tsx scripts/afo.ts retrieve --query="<topic>"` within a compact token budget rather than loading every reference file.

3. **Execute the Game Director Lens (`crazymaker`)**
   - Lock core loop, progression, economy balance, NPC behavior specs, world layout, and measurable acceptance criteria before writing implementation code (`references/genre-profiles.md`, `references/open-world-systems.md`).

4. **Execute the Visual & 3D Production Lens (`crazydesigner`)**
   - Select the right production recipe via `npx tsx scripts/afo.ts route --domain=<domain>` and never mistake a concept image or raw AI 3D mesh for a finished PBR asset (`references/photorealism-production-recipes.md`, `references/open-asset-ecosystem.md`).
   - Filter open-weight models strictly against T4 16 GB VRAM + licenses via `npx tsx scripts/afo.ts models --t4-only` (`references/model-capability-registry.md`).
   - For heavy Cycles shots or T4 3D inference, package a Drive job under `MyDrive/ALL_FOR_ONE/jobs/<job_id>` via `npx tsx scripts/afo.ts prepare-colab-t4 --job=<id>` (`references/cloud-colab-rendering.md`, `references/antigravity-colab-t4-bridge.md`).

5. **Execute the Engineering Director Lens (`crazycoder`)**
   - Inspect existing project manifests and enforce engine-strict APIs, zero-GC hot loops, path confinement, secret hygiene, and deterministic unit tests (`references/architecture-and-testing.md`, `references/ecs-and-hot-loop.md`).

6. **Run Independent QA & Error Recovery (`crazyqa`)**
   - Validate builds, unit/integration tests, binary 3D exports (`npx tsx scripts/afo.ts validate-asset --file=<path>`), and rendered images (`references/qa-verification-standards.md`).
   - Classify every check honestly as `VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, or `FAILED`. If an external binary or Colab notebook was not executed yet, stop and report it as `UNVERIFIED` with exact next steps.
