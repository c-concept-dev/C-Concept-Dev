#!/bin/sh
# EvidenceForge — DIAGNOSTIC sans lancer de run. Usage : ./tools/EvidenceForge/doctor.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null 2>&1 || { echo "Node.js est requis (https://nodejs.org) — introuvable dans le PATH." >&2; exit 1; }
exec node "$DIR/bin/launcher.js" doctor "$@"
