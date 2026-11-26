# Single-AI-First Architecture (`core/single-ai.ts`, `core/model-adapter.ts`)

All-For-One V3.1 is explicitly built so **one AI model** can execute end-to-end game development, 3D scripting, cinematic planning, and engineering verification without multiplying API calls.

---

## 1. Execution Modes

| Mode | Agents | AI Requests | Approval Gate | Ideal Usage |
| :--- | :--- | :--- | :--- | :--- |
| **`ECONOMY` (Default)** | `1` primary AI | Baseline `1.0x` | Automatic | Limited AI plans, coding, Blender scripting, everyday builds |
| **`BALANCED`** | `1` primary AI | `~1.0x–1.5x` | Automatic | Switching explicit `/crazymaker` / `/crazydesigner` / `/crazycoder` / `/crazyqa` lenses internally with zero swarm fanout |
| **`ACCELERATION`** | `5` parallel agents | `~3.0x–5.0x` | **Required** | Only when user passes `MultiAgentApproval` acknowledging higher API/quota usage |

```ts
import { SingleAiOrchestrator, estimateExecutionModeUsage } from './core/single-ai.ts';

const orchestrator = new SingleAiOrchestrator(context); // Defaults to ECONOMY
const det = orchestrator.runDeterministicTask('SPLIT-1', 'crazycoder', 'Split 90s trailer frames', () =>
  splitFrameRange(1, 2160, 24, 'TRAILER'),
); // 0 AI requests consumed
```

---

## 2. Deterministic Local Offloading & Prompt Caching

- **`runDeterministicTask`:** Offloads path confinement, SHA-256 checksums, frame chunk math, missing-frame scans, GLB/FBX binary checks, PNG signature validation, and secret scanning to local Node.js with **`0` AI calls**.
- **Compact Context Recovery (`ProductionMemoryLedger.buildCompactContextSummary(maxChars)`):** Summarizes locked decisions, active task progress, open bugs, latest build status, do-not-repeat keys, and tracked assets into `< ~1,200` tokens instead of re-reading full logs.
- **Model Adapter Caching & Provider Flexibility (`core/model-adapter.ts`):**
  - Default **`OfflineDeterministicAdapter`**: Zero paid API keys or local GPU required.
  - **`ConfigurableModelAdapter`:** Supports `'local-http'` (Ollama / llama.cpp on `localhost`/`127.0.0.1`), `'openai-compatible'`, `'anthropic-compatible'`, `'google-compatible'`, and `'env-configured'` using `baseUrl` and `envApiKeyName`.
  - SHA-256 prompt caching skips duplicate requests (`CACHED_RESPONSE`, `cacheHits++`), and all caught errors pass through `redactSecrets()`.

---

## 3. Mandatory Separate QA Phase

Even with a single AI model, V3.1 separates generation from truth:
- `executeSpecialistLens()` for non-QA lenses marks results `IMPLEMENTED`, never `VERIFIED`.
- `runSeparateQaVerificationPhase()` and `ImplementationStatusTracker` (`core/engineering-intelligence.ts`) require actual test execution or binary output evidence before transitioning `TESTED -> VERIFIED`.
