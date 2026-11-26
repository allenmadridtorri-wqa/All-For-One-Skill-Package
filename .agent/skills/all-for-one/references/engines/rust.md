# Engine Profile: Rust Game Development (Bevy / wgpu)

- **Architecture:** **Bevy ECS** (Entities, Components, Systems, Resources, `FixedUpdate` vs `Update` schedules) or custom `wgpu` + `rapier3d` crate workspace with clean crate boundaries (`game_core` isolated from rendering).
- **Project Structure:**
  - `crates/game_core/` (pure components, state machines, simulation logic)
  - `crates/game_render/` (`wgpu`/Bevy PBR materials, WGSL shaders, post-FX)
  - `crates/game_audio/` (`kira` / `rodio` spatial audio)
  - `src/main.rs`, `Cargo.toml`, `assets/`
- **Rendering Pipeline:** `wgpu` (Vulkan/DX12/Metal/WebGPU) or Bevy PBR `StandardMaterial` with `Tonemapping::AcesFitted`, WGSL custom `Material` shaders, and GPU instancing.
- **Physics Integration:** `avian3d` or `bevy_rapier3d` inside `FixedUpdate` schedule (`Time<Fixed>`), spatial queries via `SpatialQuery`.
- **Asset Management:** Bevy `AssetServer` typed `Handle<T>` with async background loading and state-gated `OnEnter(GameState::Playing)` readiness checks.
- **Memory Management:** Leverage Rust ownership, reuse pre-allocated `Vec` buffers (`clear()` retaining capacity) in hot systems, enforce `cargo clippy -- -D warnings`, and audit any `unsafe` blocks with `cargo miri`.
- **Performance Guidelines:** Profile with `puffin`, `tracy`, or `cargo-flamegraph` before tuning query filters or parallel system scheduling.
- **Testing:** `cargo test --workspace` (headless `MinimalPlugins` ECS schedule tests + pure math unit tests).
- **Build & Deploy:** `cargo build --release` (with `lto = "thin"` and `codegen-units = 1` in release profile) + asset bundle verification.
