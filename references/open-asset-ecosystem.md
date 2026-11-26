# Free & Open-Source 3D, Texture, HDRI & Audio Asset Ecosystem

## 1. Purpose
Establish a verified zero-budget ecosystem of free, legally clear CC0 and open-source asset repositories so teams reuse high-resolution HDRIs, scanned PBR surfaces, and modular kits instead of burning GPU budget or committing unclear third-party assets.

## 2. Applicable Specialist
- Primary: `crazydesigner` (Look-Dev & Asset Curation), `crazymaker` (Rapid Whiteboxing), `crazyqa` (License Audit).

## 3. Relevant Tools
- Programmatic catalog: `core/model-registry.ts` (`OPEN_ASSET_SOURCES`)
- CLI listing: `npx tsx scripts/afo.ts models`
- MCP inspection: `list_compatible_models` with `includeOpenAssetSources: true`

## 4. Production Methodology
| Source | Asset Types | Default License | Attribution Required? | Commercial OK? | Format Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Poly Haven** (`https://polyhaven.com`) | HDRIs (EXR/HDR up to 16K), Scanned PBR Textures, Models | **CC0 1.0** | No | Yes | Drop-in `.exr` HDRIs for Cycles & `.gltf`/`.blend` hero props. |
| **ambientCG** (`https://ambientcg.com`) | Seamless PBR Texture Maps, Decals, HDRIs | **CC0 1.0** | No | Yes | Direct `Color`, `Roughness`, `NormalGL`/`NormalDX`, `Displacement` PNGs. |
| **Kenney** (`https://kenney.nl/assets`) | Modular 3D Kits, UI Icons, SFX, 2D Sprites | **CC0 1.0** | No | Yes | Rapid gameplay whiteboxing & grid-snapped prototypes. |
| **Quaternius** (`https://quaternius.com`) | Stylized & Nature/Character/Prop Packs | **CC0 1.0** | No | Yes | Lightweight `.gltf`/`.fbx` meshes; upgrade materials for photoreal targets. |
| **OpenGameArt** (`https://opengameart.org`) | Mixed Community Models, Music, Textures | **MIXED** (`CC0`, `CC-BY`, `CC-BY-SA`, `GPL`, `OGA-BY`) | **Inspect Per Asset** | **Depends on License** | **Mandatory per-asset check**: `GPL`/`CC-BY-SA` imposes copyleft sharing rules. |

## 5. Technical Requirements
- Verify Normal Map convention matches target engine (`OpenGL +Y` for Blender/Godot/Three.js vs `DirectX -Y` for Unreal/Unity unless flipped in material import).
- Store attribution notices inside `CREDITS.md` whenever using any `CC-BY` asset from OpenGameArt.

## 6. Important Constraints
- **Never commit large model weights or unclear third-party assets directly into the All-For-One skill package repository.** Download or reference external project assets at target project build time.
- Treat OpenGameArt assets as `UNVERIFIED` for commercial shipping until the exact asset page license is recorded.

## 7. Common Failures
- Mixing DirectX and OpenGL normal green-channel polarity (`-Y` vs `+Y`), making bricks/scratches look inverted.
- Downloading sRGB color-profile textures into scalar Roughness/Metallic slots instead of `Non-Color` / `Linear`.
- Bundling copyleft (`GPL-3.0`) textures or audio into proprietary closed-source commercial builds unintentionally.

## 8. Quality Standards
- Use `2K–4K EXR` HDRIs from Poly Haven for look-dev lighting and pack engine textures into `1K–2K` (`Three.js`/`mobile`) or `2K–4K` (`UE5`/`Desktop`) ORM atlases.

## 9. Performance Considerations
- Avoid unoptimized `8K` uncompressed PNG textures for minor background props; downscale or compress to `.basis`/`.ktx2`/engine DXT formats cleanly.

## 10. Validation Procedure
- Run `validate_generated_asset` on assembled exports and audit Linear vs sRGB channel assignments in scene scripts (`scripts/audit-pbr-scene.ts`).

## 11. Known Limitations
- Repository licenses listed above reflect public platform defaults as of `2026-11-26`; upstream individual upload metadata (especially OpenGameArt) must always be checked on download.

## 12. Authoritative Sources
- Poly Haven License & FAQ: https://polyhaven.com/license
- ambientCG License (CC0): https://docs.ambientcg.com/license/
- Kenney License: https://kenney.nl/support
- Quaternius: https://quaternius.com/
- OpenGameArt FAQ: https://opengameart.org/content/faq
