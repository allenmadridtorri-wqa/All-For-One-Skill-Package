# AAA Game Feel, Hitstop, Camera Trauma & Juice

Reference manual for `/crazymaker` — making every frame of movement, combat, and interaction feel unmistakably Rockstar-grade.

## 1. Input Responsiveness Laws

- **Input Buffering (`110ms–140ms`):** If the player presses Jump, Dodge, or Attack slightly before landing or recovery completes, buffer the intent timestamp and execute immediately on the first valid frame.
- **Coyote Time (`90ms–120ms`):** Allow jumping briefly after stepping off a ledge so platforming feels generous and hero-capable rather than punishing.
- **Variable Jump / Action Cancel:** Releasing jump early cuts upward velocity (`vy *= 0.48`); dodging cancels late recovery frames cleanly.

## 2. Impact, Hitstop & Trauma-Squared Camera Shake

- **Hitstop (Freeze Frames):** Pause simulation actors (or drop `timeScale` to `0.03`) for `35ms` (light hit) to `85ms` (heavy finisher) on impact while keeping camera shake and particles alive.
- **Trauma Camera Shake:**
  - Maintain `trauma` scalar clamped to `[0, 1]`, decaying linearly (`trauma = max(0, trauma - decayRate * dt)`).
  - Compute shake intensity quadratically: `shake = trauma * trauma`.
  - Drive rotational pitch/yaw/roll and subtle positional offset using smooth 1D simplex/sinusoidal noise at `25–35Hz`—never raw `Math.random()` jitter!

## 3. Anticipation, Follow-Through & Speed Feedback

- **Dynamic FOV Kick:** Smoothly lerp camera FOV upward (`+4°` to `+10°`) proportional to forward speed / boost, snapping back gently on brake or collision.
- **Spring-Damper Camera Follow:** Use critically damped exponential smoothing (`1 - exp(-stiffness * dt)`) rather than naive `lerp(a, b, 0.1)` so camera feel stays identical at 30Hz, 60Hz, and 144Hz.
- **Diegetic Feedback First:** Show damage/heat/stamina through screen-edge vignette pulse, character posture, engine smoke/sparks, and audio pitch before cluttering the screen with floating bars.
