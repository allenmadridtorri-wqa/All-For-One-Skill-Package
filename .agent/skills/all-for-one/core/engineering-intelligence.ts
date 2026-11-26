import fs from 'node:fs';
import path from 'node:path';
import {
  ENGINE_PROFILES,
  validateEngineCompatibility,
  type EngineId,
} from './engine-profiles.ts';
import { scanForSecrets, type SecretFinding } from './security.ts';

export type EngineeringStackId = EngineId | 'web-fullstack' | 'general-software';

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
      if (allDeps.three || allDeps['@types/three']) detectedStacks.add('threejs');
      if (allDeps.express || allDeps.react || allDeps.vite) detectedStacks.add('web-fullstack');
      if (detectedStacks.size === 0) detectedStacks.add('general-software');
    } catch {
      warnings.push('package.json exists but could not be parsed as valid JSON.');
    }
  }
  if (checkFile('Cargo.toml')) {
    buildFilesFound.push('Cargo.toml');
    detectedStacks.add('rust');
  }
  if (checkFile('CMakeLists.txt')) {
    buildFilesFound.push('CMakeLists.txt');
    detectedStacks.add('cpp-native');
  }
  if (checkFile('project.godot')) {
    buildFilesFound.push('project.godot');
    detectedStacks.add('godot');
  }
  if (checkFile('Packages/manifest.json')) {
    buildFilesFound.push('Packages/manifest.json');
    detectedStacks.add('unity');
  }

  const topEntries = fs.existsSync(rootDir) ? fs.readdirSync(rootDir) : [];
  for (const name of topEntries) {
    if (name.endsWith('.uproject')) {
      buildFilesFound.push(name);
      detectedStacks.add('unreal5');
    }
  }

  return {
    detectedStacks: [...detectedStacks],
    buildFilesFound,
    dependencies,
    warnings,
  };
}

export interface ApiCompatibilityCheck {
  compatible: boolean;
  issues: string[];
  recommendations: string[];
}

const DEPRECATED_API_RULES: Array<{
  stack: EngineeringStackId;
  pattern: RegExp;
  issue: string;
  fix: string;
}> = [
  {
    stack: 'godot',
    pattern: /\bKinematicBody\b|\bmove_and_slide\([^)]*,/,
    issue: 'Godot 3.x KinematicBody / multi-arg move_and_slide detected; incompatible with Godot 4.x.',
    fix: 'Use CharacterBody3D with velocity property and zero-arg move_and_slide().',
  },
  {
    stack: 'unreal5',
    pattern: /\bSetupPlayerInputComponent\b[\s\S]*BindAxis\(/,
    issue: 'Legacy UE4 InputComponent::BindAxis detected.',
    fix: 'Prefer UE5 EnhancedInputComponent with UInputAction assets.',
  },
  {
    stack: 'unity',
    pattern: /\bResources\.Load\s*\(/,
    issue: 'Resources.Load hinders memory lifecycle and bundle stripping in production Unity projects.',
    fix: 'Migrate to Unity Addressables with explicit AsyncOperationHandle release.',
  },
  {
    stack: 'threejs',
    pattern: /\.encoding\s*=\s*THREE\.sRGBEncoding\b/,
    issue: 'THREE.sRGBEncoding was removed in modern Three.js (r152+).',
    fix: 'Use renderer.outputColorSpace = THREE.SRGBColorSpace and texture.colorSpace = THREE.SRGBColorSpace.',
  },
  {
    stack: 'web-fullstack',
    pattern: /\binnerHTML\s*=|\bdangerouslySetInnerHTML\b/,
    issue: 'Raw HTML sink increases XSS exposure.',
    fix: 'Use safe JSX text bindings or sanitized/structured DOM nodes.',
  },
];

export function checkApiAndVersionCompatibility(
  stack: EngineeringStackId,
  sourceCode: string,
): ApiCompatibilityCheck {
  const issues: string[] = [];
  const recommendations: string[] = [];

  if (stack in ENGINE_PROFILES) {
    const violations = validateEngineCompatibility(stack as EngineId, sourceCode);
    for (const v of violations) {
      issues.push(`[Cross-Engine Mix] ${v.message}`);
      recommendations.push(`Remove foreign ${v.foreignEngine} symbols and follow references/engines/${stack}.md.`);
    }
  }

  for (const rule of DEPRECATED_API_RULES) {
    if (rule.stack === stack && rule.pattern.test(sourceCode)) {
      issues.push(rule.issue);
      recommendations.push(rule.fix);
    }
  }

  return {
    compatible: issues.length === 0,
    issues,
    recommendations,
  };
}

export interface ErrorDiagnosis {
  category: 'type-error' | 'dependency' | 'memory-lifecycle' | 'shader-compile' | 'path-security' | 'unknown';
  summary: string;
  likelyCause: string;
  recommendedActions: string[];
}

export function diagnoseErrorLog(errorLog: string): ErrorDiagnosis {
  const text = errorLog.trim();
  if (/TS\d{4}:|Cannot find module|Module not found/i.test(text)) {
    return {
      category: 'type-error',
      summary: 'TypeScript / module resolution failure detected.',
      likelyCause: 'Missing import extension, mismatched tsconfig moduleResolution, or uninstalled package.',
      recommendedActions: [
        'Run tsc --noEmit to inspect exact file/line diagnostics.',
        'Verify relative import extensions and package.json dependencies.',
      ],
    };
  }
  if (/EACCES|EPERM|Path traversal|Symlink escape/i.test(text)) {
    return {
      category: 'path-security',
      summary: 'Filesystem permission or path confinement error.',
      likelyCause: 'Attempted read/write outside allowed root or blocked symlink target.',
      recommendedActions: [
        'Validate paths via assertSafeSubpathSync before I/O.',
        'Run installer in --dry-run mode to inspect destination paths.',
      ],
    };
  }
  if (/GLSL|WGSL|shader|WebGLProgram|SPIR-V/i.test(text)) {
    return {
      category: 'shader-compile',
      summary: 'Shader compilation or GPU pipeline binding error.',
      likelyCause: 'Precision qualifier mismatch, undefined uniform, or invalid attribute location.',
      recommendedActions: [
        'Verify uniform names match shader declarations and target API (GLSL vs WGSL).',
        'Inspect GPU console diagnostics before approving render.',
      ],
    };
  }
  if (/Out of memory|allocation|leak|dispose/i.test(text)) {
    return {
      category: 'memory-lifecycle',
      summary: 'Memory growth or unreleased resource handle.',
      likelyCause: 'Per-frame allocations or missing .dispose()/Release/queue_free() on teardown.',
      recommendedActions: [
        'Track allocations with ResourceLifecycleTracker.',
        'Scan update loops with scripts/check-hot-loop.ts.',
      ],
    };
  }
  return {
    category: 'unknown',
    summary: 'Unclassified build or runtime error.',
    likelyCause: 'Inspect full stack trace and verify reproducing command.',
    recommendedActions: [
      'Capture exact failing command, exit code, and minimal reproduction test.',
    ],
  };
}

export interface CodeReviewReport {
  approved: boolean;
  stack: EngineeringStackId;
  secretFindings: SecretFinding[];
  apiCompatibility: ApiCompatibilityCheck;
  notes: string[];
}

export function reviewCodeSnippet(
  stack: EngineeringStackId,
  fileLabel: string,
  code: string,
): CodeReviewReport {
  const secretFindings = scanForSecrets(code, fileLabel);
  const apiCompatibility = checkApiAndVersionCompatibility(stack, code);
  const notes: string[] = [];

  if (secretFindings.length > 0) {
    notes.push(`Blocked: ${secretFindings.length} hardcoded credential/secret pattern(s) detected.`);
  }
  if (!apiCompatibility.compatible) {
    notes.push(...apiCompatibility.issues);
  }
  if (/\beval\s*\(|new Function\s*\(/.test(code)) {
    notes.push('Avoid dynamic code execution (eval / new Function).');
  }

  return {
    approved: secretFindings.length === 0 && apiCompatibility.compatible && !/\beval\s*\(|new Function\s*\(/.test(code),
    stack,
    secretFindings,
    apiCompatibility,
    notes,
  };
}
