# CRAZY QA Verification Report — All-For-One V3.2

- **Generated At:** 2026-11-26T10:03:42.222Z
- **Overall Status:** `PARTIALLY_VERIFIED`
- **Summary:** VERIFIED=3 | PARTIALLY_VERIFIED=0 | UNVERIFIED=1 | FAILED=0

## Engineering, Security, Asset & Runtime Checks

| ID | Category | Status | Exit Code | Command / Source | Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| QA-PKG-VAL | dependency | `VERIFIED` | 0 | `npx tsx scripts/afo.ts validate` | 5 skills checked; 0 issues. |
| QA-KEYWORD-ROUTING | integration-test | `VERIFIED` | 0 | `npx tsx scripts/afo.ts eval` | 159/159 routing/policy cases matched (100%; not a live AI quality score). |
| QA-SEC-SECRETS | security | `VERIFIED` | 0 | `core/security.ts#scanForSecrets` | Scanned 16 file(s); 0 secret patterns detected. |
| QA-BLENDER-RUNTIME | blender-render | `UNVERIFIED` | n/a | `blender --version` | Blender executable not found on PATH or standard OS install folders. Optional Blender automation runs as script generation + offline validation only. |

## Visual & Screenshot Verification

- `UNVERIFIED`: No visual screenshots or render captures were provided for this check.

## Verification Taxonomy Policy
- **VERIFIED:** Executed and passed with concrete tool/artifact evidence.
- **PARTIALLY_VERIFIED:** Subset of requirements verified; remaining items explicitly listed.
- **UNVERIFIED:** Not executed in the current environment (e.g., Blender/engine runtime or live LLM API calls without credentials).
- **FAILED:** Executed and produced an error, security finding, or failed assertion.
