# Antigravity Local MCP Bridge & Google Colab T4 Drive Workflow

## 1. Purpose
Coordinate **Google Antigravity** (local planning, file inspection, validation) with **Google Colab NVIDIA T4 (16 GB VRAM) + Standard System RAM** cleanly over **Google Drive persistent job folders** (`MyDrive/ALL_FOR_ONE/jobs/<job_id>`), without requiring an always-on Colab daemon, paid cloud VMs, or fragile SSH tunnels.

## 2. Applicable Specialist
- Primary: `crazy` (Orchestrator), `crazydesigner` (Render/3D Offload), `crazycoder` (MCP Bridge & Path Safety), `crazyqa` (Job Verification).

## 3. Relevant Tools
- Local MCP stdio JSON-RPC server: `scripts/mcp-bridge.ts` (`core/mcp-bridge.ts`)
- CLI job prep & probe: `npx tsx scripts/afo.ts prepare-colab-t4`, `npx tsx scripts/afo.ts colab-check`, `npx tsx scripts/afo.ts mcp-tools`
- Remote worker script: `assets/colab/colab_blender_worker.py`

## 4. Production Methodology

### Architecture Flow (Zero Always-On Server Required)
`Antigravity Agent -> Local MCP Bridge (scripts/mcp-bridge.ts) -> Workspace / Drive Sync Folder (MyDrive/ALL_FOR_ONE/jobs/<job_id>) -> User-Initiated Colab T4 Notebook -> Persistent Drive Output -> Antigravity Import & QA Verification`

### Ten Exposed MCP-Compatible Bridge Tools
1. `get_compute_profile` — Probes local CPU/RAM dynamically and returns the enforced NVIDIA T4 (`15,360` MB safe usable VRAM) contract.
2. `list_compatible_models` — Filters verified open-weight models by T4 fit, license, and open asset sources.
3. `inspect_model_requirements` — Returns code vs weight license, commercial terms, geographic exclusions, and T4 VRAM headroom.
4. `prepare_colab_job` — Creates `jobs/<job_id>/` (`input/`, `config/`, `scripts/`, `output/`, `logs/`, `job_manifest.json`, `checkpoints.json`, `.ipynb`).
5. `validate_job_manifest` — Enforces T4 target checks and Drive layout before execution.
6. `get_job_status` — Reads checkpoint/lifecycle state (`CREATED | READY | RUNNING | COMPLETED | PARTIALLY_COMPLETED | FAILED | UNVERIFIED`).
7. `inspect_job_outputs` — Enumerates output `.glb`/`.png`/log artifacts in `jobs/<job_id>/output`.
8. `import_colab_results` — Runs magic-byte PNG reconciliation and updates chunk resume flags.
9. `validate_generated_asset` — Inspects `.glb`/`.gltf`/`.fbx` meshes, `POSITION`/`NORMAL`/`TEXCOORD_0`, PBR materials, and scale.
10. `inspect_render_artifacts` — Verifies render headers, dimensions, and visual criteria.

### T4 Quality Profiles (`core/cloud-rendering.ts`)
- **`PREVIEW`**: `960x540`, `24` Cycles samples + OIDN, `48`-frame chunks.
- **`LOOK_DEVELOPMENT`**: `1280x720`, `64` Cycles samples + OIDN, `24`-frame chunks.
- **`FINAL_T4_RENDER`**: `1920x1080`, `128` Cycles samples + OIDN, `12`-frame chunks (safe against Colab session disconnects).

## 5. Technical Requirements
- Standard Google Drive path: `/content/drive/MyDrive/ALL_FOR_ONE/jobs/<job_id>/`
- Colab worker executes startup checks: `nvidia-smi`, GPU model (`T4` / >= 14 GB check), `/proc/meminfo` dynamic RAM check, free disk >= 2 GB, and FP16 / single-job memory isolation.

## 6. Important Constraints
- **DO NOT** design free Google Colab as a permanent HTTP/WebSocket/SSH/MCP server.
- **DO NOT** assume L4, A100, H100, or Colab High-RAM.
- **DO NOT** run heavy 3D generative inference and Blender Cycles concurrently inside the same T4 session.

## 7. Common Failures
- Trying to launch GPU model inference on a CPU-only Colab runtime (worker now aborts explicitly rather than faking results).
- OOM crash during concurrent Blender + PyTorch jobs or oversized chunks.
- Corrupt truncated PNGs after a Colab session disconnects mid-frame (caught by `import_colab_results` PNG header checks).

## 8. Quality Standards
- Every generated job leaves hash-verified assets, atomic `checkpoints.json`, and honest `UNVERIFIED_PREPARED_FOR_COLAB` status until downloaded outputs pass binary + visual verification.

## 9. Performance Considerations
- Keep Blender Cycles tile/resolution aligned to `PREVIEW` first, then `LOOK_DEVELOPMENT`, and promote to `FINAL_T4_RENDER` only after lighting passes visual review.

## 10. Validation Procedure
- List tools: `npx tsx scripts/mcp-bridge.ts --list-tools`
- Validate manifest: call `validate_job_manifest` and run `python3 assets/colab/colab_blender_worker.py --manifest <path> --dry-run`.

## 11. Known Limitations
- Requires the user to upload/sync `jobs/<job_id>` to Google Drive and press **Run All** in Google Colab interactive runtime with a T4 GPU selected.

## 12. Authoritative Sources
- Model Context Protocol Specification (2024-11-05): https://modelcontextprotocol.io/specification
- Google Colab FAQ & Resource Limits: https://research.google.com/colaboratory/faq.html
- Blender Command-Line Rendering: https://docs.blender.org/manual/en/latest/advanced/command_line/render.html
