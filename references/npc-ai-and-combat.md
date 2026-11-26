# NPC AI, Sensory Perception & Combat Choreography

Reference manual for `/crazymaker` — making AI allies, crowds, and enemies feel intelligent, reactive, and fun to fight.

## 1. Dual-Sense Perception (Vision + Hearing)

- **Vision Cone:** Check distance (`<= sightRange`), dot-product angle (`cos(halfFov)`), and line-of-sight raycast (blocked by walls/smoke). Fill an `awareness ∈ [0, 1]` meter over `0.4s–1.2s` so detection feels organic rather than omniscient.
- **Acoustic Events:** Footsteps, gunshots, engine revs, and explosions emit radial sound events `(position, radius, priority)` that switch nearby NPCs into `INVESTIGATE`.

## 2. Tactical Behavior & Squad Spacing

- **State Machine:** `IDLE -> PATROL -> INVESTIGATE -> COMBAT (ATTACK / FLANK / RECOVER) -> SEARCH -> RESET`.
- **Attack Token / Slot System:** Never let 8 enemies swing simultaneously. Issue a bounded pool of `activeAttackTokens` (e.g., `2` melee / `3` ranged) while remaining enemies strafe, flank, or hold cover at staggered distances (`4m–12m`).
- **Steering & Crowd Separation:** Combine goal-seeking vector + local obstacle whisker avoidance + soft separation force (`1 / dist²`) so NPCs flow around corners and never stack inside each other.

## 3. Fair Telegraphing & Readable Silhouettes

- Every high-damage enemy attack needs a `350ms–650ms` readable telegraph (posture windup, glint/laser cue, distinctive audio chirp) giving skilled players a window to dodge, parry, or take cover.
- Maintain distinct movement silhouettes between civilians, light scouts, heavy bruisers, and vehicles.
