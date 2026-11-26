# All For One — Cross-Frontier Windows PowerShell Installer
# Usage:
#   .\install.ps1                 (Installs globally for Claude, Antigravity, ChatGPT/Codex)
#   .\install.ps1 -Workspace      (Installs into current project workspace)
#   .\install.ps1 -Target claude  (Installs only for a specific platform)

param(
  [ValidateSet("all", "claude", "antigravity", "chatgpt")]
  [string]$Target = "all",
  [switch]$Workspace
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js (>= 18) is required to install All For One."
  exit 1
}

$InstallerPath = Join-Path $PSScriptRoot "scripts\install.mjs"
$ArgsList = @("--target=$Target")
if ($Workspace) {
  $ArgsList += "--workspace"
} else {
  $ArgsList += "--global"
}

& node $InstallerPath @ArgsList
