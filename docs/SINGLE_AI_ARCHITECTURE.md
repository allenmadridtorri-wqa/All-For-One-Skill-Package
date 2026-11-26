# Single-AI-First Architecture (`core/single-ai.ts`)

All-For-One V3.1 is explicitly built so **one AI model** can execute end-to-end game development, 3D scripting, cinematic planning, and engineering verification without multiplying API calls.

---

## 1. Execution Modes

| Mode | Agents | AI Requests | Approval Gate | Ideal Usage |
| :--- | :--- | :--- | :--- | :--- |
| **`ECONOMY` (Default)** | `1` primary AI | Baseline `1.0x` | Automatic | Limited AI plans, coding, Blender scripting, everyday builds |
| **`BALANCED`** | `1` primary AI | `~1.0x–1.5x` | Automatic | Switching explicit `/crazymaker` / `/crazydesigner` / `/crazycoder` / `/crazyqa` lenses internally with zero swarm fanout |
| **`ACCELERATION`** | `5` parallel agents | `~3.0x–5.0x` | **Required** | Only when user explicitly approves higher API/quota usage (`assertExecutionModeAllowed`) |

```ts
import { assertExecutionModeAllowed, estimateExecutionModeUsage } from './core/single-ai.ts';

const estimate = estimateExecutionModeUsage('ECONOMY');
assertExecutionModeAllowed('ECONOMY');
```

---

## 2. Deterministic Local Offloading & Token Budgeting

- **Local Deterministic Helpers:** Offload path confinement (`core/security.ts`), SHA-256 checksums, frame chunk math (`core/blender-bridge.ts`), missing-frame scans, PNG signature validation (`core/cloud-rendering.ts`), and secret scanning to local Node.js with **`0` AI calls**.
- **Selective Knowledge Retrieval (`core/knowledge-retrieval.ts`):** Loads only query-relevant guides within a configurable token budget (`npx tsx scripts/afo.ts retrieve --query="..."`).

---

## 3. Mandatory Separate QA Phase

Even with a single AI model, V3.1 separates generation from truth (`core/qa-verification.ts`):
- Every check must carry real executed command/artifact evidence to be marked `VERIFIED`.
- Missing external binaries (`blender`, `ffmpeg`), remote sessions, or unrun tests stay `UNVERIFIED`.
