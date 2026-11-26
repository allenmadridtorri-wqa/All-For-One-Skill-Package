// All For One — /crazycoder Deterministic Fixed-Timestep Loop (Zero-GC Hot Path)

export interface FixedTimestepConfig {
  /** Fixed simulation delta in seconds (default: 1/60). */
  fixedDt?: number;
  /** Maximum frame delta clamped to prevent spiral of death on tab switch (default: 0.1s). */
  maxFrameDt?: number;
  /** Maximum substeps per frame (default: 5). */
  maxSubsteps?: number;
}

export interface FixedTimestepState {
  readonly fixedDt: number;
  readonly maxFrameDt: number;
  readonly maxSubsteps: number;
  accumulator: number;
  lastTimestampMs: number;
  stepCount: number;
  alpha: number;
}

export function createFixedTimestep(config: FixedTimestepConfig = {}): FixedTimestepState {
  return {
    fixedDt: config.fixedDt ?? 1 / 60,
    maxFrameDt: config.maxFrameDt ?? 0.1,
    maxSubsteps: config.maxSubsteps ?? 5,
    accumulator: 0,
    lastTimestampMs: -1,
    stepCount: 0,
    alpha: 0,
  };
}

/**
 * Advances simulation in deterministic fixed steps without heap allocations.
 * Returns the number of fixed steps executed this frame.
 */
export function advanceFixedTimestep(
  state: FixedTimestepState,
  nowMs: number,
  onFixedStep: (fixedDt: number, stepIndex: number) => void,
): number {
  if (state.lastTimestampMs < 0) {
    state.lastTimestampMs = nowMs;
    state.alpha = 0;
    return 0;
  }

  let frameDt = (nowMs - state.lastTimestampMs) * 0.001;
  state.lastTimestampMs = nowMs;

  if (frameDt < 0) frameDt = 0;
  if (frameDt > state.maxFrameDt) frameDt = state.maxFrameDt;

  state.accumulator += frameDt;

  let steps = 0;
  while (state.accumulator >= state.fixedDt && steps < state.maxSubsteps) {
    onFixedStep(state.fixedDt, state.stepCount);
    state.accumulator -= state.fixedDt;
    state.stepCount += 1;
    steps += 1;
  }

  // Clamp residual accumulator if maxSubsteps saturated
  if (steps === state.maxSubsteps && state.accumulator > state.fixedDt) {
    state.accumulator = state.fixedDt * 0.5;
  }

  state.alpha = state.accumulator / state.fixedDt;
  return steps;
}
