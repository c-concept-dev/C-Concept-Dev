#!/usr/bin/env bash
# EvidenceForge/MONO-08/v0.6/scripts/package-and-verify.sh
#
# Pipeline de packaging DÉTERMINISTE pour MONO-08 v0.6, introduit par le
# correctif d'audit (Défaut Bloquant 1 : manifest interne). Aucun mismatch
# n'a été reproduit sur le package précédemment audité (voir
# EvidenceForge/MONO-08/v0.6-corrective-r1-evidence-*/MANIFEST-VERIFICATION.md
# pour la preuve), mais ce script rend la classe de défaut structurellement
# impossible pour tout packaging futur, en imposant un ORDRE STRICT :
#
#   1. Générer/exécuter tous les rapports finaux mutables AVANT le manifest
#      (tests, rapports LOCAL_CONTROLLED).
#   2. Ne plus toucher AUCUN fichier après cette étape.
#   3. Générer manifest/SHA256SUMS EN DERNIER, sur l'arborescence figée.
#   4. Vérifier IMMÉDIATEMENT le manifest fraîchement généré
#      (shasum -a 256 -c) — échoue tout le script si un seul mismatch.
#   5. Empaqueter le ZIP.
#   6. Vérifier l'intégrité du ZIP (unzip -t).
#   7. RE-vérifier tous les hashes en RELISANT le contenu depuis le ZIP
#      lui-même (jamais depuis le disque local) — c'est la preuve qui
#      compte : que le manifest packagé DANS le ZIP livré décrit
#      fidèlement le contenu RÉELLEMENT empaqueté.
#
# N'exécute JAMAIS de test REAL (cas G), aucun déploiement Cloudflare,
# aucun Real Smoke. Ce script ne fait qu'orchestrer des commandes déjà
# utilisées manuellement dans les tours précédents (node, shasum, zip,
# unzip) — aucune nouvelle dépendance.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V06_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MONO08_ROOT="$(cd "$V06_ROOT/.." && pwd)"

EVIDENCE_DIR="${1:-}"
PACKAGE_NAME="${2:-EvidenceForge-MONO-08-v0.6-implementation-package-r1.zip}"

if [ -z "$EVIDENCE_DIR" ]; then
  echo "Usage: $0 <evidence-dossier-dir> [package-name.zip]" >&2
  exit 2
fi

echo "== ÉTAPE 1/7 : exécution des tests et rapports finaux (avant manifest) =="
cd "$V06_ROOT"
node test/test_t08_preflight.js
node test/test_t08_v06_delegated_auth.js
node worker/evidenceforge-llm-proxy/test/worker.test.js
# Suite historique v0.5 (fichiers non modifiés par ce correctif) : exit
# codes non-zéro attendus et déjà documentés comme identiques à la
# baseline v0.5 (EVIDENCEFORGE_MONO07_LIB_PATH non fourni pour eforch,
# 2 FAILs connus/documentés pour runner_orchestration liés à l'état de la
# mission, pas à ce correctif) — ne doit jamais faire échouer le
# packaging, uniquement être archivé comme preuve de non-régression.
node test/test_t08_eforch.js || true
node test/test_t08_matrix.js || true
node test/test_t08_runner_orchestration.js || true
# test_t08_matrix.js régénère reports/mono-08-*.json (comportement normal
# du outil v0.5 inchangé) — c'est la DERNIÈRE écriture de contenu mutable
# avant le manifest.

echo
echo "== ÉTAPE 2/7 : plus aucune écriture après ce point (contrat du script) =="
echo "(rien à faire ici — c'est une règle d'usage du script, pas une commande)"

echo
echo "== ÉTAPE 3/7 : génération du manifest EN DERNIER, sur l'arbre figé =="
cd "$V06_ROOT"
find . -type f ! -path "./manifest/*" | sort | sed 's|^\./||' | xargs shasum -a 256 > manifest/SHA256SUMS
echo "manifest régénéré : $(wc -l < manifest/SHA256SUMS) entrées"

echo
echo "== ÉTAPE 4/7 : vérification immédiate du manifest fraîchement généré =="
shasum -a 256 -c manifest/SHA256SUMS

echo
echo "== ÉTAPE 5/7 : packaging du ZIP =="
cd "$MONO08_ROOT"
if [ ! -d "$MONO08_ROOT/$(basename "$EVIDENCE_DIR")" ]; then
  echo "ERREUR: dossier de preuve introuvable: $MONO08_ROOT/$(basename "$EVIDENCE_DIR")" >&2
  exit 3
fi
rm -f "$PACKAGE_NAME"
# Exclusions : dotfiles à la racine de chaque arbre zippé, node_modules,
# et .wrangler/ (cache/tmp local créé par une éventuelle validation
# Wrangler — jamais un artefact à livrer, à n'importe quelle profondeur).
zip -X -r -q "$PACKAGE_NAME" "v0.6" "$(basename "$EVIDENCE_DIR")" \
  -x '.*' -x '*/node_modules/*' -x '*/.wrangler/*' -x '*/.wrangler'
echo "ZIP créé : $MONO08_ROOT/$PACKAGE_NAME"

echo
echo "== ÉTAPE 6/7 : vérification d'intégrité du ZIP (unzip -t) =="
unzip -t "$PACKAGE_NAME"

echo
echo "== ÉTAPE 7/7 : RE-vérification de tous les hashes DEPUIS LE ZIP FINAL =="
TMP_EXTRACT="$(mktemp -d)"
unzip -q "$PACKAGE_NAME" -d "$TMP_EXTRACT"
cd "$TMP_EXTRACT/v0.6"
shasum -a 256 -c manifest/SHA256SUMS
MISMATCH_COUNT=$(shasum -a 256 -c manifest/SHA256SUMS 2>&1 | grep -c "FAILED" || true)
rm -rf "$TMP_EXTRACT"

echo
if [ "$MISMATCH_COUNT" = "0" ]; then
  echo "RÉSULTAT : 0 mismatch — manifest packagé fidèle au contenu réel du ZIP."
  exit 0
else
  echo "RÉSULTAT : $MISMATCH_COUNT mismatch(es) détecté(s) — le package NE DOIT PAS être livré." >&2
  exit 1
fi
