# Game Engine Asset Pipelines (Blender -> Unreal, Unity, Godot, Three.js)

Reference guide for exporting, checking, and verifying 3D assets across engines.

## 1. Engine Export Matrix

| Target Engine | Preferred Format | Up / Forward Axis | Scale Rule | Skin & Material Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Unreal Engine 5** | `.fbx` (or Interchange `.glb`) | `+Z` Up / `-Y` Forward | `1 unit = 1m` (`FBX_SCALE_UNITS`) | `mesh_smooth_type='FACE'`, `add_leaf_bones=False`, up to 8 bone influences |
| **Unity** | `.fbx` (or glTFast `.glb`) | `+Y` Up / `-Z` Forward | `1 unit = 1m`, freeze scale `[1,1,1]` | Max 4 bone influences/vertex, MikkTSpace tangents |
| **Godot 4** | `.glb` (glTF 2.0 binary) | `+Y` Up / `-Z` Forward | `1 unit = 1m`, applied transforms | Packed `metallicRoughness` textures, verified animation track names |
| **Three.js / Web** | `.glb` (glTF 2.0 binary) | `+Y` Up / `-Z` Forward | `1 unit = 1m`, applied transforms | Power-of-two textures (`<= 2048px`), minimal material slots, KTX2/Draco optional |

## 2. Mandatory Pre-Export & Post-Export Checks
- **Scale & Orientation:** Apply all object transforms (`bpy.ops.object.transform_apply(scale=True)`); flag non-unit `[1,1,1]` node scales.
- **Mesh & UVs:** Verify `POSITION`, `NORMAL`, and `TEXCOORD_0` attributes exist on every mesh primitive (unless unlit/non-textured procedural shader explicitly waives UVs).
- **Materials & Textures:** Verify PBR `pbrMetallicRoughness` bindings and resolve texture paths cleanly without absolute local machine drive paths.
- **Rig & Animation:** Confirm armature root bone, bone influence counts, and non-zero keyframe ranges before import verification.
