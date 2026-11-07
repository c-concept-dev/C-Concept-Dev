#!/bin/sh
# Refuse les gestes qui détruisent du travail sans le dire — et dit quoi faire à la place.
#
# POURQUOI IL EXISTE
#
# Le 7 novembre 2026, un « git reset --hard HEAD~1 » tapé dans un essai jetable a emporté sept
# fichiers modifiés : le lot Vision entier, l'atelier d'un autre lot, et le registre. Une branche
# locale de sauvegarde les a rendus — mais la sauvegarde datait d'une heure et portait une version
# partielle du registre : trois sections ont failli disparaître sans trace.
#
# Le même jour, un « cp » avait déjà effacé une section du registre, et « git apply --3way » avait
# fait entrer 96 lignes d'un autre lot dans un commit d'autorisation.
#
# Les trois ont en commun de RÉUSSIR EN SILENCE. Une règle écrite ne les arrête pas : la règle
# était écrite, et je les ai faits quand même. D'où une mécanique.
#
# CE QU'IL N'EST PAS
#
# Un filet, pas un mur. Un filtre par motif se contourne — « git -C autre-dossier reset --hard »,
# « bash -c "…" », « find . -delete », un alias. Il arrête le geste distrait, qui est celui qui
# cause les dégâts ; il n'arrête pas une volonté de contourner. C'est écrit au registre.
#
# CE QU'IL FAIT
#
# Il lit l'appel d'outil sur l'entrée standard, cherche la commande, et sort avec le code 2 pour
# bloquer — ce que la documentation décrit comme agissant AVANT les règles de permission, donc
# quel que soit le mode, « Ignorer les permissions » compris.

appel=$(cat)
commande=$(printf '%s' "$appel" | /usr/bin/python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("command", ""))
except Exception:
    print("")' 2>/dev/null)

[ -z "$commande" ] && exit 0

refuser() {
  printf 'GESTE REFUSÉ — %s\n\n  %s\n\nÀ la place : %s\n' "$1" "$commande" "$2" >&2
  printf '\nCe refus vient du crochet de la Liénothèque (.claude/crochets). Il arrête les gestes qui\n' >&2
  printf 'détruisent du travail sans le dire. Pour passer outre, il faut le mot de Christophe.\n' >&2
  exit 2
}

# ── Ce qui est EXÉCUTÉ, et non ce qui est ÉCRIT ────────────────────────────────────────────────
#
# Première version : les motifs portaient sur la ligne entière. Elle a refusé la commande qui
# corrigeait ce crochet, parce que cette commande ÉCRIVAIT le texte « git stash » dans un fichier.
# Un filtre sur toute la ligne ne distingue pas exécuter de citer — le même défaut que les
# garde-fous qui lisaient leurs propres exemples entre guillemets, trois fois ce jour-là.
#
# On découpe donc la ligne aux séparateurs de commandes, et on ne juge que des segments qui
# COMMENCENT par la commande visée. Une ligne de données, un corps de document en place ou une
# chaîne citée ne commencent pas par « git » après élagage des blancs.
#
# Cela reste un filet : « git -C ailleurs reset --hard », un alias, ou la même commande écrite
# dans un script puis exécuté, passent. Le registre le dit.
segments=$(printf '%s' "$commande" | tr '\n;|&' '\n\n\n\n')

juger_segment() {
  segment=$(printf '%s' "$1" | sed 's/^[[:space:]]*//')

  # ── Les préfixes ordinaires, retirés avant de juger ──────────────────────────────────────────
  #
  # Un segment commence rarement par la commande elle-même. « GIT_INDEX_FILE=… git … » est un
  # geste que j'emploie tous les jours ; « sudo », « time », « command » et une parenthèse
  # ouvrante sont des enveloppes courantes. Sans les retirer, le segment ne commence pas par
  # « git » et le crochet laisse passer — c'est-à-dire qu'il devient aveugle précisément là où
  # quelqu'un écrit une commande un peu plus habillée que la moyenne.
  #
  # On épluche en boucle : plusieurs préfixes peuvent se suivre.
  avant=""
  while [ "$avant" != "$segment" ]; do
    avant="$segment"
    segment=$(printf '%s' "$segment" | sed -E 's/^\(+[[:space:]]*//')
    segment=$(printf '%s' "$segment" | sed -E 's/^[A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+//')
    # L'enveloppe et ses options : « nice -n 5 », « time -p », « sudo -n ». Sans consommer les
    # options, l'épluchage s'arrête sur la première et le segment ne commence plus par la commande.
    segment=$(printf '%s' "$segment" | sed -E 's/^(sudo|time|command|env|nohup|exec|nice)([[:space:]]+(-[^[:space:]]+|[0-9]+))*[[:space:]]+//')
    segment=$(printf '%s' "$segment" | sed 's/^[[:space:]]*//')
  done

  case "$segment" in
    git\ *|/usr/bin/git\ *|rm\ *|/bin/rm\ *) ;;
    *) return 0 ;;
  esac
  commande_jugee="$segment"
  case "$segment" in
  *git*reset*--hard*)
    refuser "git reset --hard efface les modifications non commitées" \
      "« git reset --soft » ou « --mixed » défont le commit en gardant le travail." ;;
  # « stash list » et « stash show » ne font que LIRE : les refuser serait un faux positif, et un
  # garde-fou qui accuse à tort finit par être désarmé. Ils servent à voir si une autre session a
  # laissé une remise — un diagnostic légitime, puisque les remises sont partagées.
  *stash\ list*|*stash\ show*) ;;
  *stash*)
    refuser "les remises git sont partagées entre toutes les sessions de ce dépôt" \
      "une branche locale de sauvegarde, construite par commit-tree et jamais poussée." ;;
  *git*clean*)
    refuser "git clean supprime les fichiers NON SUIVIS, sans trace" \
      "« git clean -n » pour voir d'abord, puis demander. Le travail neuf d'un lot y passerait." ;;
  *git*checkout*-f*|*git*checkout*--force*|*git*switch*-f*|*git*switch*--force*)
    refuser "cette bascule écrase les modifications locales" \
      "commiter sur la branche de sauvegarde, puis basculer sans -f." ;;
  *git*checkout*" -- "*)
    refuser "git checkout -- <chemins> écrase les fichiers, sans conflit et sans avertissement" \
      "« git cherry-pick --no-commit » ou « git apply --3way », qui s'arrêtent sur les conflits." ;;
  *"git checkout ."*|*"git checkout -- ."*)
    refuser "git checkout . écrase TOUT le travail non commité" \
      "commiter sur la branche de sauvegarde d'abord." ;;
  *git*push*--force*)
    refuser "réécrire une branche partagée efface le travail d'autrui" \
      "un commit de correction : la trace reste, l'état est corrigé." ;;
  *git*commit*--no-verify*|*git*commit*" -n "*)
    refuser "--no-verify contourne le crochet de pré-commit" \
      "corriger ce que le crochet signale. Le contourner est une décision de Christophe." ;;
  *"git add -A"*|*"git add --all"*|*"git add ."*)
    refuser "git add -A happe le travail des autres sessions du dépôt (CLAUDE.md, règle des gestes)" \
      "nommer les chemins un par un." ;;
  *rm*-rf*|*rm*-fr*|*rm*-r*-f*)
    refuser "rm -rf ne demande rien et ne laisse rien" \
      "nommer les fichiers, ou « ls » d'abord pour voir ce qui partirait." ;;
  esac

  # git restore : refusé sur des chemins de la copie de travail, autorisé sur l'index seul.
  # « --staged » sans « --worktree » ne touche QUE l'index : c'est le geste qui désindexe, et il
  # ne détruit rien. Tout le reste réécrit des fichiers.
  case "$segment" in
    *restore*)
      case "$segment" in
        *--staged*)
          case "$segment" in
            *--worktree*)
              refuser "git restore --staged --worktree écrase aussi les fichiers" \
                "« git restore --staged » seul, qui ne touche que l'index." ;;
          esac ;;
        *)
          refuser "git restore <chemins> écrase les fichiers depuis l'index ou une source" \
            "« git restore --staged » pour désindexer sans rien détruire, ou « git apply --3way »." ;;
      esac ;;
  esac
  return 0
}

ancien_IFS=$IFS
IFS='
'
for segment in $segments; do
  juger_segment "$segment"
done
IFS=$ancien_IFS

exit 0
