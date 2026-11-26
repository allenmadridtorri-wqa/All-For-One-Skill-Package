import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { advanceFixedTimestep, createFixedTimestep } from '../assets/ecs/fixed-timestep.ts';
import { createSeededRng, dampScalar } from '../assets/ecs/math-scratch.ts';
import { ObjectPool } from '../assets/ecs/object-pool.ts';
import { safeInstall } from '../core/installer-engine.mjs';
import { buildAllTargets, createZipBuffer, scoreTriggerRouting, syncTargets } from './afo.ts';
import { auditPbrSceneFiles } from './audit-pbr-scene.ts';
import { scanSourceForHotLoopIssues } from './check-hot-loop.ts';
import { parseFrontmatter, validateSkillPackage } from './validate-skill-package.ts';

const ROOT_DIR = process.cwd();

function collectMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function extractRelativeLinksFromInstalledMd(markdown: string): string[] {
  const { body } = parseFrontmatter(markdown);
  const refs = new Set<string>();
  const matches = body.matchAll(
    /(?:^|[\s(`"'[])((?:\.\.\/skills\/all-for-one\/)?(?:references|scripts|assets)\/[a-zA-Z0-9._/-]+)/gm,
  );
  for (const m of matches) {
    const cleaned = m[1].replace(/[.,;:!?)'"`]+$/, '').replace(/\/+$/, '');
    if (cleaned) refs.add(cleaned);
  }
  return [...refs];
}

test('canonical All For One skill package passes validation with zero errors and plain SKILL.md files', () => {
  const report = validateSkillPackage(ROOT_DIR);
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.skillsChecked, 5);
  const errors = report.issues.filter((i) => i.severity === 'error');
  assert.equal(errors.length, 0);

  // Fix #4: SKILL.md files must not reference unrunnable TypeScript classes/methods or deleted modules
  const forbiddenPatterns = [
    /SingleAiOrchestrator/,
    /ProductionMemoryLedger/,
    /CollaborationCoordinator/,
    /ImplementationStatusTracker/,
    /RenderSafetyManager/,
    /VisualIterationController/,
    /ConfigurableModelAdapter/,
    /validateExportedAsset/,
    /validateBlenderWorkspacePath/,
    /runSeparateQaVerificationPhase/,
    /core\/(?:collaboration|production-memory|engineering-intelligence|model-adapter|asset-pipeline|visual-iteration)\.ts/,
  ];

  for (const cmd of ['crazy', 'crazymaker', 'crazydesigner', 'crazycoder', 'crazyqa']) {
    const content = fs.readFileSync(path.join(ROOT_DIR, 'skills', cmd, 'SKILL.md'), 'utf8');
    for (const pat of forbiddenPatterns) {
      assert.equal(
        pat.test(content),
        false,
        `skills/${cmd}/SKILL.md still contains forbidden unrunnable reference ${pat}`,
      );
    }
  }

  // Fix #5: LICENSE exists and no committed release ZIP remains
  assert.equal(fs.existsSync(path.join(ROOT_DIR, 'LICENSE')), true);
  assert.match(fs.readFileSync(path.join(ROOT_DIR, 'LICENSE'), 'utf8'), /Apache License/);
  assert.equal(fs.existsSync(path.join(ROOT_DIR, 'release')), false);
});

test('every installed skill and workflow contains or links to every file its SKILL.md mentions (workspace, global, and dist)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afo-linked-files-'));
  const fakeHome = path.join(tmpDir, 'home');
  const workspaceDir = path.join(tmpDir, 'workspace');
  fs.mkdirSync(fakeHome, { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });

  try {
    // Prepare temp repo copy for buildAllTargets
    for (const dir of ['skills', 'references', 'scripts', 'assets', 'evals', 'core']) {
      fs.cpSync(path.join(ROOT_DIR, dir), path.join(workspaceDir, dir), { recursive: true });
    }

    buildAllTargets(workspaceDir);
    safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: workspaceDir,
      target: 'all',
      global: false,
    });
    safeInstall({
      sourceRoot: ROOT_DIR,
      targetRoot: workspaceDir,
      target: 'all',
      global: true,
      homeDir: fakeHome,
    });

    const installedMdRoots = [
      // Workspace skills + workflows
      path.join(workspaceDir, '.claude', 'skills'),
      path.join(workspaceDir, '.agents', 'skills'),
      path.join(workspaceDir, '.agent', 'skills'),
      path.join(workspaceDir, '.agent', 'workflows'),
      // Global skills + workflows
      path.join(fakeHome, '.claude', 'skills'),
      path.join(fakeHome, '.codex', 'skills'),
      path.join(fakeHome, '.gemini', 'antigravity', 'skills'),
      path.join(fakeHome, '.gemini', 'antigravity', 'global_workflows'),
      // Built dist skills + workflows
      path.join(workspaceDir, 'dist', 'claude'),
      path.join(workspaceDir, 'dist', 'chatgpt', 'codex-skills'),
      path.join(workspaceDir, 'dist', 'antigravity', 'skills'),
      path.join(workspaceDir, 'dist', 'antigravity', 'workflows'),
    ];

    let checkedFiles = 0;
    let checkedLinks = 0;

    for (const root of installedMdRoots) {
      const mdFiles = collectMarkdownFiles(root).filter((f) => {
        const rel = path.relative(root, f).replace(/\\/g, '/');
        // Check installed SKILL.md files and Antigravity workflow files (skip copied reference docs themselves)
        return rel.endsWith('SKILL.md') || !rel.includes('/');
      });
      assert.ok(mdFiles.length > 0, `Expected installed markdown files under ${root}`);

      for (const mdPath of mdFiles) {
        checkedFiles += 1;
        const content = fs.readFileSync(mdPath, 'utf8');
        const refs = extractRelativeLinksFromInstalledMd(content);
        assert.ok(refs.length > 0, `Expected referenced files inside ${mdPath}`);
        for (const relRef of refs) {
          checkedLinks += 1;
          const resolved = path.resolve(path.dirname(mdPath), relRef);
          assert.equal(
            fs.existsSync(resolved),
            true,
            `Installed file ${mdPath} mentions "${relRef}", expected ${resolved} to exist`,
          );
        }

        // If SKILL.md mentions scripts/afo.ts, verify runtime deps exist alongside it
        if (refs.some((r) => r.endsWith('scripts/afo.ts'))) {
          const baseDir = mdPath.endsWith('SKILL.md')
            ? path.dirname(mdPath)
            : path.resolve(path.dirname(mdPath), '../skills/all-for-one');
          assert.equal(fs.existsSync(path.join(baseDir, 'core', 'knowledge-retrieval.ts')), true);
          assert.equal(fs.existsSync(path.join(baseDir, 'scripts', 'validate-skill-package.ts')), true);
          assert.equal(fs.existsSync(path.join(baseDir, 'references', 'index.json')), true);
        }
      }
    }

    assert.ok(checkedFiles >= 48, `Expected >= 48 installed skill/workflow files, checked ${checkedFiles}`);
    assert.ok(checkedLinks >= 150, `Expected >= 150 verified file links, checked ${checkedLinks}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('install.mjs CLI rejects unknown and malformed options with non-zero exit code', () => {
  const badArgSets = [
    ['--unknown-flag'],
    ['-x'],
    ['--dryrun'],
    ['--target'],
    ['--target='],
    ['--target=gemini'],
    ['--target=claude', '--target=chatgpt'],
    ['--force=true'],
    ['--global', '--workspace'],
    ['--uninstall', '--verify'],
    ['unexpected-positional'],
  ];

  for (const args of badArgSets) {
    let failed = false;
    try {
      execFileSync(process.execPath, ['scripts/install.mjs', ...args], {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      failed = true;
      const e = err as { status?: number; stderr?: string };
      assert.notEqual(e.status, 0);
      assert.match(String(e.stderr ?? ''), /Error:/);
    }
    assert.equal(failed, true, `Expected install.mjs to reject invalid args: ${args.join(' ')}`);
  }
});

test('parseFrontmatter parses folded description and nested metadata', () => {
  const sample = `---
name: crazydesigner
description: >-
  Hollywood 3D lighting and VFX pipeline.
metadata:
  command: /crazydesigner
---
# Body
`;
  const { frontmatter, body } = parseFrontmatter(sample);
  assert.equal(frontmatter.name, 'crazydesigner');
  assert.equal(frontmatter.description, 'Hollywood 3D lighting and VFX pipeline.');
  assert.deepEqual(frontmatter.metadata, { command: '/crazydesigner' });
  assert.match(body, /# Body/);
});

test('keyword-routing trigger check matches 8/8 across evals/triggers.json', () => {
  const result = scoreTriggerRouting(ROOT_DIR);
  assert.equal(result.total, 8);
  assert.equal(result.passed, result.total, JSON.stringify(result.details, null, 2));
});

test('hot-loop static analyzer catches per-frame allocations and accepts zero-GC code', () => {
  const badCode = `
    function tick(dt: number) {
      const temp = new THREE.Vector3(0, 1, 0);
      setScore((s) => s + 1);
      return items.map((x) => x.id);
    }
  `;
  const badFindings = scanSourceForHotLoopIssues('bad.ts', badCode);
  assert.equal(badFindings.length, 3);

  const cleanCode = `
    const SCRATCH = new Float64Array(3);
    function tick(dt: number) {
      SCRATCH[0] += dt;
    }
  `;
  const cleanFindings = scanSourceForHotLoopIssues('clean.ts', cleanCode);
  assert.equal(cleanFindings.length, 0);
});

test('PBR scene auditor enforces ACES tone mapping, sRGB, DPR clamp, and dispose', () => {
  const uncalibrated = [
    {
      path: 'scene.ts',
      content: `import * as THREE from 'three'; const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });`,
    },
  ];
  const failRes = auditPbrSceneFiles(uncalibrated);
  assert.equal(failRes.hasThreeUsage, true);
  assert.equal(failRes.checks.every((c) => c.passed), false);

  const calibrated = [
    {
      path: 'scene.ts',
      content: `
        import * as THREE from 'three';
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const mat = new THREE.MeshStandardMaterial({ color: 0xd8d8dc });
        mat.dispose();
      `,
    },
  ];
  const passRes = auditPbrSceneFiles(calibrated);
  assert.equal(passRes.checks.every((c) => c.passed), true);
});

test('fixed-timestep clamps large frame spikes and interpolates cleanly', () => {
  const loop = createFixedTimestep({ fixedDt: 1 / 60, maxFrameDt: 0.1, maxSubsteps: 5 });
  assert.equal(advanceFixedTimestep(loop, 1000, () => {}), 0);

  let stepsExecuted = 0;
  const steps = advanceFixedTimestep(loop, 6000, () => {
    stepsExecuted += 1;
  });
  assert.equal(steps, 5);
  assert.equal(stepsExecuted, 5);
  assert.ok(loop.alpha >= 0 && loop.alpha <= 1);
});

test('ObjectPool reuses pre-allocated slots with zero overflow', () => {
  const pool = new ObjectPool(2, () => ({ x: 0, y: 0 }));
  const a = pool.acquire();
  const b = pool.acquire();
  const c = pool.acquire();
  assert.ok(a !== null && b !== null);
  assert.equal(c, null);
  assert.equal(pool.activeCount, 2);

  pool.release(a.index);
  assert.equal(pool.activeCount, 1);
  const d = pool.acquire();
  assert.ok(d !== null);
  assert.equal(pool.activeCount, 2);
});

test('seeded PRNG and exponential damping are deterministic', () => {
  const rng1 = createSeededRng(42);
  const rng2 = createSeededRng(42);
  assert.equal(rng1(), rng2());
  assert.equal(rng1(), rng2());
  const damped = dampScalar(0, 10, 10, 1 / 60);
  assert.ok(damped > 1 && damped < 2);
});

test('createZipBuffer emits valid PKZIP signature and syncTargets writes all 3 frontiers', () => {
  const zip = createZipBuffer([{ name: 'hello.txt', data: Buffer.from('All For One') }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'afo-test-'));
  try {
    for (const dir of ['skills', 'references', 'scripts', 'assets', 'evals', 'core']) {
      fs.cpSync(path.join(ROOT_DIR, dir), path.join(tmpDir, dir), { recursive: true });
    }

    const built = buildAllTargets(tmpDir);
    assert.ok(built.artifacts.includes('dist/claude/all-for-one-claude.zip'));
    assert.ok(built.artifacts.includes('dist/chatgpt/custom-gpt/instructions.md'));
    assert.ok(built.artifacts.includes('dist/chatgpt/custom-gpt/all-for-one-knowledge.zip'));

    const synced = syncTargets({ rootDir: tmpDir, target: 'all', global: false });
    assert.ok(fs.existsSync(synced.manifestPath));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude/skills/crazy/SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude/skills/crazyqa/SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude/skills/crazydesigner/SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent/workflows/crazy.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent/workflows/crazyqa.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent/skills/all-for-one/references/photoreal-lighting-aces.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents/skills/crazycoder/SKILL.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
