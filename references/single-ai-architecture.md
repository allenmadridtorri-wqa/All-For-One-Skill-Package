# Single-AI-First Architecture & Low-Usage Engineering (V3.1)

**Core Rule:** All-For-One V3.1 defaults to **`ECONOMY` mode (Single-AI)** so developers on usage-capped plans can build complex games, 3D scenes, and software without agent swarms multiplying API calls.

## Execution Modes (`core/single-ai.ts`)

| Mode | Agents Spawned | Relative Requests | When to Use |
| :--- | :--- | :--- | :--- |
| `ECONOMY` (Default) | 1 primary AI + deterministic local helpers | `1.0x` (baseline) | Default for coding, debugging, asset scripts, and budget plans |
| `BALANCED` | 1 primary AI switching specialist lenses + separate QA pass | `1.2x` | Full multi-discipline tasks needing independent QA lens without multi-agent fanout |
| `ACCELERATION` | Optional parallel multi-agent dispatch | `~3.5x` | **Blocked by default.** Activates only with explicit `MultiAgentApproval` warning acceptance |

## Zero-Cost Deterministic Offloading & Caching

- Offload pure computation (validation, hashing, SHA-256 asset manifests, frame range splitting, missing-frame detection, path confinement, secret scanning) to `SingleAiOrchestrator.runDeterministicTask()` (`0` AI calls).
- Reuse `ProductionMemoryLedger.buildCompactContextSummary(maxChars)` (< ~1,200 tokens) instead of resending raw transcripts.
- Configure `ModelAdapter` (`core/model-adapter.ts`) with `'offline-deterministic'`, `'local-http'`, `'openai-compatible'`, `'anthropic-compatible'`, `'google-compatible'`, or `'env-configured'` using `baseUrl` / `apiKeyEnvVar` and SHA-256 prompt response caching (`cacheHits`).

## Mandatory Separate QA Verification Phase

Even in `ECONOMY` and `BALANCED` single-AI modes, QA runs via `runSeparateQaVerificationPhase()` using CRAZYQA anti-fabrication precedence (`FAILED > UNVERIFIED > PARTIALLY_VERIFIED > VERIFIED`). Self-reported edits never promote from `IMPLEMENTED` to `VERIFIED` without executed tests (`ImplementationStatusTracker`).
