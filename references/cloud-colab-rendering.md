# Cloud & Google Colab NVIDIA T4 GPU Pipeline (V3.2)

**Purpose:** Enable constrained local hardware (e.g., 2-core / 4GB RAM / iGPU laptops) to offload heavy Cycles rendering or T4-compatible 3D model inference cleanly to a user-initiated **Google Colab NVIDIA T4 (16 GB VRAM) + Standard System RAM** session via persistent Google Drive job folders (`MyDrive/ALL_FOR_ONE/jobs/<job_id>`).

## Hardware Contract & Dynamic Checks

- **Target Cloud GPU:** **NVIDIA T4 (16 GB VRAM / ~15,360 MB safe usable ceiling)** ONLY. Never assume L4, A100, H100, or Colab High-RAM.
- **Dynamic Host Inspection:** Probe actual GPU model (`nvidia-smi`), system RAM (`/proc/meminfo`), CUDA availability, and free disk space before execution (`assets/colab/colab_blender_worker.py`).
- **Single Heavy Workload Rule:** Never run generative 3D model inference and Blender Cycles concurrently on one T4 GPU. Call `gc.collect()` and `torch.cuda.empty_cache()` between steps.
- **Zero Always-On Server Rule:** Do **NOT** design free Google Colab as an always-on HTTP/SSH/MCP server. Use Antigravity -> local MCP bridge (`scripts/mcp-bridge.ts`) -> Drive job folder -> interactive notebook -> Drive output import & QA.

## T4 Render Quality Profiles (`core/cloud-rendering.ts`)

1. **`PREVIEW`** — `960x540`, `24` Cycles samples + OIDN denoiser, `48`-frame chunks.
2. **`LOOK_DEVELOPMENT`** — `1280x720`, `64` Cycles samples + OIDN denoiser, `24`-frame chunks.
3. **`FINAL_T4_RENDER`** — `1920x1080`, `128` Cycles samples + OIDN denoiser, `12`-frame chunks (disconnect-resilient).

## Reproducible Drive Job Layout (`MyDrive/ALL_FOR_ONE/jobs/<job_id>/`)

Every prepared package creates:
- `input/` (`.blend`, textures, reference images with SHA-256 checksums)
- `config/` & `job_manifest.json` (plus `checkpoints.json`, initial status `UNVERIFIED_PREPARED_FOR_COLAB`)
- `scripts/colab_blender_worker.py` + `afo_colab_<job_id>.ipynb`
- `output/` & `logs/`

## Honest Remote Output Verification (`reconcileRemoteRenderOutputs`)

Downloaded frames are verified by checking actual **`PNG` magic bytes (`89 50 4E 47 0D 0A 1A 0A`)** and minimum dimensions/bytes before marking chunks `COMPLETED`. Generated GLB/glTF outputs are validated with `npx tsx scripts/afo.ts validate-asset --file=<relPath>`. Remote jobs remain **`UNVERIFIED`** until local inspection passes.
