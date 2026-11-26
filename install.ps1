# All For One V3.1 — Cross-Platform Windows PowerShell Installer
# Usage:
#   .\install.ps1                              (Safe global install for all frontiers)
#   .\install.ps1 -Workspace                   (Safe workspace install)
#   .\install.ps1 -Target claude -DryRun       (Preview Claude install without changes)
#   .\install.ps1 -Workspace -Force -Yes       (Backup and overwrite modified files)
#   .\install.ps1 -Verify -Workspace           (Verify SHA-256 install integrity)
#   .\install.ps1 -CheckTools                  (Check Node.js, Git, Blender, FFmpeg)
#   .\install.ps1 -Uninstall                   (Safe uninstall preserving user files)

param(
  [ValidateSet("all", "claude", "antigravity", "chatgpt")]
  [string]$Target = "all",
  [switch]$Workspace,
  [switch]$DryRun,
  [switch]$Force,
  [switch]$Yes,
  [switch]$Verify,
  [switch]$CheckTools,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
  Write-Error "Node.js (>= 18) is required to install All For One. Download from https://nodejs.org/"
  exit 1
}

if ($Force -and -not $Yes -and -not $DryRun) {
  Write-Error "-Force requires -Yes to confirm overwriting user-modified files (backups will still be written to .afo-backups)."
  exit 1
}

$InstallerPath = Join-Path $PSScriptRoot "scripts\install.mjs"
$ArgsList = @()

if ($CheckTools) {
  $ArgsList += "--check-tools"
} elseif ($Verify) {
  $ArgsList += "--verify"
  if ($Workspace) { $ArgsList += "--workspace" } else { $ArgsList += "--global" }
} else {
  $ArgsList += "--target=$Target"
  if ($Workspace) { $ArgsList += "--workspace" } else { $ArgsList += "--global" }
  if ($DryRun) { $ArgsList += "--dry-run" }
  if ($Force) { $ArgsList += "--force" }
  if ($Yes) { $ArgsList += "--yes" }
  if ($Uninstall) { $ArgsList += "--uninstall" }
}

& $NodeCmd.Source $InstallerPath @ArgsList
exit $LASTEXITCODE
