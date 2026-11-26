# Engine Profile: Native C++ Game Engines (C++20/23)

- **Architecture:** Modular subsystem engine with explicit ownership (`Core`, `Memory`, `JobSystem`, `RHI`, `Physics`, `Audio`, `Gameplay`). Adopt Data-Oriented Design / SoA ECS where entity throughput demands it; use clear RAII handles and non-owning views (`std::span`, generational indices) everywhere else.
- **Project Structure:**
  - `engine/{core,memory,jobs,rhi,physics,audio,ecs}/`
  - `game/{gameplay,ai,world,ui}/`
  - `shaders/` (HLSL/GLSL compiled to SPIR-V / DXIL)
  - `tests/` (Catch2 / GoogleTest)
- **Rendering Pipeline:** Explicit Render Graph over Vulkan / DX12 / Metal / OpenGL 4.6, descriptor indexing, clustered forward+ or deferred PBR, ACES ODT, GPU timestamp queries for pass timing.
- **Physics Integration:** Jolt Physics (multi-threaded job integration) or Bullet3 at fixed `1/60s` or `1/120s` step, double-buffered transform snapshots for render interpolation.
- **Asset Management:** Binary cooked asset blobs (`mmap` or async IO queue) indexed by 64-bit asset IDs with generational handle tables.
- **Memory Management:** Frame-linear scratch arenas, fixed-block pool allocators, tagged heap arenas—zero `new`/`malloc` inside measured hot loops. Verify with AddressSanitizer (`-fsanitize=address,undefined`) and Tracy memory zones.
- **Performance Guidelines:** Profile with **Tracy**, **RenderDoc**, **PIX**, or **perf** before vectorizing or rewriting data layouts.
- **Testing:** Automated Catch2 / GoogleTest unit + physics determinism + soak tests under ASan/UBSan in CTest.
- **Build & Deploy:** CMake + Ninja presets (`Debug-ASan`, `RelWithDebInfo`, `Release`), offline shader compilation to SPIR-V.
