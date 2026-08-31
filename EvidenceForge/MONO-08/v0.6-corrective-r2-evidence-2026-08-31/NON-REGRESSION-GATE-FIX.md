# Défaut Bloquant 2 — Gate de non-régression insuffisant → correction

Statut : **BUG SCRIPT / GATE DE NON-RÉGRESSION INSUFFISANT CONFIRMÉ, CORRIGÉ.**

## 1. Cause

`EvidenceForge/MONO-08/v0.6/scripts/package-and-verify.sh` (version auditée, commit
`212c8c3`) exécutait les 4 tests historiques v0.5 avec `|| true` :

```bash
node test/test_t08_eforch.js || true
node test/test_t08_matrix.js || true
node test/test_t08_runner_orchestration.js || true
```

(`test_t08_preflight.js` était appelé sans `|| true`, mais son exit code n'était pas
non plus comparé à une référence — seule l'absence de crash du process `node`
lui-même était implicitement vérifiée.)

Un second `|| true` masquait aussi tout résultat du comptage de mismatch final :

```bash
MISMATCH_COUNT=$(shasum -a 256 -c manifest/SHA256SUMS 2>&1 | grep -c "FAILED" || true)
```

(Ce second `|| true` protège `grep -c` d'un exit non-zéro quand aucune ligne
« FAILED » n'est trouvée — usage légitime de `grep`, mais combiné à l'absence de toute
comparaison de sortie pour les 4 tests historiques, le script ne pouvait détecter
**aucune régression future réelle** sur ces 4 fichiers : n'importe quel changement de
comportement, y compris un test qui se mettrait à planter ou à produire une sortie
radicalement différente, aurait été silencieusement ignoré et le packaging aurait
quand même continué.)

## 2. Conséquence

Le script produisait un package « valide » (0 mismatch de manifest, ZIP intègre) même
en présence d'une régression réelle sur les 4 fichiers historiques v0.5
(`test_t08_preflight.js`, `test_t08_eforch.js`, `test_t08_matrix.js`,
`test_t08_runner_orchestration.js`), puisque leur exit code n'était de toute façon
jamais comparé à une référence figée. C'est un défaut du gate de non-régression
lui-même, pas seulement une gestion imprudente d'exit code.

## 3. Correction appliquée

Remplacement complet par une fonction `run_test_and_compare()` qui compare
**strictement** et **cumulativement** :

1. l'exit code courant du test, contre un exit code de référence lu dans un fichier
   `*.baseline.exit` immuable et préexistant ;
2. la sortie courante (stdout+stderr) du test, **octet pour octet**, contre un fichier
   `*.v05-baseline.out` immuable et préexistant (déjà présent depuis un commit
   antérieur unique, jamais modifié depuis — voir §5).

Un seul écart sur l'un des deux critères → retour `1` (`NON_REGRESSION_FAILURE`),
message explicite sur stderr (baseline vs actuel, diff complet), **aucun** `|| true`
sur l'appel — un retour non nul à ce point interrompt tout le script (`set -euo
pipefail`), aucun ZIP n'est produit.

Si un fichier de baseline attendu (`*.v05-baseline.out` ou `*.baseline.exit`) est
introuvable → retour `3` (`BASELINE ARTIFACT REQUIRED`), avec message explicite : le
script ne fabrique jamais une baseline de remplacement à partir du code actuel.

## 4. Bug d'implémentation découvert et corrigé pendant ce correctif (transparence)

Lors de la première exécution du script réécrit, le pipeline s'est arrêté
silencieusement (exit 1) juste après l'en-tête de l'étape 1bis (self-test du gate),
avant même d'imprimer le résultat du self-test. Diagnostic :

`run_test_and_compare()` faisait initialement `set +e` / (exécution de `node`) /
`set -e` en interne pour capturer l'exit code de `node` sans déclencher `errexit` sur
un échec attendu. Mais `set -e` est un état **global** du shell, pas scopé à la
fonction : le `set -e` réactivé à l'intérieur de la fonction restait actif pour la
suite de l'exécution de cette même fonction, y compris pour l'instruction `return 1`
plus bas (cas `NON_REGRESSION_FAILURE`). Comme un `return` non nul déclenche `errexit`
quand `errexit` est actif, le script s'arrêtait **au milieu de la fonction**, avant
même que l'appelant (qui avait pourtant posé son propre `set +e` autour de l'appel)
ne puisse récupérer `$?` — ce `set +e` de l'appelant avait déjà été écrasé par le
`set -e` interne à la fonction.

Correction : suppression de tout `set +e`/`set -e` interne à `run_test_and_compare()`
et au site d'appel du self-test (étape 1bis), remplacés par la construction `if cmd;
then ...; else ...; fi`, intrinsèquement exemptée d'`errexit` pour la commande
testée, sans jamais toucher à l'état global du shell. Ce correctif a été vérifié par
reproduction minimale isolée avant d'être appliqué au script réel (voir
historique de session) puis confirmé par l'exécution complète et réussie du
pipeline (voir `package-and-verify-r2-full-run.log`).

Ce bug n'affectait que le mécanisme du self-test lui-même (étape 1bis) — les 4 gates
de non-régression réelles (étape 1) n'étaient pas concernées puisqu'elles ne sont pas
enveloppées dans un `set +e`/`set -e` et sont censées interrompre le script sur tout
écart, ce qui est le comportement voulu.

## 5. Baselines immuables utilisées (préexistantes, non fabriquées)

`reports/v0.6-local-controlled/regression-non-regression/*.v05-baseline.out` : présents
depuis un unique commit antérieur (`4952ce4`), jamais modifiés depuis (confirmé par
`git log` : un seul commit touchant ces 4 fichiers).

`*.baseline.exit` (nouveaux dans ce correctif — aucun exit code n'avait jamais été
consigné aux côtés des `.v05-baseline.out`) : dérivés **légitimement**, pas fabriqués.
Méthode : exécution fraîche des 4 fichiers de test historiques (dont le code source
n'a **jamais changé** depuis leur commit d'introduction — un seul commit dans
l'historique git pour chacun), confirmation d'une sortie **strictement identique**
(0 ligne de diff) à la `.v05-baseline.out` déjà figée, et seulement alors
enregistrement de l'exit code obtenu comme métadonnée de baseline légitime. Ceci
respecte l'exigence « ne jamais fabriquer une baseline à partir du code actuel »,
puisque le code testé est prouvé inchangé depuis son commit d'origine.

Valeurs dérivées :

| Fichier | exit code |
|---|---|
| `test_t08_preflight.js` | `0` |
| `test_t08_eforch.js` | `2` |
| `test_t08_matrix.js` | `0` |
| `test_t08_runner_orchestration.js` | `1` |

Voir `BASELINE-EXIT-CODE-DERIVATION.md` pour le détail complet, hashes SHA-256 inclus.

## 6. Self-test du mécanisme (GATE-NEGATIVE-TEST)

Ajout d'une étape 1bis qui prouve que `run_test_and_compare()` détecte réellement un
écart injecté :

- un faux fichier de test est créé dans un répertoire `mktemp -d` scratch (jamais dans
  le dépôt) ;
- sa sortie est délibérément différente de la vraie baseline `test_t08_preflight.js`
  (réutilisée en lecture seule, jamais modifiée) ;
- le script attend que `run_test_and_compare()` retourne `1` (échec détecté) ; si ce
  n'est pas le cas, le script entier échoue avec `exit 4` (« le mécanisme de
  comparaison est défaillant, packaging refusé ») ;
- le répertoire scratch est supprimé après usage — aucune contamination de la
  baseline réelle ni du package final.

Résultat obtenu lors de l'exécution complète : `GATE-NEGATIVE-TEST PASS : le gate
détecte bien un écart injecté (return=1, comme attendu).`

## 7. Autres `|| true` supprimés / conservés

- Les 3 `|| true` sur `test_t08_eforch.js`/`test_t08_matrix.js`/`test_t08_runner_orchestration.js`
  : supprimés, remplacés par `run_test_and_compare()`.
- Le `|| true` sur `grep -c "FAILED" || true` (étape 9/9) : **conservé**, car il ne
  masque aucune régression — il protège uniquement `grep -c` de son propre exit non
  nul légitime quand 0 ligne « FAILED » est trouvée (comportement standard de `grep
  -c`, sans rapport avec le défaut audité). Le résultat du comptage
  (`MISMATCH_COUNT`) est ensuite testé explicitement et fait échouer le script
  (`exit 1`) si non nul.

## 8. Fichiers modifiés (périmètre autorisé uniquement)

- `EvidenceForge/MONO-08/v0.6/scripts/package-and-verify.sh`
- `EvidenceForge/MONO-08/v0.6/reports/v0.6-local-controlled/regression-non-regression/*.baseline.exit`
  (4 nouveaux fichiers, métadonnées dérivées légitimement — voir §5)
