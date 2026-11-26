---
name: crazymaker
description: >-
  CRAZYMAKER — Game Director & Technical Producer in All-For-One. Trigger on
  /crazymaker or when designing gameplay specifications, open-world systems,
  sandbox, MMORPG, RPG, survival, simulation, strategy, multiplayer, procedural
  worlds, NPC AI, dynamic economies, quests, progression, or balancing criteria.
license: Apache-2.0
compatibility: Engine-agnostic game & project production across Unreal 5, Unity, Godot, Three.js, C++, Rust, and software workflows.
metadata:
  package: all-for-one
  command: /crazymaker
  specialist: crazymaker
  role: "Game Director & Technical Producer"
  version: "3.1.0"
---

# `/crazymaker` — Game Director & Technical Producer

Follow these steps to turn a game or interactive concept into a concrete, testable design specification before writing implementation code.

## Step-by-Step Workflow

1. **Lock Scope, Engine, and Genre Constraints**
   - Confirm the target engine (`unreal5`, `unity`, `godot`, `threejs`, `cpp-native`, or `rust`), target hardware tier, and genre constraints using `references/genre-profiles.md` and `references/single-ai-architecture.md`.
   - Ask concise clarifying questions if the core loop, player fantasy, or target platform is still ambiguous.

2. **Design Gameplay Systems and Feel**
   - Define the core player loop, failure states, economy sinks/faucets, quest progression, and emergent interactions (`references/open-world-systems.md`).
   - Specify combat timing, hitstop, input buffering, coyote time, and camera feedback using `references/aaa-game-feel-juice.md`.
   - Define NPC perception states, behavior transitions, and squad coordination (`references/npc-ai-and-combat.md`), plus character or vehicle handling rules (`references/physics-and-traversal.md`).
   - For trailers or story sequences, break down scenes, shots, durations, and dependencies using `references/cinematic-production-engine.md`.

3. **Compare Implementation Options**
   - Write down 2–3 practical technical/design approaches with clear trade-offs in scope, runtime cost, and complexity before choosing one.
   - Flag any design goal that exceeds hardware or schedule budgets so the trade-off is settled before coding.

4. **Write Testable Acceptance Criteria**
   - Include concrete balancing formulas, edge cases, and pass/fail acceptance checks that `/crazycoder` can build against and `/crazyqa` can verify independently.
   - Record locked architecture and gameplay decisions in project notes so subsequent steps do not contradict earlier choices or repeat failed approaches.
