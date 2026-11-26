# Cross-Target Token Budget Architecture (>= 85% Usage Reduction)

- **Version:** 3.2.0
- **Last Verified:** 2026-11-26

## Purpose

Enforce measurable **>= 85% token usage reduction** across every supported AI coding and assistant target (`antigravity`, `claude`, `chatgpt`, `custom-gpt`, `cursor`, `windsurf`, `cline`, `copilot`, `gemini-cli`, `opencode`) while preserving All-For-One's full 130-year expertise depth through progressive loading and deterministic CLI/MCP offloading.

## Applicable Specialist

- Primary: `crazy` (orchestration budget governance), `crazycoder` (retrieval & adapter architecture), `crazyqa` (`QA-TOKEN-BUDGET-85` verification gate).

## Relevant Tools

- `core/token-budget.ts` (`measureUnbudgetedBaseline`, `measureTargetTokenBudget`, `auditAllTargetsTokenBudget`, `buildCompactTargetRouterMarkdown`)
- `core/knowledge-retrieval.ts` (`retrieveTaskKnowledge(..., { compactSections: true })`)
- `core/installer-engine.mjs` (`generateCompactTargetRouter`, `buildInstallFilePlan`)
- CLI: `npx tsx scripts/afo.ts token-budget`, `npx tsx scripts/afo.ts retrieve --budget=1800 --compact`
- MCP: `get_token_budget_report`

## Production Methodology

1. **Tier 1 Always-Loaded Compact Routers (<= 460–600 tokens):** IDE rules (`.cursor/rules/all-for-one.mdc`, `.windsurf/rules/all-for-one.md`, `.clinerules/all-for-one.md`, `.github/copilot-instructions.md`, `.agent/rules/all-for-one.md`, `.gemini/GEMINI.md`, `AGENTS.md`) and `custom-gpt/instructions.md` emit only intent triggers, CLI/MCP commands, and non-negotiable guardrails.
2. **Tier 2 Single-Skill Invocation:** Claude Code, Codex CLI, and Antigravity workflows load only frontmatter at startup (~400 tokens) and read only the single matching `SKILL.md` when invoked.
3. **Tier 3 Section-Level Retrieval (`--compact`):** Instead of loading full reference documents, `retrieveTaskKnowledge` scores markdown headings (`Purpose`, `Production Methodology`, `Technical Requirements`, `Important Constraints`, `Validation Procedure`) and extracts only the query-relevant excerpts within the target's `retrievalTokenBudget` (`1,600–1,900` tokens).
4. **Tier 4 Deterministic CLI & MCP Offload:** Schema checks, model VRAM compatibility, GLB/PNG parsing, and secret scanning execute in Node/Python scripts instead of verbose LLM reasoning loops.

## Technical Requirements

- Measured `startupTokens <= maxStartupTokens` (`460–600` tokens per target).
- Measured `typicalActiveTaskTokens <= maxActiveTaskTokens` (`2,900–3,400` tokens per target).
- `startupSavingsPercentVsFull >= 85%`, `startupSavingsPercentVsAllSkills >= 85%`, and `activeTaskSavingsPercentVsFull >= 85%` computed dynamically from real files on disk (`skills/`, `references/`, `docs/`, `references/index.json`).
- `custom-gpt/instructions.md` strictly stays below `4,000` characters (well within ChatGPT's 8,000-char ceiling).

## Important Constraints

- Never claim token savings from hardcoded percentages; `auditAllTargetsTokenBudget()` measures live byte/token counts (`ceil(bytes / 4)`).
- Never duplicate full `references/` dumps inside `.cursor/`, `.windsurf/`, `.clinerules/`, `.github/`, or `custom-gpt/instructions.md`.
- Multi-agent `ACCELERATION` remains disabled unless explicitly approved by the user (`core/single-ai.ts`).

## Common Failures

- Concatenating all five `SKILL.md` bodies into `custom-gpt/instructions.md` or workspace rule files (causes ~4,000+ startup tokens per turn).
- Loading all 33 reference documents simultaneously (~25,000+ tokens) instead of running `afo.ts retrieve --budget=1800 --compact`.
- Allowing an IDE rule file to omit CLI retrieval commands, forcing the model to scan workspace directories blindly.

## Quality Standards

- All 10 budget targets must pass `npx tsx scripts/afo.ts token-budget` with exit code `0`.
- `QA-TOKEN-BUDGET-85` in `VERIFICATION_REPORT.md` must report `VERIFIED` after any edits to `skills/`, `references/`, or `core/token-budget.ts`.

## Performance Considerations

- Section extraction uses single-pass file reads cached by normalized query parameters (`queryCache` in `core/knowledge-retrieval.ts`).
- Extended targets share the single canonical vault rather than copying duplicate megabytes per IDE rule.

## Validation Procedure

1. Run `npx tsx scripts/afo.ts token-budget` and verify `allTargetsMeet85PercentReduction === true`.
2. Run `npx tsx scripts/afo.ts build` and confirm `dist/chatgpt/custom-gpt/instructions.md` and `dist/targets/*` stay within character and token ceilings.
3. Run `npm run afo:test` and `npm run afo:qa`.

## Known Limitations

- Token counts use deterministic UTF-8 byte/4 estimation (`Math.ceil(bytes / 4)`) because exact vendor BPE tokenizers (Anthropic, Gemini, OpenAI `tiktoken`) differ slightly across providers; safety margins (typically ~89–98% reduction) keep usage safely below the 85% threshold across tokenizers.

## Authoritative Sources

- `core/token-budget.ts` — All-For-One V3.2 Token Budget Engine
- `core/knowledge-retrieval.ts` — Section-level budgeted knowledge retriever
- `core/single-ai.ts` — Single-AI-First `ECONOMY` mode specification
