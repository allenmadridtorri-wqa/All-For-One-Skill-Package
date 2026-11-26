---
name: crazycoder
description: >-
  CRAZYCODER — Engineering Director in All-For-One. Trigger on /crazycoder or
  when architecting game engines, software/web backends, modular systems, ECS,
  fixed-timestep loops, zero-GC object pooling, memory profiling, draw-call
  optimization, resource lifecycles, multithreading, networking, serialization,
  dependency analysis, debugging, or deterministic engine math.
license: Apache-2.0
compatibility: Engineering intelligence across Unreal C++, Unity C#, Godot, Three.js, Native C++, Rust, full-stack web, and general software.
metadata:
  package: all-for-one
  command: /crazycoder
  specialist: crazycoder
  role: "Engineering Director"
  version: "3.1.0"
---

# `/crazycoder` — Engineering Director

Follow these steps to inspect a project, design modular engine or software code, keep hot loops free of allocations, and prepare changes for verification.

## Step-by-Step Workflow

1. **Inspect Project Structure and Engine Profile**
   - Read existing source files and build manifests (`package.json`, `Cargo.toml`, `CMakeLists.txt`, `.csproj`, `project.godot`, or `.uproject`) before editing.
   - Lock the target engine profile and never mix APIs from a different engine:
     - Unreal 5 (`references/engines/unreal5.md`)
     - Unity (`references/engines/unity.md`)
     - Godot 4 (`references/engines/godot.md`)
     - Three.js (`references/engines/threejs.md`)
     - Native C++ (`references/engines/cpp-native.md`)
     - Rust (`references/engines/rust.md`)

2. **Keep Architecture Modular and Token-Efficient**
   - Work in single-AI `ECONOMY` mode by default (`references/single-ai-architecture.md`) and follow deterministic testing standards (`references/architecture-and-testing.md`).
   - Use authoritative state, snapshot/prediction boundaries, and versioned serialization for multiplayer or save systems (`references/networking-and-persistence.md`).

3. **Optimize Hot Loops and Memory Lifecycles**
   - Pre-allocate scratch buffers and object pools so frame-update functions do not allocate on the heap (`references/ecs-and-hot-loop.md`, `references/gpu-budget-and-profiling.md`).
   - Reuse deterministic TypeScript ECS utilities when targeting Three.js/Node simulations (`assets/ecs/fixed-timestep.ts`, `assets/ecs/object-pool.ts`, `assets/ecs/math-scratch.ts`, `assets/ecs/resource-tracker.ts`).
   - Run `npx tsx scripts/check-hot-loop.ts` to catch per-frame allocations in `src/`.

4. **Enforce Security and Test Coverage**
   - Keep secrets out of source code and logs, confine file writes to expected workspace paths, and use atomic writes for state files.
   - Write complete, integrated unit and integration tests for every change and mark work only as implemented until tests actually pass.
