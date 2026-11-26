---
name: crazydesigner
description: >-
  CRAZYDESIGNER — Visual & 3D Production Director in All-For-One. Trigger on
  /crazydesigner or when authoring PBR materials, real-time lighting, custom
  shaders, VFX, Blender automation, Geometry Nodes, animation, mocap, rigging,
  cinematics, FBX/glTF asset pipelines, post-processing, or spatial audio.
license: Apache-2.0
compatibility: Engine-aware visual & 3D production for Unreal 5, Unity, Godot, Three.js, C++, Rust, and optional Blender CLI.
metadata:
  package: all-for-one
  command: /crazydesigner
  specialist: crazydesigner
  role: "Visual & 3D Production Director"
  version: "3.1.0"
---

# `/crazydesigner` — Visual & 3D Production Director

Follow these steps to direct lighting, PBR materials, shaders, spatial audio, 3D asset production, cinematics, and cloud rendering cleanly.

## Step-by-Step Workflow

1. **Check Available Tools and Engine Targets**
   - Check whether `blender` and `ffmpeg` are installed locally using `node scripts/install.mjs --check-tools`. Never claim local Blender or FFmpeg renders ran if those tools are missing.
   - Lock real-world metric scale (`1 unit = 1 meter`), coordinate axes, and export format rules (`FBX` for Unreal/Unity, `GLB` for Godot/Three.js) from `references/game-engine-asset-pipelines.md`.

2. **Direct Lighting, PBR Materials, Shaders, and Audio**
   - Calibrate physical lighting, Kelvin temperatures, HDRI reflections, and ACES Filmic tone mapping (`references/photoreal-lighting-aces.md`, `references/pbr-material-calibration.md`).
   - Design volumetric fog, water, particle VFX, and post-processing passes (`references/hollywood-vfx-shaders.md`), grounded camera framing (`references/playable-scene-composition.md`), and spatial audio attenuation (`references/aaa-spatial-audio.md`).

3. **Author 3D Geometry, Rigs, Animation, and Exports**
   - Follow `references/blender-automation-pipeline.md` and `references/animation-motion-pipeline.md` for procedural modeling, UVs, LODs, rigging, motion capture cleanup, and camera choreography.
   - Keep all file paths inside the workspace directory. When exporting from Blender headless CLI, run `blender --background --factory-startup <scene.blend> --python-exit-code 1 --python assets/blender/export_engine_asset.py -- --base-dir=. --engine=<engine> --format=<glb|gltf|fbx> --out=<relative-path>`.

4. **Split Long Cinematics and Offload Heavy Renders**
   - For multi-shot sequences, split shots into resumable frame chunks with `npx tsx scripts/afo.ts cinematic-plan --duration=90 --fps=24` (`references/cinematic-production-engine.md`).
   - On low-RAM or iGPU machines, evaluate remote GPU offloading with `npx tsx scripts/afo.ts colab-check --frames=240 --engine=CYCLES` and follow `references/cloud-colab-rendering.md` with `assets/colab/colab_blender_worker.py`.

5. **Audit and Iterate Visually**
   - For Three.js projects, run `npx tsx scripts/audit-pbr-scene.ts` to verify tone mapping, sRGB output, pixel-ratio clamping, and `.dispose()` cleanup.
   - Follow the Create, Render, Inspect, Diagnose, and Improve loop in `references/visual-production-pipeline.md`, and keep backups before overwriting final renders.
