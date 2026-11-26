# Cloud & Google Colab GPU Rendering (`core/cloud-rendering.ts`, `assets/colab/colab_blender_worker.py`)

Heavy multi-frame **Cycles** rendering can overwhelm thin laptops such as an **Acer Aspire A514-53** (2 cores / Intel Core i3-1005G1, 4GB RAM, integrated graphics). All-For-One V3.1 automates safe routing and reproducible **Google Colab GPU** job packaging while remaining completely honest about ephemeral session limits.

---

## 1. Hardware Render Routing (`evaluateHardwareRenderRouting`)

```bash
npx tsx scripts/afo.ts colab-check --frames=2160 --engine=CYCLES
```

- Detects constrained hardware (`tier === 'constrained'` or `CYCLES` sequences `>= 24` frames on `<= 4` CPU cores).
- Recommends offloading to **`google-colab`** (`RemoteRenderProviderRegistry` also includes **`google-cloud-gce`** and supports registering custom GPU providers).
- Surfaces explicit caveats: Google Colab sessions are **ephemeral** (~12h or idle/quota disconnect) and require manual Google Drive mounting & GPU runtime selection.

---

## 2. Reproducible Colab Package (`prepareColabRenderPackage`)

Inside a workspace-confined directory (`remote-jobs/<projectId>/`), All-For-One generates:
1. **`colab_job_manifest.json`** — Project metadata, frame-range chunks, Drive output root (`/content/drive/MyDrive/AFO_Renders/<projectId>`), SHA-256 hashes of `.blend` + textures/assets, and initial status **`UNVERIFIED_PREPARED_FOR_COLAB`**.
2. **`afo_colab_<projectId>.ipynb`** — Google Colab notebook mounting `/content/drive`, probing `nvidia-smi`, installing Blender 4.2 LTS if absent, and launching the worker.
3. **`colab_blender_worker.py`** — Resumable headless Blender worker enabling `OPTIX`/`CUDA` GPU compute (falling back safely to `CPU` if no GPU is attached), skipping already valid PNG frames, and persisting per-chunk checkpoints straight into Google Drive.

---

## 3. Remote Output Reconciliation (`reconcileRemoteRenderOutputs`)

Once rendered frames are downloaded back from Google Drive:
- Reads every expected frame path inside workspace bounds.
- Verifies actual **`PNG` 8-byte magic header (`89 50 4E 47 0D 0A 1A 0A`)** and minimum size (`>= 64` bytes).
- Marks chunks with corrupt/truncated frames as **`FAILED`**, missing chunks as **`PENDING`** (`resumeManifestChunkIds`), partial recoveries as **`PARTIALLY_VERIFIED`**, and marks **`VERIFIED`** only when 100% of frames exist and pass binary inspection.
