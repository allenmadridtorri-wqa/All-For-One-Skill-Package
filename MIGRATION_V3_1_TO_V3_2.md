# Migration Guide: All-For-One V3.1 to V3.2 (130-Year Expertise Initiative)

All-For-One **V3.2** preserves **100% compatibility** with all 5 commands (`/crazy`, `/crazymaker`, `/crazydesigner`, `/crazycoder`, `/crazyqa`), `ECONOMY` Single-AI mode, Windows PowerShell/Linux/macOS installers, and all V2–V3.1 verification checks.

---

## 1. Key Changes from V3.1 to V3.2

1. **NVIDIA T4 (16 GB VRAM) + Standard System RAM Enforcement (`core/model-registry.ts`, `core/cloud-rendering.ts`):**
   - Colab workflows strictly target **NVIDIA T4 (`15,360` MB safe usable VRAM)** with dynamic system RAM detection and never assume `L4`, `A100`, `H100`, or Colab High-RAM.
   - `prepareColabRenderPackage` now defaults Google Drive job paths to `/content/drive/MyDrive/ALL_FOR_ONE/jobs/<job_id>` and supports `PREVIEW` (`960x540`), `LOOK_DEVELOPMENT` (`1280x720`), and `FINAL_T4_RENDER` (`1920x1080`) quality profiles.
2. **Model Capability Registry & Task Routing (`core/model-registry.ts`, `core/model-routing.ts`):**
   - Added curated open-weight model catalog separating `codeLicense` from `weightLicense`, enforcing regional exclusions (`Hunyuan3D-2` EU/UK/KR), blocking oversized 24 GB+ models (`TRELLIS.2`) on T4, and enforcing zero-paid-API mode by default.
3. **Antigravity Local MCP-Compatible Bridge (`scripts/mcp-bridge.ts`, `core/mcp-bridge.ts`):**
   - Exposes 10 local stdio JSON-RPC tools (`get_compute_profile`, `list_compatible_models`, `inspect_model_requirements`, `prepare_colab_job`, `validate_job_manifest`, `get_job_status`, `inspect_job_outputs`, `import_colab_results`, `validate_generated_asset`, `inspect_render_artifacts`).
4. **Structural 3D & Render Asset Verification (`core/asset-validation.ts`):**
   - Validates `.glb` / `.gltf` / `.fbx` geometry (`POSITION`, `NORMAL`, `TEXCOORD_0`, PBR materials, non-zero node scale) and `.png`/`.jpg`/`.webp` resolution + acceptance criteria rather than file existence alone.

---

## 2. Upgrade Steps

```bash
git pull origin main
npm run afo:validate
npm run afo:test
npx tsx scripts/afo.ts sync --force --yes
npx tsx scripts/afo.ts verify-install
```
