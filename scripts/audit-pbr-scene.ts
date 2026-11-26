import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface PbrAuditResult {
  hasThreeUsage: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
}

export function auditPbrSceneFiles(files: Array<{ path: string; content: string }>): PbrAuditResult {
  const combined = files.map((f) => f.content).join('\n');
  const hasThreeUsage = /\bfrom\s+['"]three['"]|\bTHREE\./.test(combined);

  if (!hasThreeUsage) {
    return {
      hasThreeUsage: false,
      checks: [
        {
          name: 'three-scene-present',
          passed: true,
          detail: 'No Three.js scene files detected; skipping WebGL/PBR checks.',
        },
      ],
    };
  }

  const checks = [
    {
      name: 'aces-filmic-tonemapping',
      passed: /ACESFilmicToneMapping/.test(combined),
      detail: 'Configure renderer.toneMapping = THREE.ACESFilmicToneMapping for Hollywood highlight rolloff.',
    },
    {
      name: 'srgb-color-space',
      passed: /SRGBColorSpace/.test(combined),
      detail: 'Configure renderer.outputColorSpace = THREE.SRGBColorSpace.',
    },
    {
      name: 'pixel-ratio-clamped',
      passed: /setPixelRatio\s*\(\s*Math\.min/.test(combined),
      detail: 'Clamp DPR via renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)).',
    },
    {
      name: 'gpu-resource-dispose',
      passed: /\.dispose\s*\(\s*\)/.test(combined),
      detail: 'Dispose geometries, materials, textures, and renderers on teardown.',
    },
    {
      name: 'no-pure-black-white-albedo',
      passed: !/color\s*:\s*(?:0x000000|0xffffff|['"]#000000['"]|['"]#ffffff['"])/i.test(combined),
      detail: 'Avoid pure 0x000000 / 0xffffff PBR material colors (keep albedo within realistic bounds).',
    },
  ];

  return { hasThreeUsage: true, checks };
}

function collectTsFiles(dir: string): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  if (!fs.existsSync(dir)) return out;
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        out.push({ path: full, content: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(dir);
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('src');
  const result = auditPbrSceneFiles(collectTsFiles(target));
  let failed = false;
  for (const check of result.checks) {
    console.log(`[${check.passed ? 'PASS' : 'FAIL'}] ${check.name}: ${check.detail}`);
    if (!check.passed) failed = true;
  }
  if (failed) process.exit(1);
}
