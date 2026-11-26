# Engine Profile: Unity / C#

- **Architecture:** Data-driven `ScriptableObject` configs + modular `MonoBehaviour` presenters isolated behind `.asmdef` Assembly Definitions. Adopt **Unity DOTS / Entities + Burst + Jobs** only for measured simulation bottlenecks (e.g. thousands of projectiles/boids/units).
- **Project Structure:**
  - `Assets/_Project/Scripts/{Core,Gameplay,AI,Audio,UI}/` (each with `.asmdef`)
  - `Assets/_Project/{Materials,Prefabs,Scenes,Audio,Settings,Tests/{EditMode,PlayMode}}/`
- **Rendering Pipeline:** **URP** (broad cross-platform/WebGL/mobile) or **HDRP** (desktop/console high-fidelity), Post-Processing Volume with ACES Tonemapping, Shader Graph + HLSL custom functions, SRP Batcher + GPU Instancing.
- **Physics Integration:** PhysX inside `FixedUpdate()`, Layer Collision Matrix pruning, `Physics.RaycastNonAlloc` / `OverlapSphereNonAlloc` with pre-allocated hit buffers.
- **Asset Management:** **Unity Addressables** (`Addressables.LoadAssetAsync<T>`) with strict `Addressables.Release(handle)` on teardown. Avoid `Resources.Load` in shipping builds.
- **Memory Management:** Zero LINQ, `foreach` over boxed interfaces, or `new WaitForSeconds` inside `Update()`/`FixedUpdate()`. Use `UnityEngine.Pool.ObjectPool<T>` and `StringBuilder` / cached strings for HUD updates.
- **Performance Guidelines:** Profile with **Unity Profiler**, **Frame Debugger**, and **Memory Profiler** before optimizing. Bake static occlusion culling & lightmaps where dynamic GI isn't needed.
- **Testing:** Unity Test Framework **EditMode** tests (pure C# logic/math) and **PlayMode** tests (scene/physics/lifecycle integration) runnable via `unity -batchmode -runTests`.
- **Build & Deploy:** Build Addressables content first, then `BuildPipeline.BuildPlayer` using IL2CPP for release targets.
