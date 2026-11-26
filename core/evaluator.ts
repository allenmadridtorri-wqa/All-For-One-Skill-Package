import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { detectBlenderInstallation } from './blender-bridge.ts';
import {
  detectEngineFromText,
  validateEngineCompatibility,
  type EngineId,
} from './engine-profiles.ts';
import { retrieveTaskKnowledge } from './knowledge-retrieval.ts';
import { detectHardwareProfile } from './production-intelligence.ts';

export type EvalCategory =
  | 'specialist-selection'
  | 'multi-skill-routing'
  | 'ambiguous-request'
  | 'conflicting-instructions'
  | 'tool-use-decision'
  | 'instruction-compliance'
  | 'technical-correctness'
  | 'failure-recovery'
  | 'coding-accuracy'
  | 'architecture-quality'
  | 'debugging'
  | 'technical-research'
  | 'game-development'
  | 'blender-automation'
  | '3d-production-quality'
  | 'visual-asset-pipelines'
  | 'qa-accuracy'
  | 'task-coordination'
  | 'security'
  | 'resource-efficiency';

export type PredictedSpecialist =
  | 'crazymaker'
  | 'crazydesigner'
  | 'crazycoder'
  | 'crazyqa'
  | 'crazy';

export type ExpectedAction =
  | 'route-specialist'
  | 'orchestrate-multi'
  | 'ask-clarification'
  | 'reject-conflict'
  | 'run-verification-tool'
  | 'trigger-retry-recovery';

export interface EvalCaseV2 {
  id: string;
  category: EvalCategory;
  prompt: string;
  expectedSpecialist: PredictedSpecialist;
  expectedAction: ExpectedAction;
  targetEngine?: EngineId;
  codeSnippet?: string;
  requiredToolAction?: string;
  shouldClarify?: boolean;
  shouldDetectConflict?: boolean;
}

export interface EvalCaseResult {
  id: string;
  category: EvalCategory;
  passed: boolean;
  predictedSpecialist: PredictedSpecialist;
  expectedSpecialist: PredictedSpecialist;
  predictedAction: ExpectedAction;
  expectedAction: ExpectedAction;
  detectedEngine: EngineId | null;
  conflictDetected: boolean;
  knowledgeDocsRetrieved: number;
  notes: string;
}

export interface EvaluationReportV2 {
  version: '2.0.0';
  generatedAt: string;
  evaluationMode: 'deterministic-static-and-policy';
  liveModelEvaluationStatus: 'UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER';
  totalCases: number;
  passedCases: number;
  accuracyPercent: number;
  byCategory: Record<string, { total: number; passed: number; accuracyPercent: number }>;
  results: EvalCaseResult[];
}

const SPECIALIST_SIGNALS: Record<Exclude<PredictedSpecialist, 'crazy'>, Array<{ re: RegExp; weight: number }>> = {
  crazymaker: [
    { re: /\b(?:open[- ]?world|sandbox|mmorpg|rpg|survival|simulation|economy|quest|progression|emergent)\b/i, weight: 3 },
    { re: /\bmultiplayer\b(?!\s+(?:sync|packet|netcode|socket|replication))/i, weight: 3 },
    { re: /\bstrategy\b(?<!\b(?:qa|test|regression)\s+)/i, weight: 3 },
    { re: /\b(?:game[- ]?feel|hitstop|coyote|camera shake|npc|behavior tree|utility ai|faction|wanted|loot|combat ai|combat loop)\b/i, weight: 3 },
    { re: /\b(?:game design|balancing|core loop|skill tree|crafting|traversal|drift|vehicle)\b/i, weight: 2 },
  ],
  crazydesigner: [
    { re: /\b(?:pbr|aces|filmic|lighting|kelvin|hdri|ibl|shader|glsl|wgsl|hlsl|vfx|niagara|post-?processing|bloom)\b/i, weight: 3 },
    { re: /\b(?:material|roughness|metalness|cinematic|shot plan|camera framing|storytelling|spatial\b.*\baudio|hrtf|foley)\b/i, weight: 3 },
    { re: /\b(?:mocap|motion capture|rigging|rig\b|retargeting|animation cleanup|blender|bpy|geometry nodes|\.blend|cycles|eevee|rigify|mesh2motion|freemocap|character appearance|render job|checkpoint|gerstner|water)\b/i, weight: 3 },
    { re: /\b(?:visual iteration|look-dev|render output|fbx export|gltf|glb export)\b/i, weight: 3 },
  ],
  crazycoder: [
    { re: /\b(?:ecs|entity[- ]?component|fixed[- ]?timestep|object pool|memory leak|zero[- ]?gc|hot[- ]?loop|multithreading|job system)\b/i, weight: 3 },
    { re: /\b(?:networking|replication|prediction|serialization|save system|save file|procedural generation|bvh|octree|draw[- ]?call|instancedmesh|multimesh|raycastnonalloc|addressables|soft pointers|dispose|batching|shader uniform)\b/i, weight: 4 },
    { re: /\b(?:multiplayer sync|out-of-order packet|packet|mid-install|force overwrite|destructive|constrained.*hardware|model adapter|express rest|dto schemas|kinematicbody|characterbody3d|carg\.toml|cargo\.toml|cmakelists|asmdef|ts\d{4}|diagnose ts\d+|mass entity|actor-component|gas\b)\b/i, weight: 4 },
    { re: /\b(?:refactor|architecture|physics optimization|rendering optimization|arena memory|installer|rollback|resourceloader|streaming|c\+\+|rust|bevy|wgpu|c#|gdscript|typescript)\b/i, weight: 2 },
  ],
  crazyqa: [
    { re: /\b(?:qa|verify|verification|audit)\b/i, weight: 3 },
    { re: /\bunit test\b/i, weight: 3 },
    { re: /\bintegration test\b/i, weight: 3 },
    { re: /\b(?:e2e|end-to-end|regression|soak test)\b/i, weight: 3 },
    { re: /\b(?:benchmark|profiler|crash|screenshot|visual check|memory profile|static analysis|dependency|build verification|smoke test|leak detection|hot-loop allocation|security scan|path traversal|symlink)\b/i, weight: 3 },
    { re: /\b(?:partially verified|unverified|failed test|ci pipeline|retry budget|escalate failure|report failed|provenance|outdated reference)\b/i, weight: 2 },
  ],
};

function isAmbiguousPrompt(prompt: string): boolean {
  const words = prompt.trim().split(/\s+/);
  const lower = prompt.toLowerCase();
  if (/\/(crazymaker|crazydesigner|crazycoder|crazyqa|crazy)\b/.test(lower)) return false;
  const vaguePhrases =
    /^(?:make|build|fix|improve|help|create|optimize|update|do)\s+(?:a\s+)?(?:game|it|this|the project|something|things|my app|scene)\.?$/i;
  if (vaguePhrases.test(prompt.trim())) return true;
  if (
    words.length <= 6 &&
    !/\b(?:ecs|pbr|shader|qa|test|unity|unreal|ue5|godot|three\.?js|rust|c\+\+|mocap|quest|economy|profiler|benchmark)\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  return false;
}

function detectInstructionConflict(
  prompt: string,
  targetEngine?: EngineId,
  codeSnippet?: string,
): boolean {
  const lower = prompt.toLowerCase();

  if (
    /\b(?:skip|without running|fake|fabricate|claim)\b.*\b(?:test|verified|qa|screenshot|benchmark)\b/i.test(
      lower,
    ) ||
    /\bmark\b.*\bverified\b.*\bwithout\b/i.test(lower) ||
    /\bwithout profiling\b/i.test(lower)
  ) {
    return true;
  }

  if (
    /\b(?:ignore engine|mix three\.js.*unreal|use three\.js.*unity|use monobehaviour.*unreal|use uclass.*godot)\b/i.test(
      lower,
    )
  ) {
    return true;
  }

  if (targetEngine && codeSnippet) {
    if (validateEngineCompatibility(targetEngine, codeSnippet).length > 0) {
      return true;
    }
  }

  if (targetEngine) {
    if (
      targetEngine !== 'threejs' &&
      /\bthree\.js\b|\bmeshstandardmaterial\b|\bwebgldraw\b|\bthree\.\w+/i.test(lower)
    ) {
      return true;
    }
    if (
      targetEngine !== 'unity' &&
      /\bmonobehaviour\b|\bscriptableobject\b|\burp\b|\bhdrp\b/i.test(lower)
    ) {
      return true;
    }
    if (
      targetEngine !== 'unreal5' &&
      /\buclass\b|\baactor\b|\buproperty\b|\bunreal\b|\bue5\b/i.test(lower)
    ) {
      return true;
    }
    if (
      targetEngine !== 'godot' &&
      /\bcharacterbody3d\b|\b_physics_process\b|\bgdscript\b|\bgodot\b/i.test(lower)
    ) {
      return true;
    }
  }

  return false;
}

export function evaluateDeterministicCase(rootDir: string, c: EvalCaseV2): EvalCaseResult {
  const lower = c.prompt.toLowerCase();
  const detectedEngine = c.targetEngine ?? detectEngineFromText(c.prompt);
  const conflictDetected = detectInstructionConflict(c.prompt, c.targetEngine, c.codeSnippet);
  const ambiguous = isAmbiguousPrompt(c.prompt);

  let predictedSpecialist: PredictedSpecialist = 'crazy';
  let predictedAction: ExpectedAction = 'route-specialist';

  const slashMatch = c.prompt.match(/\/(crazymaker|crazydesigner|crazycoder|crazyqa|crazy)\b/i);
  const isToolVerificationRequest =
    ((/^(?:run|execute|audit|verify|profile)\b/i.test(c.prompt.trim()) &&
      !/\bvisual iteration\b/i.test(lower)) ||
      /\b(?:run|execute)\b.*\b(?:unit test|audit|benchmark|hot-loop|profiler|verification|regression|leak detection|screenshot|security scan)\b/i.test(
        lower,
      ) ||
      /\bverify\b.*\b(?:render screenshot|documentation provenance)\b/i.test(lower));
  const isFailureRecoveryRequest =
    /\b(?:failed|failure|crashed|broken build|recovery|recover|exhausted|interrupted|corrupt save|regressed)\b/i.test(
      lower,
    ) ||
    (/\brollback\b/i.test(lower) && !/\benforce\b/i.test(lower));

  if (slashMatch) {
    predictedSpecialist = slashMatch[1].toLowerCase() as PredictedSpecialist;
  } else {
    const scores = (
      Object.keys(SPECIALIST_SIGNALS) as Array<Exclude<PredictedSpecialist, 'crazy'>>
    ).map((spec) => {
      let score = 0;
      for (const sig of SPECIALIST_SIGNALS[spec]) {
        if (sig.re.test(c.prompt)) score += sig.weight;
      }
      return { spec, score };
    });
    scores.sort((a, b) => b.score - a.score);

    const isExplicitOrchestration =
      /\b(?:(?:build|create|develop|start)\b.*\b(?:end-to-end|full game|vertical slice|complete game)|all four|orchestrate|playable .* scene with|playable .* game with)\b/i.test(
        lower,
      );
    const strongDomains = scores.filter((s) => s.score >= 3);

    if (conflictDetected && /\b(?:test|verified|qa|screenshot|benchmark)\b/i.test(lower)) {
      predictedSpecialist = 'crazyqa';
    } else if (isToolVerificationRequest && !isExplicitOrchestration) {
      predictedSpecialist = 'crazyqa';
    } else if (
      isExplicitOrchestration ||
      (strongDomains.length >= 2 &&
        !isFailureRecoveryRequest &&
        !conflictDetected &&
        scores[0].score - scores[1].score <= 3)
    ) {
      predictedSpecialist = 'crazy';
    } else if (scores[0].score > 0) {
      predictedSpecialist = scores[0].spec;
    } else {
      predictedSpecialist = 'crazy';
    }

    if (conflictDetected) {
      if (/\b(?:test|verified|qa|screenshot|benchmark)\b/i.test(lower)) {
        predictedSpecialist = 'crazyqa';
      } else if (/\b(?:material|shader|lighting|renderer|pbr)\b/i.test(lower)) {
        predictedSpecialist = 'crazydesigner';
      } else {
        predictedSpecialist = 'crazycoder';
      }
    }
  }

  // Action classification
  if (conflictDetected) {
    predictedAction = 'reject-conflict';
  } else if (isFailureRecoveryRequest) {
    predictedAction = 'trigger-retry-recovery';
  } else if (ambiguous) {
    predictedAction = 'ask-clarification';
    predictedSpecialist = 'crazy';
  } else if (predictedSpecialist === 'crazy') {
    predictedAction = 'orchestrate-multi';
  } else if (isToolVerificationRequest && predictedSpecialist === 'crazyqa' && !slashMatch) {
    predictedAction = 'run-verification-tool';
  } else {
    predictedAction = 'route-specialist';
  }

  const retrieval = retrieveTaskKnowledge(rootDir, {
    query: c.prompt,
    specialist: predictedSpecialist === 'crazy' ? undefined : predictedSpecialist,
    engine: detectedEngine ?? undefined,
    maxTokenBudget: 6000,
    maxDocs: 4,
  });

  const specialistOk = predictedSpecialist === c.expectedSpecialist;
  const actionOk = predictedAction === c.expectedAction;
  const conflictOk = c.shouldDetectConflict ? conflictDetected : true;
  const passed = specialistOk && actionOk && conflictOk;

  return {
    id: c.id,
    category: c.category,
    passed,
    predictedSpecialist,
    expectedSpecialist: c.expectedSpecialist,
    predictedAction,
    expectedAction: c.expectedAction,
    detectedEngine,
    conflictDetected,
    knowledgeDocsRetrieved: retrieval.selected.length,
    notes: passed
      ? 'Deterministic policy & routing matched.'
      : `Mismatch: spec(${predictedSpecialist}!=${c.expectedSpecialist}) action(${predictedAction}!=${c.expectedAction}) conflict(${conflictDetected})`,
  };
}

export function runEvaluationSuiteV2(
  rootDir: string,
  suitePath = path.join(rootDir, 'evals', 'suite-v2.json'),
): EvaluationReportV2 {
  const raw = JSON.parse(fs.readFileSync(suitePath, 'utf8')) as { cases: EvalCaseV2[] };
  const results = raw.cases.map((c) => evaluateDeterministicCase(rootDir, c));

  const byCategory: EvaluationReportV2['byCategory'] = {};
  for (const r of results) {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { total: 0, passed: 0, accuracyPercent: 0 };
    }
    byCategory[r.category].total += 1;
    if (r.passed) byCategory[r.category].passed += 1;
  }
  for (const cat of Object.values(byCategory)) {
    cat.accuracyPercent = Math.round((cat.passed / cat.total) * 10000) / 100;
  }

  const passedCases = results.filter((r) => r.passed).length;
  return {
    version: '2.0.0',
    generatedAt: new Date().toISOString(),
    evaluationMode: 'deterministic-static-and-policy',
    liveModelEvaluationStatus: 'UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER',
    totalCases: results.length,
    passedCases,
    accuracyPercent: Math.round((passedCases / results.length) * 10000) / 100,
    byCategory,
    results,
  };
}

export interface EvaluationReportV3 {
  version: '3.0.0';
  generatedAt: string;
  evaluationMode: 'deterministic-static-and-policy';
  liveModelEvaluationStatus: 'UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER';
  model: string;
  configuration: {
    adapterKind: 'offline-deterministic';
    retrievalMaxTokens: number;
    hardwareTier: string;
  };
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuCores: number;
    blenderAvailable: boolean;
    blenderVersion: string | null;
  };
  totalCases: number;
  passedCases: number;
  accuracyPercent: number;
  byCategory: Record<string, { total: number; passed: number; accuracyPercent: number }>;
  results: EvalCaseResult[];
}

export function runEvaluationSuiteV3(
  rootDir: string,
  includeV2Baseline = true,
): EvaluationReportV3 {
  const v3Path = path.join(rootDir, 'evals', 'suite-v3.json');
  const v3Raw = JSON.parse(fs.readFileSync(v3Path, 'utf8')) as { cases: EvalCaseV2[] };
  let cases = [...v3Raw.cases];

  if (includeV2Baseline) {
    const v2Path = path.join(rootDir, 'evals', 'suite-v2.json');
    if (fs.existsSync(v2Path)) {
      const v2Raw = JSON.parse(fs.readFileSync(v2Path, 'utf8')) as { cases: EvalCaseV2[] };
      cases = [...v2Raw.cases, ...cases];
    }
  }

  const results = cases.map((c) => evaluateDeterministicCase(rootDir, c));
  const byCategory: EvaluationReportV3['byCategory'] = {};
  for (const r of results) {
    if (!byCategory[r.category]) {
      byCategory[r.category] = { total: 0, passed: 0, accuracyPercent: 0 };
    }
    byCategory[r.category].total += 1;
    if (r.passed) byCategory[r.category].passed += 1;
  }
  for (const cat of Object.values(byCategory)) {
    cat.accuracyPercent = Math.round((cat.passed / cat.total) * 10000) / 100;
  }

  const hw = detectHardwareProfile();
  const blender = detectBlenderInstallation();
  const passedCases = results.filter((r) => r.passed).length;

  return {
    version: '3.0.0',
    generatedAt: new Date().toISOString(),
    evaluationMode: 'deterministic-static-and-policy',
    liveModelEvaluationStatus: 'UNVERIFIED_OFFLINE_NO_LIVE_MODEL_RUNNER',
    model: 'afo-deterministic-v3 (no live LLM API invoked)',
    configuration: {
      adapterKind: 'offline-deterministic',
      retrievalMaxTokens: 6000,
      hardwareTier: hw.tier,
    },
    environment: {
      nodeVersion: process.version,
      platform: os.platform(),
      arch: os.arch(),
      cpuCores: hw.cpuCores,
      blenderAvailable: blender.available,
      blenderVersion: blender.version,
    },
    totalCases: results.length,
    passedCases,
    accuracyPercent: Math.round((passedCases / results.length) * 10000) / 100,
    byCategory,
    results,
  };
}
