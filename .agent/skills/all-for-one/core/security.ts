import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface SecretFinding {
  patternName: string;
  file: string;
  line: number;
  redactedPreview: string;
}

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'Google/Gemini API Key', re: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { name: 'OpenAI/Stripe Secret Key', re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { name: 'GitHub Token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  { name: 'AWS Access Key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Bearer Token', re: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g },
  { name: 'Private Key PEM', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'Database URI Credentials', re: /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^:\s]+:[^@\s]+@[^\s]+/gi },
];

/**
 * Symlink-aware path confinement check.
 * Rejects null bytes, `..` escapes, and any existing symlink (on target or ancestors)
 * whose realpath points outside `baseDir`.
 */
export function assertSafeSubpathSync(baseDir: string, candidatePath: string): string {
  if (typeof candidatePath !== 'string' || candidatePath.trim() === '' || candidatePath.includes('\0')) {
    throw new Error(`Unsafe path rejected: invalid characters in "${String(candidatePath)}"`);
  }

  const resolvedBase = path.resolve(baseDir);
  const parsedBase = path.parse(resolvedBase);
  if (resolvedBase === parsedBase.root) {
    throw new Error(`Refusing to operate with filesystem root "${resolvedBase}" as base.`);
  }

  const resolvedTarget = path.resolve(resolvedBase, candidatePath);
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error(`Path traversal blocked: "${candidatePath}" resolves outside "${resolvedBase}"`);
  }

  const realBase = fs.existsSync(resolvedBase) ? fs.realpathSync(resolvedBase) : resolvedBase;

  // Walk segments from baseDir down to target, checking symlinks on existing segments
  const rel = path.relative(resolvedBase, resolvedTarget);
  if (rel) {
    const segments = rel.split(path.sep);
    let cursor = resolvedBase;
    for (const seg of segments) {
      cursor = path.join(cursor, seg);
      if (fs.existsSync(cursor)) {
        const st = fs.lstatSync(cursor);
        if (st.isSymbolicLink()) {
          const linkReal = fs.realpathSync(cursor);
          if (linkReal !== realBase && !linkReal.startsWith(realBase + path.sep)) {
            throw new Error(
              `Symlink escape blocked: "${cursor}" points to "${linkReal}" outside "${realBase}"`,
            );
          }
        }
      }
    }
  }

  return resolvedTarget;
}

/**
 * Writes `data` atomically by writing to a temporary sibling file and renaming into place.
 */
export function atomicWriteFileSync(targetPath: string, data: string | Buffer): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    `.${path.basename(targetPath)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`,
  );
  try {
    fs.writeFileSync(tempPath, data);
    fs.renameSync(tempPath, targetPath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore temp cleanup failure
      }
    }
    throw err;
  }
}

/**
 * Cooperative exclusive-file lock to prevent concurrent manifest/ledger corruption.
 */
export function withAdvisoryLock<T>(
  lockFilePath: string,
  fn: () => T,
  staleThresholdMs = 30_000,
): T {
  fs.mkdirSync(path.dirname(lockFilePath), { recursive: true });

  const acquire = () => {
    try {
      const fd = fs.openSync(lockFilePath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      fs.closeSync(fd);
      return true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw err;
      // Clear stale lock if expired
      try {
        const stat = fs.statSync(lockFilePath);
        if (Date.now() - stat.mtimeMs > staleThresholdMs) {
          fs.unlinkSync(lockFilePath);
          const fd = fs.openSync(lockFilePath, 'wx');
          fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
          fs.closeSync(fd);
          return true;
        }
      } catch {
        // Another process handled lock
      }
      return false;
    }
  };

  if (!acquire()) {
    throw new Error(`Concurrency lock held at "${lockFilePath}". Retry after active operation finishes.`);
  }

  try {
    return fn();
  } finally {
    try {
      if (fs.existsSync(lockFilePath)) fs.unlinkSync(lockFilePath);
    } catch {
      // Ignore lock release failure
    }
  }
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const { re } of SECRET_PATTERNS) {
    out = out.replace(re, '[REDACTED_SECRET]');
  }
  return out;
}

export function scanForSecrets(text: string, fileLabel = '<memory>'): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const { name, re } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) {
        findings.push({
          patternName: name,
          file: fileLabel,
          line: idx + 1,
          redactedPreview: redactSecrets(line).trim().slice(0, 120),
        });
      }
      re.lastIndex = 0;
    }
  });
  return findings;
}

export type DestructiveActionKind =
  | 'force-overwrite'
  | 'force-uninstall'
  | 'purge-directory'
  | 'destructive-shell';

export interface DestructiveApproval {
  approved: boolean;
  actor: string;
  reason: string;
}

export interface DestructiveActionRequest {
  kind: DestructiveActionKind;
  target: string;
  approval?: DestructiveApproval;
}

const DANGEROUS_SHELL_RE =
  /\b(?:rm\s+-rf|rm\s+-fr|git\s+reset\s+--hard|git\s+push\s+(?:-f|--force)|mkfs\.|dd\s+if=|drop\s+table|drop\s+database|truncate\s+table)\b/i;

export function isDangerousShellCommand(command: string): boolean {
  return DANGEROUS_SHELL_RE.test(command);
}

export function assertDestructiveApproved(req: DestructiveActionRequest): void {
  if (!req.approval || !req.approval.approved) {
    throw new Error(
      `Destructive action "${req.kind}" on "${req.target}" requires explicit approval ({ approved: true, actor, reason }).`,
    );
  }
  if (!req.approval.actor?.trim() || !req.approval.reason?.trim()) {
    throw new Error(
      `Destructive action "${req.kind}" approval must record non-empty actor and reason.`,
    );
  }
}
