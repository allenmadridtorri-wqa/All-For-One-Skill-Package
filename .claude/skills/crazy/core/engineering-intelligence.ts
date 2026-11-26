import fs from 'node:fs';
import path from 'node:path';
import {
  ENGINE_PROFILES,
  validateEngineCompatibility,
  type EngineId,
} from './engine-profiles.ts';
import type { HardwareProfile } from './production-intelligence.ts';
import { scanForSecrets, type SecretFinding } from './security.ts';

export type EngineeringStackId = EngineId | 'web-fullstack' | 'general-software';

export type ImplementationLifecycleStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'IMPLEMENTED'
  | 'TESTED'
  | 'VERIFIED'
  | 'UNVERIFIED'
  | 'FAILED';

export interface SoftwareStackProfile {
  id: EngineeringStackId;
  displayName: string;
  primaryLanguages: string[];
  buildSystems: string[];
  testFrameworks: string[];
  architecturePatterns: string[];
  minimumRecommendedVersions: Record<string, string>;
}

export const SOFTWARE_STACK_PROFILES: Record<EngineeringStackId, SoftwareStackProfile> = {
  unreal5: {
    id: 'unreal5',
    displayName: ENGINE_PROFILES.unreal5.displayName,
    primaryLanguages: ['C++20', 'Blueprint'],
    buildSystems: ['UnrealBuildTool (UBT)', 'RunUAT'],
    testFrameworks: ['Unreal Automation Framework', 'Gauntlet'],
    architecturePatterns: ['GAS', 'Actor-Component', 'Mass Entity (crowds)'],
    minimumRecommendedVersions: { unreal: '5.3+', cpp: 'C++20' },
  },
  unity: {
    id: 'unity',
    displayName: ENGINE_PROFILES.unity.displayName,
    primaryLanguages: ['C#', 'HLSL'],
    buildSystems: ['Unity CLI / MSBuild / .asmdef', 'Addressables'],
    testFrameworks: ['Unity Test Framework (EditMode/PlayMode)'],
    architecturePatterns: ['ScriptableObject Data', 'Modular MonoBehaviour', 'DOTS/Burst (hot paths)'],
    minimumRecommendedVersions: { unity: '2022.3 LTS / Unity 6', dotnet: '.NET Standard 2.1' },
  },
  godot: {
    id: 'godot',
    displayName: ENGINE_PROFILES.godot.displayName,
    primaryLanguages: ['GDScript', 'C++ (GDExtension)'],
    buildSystems: ['godot --headless --export-release', 'SCons (GDExtension)'],
    testFrameworks: ['GUT', 'GdUnit4'],
    architecturePatterns: ['Scene Tree Composition', 'Signals Up / Calls Down', 'Typed .tres Resources'],
    minimumRecommendedVersions: { godot: '4.2+' },
  },
  threejs: {
    id: 'threejs',
    displayName: ENGINE_PROFILES.threejs.displayName,
    primaryLanguages: ['TypeScript', 'GLSL', 'WGSL'],
    buildSystems: ['Vite', 'tsc'],
    testFrameworks: ['node:test via tsx', 'Playwright CLI'],
    architecturePatterns: ['Pure Simulation Core', 'ObjectPool Zero-GC Hot Loop', 'Explicit GPU Dispose'],
    minimumRecommendedVersions: { node: '18+', typescript: '5.0+', three: '0.160+' },
  },
  'cpp-native': {
    id: 'cpp-native',
    displayName: ENGINE_PROFILES['cpp-native'].displayName,
    primaryLanguages: ['C++20', 'C++23', 'HLSL/GLSL -> SPIR-V'],
    buildSystems: ['CMake + Ninja', 'vcpkg / Conan'],
    testFrameworks: ['Catch2', 'GoogleTest', 'ASan/UBSan'],
    architecturePatterns: ['Data-Oriented Design / SoA', 'Job System', 'Arena Allocators'],
    minimumRecommendedVersions: { cmake: '3.24+', cpp: 'C++20' },
  },
  rust: {
    id: 'rust',
    displayName: ENGINE_PROFILES.rust.displayName,
    primaryLanguages: ['Rust', 'WGSL'],
    buildSystems: ['Cargo'],
    testFrameworks: ['cargo test', 'cargo clippy'],
    architecturePatterns: ['Bevy ECS / Schedules', 'Owned Asset Handles', 'FixedUpdate Physics'],
    minimumRecommendedVersions: { rust: '1.78+' },
  },
  'web-fullstack': {
    id: 'web-fullstack',
    displayName: 'Full-Stack Web & TypeScript Services',
    primaryLanguages: ['TypeScript', 'HTML/CSS', 'SQL'],
    buildSystems: ['Vite', 'tsx / esbuild', 'Docker'],
    testFrameworks: ['node:test', 'Playwright CLI'],
    architecturePatterns: ['REST / Express Service Boundaries', 'Validated DTO Schemas', 'Stateless Auth & Env Secrets'],
    minimumRecommendedVersions: { node: '18+', typescript: '5.0+' },
  },
  'general-software': {
    id: 'general-software',
    displayName: 'General Software, CLIs & Automation Tooling',
    primaryLanguages: ['TypeScript', 'Python', 'Rust', 'C++'],
    buildSystems: ['npm / Cargo / CMake / pyproject'],
    testFrameworks: ['node:test', 'pytest', 'cargo test'],
    architecturePatterns: ['Hexagonal / Ports & Adapters', 'Pure Core + Thin IO Shell', 'Explicit Error Contracts'],
    minimumRecommendedVersions: { node: '18+', python: '3.10+' },
  },
};

export interface ProjectDependencyAudit {
  detectedStacks: EngineeringStackId[];
  buildFilesFound: string[];
  dependencies: Record<string, string>;
  warnings: string[];
}

export interface ProjectStructureReport {
  rootDir: string;
  totalFilesScanned: number;
  modules: string[];
  testFiles: string[];
  entrypoints: string[];
  internalDependencyGraph: Record<string, string[]>;
  recommendedEditStrategy: 'targeted-patch' | 'modular-addition';
}

export interface FeasibilityRiskReport {
  feasible: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  risks: string[];
  recommendations: string[];
  recommendRemoteGpuOffload: boolean;
}

export interface TrackedTaskItem {
  id: string;
  title: string;
  status: ImplementationLifecycleStatus;
  executionEvidence: string | null;
}

/**
 * Incrementally maps project modules, tests, entrypoints, and internal import edges
 * without wasting tokens loading entire files or scanning build artifacts.
 */
export function analyzeProjectStructure(rootDir: string): ProjectStructureReport {
  const absRoot = path.resolve(rootDir);
  const skip = new Set(['node_modules', 'dist', 'release', '.git', '.afo', '.afo-backups', '.afo-memory', '.claude', '.agent', '.agents']);
  const modules: string[] = [];
  const testFiles: string[] = [];
  const entrypoints: string[] = [];
  const graph: Record<string, string[]> = {};
  let totalFilesScanned = 0;

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(?:ts|tsx|mjs|js|py|rs|cpp|cs|gd)$/i.test(entry.name)) {
        totalFilesScanned += 1;
        const rel = path.relative(absRoot, full).replace(/\\/g, '/');
        if (/\.test\.|_test\.|Test\./i.test(rel)) {
          testFiles.push(rel);
        } else {
          modules.push(rel);
        }
        if (/(?:^|\/)(?:main|index|app|server|afo|install)\.(?:ts|tsx|mjs|js|py)$/i.test(rel)) {
          entrypoints.push(rel);
        }
        try {
          const text = fs.readFileSync(full, 'utf8');
          const imports: string[] = [];
          for (const m of text.matchAll(/import\s+[\s\S]*?\s+from\s+['"](\.[^'"]+)['"]/g)) {
            imports.push(m[1]);
          }
          if (imports.length > 0) graph[rel] = [...new Set(imports)];
        } catch {
          // Skip unreadable files
        }
      }
    }
  };

  walk(absRoot);

  return {
    rootDir: absRoot,
    totalFilesScanned,
    modules: modules.sort(),
    testFiles: testFiles.sort(),
    entrypoints: entrypoints.sort(),
    internalDependencyGraph: graph,
    recommendedEditStrategy: modules.length > 0 ? 'targeted-patch' : 'modular-addition',
  };
}

/**
 * Assesses technical feasibility and hardware risks before heavy implementation or rendering.
 */
export function assessTechnicalFeasibility(input: {
  goal: string;
  stack: EngineeringStackId;
  hardware: HardwareProfile;
  requiresHeavy3DRendering?: boolean;
  frameCount?: number;
}): FeasibilityRiskReport {
  const risks: string[] = [];
  const recommendations: string[] = [];
  let recommendRemoteGpuOffload = false;

  if (input.hardware.tier === 'constrained' && (input.requiresHeavy3DRendering || (input.frameCount ?? 0) > 24)) {
    recommendRemoteGpuOffload = true;
    risks.push(
      `Local hardware is constrained (${input.hardware.cpuCores} cores, ${input.hardware.totalMemoryMb} MB RAM); local Cycles/animation rendering (${input.frameCount ?? 'multi-frame'}) will bottleneck or OOM.`,
    );
    recommendations.push('Offload Blender frame-range rendering to Google Colab GPU or Cloud GPU provider with Google Drive checkpoints.');
  }

  if (input.stack === 'web-fullstack' && /cycles|fbx|unreal/i.test(input.goal)) {
    risks.push('Web stack requested alongside offline 3D DCC/engine terms; isolate Web runtime from Blender/engine tooling.');
  }

  if (risks.length === 0) {
    recommendations.push(`Proceed using ${SOFTWARE_STACK_PROFILES[input.stack].displayName} modular patterns and unit tests.`);
  }

  return {
    feasible: true,
    riskLevel: recommendRemoteGpuOffload ? 'high' : risks.length > 0 ? 'medium' : 'low',
    risks,
    recommendations,
    recommendRemoteGpuOffload,
  };
}

/**
 * Enforces truthful implementation status transitions: code generation only sets IMPLEMENTED;
 * VERIFIED strictly requires actual test/execution evidence.
 */
export class ImplementationStatusTracker {
  private readonly items = new Map<string, TrackedTaskItem>();

  plan(id: string, title: string): TrackedTaskItem {
    const item: TrackedTaskItem = { id, title, status: 'PLANNED', executionEvidence: null };
    this.items.set(id, item);
    return item;
  }

  markInProgress(id: string): TrackedTaskItem {
    const item = this.getItem(id);
    item.status = 'IN_PROGRESS';
    return item;
  }

  markImplemented(id: string): TrackedTaskItem {
    const item = this.getItem(id);
    item.status = 'IMPLEMENTED';
    return item;
  }

  markTested(id: string, evidence: string): TrackedTaskItem {
    const item = this.getItem(id);
    if (!evidence.trim()) throw new Error('TESTED status requires non-empty test execution evidence.');
    item.status = 'TESTED';
    item.executionEvidence = evidence;
    return item;
  }

  markVerified(id: string, evidence: string): TrackedTaskItem {
    const item = this.getItem(id);
    if (item.status !== 'TESTED' && !item.executionEvidence) {
      throw new Error(
        `Cannot mark "${id}" VERIFIED directly from ${item.status}; execute tests/verification first.`,
      );
    }
    item.status = 'VERIFIED';
    item.executionEvidence = evidence;
    return item;
  }

  markUnverified(id: string, reason: string): TrackedTaskItem {
    const item = this.getItem(id);
    item.status = 'UNVERIFIED';
    item.executionEvidence = reason;
    return item;
  }

  markFailed(id: string, reason: string): TrackedTaskItem {
    const item = this.getItem(id);
    item.status = 'FAILED';
    item.executionEvidence = reason;
    return item;
  }

  private getItem(id: string): TrackedTaskItem {
    const item = this.items.get(id);
    if (!item) throw new Error(`Unknown tracked task "${id}".`);
    return item;
  }

  list(): TrackedTaskItem[] {
    return [...this.items.values()];
  }
}

export function analyzeProjectDependencies(rootDir: string): ProjectDependencyAudit {
  const buildFilesFound: string[] = [];
  const detectedStacks = new Set<EngineeringStackId>();
  const dependencies: Record<string, string> = {};
  const warnings: string[] = [];

  const checkFile = (rel: string) => fs.existsSync(path.join(rootDir, rel));

  if (checkFile('package.json')) {
    buildFilesFound.push('package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      Object.assign(dependencies, allDeps);
      if (allDeps.three) detectedStacks.add('threejs');
      if (allDeps.react || allDeps.express || allDeps.vite) detectedStacks.add('web-fullstack');
      if (detectedStacks.size === 0) detectedStacks.add('general-software');
    } catch {
      warnings.push('Failed to parse package.json cleanly.');
    }
  }

  if (checkFile('Cargo.toml')) {
    buildFilesFound.push('Cargo.toml');
    const raw = fs.readFileSync(path.join(rootDir, 'Cargo.toml'), 'utf8');
    if (/\bbevy\b|\bwgpu\b/i.test(raw)) detectedStacks.add('rust');
    else detectedStacks.add('general-software');
  }

  if (checkFile('CMakeLists.txt')) {
    buildFilesFound.push('CMakeLists.txt');
    detectedStacks.add('cpp-native');
  }

  if (checkFile('project.godot')) {
    buildFilesFound.push('project.godot');
    detectedStacks.add('godot');
  }

  if (fs.existsSync(rootDir)) {
    for (const entry of fs.readdirSync(rootDir)) {
      if (entry.endsWith('.uproject')) {
        buildFilesFound.push(entry);
        detectedStacks.add('unreal5');
      } else if (entry.endsWith('.csproj') || entry.endsWith('.sln')) {
        buildFilesFound.push(entry);
        detectedStacks.add('unity');
      }
    }
  }

  if (detectedStacks.size === 0) {
    detectedStacks.add('general-software');
  }

  return {
    detectedStacks: [...detectedStacks],
    buildFilesFound,
    dependencies,
    warnings,
  };
}

export interface ApiCompatibilityIssue {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ApiCompatibilityReport {
  compatible: boolean;
  issues: string[];
  details: ApiCompatibilityIssue[];
}

export function checkApiAndVersionCompatibility(
  stack: EngineeringStackId,
  codeSnippet: string,
): ApiCompatibilityReport {
  const details: ApiCompatibilityIssue[] = [];

  if (
    stack === 'unreal5' ||
    stack === 'unity' ||
    stack === 'godot' ||
    stack === 'threejs' ||
    stack === 'cpp-native' ||
    stack === 'rust'
  ) {
    for (const violation of validateEngineCompatibility(stack, codeSnippet)) {
      details.push({
        rule: 'cross-engine-api-isolation',
        severity: 'error',
        message: violation.message,
      });
    }
  }

  if (stack === 'unity' && /\bUnityEngine\.WWW\b/.test(codeSnippet)) {
    details.push({
      rule: 'unity-deprecated-www',
      severity: 'warning',
      message: 'UnityEngine.WWW is deprecated; use UnityWebRequest instead.',
    });
  }
  if (stack === 'godot' && /\bKinematicBody\b|\bmove_and_slide\s*\(\s*velocity\s*\)/.test(codeSnippet)) {
    details.push({
      rule: 'godot4-body-migration',
      severity: 'error',
      message:
        'Godot 3.x KinematicBody / velocity argument is incompatible with Godot 4+; migrate to CharacterBody2D/3D and parameterless move_and_slide().',
    });
  }
  if (stack === 'threejs' && /\bGeometryUtils\b|\bMeshFaceMaterial\b/.test(codeSnippet)) {
    details.push({
      rule: 'threejs-removed-legacy-api',
      severity: 'error',
      message: 'Legacy GeometryUtils / MeshFaceMaterial removed in modern Three.js; use BufferGeometry and material arrays.',
    });
  }

  const issues = details.map((d) => d.message);
  return {
    compatible: details.every((d) => d.severity !== 'error'),
    issues,
    details,
  };
}

export interface ErrorDiagnosis {
  category:
    | 'type-error'
    | 'typescript'
    | 'module-resolution'
    | 'shader'
    | 'memory-oom'
    | 'build-tool'
    | 'unknown';
  rootCause: string;
  suggestedFixes: string[];
}

export function diagnoseErrorLog(logText: string): ErrorDiagnosis {
  const text = logText.trim();
  if (/TS\d{4}:|not assignable to|Type '.*' is not/i.test(text)) {
    return {
      category: 'type-error',
      rootCause: 'TypeScript static type mismatch or incompatible signature.',
      suggestedFixes: [
        'Inspect expected interface/generic types and align return or parameter types.',
        'Run tsc --noEmit to verify full module boundary compatibility.',
      ],
    };
  }
  if (/Cannot find module|ERR_MODULE_NOT_FOUND/i.test(text)) {
    return {
      category: 'module-resolution',
      rootCause: 'Missing ESM/relative import extension or unresolved package.',
      suggestedFixes: [
        'Verify imported file exists and matches exported symbol signature.',
        'Include explicit .ts/.mjs extension when running Node/tsx ESM scripts if required by tsconfig.',
      ],
    };
  }
  if (/GLSL|WGSL|shader|uniform|Shader compilation/i.test(text)) {
    return {
      category: 'shader',
      rootCause: 'Shader syntax, uniform binding, or stage input/output mismatch.',
      suggestedFixes: [
        'Verify uniform names and struct alignment match host material bindings.',
        'Check WebGL2 / WGSL precision qualifiers and texture sampler types.',
      ],
    };
  }
  if (/out of memory|ENOMEM|CUDA out of memory|VRAM/i.test(text)) {
    return {
      category: 'memory-oom',
      rootCause: 'Render resolution, sample count, or unfreed buffer allocation exceeded host RAM/VRAM.',
      suggestedFixes: [
        'Clamp render samples/resolution via detectHardwareProfile() or offload to Google Colab GPU.',
        'Audit GPU .dispose() calls and dispose intermediate textures/geometries.',
      ],
    };
  }
  if (/Cargo\.toml|CMake|UnrealBuildTool|MSBuild|vite/i.test(text)) {
    return {
      category: 'build-tool',
      rootCause: 'External compiler or bundler configuration error.',
      suggestedFixes: ['Inspect the first compiler diagnostic line and validate build manifest dependencies.'],
    };
  }
  return {
    category: 'unknown',
    rootCause: 'Unclassified runtime or compiler error.',
    suggestedFixes: ['Inspect full stack trace, isolate failing function with a minimal unit test, and check recent diffs.'],
  };
}

export interface CodeReviewReport {
  approved: boolean;
  ok: boolean;
  secretFindings: SecretFinding[];
  compatibilityIssues: ApiCompatibilityIssue[];
  warnings: string[];
}

export function reviewCodeSnippet(
  stack: EngineeringStackId,
  fileLabel: string,
  code: string,
): CodeReviewReport {
  const secretFindings = scanForSecrets(code, fileLabel);
  const compatReport = checkApiAndVersionCompatibility(stack, code);
  const compatibilityIssues = compatReport.details;
  const warnings: string[] = [];

  if (/\beval\s*\(|\bnew Function\s*\(/.test(code)) {
    warnings.push('Avoid dynamic eval()/new Function(); use static dispatch or structured parsers.');
  }
  if (/execSync\s*\([^)]*\$\{/.test(code)) {
    warnings.push('Avoid shell string interpolation with execSync; use execFileSync with argument arrays.');
  }
  if (/\bany\b/.test(code) && (stack === 'threejs' || stack === 'web-fullstack' || stack === 'general-software')) {
    warnings.push('Consider replacing `any` with explicit TypeScript interfaces or `unknown`.');
  }

  const ok =
    secretFindings.length === 0 &&
    compatReport.compatible &&
    !warnings.some((w) => w.includes('execSync'));

  return { approved: ok, ok, secretFindings, compatibilityIssues, warnings };
}
