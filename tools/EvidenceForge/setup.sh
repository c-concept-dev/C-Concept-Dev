#!/bin/sh
# EvidenceForge — CONFIGURATION (une seule fois). Usage : ./tools/EvidenceForge/setup.sh [--from-env] [--force]
# Écrit tools/EvidenceForge/.env.local (chmod 600, gitignoré). La clé est saisie sans écho et n'est jamais réaffichée.
# --from-env : réutilise sans les afficher LLM_WORKER_BASE_URL / EVIDENCEFORGE_WORKER_API_KEY déjà présents dans l'environnement du terminal.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"; ENV_FILE="$DIR/.env.local"
command -v node >/dev/null 2>&1 || { echo "Node.js est requis (https://nodejs.org) — introuvable dans le PATH." >&2; exit 1; }
FROM_ENV=0; FORCE=0; for a in "$@"; do [ "$a" = "--from-env" ] && FROM_ENV=1; [ "$a" = "--force" ] && FORCE=1; done
if [ -f "$ENV_FILE" ] && [ "$FORCE" != "1" ]; then
  echo "Une configuration locale existe déjà : $ENV_FILE"
  echo "  - pour la vérifier : ./tools/EvidenceForge/doctor.sh"
  echo "  - pour la refaire   : ./tools/EvidenceForge/setup.sh --force"
  exit 0
fi
echo "EvidenceForge — configuration locale (les valeurs restent sur cette machine ; la clé n'est jamais affichée)."
URL=""; KEY=""
if [ -n "$LLM_WORKER_BASE_URL" ] && [ -n "$EVIDENCEFORGE_WORKER_API_KEY" ]; then
  if [ "$FROM_ENV" = "1" ]; then URL="$LLM_WORKER_BASE_URL"; KEY="$EVIDENCEFORGE_WORKER_API_KEY"; echo "Réutilisation de la configuration présente dans ce terminal (worker + clé, non affichés)."
  else printf "Une configuration fonctionnelle semble présente dans ce terminal (worker + clé). La réutiliser sans l'afficher ? [O/n] "; read -r ANS; case "$ANS" in n|N|non|NON) ;; *) URL="$LLM_WORKER_BASE_URL"; KEY="$EVIDENCEFORGE_WORKER_API_KEY";; esac; fi
fi
if [ -z "$URL" ]; then printf "Adresse du worker (https://…workers.dev) : "; read -r URL; fi
if [ -z "$KEY" ]; then printf "Clé du worker (saisie masquée) : "; stty -echo 2>/dev/null || true; read -r KEY; stty echo 2>/dev/null || true; echo ""; fi
printf "Modèle [claude-sonnet-4-6] : "; read -r MODEL; [ -z "$MODEL" ] && MODEL="claude-sonnet-4-6"
printf "Port [8768] : "; read -r PORT; [ -z "$PORT" ] && PORT="8768"
DEFRUNS="${EVIDENCEFORGE_RUNS_ROOT:-$HOME/evidenceforge-runs}"; printf "Dossier des runs [%s] : " "$DEFRUNS"; read -r RUNS; [ -z "$RUNS" ] && RUNS="$DEFRUNS"
echo "Test de la configuration (sonde gratuite du worker, aucun appel payant)…"
EF_SETUP_URL="$URL" EF_SETUP_KEY="$KEY" EF_SETUP_MODEL="$MODEL" EF_SETUP_PORT="$PORT" EF_SETUP_RUNS="$RUNS" node "$DIR/bin/launcher.js" setup-write
echo "Terminé. Lancez : ./tools/EvidenceForge/start.sh"
