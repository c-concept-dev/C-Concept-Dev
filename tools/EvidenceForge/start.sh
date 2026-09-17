#!/bin/sh
# EvidenceForge — DÉMARRER (point d'entrée unique). Usage : ./tools/EvidenceForge/start.sh [--no-browser] [--verbose]
# Vérifie la configuration locale (.env.local), le worker (sonde gratuite), le modèle/tarif, les lots gelés, le dossier de runs et le port,
# lance la version active (ACTIVE_VERSION), vérifie /api/config puis ouvre le navigateur. Ctrl+C pour arrêter. Aucun secret n'est affiché.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
command -v node >/dev/null 2>&1 || { echo "Node.js est requis (https://nodejs.org) — introuvable dans le PATH." >&2; exit 1; }
exec node "$DIR/bin/launcher.js" start "$@"
