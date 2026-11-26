# PBR Material Calibration & Surface Storytelling

Reference manual for `/crazydesigner` — physically accurate dielectric/metallic authoring and procedural surface detail.

## 1. Fundamental PBR Rules (Energy Conservation)

- **Albedo Bounds (sRGB):**
  - Darkest natural surface (fresh charcoal, wet basalt, rubber tire): `0.02–0.05` (`#1A1A1D` to `#2E2E32`), **never** `#000000`.
  - Brightest natural dielectric (fresh snow, chalk, white paint): `0.78–0.88` (`#DCDCE0` to `#E8E8EC`), **never** `#FFFFFF`.
- **Metalness Binary Discipline:**
  - Pure dielectrics (stone, wood, concrete, skin, foliage, plastic, painted matte surfaces): `metalness = 0.0`.
  - Bare conductive metals (steel, copper, gold, chrome, titanium): `metalness = 0.90–1.0`, with reflectance color stored in `baseColor`.
  - Only use intermediate `metalness` (`0.2–0.7`) on transition masks (rust/dust partially covering bare metal).

## 2. Measured Material Calibration Table

| Material | Albedo (sRGB Hex) | Roughness | Metalness | Extra PBR / Shader Notes |
| :--- | :--- | :--- | :--- | :--- |
| Dry Asphalt | `#2F3136` | `0.78–0.92` | `0.0` | Micro-aggregate bump + tire-track roughness variation |
| Rain-Wet Asphalt | `#191B1F` | `0.06–0.28` | `0.0` | Puddle mask drives `roughness -> 0.03` + darkens albedo ~45% |
| Weathered Concrete | `#8A8882` | `0.72–0.90` | `0.0` | Macro grime gradient near ground (`y < 0.6m`) |
| Brushed Steel | `#B8BDC2` | `0.25–0.42` | `0.95` | Directional brushed normal/roughness streaks |
| Oxidized Rust | `#6B3824` | `0.80–0.95` | `0.05` | Masks `metalness -> 0` where corrosion forms |
| Car Clearcoat Paint | `#8F1D18` (example) | `0.30–0.45` (base) | `0.2–0.6` | `clearcoat: 1.0`, `clearcoatRoughness: 0.05` |
| Glass / Visor | `#D8E4EB` | `0.02–0.08` | `0.0` | `transmission: 0.9`, `ior: 1.52`, `thickness: 0.1` |
| Living Foliage | `#354F2B` | `0.45–0.68` | `0.0` | Subsurface/translucency wrap lighting + wind vertex sway |
| Human Skin | `#B98368` | `0.38–0.55` | `0.0` | Pore micro-normal + warm red subsurface scatter |

## 3. Breaking Up Flat Surfaces (3-Frequency Rule)

Every hero asset or environment surface needs three scales of visual breakup:
1. **Macro (2m–20m):** Weathering gradients, water stains, moss/soot near seams, moisture puddles.
2. **Meso (10cm–1m):** Panels, bevels, cracks, bolts, planks, curb chips, mortar lines.
3. **Micro (1mm–5cm):** Procedural grain, noise normal maps, subtle roughness variation (`roughnessMap`).

## 4. Procedural Canvas / DataTexture PBR Generation

When external texture packs aren't bundled, generate paired `map`, `roughnessMap`, and `bumpMap`/`normalMap` via deterministic `CanvasTexture` or `DataTexture` generators (with `anisotropy = renderer.capabilities.getMaxAnisotropy()` and `RepeatWrapping`) so every surface catches light authentically.
