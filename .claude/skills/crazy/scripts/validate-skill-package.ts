import fs from 'node:fs';
import path from 'node:path';

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  license?: string;
  compatibility?: string;
  [key: string]: unknown;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  file: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  skillsChecked: number;
  issues: ValidationIssue[];
}

const VENDOR_LOCKED_TOOLS = [
  'MultiEdit',
  'view_file',
  'replace_file_content',
  'write_to_file',
  'apply_patch',
  'NotebookEdit',
];

export function parseFrontmatter(markdown: string): { frontmatter: SkillFrontmatter; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: markdown };
  }

  const rawYaml = match[1];
  const body = match[2];
  const frontmatter: SkillFrontmatter = {};
  const lines = rawYaml.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;
    const key = keyMatch[1];
    let val = keyMatch[2].trim();

    if (val === '>-' || val === '>' || val === '|-' || val === '|') {
      const folded: string[] = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
        i++;
        if (lines[i].trim()) folded.push(lines[i].trim());
      }
      frontmatter[key] = folded.join(' ');
    } else if (val === '') {
      // Nested object block (e.g. metadata:)
      const nested: Record<string, string> = {};
      while (i + 1 < lines.length && /^\s+[a-zA-Z0-9_-]+:/.test(lines[i + 1])) {
        i++;
        const nMatch = lines[i].trim().match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
        if (nMatch) {
          nested[nMatch[1]] = nMatch[2].replace(/^["']|["']$/g, '');
        }
      }
      frontmatter[key] = nested;
    } else {
      frontmatter[key] = val.replace(/^["']|["']$/g, '');
    }
  }

  return { frontmatter, body };
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function validateSkillPackage(rootDir: string): ValidationReport {
  const issues: ValidationIssue[] = [];
  const skillsDir = path.join(rootDir, 'skills');

  if (!fs.existsSync(skillsDir)) {
    issues.push({
      severity: 'error',
      file: 'skills/',
      message: 'Missing canonical skills/ directory.',
    });
    return { ok: false, skillsChecked: 0, issues };
  }

  const folders = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (folders.length === 0) {
    issues.push({
      severity: 'error',
      file: 'skills/',
      message: 'No skill directories found inside skills/.',
    });
  }

  for (const folder of folders) {
    const relSkillPath = path.join('skills', folder, 'SKILL.md');
    const absSkillPath = path.join(rootDir, relSkillPath);

    if (!fs.existsSync(absSkillPath)) {
      issues.push({
        severity: 'error',
        file: relSkillPath,
        message: `Missing SKILL.md inside skills/${folder}/.`,
      });
      continue;
    }

    const content = fs.readFileSync(absSkillPath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(content);

    if (!frontmatter.name || typeof frontmatter.name !== 'string') {
      issues.push({
        severity: 'error',
        file: relSkillPath,
        message: 'YAML frontmatter is missing required "name" field.',
      });
    } else {
      if (!/^[a-z0-9-]+$/.test(frontmatter.name)) {
        issues.push({
          severity: 'error',
          file: relSkillPath,
          message: `Skill name "${frontmatter.name}" must be lowercase kebab-case.`,
        });
      }
      if (frontmatter.name !== folder) {
        issues.push({
          severity: 'error',
          file: relSkillPath,
          message: `Skill name "${frontmatter.name}" must match folder name "${folder}".`,
        });
      }
    }

    if (!frontmatter.description || typeof frontmatter.description !== 'string') {
      issues.push({
        severity: 'error',
        file: relSkillPath,
        message: 'YAML frontmatter is missing required "description" field.',
      });
    } else {
      const descTokens = estimateTokens(frontmatter.description);
      if (frontmatter.description.length < 40) {
        issues.push({
          severity: 'warning',
          file: relSkillPath,
          message: 'Skill description is very short; add explicit trigger phrases for frontier routing.',
        });
      }
      if (descTokens > 220) {
        issues.push({
          severity: 'warning',
          file: relSkillPath,
          message: `Tier-1 description is ~${descTokens} tokens (recommend <= 200 tokens).`,
        });
      }
    }

    const bodyTokens = estimateTokens(body);
    if (bodyTokens > 4500) {
      issues.push({
        severity: 'warning',
        file: relSkillPath,
        message: `Tier-2 SKILL.md body is ~${bodyTokens} tokens; move deep details into references/ to stay <= 4,500 tokens.`,
      });
    }

    // Verify all referenced paths under references/, scripts/, assets/, skills/ exist
    const pathMatches = body.matchAll(/`((?:references|scripts|assets|skills)\/[a-zA-Z0-9._/-]+)`/g);
    for (const match of pathMatches) {
      const refRel = match[1].replace(/\/$/, '');
      const refAbs = path.join(rootDir, refRel);
      if (!fs.existsSync(refAbs)) {
        issues.push({
          severity: 'error',
          file: relSkillPath,
          message: `Broken reference path: \`${match[1]}\` does not exist.`,
        });
      }
    }

    // Warn on vendor-locked tool names in canonical instructions
    for (const toolName of VENDOR_LOCKED_TOOLS) {
      const toolRegex = new RegExp(`\\b${toolName}\\b`);
      if (toolRegex.test(body)) {
        issues.push({
          severity: 'warning',
          file: relSkillPath,
          message: `Vendor-specific tool name "${toolName}" found in canonical SKILL.md; use capability verbs instead.`,
        });
      }
    }
  }

  const hasError = issues.some((issue) => issue.severity === 'error');
  return {
    ok: !hasError,
    skillsChecked: folders.length,
    issues,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const report = validateSkillPackage(root);
  console.log(`Checked ${report.skillsChecked} skill(s).`);
  for (const issue of report.issues) {
    const tag = issue.severity === 'error' ? 'ERROR' : 'WARN ';
    console.log(`[${tag}] ${issue.file}: ${issue.message}`);
  }
  if (!report.ok) {
    process.exit(1);
  }
  console.log('All For One skill package validation passed.');
}
