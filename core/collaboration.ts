import type { EngineId } from './engine-profiles.ts';

export type CoreSpecialistId = 'crazymaker' | 'crazydesigner' | 'crazycoder' | 'crazyqa';
export type ExtensionDomainId =
  | 'audio_engineering'
  | 'multiplayer_networking'
  | 'world_generation'
  | 'technical_art'
  | 'animation'
  | 'build_engineering'
  | 'narrative_design';
export type SpecialistId = CoreSpecialistId | ExtensionDomainId | (string & {});

export type TaskStatus =
  | 'PENDING'
  | 'BLOCKED'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'COMPLETED'
  | 'FAILED';

export type ReviewState = 'NOT_REVIEWED' | 'PENDING_REVIEW' | 'APPROVED' | 'CHANGES_REQUESTED';

export interface SpecialistDescriptor {
  id: SpecialistId;
  title: string;
  isCore: boolean;
  capabilities: string[];
}

export interface VerificationEvidence {
  summary: string;
  commandsRun?: string[];
  artifacts?: string[];
  timestamp: string;
}

export interface TaskContract {
  id: string;
  assignedSpecialist: SpecialistId;
  objective: string;
  requiredInputs: string[];
  expectedOutputs: string[];
  dependencies: string[];
  acceptanceCriteria: string[];
  verificationEvidence: VerificationEvidence | null;
  status: TaskStatus;
  reviewState: ReviewState;
  attemptCount: number;
  maxRetries: number;
  failureReason: string | null;
  handoffNotes: string[];
}

export interface SharedProjectContext {
  projectId: string;
  title: string;
  engine: EngineId;
  genre: string;
  createdAt: string;
  decisions: Array<{ id: string; owner: SpecialistId; summary: string; timestamp: string }>;
  artifacts: Record<string, { owner: SpecialistId; path: string; verified: boolean }>;
}

export interface HandoffRecord {
  fromTaskId: string;
  fromSpecialist: SpecialistId;
  toSpecialist: SpecialistId;
  timestamp: string;
  outputsProvided: string[];
  notes: string;
}

export const CORE_SPECIALISTS: Record<CoreSpecialistId, SpecialistDescriptor> = {
  crazymaker: {
    id: 'crazymaker',
    title: 'Game Director',
    isCore: true,
    capabilities: ['gameplay-design', 'genre-systems', 'balancing', 'ai-behavior', 'quests', 'economies'],
  },
  crazydesigner: {
    id: 'crazydesigner',
    title: 'Visual Director',
    isCore: true,
    capabilities: ['pbr-materials', 'lighting', 'shaders', 'vfx', 'cinematics', 'animation', 'audio'],
  },
  crazycoder: {
    id: 'crazycoder',
    title: 'Engineering Director',
    isCore: true,
    capabilities: ['architecture', 'ecs', 'physics', 'memory', 'networking', 'serialization', 'optimization'],
  },
  crazyqa: {
    id: 'crazyqa',
    title: 'Quality Assurance Director',
    isCore: true,
    capabilities: ['static-analysis', 'unit-tests', 'build-verification', 'runtime-qa', 'visual-qa', 'benchmarks'],
  },
};

export const EXTENSION_HOOKS: Record<ExtensionDomainId, SpecialistDescriptor> = {
  audio_engineering: {
    id: 'audio_engineering',
    title: 'Audio Engineering Extension',
    isCore: false,
    capabilities: ['spatial-hrtf', 'dsp-mixing', 'adaptive-stems', 'occlusion'],
  },
  multiplayer_networking: {
    id: 'multiplayer_networking',
    title: 'Multiplayer Networking Extension',
    isCore: false,
    capabilities: ['replication', 'client-prediction', 'lag-compensation', 'authoritative-server'],
  },
  world_generation: {
    id: 'world_generation',
    title: 'World Generation Extension',
    isCore: false,
    capabilities: ['procedural-terrain', 'biomes', 'streaming-cells', 'pcg-graphs'],
  },
  technical_art: {
    id: 'technical_art',
    title: 'Technical Art Extension',
    isCore: false,
    capabilities: ['shader-authoring', 'lod-pipelines', 'rig-tools', 'gpu-profiling'],
  },
  animation: {
    id: 'animation',
    title: 'Animation & Motion Extension',
    isCore: false,
    capabilities: ['video-mocap', 'rig-check', 'retargeting', 'motion-cleanup'],
  },
  build_engineering: {
    id: 'build_engineering',
    title: 'Build Engineering Extension',
    isCore: false,
    capabilities: ['ci-pipelines', 'cross-compile', 'packaging', 'release-manifests'],
  },
  narrative_design: {
    id: 'narrative_design',
    title: 'Narrative Design Extension',
    isCore: false,
    capabilities: ['branching-dialogue', 'quest-graphs', 'world-lore', 'pacing'],
  },
};

export class CollaborationCoordinator {
  public readonly context: SharedProjectContext;
  private readonly specialists = new Map<string, SpecialistDescriptor>();
  private readonly tasks = new Map<string, TaskContract>();
  private readonly handoffs: HandoffRecord[] = [];

  constructor(context: SharedProjectContext) {
    this.context = context;
    for (const spec of Object.values(CORE_SPECIALISTS)) {
      this.specialists.set(spec.id, spec);
    }
  }

  /** Registers an optional specialist extension without modifying core workflow logic. */
  registerSpecialist(descriptor: SpecialistDescriptor): void {
    this.specialists.set(descriptor.id, descriptor);
  }

  listSpecialists(): SpecialistDescriptor[] {
    return [...this.specialists.values()];
  }

  addTask(
    input: Omit<
      TaskContract,
      | 'status'
      | 'reviewState'
      | 'attemptCount'
      | 'maxRetries'
      | 'verificationEvidence'
      | 'failureReason'
      | 'handoffNotes'
    > & { maxRetries?: number },
  ): TaskContract {
    if (!this.specialists.has(input.assignedSpecialist)) {
      throw new Error(`Unregistered specialist "${input.assignedSpecialist}" on task "${input.id}".`);
    }
    if (this.tasks.has(input.id)) {
      throw new Error(`Duplicate task ID "${input.id}".`);
    }
    const task: TaskContract = {
      ...input,
      maxRetries: input.maxRetries ?? 2,
      verificationEvidence: null,
      status: input.dependencies.length > 0 ? 'BLOCKED' : 'PENDING',
      reviewState: 'NOT_REVIEWED',
      attemptCount: 0,
      failureReason: null,
      handoffNotes: [],
    };
    this.tasks.set(task.id, task);
    this.assertAcyclicGraph();
    this.refreshBlockedStates();
    return task;
  }

  getTask(id: string): TaskContract {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task "${id}".`);
    return task;
  }

  listTasks(): TaskContract[] {
    return [...this.tasks.values()];
  }

  getHandoffs(): HandoffRecord[] {
    return [...this.handoffs];
  }

  /** Validates that all dependencies exist and form a valid DAG (no cycles). */
  assertAcyclicGraph(): void {
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Dependency cycle detected involving task "${id}".`);
      }
      visiting.add(id);
      const task = this.tasks.get(id);
      if (task) {
        for (const dep of task.dependencies) {
          if (this.tasks.has(dep)) visit(dep);
        }
      }
      visiting.delete(id);
      visited.add(id);
    };

    for (const id of this.tasks.keys()) {
      visit(id);
    }
  }

  private refreshBlockedStates(): void {
    for (const task of this.tasks.values()) {
      if (task.status === 'COMPLETED' || task.status === 'IN_PROGRESS' || task.status === 'IN_REVIEW') {
        continue;
      }
      const allDepsApproved = task.dependencies.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'COMPLETED' && dep.reviewState === 'APPROVED';
      });
      if (task.status === 'FAILED' && task.attemptCount <= task.maxRetries) {
        continue;
      }
      if (task.status !== 'FAILED') {
        task.status = allDepsApproved ? 'PENDING' : 'BLOCKED';
      }
    }
  }

  getReadyTasks(): TaskContract[] {
    this.refreshBlockedStates();
    return [...this.tasks.values()].filter((t) => t.status === 'PENDING');
  }

  startTask(taskId: string): TaskContract {
    this.refreshBlockedStates();
    const task = this.getTask(taskId);
    if (task.status === 'BLOCKED') {
      throw new Error(`Cannot start blocked task "${taskId}": upstream dependencies are not approved.`);
    }
    if (task.status === 'FAILED' && task.attemptCount > task.maxRetries) {
      throw new Error(`Task "${taskId}" exhausted retry budget (${task.maxRetries}).`);
    }
    task.status = 'IN_PROGRESS';
    task.attemptCount += 1;
    task.failureReason = null;
    return task;
  }

  submitForReview(taskId: string, evidence: VerificationEvidence): TaskContract {
    const task = this.getTask(taskId);
    if (task.status !== 'IN_PROGRESS') {
      throw new Error(`Task "${taskId}" must be IN_PROGRESS before submitting for review.`);
    }
    if (!evidence || !evidence.summary || evidence.summary.trim().length < 5) {
      throw new Error(
        `Anti-fabrication guard: task "${taskId}" cannot enter review without concrete verificationEvidence.`,
      );
    }
    task.verificationEvidence = evidence;
    task.status = 'IN_REVIEW';
    task.reviewState = 'PENDING_REVIEW';
    return task;
  }

  reviewTask(taskId: string, decision: 'APPROVE' | 'REQUEST_CHANGES', notes: string): TaskContract {
    const task = this.getTask(taskId);
    if (task.status !== 'IN_REVIEW') {
      throw new Error(`Task "${taskId}" is not IN_REVIEW.`);
    }
    if (decision === 'APPROVE') {
      if (!task.verificationEvidence) {
        throw new Error(`Cannot approve task "${taskId}" without verificationEvidence.`);
      }
      task.reviewState = 'APPROVED';
      task.status = 'COMPLETED';
      task.handoffNotes.push(`APPROVED: ${notes}`);
    } else {
      task.reviewState = 'CHANGES_REQUESTED';
      task.status = 'PENDING';
      task.handoffNotes.push(`CHANGES_REQUESTED: ${notes}`);
    }
    this.refreshBlockedStates();
    return task;
  }

  recordFailure(taskId: string, reason: string): { task: TaskContract; canRetry: boolean } {
    const task = this.getTask(taskId);
    task.failureReason = reason;
    const canRetry = task.attemptCount <= task.maxRetries;
    task.status = canRetry ? 'PENDING' : 'FAILED';
    task.reviewState = 'NOT_REVIEWED';
    task.handoffNotes.push(`FAILURE (attempt ${task.attemptCount}): ${reason}`);
    this.refreshBlockedStates();
    return { task, canRetry };
  }

  handoff(fromTaskId: string, toTaskId: string, notes: string): HandoffRecord {
    const fromTask = this.getTask(fromTaskId);
    const toTask = this.getTask(toTaskId);
    if (fromTask.status !== 'COMPLETED' || fromTask.reviewState !== 'APPROVED') {
      throw new Error(
        `Cannot hand off from "${fromTaskId}" before it is COMPLETED and APPROVED.`,
      );
    }
    const record: HandoffRecord = {
      fromTaskId,
      fromSpecialist: fromTask.assignedSpecialist,
      toSpecialist: toTask.assignedSpecialist,
      timestamp: new Date().toISOString(),
      outputsProvided: [...fromTask.expectedOutputs],
      notes,
    };
    this.handoffs.push(record);
    toTask.handoffNotes.push(`From ${fromTask.assignedSpecialist} (${fromTaskId}): ${notes}`);
    return record;
  }

  getProgressSummary() {
    const all = this.listTasks();
    const completed = all.filter((t) => t.status === 'COMPLETED').length;
    const failed = all.filter((t) => t.status === 'FAILED').length;
    const inProgress = all.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'IN_REVIEW').length;
    const pendingOrBlocked = all.length - completed - failed - inProgress;
    return {
      total: all.length,
      completed,
      failed,
      inProgress,
      pendingOrBlocked,
      percentComplete: all.length === 0 ? 100 : Math.round((completed / all.length) * 100),
    };
  }
}

/**
 * Builds the canonical sequential collaboration pipeline for `/crazy`.
 */
export function createStandardCrazyPipeline(
  context: SharedProjectContext,
): CollaborationCoordinator {
  const coord = new CollaborationCoordinator(context);

  coord.addTask({
    id: 'T1-GAME-DESIGN',
    assignedSpecialist: 'crazymaker',
    objective: `Author gameplay specification, ${context.genre} systems, balancing metrics, and acceptance tests.`,
    requiredInputs: ['User Prompt', 'Engine Profile'],
    expectedOutputs: ['Gameplay Specification', 'System Dependencies', 'Balancing & Acceptance Criteria'],
    dependencies: [],
    acceptanceCriteria: [
      'Core loop and mechanics explicitly specified',
      'Genre profile requirements and failure states defined',
      'Measurable acceptance tests written before code generation',
    ],
  });

  coord.addTask({
    id: 'T2-VISUAL-AUDIO-SPEC',
    assignedSpecialist: 'crazydesigner',
    objective: `Design ${context.engine} rendering pipeline, PBR materials, lighting, VFX, camera/shot plan, and audio.`,
    requiredInputs: ['Gameplay Specification', 'Engine Profile'],
    expectedOutputs: ['Visual & Material Spec', 'Lighting/Camera Breakdown', 'Spatial Audio Spec'],
    dependencies: ['T1-GAME-DESIGN'],
    acceptanceCriteria: [
      'Engine-appropriate rendering & shader strategy selected',
      'Shot/camera framing and PBR bounds specified',
      'Visual acceptance criteria defined',
    ],
  });

  coord.addTask({
    id: 'T3-ENGINE-IMPLEMENTATION',
    assignedSpecialist: 'crazycoder',
    objective: `Implement modular ${context.engine} systems, simulation, memory lifecycle, and engine-specific code.`,
    requiredInputs: ['Gameplay Specification', 'Visual & Material Spec', 'Engine Profile'],
    expectedOutputs: ['Modular Source Code', 'Unit Tests', 'Performance Notes & Trade-offs'],
    dependencies: ['T1-GAME-DESIGN', 'T2-VISUAL-AUDIO-SPEC'],
    acceptanceCriteria: [
      'No foreign engine APIs present',
      'Resource lifecycle and error recovery handled',
      'Build compiles cleanly and pure logic tests pass',
    ],
  });

  coord.addTask({
    id: 'T4-INDEPENDENT-QA',
    assignedSpecialist: 'crazyqa',
    objective: 'Independently verify static analysis, unit tests, builds, runtime behavior, and visual evidence.',
    requiredInputs: ['Modular Source Code', 'Acceptance Criteria', 'Visual Acceptance Criteria'],
    expectedOutputs: ['VERIFICATION_REPORT.md'],
    dependencies: ['T3-ENGINE-IMPLEMENTATION'],
    acceptanceCriteria: [
      'Every requirement tagged VERIFIED, PARTIALLY_VERIFIED, UNVERIFIED, or FAILED with evidence',
      'No fabricated test claims or missing evidence',
    ],
  });

  return coord;
}
