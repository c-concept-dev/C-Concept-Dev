#!/usr/bin/env bash
# EvidenceForge/MONO-08/v0.6/scripts/package-and-verify.sh
#
# Pipeline de packaging DÉTERMINISTE pour MONO-08 v0.6.
#
# v2 (correctif d'audit — Défaut Bloquant 2, gate de non-régression
# insuffisant) : la version précédente exécutait les 4 tests historiques
# avec `|| true`, ce qui masquait silencieusement TOUTE régression future
# (exit code ignoré, packaging continuait quand même). Ce script compare
# désormais chaque test historique à une baseline IMMUTABLE et préexistante
# (fichiers `*.v05-baseline.out` + `*.baseline.exit` sous
# reports/v0.6-local-controlled/regression-non-regression/, jamais
# régénérés par ce script) sur DEUX critères cumulatifs :
#   - exit code courant == exit code baseline ;
#   - sortie courante (stdout+stderr) == sortie baseline, octet pour octet.
# Un seul écart sur l'un des deux critères => NON_REGRESSION_FAILURE,
# arrêt immédiat (aucun `|| true`, aucun ZIP produit).
#
# Ordre imposé :
#   1. Gate de non-régression historique (comparaison stricte à baseline
#      immutable) — échoue tout le script si un seul test diverge.
#   1bis. Self-test du gate (GATE-NEGATIVE-TEST) : prouve que le
#      mécanisme de comparaison détecte réellement un écart injecté,
#      entièrement en zone scratch (aucune baseline réelle touchée,
#      aucune contamination du package final).
#   2. Tests v0.6 (delegated auth) + tests Worker — échec direct (pas de
#      `|| true`) si un seul FAIL.
#   3. Scan de secrets sur l'arbre v0.6 + dossier de preuve — échoue si un
#      motif de secret réel est détecté.
#   4. Plus aucune écriture de contenu mutable après ce point.
#   5. Génération de manifest/SHA256SUMS EN DERNIER, sur l'arbre figé.
#   6. Vérification IMMÉDIATE du manifest.
#   7. Packaging du ZIP.
#   8. Vérification d'intégrité du ZIP (unzip -t).
#   9. RE-vérification de tous les hashes depuis le CONTENU RÉEL du ZIP.
#
# N'exécute JAMAIS de test REAL (cas G), aucun déploiement Cloudflare,
# aucun Real Smoke.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
V06_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MONO08_ROOT="$(cd "$V06_ROOT/.." && pwd)"
BASELINE_DIR="$V06_ROOT/reports/v0.6-local-controlled/regression-non-regression"

EVIDENCE_DIR="${1:-}"
PACKAGE_NAME="${2:-EvidenceForge-MONO-08-v0.6-implementation-package-r2.zip}"

if [ -z "$EVIDENCE_DIR" ]; then
  echo "Usage: $0 <evidence-dossier-dir> [package-name.zip]" >&2
  exit 2
fi

# ---------------------------------------------------------------------
# run_test_and_compare TEST_FILE BASELINE_OUT BASELINE_EXIT LABEL
#
# Exécute `node TEST_FILE`, capture stdout+stderr et l'exit code, compare
# STRICTEMENT (octet pour octet + exit code exact) à la baseline fournie.
# Ne modifie JAMAIS BASELINE_OUT ni BASELINE_EXIT. Retourne 0 si
# identique, 1 sinon (avec le diff et les deux exit codes imprimés sur
# stderr), 3 si un fichier de baseline attendu est introuvable
# (BASELINE ARTIFACT REQUIRED — ne fabrique jamais une baseline de
# remplacement).
# ---------------------------------------------------------------------
run_test_and_compare() {
  local test_file="$1" baseline_out="$2" baseline_exit_file="$3" label="$4"

  if [ ! -f "$baseline_out" ]; then
    echo "BASELINE ARTIFACT REQUIRED: $baseline_out introuvable pour '$label'." >&2
    echo "Ce script ne fabrique jamais une baseline de remplacement à partir du code actuel." >&2
    return 3
  fi
  if [ ! -f "$baseline_exit_file" ]; then
    echo "BASELINE ARTIFACT REQUIRED: $baseline_exit_file introuvable pour '$label'." >&2
    return 3
  fi

  local expected_exit actual_out actual_exit diff_out
  expected_exit="$(cat "$baseline_exit_file")"
  actual_out="$(mktemp)"

  # NB : ne jamais faire un `set +e` / `set -e` bare ici — `set -e` est un
  # état GLOBAL du shell (pas scopé à la fonction). Le réactiver ici puis
  # exécuter un `return 1` plus bas déclencherait errexit AU MILIEU de
  # cette fonction, indépendamment du `set +e` posé par l'appelant, et
  # tuerait le script avant que l'appelant ne récupère `$?`. On utilise
  # donc un `if` (intrinsèquement exempté d'errexit) pour capturer le
  # code de sortie de `node`, sans jamais toucher à l'état global d'errexit.
  if node "$test_file" > "$actual_out" 2>&1; then
    actual_exit=0
  else
    actual_exit=$?
  fi

  diff_out="$(diff "$baseline_out" "$actual_out" 2>&1 || true)"

  if [ "$actual_exit" != "$expected_exit" ] || [ -n "$diff_out" ]; then
    echo "NON_REGRESSION_FAILURE: $label" >&2
    echo "  baseline_exit=$expected_exit  actual_exit=$actual_exit" >&2
    echo "  baseline=$baseline_out" >&2
    echo "  diff (baseline vs actual):" >&2
    echo "$diff_out" >&2
    rm -f "$actual_out"
    return 1
  fi

  echo "GATE PASS: $label (exit=$actual_exit, sortie identique à $baseline_out, 0 diff)"
  rm -f "$actual_out"
  return 0
}

echo "== ÉTAPE 1/9 : gate de non-régression historique (baseline immutable, pas de || true) =="
cd "$V06_ROOT"
run_test_and_compare "test/test_t08_preflight.js" \
  "$BASELINE_DIR/test_t08_preflight.js.v05-baseline.out" \
  "$BASELINE_DIR/test_t08_preflight.js.baseline.exit" \
  "test_t08_preflight.js"
run_test_and_compare "test/test_t08_eforch.js" \
  "$BASELINE_DIR/test_t08_eforch.js.v05-baseline.out" \
  "$BASELINE_DIR/test_t08_eforch.js.baseline.exit" \
  "test_t08_eforch.js"
run_test_and_compare "test/test_t08_matrix.js" \
  "$BASELINE_DIR/test_t08_matrix.js.v05-baseline.out" \
  "$BASELINE_DIR/test_t08_matrix.js.baseline.exit" \
  "test_t08_matrix.js"
run_test_and_compare "test/test_t08_runner_orchestration.js" \
  "$BASELINE_DIR/test_t08_runner_orchestration.js.v05-baseline.out" \
  "$BASELINE_DIR/test_t08_runner_orchestration.js.baseline.exit" \
  "test_t08_runner_orchestration.js"

echo
echo "== ÉTAPE 1bis/9 : self-test du gate (GATE-NEGATIVE-TEST, zone scratch uniquement) =="
GATE_SELFTEST_DIR="$(mktemp -d)"
# Un "test" scratch dont la sortie diverge délibérément d'une VRAIE
# baseline réelle (jamais modifiée), pour prouver que run_test_and_compare
# détecte réellement un écart. N'utilise que des fichiers temporaires ;
# aucune baseline réelle ni aucun fichier du dépôt n'est touché.
cat > "$GATE_SELFTEST_DIR/fake-regressed-test.js" <<'EOF'
console.log("CECI EST UNE SORTIE DELIBEREMENT DIFFERENTE DE LA BASELINE — self-test du gate.");
process.exit(0);
EOF
# Même remarque que dans run_test_and_compare : on capture le code de
# retour via un `if` (exempté d'errexit), jamais via un bare `set +e` /
# `set -e` autour de l'appel — cf. commentaire ci-dessus.
if run_test_and_compare "$GATE_SELFTEST_DIR/fake-regressed-test.js" \
  "$BASELINE_DIR/test_t08_preflight.js.v05-baseline.out" \
  "$BASELINE_DIR/test_t08_preflight.js.baseline.exit" \
  "GATE-NEGATIVE-TEST (attendu : échec)" > "$GATE_SELFTEST_DIR/selftest.log" 2>&1; then
  GATE_SELFTEST_RESULT=0
else
  GATE_SELFTEST_RESULT=$?
fi
rm -rf "$GATE_SELFTEST_DIR"
if [ "$GATE_SELFTEST_RESULT" = "1" ]; then
  echo "GATE-NEGATIVE-TEST PASS : le gate détecte bien un écart injecté (return=1, comme attendu)."
else
  echo "GATE-NEGATIVE-TEST FAIL : le gate n'a PAS détecté l'écart injecté (return=$GATE_SELFTEST_RESULT, attendu 1) — le mécanisme de comparaison est défaillant, packaging refusé." >&2
  exit 4
fi

echo
echo "== ÉTAPE 2/9 : tests v0.6 (delegated auth) + tests Worker — échec direct, pas de || true =="
cd "$V06_ROOT"
node test/test_t08_v06_delegated_auth.js
node worker/evidenceforge-llm-proxy/test/worker.test.js

echo
echo "== ÉTAPE 3/9 : scan de secrets (arbre v0.6 + dossier de preuve) =="
cd "$MONO08_ROOT"
SECRET_HITS="$(grep -rlE 'sk-ant-[A-Za-z0-9_-]{20,}' v0.6 "$(basename "$EVIDENCE_DIR")" 2>/dev/null || true)"
if [ -n "$SECRET_HITS" ]; then
  echo "SECRET DÉTECTÉ dans :" >&2
  echo "$SECRET_HITS" >&2
  exit 5
fi
echo "0 secret réel détecté (motif sk-ant-*)."

echo
echo "== ÉTAPE 4/9 : régénération des rapports finaux LOCAL_CONTROLLED (avant manifest) =="
cd "$V06_ROOT"
node test/test_t08_v06_delegated_auth.js > reports/v0.6-local-controlled/test_t08_v06_delegated_auth.out 2>&1
echo "exit_code=$?" >> reports/v0.6-local-controlled/test_t08_v06_delegated_auth.out
node worker/evidenceforge-llm-proxy/test/worker.test.js > reports/v0.6-local-controlled/worker.test.out 2>&1
echo "exit_code=$?" >> reports/v0.6-local-controlled/worker.test.out

echo
echo "== ÉTAPE 5/9 : plus aucune écriture de contenu mutable après ce point =="
echo "(règle d'usage du script, pas une commande)"

echo
echo "== ÉTAPE 6/9 : génération du manifest EN DERNIER, sur l'arbre figé =="
cd "$V06_ROOT"
find . -type f ! -path "./manifest/*" | sort | sed 's|^\./||' | xargs shasum -a 256 > manifest/SHA256SUMS
echo "manifest régénéré : $(wc -l < manifest/SHA256SUMS) entrées"

echo
echo "== ÉTAPE 6bis/9 : vérification immédiate du manifest fraîchement généré =="
shasum -a 256 -c manifest/SHA256SUMS

echo
echo "== ÉTAPE 7/9 : packaging du ZIP =="
cd "$MONO08_ROOT"
if [ ! -d "$MONO08_ROOT/$(basename "$EVIDENCE_DIR")" ]; then
  echo "ERREUR: dossier de preuve introuvable: $MONO08_ROOT/$(basename "$EVIDENCE_DIR")" >&2
  exit 3
fi
rm -f "$PACKAGE_NAME"
zip -X -r -q "$PACKAGE_NAME" "v0.6" "$(basename "$EVIDENCE_DIR")" \
  -x '.*' -x '*/node_modules/*' -x '*/.wrangler/*' -x '*/.wrangler'
echo "ZIP créé : $MONO08_ROOT/$PACKAGE_NAME"

echo
echo "== ÉTAPE 8/9 : vérification d'intégrité du ZIP (unzip -t) =="
unzip -t "$PACKAGE_NAME"

echo
echo "== ÉTAPE 9/9 : RE-vérification de tous les hashes DEPUIS LE ZIP FINAL =="
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
