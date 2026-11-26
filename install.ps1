# All For One V2 — Cross-Platform Windows PowerShell Installer
# Usage:
#   .\install.ps1                          (Safe global install for all frontiers)
#   .\install.ps1 -Workspace               (Safe workspace install)
#   .\install.ps1 -Target claude -DryRun   (Preview Claude install without changes)
#   .\install.ps1 -Uninstall               (Safe uninstall preserving user files)

param(
  [ValidateSet("all", "claude", "antigravity", "chatgpt")]
  [string]$Target = "all",
  [switch]$Workspace,
  [switch]$DryRun,
  [switch]$Force,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js (>= 18) is required to install All For One."
  exit 1
}

$InstallerPath = Join-Path $PSScriptRoot "scripts\install.mjs"
$ArgsList = @("--target=$Target")
if ($Workspace) { $ArgsList += "--workspace" } else { $ArgsList += "--global" }
if ($DryRun) { $ArgsList += "--dry-run" }
if ($Force) { $ArgsList += "--force" }
if ($Uninstall) { $ArgsList += "--uninstall" }

& node $InstallerPath @ArgsList
