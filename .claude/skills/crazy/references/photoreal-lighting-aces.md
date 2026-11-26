# Photorealistic Lighting & ACES Filmic Pipeline

Reference manual for `/crazydesigner` — physically grounded lighting, color management, and optical exposure.

## 1. Color Management & Tone Mapping (Mandatory)

In Three.js / WebGPU / custom engines:
- **Output Color Space:** `SRGBColorSpace` (`gl.outputColorSpace = THREE.SRGBColorSpace`).
- **Tone Mapping:** `ACESFilmicToneMapping` (`gl.toneMapping = THREE.ACESFilmicToneMapping`).
- **Exposure:** Calibrate `toneMappingExposure` between `0.85` and `1.25` depending on scene EV100.
- **Shadow Type:** `PCFSoftShadowMap` (or `VSMShadowMap` for softer outdoor sun transitions) with hardware antialiasing or FXAA/SMAA post-pass.

## 2. Physical Color Temperatures (Kelvin Reference)

Never use pure saturated RGB lights (`#ff0000`, `#0000ff`) for natural scenes. Anchor lights in Kelvin:

| Light Source | Kelvin | Approx Hex | Typical Intensity Ratio |
| :--- | :--- | :--- | :--- |
| Candle / Ember | `1900K` | `#FF9329` | Local accent (`0.8–2.0`) |
| Sodium Streetlamp | `2200K` | `#FFA84B` | Practical pool (`2.0–6.0`) |
| Warm Tungsten Indoor | `2700K–3200K` | `#FFC58F` | Practical key (`1.5–4.0`) |
| Golden Hour Sun | `3500K–4500K` | `#FFD8B0` | Key `3.0–5.0` |
| Noon Direct Sun | `5500K–5800K` | `#FFF6EA` | Key `3.5–6.0` |
| Overcast Sky | `6500K–7500K` | `#DCE8FF` | Hemisphere sky `0.8–1.4` |
| Deep Shade / Sky Bounce | `9500K–12000K` | `#B2CEFF` | Fill / ambient `0.3–0.7` |
| Moonlight | `4100K` (desaturated blue-silver perception) | `#9EB8E0` | Key `0.4–1.0` |

## 3. Three-Layer Real-Time Lighting Rig

1. **Image-Based Lighting (IBL / PMREM):**
   - Generate a procedural or HDRI `PMREMGenerator` environment map so metals and wet surfaces reflect realistic sky-ground gradients rather than black voids.
   - Tune `scene.environmentIntensity` (`0.6–1.2`) independently of direct lights.
2. **Directional Key Light (Sun / Moon):**
   - Warm/cool temperature contrast against the fill/sky light (`3:1` to `8:1` cinematic contrast ratio).
   - Fit shadow camera frustum tightly around the active gameplay zone (`left/right/top/bottom` ±30–60m, `near: 0.5`, `far: 180`).
   - Shadow map size `2048x2048` on desktop (`1024x1024` adaptive fallback), `bias = -0.0004`, `normalBias = 0.025`.
3. **Practical & Bounce Lights:**
   - Use `HemisphereLight(skyColor, groundBounceColor, intensity)` for natural ground-bounce tinting.
   - Add localized `PointLight` / `SpotLight` emitters strictly with physically plausible `decay = 2` and bounded `distance` so shader cost stays low.

## 4. Eliminating "CG Plastic" Look

- **Rim / Kicker Separation:** Place a grazing backlight or sky rim so dark hero silhouettes separate cleanly from dark backgrounds.
- **Light-to-Fog Coupling:** Match `FogExp2` or custom height-fog color to the horizon scattering color (`sunDirection` dot `viewDir` Mie glow).
- **Contact Shadows:** Add grounded ambient occlusion or subtle contact shadow decals beneath vehicles, characters, and props so objects never look pasted onto terrain.
