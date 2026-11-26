export type FrontierTarget = 'claude' | 'antigravity' | 'chatgpt';
export type ExtendedTarget = 'cursor' | 'windsurf' | 'cline' | 'copilot' | 'gemini-cli' | 'opencode';
export type SupportedTarget = FrontierTarget | ExtendedTarget;

export const FRONTIER_TARGETS: FrontierTarget[];
export const EXTENDED_TARGETS: ExtendedTarget[];
export const SUPPORTED_TARGETS: SupportedTarget[];
export const SKILL_COMMANDS: readonly string[];

export interface InstallOptions {
  sourceRoot: string;
  targetRoot: string;
  target?: SupportedTarget | 'all';
  global?: boolean;
  homeDir?: string;
  dryRun?: boolean;
  force?: boolean;
  requireApprovalForForce?: boolean;
  destructiveApproval?: { approved: boolean; actor: string; reason: string };
  simulateFailureAtIndex?: number;
}

export interface InstallAction {
  action: 'create' | 'unchanged' | 'skip-user-modified' | 'update-with-backup' | 'force-replace-with-backup';
  path: string;
  rel: string;
  backupPath?: string;
  target: string;
}

export interface InstallResult {
  ok: boolean;
  dryRun: boolean;
  force: boolean;
  scope: 'global' | 'workspace';
  targets: SupportedTarget[];
  manifestPath: string;
  backupRoot: string | null;
  actions: InstallAction[];
  summary: {
    created: number;
    updated: number;
    unchanged: number;
    skippedUserModified: number;
  };
}

export interface UninstallOptions {
  targetRoot: string;
  global?: boolean;
  homeDir?: string;
  dryRun?: boolean;
  force?: boolean;
  requireApprovalForForce?: boolean;
  destructiveApproval?: { approved: boolean; actor: string; reason: string };
}

export interface UninstallResult {
  ok: boolean;
  dryRun: boolean;
  removed: string[];
  skippedUserModified: string[];
  backupRoot: string | null;
  backedUpModified: string[];
  message: string;
}

export interface IntegrityReport {
  ok: boolean;
  manifestFound: boolean;
  verifiedCount: number;
  missingFiles: string[];
  modifiedFiles: string[];
  message: string;
}

export interface ExternalToolsReport {
  node: { required: boolean; available: boolean; version: string | null };
  git: { required: boolean; available: boolean; version: string | null };
  blender: { required: boolean; available: boolean; version: string | null };
  ffmpeg: { required: boolean; available: boolean; version: string | null };
}

export function extractSkillReferencedPaths(markdown: string): string[];
export function collectSkillSupportFiles(
  resolvedSource: string,
  skillMarkdown: string,
): Array<{ rel: string; full: string }>;
export function generateCompactTargetRouter(targetName: string, skillRelRoot?: string): string;
export function generateAntigravityWorkflow(cmd: string, skillMarkdown: string): string;
export function assertSafeSubpath(baseDir: string, candidatePath: string): string;
export function validateDestinationRoot(destRoot: string): string;
export function safeInstall(options: InstallOptions): InstallResult;
export function safeUninstall(options: UninstallOptions): UninstallResult;
export function verifyInstallIntegrity(options: {
  targetRoot: string;
  global?: boolean;
  homeDir?: string;
}): IntegrityReport;
export function detectExternalTools(): ExternalToolsReport;
