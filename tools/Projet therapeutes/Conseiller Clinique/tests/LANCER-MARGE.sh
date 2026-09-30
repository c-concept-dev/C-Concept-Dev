#!/bin/sh
# MESURE DE LA MARGE DE GRAMMAIRE du schéma d'outil Présentation — VRAIS appels, quelques centimes.
#
# Combien de chaînes scalaires peuvent encore être ajoutées avant que la compilation ne soit refusée
# (« The compiled grammar is too large », HTTP 400) ? Aucun contrôle local ne peut y répondre : la
# limite n'est pas documentée et ne se constate qu'à l'appel. À lancer AVANT toute addition au schéma.
#
# La clé est saisie ici : elle ne passe ni par un argument de commande, ni par l'historique du shell,
# ni par un fichier du dépôt.
cd "$(dirname "$0")"
printf 'Clé API du Worker (colle puis Entrée) : '
read K
echo
STUDIO_WORKER_API_KEY="$K" node mesure-marge-grammaire.cjs "$@"
