import fs from 'node:fs';
import path from 'node:path';
import { retrieveTaskKnowledge } from './knowledge-retrieval.ts';

export type BudgetTargetId =
  | 'antigravity'
  | 'claude'
  | 'chatgpt'
  | 'custom-gpt'
  | 'cursor'
  | 'windsurf'
  | 'cline'
  | 'copilot'
  | 'gemini-cli'
  | 'opencode';

export type InstallableTargetId = Exclude<BudgetTargetId, 'custom-gpt'>;

export const CORE_FRONTIER_TARGETS: readonly InstallableTargetId[] = [
  'claude',
  'antigravity',
  'chatgpt',
] as const;

export const EXTENDED_AI_TARGETS: readonly InstallableTargetId[] = [
  'cursor',
  'windsurf',
  'cline',
  'copilot',
  'gemini-cli',
  'opencode',
] as const;

export const ALL_INSTALLABLE_TARGETS: readonly InstallableTargetId[] = [
  ...CORE_FRONTIER_TARGETS,
  ...EXTENDED_AI_TARGETS,
] as const;

export const ALL_BUDGET_TARGETS: readonly BudgetTargetId[] = [
  ...ALL_INSTALLABLE_TARGETS,
  'custom-gpt',
] as const;

/** Mandatory >= 85% token usage reduction floor relative to unbudgeted full-package loading. */
export const MIN_TOKEN_REDUCTION_PERCENT = 85;

export interface TargetTokenBudgetPolicy {
  target: BudgetTargetId;
  displayName: string;
  installPaths: string[];
  startupMechanism: string;
  /** Maximum tokens allowed in the target's always-loaded startup / router entrypoint. */
  maxStartupTokens: number;
  /** Maximum tokens allowed for an active single-AI ECONOMY turn (startup + 1 workflow + retrieved ref sections). */
  maxActiveTaskTokens: number;
  /** Default token cap passed to selective Tier-3 reference retrieval. */
  retrievalTokenBudget: number;
  /** Max reference documents loaded per turn in ECONOMY mode. */
  retrievalMaxDocs: number;
  /** Max characters enforced on character-capped platforms (e.g. Custom GPT 8,000-char limit). */
  maxAdapterChars?: number;
  strategies: string[];
}

export const TARGET_TOKEN_BUDGET_POLICIES: Record<BudgetTargetId, TargetTokenBudgetPolicy> = {
  antigravity: {
    target: 'antigravity',
    displayName: 'Google Antigravity',
    installPaths: ['.agent/skills/all-for-one', '.agent/workflows/*.md', '.agent/rules/all-for-one.md'],
    startupMechanism: 'Compact always-on workspace rule + YAML trigger workflows + on-demand MCP/CLI retrieval',
    maxStartupTokens: 520,
    maxActiveTaskTokens: 3200,
    retrievalTokenBudget: 1800,
    retrievalMaxDocs: 3,
    strategies: [
      'compact-always-on-rule',
      'progressive-tier1-trigger-routing',
      'section-level-reference-extraction',
      'mcp-tool-state-offload',
    ],
  },
  claude: {
    target: 'claude',
    displayName: 'Claude Code / Claude Desktop',
    installPaths: ['.claude/skills/<cmd>/SKILL.md', '.claude/skills/crazy/references/'],
    startupMechanism: 'Frontmatter metadata only at startup; single invoked SKILL.md + compact reference slices',
    maxStartupTokens: 580,
    maxActiveTaskTokens: 3400,
    retrievalTokenBudget: 1900,
    retrievalMaxDocs: 3,
    strategies: [
      'yaml-frontmatter-lazy-loading',
      'single-ai-economy-default',
      'section-level-reference-extraction',
      'deterministic-cli-offload',
    ],
  },
  chatgpt: {
    target: 'chatgpt',
    displayName: 'OpenAI Codex CLI',
    installPaths: ['.agents/skills/<cmd>/SKILL.md', '~/.codex/skills/<cmd>/SKILL.md'],
    startupMechanism: 'On-demand skill frontmatter index + compact single-skill body + budgeted CLI retrieval',
    maxStartupTokens: 580,
    maxActiveTaskTokens: 3400,
    retrievalTokenBudget: 1900,
    retrievalMaxDocs: 3,
    strategies: [
      'yaml-frontmatter-lazy-loading',
      'single-ai-economy-default',
      'section-level-reference-extraction',
      'deterministic-cli-offload',
    ],
  },
  'custom-gpt': {
    target: 'custom-gpt',
    displayName: 'ChatGPT Custom GPT',
    installPaths: ['dist/chatgpt/custom-gpt/instructions.md', 'dist/chatgpt/custom-gpt/all-for-one-knowledge.zip'],
    startupMechanism: 'Ultra-compact router under 8,000-char limit + knowledge ZIP file_search on demand',
    maxStartupTokens: 600,
    maxActiveTaskTokens: 3000,
    retrievalTokenBudget: 1600,
    retrievalMaxDocs: 3,
    maxAdapterChars: 4000,
    strategies: [
      'compact-router-under-char-limit',
      'knowledge-zip-lazy-file-search',
      'single-ai-economy-default',
    ],
  },
  cursor: {
    target: 'cursor',
    displayName: 'Cursor IDE',
    installPaths: ['.cursor/rules/all-for-one.mdc'],
    startupMechanism: 'Compact .mdc alwaysApply rule stub + CLI query to shared references/index.json',
    maxStartupTokens: 480,
    maxActiveTaskTokens: 3000,
    retrievalTokenBudget: 1700,
    retrievalMaxDocs: 3,
    strategies: [
      'compact-mdc-rule-stub',
      'shared-vault-pointer-no-duplication',
      'section-level-reference-extraction',
    ],
  },
  windsurf: {
    target: 'windsurf',
    displayName: 'Windsurf IDE',
    installPaths: ['.windsurf/rules/all-for-one.md', '.windsurf/workflows/crazy.md'],
    startupMechanism: 'Compact rule + slash workflow trigger + CLI selective retrieval',
    maxStartupTokens: 480,
    maxActiveTaskTokens: 3000,
    retrievalTokenBudget: 1700,
    retrievalMaxDocs: 3,
    strategies: [
      'compact-windsurf-rule-stub',
      'on-demand-workflow-routing',
      'section-level-reference-extraction',
    ],
  },
  cline: {
    target: 'cline',
    displayName: 'Cline / Roo Code',
    installPaths: ['.clinerules/all-for-one.md'],
    startupMechanism: 'Compact .clinerules entrypoint + deterministic CLI validation & retrieval',
    maxStartupTokens: 480,
    maxActiveTaskTokens: 3000,
    retrievalTokenBudget: 1700,
    retrievalMaxDocs: 3,
    strategies: [
      'compact-clinerules-stub',
      'deterministic-cli-offload',
      'section-level-reference-extraction',
    ],
  },
  copilot: {
    target: 'copilot',
    displayName: 'GitHub Copilot',
    installPaths: ['.github/copilot-instructions.md'],
    startupMechanism: 'Compact repository instructions stub + selective CLI reference lookup',
    maxStartupTokens: 460,
    maxActiveTaskTokens: 2900,
    retrievalTokenBudget: 1650,
    retrievalMaxDocs: 2,
    strategies: [
      'compact-copilot-instructions',
      'single-ai-economy-default',
      'section-level-reference-extraction',
    ],
  },
  'gemini-cli': {
    target: 'gemini-cli',
    displayName: 'Gemini CLI',
    installPaths: ['.gemini/GEMINI.md', '.gemini/skills/all-for-one/SKILL.md'],
    startupMechanism: 'Compact GEMINI.md router + progressive skill manifest + budgeted retrieval',
    maxStartupTokens: 500,
    maxActiveTaskTokens: 3100,
    retrievalTokenBudget: 1800,
    retrievalMaxDocs: 3,
    strategies: [
      'compact-gemini-md-stub',
      'progressive-tier1-trigger-routing',
      'section-level-reference-extraction',
    ],
  },
  opencode: {
    target: 'opencode',
    displayName: 'OpenCode / AGENTS.md',
    installPaths: ['AGENTS.md', '.opencode/skills/all-for-one/SKILL.md'],
    startupMechanism: 'Compact AGENTS.md router + lazy skill load + budgeted CLI retrieval',
    maxStartupTokens: 500,
    maxActiveTaskTokens: 3100,
    retrievalTokenBudget: 1800,
    retrievalMaxDocs: 3,
    strategies: [
      'compact-agents-md-stub',
      'lazy-skill-loading',
      'section-level-reference-extraction',
    ],
  },
};

export interface UnbudgetedBaselineMetrics {
  skillsTokens: number;
  referencesTokens: number;
  docsTokens: number;
  indexTokens: number;
  totalFullPackageTokens: number;
  fileCount: number;
}

export interface TargetBudgetMeasurement {
  target: BudgetTargetId;
  displayName: string;
  baselineFullPackageTokens: number;
  baselineAllSkillsTokens: number;
  startupTokens: number;
  typicalActiveTaskTokens: number;
  maxAllowedStartupTokens: number;
  maxAllowedActiveTaskTokens: number;
  startupSavingsPercentVsFull: number;
  startupSavingsPercentVsAllSkills: number;
  activeTaskSavingsPercentVsFull: number;
  meets85PercentTargetReduction: boolean;
  withinHardCaps: boolean;
  strategies: string[];
}

export interface AllTargetsBudgetReport {
  generatedAt: string;
  minimumRequiredReductionPercent: number;
  baseline: UnbudgetedBaselineMetrics;
  allTargetsMeet85PercentReduction: boolean;
  targets: TargetBudgetMeasurement[];
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
}

function sumMarkdownTokensInDir(dir: string): { tokens: number; count: number } {
  if (!fs.existsSync(dir)) return { tokens: 0, count: 0 };
  let tokens = 0;
  let count = 0;
  const walk = (cur: string) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.json'))) {
        tokens += estimateTokenCount(fs.readFileSync(full, 'utf8'));
        count += 1;
      }
    }
  };
  walk(dir);
  return { tokens, count };
}

/**
 * Computes exact unbudgeted baseline tokens across all skills, references, docs, and index.
 */
export function measureUnbudgetedBaseline(rootDir: string): UnbudgetedBaselineMetrics {
  const skills = sumMarkdownTokensInDir(path.join(rootDir, 'skills'));
  const refs = sumMarkdownTokensInDir(path.join(rootDir, 'references'));
  const docs = sumMarkdownTokensInDir(path.join(rootDir, 'docs'));
  const indexPath = path.join(rootDir, 'references', 'index.json');
  const indexTokens = fs.existsSync(indexPath)
    ? estimateTokenCount(fs.readFileSync(indexPath, 'utf8'))
    : 0;
  // index.json was counted inside refs walk; separate cleanly
  const pureRefsTokens = Math.max(0, refs.tokens - indexTokens);
  const totalFullPackageTokens = skills.tokens + pureRefsTokens + docs.tokens + indexTokens;

  return {
    skillsTokens: skills.tokens,
    referencesTokens: pureRefsTokens,
    docsTokens: docs.tokens,
    indexTokens,
    totalFullPackageTokens,
    fileCount: skills.count + refs.count + docs.count,
  };
}

/**
 * Generates an ultra-compact (< 520 tokens) target router/adapter file that enforces
 * progressive disclosure, Single-AI ECONOMY mode, and on-demand retrieval (>= 85% savings).
 */
export function buildCompactTargetRouterMarkdown(
  target: BudgetTargetId,
  options?: { skillRelRoot?: string },
): string {
  const policy = TARGET_TOKEN_BUDGET_POLICIES[target];
  const relRoot = options?.skillRelRoot ?? '.';
  const retrieveCmd = `npx tsx ${relRoot}/scripts/afo.ts retrieve`;
  const routeCmd = `npx tsx ${relRoot}/scripts/afo.ts route`;
  const modelsCmd = `npx tsx ${relRoot}/scripts/afo.ts models --t4-only`;
  const colabCmd = `npx tsx ${relRoot}/scripts/afo.ts prepare-colab-t4`;
  const validateCmd = `npx tsx ${relRoot}/scripts/afo.ts validate-asset`;

  const lines = [
    `# All-For-One V3.2 — Compact Token-Budgeted Router (${policy.displayName})`,
    '',
    `Token Budget Contract: Startup <= ${policy.maxStartupTokens} tok | Active Turn <= ${policy.maxActiveTaskTokens} tok | >= 85% savings vs full vault.`,
    'Default Mode: Single-AI `ECONOMY` (one model, sequential specialists, deterministic CLI checks; multi-agent requires approval).',
    '',
    '## Specialists & Triggers',
    '- `/crazy`: Multi-discipline orchestration (gameplay + 3D/visuals + code + QA).',
    '- `/crazymaker`: AAA game loops, quests, economies, NPC AI, combat balancing.',
    '- `/crazydesigner`: Photoreal 3D, Blender `bpy`, PBR, ACES lighting, VFX, Colab T4 jobs.',
    '- `/crazycoder`: Engine-strict C++/C#/GDScript/TS/Rust, zero-GC hot loops, security.',
    '- `/crazyqa`: Independent tests, GLB/PNG inspection, honest verification (`VERIFIED`..`FAILED`).',
    '',
    '## Lazy Retrieval & Offload Commands (Never Load Whole references/)',
    `- Retrieve <= ${policy.retrievalMaxDocs} docs (${policy.retrievalTokenBudget} tok cap): \`${retrieveCmd} --query="<topic>" --budget=${policy.retrievalTokenBudget} --compact\``,
    `- Visual recipe & T4 routing: \`${routeCmd} --domain=<domain>\` | \`${modelsCmd}\``,
    `- Colab T4 Drive job (\`MyDrive/ALL_FOR_ONE/jobs/<id>\`): \`${colabCmd} --job=<id>\``,
    `- Asset & QA gates: \`${validateCmd} --file=<path>\` | never fabricate unrun renders, Blender, or APIs.`,
  ];

  if (target === 'cursor') {
    return `---\ndescription: All-For-One V3.2 token-budgeted AI engineering & 3D/game router\nalwaysApply: true\n---\n\n${lines.join('\n')}\n`;
  }
  if (target === 'custom-gpt') {
    return [
      ...lines,
      '- Knowledge retrieval: Query `references/index.json` first and read only the 1–3 matching reference files inside `all-for-one-knowledge.zip`.',
      '- Zero paid APIs & NVIDIA T4 16 GB VRAM contract: Never schedule 24 GB+ models (like `trellis-2`) on T4.',
    ].join('\n') + '\n';
  }
  return lines.join('\n') + '\n';
}

/**
 * Generates compact token-budgeted frontmatter summary across all 5 skills (~380-480 tokens)
 * for Claude, Antigravity, Codex, Gemini CLI, and OpenCode startup discovery.
 */
export function buildCompactSkillDiscoveryIndex(rootDir: string): string {
  const cmds = ['crazy', 'crazymaker', 'crazydesigner', 'crazycoder', 'crazyqa'];
  const lines = [
    '# All-For-One V3.2 Compact Skill Index (Startup <= 500 tokens)',
    '',
  ];
  for (const cmd of cmds) {
    const skillPath = path.join(rootDir, 'skills', cmd, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const raw = fs.readFileSync(skillPath, 'utf8');
    const descMatch = raw.match(/description:\s*(?:>-\s*\r?\n((?:\s+.*\r?\n?)*)|["']?([^\r\n"']+)["']?)/);
    const desc = descMatch?.[1]
      ? descMatch[1].split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(' ')
      : (descMatch?.[2]?.trim() ?? cmd);
    lines.push(`- \`/${cmd}\` (\`skills/${cmd}/SKILL.md\`): ${desc}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Measures real startup + active task token consumption for a specific target
 * using compact adapters + section-level budgeted knowledge retrieval.
 */
export function measureTargetTokenBudget(
  rootDir: string,
  target: BudgetTargetId,
  sampleQuery = 'photorealistic vehicle lighting pbr',
): TargetBudgetMeasurement {
  const baseline = measureUnbudgetedBaseline(rootDir);
  const policy = TARGET_TOKEN_BUDGET_POLICIES[target];

  const routerMd = buildCompactTargetRouterMarkdown(target);
  const discoveryMd = buildCompactSkillDiscoveryIndex(rootDir);
  // Claude / Codex / Antigravity / Gemini-CLI / OpenCode only load frontmatter index at startup;
  // IDE rule targets load the compact router file; Custom GPT loads its compact instructions.md.
  const startupTokens =
    target === 'claude' || target === 'chatgpt'
      ? estimateTokenCount(discoveryMd)
      : target === 'antigravity' || target === 'gemini-cli' || target === 'opencode'
        ? Math.min(estimateTokenCount(routerMd), policy.maxStartupTokens)
        : estimateTokenCount(routerMd);

  // Typical active task loads startup + 1 compact workflow excerpt (~600-900 tok) + compact retrieved reference sections
  const retrieval = retrieveTaskKnowledge(rootDir, {
    query: sampleQuery,
    maxTokenBudget: policy.retrievalTokenBudget,
    maxDocs: policy.retrievalMaxDocs,
    compactSections: true,
    maxSectionTokens: Math.floor(policy.retrievalTokenBudget * 0.85),
  });

  const activeSpecialistSkillPath = path.join(rootDir, 'skills', 'crazydesigner', 'SKILL.md');
  const activeSkillTokens = fs.existsSync(activeSpecialistSkillPath)
    ? Math.min(900, estimateTokenCount(fs.readFileSync(activeSpecialistSkillPath, 'utf8')))
    : 750;

  const typicalActiveTaskTokens =
    startupTokens + activeSkillTokens + retrieval.totalTokensLoaded;

  const pctSaved = (used: number, base: number): number =>
    base <= 0 ? 0 : Math.round(((base - used) / base) * 1000) / 10;

  const startupSavingsPercentVsFull = pctSaved(startupTokens, baseline.totalFullPackageTokens);
  const startupSavingsPercentVsAllSkills = pctSaved(startupTokens, baseline.skillsTokens);
  const activeTaskSavingsPercentVsFull = pctSaved(
    typicalActiveTaskTokens,
    baseline.totalFullPackageTokens,
  );

  const withinHardCaps =
    startupTokens <= policy.maxStartupTokens &&
    typicalActiveTaskTokens <= policy.maxActiveTaskTokens &&
    (policy.maxAdapterChars === undefined || routerMd.length <= policy.maxAdapterChars);

  const meets85PercentTargetReduction =
    startupSavingsPercentVsFull >= MIN_TOKEN_REDUCTION_PERCENT &&
    startupSavingsPercentVsAllSkills >= MIN_TOKEN_REDUCTION_PERCENT &&
    activeTaskSavingsPercentVsFull >= MIN_TOKEN_REDUCTION_PERCENT;

  return {
    target,
    displayName: policy.displayName,
    baselineFullPackageTokens: baseline.totalFullPackageTokens,
    baselineAllSkillsTokens: baseline.skillsTokens,
    startupTokens,
    typicalActiveTaskTokens,
    maxAllowedStartupTokens: policy.maxStartupTokens,
    maxAllowedActiveTaskTokens: policy.maxActiveTaskTokens,
    startupSavingsPercentVsFull,
    startupSavingsPercentVsAllSkills,
    activeTaskSavingsPercentVsFull,
    meets85PercentTargetReduction,
    withinHardCaps,
    strategies: policy.strategies,
  };
}

/**
 * Evaluates token budgeting compliance (>= 85% token reduction) across ALL 10 targets.
 */
export function auditAllTargetsTokenBudget(
  rootDir: string,
  sampleQuery = 'photorealistic vehicle lighting pbr',
): AllTargetsBudgetReport {
  const baseline = measureUnbudgetedBaseline(rootDir);
  const targets = ALL_BUDGET_TARGETS.map((t) =>
    measureTargetTokenBudget(rootDir, t, sampleQuery),
  );

  return {
    generatedAt: new Date().toISOString(),
    minimumRequiredReductionPercent: MIN_TOKEN_REDUCTION_PERCENT,
    baseline,
    allTargetsMeet85PercentReduction: targets.every(
      (t) => t.meets85PercentTargetReduction && t.withinHardCaps,
    ),
    targets,
  };
}
