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
