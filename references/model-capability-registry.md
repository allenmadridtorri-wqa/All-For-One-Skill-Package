# Verified Open-Weight Model Capability Registry & T4 Fit Matrix

## 1. Purpose
Provide an accurate, evidence-based catalog of open-weight generative models across image generation, 3D generation, texture/depth enhancement, and video animatics so All-For-One never hallucinates APIs, ignores commercial license traps, or schedules out-of-memory workloads onto Google Colab NVIDIA T4 hardware.

## 2. Applicable Specialist
- Primary: `crazydesigner` (Visual, 3D & Render Director), `crazycoder` (Adapter & Resource Verification), `crazyqa` (License & Execution Verification).
- Orchestration: `/crazy` routes to this document before any generative model selection.

## 3. Relevant Tools
- CLI inspection: `npx tsx scripts/afo.ts models --t4-only`
- Programmatic catalog & evaluator: `core/model-registry.ts`
- Antigravity MCP tools: `list_compatible_models`, `inspect_model_requirements`, `get_compute_profile`

## 4. Production Methodology
Evaluate every candidate model through the strict 7-stage lifecycle before recommending it:
1. `DISCOVERED` -> 2. `LICENSE_REVIEWED` -> 3. `HARDWARE_ASSESSED` -> 4. `ADAPTER_IMPLEMENTED` -> 5. `ENDPOINT_TESTED` -> 6. `INFERENCE_TESTED` -> 7. `OUTPUT_VERIFIED`.
Never mark an unexecuted local or Colab model as `INFERENCE_TESTED` or `OUTPUT_VERIFIED`.

### Verified Open-Weight Catalog (Last Checked: 2026-11-26)
| Model ID | Category | Code License | Weight License | Min VRAM | T4 (16 GB) Verdict | Key Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `triposr` | 3D Generation | MIT | MIT | ~6.0 GB | **Fits Natively** | Fast single-image blockout (`VAST-AI-Research/TripoSR`); needs retopology + PBR cleanup. |
| `stable-fast-3d` | 3D Generation | MIT | Stability AI Community License | ~6.5 GB | **Fits Natively** | Gated HF terms; commercial free `< $1M/yr` revenue; includes basic UV/delighting. |
| `trellis` | 3D Generation | MIT | MIT | ~14.5–16 GB | **Fits (Reduced)** | Tight fit on 15.3 GB usable T4; optional `nvdiffrast` dependency is non-commercial. |
| `trellis-2` | 3D Generation | MIT | MIT | **24.0+ GB** | **BLOCKED on T4** | Official Microsoft docs target 24 GB+ (A100/H100). Never schedule on Colab T4. |
| `hunyuan3d-2` | 3D Generation | Tencent Community License | Tencent Community License | ~6 GB shape / ~16 GB full | **Fits (Shape Only)** | **Excludes EU, UK, South Korea**; Hunyuan3D-2.1 full (~29 GB) is incompatible with T4. |
| `sdxl-base-1.0` | Image Gen | MIT | CreativeML Open RAIL++-M | ~8–11 GB | **Fits Natively** | Reliable FP16 1024x1024 concept/reference generation on T4. |
| `flux-1-schnell` | Image Gen | Apache-2.0 | Apache-2.0 | ~12 GB NF4 / ~24 GB FP16 | **Experimental Offload** | FP16 OOMs on T4; requires NF4/FP8 quantization + CPU offload; monitor 12.7 GB Colab RAM. |
| `real-esrgan` | Enhancement | BSD-3-Clause | BSD-3-Clause | ~2.5–4 GB | **Fits Natively** | Fast tiled upscaling (`--tile 512`) for PBR albedo/roughness maps. |
| `depth-anything-v2-small` | Enhancement | Apache-2.0 | Apache-2.0 | ~2–4 GB | **Fits Natively** | **Only Small is Apache-2.0**; Base/Large/Giant use CC-BY-NC-4.0 (non-commercial). |
| `wan2.1-t2v-1.3b` | Video Previz | Apache-2.0 | Apache-2.0 | ~13–15.5 GB | **Fits (Reduced)** | Use 480p + VAE slicing + CPU offload for animatic previz only. |

## 5. Technical Requirements
- Always separate **Code License** from **Weight License**.
- Enforce **15,360 MB safe usable VRAM ceiling** on NVIDIA T4 (accounting for CUDA context allocation).
- Read host system RAM dynamically (`MemTotal` / `MemAvailable`) before offloading weights to CPU.

## 6. Important Constraints
- Paid proprietary inference APIs are disabled unless explicitly opted in by the user.
- Never run 3D model inference concurrently with Blender Cycles rendering on a single T4 GPU.
- Always surface regional license exclusions (`hunyuan3d-2` EU/UK/KR) and revenue caps (`stable-fast-3d` $1M).

## 7. Common Failures
- Scheduling `TRELLIS.2` (4B) or unquantized `FLUX.1-schnell` FP16 on a T4 and hitting immediate `CUDA out of memory`.
- Shipping commercial projects using `Depth-Anything-V2-Large` (`CC-BY-NC-4.0`) or `nvdiffrast` without license review.
- Treating a raw 3D AI output mesh as final game/film geometry.

## 8. Quality Standards
- Every recommended model includes repository URL, verified VRAM requirement, license verdict, and concrete post-generation refinement steps in Blender (`Smart UV`, retopology, PBR calibration).

## 9. Performance Considerations
- Prefer `triposr` or `stable-fast-3d` (`~6 GB`) on T4 to preserve headroom; call `gc.collect(); torch.cuda.empty_cache()` between jobs.

## 10. Validation Procedure
- Run `npx tsx scripts/afo.ts models --t4-only` and `inspect_model_requirements` MCP tool to verify compatibility verdicts match `core/model-registry.ts`.

## 11. Known Limitations
- In offline/GPUless environments, live Hugging Face Hub downloads and actual T4 GPU inference remain `UNVERIFIED` until executed inside the user's Colab T4 notebook.

## 12. Authoritative Sources
- `VAST-AI-Research/TripoSR`: https://github.com/VAST-AI-Research/TripoSR
- `Stability-AI/stable-fast-3d`: https://github.com/Stability-AI/stable-fast-3d
- `microsoft/TRELLIS` & `microsoft/TRELLIS.2`: https://github.com/microsoft/TRELLIS & https://github.com/microsoft/TRELLIS.2
- `Tencent-Hunyuan/Hunyuan3D-2`: https://github.com/Tencent-Hunyuan/Hunyuan3D-2
- `black-forest-labs/FLUX.1-schnell`: https://huggingface.co/black-forest-labs/FLUX.1-schnell
- `stabilityai/stable-diffusion-xl-base-1.0`: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
- `xinntao/Real-ESRGAN`: https://github.com/xinntao/Real-ESRGAN
- `DepthAnything/Depth-Anything-V2`: https://github.com/DepthAnything/Depth-Anything-V2
- `Wan-AI/Wan2.1`: https://github.com/Wan-AI/Wan2.1
