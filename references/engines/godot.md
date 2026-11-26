# Engine Profile: Godot 4 / GDScript / C++

- **Architecture:** Compositional Scene Tree ("call down via methods, signal up via typed signals"), `Resource` (`.tres`) data definitions, and node-based State Machines. Use **GDExtension (C++)** when profiling shows GDScript CPU bottlenecks.
- **Project Structure:**
  - `scenes/{levels,characters,props,ui}/`
  - `scripts/{core,systems,entities,autoload}/`
  - `assets/{models,textures,shaders,audio}/`
  - `tests/` (GUT or GdUnit4)
- **Rendering Pipeline:** **Forward+** (desktop PBR, SDFGI/VoxelGI, VolumetricFog, `Environment` ACES Filmic tonemapping) or **Compatibility** renderer for low-spec/web. Author custom effects in Godot Shading Language (`shader_type spatial` / `particles`).
- **Physics Integration:** Godot Physics / Jolt Physics inside `_physics_process(delta)`, `CharacterBody3D.move_and_slide()`, `PhysicsDirectSpaceState3D.intersect_ray()` with `PhysicsRayQueryParameters3D`.
- **Asset Management:** `ResourceLoader.load_threaded_request()` / `load_threaded_get()` for async level streaming; preload small UI/audio resources intentionally.
- **Memory Management:** Call `queue_free()` cleanly, disconnect external signals in `_exit_tree()`, and reuse pooled bullet/VFX nodes instead of rapid `instantiate()`/`queue_free()` churn.
- **Performance Guidelines:** Use `MultiMeshInstance3D` for foliage/crowds/debris and `VisibleOnScreenNotifier3D` for off-screen AI/animation throttling. Measure with Godot's built-in CPU/GPU Monitors before optimizing.
- **Testing:** Headless CLI test suite (`godot --headless --path . -s addons/gut/gut_cmdln.gd`) for deterministic gameplay, save/load, and collision checks.
- **Build & Deploy:** Export templates configured in `export_presets.cfg`, built via `godot --headless --export-release "<Preset>" <Output>`.
