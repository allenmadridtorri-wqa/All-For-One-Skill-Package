import {
  CORE_SPECIALISTS,
  type CoreSpecialistId,
  type SharedProjectContext,
} from './collaboration.ts';
import {
  OfflineDeterministicAdapter,
  type ModelProviderAdapter,
} from './model-adapter.ts';
import { ProductionMemoryLedger } from './production-memory.ts';

export type ExecutionMode = 'ECONOMY' | 'BALANCED' | 'ACCELERATION';

export interface MultiAgentApproval {
  approved: boolean;
  actor: string;
  reason: string;
  acknowledgedCostMultiplier: number;
}

export interface ExecutionCostEstimate {
  mode: ExecutionMode;
  agentCount: number;
  estimatedAiRequests: number;
  deterministicTasksOffloaded: number;
  costMultiplierLabel: string;
  requiresExplicitUserApproval: boolean;
  warning: string | null;
}

export interface InternalStepRecord {
  stepId: string;
  lens: CoreSpecialistId | 'crazy';
  kind: 'DETERMINISTIC_LOCAL' | 'SINGLE_AI_LENS' | 'SINGLE_AI_SELF_QA';
  status: 'IMPLEMENTED' | 'VERIFIED' | 'UNVERIFIED' | 'FAILED';
  aiRequestsConsumed: number;
  summary: string;
  timestamp: string;
}

export function estimateExecutionModeUsage(
  mode: ExecutionMode,
  plannedTasks = 4,
  deterministicTasks = 2,
): ExecutionCostEstimate {
  if (mode === 'ECONOMY') {
    return {
      mode,
      agentCount: 1,
      estimatedAiRequests: Math.max(1, plannedTasks - deterministicTasks),
      deterministicTasksOffloaded: deterministicTasks,
      costMultiplierLabel: '1.0x (Default Single-AI Economy)',
      requiresExplicitUserApproval: false,
      warning: null,
    };
  }
  if (mode === 'BALANCED') {
    return {
      mode,
      agentCount: 1,
      estimatedAiRequests: Math.max(2, plannedTasks),
      deterministicTasksOffloaded: deterministicTasks,
      costMultiplierLabel: '1.0x–1.5x (Single-AI Internal Lenses; delegation requires approval)',
      requiresExplicitUserApproval: false,
      warning: 'External multi-agent delegation remains disabled unless explicitly approved.',
    };
  }
  return {
    mode,
    agentCount: 5,
    estimatedAiRequests: plannedTasks * 4,
    deterministicTasksOffloaded: deterministicTasks,
    costMultiplierLabel: '3.0x–5.0x (Parallel Multi-Agent Acceleration)',
    requiresExplicitUserApproval: true,
    warning:
      'ACCELERATION mode activates independent specialist agents in parallel and significantly increases AI quota/API usage.',
  };
}

/**
 * Validates mode switches so multi-agent ACCELERATION never activates silently.
 */
export function assertExecutionModeAllowed(
  requestedMode: ExecutionMode,
  approval?: MultiAgentApproval,
): void {
  if (requestedMode !== 'ACCELERATION') return;
  if (!approval || !approval.approved) {
    throw new Error(
      'ACCELERATION (multi-agent) mode requires explicit user approval acknowledging ~3x-5x higher AI usage.',
    );
  }
  if (!approval.actor?.trim() || !approval.reason?.trim()) {
    throw new Error('Multi-agent approval must include non-empty actor and reason.');
  }
}

/**
 * Single-AI-First Orchestrator (Default V3.1 Architecture).
 * Operates with ONE AI model switching specialist lenses internally,
 * offloading deterministic work to local code, and running a separate
 * verification phase before finishing.
 */
export class SingleAiOrchestrator {
  public readonly context: SharedProjectContext;
  private readonly adapter: ModelProviderAdapter;
  private readonly ledger?: ProductionMemoryLedger;
  private mode: ExecutionMode = 'ECONOMY';
  private multiAgentApproved = false;
  private readonly steps: InternalStepRecord[] = [];
  private deterministicTasksSaved = 0;

  constructor(
    context: SharedProjectContext,
    options: {
      mode?: ExecutionMode;
      multiAgentApproval?: MultiAgentApproval;
      adapter?: ModelProviderAdapter;
      ledger?: ProductionMemoryLedger;
    } = {},
  ) {
    const mode = options.mode ?? 'ECONOMY';
    assertExecutionModeAllowed(mode, options.multiAgentApproval);
    this.mode = mode;
    this.multiAgentApproved = mode === 'ACCELERATION';
    this.context = context;
    this.adapter = options.adapter ?? new OfflineDeterministicAdapter();
    this.ledger = options.ledger;
  }

  getMode(): ExecutionMode {
    return this.mode;
  }

  isMultiAgentEnabled(): boolean {
    return this.mode === 'ACCELERATION' && this.multiAgentApproved;
  }

  setMode(nextMode: ExecutionMode, approval?: MultiAgentApproval): ExecutionCostEstimate {
    assertExecutionModeAllowed(nextMode, approval);
    this.mode = nextMode;
    this.multiAgentApproved = nextMode === 'ACCELERATION';
    return estimateExecutionModeUsage(nextMode, Math.max(4, this.steps.length), this.deterministicTasksSaved);
  }

  /**
   * Executes deterministic operations (file checks, hashes, frame splits, GLB validation)
   * purely in local TypeScript/Node with ZERO AI requests consumed.
   */
  runDeterministicTask<T>(
    stepId: string,
    lens: CoreSpecialistId | 'crazy',
    description: string,
    fn: () => T,
  ): { result: T; record: InternalStepRecord } {
    const result = fn();
    this.deterministicTasksSaved += 1;
    const record: InternalStepRecord = {
      stepId,
      lens,
      kind: 'DETERMINISTIC_LOCAL',
      status: 'VERIFIED',
      aiRequestsConsumed: 0,
      summary: `${description} (executed locally with 0 AI calls)`,
      timestamp: new Date().toISOString(),
    };
    this.steps.push(record);
    return { result, record };
  }

  /**
   * Switches specialist lens internally on ONE primary AI model, reusing compact
   * memory summaries instead of re-sending full repository files.
   */
  async executeSpecialistLens(
    stepId: string,
    lens: CoreSpecialistId | 'crazy',
    objective: string,
  ): Promise<{ output: string; status: string; record: InternalStepRecord }> {
    const compactContext = this.ledger
      ? this.ledger.buildCompactContextSummary(3200)
      : `Project=${this.context.title} Engine=${this.context.engine} Genre=${this.context.genre}`;

    const roleTitle =
      lens === 'crazy' ? 'Unified Single-AI Orchestrator' : CORE_SPECIALISTS[lens].title;
    const systemPrompt = `All-For-One V3.1 (${this.mode} Mode) — Active Lens: ${roleTitle}. Work within compact shared context without repeating full project files.`;
    const userPrompt = `Context:\n${compactContext}\n\nObjective:\n${objective}`;

    const beforeStats = this.adapter.getUsageStats();
    const res = await this.adapter.generate({ systemPrompt, userPrompt });
    const afterStats = this.adapter.getUsageStats();
    const consumed = Math.max(0, afterStats.aiRequestsExecuted - beforeStats.aiRequestsExecuted);

    const isQa = lens === 'crazyqa';
    const record: InternalStepRecord = {
      stepId,
      lens,
      kind: isQa ? 'SINGLE_AI_SELF_QA' : 'SINGLE_AI_LENS',
      status: isQa ? 'UNVERIFIED' : 'IMPLEMENTED',
      aiRequestsConsumed: consumed,
      summary: `${roleTitle}: ${objective} [${res.status}]`,
      timestamp: new Date().toISOString(),
    };
    this.steps.push(record);

    return {
      output: res.content,
      status: res.status,
      record,
    };
  }

  /**
   * Runs a dedicated verification phase (single-AI CrazyQA lens + real local predicate),
   * separating code/asset generation from verification truth.
   */
  runSeparateQaVerificationPhase(
    stepId: string,
    checkDescription: string,
    verifyFn: () => { passed: boolean; evidence: string; unverifiedReason?: string },
  ): InternalStepRecord {
    const outcome = verifyFn();
    const status: InternalStepRecord['status'] = outcome.unverifiedReason
      ? 'UNVERIFIED'
      : outcome.passed
        ? 'VERIFIED'
        : 'FAILED';

    const record: InternalStepRecord = {
      stepId,
      lens: 'crazyqa',
      kind: 'SINGLE_AI_SELF_QA',
      status,
      aiRequestsConsumed: 0,
      summary: `${checkDescription}: ${outcome.unverifiedReason ?? outcome.evidence}`,
      timestamp: new Date().toISOString(),
    };
    this.steps.push(record);
    return record;
  }

  getExecutionSummary() {
    const adapterStats = this.adapter.getUsageStats();
    return {
      mode: this.mode,
      multiAgentEnabled: this.isMultiAgentEnabled(),
      totalSteps: this.steps.length,
      deterministicTasksOffloaded: this.deterministicTasksSaved,
      aiRequestsExecuted: adapterStats.aiRequestsExecuted,
      cacheHits: adapterStats.cacheHits,
      offlineFallbacks: adapterStats.offlineFallbacks,
      steps: [...this.steps],
    };
  }
}
