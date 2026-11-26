# Cinematic Production Engine (`core/cinematic-production.ts`)

All-For-One V3.1 adds a dedicated **Cinematic Production Engine** for long-form trailers, cutscenes, and 3D sequences (e.g., **90 seconds @ 24 fps = `2,160` frames**).

---

## 1. End-to-End Pipeline

1. **Structured Production Plan (`createCinematicProductionPlan`):**
   - Breaks duration into multi-act **Scene Beats** (`CinematicSceneBeat`), ordered **Shots** (`CinematicShotSpec`), character/environment/asset dependencies, camera rig settings (`crane`, `dolly`, `orbit`, `track-to`, `static`, focal length, DoF f-stop), cloth/physics flags, and audio/music stems.
   - Splits each shot into recoverable **`FrameRangeChunk`** intervals (`splitFrameRange`) sized to host hardware (`24` frames/chunk on constrained laptops, `48` frames/chunk on workstations).
2. **Toggle Studio Parameterized Scene & Motion Choreography Pattern:**
   - Rather than brittle monolithic macros, every shot composes cleanly from typed declarative parameters (`BlenderScriptSpec`), allowing deterministic camera arcs (`TRACK_TO` + keyframes), `AgX` / `Filmic` color management, volumetric fog boxes, and compositor glare.
3. **Atomic Checkpoints & Disk Reconciliation (`CinematicProductionTracker`):**
   - Saves plans atomically via `atomicWriteFileSync` + advisory file locks (`.afo/cinematic-production.json`).
   - `reconcileShotFramesFromDisk(shotId)` inspects actual `frame_XXXX.png` files on disk (`findMissingFramesInRange`), automatically marks any interrupted chunk back to `FAILED`, and allows resuming cleanly from missing frames without discarding intact chunks.
4. **Honest FFmpeg Video Assembly (`buildVideoAssemblyPlan`):**
   - Probes local `ffmpeg` availability and validates whether `completedFrames === totalFrames`.
   - If `ffmpeg` is absent or any frames are still pending, returns the exact ready-to-run command alongside status **`UNVERIFIED`** — never claiming final video completion without executed verification.

---

## 2. Quick CLI Inspection

```bash
npx tsx scripts/afo.ts cinematic-plan --duration=90 --fps=24
```
