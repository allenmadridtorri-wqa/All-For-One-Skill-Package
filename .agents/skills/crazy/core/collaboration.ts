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

export interface AgentMessage {
  id: string;
  fromSpecialist: SpecialistId | 'crazy';
  toSpecialist: SpecialistId | 'crazy';
  taskId?: string;
  kind: 'HANDOFF' | 'CONFLICT_RAISE' | 'CONFLICT_RESOLUTION' | 'REVIEW_FEEDBACK' | 'FAILURE_ESCALATION';
  payload: string;
  timestamp: string;
}

export interface ConflictRecord {
  id: string;
  raisedBy: SpecialistId;
  between: [SpecialistId, SpecialistId];
  topic: string;
  status: 'OPEN' | 'RESOLVED';
  resolution?: string;
  resolvedBy?: SpecialistId | 'crazy';
  timestamp: string;
}

export const CORE_SPECIALISTS: Record<CoreSpecialistId, SpecialistDescriptor> = {
  crazymaker: {
    id: 'crazymaker',
    title: 'Game Director & Technical Producer',
    isCore: true,
    capabilities: [
      'gameplay-design',
      'genre-systems',
      'balancing',
      'ai-behavior',
      'quests',
      'economies',
      'project-implementation',
    ],
  },
  crazydesigner: {
    id: 'crazydesigner',
    title: 'Visual & 3D Production Director',
    isCore: true,
    capabilities: [
      'pbr-materials',
      'lighting',
      'shaders',
      'vfx',
      'cinematics',
      'animation',
      'audio',
      'blender-automation',
      'asset-pipelines',
    ],
  },
  crazycoder: {
    id: 'crazycoder',
    title: 'Engineering Director',
    isCore: true,
    capabilities: [
      'architecture',
      'ecs',
      'physics',
      'memory',
      'networking',
      'serialization',
      'optimization',
      'software-engineering',
    ],
  },
  crazyqa: {
    id: 'crazyqa',
    title: 'Quality Assurance Director',
    isCore: true,
    capabilities: [
      'static-analysis',
      'unit-tests',
      'build-verification',
      'runtime-qa',
      'visual-qa',
      'benchmarks',
      'security-qa',
    ],
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
  private readonly messages: AgentMessage[] = [];
  private readonly conflicts = new Map<string, ConflictRecord>();

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

  sendMessage(msg: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
    const full: AgentMessage = {
      ...msg,
      id: `MSG-${this.messages.length + 1}`,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(full);
    return full;
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  raiseConflict(
    id: string,
    raisedBy: SpecialistId,
    between: [SpecialistId, SpecialistId],
    topic: string,
  ): ConflictRecord {
    const rec: ConflictRecord = {
      id,
      raisedBy,
      between,
      topic,
      status: 'OPEN',
      timestamp: new Date().toISOString(),
    };
    this.conflicts.set(id, rec);
    this.sendMessage({
      fromSpecialist: raisedBy,
      toSpecialist: 'crazy',
      kind: 'CONFLICT_RAISE',
      payload: `Conflict ${id} between ${between.join(' & ')}: ${topic}`,
    });
    return rec;
  }

  resolveConflict(
    id: string,
    resolution: string,
    resolvedBy: SpecialistId | 'crazy' = 'crazy',
  ): ConflictRecord {
    const rec = this.conflicts.get(id);
    if (!rec) throw new Error(`Unknown conflict "${id}".`);
    rec.status = 'RESOLVED';
    rec.resolution = resolution;
    rec.resolvedBy = resolvedBy;
    this.context.decisions.push({
      id: `DEC-${this.context.decisions.length + 1}`,
      owner: resolvedBy === 'crazy' ? 'crazymaker' : resolvedBy,
      summary: `[Conflict ${id}] ${resolution}`,
      timestamp: new Date().toISOString(),
    });
    this.sendMessage({
      fromSpecialist: resolvedBy,
      toSpecialist: rec.between[0],
      kind: 'CONFLICT_RESOLUTION',
      payload: resolution,
    });
    return rec;
  }

  getConflicts(): ConflictRecord[] {
    return [...this.conflicts.values()];
  }

  registerArtifact(key: string, owner: SpecialistId, artifactPath: string, verified = false): void {
    this.context.artifacts[key] = { owner, path: artifactPath, verified };
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
      this.sendMessage({
        fromSpecialist: 'crazyqa',
        toSpecialist: task.assignedSpecialist,
        taskId,
        kind: 'REVIEW_FEEDBACK',
        payload: `APPROVED: ${notes}`,
      });
    } else {
      task.reviewState = 'CHANGES_REQUESTED';
      task.status = 'PENDING';
      task.handoffNotes.push(`CHANGES_REQUESTED: ${notes}`);
      this.sendMessage({
        fromSpecialist: 'crazyqa',
        toSpecialist: task.assignedSpecialist,
        taskId,
        kind: 'REVIEW_FEEDBACK',
        payload: `CHANGES_REQUESTED: ${notes}`,
      });
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
    this.sendMessage({
      fromSpecialist: task.assignedSpecialist,
      toSpecialist: 'crazy',
      taskId,
      kind: 'FAILURE_ESCALATION',
      payload: `Failure attempt ${task.attemptCount}/${task.maxRetries + 1}: ${reason}`,
    });
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
    this.sendMessage({
      fromSpecialist: fromTask.assignedSpecialist,
      toSpecialist: toTask.assignedSpecialist,
      taskId: toTaskId,
      kind: 'HANDOFF',
      payload: notes,
    });
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

/**
 * Intelligently decomposes a user goal into minimal required specialist TaskContracts
 * with explicit dependencies and independent CRAZY QA verification.
 */
export function decomposeGoalIntoTasks(
  goal: string,
  context: SharedProjectContext,
): CollaborationCoordinator {
  const lower = goal.toLowerCase();
  const needsBlenderOr3D =
    /\b(?:blender|\.blend|geometry nodes|3d asset|fbx|gltf|glb|pbr|shader|render|rigging|animation)\b/.test(
      lower,
    );
  const needsGameDesign =
    /\b(?:game|gameplay|rpg|open-world|sandbox|survival|strategy|multiplayer|quest|economy|npc|combat)\b/.test(
      lower,
    );
  const needsCode =
    /\b(?:code|implement|script|build|api|refactor|ecs|physics|shader|python|typescript|c\+\+|rust|c#|gdscript)\b/.test(
      lower,
    ) ||
    needsGameDesign ||
    needsBlenderOr3D;

  if (needsGameDesign && needsBlenderOr3D && needsCode) {
    return createStandardCrazyPipeline(context);
  }

  const coord = new CollaborationCoordinator(context);
  const qaDeps: string[] = [];

  if (needsGameDesign) {
    coord.addTask({
      id: 'T1-DESIGN-PLAN',
      assignedSpecialist: 'crazymaker',
      objective: `Specify mechanics, system dependencies, and acceptance tests for: ${goal}`,
      requiredInputs: ['User Goal', 'Engine Profile'],
      expectedOutputs: ['Technical Specification', 'Acceptance Criteria'],
      dependencies: [],
      acceptanceCriteria: ['Clear inputs, outputs, and testable invariants'],
    });
    qaDeps.push('T1-DESIGN-PLAN');
  }

  if (needsBlenderOr3D) {
    coord.addTask({
      id: 'T2-VISUAL-3D-PIPELINE',
      assignedSpecialist: 'crazydesigner',
      objective: `Create, render, inspect, and export validated visual/3D assets for: ${goal}`,
      requiredInputs: qaDeps.includes('T1-DESIGN-PLAN') ? ['Technical Specification'] : ['User Goal'],
      expectedOutputs: ['Visual Assets / Blender Script', 'Exported Asset Report', 'Render Inspection Notes'],
      dependencies: qaDeps.includes('T1-DESIGN-PLAN') ? ['T1-DESIGN-PLAN'] : [],
      acceptanceCriteria: [
        'Blender availability detected cleanly',
        'Visual iteration (Create->Render->Inspect->Diagnose->Improve) logged',
      ],
    });
    qaDeps.push('T2-VISUAL-3D-PIPELINE');
  }

  if (needsCode) {
    const codeDeps = [...qaDeps];
    coord.addTask({
      id: 'T3-IMPLEMENTATION',
      assignedSpecialist: 'crazycoder',
      objective: `Implement modular, tested ${context.engine} software/systems for: ${goal}`,
      requiredInputs: codeDeps.length > 0 ? ['Upstream Specifications'] : ['User Goal'],
      expectedOutputs: ['Source Code', 'Unit Tests'],
      dependencies: codeDeps,
      acceptanceCriteria: ['No foreign engine APIs', 'Zero hardcoded secrets', 'Unit tests pass'],
    });
    qaDeps.push('T3-IMPLEMENTATION');
  }

  coord.addTask({
    id: 'T4-QA-VERIFICATION',
    assignedSpecialist: 'crazyqa',
    objective: 'Run static, security, test, build, and visual/asset verification with strict status reporting.',
    requiredInputs: qaDeps.length > 0 ? ['Task Outputs'] : ['Workspace State'],
    expectedOutputs: ['VERIFICATION_REPORT.md'],
    dependencies: qaDeps,
    acceptanceCriteria: ['Every claim backed by real command/artifact evidence or marked UNVERIFIED'],
  });

  return coord;
}
