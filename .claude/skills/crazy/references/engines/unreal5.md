# Engine Profile: Unreal Engine 5 / C++

- **Architecture:** Modular C++20 gameplay modules (`UGameInstanceSubsystem`, `UWorldSubsystem`, Gameplay Ability System `GAS`) paired with thin Blueprint data assets. Use **Mass Entity (ECS)** strictly for high-density crowds/traffic (>500 entities); keep standard actors in `AActor` + `UActorComponent`.
- **Project Structure:**
  - `Source/<Project>/{Core,Gameplay,AI,UI}/{Public,Private}/`
  - `Content/<Domain>/{Maps,Characters,Materials,Niagara,Audio,Data}/`
  - `Config/DefaultEngine.ini`, `DefaultGame.ini`, `DefaultInput.ini`
- **Rendering Pipeline:** Lumen GI + Virtual Shadow Maps (VSM) + Nanite for high-poly static geometry (or traditional LODs + Lightmass where target hardware requires), ACES Filmic tone curve, HLSL Custom Material nodes & Niagara GPU particle systems.
- **Physics Integration:** Chaos Physics (`UPrimitiveComponent`, Physics Assets `PhAT`, `UPhysicalMaterial` for surface audio/friction), optional Async Physics Tick for vehicle/projectile determinism.
- **Asset Management:** `UAssetManager` with `FPrimaryAssetId`, `TSoftObjectPtr<T>` / `TSoftClassPtr<T>`, and `FStreamableManager` async loading. Never `ConstructorHelpers` or `LoadObject` inside gameplay ticks.
- **Memory Management:** `UPROPERTY()` for GC-tracked `UObject` references, `TWeakObjectPtr` for non-owning actor links, `TUniquePtr`/`TSharedPtr` for pure C++ objects, Niagara/Actor object pools for transient effects.
- **Performance Guidelines:** Set `PrimaryActorTick.bCanEverTick = false` by default; use timers/delegates. Profile with **Unreal Insights** (`stat unit`, `stat gpu`, `stat memory`) before optimizing. Use **World Partition** + HLODs for open worlds.
- **Testing:** `IMPLEMENT_SIMPLE_AUTOMATION_TEST` / `IMPLEMENT_COMPLEX_AUTOMATION_TEST` via `UnrealEditor-Cmd -ExecCmds="Automation RunTests ..."` in `-NullRHI` CI, plus Gauntlet soak tests.
- **Build & Deploy:** `UnrealBuildTool (UBT)` compilation + `RunUAT BuildCookRun -project=... -targetplatform=Win64|Linux -package -archive`.
