#!/bin/sh
# Mesure a vrai appel de l'embarquement des images. AUCUNE generation : le document est repris
# d'un export deja produit. Seuls partent des appels /fetch-image et des telechargements d'images.
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
STUDIO_WORKER_API_KEY="$K" node tests/lot-b/mesure-images-export.cjs "$@"
