// All For One — /crazycoder & /crazyqa Resource Lifecycle Tracker & Micro-Benchmark Harness
// Applicable to TypeScript / Three.js / Node runtimes (not for C++/Rust/C# builds).

export interface TrackedResource {
  id: string;
  kind: 'geometry' | 'material' | 'texture' | 'render-target' | 'audio-node' | 'timer' | 'custom';
  disposed: boolean;
  dispose: () => void;
}

export class ResourceLifecycleTracker {
  private readonly resources = new Map<string, TrackedResource>();

  track(
    id: string,
    kind: TrackedResource['kind'],
    dispose: () => void,
  ): TrackedResource {
    if (this.resources.has(id)) {
      throw new Error(`Duplicate tracked resource id "${id}".`);
    }
    const record: TrackedResource = { id, kind, disposed: false, dispose };
    this.resources.set(id, record);
    return record;
  }

  disposeOne(id: string): boolean {
    const rec = this.resources.get(id);
    if (!rec || rec.disposed) return false;
    rec.dispose();
    rec.disposed = true;
    return true;
  }

  disposeAll(): { disposedCount: number; errors: string[] } {
    let disposedCount = 0;
    const errors: string[] = [];
    for (const rec of this.resources.values()) {
      if (!rec.disposed) {
        try {
          rec.dispose();
          rec.disposed = true;
          disposedCount += 1;
        } catch (err) {
          errors.push(`${rec.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    return { disposedCount, errors };
  }

  detectLeaks(): TrackedResource[] {
    const leaks: TrackedResource[] = [];
    for (const rec of this.resources.values()) {
      if (!rec.disposed) leaks.push(rec);
    }
    return leaks;
  }

  getStats(): { total: number; active: number; disposed: number } {
    let active = 0;
    let disposed = 0;
    for (const rec of this.resources.values()) {
      if (rec.disposed) disposed += 1;
      else active += 1;
    }
    return { total: this.resources.size, active, disposed };
  }
}

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgNsPerOp: number;
  opsPerSec: number;
}

/** Deterministic synchronous micro-benchmark with warmup pass. */
export function runMicroBenchmark(
  name: string,
  iterations: number,
  fn: (i: number) => void,
  warmupIterations = Math.min(200, Math.floor(iterations * 0.1)),
): BenchmarkResult {
  for (let i = 0; i < warmupIterations; i++) {
    fn(i);
  }
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn(i);
  }
  const totalMs = Math.max(0.0001, performance.now() - start);
  const avgNsPerOp = (totalMs * 1_000_000) / iterations;
  const opsPerSec = Math.round((iterations / totalMs) * 1000);
  return {
    name,
    iterations,
    totalMs: Number(totalMs.toFixed(4)),
    avgNsPerOp: Number(avgNsPerOp.toFixed(2)),
    opsPerSec,
  };
}
