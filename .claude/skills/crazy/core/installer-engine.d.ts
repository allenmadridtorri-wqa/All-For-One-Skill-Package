export type FrontierTarget = 'claude' | 'antigravity' | 'chatgpt';

export const FRONTIER_TARGETS: FrontierTarget[];
export const SKILL_COMMANDS: readonly string[];

export interface InstallOptions {
  sourceRoot: string;
  targetRoot: string;
  target?: FrontierTarget | 'all';
  global?: boolean;
  homeDir?: string;
  dryRun?: boolean;
  force?: boolean;
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
  targets: FrontierTarget[];
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
}

export interface UninstallResult {
  ok: boolean;
  dryRun: boolean;
  removed: string[];
  skippedUserModified: string[];
  message: string;
}

export function assertSafeSubpath(baseDir: string, candidatePath: string): string;
export function validateDestinationRoot(destRoot: string): string;
export function safeInstall(options: InstallOptions): InstallResult;
export function safeUninstall(options: UninstallOptions): UninstallResult;
