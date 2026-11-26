# Character Physics, Traversal & Vehicle Handling

Reference manual for `/crazymaker` — tuning grounded movement, slope handling, and responsive arcade-sim vehicles.

## 1. Fixed-Timestep Physics Integration

- Run physics at `FIXED_DT = 1 / 60` (or `1 / 120` for high-speed vehicles) using `assets/ecs/fixed-timestep.ts`.
- Interpolate render transforms (`lerp(prevPos, currPos, alpha)`) so visuals remain silky smooth at any monitor refresh rate.

## 2. Character Controller Rules

- **Capsule / Cylinder Swept Grounding:** Snap cleanly down gentle slopes, block steep inclines (`> 48°`), and support automatic step-up (`<= 0.35m` curbs/stairs).
- **Acceleration Curves:** Crisp ground acceleration (`10–14x` target speed/sec), snappier deceleration/braking (`14–18x`), and reduced air control (`0.35x`) so movement feels weighty without feeling sluggish.
- **Momentum Preservation:** Preserve sprint/slide velocity smoothly into jumps and transitions.

## 3. Arcade-Sim Vehicle Tuning

- **4-Wheel Raycast Suspension:** Cast vertical suspension rays at each wheel hub; apply damped Hooke spring force (`F = k * compression - c * compressionVelocity`).
- **Lateral Grip & Drift:** Separate forward velocity and lateral velocity in vehicle local space. Apply high lateral friction (`grip ~ 0.85–0.95`) during normal cornering, dropping smoothly to controlled drift (`grip ~ 0.45–0.60`) on handbrake or high slip angle.
- **Weight Transfer & Visual Polish:** Pitch chassis nose down under braking, squat rear under acceleration, roll outward into corners, spin wheels by `distance / wheelRadius`, and emit tire smoke + skid audio when slip exceeds threshold.
