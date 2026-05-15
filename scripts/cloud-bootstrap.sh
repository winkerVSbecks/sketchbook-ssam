#!/usr/bin/env bash
# Cloud-only bootstrap for the ssam sketchbook.
# Runs on every SessionStart via .claude/settings.json. Local Mac sessions
# short-circuit immediately so this is a no-op for the user's normal workflow.
#
# In claude.ai/code (CLAUDE_CODE_REMOTE=true): ensures chromium-headless-shell
# is present under .cloud-render/browsers so the first cloud:render doesn't pay
# the ~30-45s install on the interactive path.

set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-false}" != "true" ]; then
  exit 0
fi

PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLOUD_DIR="${PROJECT_ROOT}/.cloud-render"
BROWSERS_DIR="${CLOUD_DIR}/browsers"

mkdir -p "${CLOUD_DIR}"

# Playwright's headless-shell directory uses different separators across versions
# (chromium_headless_shell-* in newer builds, chrome-headless-shell-* in older).
shopt -s nullglob
existing=("${BROWSERS_DIR}"/chromium_headless_shell-* "${BROWSERS_DIR}"/chrome-headless-shell-*)
if [ ${#existing[@]} -gt 0 ]; then
  exit 0
fi
shopt -u nullglob

echo "[cloud-bootstrap] installing chromium-headless-shell into ${BROWSERS_DIR}" >&2
export PLAYWRIGHT_BROWSERS_PATH="${BROWSERS_DIR}"

INSTALL_LOG="${CLOUD_DIR}/install.log"
if ! ( cd "${PROJECT_ROOT}" && npm run cloud:install ) >"${INSTALL_LOG}" 2>&1; then
  echo "[cloud-bootstrap] cloud:install failed — see ${INSTALL_LOG}" >&2
  exit 0
fi

echo "[cloud-bootstrap] chromium-headless-shell ready" >&2
