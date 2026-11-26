---
name: crazy
description: >-
  All-For-One V3.1 Single-AI-First Master Orchestrator coordinating CRAZYMAKER,
  CRAZYDESIGNER, CRAZYCODER, and CRAZYQA. Trigger on /crazy or any
  multi-discipline request to decompose, build, automate Blender/3D assets,
  cinematics, cloud/Colab GPU rendering, optimize, and verify software or games.
license: Apache-2.0
compatibility: Cross-frontier orchestrator across Unreal 5, Unity, Godot, Three.js, C++, Rust, web, and general software.
metadata:
  package: all-for-one
  command: /crazy
  specialist: orchestrator
  role: "Unified Single-AI-First Orchestrator"
  version: "3.1.0"
---

# `/crazy` — All-For-One V3.1 Master Orchestrator

Work step by step as a single AI model by default so you do not multiply API requests or spawn extra agents unless the user explicitly asks for multi-agent execution.

## Step-by-Step Workflow

1. **Clarify the Goal and Hardware Limits**
   - Identify the target engine (`unreal5`, `unity`, `godot`, `threejs`, `cpp-native`, `rust`, or general software/web) and ask short clarifying questions if the prompt is vague.
   - Check optional local tools with `node scripts/install.mjs --check-tools` before assuming Blender or FFmpeg is installed.
   - Follow `references/single-ai-architecture.md` to stay in single-AI `ECONOMY` mode by default.

2. **Load Only Relevant References**
   - Retrieve only the reference files needed for the active task using `npx tsx scripts/afo.ts retrieve --query="<topic>"` instead of loading the full reference library.

3. **Step Into the Game Director Role (`crazymaker`)**
   - Define the core gameplay loop, mechanics, dependencies, balancing rules, and measurable acceptance tests before writing implementation code.
   - Use `references/genre-profiles.md` and `references/open-world-systems.md` when designing game systems.

4. **Step Into the Visual & 3D Director Role (`crazydesigner`)**
   - Specify lighting, PBR materials, shaders, audio, camera framing, and 3D export targets (`references/photoreal-lighting-aces.md`, `references/pbr-material-calibration.md`, `references/game-engine-asset-pipelines.md`).
   - For multi-shot sequences or low-RAM laptops, plan frame-range chunks with `npx tsx scripts/afo.ts cinematic-plan --duration=90 --fps=24` and evaluate Google Colab GPU offloading with `npx tsx scripts/afo.ts colab-check --frames=240 --engine=CYCLES` (`references/cinematic-production-engine.md`, `references/cloud-colab-rendering.md`).

5. **Step Into the Engineering Director Role (`crazycoder`)**
   - Inspect existing build manifests and code layout first, keep APIs strictly aligned with the chosen engine, avoid per-frame allocations in hot loops, and write tests alongside code (`references/architecture-and-testing.md`, `references/ecs-and-hot-loop.md`).

6. **Run an Independent QA Pass (`crazyqa`)**
   - Verify static checks, unit/integration tests, builds, and actual rendered artifacts on disk (`references/qa-verification-standards.md`).
   - Report each check strictly as `VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, or `FAILED`. Never claim a test, render, or external binary check passed if it was not executed.
