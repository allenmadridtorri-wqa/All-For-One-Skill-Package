#!/usr/bin/env bash
set -euo pipefail

# All For One V2 — Cross-Platform Installer (macOS / Linux)
# Supports: --global | --workspace | --target=claude|antigravity|chatgpt|all | --dry-run | --force | --uninstall

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO="https://github.com/allenmadridtorri-wqa/All-For-One-Skill-Package.git"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>= 18) is required to run the All For One installer." >&2
  exit 1
fi

if [[ -f "${SCRIPT_DIR}/scripts/install.mjs" ]]; then
  node "${SCRIPT_DIR}/scripts/install.mjs" "$@"
else
  REPO_URL="${ALL_FOR_ONE_REPO:-${DEFAULT_REPO}}"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  echo "Cloning All For One from ${REPO_URL}..."
  git clone --depth 1 "${REPO_URL}" "${TMP_DIR}/All-For-One-Skill-Package"
  node "${TMP_DIR}/All-For-One-Skill-Package/scripts/install.mjs" "$@"
fi
