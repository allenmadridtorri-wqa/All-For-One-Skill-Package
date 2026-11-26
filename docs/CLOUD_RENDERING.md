# Cloud & Google Colab NVIDIA T4 GPU Pipeline (`core/cloud-rendering.ts`, `assets/colab/colab_blender_worker.py`)

Heavy **Cycles** renders and open-weight 3D model inference can overwhelm thin local laptops (e.g., 2-core / 4GB RAM / integrated graphics). All-For-One V3.2 packages reproducible, checkpointed **Google Colab NVIDIA T4 (16 GB VRAM) + Standard System RAM** Drive jobs with **zero always-on Colab server assumptions**.

---

## 1. Hardware Render Routing (`evaluateHardwareRenderRouting` & `detectComputeProfile`)

```bash
npx tsx scripts/afo.ts colab-check --frames=240 --engine=CYCLES
npx tsx scripts/afo.ts models --t4-only
```

- Enforces the **NVIDIA T4 (16 GB total / 15,360 MB safe usable VRAM)** target and probes host system RAM dynamically (`MemTotal` / `MemAvailable`).
- Never assumes Colab High-RAM, `L4`, `A100`, or `H100`.
- Rejects models exceeding T4 VRAM (`trellis-2`) before packaging any Colab job.

---

## 2. Reproducible Drive Job Layout (`MyDrive/ALL_FOR_ONE/jobs/<job_id>/`)

```bash
npx tsx scripts/afo.ts prepare-colab-t4 --job=hero_car --type=render --profile=LOOK_DEVELOPMENT
npx tsx scripts/afo.ts prepare-colab-t4 --job=prop_3d --type=inference --model=triposr
```

Generated folder structure inside `jobs/<job_id>/`:
- `input/` — Uploaded `.blend`, reference plates, and SHA-256 asset hashes
- `config/` & `job_manifest.json` — Target T4 requirements, quality profile (`PREVIEW`, `LOOK_DEVELOPMENT`, `FINAL_T4_RENDER`), and status (`UNVERIFIED_PREPARED_FOR_COLAB`)
- `checkpoints.json` — Atomic per-chunk resume state
- `scripts/colab_blender_worker.py` + `afo_colab_<job_id>.ipynb` — User-initiated interactive Colab notebook
- `output/` & `logs/` — Persistent rendered PNG chunks or generated GLB outputs written directly to Google Drive

---

## 3. Antigravity MCP Bridge & Honest Result Verification

- Run the local stdio MCP server: `npx tsx scripts/mcp-bridge.ts` (`--list-tools` prints all 10 exposed tools).
- Downloaded frames and generated `.glb`/`.fbx` meshes are checked via `npx tsx scripts/afo.ts validate-asset --file=<path>` and `import_colab_results` before transitioning away from `UNVERIFIED`.
