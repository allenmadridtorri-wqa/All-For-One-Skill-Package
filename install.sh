#!/usr/bin/env bash
set -euo pipefail

# All For One — One-Command Cross-Frontier Installer (macOS / Linux)
# Installs /crazy, /crazydesigner, /crazymaker, and /crazycoder for:
#   - Claude (~/.claude/skills)
#   - Google Antigravity (~/.gemini/antigravity/skills & global_workflows)
#   - ChatGPT / OpenAI Codex (~/.codex/skills)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:---global}"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>= 18) is required to run the All For One installer." >&2
  exit 1
fi

if [[ -f "${SCRIPT_DIR}/scripts/install.mjs" ]]; then
  node "${SCRIPT_DIR}/scripts/install.mjs" "$@"
else
  REPO_URL="${ALL_FOR_ONE_REPO:-https://github.com/YOUR_GITHUB_USER/all-for-one.git}"
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  echo "Cloning All For One from ${REPO_URL}..."
  git clone --depth 1 "${REPO_URL}" "${TMP_DIR}/all-for-one"
  node "${TMP_DIR}/all-for-one/scripts/install.mjs" "$@"
fi
