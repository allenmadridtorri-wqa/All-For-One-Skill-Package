# Migration Guide: All-For-One V3 to V3.1

All-For-One **V3.1** is **100% backward compatible** with V3 commands (`/crazy`, `/crazymaker`, `/crazydesigner`, `/crazycoder`, `/crazyqa`), V3 core APIs, and all existing Claude/Antigravity/ChatGPT installations.

---

## 1. What Changed for Existing V3 Users

1. **Single-AI-First Default (`ECONOMY` Mode):**
   - `/crazy` now runs in `ECONOMY` mode by default using one AI model and deterministic local helpers instead of assuming multi-agent swarms.
   - To enable internal multi-specialist lenses plus a separate self-QA pass on one AI model, switch to `BALANCED`.
   - Parallel multi-agent `ACCELERATION` now throws unless explicit user `MultiAgentApproval` is provided.
2. **Blender `generateBlenderAutomationScript` Security Confinement:**
   - Passing relative workspace paths or a `workspaceDir` argument continues to work seamlessly, while passing arbitrary un-confined system absolute paths (`/etc/...`) or strings with `\r`/`\n` now throws immediately.
   - Pass `workspaceDir` as the third argument to `generateBlenderAutomationScript(spec, hardware, workspaceDir)` in new automation scripts.
3. **Immutable Memory Decision IDs (`ProductionMemoryLedger`):**
   - `recordDecision` now rejects reusing an already-locked `DecisionEntry.id`. Use a new superseding ID (e.g., `DEC-002`) when revising an earlier architectural decision.
4. **Windows PowerShell (`install.ps1`):**
   - Forced overwrites now explicitly support and require `-Force -Yes`:
     ```powershell
     .\install.ps1 -Workspace -Force -Yes
     ```
5. **Release ZIP Archive Name:**
   - `npm run afo:package-zip` now outputs `release/All-For-One-Skill-Package-V3.1.zip`.

---

## 2. Upgrade Steps

```bash
git pull origin main
npm run afo:validate
npm run afo:test
npx tsx scripts/afo.ts sync --force
node scripts/install.mjs --verify --workspace
```

On Windows PowerShell:
```powershell
.\install.ps1 -CheckTools
.\install.ps1 -Workspace -Force -Yes
.\install.ps1 -Verify -Workspace
```
