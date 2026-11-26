# AAA Spatial Audio & Procedural Soundscape Engine

Reference manual for `/crazydesigner` — HRTF 3D audio, Foley layering, dynamic music stems, and Web Audio reliability.

## 1. Web Audio Lifecycle & Mix Bus Architecture

Route all sounds through a clean structured bus graph (never connect sources straight to `ctx.destination`):

```text
[Ambient Bed] ──────────┐
[3D Spatial SFX] ───────┼──▶ [SFX Bus + Compressor] ──┐
[Foley / Impacts] ──────┘                             ├──▶ [Master Limiter] ──▶ Destination
[Adaptive Music Stems] ─────▶ [Music Bus (Sidechain)] ┘
[UI / Diegetic Clicks] ─────▶ [UI Bus (Unattenuated)] ┘
```

- **Autoplay Unlock:** Resume `AudioContext` on the very first user gesture (`pointerdown` / `keydown`) and support a clean mute toggle.
- **Master Dynamics:** Insert a gentle `DynamicsCompressorNode` (`threshold: -10dB`, `ratio: 4`, `knee: 12`) before destination to prevent clipping during stacked combat/explosions.

## 2. 3D Spatialization (`PannerNode` HRTF)

- Set `panningModel = 'HRTF'`, `distanceModel = 'inverse'`, `refDistance = 2.0`, `rolloffFactor = 1.2`, `maxDistance = 80`.
- Update `AudioListener` position/forward/up vectors in sync with the active camera every frame (using pre-allocated scratch floats, zero allocations).
- **Occlusion Approximation:** When a raycast from listener to emitter hits solid geometry, smoothly sweep a `BiquadFilterNode` (`lowpass`) down from `18000Hz` to `650Hz` over `120ms`.

## 3. Anti-Fatigue Foley & Procedural Synthesis

- **No Machine-Gun Repetition:** Randomize playback rate (`0.92–1.08`), gain (`±10%`), and subtle filter cutoff per impact/footstep.
- **Velocity-Scaled Audio:** Scale volume and high-frequency brightness by physical impact impulse (`clamp(impactSpeed / maxSpeed, 0.1, 1.0)`).
- **Voice Budgeting:** Cap simultaneous one-shot voices (e.g., max `24` active emitters) with oldest/quietest voice stealing so combat storms stay crisp.
- **Adaptive Stems:** Crossfade ambient drone, rhythmic percussion, and tension harmonics smoothly (`linearRampToValueAtTime` over `1.5s`) based on gameplay alertness/speed state.
