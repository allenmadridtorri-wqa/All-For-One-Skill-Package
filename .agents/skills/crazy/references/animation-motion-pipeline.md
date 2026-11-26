# Open-Source Animation, Motion Capture & Rigging Pipeline

Reference manual for `/crazydesigner` — zero-cost, open-source animation workflows for Blender, Unreal, Unity, Godot, and WebGL/Three.js (no paid APIs or proprietary subscriptions).

## 1. Open-Source Tooling Stack

| Stage | Open-Source Tools | Output / Integration |
| :--- | :--- | :--- |
| **Video-Based Motion Capture** | **FreeMoCap** (`freemocap.org`), **ToyXYZ RGB Mocap** (Python local pipeline), **ComfyUI-MotionCapture** (MediaPipe/MMPose pose extraction) | Extracts 3D joint trajectories from monocular or multi-cam `.mp4` locally into `.bvh` / `.fbx` / `.glb` with zero cloud cost. |
| **Character Rigging & Auto-Skinning** | **Mesh2Motion** (`mesh2motion.org`, MIT-licensed), **Blender Rigify** (built-in open-source modular metarigs) | Supports humanoids, quadrupeds, wings, and creatures with clean bone hierarchies and weight painting. |
| **Automatic Rig Evaluation** | Blender Python (`bpy`) Rig-Check script | Verifies bone naming conventions, symmetry, non-zero bone lengths, normalized vertex weights (sum = `1.0`, max `4` weights/vertex for real-time GPU skinning), and rest-pose A/T-pose alignment. |
| **Motion Retargeting** | **Blender Retargeting** (NLA / Bone Constraints / Rokoko-free community bone-mappers), **Godot `SkeletonProfileHumanoid`**, **Unity Humanoid Avatar**, **UE5 IK Rig + IK Retargeter** | Maps source mocap skeleton (`BVH`/`Mixamo` hierarchy) onto target game rig while preserving limb proportions. |
| **Animation Cleanup & Foot-Sliding Fix** | Blender Graph Editor + Python filters | Apply Butterworth/Gaussian smoothing on noisy optical joint tracks, lock foot IK plants during ground-contact frames, clamp knee/elbow pole angles against gimbal flips, and align root motion (`Z=0` ground plane). |
| **Animation Previews** | Blender OpenGL Viewport Render (`bpy.ops.render.opengl(animation=True)`) or engine preview turntable | Always render a lightweight wireframe + shaded turntable preview before exporting final `.glb`/`.fbx` to the game engine. |

## 2. Real-Time Engine Export Checklist

- Bake all constraints and IK before export (`NLA` / `Bake Action`).
- Limit GPU skinning to **<= 4 bone influences per vertex** and **<= 64–128 bones per skinned mesh** for broad hardware compatibility.
- Export `.glb` (glTF 2.0) for **Three.js / Godot / Bevy** and `.fbx` (Y-up/Z-up matched) for **Unreal 5 / Unity**, matching `1 unit = 1 meter`.
