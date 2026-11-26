# Cloud & Google Colab GPU Rendering Pipeline (V3.1)

**Purpose:** Enable constrained local hardware (e.g., Intel Core i3-1005G1, 4GB RAM, no dedicated GPU) to offload heavy Cycles/EEVEE 3D renders cleanly to **Google Colab GPU** or **Google Cloud GCE GPU** (`core/cloud-rendering.ts`, `assets/colab/colab_blender_worker.py`).

## Hardware Routing Policy (`evaluateHardwareRenderRouting`)

- **Local Laptop Preview (`4GB` RAM, CPU-only):** Clamped preview renders (`<= 960px` width, `<= 32` samples) remain local; full-HD/4K sequences or high-sample Cycles shots automatically route to `'google-colab'` (when free/cloud GPU is preferred) or `'google-cloud-gce'`.
- Never fake local Cycles GPU rendering when only CPU or integrated graphics exist (`detectBlenderInstallation()`).

## Reproducible Colab Job Packaging (`prepareColabRenderPackage`)

Every prepared render job exports a workspace-confined directory containing:
1. `job-manifest.json` — Job ID, provider, SHA-256 asset inventory, frame range chunks, and Google Drive checkpoint root (`/content/drive/MyDrive/AllForOneRenders/<jobId>`).
2. `render_job.ipynb` — Ready-to-run Colab notebook (`nvidia-smi` GPU probe, Drive mount, Blender headless install, chunked worker invocation).
3. `colab_blender_worker.py` — Resumable Blender CLI runner that enables `CYCLES` GPU (`OPTIX`/`CUDA`, falling back cleanly to `CPU`), skips already rendered valid frames, and writes per-chunk Drive checkpoints.

## Honest Remote Output Verification (`reconcileRemoteRenderOutputs`)

Downloaded frames are verified by checking actual **`PNG` magic bytes (`89 50 4E 47`)** and minimum byte size before marking chunks `COMPLETED`. Missing or truncated frames are marked `MISSING_FRAMES` and re-queued for resume. Until external frames land locally and pass verification, remote jobs report **`UNVERIFIED`**.
