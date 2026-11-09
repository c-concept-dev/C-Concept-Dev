#!/bin/sh
# Le COMMIT fait foi ; la copie active doit lui être identique, octet pour octet.
#
# POURQUOI DEUX COPIES EXISTENT
#
# Le travail se fait dans une copie liée du dépôt, pour que le basculement de branche d'une autre
# session ne vienne pas changer celle-ci sous les pieds (registre du 29 octobre). Mais Claude Code
# lit ses réglages dans le dossier de la SESSION, qui est la copie principale. Les deux existent
# donc, et c'est une conséquence du choix de la copie liée, pas un oubli.
#
# CE QUI FAIT FOI
#
# Le commit, et non un fichier frère. La première version de ce script comparait la copie active à
# celle d'à côté, en appelant celle-ci « la copie versionnée » : elle ne l'était pas, aucun fichier
# de .claude/ n'étant suivi par Git. Remplacer le crochet dans les deux copies passait alors
# inaperçu. C'était la dette D19, levée le 9 novembre 2026.
#
# CE SCRIPT EST LE DIAGNOSTIC, PAS LE GARDE-FOU
#
# Un script qu'on lance quand on y pense dépend de l'attention. Le garde-fou est le contrôle
# `packages/banc/test/reglages-actifs.test.ts`, qui tourne dans `pnpm check` et compare au commit
# la copie principale — celle où une session lit ses réglages. Ce script-ci sert à comparer une
# copie qu'on NOMME, et à voir les empreintes quand le contrôle a rougi.
#
#     sh .claude/crochets/verifier-reglages.sh <dossier-de-la-copie-active>

projet=$(cd "$(dirname "$0")/../.." && pwd)
active="${1:?dossier de la copie active attendu}"
prefixe=$(cd "$projet" && git rev-parse --show-prefix)

ecarts=0
for relatif in .claude/settings.json .claude/crochets/refuser-gestes-destructeurs.sh .claude/crochets/verifier-reglages.sh; do
  b="$active/$relatif"
  if ! (cd "$projet" && git cat-file -e "HEAD:$prefixe$relatif" 2>/dev/null); then
    printf '  %-52s ABSENT DU COMMIT\n' "$relatif"
    ecarts=$((ecarts + 1))
    continue
  fi
  if [ ! -f "$b" ]; then
    printf '  %-52s absente de la copie active (aucun réglage n%sy agit)\n' "$relatif" "'"
    continue
  fi
  if (cd "$projet" && git show "HEAD:$prefixe$relatif") | cmp -s - "$b"; then
    printf '  %-52s identique au commit\n' "$relatif"
  else
    printf '  %-52s DIFFÈRE du commit\n' "$relatif"
    printf '      commit : %s\n' "$( (cd "$projet" && git show "HEAD:$prefixe$relatif") | shasum -a 256 | cut -c1-16)"
    printf '      active : %s\n' "$(shasum -a 256 "$b" | cut -c1-16)"
    ecarts=$((ecarts + 1))
  fi
done

if [ "$ecarts" -eq 0 ]; then
  printf '\n  Les réglages actifs sont ceux que le commit porte.\n'
  exit 0
fi

printf '\n  %s écart(s). La session obéit à des réglages que le dépôt ne porte pas.\n' "$ecarts"
printf '  Remettre d'"'"'accord : git pull dans la copie active, ou réinstaller depuis le commit.\n'
exit 1
