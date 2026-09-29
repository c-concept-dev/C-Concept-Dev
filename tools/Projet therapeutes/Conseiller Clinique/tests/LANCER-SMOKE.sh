#!/bin/sh
# Test de fumée des schémas d'outil — six VRAIS appels à max_tokens:1, quelques centimes.
# La clé est demandée ici, sans écho : elle ne passe ni par la ligne de commande, ni par
# l'historique du shell, ni par un fichier du dépôt.
#
# À LANCER AVANT TOUT PUSH QUI TOUCHE UN SCHÉMA D'OUTIL. Aucun contrôle local ne le remplace.
set -e
cd "$(dirname "$0")/.."
printf 'Cle du Worker (la frappe reste invisible) : '
stty -echo 2>/dev/null || true
read K
stty echo 2>/dev/null || true
printf '\n\n'
STUDIO_WORKER_API_KEY="$K" node tests/smoke-schema-outil-reel.cjs "$@"
