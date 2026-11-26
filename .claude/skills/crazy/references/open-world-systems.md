# Open-World Systems, Missions & Diegetic HUD

Reference manual for `/crazymaker` — building cohesive open-world loops, day/night atmosphere, and Rockstar-grade UI discipline.

## 1. World Streaming & Spatial Cell Grid

- Divide large worlds into uniform square cells (e.g., `64m x 64m` or `128m x 128m`) keyed by integer `(cx, cz)`.
- Activate full detail, AI, and physics within `3x3` cells around the player; keep distant cells as merged low-poly silhouettes or billboards; unload inactive cells cleanly.

## 2. Dynamic Time-of-Day & Weather Coupling

- Drive sun elevation, Kelvin light color, sky zenith/horizon gradient, fog density, puddle wetness (`roughness -> 0.04`), wind amplitude, and ambient audio stems from normalized `timeOfDay ∈ [0, 1)` + `weatherState` (`CLEAR`, `OVERCAST`, `RAIN`, `STORM`).
- Transition smoothly over `15–45s`—never snap skyboxes or light colors instantaneously.

## 3. Mission & Wanted State Machines

- Model missions as deterministic directed graphs:
  `AVAILABLE -> BRIEFING -> ACTIVE_OBJECTIVE[i] -> EXTRACTION -> COMPLETED | FAILED (instant checkpoint retry)`.
- Model law/faction heat with escalating tiers (`0` calm -> `1` investigate -> `2` pursuit -> `3` tactical containment) with clear line-of-sight cooldown timers so evading pursuit feels fair and thrilling.

## 4. Diegetic HUD & Zero-Friction Entry

- **Start Flow:** Live 3D camera orbit over the active world behind a clean title overlay; single-click or `?autostart=1` transitions straight into gameplay.
- **Minimal HUD:** Keep `85%+` of the viewport unobstructed. Use crisp corner telemetry (compass/minimap, subtle objective tag, contextual interaction prompt `[E]`) and pause/restart overlays that never reload the page.
