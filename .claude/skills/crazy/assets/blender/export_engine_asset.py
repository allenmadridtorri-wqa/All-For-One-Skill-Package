"""All-For-One V3.1 Reusable Blender Export Script with Workspace Confinement.
Run headless:
  blender --background scene.blend --python assets/blender/export_engine_asset.py -- --engine=godot --out=exports/asset.glb --base-dir=.
"""
import os
import sys
import bpy


def parse_args():
    if "--" not in sys.argv:
        return {"engine": "threejs", "out": "exports/asset.glb", "base_dir": os.getcwd()}
    argv = sys.argv[sys.argv.index("--") + 1 :]
    parsed = {"engine": "threejs", "out": "exports/asset.glb", "base_dir": os.getcwd()}
    for item in argv:
        if item.startswith("--engine="):
            parsed["engine"] = item.split("=", 1)[1].lower()
        elif item.startswith("--out="):
            parsed["out"] = item.split("=", 1)[1]
        elif item.startswith("--base-dir="):
            parsed["base_dir"] = item.split("=", 1)[1]
    return parsed


def resolve_confined_output(base_dir: str, rel_or_abs: str) -> str:
    if "\0" in rel_or_abs or "\n" in rel_or_abs or "\r" in rel_or_abs:
        raise ValueError("Unsafe characters in output path.")
    real_base = os.path.realpath(base_dir)
    candidate = rel_or_abs if os.path.isabs(rel_or_abs) else os.path.join(real_base, rel_or_abs)
    real_out = os.path.realpath(candidate)
    if real_out != real_base and not real_out.startswith(real_base + os.sep):
        raise ValueError(f"Output path escapes workspace base_dir: {real_out}")
    return real_out


def main():
    opts = parse_args()
    engine = opts["engine"]
    out_path = resolve_confined_output(opts["base_dir"], opts["out"])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # Apply scale transforms cleanly before exporting
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    if out_path.lower().endswith(".fbx"):
        is_ue = engine == "unreal5"
        bpy.ops.export_scene.fbx(
            filepath=out_path,
            use_selection=False,
            apply_scale_options="FBX_SCALE_UNITS",
            axis_forward="-Y" if is_ue else "-Z",
            axis_up="Z" if is_ue else "Y",
            mesh_smooth_type="FACE",
            use_mesh_modifiers=True,
            add_leaf_bones=False,
        )
    else:
        fmt = "GLTF_SEPARATE" if out_path.lower().endswith(".gltf") else "GLB"
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format=fmt,
            export_apply=True,
            export_yup=True,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
            export_animations=True,
        )
    print(f"Exported {engine} asset to {out_path}")


if __name__ == "__main__":
    main()
