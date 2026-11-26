import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { advanceFixedTimestep, createFixedTimestep } from '../assets/ecs/fixed-timestep.ts';
import { createSeededRng, dampScalar } from '../assets/ecs/math-scratch.ts';
import { ObjectPool } from '../assets/ecs/object-pool.ts';
import { buildAllTargets, createZipBuffer, scoreTriggerRouting, syncTargets } from './afo.ts';
import { auditPbrSceneFiles } from './audit-pbr-scene.ts';
import { scanSourceForHotLoopIssues } from './check-hot-loop.ts';
import { parseFrontmatter, validateSkillPackage } from './validate-skill-package.ts';

const ROOT_DIR = process.cwd();

test('canonical All For One skill package passes validation with zero errors', () => {
  const report = validateSkillPackage(ROOT_DIR);
  assert.equal(report.ok, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.skillsChecked, 4);
  const errors = report.issues.filter((i) => i.severity === 'error');
  assert.equal(errors.length, 0);
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

test('trigger routing hits 100% accuracy across evals/triggers.json', () => {
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
  // Simulate 5-second tab switch spike (5000ms) -> clamped to 0.1s (5 substeps max)
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
    // Copy canonical package folders into temp dir
    for (const dir of ['skills', 'references', 'scripts', 'assets', 'evals']) {
      fs.cpSync(path.join(ROOT_DIR, dir), path.join(tmpDir, dir), { recursive: true });
    }

    const built = buildAllTargets(tmpDir);
    assert.ok(built.artifacts.includes('dist/claude/all-for-one-claude.zip'));
    assert.ok(built.artifacts.includes('dist/chatgpt/custom-gpt/instructions.md'));
    assert.ok(built.artifacts.includes('dist/chatgpt/custom-gpt/all-for-one-knowledge.zip'));

    const synced = syncTargets({ rootDir: tmpDir, target: 'all', global: false });
    assert.ok(fs.existsSync(synced.lockFile));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude/skills/crazy/SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude/skills/crazydesigner/SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent/workflows/crazy.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agent/skills/all-for-one/references/photoreal-lighting-aces.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.agents/skills/crazycoder/SKILL.md')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
