"""All-For-One V3 Reusable Blender Export Script.
Run headless:
  blender --background scene.blend --python assets/blender/export_engine_asset.py -- --engine=godot --out=exports/asset.glb
"""
import os
import sys
import bpy


def parse_args():
    if "--" not in sys.argv:
        return {"engine": "threejs", "out": "exports/asset.glb"}
    argv = sys.argv[sys.argv.index("--") + 1 :]
    parsed = {"engine": "threejs", "out": "exports/asset.glb"}
    for item in argv:
        if item.startswith("--engine="):
            parsed["engine"] = item.split("=", 1)[1].lower()
        elif item.startswith("--out="):
            parsed["out"] = item.split("=", 1)[1]
    return parsed


def main():
    opts = parse_args()
    engine = opts["engine"]
    out_path = os.path.abspath(opts["out"])
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # Apply transforms cleanly before exporting
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
