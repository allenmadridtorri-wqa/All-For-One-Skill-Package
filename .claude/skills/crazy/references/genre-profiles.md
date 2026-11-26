# CRAZYMAKER Genre Design Profiles & Balancing Contracts

Reference manual for `/crazymaker` — mandatory design specifications, system dependencies, balancing laws, and pre-code acceptance criteria per genre.

## 1. Genre Profiles Matrix

| Genre | Core Systems | Critical Balancing Laws | Key Acceptance Tests |
| :--- | :--- | :--- | :--- |
| **Open-World** | Cell streaming, dynamic weather/time, traversal, faction heat, world events | Landmark sightlines every `150–300m`; travel-to-reward cadence `< 45s` | Seamless cell boundary crossing; quest trigger & reset invariants |
| **Sandbox** | Systemic physics/chemistry interactions, modular building, emergent tools | Clear input/reaction rules (`fire -> wood -> heat`) over scripted one-offs | Emergent rule combinations stay bounded and deterministic |
| **MMORPG** | Server-authoritative combat, sharding/zones, guild/party, auction economy | Strict currency faucets vs. sinks (`repair/tax/crafting >= 85%` of faucet) | Anti-duplication atomic inventory transactions; load/latency sync |
| **RPG** | Stats/attributes, skill trees, quest DAGs, loot tables, dialogue state | Diminishing returns on stacked modifiers; clear build archetypes | Quest state recovery on save/load; damage formula bounds |
| **Survival** | Hunger/stamina/temp meters, gathering, crafting tree, shelter/day-night threat | Recovery loops faster than drain; early-game grace window (`>= 3 min`) | Resource depletion, crafting recipe validation, death/respawn state |
| **Simulation / Life** | Needs/schedules, NPC relationships, time acceleration, autonomous routines | Utility scoring prevents oscillation ("thrashing" between two needs) | 24-hour AI schedule stability; `1x/4x/16x` speed determinism |
| **Strategy** | Economy/tech tree, fog-of-war, unit counters, pathfinding/formations | Hard & soft counter triangles (`A > B > C > A`); readable resource telemetry | Deterministic lockstep/command replay; pathfinding fallback |
| **Multiplayer** | Lobby/matchmaking, replication, lag compensation, anti-cheat validation | Server-authoritative hit/economy state; fairness under `100–180ms` RTT | Desync reconciliation; disconnect/reconnect graceful recovery |

## 2. Cross-Cutting Systems

- **Procedural Worlds:** Seeded deterministic generation (`biome -> heightfield -> hydrology -> road/POI -> scatter`), guaranteeing playable spawn clearance and path connectivity.
- **Dynamic Economies:** Model every item/currency flow as explicit `Source -> Sink` equations; enforce integer/fixed-point arithmetic for currency to prevent float drift.
- **Quest & Progression Systems:** Directed acyclic state graphs with prerequisite predicates, fail-safe recovery (never soft-lock if a quest item is dropped or an NPC dies), and clear XP/power curves.
- **Emergent Gameplay:** Favor orthogonal physical/elemental tags (`FLAMMABLE`, `CONDUCTIVE`, `HEAVY`) interacting cleanly rather than brittle hardcoded pairwise exceptions.
