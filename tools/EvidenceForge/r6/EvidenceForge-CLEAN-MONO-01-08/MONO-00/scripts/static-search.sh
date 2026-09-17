#!/bin/bash
# MONO-00 — recherche statique exhaustive.
# CORRECTION post-audit indépendant : le défaut par défaut pointait vers
# /tmp/mono00-verify (répertoire de session Claude, absent d'un
# environnement neuf). Le chemin racine doit désormais être fourni
# explicitement ; à défaut, ce script cherche un dossier "mono00-verify" à
# côté de lui-même (repli relatif, jamais un chemin de session codé en dur)
# et s'arrête avec un message clair si rien n'est trouvé.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/mono00-verify"

ROOT="${1:-$DEFAULT_ROOT}"

if [ ! -d "$ROOT" ]; then
  echo "ERREUR : répertoire racine de baseline introuvable : $ROOT"
  echo "Fournissez-le explicitement : ./static-search.sh <chemin vers les paquets extraits>"
  exit 1
fi

cd "$ROOT" || exit 1
echo "Racine de recherche : $ROOT"
TERMS="JMJS|S01|S02|DIMS|truthScore|truth_score|prestige|majority|consensus|scientificValidity.?:.?true"
echo "=== Recherche par module (code exécutable .js, hors node_modules) ==="
for mod in EF-ORCH EF-PR-GEN-01 EF-02ABC EF-02D EF-02E EF-03 EF-04; do
  [ -d "$mod" ] || { echo "--- $mod : absent de $ROOT, ignoré ---"; continue; }
  echo "--- $mod ---"
  find "$mod" -name "*.js" ! -path "*/node_modules/*" -exec grep -lIE "$TERMS" {} \; 2>/dev/null
done
echo ""
echo "=== S01/S02/DIMS dans le code cœur uniquement (hors test/dependencies/fixtures) ==="
for mod in EF-PR-GEN-01/EF-PR-GEN-01 EF-02ABC/EF-02ABC-v1 EF-02D/EF-02D-v1/src EF-02E/EF-02E-v1/src EF-03/EF-03-v1/src EF-04/EF-04-v1/src; do
  [ -d "$mod" ] || continue
  find "$mod" -maxdepth 1 -name "*.js" ! -path "*test*" 2>/dev/null | while read -r f; do
    m=$(grep -noE "\bS01\b|\bS02\b|\bDIMS\b" "$f" 2>/dev/null)
    [ -n "$m" ] && echo "$f: $m"
  done
done
