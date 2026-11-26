#!/usr/bin/env python3
"""All-For-One V3.1 — Persistent Google Colab / Remote GPU Blender Render Worker.

Reads `colab_job_manifest.json`, detects GPU/VRAM (`nvidia-smi`), configures Blender
Cycles (GPU with safe CPU fallback), renders frame-range chunks incrementally into
persistent Google Drive storage, and writes atomic checkpoint progress after every chunk.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile


def probe_gpu_vram_mb():
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            text=True,
            timeout=5,
        ).strip()
        if out:
            name, mem = [x.strip() for x in out.split(",", 1)]
            return {"gpu_available": True, "gpu_name": name, "vram_mb": int(float(mem))}
    except Exception:
        pass
    return {"gpu_available": False, "gpu_name": None, "vram_mb": 0}


def build_chunk_bpy_runner(blend_path, out_dir, frame_start, frame_end, res_x, res_y, samples, use_gpu):
    return f"""import bpy, os
bpy.ops.wm.open_mainfile(filepath={json.dumps(blend_path)})
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.render.resolution_x = {int(res_x)}
scene.render.resolution_y = {int(res_y)}
scene.render.image_settings.file_format = 'PNG'
scene.frame_start = {int(frame_start)}
scene.frame_end = {int(frame_end)}
if hasattr(scene, 'cycles'):
    scene.cycles.samples = {int(samples)}
    scene.cycles.use_denoising = True
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


def main():
    parser = argparse.ArgumentParser(description="All-For-One Colab GPU Blender Worker")
    parser.add_argument("--manifest", required=True, help="Path to colab_job_manifest.json")
    parser.add_argument("--dry-run", action="store_true", help="Print planned chunk commands without running Blender")
    args = parser.parse_args()

    manifest_path = os.path.abspath(args.manifest)
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    gpu_info = probe_gpu_vram_mb()
    print(f"[AFO-Colab] Probe: {gpu_info}")

    drive_root = manifest["driveProjectRoot"]
    blend_path = os.path.join(drive_root, os.path.basename(manifest["blendRelPath"]))
    if not os.path.exists(blend_path):
        blend_path = os.path.join(os.path.dirname(manifest_path), os.path.basename(manifest["blendRelPath"]))

    for chunk in manifest.get("chunks", []):
        if chunk.get("status") == "COMPLETED":
            print(f"[AFO-Colab] Skipping already completed chunk {chunk['chunkId']}")
            continue

        out_dir = chunk.get("remoteOutputDir") or os.path.join(drive_root, "frames", chunk["shotId"])
        bpy_code = build_chunk_bpy_runner(
            blend_path=blend_path,
            out_dir=out_dir,
            frame_start=chunk["frameStart"],
            frame_end=chunk["frameEnd"],
            res_x=manifest.get("resolutionX", 1920),
            res_y=manifest.get("resolutionY", 1080),
            samples=manifest.get("samples", 64),
            use_gpu=gpu_info["gpu_available"],
        )

        if args.dry_run:
            print(f"[DRY-RUN] Chunk {chunk['chunkId']}: frames {chunk['frameStart']}..{chunk['frameEnd']} -> {out_dir}")
            continue

        fd, script_tmp = tempfile.mkstemp(prefix="afo_chunk_", suffix=".py")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as sf:
                sf.write(bpy_code)
            res = subprocess.run(
                ["blender", "--background", "--factory-startup", "--python-exit-code", "1", "--python", script_tmp],
                check=False,
            )
            chunk["attempts"] = int(chunk.get("attempts", 0)) + 1
            chunk["status"] = "COMPLETED" if res.returncode == 0 else "FAILED"
            atomic_write_json(manifest_path, manifest)
            if res.returncode != 0:
                print(f"[AFO-Colab] Chunk {chunk['chunkId']} failed with code {res.returncode}", file=sys.stderr)
                sys.exit(res.returncode)
        finally:
            if os.path.exists(script_tmp):
                os.unlink(script_tmp)


if __name__ == "__main__":
    main()
