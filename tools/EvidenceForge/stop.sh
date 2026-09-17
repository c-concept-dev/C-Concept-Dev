#!/bin/sh
# EvidenceForge — ARRÊTER proprement une instance EvidenceForge. Usage : ./tools/EvidenceForge/stop.sh [port] (défaut : port configuré). Jamais une application étrangère.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/bin/launcher.js" stop "$@"
