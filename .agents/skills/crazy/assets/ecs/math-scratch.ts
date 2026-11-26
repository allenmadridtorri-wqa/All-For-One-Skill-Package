// All For One — /crazycoder Deterministic PRNG & Pre-Allocated Scratch Math

/**
 * Deterministic 32-bit PRNG (Mulberry32). Returns floats in [0, 1).
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Frame-rate independent exponential smoothing factor: 1 - exp(-speed * dt). */
export function expDampFactor(stiffness: number, dt: number): number {
  return 1 - Math.exp(-stiffness * dt);
}

/** Exponentially damped scalar interpolation (consistent across 30/60/144Hz). */
export function dampScalar(current: number, target: number, stiffness: number, dt: number): number {
  const factor = expDampFactor(stiffness, dt);
  return current + (target - current) * factor;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Pre-allocated scratch buffers for zero-GC vector/matrix work. */
export const SCRATCH_VEC3_A = new Float64Array(3);
export const SCRATCH_VEC3_B = new Float64Array(3);
export const SCRATCH_VEC3_C = new Float64Array(3);
export const SCRATCH_MAT4 = new Float32Array(16);
