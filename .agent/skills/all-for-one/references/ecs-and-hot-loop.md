# ECS Architecture & Zero-GC Hot-Loop Engineering

Reference manual for `/crazycoder` — sustaining locked 60–120 FPS with zero garbage-collection hitches.

## 1. The Zero-Allocation Hot-Loop Law

Inside any function running every frame (`tick`, `update`, `fixedUpdate`, `render`, `useFrame`):
- **FORBIDDEN:**
  - `new THREE.Vector3()`, `new THREE.Matrix4()`, `new THREE.Quaternion()`, `new THREE.Color()`, `new Raycaster()`
  - Object/array literals `{ x, y, z }`, `[...arr]`, `arr.map()`, `arr.filter()`, `Object.keys()`, `Object.entries()`
  - String template formatting for debug text every frame or React `setState()` at 60Hz
- **REQUIRED:**
  - Pre-allocated module-level scratch math instances (`_v1`, `_v2`, `_m1`, `_q1` from `assets/ecs/math-scratch.ts`).
  - Pre-allocated `TypedArray` Structure-of-Arrays (SoA) buffers (`Float32Array` for `posX`, `posY`, `posZ`, `velX`, `velY`, `velZ`, `Uint32Array` for bitmasks) or swap-remove dense entity arrays.
  - Pre-allocated `ObjectPool<T>` (`assets/ecs/object-pool.ts`) for particles, projectiles, hit events, and audio emitters.

## 2. Clean ECS / System Execution Order

Run systems in deterministic order each fixed step:
1. `InputSystem` — samples raw keyboard/mouse/gamepad flags into buffered intent structs.
2. `AISystem` — updates perception timers and steering targets (time-sliced across frames for large crowds).
3. `PhysicsMovementSystem` — integrates forces, resolves terrain/collider constraints.
4. `CombatAndInteractionSystem` — evaluates hits, hitstop, triggers, and mission state transitions.
5. `TransformSyncSystem` (Render frame) — interpolates `prev -> curr` into GPU matrices / `InstancedMesh` buffers (`instanceMatrix.needsUpdate = true`).
6. `AudioAndVFXSystem` — updates listener coordinates, spatial emitters, and pooled particles.
7. `HUDThrottleSystem` — emits UI snapshots at `10–15Hz` or only when discrete values change.
