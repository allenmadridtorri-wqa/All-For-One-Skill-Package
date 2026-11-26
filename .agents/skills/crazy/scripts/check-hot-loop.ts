import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface HotLoopFinding {
  file: string;
  line: number;
  rule: string;
  snippet: string;
}

const HOT_LOOP_FN_RE =
  /\b(?:function\s+(?:tick|update|fixedUpdate|animate|renderFrame)|(?:tick|update|fixedUpdate|animate|useFrame)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{)/;

const ALLOC_PATTERNS: Array<{ rule: string; regex: RegExp }> = [
  {
    rule: 'per-frame-three-allocation',
    regex: /\bnew\s+(?:THREE\.)?(?:Vector2|Vector3|Vector4|Matrix3|Matrix4|Quaternion|Euler|Color|Box3|Sphere|Raycaster)\s*\(/,
  },
  {
    rule: 'per-frame-react-setstate',
    regex: /\bset[A-Z][A-Za-z0-9_]*\s*\(/,
  },
  {
    rule: 'per-frame-array-transform',
    regex: /\.(?:map|filter|slice)\s*\(/,
  },
  {
    rule: 'per-frame-object-keys',
    regex: /\bObject\.(?:keys|values|entries)\s*\(/,
  },
];

export function scanSourceForHotLoopIssues(filePath: string, source: string): HotLoopFinding[] {
  const findings: HotLoopFinding[] = [];
  const lines = source.split(/\r?\n/);

  let insideHotLoop = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

    if (!insideHotLoop && HOT_LOOP_FN_RE.test(line)) {
      insideHotLoop = true;
      braceDepth = 0;
    }

    if (insideHotLoop) {
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') braceDepth--;
      }

      for (const pattern of ALLOC_PATTERNS) {
        if (pattern.regex.test(line)) {
          findings.push({
            file: filePath,
            line: i + 1,
            rule: pattern.rule,
            snippet: trimmed,
          });
        }
      }

      if (braceDepth <= 0 && line.includes('}')) {
        insideHotLoop = false;
        braceDepth = 0;
      }
    }
  }

  return findings;
}

export function scanDirectoryForHotLoops(targetDir: string): HotLoopFinding[] {
  const findings: HotLoopFinding[] = [];
  if (!fs.existsSync(targetDir)) return findings;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        findings.push(...scanSourceForHotLoopIssues(path.relative(process.cwd(), full), content));
      }
    }
  };

  walk(targetDir);
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('src');
  const findings = scanDirectoryForHotLoops(target);
  if (findings.length === 0) {
    console.log(`Zero hot-loop allocation issues detected in ${path.relative(process.cwd(), target) || '.'}.`);
  } else {
    for (const f of findings) {
      console.log(`[HOT-LOOP] ${f.file}:${f.line} (${f.rule}) -> ${f.snippet}`);
    }
    process.exit(1);
  }
}
