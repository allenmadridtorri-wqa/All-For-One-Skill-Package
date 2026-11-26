# Networking, Multiplayer Sync, Multithreading & Persistence

Reference manual for `/crazycoder` — distributed state synchronization, safe concurrency, and versioned save systems.

## 1. Multiplayer Synchronization Architecture

- **Authoritative Server Law:** Never trust client-reported damage, currency, or inventory mutations. Clients send timestamped **inputs**, server validates and broadcasts **authoritative state snapshots**.
- **Client-Side Prediction & Reconciliation:** Apply local player movement immediately for zero-latency feel, store `(inputSeq, predictedState)` in a ring buffer, and reconcile smoothly when authoritative server ack arrives.
- **Entity Interpolation:** Render remote players/NPCs slightly in the past (`~100ms` interpolation buffer) between two server snapshots rather than snapping positions.
- **Bandwidth Discipline:** Quantize positions/quaternions (smallest-three 48-bit quaternions), send delta-compressed updates, and prioritize nearby/relevant entities via spatial interest management.

## 2. Multithreading & Job Systems

- Isolate CPU-heavy work (pathfinding batches, procedural chunk meshing, compression, physics broadphase) onto worker threads / job systems (`Web Workers` with `Transferable` `ArrayBuffer`s in TS, `JobSystem`/Burst in Unity, `TaskGraph` in UE5, `rayon`/Bevy compute pools in Rust).
- Never mutate shared render-scene graphs directly from background threads; exchange immutable/double-buffered typed arrays across explicit sync points.

## 3. Serialization, Save Systems & Error Recovery

- **Versioned Schemas:** Every save file / network packet starts with `{ magic, schemaVersion, checksum }`. Provide pure migration functions `migrateV1ToV2(data)` so player saves survive updates.
- **Atomic Writes:** Write save data to `<file>.tmp`, flush, verify checksum, and rename atomically (`fs.renameSync` / IndexedDB transaction) so crashes mid-save never corrupt existing progress.
- **Corrupt-State Recovery:** Validate deserialized payloads strictly; fall back cleanly to backup slot or safe defaults with explicit user warning rather than crashing.
