#!/usr/bin/env python3
"""All-For-One — Persistent Google Colab T4 Worker (Blender Render + T4 3D/Image Inference).

Enforces strict hardware awareness:
  - Targets NVIDIA T4 (16 GB VRAM) + Standard System RAM (dynamically probed).
  - Never assumes L4, A100, H100, or Colab High-RAM.
  - Runs a single heavy GPU job at a time with explicit VRAM/memory cleanup.
  - Persists chunked outputs and atomic checkpoints under MyDrive/ALL_FOR_ONE/jobs/<job_id>.
"""
import argparse
import gc
import glob
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time

SUPPORTED_T4_INFERENCE_MODELS = {
    "triposr",
    "stable-fast-3d",
    "sdxl-base-1.0",
    "real-esrgan",
    "depth-anything-v2-small",
}


def probe_system_ram_mb():
    total_mb = 0
    avail_mb = 0
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    total_mb = int(line.split()[1]) // 1024
                elif line.startswith("MemAvailable:"):
                    avail_mb = int(line.split()[1]) // 1024
    except Exception:
        pass
    return {"total_ram_mb": total_mb, "available_ram_mb": avail_mb}


def probe_gpu_vram_mb():
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"],
            text=True,
            timeout=5,
        ).strip()
        if out:
            parts = [x.strip() for x in out.split(",")]
            name = parts[0]
            mem_total = int(float(parts[1]))
            mem_free = int(float(parts[2])) if len(parts) > 2 else mem_total
            return {
                "gpu_available": True,
                "gpu_name": name,
                "is_t4": "T4" in name.upper(),
                "vram_mb": mem_total,
                "vram_free_mb": mem_free,
            }
    except Exception:
        pass
    return {
        "gpu_available": False,
        "gpu_name": None,
        "is_t4": False,
        "vram_mb": 0,
        "vram_free_mb": 0,
    }


def free_gpu_memory():
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass


def check_runtime_or_abort(manifest, require_t4=False):
    gpu_info = probe_gpu_vram_mb()
    ram_info = probe_system_ram_mb()
    disk = shutil.disk_usage(os.path.dirname(os.path.abspath(manifest.get("_manifest_path", "."))))
    free_disk_mb = int(disk.free / (1024 * 1024))
    req = manifest.get("targetGpuRequirement", {})
    abort_if_missing = req.get("abortIfNonT4OrMissingGpu", False) or require_t4
    job_type = manifest.get("jobType", "blender-render")

    report = {
        "gpu": gpu_info,
        "ram": ram_info,
        "free_disk_mb": free_disk_mb,
        "job_type": job_type,
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    if job_type == "t4-model-inference" and not gpu_info["gpu_available"]:
        raise RuntimeError("No NVIDIA GPU detected; aborting T4 model inference cleanly instead of faking CPU runs.")

    if abort_if_missing and not gpu_info["gpu_available"]:
        raise RuntimeError("--require-t4 set and no NVIDIA GPU detected via nvidia-smi.")

    if gpu_info["gpu_available"] and gpu_info["vram_mb"] < 14000 and job_type == "t4-model-inference":
        raise RuntimeError(f"Detected GPU VRAM {gpu_info['vram_mb']} MB is below T4 15-16 GB baseline.")

    if free_disk_mb < 2048:
        raise RuntimeError(f"Insufficient free disk space ({free_disk_mb} MB < 2048 MB minimum).")

    return report


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def verify_output_artifact(path):
    """Validates generated GLB or PNG header bytes before claiming completion."""
    if not os.path.isfile(path):
        return {"valid": False, "reason": "File does not exist"}
    size = os.path.getsize(path)
    if size < 32:
        return {"valid": False, "reason": f"Artifact too small ({size} bytes)"}
    ext = os.path.splitext(path)[1].lower()
    with open(path, "rb") as f:
        head = f.read(24)
    if ext == ".glb":
        if len(head) < 12 or head[0:4] != b"glTF":
            return {"valid": False, "reason": "Invalid GLB magic header"}
        version = struct.unpack("<I", head[4:8])[0]
        if version != 2:
            return {"valid": False, "reason": f"Unsupported GLB version {version}"}
        return {"valid": True, "format": "GLB", "size_bytes": size}
    if ext == ".png":
        if head[:8] != b"\x89PNG\r\n\x1a\n":
            return {"valid": False, "reason": "Invalid PNG signature"}
        return {"valid": True, "format": "PNG", "size_bytes": size}
    if ext == ".obj":
        return {"valid": True, "format": "OBJ", "size_bytes": size}
    return {"valid": True, "format": ext.lstrip(".").upper() or "BIN", "size_bytes": size}


def build_chunk_bpy_runner(blend_path, out_dir, frame_start, frame_end, res_x, res_y, samples, use_gpu):
    return f"""import bpy, os
bpy.ops.wm.open_mainfile(filepath={json.dumps(blend_path)})
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.render.resolution_x = {int(res_x)}
scene.render.resolution_y = {int(res_y)}
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.frame_start = {int(frame_start)}
scene.frame_end = {int(frame_end)}
if hasattr(scene, 'cycles'):
    scene.cycles.samples = {int(samples)}
    scene.cycles.use_denoising = True
    if hasattr(scene.cycles, 'denoiser'):
        try:
            scene.cycles.denoiser = 'OPENIMAGEDENOISE'
        except Exception:
            pass
    if {bool(use_gpu)}:
        prefs = bpy.context.preferences.addons.get('cycles')
        if prefs:
            for backend in ('OPTIX', 'CUDA', 'HIP', 'NONE'):
                try:
                    prefs.preferences.compute_device_type = backend
                    prefs.preferences.get_devices()
                    if backend != 'NONE':
                        scene.cycles.device = 'GPU'
                        break
                except Exception:
                    continue
        else:
            scene.cycles.device = 'CPU'
    else:
        scene.cycles.device = 'CPU'
os.makedirs({json.dumps(out_dir)}, exist_ok=True)
scene.render.filepath = os.path.join({json.dumps(out_dir)}, "frame_")
bpy.ops.render.render(animation=True)
"""


def atomic_write_json(path, payload):
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".afo_ckpt_", dir=parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def update_checkpoint_file(job_dir, manifest, state_override=None, extra=None):
    ckpt_path = os.path.join(job_dir, "checkpoints.json")
    completed = [c["chunkId"] for c in manifest.get("chunks", []) if c.get("status") == "COMPLETED"]
    failed = [c["chunkId"] for c in manifest.get("chunks", []) if c.get("status") == "FAILED"]
    payload = {
        "jobId": manifest.get("projectId"),
        "modelId": manifest.get("modelId"),
        "lifecycleState": state_override or manifest.get("lifecycleState", "RUNNING"),
        "completedChunks": completed,
        "failedChunks": failed,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    if extra:
        payload.update(extra)
    atomic_write_json(ckpt_path, payload)


def load_inference_config(job_dir, manifest):
    cfg_path = os.path.join(job_dir, "config", "inference_config.json")
    cfg = {
        "modelId": manifest.get("modelId", "triposr"),
        "fp16": True,
        "chunkSize": 4096,
        "mcResolution": 256,
        "tileSize": 512,
        "sdxlWidth": min(1024, int(manifest.get("resolutionX", 1024))),
        "sdxlHeight": min(1024, int(manifest.get("resolutionY", 1024))),
        "steps": 28,
        "seed": 42,
        "prompt": "Photorealistic studio product photograph, crisp softbox lighting, neutral cyclorama background, sharp focus",
        "negativePrompt": "cartoon, plastic, lowpoly, blurry, distorted, watermark",
        "outputFormat": manifest.get("outputFormat", "GLB"),
    }
    if os.path.isfile(cfg_path):
        with open(cfg_path, "r", encoding="utf-8") as f:
            user_cfg = json.load(f)
            if isinstance(user_cfg, dict):
                cfg.update(user_cfg)
    return cfg


def discover_input_images(job_dir):
    in_dir = os.path.join(job_dir, "input")
    imgs = []
    for ext in ("*.png", "*.jpg", "*.jpeg", "*.webp"):
        imgs.extend(sorted(glob.glob(os.path.join(in_dir, ext))))
    return imgs


def build_t4_model_execution_plan(model_id, job_dir, out_dir, cfg, input_images):
    """Builds exact reproducible T4 runner commands/parameters per verified model."""
    models_root = os.environ.get("AFO_MODELS_CACHE", "/content/models")
    first_img = input_images[0] if input_images else os.path.join(job_dir, "input", "reference.png")

    if model_id == "triposr":
        repo_dir = os.path.join(models_root, "TripoSR")
        return {
            "strategy": "official-repo-cli",
            "repo_url": "https://github.com/VAST-AI-Research/TripoSR.git",
            "repo_dir": repo_dir,
            "requires_input_image": True,
            "input_image": first_img,
            "primary_cmd": [
                sys.executable,
                os.path.join(repo_dir, "run.py"),
                first_img,
                "--output-dir",
                out_dir,
                "--model-save-format",
                "glb",
                "--mc-resolution",
                str(cfg.get("mcResolution", 256)),
                "--chunk-size",
                str(cfg.get("chunkSize", 4096)),
            ],
            "oom_fallback_cmd": [
                sys.executable,
                os.path.join(repo_dir, "run.py"),
                first_img,
                "--output-dir",
                out_dir,
                "--model-save-format",
                "glb",
                "--mc-resolution",
                "192",
                "--chunk-size",
                "2048",
            ],
            "expected_outputs": [os.path.join(out_dir, "0", "mesh.glb")],
        }

    if model_id == "stable-fast-3d":
        repo_dir = os.path.join(models_root, "stable-fast-3d")
        return {
            "strategy": "official-repo-cli",
            "repo_url": "https://github.com/Stability-AI/stable-fast-3d.git",
            "repo_dir": repo_dir,
            "requires_input_image": True,
            "requires_hf_token": True,
            "input_image": first_img,
            "primary_cmd": [
                sys.executable,
                os.path.join(repo_dir, "run.py"),
                first_img,
                "--output-dir",
                out_dir,
                "--texture-resolution",
                "1024",
                "--remesh_option",
                "none",
            ],
            "oom_fallback_cmd": [
                sys.executable,
                os.path.join(repo_dir, "run.py"),
                first_img,
                "--output-dir",
                out_dir,
                "--texture-resolution",
                "512",
                "--remesh_option",
                "none",
            ],
            "expected_outputs": [os.path.join(out_dir, "0", "mesh.glb")],
        }

    if model_id == "real-esrgan":
        repo_dir = os.path.join(models_root, "Real-ESRGAN")
        return {
            "strategy": "official-repo-cli",
            "repo_url": "https://github.com/xinntao/Real-ESRGAN.git",
            "repo_dir": repo_dir,
            "requires_input_image": True,
            "input_image": first_img,
            "primary_cmd": [
                sys.executable,
                os.path.join(repo_dir, "inference_realesrgan.py"),
                "-n",
                "RealESRGAN_x4plus",
                "-i",
                first_img,
                "-o",
                out_dir,
                "--tile",
                str(cfg.get("tileSize", 512)),
                "--fp32" if not cfg.get("fp16", True) else "--ext",
                "png",
            ],
            "oom_fallback_cmd": [
                sys.executable,
                os.path.join(repo_dir, "inference_realesrgan.py"),
                "-n",
                "RealESRGAN_x4plus",
                "-i",
                first_img,
                "-o",
                out_dir,
                "--tile",
                "256",
                "--ext",
                "png",
            ],
            "expected_outputs": [os.path.join(out_dir, f"{os.path.splitext(os.path.basename(first_img))[0]}_out.png")],
        }

    if model_id == "sdxl-base-1.0":
        return {
            "strategy": "diffusers-fp16-pipeline",
            "hf_repo": "stabilityai/stable-diffusion-xl-base-1.0",
            "requires_input_image": False,
            "width": int(cfg.get("sdxlWidth", 1024)),
            "height": int(cfg.get("sdxlHeight", 1024)),
            "steps": int(cfg.get("steps", 28)),
            "seed": int(cfg.get("seed", 42)),
            "prompt": cfg.get("prompt"),
            "negative_prompt": cfg.get("negativePrompt"),
            "expected_outputs": [os.path.join(out_dir, "concept_sdxl.png")],
        }

    # depth-anything-v2-small (Apache-2.0)
    return {
        "strategy": "transformers-depth-pipeline",
        "hf_repo": "depth-anything/Depth-Anything-V2-Small-hf",
        "requires_input_image": True,
        "input_image": first_img,
        "expected_outputs": [os.path.join(out_dir, "depth_map.png")],
    }


def _execute_cli_with_oom_fallback(exec_plan):
    repo_dir = exec_plan.get("repo_dir")
    if repo_dir and not os.path.isdir(repo_dir):
        os.makedirs(os.path.dirname(repo_dir), exist_ok=True)
        clone_res = subprocess.run(
            ["git", "clone", "--depth", "1", exec_plan["repo_url"], repo_dir],
            check=False,
            capture_output=True,
            text=True,
        )
        if clone_res.returncode != 0:
            raise RuntimeError(f"Failed cloning {exec_plan['repo_url']}: {clone_res.stderr[-300:]}")

    res = subprocess.run(exec_plan["primary_cmd"], check=False, capture_output=True, text=True)
    if res.returncode == 0:
        return {"retried_low_vram": False, "stdout_tail": res.stdout[-400:]}

    combined = (res.stderr + "\n" + res.stdout).lower()
    if "out of memory" in combined or "cuda error" in combined:
        free_gpu_memory()
        retry = subprocess.run(exec_plan["oom_fallback_cmd"], check=False, capture_output=True, text=True)
        if retry.returncode == 0:
            return {"retried_low_vram": True, "stdout_tail": retry.stdout[-400:]}
        raise RuntimeError(f"CUDA_OOM persisted after low-VRAM fallback: {retry.stderr[-400:]}")

    raise RuntimeError(f"Inference command failed (exit {res.returncode}): {res.stderr[-400:]}")


def _execute_sdxl_fp16(exec_plan, out_dir):
    import torch
    from diffusers import StableDiffusionXLPipeline

    pipe = StableDiffusionXLPipeline.from_pretrained(
        exec_plan["hf_repo"],
        torch_dtype=torch.float16,
        variant="fp16",
        use_safetensors=True,
    )
    pipe.enable_vae_slicing()
    pipe.enable_attention_slicing()
    pipe = pipe.to("cuda")
    try:
        generator = torch.Generator(device="cuda").manual_seed(exec_plan["seed"])
        try:
            image = pipe(
                prompt=exec_plan["prompt"],
                negative_prompt=exec_plan["negative_prompt"],
                width=exec_plan["width"],
                height=exec_plan["height"],
                num_inference_steps=exec_plan["steps"],
                generator=generator,
            ).images[0]
            retried = False
        except torch.cuda.OutOfMemoryError:
            free_gpu_memory()
            image = pipe(
                prompt=exec_plan["prompt"],
                negative_prompt=exec_plan["negative_prompt"],
                width=min(768, exec_plan["width"]),
                height=min(768, exec_plan["height"]),
                num_inference_steps=max(20, exec_plan["steps"] - 6),
                generator=generator,
            ).images[0]
            retried = True
        out_path = os.path.join(out_dir, "concept_sdxl.png")
        image.save(out_path)
        return {"retried_low_vram": retried, "generated_files": [out_path]}
    finally:
        del pipe
        free_gpu_memory()


def _execute_depth_anything_small(exec_plan, out_dir):
    from PIL import Image
    from transformers import pipeline

    pipe = pipeline(task="depth-estimation", model=exec_plan["hf_repo"], device=0)
    try:
        img = Image.open(exec_plan["input_image"]).convert("RGB")
        depth = pipe(img)["depth"]
        out_path = os.path.join(out_dir, "depth_map.png")
        depth.save(out_path)
        return {"retried_low_vram": False, "generated_files": [out_path]}
    finally:
        del pipe
        free_gpu_memory()


def run_t4_model_inference(manifest, job_dir, manifest_path=None, dry_run=False):
    model_id = manifest.get("modelId", "triposr")
    if model_id not in SUPPORTED_T4_INFERENCE_MODELS:
        raise RuntimeError(
            f"Model '{model_id}' is not enabled in the automated T4 inference runner (supported: {sorted(SUPPORTED_T4_INFERENCE_MODELS)})."
        )

    out_dir = os.path.join(job_dir, "output")
    os.makedirs(out_dir, exist_ok=True)
    cfg = load_inference_config(job_dir, manifest)
    input_images = discover_input_images(job_dir)
    exec_plan = build_t4_model_execution_plan(model_id, job_dir, out_dir, cfg, input_images)

    log_path = os.path.join(job_dir, "logs", "inference_plan.json")
    plan_record = {
        "model_id": model_id,
        "fp16": bool(cfg.get("fp16", True)),
        "single_job_isolation": True,
        "output_dir": out_dir,
        "dry_run": dry_run,
        "execution_plan": exec_plan,
        "input_images_found": input_images,
    }
    atomic_write_json(log_path, plan_record)

    if dry_run:
        print(f"[DRY-RUN] T4 inference planned for {model_id} -> {out_dir} (strategy={exec_plan['strategy']})")
        return True

    if exec_plan.get("requires_input_image") and not input_images:
        manifest["lifecycleState"] = "FAILED"
        if manifest_path:
            atomic_write_json(manifest_path, manifest)
        update_checkpoint_file(job_dir, manifest, state_override="FAILED", extra={"lastError": "MISSING_INPUT_IMAGE"})
        raise RuntimeError(f"Model '{model_id}' requires an input image under {os.path.join(job_dir, 'input')}.")

    free_gpu_memory()
    manifest["lifecycleState"] = "RUNNING"
    update_checkpoint_file(job_dir, manifest, state_override="RUNNING")

    try:
        if exec_plan["strategy"] == "official-repo-cli":
            exec_meta = _execute_cli_with_oom_fallback(exec_plan)
        elif exec_plan["strategy"] == "diffusers-fp16-pipeline":
            exec_meta = _execute_sdxl_fp16(exec_plan, out_dir)
        else:
            exec_meta = _execute_depth_anything_small(exec_plan, out_dir)

        produced = []
        for root, _, files in os.walk(out_dir):
            for fname in sorted(files):
                if fname == "output_checksums.json":
                    continue
                fpath = os.path.join(root, fname)
                ver = verify_output_artifact(fpath)
                produced.append({
                    "path": os.path.relpath(fpath, job_dir),
                    "sha256": sha256_file(fpath),
                    "verification": ver,
                })

        valid_count = sum(1 for p in produced if p["verification"].get("valid"))
        if valid_count == 0:
            raise RuntimeError("Inference completed without producing any valid output artifact.")

        atomic_write_json(os.path.join(out_dir, "output_checksums.json"), {
            "jobId": manifest.get("projectId"),
            "modelId": model_id,
            "artifacts": produced,
            "execMeta": exec_meta,
        })

        for ch in manifest.get("chunks", []):
            ch["status"] = "COMPLETED"
            ch["attempts"] = int(ch.get("attempts", 0)) + 1
        manifest["lifecycleState"] = "COMPLETED"
        if manifest_path:
            atomic_write_json(manifest_path, manifest)
        update_checkpoint_file(job_dir, manifest, state_override="COMPLETED", extra={"verifiedArtifacts": valid_count})
        print(f"[AFO-Colab] Verified {valid_count} output artifact(s) for '{model_id}' under {out_dir}")
        return True
    except Exception as exc:
        for ch in manifest.get("chunks", []):
            ch["status"] = "FAILED"
            ch["attempts"] = int(ch.get("attempts", 0)) + 1
            ch["lastError"] = "CUDA_OOM" if "oom" in str(exc).lower() else str(exc)[:180]
        manifest["lifecycleState"] = "FAILED"
        if manifest_path:
            atomic_write_json(manifest_path, manifest)
        update_checkpoint_file(job_dir, manifest, state_override="FAILED", extra={"lastError": str(exc)[:300]})
        raise
    finally:
        free_gpu_memory()


def main():
    parser = argparse.ArgumentParser(description="All-For-One Colab T4 GPU Worker")
    parser.add_argument("--manifest", required=True, help="Path to job_manifest.json or colab_job_manifest.json")
    parser.add_argument("--require-t4", action="store_true", help="Abort if NVIDIA GPU / T4 VRAM contract is missing")
    parser.add_argument("--dry-run", action="store_true", help="Print planned steps without running Blender/inference")
    args = parser.parse_args()

    manifest_path = os.path.abspath(args.manifest)
    job_dir = os.path.dirname(manifest_path)
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    manifest["_manifest_path"] = manifest_path

    if args.dry_run:
        hw_report = {
            "gpu": probe_gpu_vram_mb(),
            "ram": probe_system_ram_mb(),
            "job_type": manifest.get("jobType", "blender-render"),
            "dry_run": True,
        }
    else:
        hw_report = check_runtime_or_abort(manifest, require_t4=args.require_t4)

    print(f"[AFO-Colab] Hardware Probe: {hw_report}")

    if manifest.get("jobType") == "t4-model-inference":
        manifest.pop("_manifest_path", None)
        run_t4_model_inference(manifest, job_dir, manifest_path=manifest_path, dry_run=args.dry_run)
        return

    drive_root = manifest["driveProjectRoot"]
    blend_rel = manifest.get("blendRelPath", "")
    blend_path = os.path.join(drive_root, "input", os.path.basename(blend_rel))
    if not os.path.exists(blend_path):
        blend_path = os.path.join(drive_root, os.path.basename(blend_rel))
    if not os.path.exists(blend_path):
        blend_path = os.path.join(job_dir, os.path.basename(blend_rel))

    gpu_info = hw_report["gpu"]
    manifest.pop("_manifest_path", None)

    for chunk in manifest.get("chunks", []):
        if chunk.get("status") == "COMPLETED":
            print(f"[AFO-Colab] Skipping already completed chunk {chunk['chunkId']}")
            continue

        out_dir = chunk.get("remoteOutputDir") or os.path.join(drive_root, "output", "frames", chunk["shotId"])
        bpy_code = build_chunk_bpy_runner(
            blend_path=blend_path,
            out_dir=out_dir,
            frame_start=chunk["frameStart"],
            frame_end=chunk["frameEnd"],
            res_x=manifest.get("resolutionX", 1280),
            res_y=manifest.get("resolutionY", 720),
            samples=manifest.get("samples", 64),
            use_gpu=gpu_info.get("gpu_available", False),
        )

        if args.dry_run:
            print(f"[DRY-RUN] Chunk {chunk['chunkId']}: frames {chunk['frameStart']}..{chunk['frameEnd']} -> {out_dir}")
            continue

        free_gpu_memory()
        fd, script_tmp = tempfile.mkstemp(prefix="afo_chunk_", suffix=".py")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as sf:
                sf.write(bpy_code)
            res = subprocess.run(
                ["blender", "--background", "--factory-startup", "--python-exit-code", "1", "--python", script_tmp],
                check=False,
                capture_output=True,
                text=True,
            )
            chunk["attempts"] = int(chunk.get("attempts", 0)) + 1
            if res.returncode == 0:
                chunk["status"] = "COMPLETED"
                manifest["lifecycleState"] = "RUNNING"
            else:
                chunk["status"] = "FAILED"
                manifest["lifecycleState"] = "FAILED"
                oom = "out of memory" in (res.stderr + res.stdout).lower()
                chunk["lastError"] = "CUDA_OOM" if oom else f"EXIT_{res.returncode}"
            atomic_write_json(manifest_path, manifest)
            update_checkpoint_file(job_dir, manifest)
            if res.returncode != 0:
                print(f"[AFO-Colab] Chunk {chunk['chunkId']} failed: {res.stderr[-400:]}", file=sys.stderr)
                sys.exit(res.returncode)
        finally:
            if os.path.exists(script_tmp):
                os.unlink(script_tmp)
            free_gpu_memory()

    if not args.dry_run:
        all_done = all(c.get("status") == "COMPLETED" for c in manifest.get("chunks", []))
        manifest["lifecycleState"] = "COMPLETED" if all_done else "PARTIALLY_COMPLETED"
        atomic_write_json(manifest_path, manifest)
        update_checkpoint_file(job_dir, manifest)


if __name__ == "__main__":
    main()
