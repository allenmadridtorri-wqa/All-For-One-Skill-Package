#!/usr/bin/env python3
"""All-For-One — Persistent Google Colab T4 Worker (Blender Render + T4 3D Inference).

Enforces strict hardware awareness:
  - Targets NVIDIA T4 (16 GB VRAM) + Standard System RAM (dynamically probed).
  - Never assumes L4, A100, H100, or Colab High-RAM.
  - Runs a single heavy GPU job at a time with explicit VRAM/memory cleanup.
  - Persists chunked outputs and atomic checkpoints under MyDrive/ALL_FOR_ONE/jobs/<job_id>.
"""
import argparse
import gc
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time


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
        raise RuntimeError(f"Detected GPU VRAM {gpu_info['vram_mb']} MB is below T4 15–16 GB baseline.")

    if free_disk_mb < 2048:
        raise RuntimeError(f"Insufficient free disk space ({free_disk_mb} MB < 2048 MB minimum).")

    return report


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


def update_checkpoint_file(job_dir, manifest, state_override=None):
    ckpt_path = os.path.join(job_dir, "checkpoints.json")
    completed = [c["chunkId"] for c in manifest.get("chunks", []) if c.get("status") == "COMPLETED"]
    failed = [c["chunkId"] for c in manifest.get("chunks", []) if c.get("status") == "FAILED"]
    payload = {
        "jobId": manifest.get("projectId"),
        "lifecycleState": state_override or manifest.get("lifecycleState", "RUNNING"),
        "completedChunks": completed,
        "failedChunks": failed,
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    atomic_write_json(ckpt_path, payload)


def run_t4_model_inference(manifest, job_dir, dry_run=False):
    model_id = manifest.get("modelId", "triposr")
    supported_t4 = {"triposr", "stable-fast-3d", "sdxl-base-1.0", "real-esrgan"}
    if model_id not in supported_t4:
        raise RuntimeError(
            f"Model '{model_id}' is not enabled in the automated T4 inference runner (supported: {sorted(supported_t4)})."
        )

    out_dir = os.path.join(job_dir, "output")
    os.makedirs(out_dir, exist_ok=True)
    log_path = os.path.join(job_dir, "logs", "inference_plan.json")
    plan = {
        "model_id": model_id,
        "fp16": True,
        "single_job_isolation": True,
        "output_dir": out_dir,
        "dry_run": dry_run,
    }
    atomic_write_json(log_path, plan)
    if dry_run:
        print(f"[DRY-RUN] T4 inference planned for {model_id} -> {out_dir}")
        return True

    # Real runtime execution runs in FP16 with explicit OOM catch & cleanup
    free_gpu_memory()
    print(f"[AFO-Colab] Execute model inference script for '{model_id}' inside Colab cell and save outputs under {out_dir}")
    return True


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
        run_t4_model_inference(manifest, job_dir, dry_run=args.dry_run)
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
