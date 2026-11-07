#!/bin/sh
# La copie VERSIONNÉE fait foi ; la copie active doit lui être identique, octet pour octet.
#
# POURQUOI DEUX COPIES EXISTENT
#
# Le travail se fait dans une copie liée du dépôt (`…-main-fusion-wt`), pour que le basculement de
# branche d'une autre session ne vienne pas changer celle-ci sous les pieds (registre du 29
# octobre). Mais Claude Code lit ses réglages dans le dossier de la SESSION, qui est la copie
# principale. Les deux existent donc, et c'est une conséquence du choix de la copie liée, pas un
# oubli.
#
# CE QUI FAIT FOI
#
# La copie versionnée. L'autre est une installation : si elles diffèrent, la session obéit à un
# crochet que personne ne relit et que le dépôt ne porte pas — exactement l'inverse de ce qu'un
# garde-fou versionné doit garantir.
#
# Un `git pull` dans la copie principale les remet d'accord. Ce script sert à le VÉRIFIER, parce
# qu'un réglage divergent ne se signale pas tout seul : il agit, simplement, autrement.
#
# CE SCRIPT EST LE DIAGNOSTIC, PAS LE GARDE-FOU
#
# Un script qu'on lance quand on y pense dépend de l'attention. Le garde-fou est le contrôle
# `packages/banc/test/reglages-actifs.test.ts`, qui tourne dans `pnpm check` et compare la copie
# principale — celle où une session lit ses réglages. Ce script-ci sert à comparer une copie qu'on
# NOMME, et à voir les empreintes quand le contrôle a rougi.
#
#     sh .claude/crochets/verifier-reglages.sh <dossier-de-la-copie-active>

versionnee=$(cd "$(dirname "$0")/../.." && pwd)
active="${1:?dossier de la copie active attendu}"

ecarts=0
for relatif in .claude/settings.json .claude/crochets/refuser-gestes-destructeurs.sh; do
  a="$versionnee/$relatif"
  b="$active/$relatif"
  if [ ! -f "$b" ]; then
    printf '  %-52s ABSENTE de la copie active\n' "$relatif"
    ecarts=$((ecarts + 1))
    continue
  fi
  if cmp -s "$a" "$b"; then
    printf '  %-52s identique\n' "$relatif"
  else
    printf '  %-52s DIFFÈRE\n' "$relatif"
    printf '      versionnée : %s\n' "$(shasum -a 256 "$a" | cut -c1-16)"
    printf '      active     : %s\n' "$(shasum -a 256 "$b" | cut -c1-16)"
    ecarts=$((ecarts + 1))
  fi
done

if [ "$ecarts" -eq 0 ]; then
  printf '\n  Les réglages actifs sont ceux que le dépôt porte.\n'
  exit 0
fi

printf '\n  %s écart(s). La session obéit à des réglages que le dépôt ne porte pas.\n' "$ecarts"
printf '  Remettre d'"'"'accord : git pull dans la copie active, ou réinstaller depuis la versionnée.\n'
exit 1
