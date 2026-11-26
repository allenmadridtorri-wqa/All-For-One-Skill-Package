# Single-AI-First Architecture & Low-Usage Engineering (V3.1)

**Core Rule:** All-For-One V3.1 defaults to **`ECONOMY` mode (Single-AI)** so developers on usage-capped plans can build complex games, 3D scenes, and software without agent swarms multiplying API calls.

## Execution Modes (`core/single-ai.ts`)

| Mode | Agents Spawned | Relative Requests | When to Use |
| :--- | :--- | :--- | :--- |
| `ECONOMY` (Default) | 1 primary AI + deterministic local helpers | `1.0x` (baseline) | Default for coding, debugging, asset scripts, and budget plans |
| `BALANCED` | 1 primary AI switching specialist lenses + separate QA pass | `1.2x` | Full multi-discipline tasks needing independent QA lens without multi-agent fanout |
| `ACCELERATION` | Optional parallel multi-agent dispatch | `~3.5x` | **Blocked by default.** Activates only with explicit user approval acknowledging higher AI usage |

## Zero-Cost Deterministic Offloading & Compact Context

- Offload pure computation (validation, hashing, SHA-256 asset manifests, frame range splitting, missing-frame detection, path confinement, secret scanning) to local Node/TypeScript scripts (`0` AI calls).
- Retrieve only the relevant reference docs per task (`npx tsx scripts/afo.ts retrieve --query="..." --budget=4000`) instead of loading the entire library.
- Reuse concise decision summaries instead of resending raw conversation transcripts.

## Mandatory Separate QA Verification Phase

Even in `ECONOMY` and `BALANCED` single-AI modes, run an independent QA pass after implementation using strict anti-fabrication statuses (`FAILED > UNVERIFIED > PARTIALLY_VERIFIED > VERIFIED`). Unexecuted builds, renders, or tests remain `UNVERIFIED`.
