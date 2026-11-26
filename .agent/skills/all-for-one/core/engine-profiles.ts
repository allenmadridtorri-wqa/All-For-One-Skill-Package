export type EngineId = 'unreal5' | 'unity' | 'godot' | 'threejs' | 'cpp-native' | 'rust';

export interface EngineProfile {
  id: EngineId;
  displayName: string;
  primaryLanguage: string;
  recommendedArchitecture: string;
  projectStructure: string[];
  renderingPipeline: string;
  physicsIntegration: string;
  assetManagement: string;
  memoryManagement: string;
  performanceGuidelines: string[];
  testingRequirements: string[];
  buildAndDeploy: string[];
  forbiddenForeignPatterns: Array<{ pattern: RegExp; foreignEngine: string; message: string }>;
  referenceDoc: string;
}

export const ENGINE_PROFILES: Record<EngineId, EngineProfile> = {
  unreal5: {
    id: 'unreal5',
    displayName: 'Unreal Engine 5 / C++',
    primaryLanguage: 'C++20 + Blueprints (thin orchestration)',
    recommendedArchitecture:
      'Modular Gameplay Ability System (GAS) / Actor-Component or Mass Entity (ECS) strictly for large crowds (>500 actors). Keep tick disabled unless strictly required.',
    projectStructure: [
      'Source/<Project>/Public/ & Private/ split by Gameplay, AI, UI, Core modules',
      'Content/<Domain>/ (Maps, Characters, Materials, Niagara, Audio)',
      'Config/ (DefaultEngine.ini, DefaultGame.ini, DefaultInput.ini)',
    ],
    renderingPipeline:
      'Lumen GI + Nanite virtualized micropolygon geometry (where hardware-supported) or baked Lightmass + Virtual Shadow Maps (VSM), ACES tone curve, Niagara GPU VFX.',
    physicsIntegration:
      'Chaos Physics with async physics tick option, Physics Asset (PhAT) ragdolls, Physical Materials for surface audio/friction.',
    assetManagement:
      'PrimaryAssetIds + AssetManager async soft-object loading (TSoftObjectPtr / TSoftClassPtr) to prevent synchronous hitches.',
    memoryManagement:
      'UPROPERTY() GC tracking for UObjects, TSharedPtr/TUniquePtr for pure C++ types, pool transient projectiles/VFX via Niagara/Actor pools.',
    performanceGuidelines: [
      'Disable PrimaryActorTick.bCanEverTick by default; prefer timers, delegates, and event-driven state.',
      'Profile with Unreal Insights (stat unit, stat gpu, stat scenerendering) before optimizing.',
      'Use HLODs and World Partition streaming for large open worlds.',
    ],
    testingRequirements: [
      'Unreal Automation Framework (IMPLEMENT_SIMPLE_AUTOMATION_TEST / Functional Tests) in headless NullRHI CI.',
      'Gauntlet automated soak & memory-leak tests for long sessions.',
    ],
    buildAndDeploy: [
      'Generate project files and compile via UnrealBuildTool (UBT).',
      'Cook & package via RunUAT BuildCookRun -targetplatform=Win64|Linux|Mac.',
    ],
    forbiddenForeignPatterns: [
      {
        pattern: /\bfrom\s+['"]three['"]|\bTHREE\.\w+/,
        foreignEngine: 'threejs',
        message: 'Three.js WebGL APIs cannot be used in an Unreal Engine 5 C++ project.',
      },
      {
        pattern: /\bMonoBehaviour\b|\bUnityEngine\b/,
        foreignEngine: 'unity',
        message: 'Unity C# APIs cannot be used in Unreal Engine 5.',
      },
      {
        pattern: /\bextends\s+Node3D\b|\b_physics_process\b/,
        foreignEngine: 'godot',
        message: 'Godot GDScript APIs cannot be used in Unreal Engine 5.',
      },
    ],
    referenceDoc: 'references/engines/unreal5.md',
  },
  unity: {
    id: 'unity',
    displayName: 'Unity / C#',
    primaryLanguage: 'C# (.NET Standard 2.1 / Burst + Jobs where hot)',
    recommendedArchitecture:
      'ScriptableObject-driven data + modular MonoBehaviour presenters; use Unity DOTS/ECS + Burst only for measured high-entity-count bottlenecks.',
    projectStructure: [
      'Assets/_Project/Scripts/{Core,Gameplay,AI,Audio,UI} with Assembly Definitions (.asmdef)',
      'Assets/_Project/{Art,Materials,Prefabs,Scenes,Audio,Settings}',
      'Packages/manifest.json',
    ],
    renderingPipeline:
      'URP (cross-platform/mobile/web) or HDRP (high-end desktop/console), ACES Tonemapping via Volume Profile, Shader Graph + HLSL custom functions.',
    physicsIntegration:
      'PhysX (Built-in/URP) in FixedUpdate() with Layer Collision Matrix pruning and NonAlloc raycast/overlap queries.',
    assetManagement:
      'Addressables with explicit AsyncOperationHandle release discipline; avoid Resources.Load in production.',
    memoryManagement:
      'Zero per-frame LINQ/closures/boxing in Update(), Physics.RaycastNonAlloc, UnityEngine.Pool.ObjectPool<T>, StringBuilder for HUD.',
    performanceGuidelines: [
      'Profile with Unity Profiler + Frame Debugger + Memory Profiler before optimizing.',
      'Enable SRP Batcher and GPU Instancing on repeated materials.',
      'Use Assembly Definitions (.asmdef) to isolate tests and reduce domain-reload compile times.',
    ],
    testingRequirements: [
      'Unity Test Framework EditMode tests for pure C# simulation and PlayMode tests for scene/physics integration.',
    ],
    buildAndDeploy: [
      'Verify scripting backend (IL2CPP for release) and Addressables content build before player build.',
    ],
    forbiddenForeignPatterns: [
      {
        pattern: /\bfrom\s+['"]three['"]|\bTHREE\.\w+/,
        foreignEngine: 'threejs',
        message: 'Three.js APIs cannot be used in Unity C#.',
      },
      {
        pattern: /\bUCLASS\b|\bUPROPERTY\b|\bAActor\b/,
        foreignEngine: 'unreal5',
        message: 'Unreal Engine macros/classes cannot be used in Unity C#.',
      },
    ],
    referenceDoc: 'references/engines/unity.md',
  },
  godot: {
    id: 'godot',
    displayName: 'Godot 4 / GDScript / C++',
    primaryLanguage: 'GDScript (typed) + GDExtension C++ for heavy compute',
    recommendedArchitecture:
      'Scene-tree composition ("call down, signal up") with Resource (.tres) data containers and lightweight state-machine nodes.',
    projectStructure: [
      'scenes/{levels,characters,props,ui}/',
      'scripts/{core,systems,entities,autoload}/',
      'assets/{models,textures,shaders,audio}/',
      'tests/ (GUT or GdUnit4)',
    ],
    renderingPipeline:
      'Forward+ (desktop PBR, SDFGI/VoxelGI, volumetric fog, ACES Filmic Environment) or Mobile/Compatibility renderer for lightweight targets.',
    physicsIntegration:
      'Godot Physics / Jolt Physics inside _physics_process(delta); CharacterBody3D move_and_slide(), PhysicsDirectSpaceState3D queries.',
    assetManagement:
      'ResourceLoader.load_threaded_request() for async scene/level streaming; typed .tres data definitions.',
    memoryManagement:
      'Explicit queue_free() lifecycle, disconnect dynamic signals on exit, pool frequent projectiles/VFX nodes.',
    performanceGuidelines: [
      'Use MultiMeshInstance3D for foliage, crowds, and repeated props.',
      'Monitor Godot Profiler (CPU/GPU frame time, draw calls, video RAM) before micro-optimizing.',
    ],
    testingRequirements: [
      'Headless CI tests via godot --headless using GUT or GdUnit4 for gameplay/physics invariants.',
    ],
    buildAndDeploy: [
      'Configure export_presets.cfg and run godot --headless --export-release.',
    ],
    forbiddenForeignPatterns: [
      {
        pattern: /\bfrom\s+['"]three['"]|\bTHREE\.\w+/,
        foreignEngine: 'threejs',
        message: 'Three.js APIs cannot be used in Godot GDScript/C++.',
      },
      {
        pattern: /\bMonoBehaviour\b|\bUCLASS\b/,
        foreignEngine: 'unity/unreal5',
        message: 'Unity/Unreal classes cannot be used in Godot.',
      },
    ],
    referenceDoc: 'references/engines/godot.md',
  },
  threejs: {
    id: 'threejs',
    displayName: 'Three.js / TypeScript',
    primaryLanguage: 'TypeScript + GLSL / WGSL',
    recommendedArchitecture:
      'Strict 4-layer separation: pure simulation core/ (zero DOM/WebGL imports), Web Audio spatial bus, WebGPU/WebGL2 renderer mounted once, thin throttled UI.',
    projectStructure: [
      'src/core/ (pure math, physics, AI, ECS, state machines)',
      'src/render/ (renderer, shaders, instanced meshes, post-FX)',
      'src/audio/ (Web Audio HRTF spatialization)',
      'src/ui/ (HUD & overlays)',
    ],
    renderingPipeline:
      'WebGPURenderer (with WebGL2 fallback), ACESFilmicToneMapping, SRGBColorSpace, PMREM HDRI IBL, InstancedMesh batching, EffectComposer thresholded bloom.',
    physicsIntegration:
      'Fixed-timestep accumulator (1/60s) with Rapier WASM or custom swept-capsule / BVH collision in pure TypeScript.',
    assetManagement:
      'GLTFLoader + DRACOLoader + KTX2Loader with centralized asset registry and ref-counted cache.',
    memoryManagement:
      'Zero per-frame Vector3/Matrix4/closure allocations in update loops; ObjectPool<T>; full .dispose() traversal on scene teardown.',
    performanceGuidelines: [
      'Clamp pixelRatio <= 2 and scale shadows/post-FX down dynamically on software WebGL.',
      'Run scripts/check-hot-loop.ts and scripts/audit-pbr-scene.ts in CI.',
    ],
    testingRequirements: [
      'node:test unit tests on src/core/ via tsx --test, plus headless Playwright WebGL visual & console error checks.',
    ],
    buildAndDeploy: [
      'tsc --noEmit && vite build with static asset bundle verification.',
    ],
    forbiddenForeignPatterns: [
      {
        pattern: /\bUCLASS\b|\bUPROPERTY\b|\bAActor\b/,
        foreignEngine: 'unreal5',
        message: 'Unreal Engine C++ macros cannot be used in Three.js TypeScript.',
      },
      {
        pattern: /\bMonoBehaviour\b|\bSerializeField\b/,
        foreignEngine: 'unity',
        message: 'Unity C# attributes cannot be used in Three.js TypeScript.',
      },
      {
        pattern: /\bextends\s+Node3D\b|\b_physics_process\b/,
        foreignEngine: 'godot',
        message: 'Godot GDScript syntax cannot be used in Three.js TypeScript.',
      },
    ],
    referenceDoc: 'references/engines/threejs.md',
  },
  'cpp-native': {
    id: 'cpp-native',
    displayName: 'Native C++ Game Engine (C++20/23)',
    primaryLanguage: 'Modern C++20/23 + Vulkan / DX12 / Metal / OpenGL',
    recommendedArchitecture:
      'Data-oriented architecture (SoA/ECS or flat packed arenas where cache locality matters) with explicit subsystem ownership and job-system multithreading.',
    projectStructure: [
      'engine/{core,memory,jobs,rhi,physics,audio,ecs}/',
      'game/{gameplay,ai,world,ui}/',
      'shaders/ (HLSL/GLSL -> SPIR-V)',
      'tests/ (Catch2 / GoogleTest)',
    ],
    renderingPipeline:
      'Explicit RHI / Vulkan / DX12 render graph, bindless descriptors, clustered forward+ or deferred PBR, ACES ODT, GPU timestamp queries.',
    physicsIntegration:
      'Jolt Physics or Bullet3 with deterministic fixed step, fiber/job parallel broadphase, double-buffered transform state.',
    assetManagement:
      'Binary cooked asset packs with mmap / async IO ring buffer and handle-based resource tables.',
    memoryManagement:
      'Custom arena/frame/pool allocators (zero malloc/new in frame loop), RAII GPU buffer wrappers, AddressSanitizer + Valgrind/Tracy verification.',
    performanceGuidelines: [
      'Profile with Tracy / RenderDoc / PIX / perf before rewriting hot loops.',
      'Align hot SIMD/SoA structs to 64-byte cache lines only after cache-miss profiling.',
    ],
    testingRequirements: [
      'Catch2 or GoogleTest unit & soak tests compiled with ASan/UBSan enabled.',
    ],
    buildAndDeploy: [
      'CMake + Ninja presets (Debug-ASan, RelWithDebInfo, Release) + SPIR-V shader compilation step.',
    ],
    forbiddenForeignPatterns: [
      {
        pattern: /\bfrom\s+['"]three['"]|\bTHREE\.\w+/,
        foreignEngine: 'threejs',
        message: 'Three.js JS APIs cannot be used in a native C++ engine.',
      },
      {
        pattern: /\bMonoBehaviour\b|\bextends\s+Node3D\b/,
        foreignEngine: 'unity/godot',
        message: 'Unity/Godot managed APIs cannot be used in native C++.',
      },
    ],
    referenceDoc: 'references/engines/cpp-native.md',
  },
  rust: {
    id: 'rust',
    displayName: 'Rust Game Development (Bevy / Custom wgpu)',
    primaryLanguage: 'Rust (stable) + WGSL',
    recommendedArchitecture:
      'Bevy ECS (Entities, Components, Systems, Resources, Schedules) or modular wgpu + rapier3d crate architecture with strict borrow-friendly data flow.',
    projectStructure: [
      'crates/game_core/ (pure deterministic logic & components)',
      'crates/game_render/ (wgpu/Bevy PBR, WGSL shaders)',
      'crates/game_audio/ (kira / rodio spatial audio)',
      'src/main.rs + assets/',
    ],
    renderingPipeline:
      'wgpu (Vulkan/DX12/Metal/WebGPU) or Bevy PBR pipeline with ACES filmic tonemapping, WGSL shaders, instanced batching.',
    physicsIntegration:
      'FixedUpdate schedule with Rapier3D (`bevy_rapier3d` or `avian3d`) at 60Hz deterministic steps.',
    assetManagement:
      'Typed `Handle<T>` asset server with async background loading and hot-reload in dev.',
    memoryManagement:
      'Ownership & arena/vec reuse (`clear()` retaining capacity), `SmallVec` only where measured, clippy + miri checks for unsafe FFI.',
    performanceGuidelines: [
      'Profile with Tracy / cargo-flamegraph / puffin before optimizing queries or introducing unsafe.',
      'Batch Bevy Mesh3d / Instanced draws and minimize ChangeDetection churn.',
    ],
    testingRequirements: [
      'cargo test unit & ECS schedule integration tests + cargo clippy -- -D warnings.',
    ],
    buildAndDeploy: [
      'cargo build --release (LTO configured in profile.release) and cross-target packaging.',
    ],
    forbiddenForeignPatterns: [
      {
        pattern: /\bfrom\s+['"]three['"]|\bTHREE\.\w+/,
        foreignEngine: 'threejs',
        message: 'Three.js JS APIs cannot be used in Rust.',
      },
      {
        pattern: /\bUCLASS\b|\bMonoBehaviour\b|\bextends\s+Node3D\b/,
        foreignEngine: 'unreal/unity/godot',
        message: 'Foreign engine APIs cannot be used in Rust.',
      },
    ],
    referenceDoc: 'references/engines/rust.md',
  },
};

export function getEngineProfile(engine: EngineId): EngineProfile {
  return ENGINE_PROFILES[engine];
}

export function detectEngineFromText(text: string): EngineId | null {
  const lower = text.toLowerCase();
  if (/\bunreal\b|\bue5\b|\blumen\b|\bnanite\b|\bniagara\b|\baactor\b|\buclass\b/.test(lower)) {
    return 'unreal5';
  }
  if (/\bunity\b|\bmonobehaviour\b|\burp\b|\bhdrp\b|\bscriptableobject\b|\b\.asmdef\b/.test(lower)) {
    return 'unity';
  }
  if (/\bgodot\b|\bgdscript\b|\bnode3d\b|\bcharacterbody3d\b|\bgdextension\b/.test(lower)) {
    return 'godot';
  }
  if (/\bbevy\b|\bwgpu\b|\brust\b|\bcargo\.toml\b|\bwgsl\b/.test(lower)) {
    return 'rust';
  }
  if (/\bvulkan\b|\bdx12\b|\bdirectx\b|\bcmake\b|\bc\+\+\b|\bcpp\b|\bjolt\b/.test(lower)) {
    return 'cpp-native';
  }
  if (/\bthree\.js\b|\bthreejs\b|\bwebgl\b|\bwebgpu\b|\btypescript\b|\bvite\b/.test(lower)) {
    return 'threejs';
  }
  return null;
}

export interface EngineCompatibilityViolation {
  engine: EngineId;
  foreignEngine: string;
  message: string;
}

export function validateEngineCompatibility(
  targetEngine: EngineId,
  content: string,
): EngineCompatibilityViolation[] {
  const profile = ENGINE_PROFILES[targetEngine];
  const violations: EngineCompatibilityViolation[] = [];
  for (const rule of profile.forbiddenForeignPatterns) {
    if (rule.pattern.test(content)) {
      violations.push({
        engine: targetEngine,
        foreignEngine: rule.foreignEngine,
        message: rule.message,
      });
    }
  }
  return violations;
}
