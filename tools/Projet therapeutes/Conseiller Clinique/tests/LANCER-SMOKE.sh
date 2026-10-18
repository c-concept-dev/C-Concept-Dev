#!/bin/sh
# Test de fumée des schémas d'outil — sept VRAIS appels à max_tokens:1, quelques centimes.
#
# À LANCER AVANT TOUT PUSH QUI TOUCHE UN SCHÉMA D'OUTIL. Aucun contrôle local ne le remplace.
#
# LA CLÉ : elle est demandée ici, la frappe reste invisible, et elle n'est passée au test que
# par une variable d'environnement posée SUR CETTE SEULE COMMANDE. Elle ne passe donc ni par la
# ligne de commande (où `ps` la montrerait), ni par l'historique du shell, ni par un fichier.
# Aucun script d'ici n'écrit quoi que ce soit sur le disque.
#
#   ./tests/LANCER-SMOKE.sh                 le test réel, avec la clé
#   ./tests/LANCER-SMOKE.sh --sans-appel    essai à blanc : ni clé, ni appel, ni dépense
set -e
cd "$(dirname "$0")/.."

# Essai à blanc : aucune clé n'est demandée, puisqu'aucun appel ne part.
for a in "$@"; do
  if [ "$a" = "--sans-appel" ]; then
    exec node tests/smoke-schema-outil-reel.cjs "$@"
  fi
done

# Si le terminal est interrompu pendant la saisie (Ctrl-C), l'écho DOIT revenir : sans ce
# filet, le terminal reste muet et l'on tape à l'aveugle jusqu'à le fermer. Constaté en
# relisant le script : `set -e` sortait sans jamais repasser par `stty echo`.
trap 'stty echo 2>/dev/null || true' EXIT INT TERM HUP

printf 'Cle du Worker (la frappe reste invisible) : '
stty -echo 2>/dev/null || true
# -r : sans lui, un antislash dans la clé serait silencieusement mangé, et le test conclurait
# à un refus de l'API là où il n'y aurait qu'une clé abîmée en chemin.
read -r K
stty echo 2>/dev/null || true
printf '\n\n'

STUDIO_WORKER_API_KEY="$K" node tests/smoke-schema-outil-reel.cjs "$@"
