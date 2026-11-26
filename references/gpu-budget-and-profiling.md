# GPU Draw-Call Budgets, Profiling & Memory Lifecycle

Reference manual for `/crazycoder` — squeezing maximum visual fidelity inside tight frame-time budgets.

## 1. Real-Time Frame Budgets

| Target Platform | Frame Budget | Max Draw Calls | Active Triangles | Shadow Casters |
| :--- | :--- | :--- | :--- | :--- |
| WebGL2 / WebGPU Desktop (60 FPS) | `16.6ms` (aim `< 10ms`) | `< 150` (ideal `< 80`) | `< 1.5M` | `1` directional + `0–2` spot |
| Software WebGL / Headless QA | `33ms` adaptive | `< 100` | `< 400k` | `1` (`1024x1024`) |
| Native Desktop AAA | `8.3ms–16.6ms` | `< 1,500` | `< 10M` (LOD'd) | Cascaded CSM |

## 2. Batching, Instancing & LOD Rules

- **Instanced Rendering First:** Trees, grass blades, streetlights, rubble, crowds, bullets, and particles MUST use `InstancedMesh` (one draw call for thousands of objects) with per-instance color/matrix buffers.
- **Material & Geometry Sharing:** Never instantiate duplicate `Material` or `BufferGeometry` objects inside loops; maintain a centralized asset registry keyed by material/mesh ID.
- **DPR Clamping:** Set `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))` (drop to `1.0` automatically if rolling average frame time exceeds `22ms` or under software WebGL).

## 3. Zero-Leak Disposal Lifecycle

On scene unmount or level transition, traverse the scene and release every GPU allocation:
- Call `geometry.dispose()` on every unique `BufferGeometry`.
- Call `material.dispose()` and `.dispose()` on all attached `Texture` maps (`map`, `normalMap`, `roughnessMap`, `metalnessMap`, `emissiveMap`, `envMap`).
- Dispose `WebGLRenderTarget`, `EffectComposer` passes, `PMREMGenerator`, and close/suspend `AudioContext` + cancel `requestAnimationFrame` handles.
