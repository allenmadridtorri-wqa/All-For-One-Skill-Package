# Cinematic Production Engine & Toggle Studio Motion Choreography (V3.1)

**Purpose:** Break long-form trailers, cutscenes, and 3D showcases (e.g., 90s @ 24fps = `2,160` frames) into deterministic scenes, shots, asset dependencies, frame-range chunks, and checkpointed assembly plans (`core/cinematic-production.ts`).

## Structured Pipeline

1. **Screenplay Beats & Scene Breakdown:** Author duration-budgeted beats linked to scenes (`SceneSpec`) and ordered `ShotSpec` entries (`shotId`, `cameraRig`, `lensMm`, `lightingPreset`, `assetDependencies`, `startFrame`, `endFrame`).
2. **Frame-Range Splitting:** Split high-frame shots into small resumable chunks (`splitShotIntoChunks` / `splitFrameRange`), typically `12`–`24` frames per chunk on constrained laptops or `48`–`120` frames on Colab GPU workers.
3. **Code-Driven Scene & Motion Choreography (Toggle Studio Pattern):**
   - Parameterize scene templates (`procedural city/props`, `keyframed camera arc + Track To target`, `cloth/hair/rigid-body physics`) via typed specs (`BlenderScriptSpec` in `core/blender-bridge.ts`) rather than ad-hoc string macros.
   - Always generate `Smart UV`, procedural bump PBR nodes, `LOD1/LOD2` decimation where needed, and compositor `FOG_GLOW` glare deterministically.
4. **Disk Reconciliation & Resume Recovery:**
   - Persist atomic state in `CinematicProductionTracker` (`saveCheckpoint` / `loadCheckpoint`).
   - Reconcile rendered PNG frames (`reconcileShotFramesFromDisk` + `findMissingFramesInRange`) so interrupted jobs resume strictly from missing frames.
5. **FFmpeg Assembly Gate:**
   - `buildVideoAssemblyPlan()` probes `ffmpeg` availability and validates every input frame. If `ffmpeg` is absent or frames are incomplete, assembly status stays **`UNVERIFIED`** or **`FAILED`** — never fabricate a completed `.mp4`.
