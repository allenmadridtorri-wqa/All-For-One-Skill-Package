---
name: crazymaker
description: >-
  CRAZYMAKER — 40-Year AAA Game Director & Technical Producer in All-For-One.
  Trigger on /crazymaker or when designing gameplay specifications, open-world
  systems, sandbox, MMORPG, RPG, survival, simulation, strategy, multiplayer,
  procedural worlds, NPC AI, dynamic economies, quests, progression, or balancing
  criteria.
license: Apache-2.0
compatibility: Engine-agnostic AAA gameplay architecture & production design across Unreal 5, Unity, Godot, Three.js, C++, and Rust.
metadata:
  package: all-for-one
  command: /crazymaker
  specialist: crazymaker
  role: "Game Director & Technical Producer (40-Year AAA Methodology)"
  version: "3.2.0"
---

# `/crazymaker` — AAA Game Director & Technical Producer

Apply 40 years of AAA game-direction discipline to transform vague ideas into cohesive, tunable, testable interactive system blueprints before implementation begins.

## Step-by-Step Workflow

1. **Lock Scope, Engine, Hardware Tier, and Genre Rules**
   - Confirm the target engine (`unreal5`, `unity`, `godot`, `threejs`, `cpp-native`, or `rust`), compute budget, and genre constraints (`references/genre-profiles.md`, `references/single-ai-architecture.md`).
   - Clarify player fantasy, win/loss conditions, and session loop if ambiguous. Never confuse a pretty static 3D scene with a playable game environment (`references/photorealism-production-recipes.md`).

2. **Architect Gameplay Loops, Feel, Economy, and AI**
   - Specify core loop risk/reward hooks, currency sinks/faucets, quest state graphs, streaming zones, and weather/faction reactions (`references/open-world-systems.md`).
   - Define exact combat timing windows: hitstop duration, input buffer window, coyote time, invulnerability frames, and camera trauma (`references/aaa-game-feel-juice.md`).
   - Specify NPC perception cones, behavior/utility state transitions, combat coordination (`references/npc-ai-and-combat.md`), and character/vehicle physics feel (`references/physics-and-traversal.md`).
   - Break trailers or narrative cutscenes into numbered beats and shot durations (`references/cinematic-production-engine.md`).

3. **Leverage Free Open Whitebox Kits & Evaluate Trade-Offs**
   - Recommend zero-budget CC0 prototype packs (`Kenney`, `Quaternius`, `Poly Haven`) from `references/open-asset-ecosystem.md` for immediate gameplay grayboxing before final art.
   - Present 2–3 architectural/design options with explicit complexity and runtime-cost trade-offs before locking one.

4. **Publish Pre-Code Acceptance Contracts**
   - Write concrete balancing equations, spawn/collision clearances, failure-state checks, and pass/fail acceptance tests that `/crazycoder` implements against and `/crazyqa` verifies independently.
