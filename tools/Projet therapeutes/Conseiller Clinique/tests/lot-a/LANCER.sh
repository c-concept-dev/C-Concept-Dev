#!/bin/sh
# LOT A — les deux mesures qui exigent de vrais appels au modele.
# La cle est demandee ici, sans echo : elle ne traverse ni le depot, ni la conversation.
set -e
cd "$(dirname "$0")/../.."
NODE_PATH="${NODE_PATH:-$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules}"
export NODE_PATH
CHROME="$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
[ -x "$CHROME" ] && export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$CHROME"
printf 'Cle du Worker (la frappe reste invisible) : '
stty -echo 2>/dev/null || true
read K
stty echo 2>/dev/null || true
printf '\n\n'
export STUDIO_WORKER_API_KEY="$K"
echo '=== A0 — generation reelle ==================================================='
node tests/lot-a/generation-reelle.cjs || echo '(A0 en echec, voir ci-dessus)'
echo
echo '=== A1 + A2 — marge de grammaire ============================================='
node tests/lot-a/mesure-budget-grammaire.cjs || echo '(A1/A2 en echec, voir ci-dessus)'
