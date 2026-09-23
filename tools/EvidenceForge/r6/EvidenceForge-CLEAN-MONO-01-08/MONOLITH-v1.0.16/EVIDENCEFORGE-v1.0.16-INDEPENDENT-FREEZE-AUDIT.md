# EvidenceForge MONOLITH v1.0.16 — Audit indépendant pré-gel (PB-B7 SECONDARY REUSE GAP)

Date : 2026-09-23. Auditeur indépendant (n'a pas écrit le code). Mode : **LECTURE SEULE** sur le dépôt ; toutes les exécutions dans une copie scratch de `tools/EvidenceForge/` (même arborescence relative). **0 appel fournisseur** (fetch remplacé par un stub local), 0 smoke, `ACTIVE_VERSION` non touchée (`MONOLITH-v1.0.10`). Seuls fichiers écrits dans le dépôt : ce rapport et son JSON.

## Verdicts

| Point | Verdict |
|---|---|
| §5 T3b / PB7-04 | **`PB7_T3B_CLOSED`** |
| §9 T-STREAM-05 | `ADAPTATION_VALID_NO_WEAKENING` |
| §9 T-STREAM-22 | `ADAPTATION_VALID_NO_WEAKENING` |
| §9 RUN-SAFETY-12 | **`TEST_WEAKENED`** (localement ; compensé au niveau de la suite) |
| §9 RUN-SAFETY-13 | `ADAPTATION_VALID_NO_WEAKENING` |
| §9 V3 | `ADAPTATION_VALID_NO_WEAKENING` |
| §10 RUN-SAFETY-21 | **`INVERSION_CONTRACTUALLY_CORRECT`** |
| §16 reprise ancien run | **`EXPECTED_FAIL_CLOSED_RECOMPUTATION`** |
| §17 PB-B7 | **`PB_B7_CLOSED`** |
| §18 global | **`V1_0_16_FREEZE_AUDIT_PASS_WITH_RESERVATIONS`** — recommandation **GELER** (après prise d'acte des réserves), ne pas activer |

Blockers : **aucun**.

---

## 0. Fait de gouvernance mesuré (hors code)

Le mandat et le rapport du constructeur (§13) déclarent v1.0.16 « NON COMMITÉE ». **Mesure** : `MONOLITH-v1.0.16/` (184 fichiers, tous `A`) est **commitée** dans `766db22a` (« studio », 11drumboy11, 2026-09-23 22:03 +0200) et **présente sur `origin/main`** (`git branch -r --contains 766db22a` → `origin/main`). Ce commit ne touche aucun autre fichier EvidenceForge. Contenu du working tree identique au commit (`git diff HEAD -- tools/EvidenceForge` vide avant mes livrables). La preuve de lecture seule attendue (« seul le dossier non suivi v1.0.16 ») ne peut donc pas prendre cette forme : elle est fournie au §20 sous la forme « aucune modification par rapport à HEAD sauf mes 2 fichiers non suivis ». `git status` montre par ailleurs des modifications préexistantes sous `tools/Atelier Prompts/` (hors périmètre, non faites par cet audit).

## 1. Diff réel v1.0.15 → v1.0.16

`diff -rq` recalculé (patch complet : `out/DIFF-FULL-v1015-v1016.patch`, 878 lignes, sha `9d00a8d3…`).

| Fichier | Nature |
|---|---|
| `lib/llm.js` | **runtime** : `checkEf03bReuseIdentity`, garde EF-03B avant `reuseContextCheck`, identité écrite par `recordReal`, identité journalisée dans la reuse |
| `lib/ef03b-resilience.js` | **runtime** : `call(st, …)` injecte `{targetId: st.targetId, documentAuthoritySha256: st.authoritySha256}` aux 4 sites (base, ciblé, complétion, littéralisation) ; `schemaVersion` du registre |
| `lib/pipeline.js` | chaîne de version seule (`schemaVersion` v1.0.16) |
| `config/monolith.config.json` | `$comment` + `product.version` |
| `tools/build-manifest.js` | littéraux de chaîne seulement (vérifié : diff après suppression des littéraux = ajout d'une clé descriptive `secondaryReuseStore`) |
| `tools/ef03b-autopsy.js`, `tools/package.sh` | chaînes de version |
| `README.md`, rapports, `MANIFEST.json`, `SHA256SUMS.txt` | documentation / manifeste |
| `test/*` | 5 tests adaptés + RUN-SAFETY-21 inversé, `test-v1016-pb7-secondary-reuse.js`, fixture phase B, `results*.json` |

Aucun autre changement runtime (`server.js`, `index.html`, `worker/`, autres `lib/*` : identiques). Le diff `lib/` recalculé est identique en contenu au patch du constructeur. **MONO-11 v0.4 intact** : 55/55 SHA (`shasum -c`), `verifyFrozenLots` 0 divergence (MONO-01/09/10/11). Prompts (construits par le lot gelé et par les constructeurs de l'adaptateur, non modifiés), validateurs (`validateCandidate`, lot gelé), recomposition/lignée et agrégation : **inchangés** (aucune ligne modifiée hors celles listées).

## 2. Reproduction PB-B7 sur v1.0.15 — **REPRODUIT**

Harnais propre `harness/indep-pbb7.js` (données réelles du smoke phase B `efm-20260923-78fd8c4b`, lecture seule ; entrée E1 target-01 ; registre R1 du run réel, autorité A = `113b0798…` = empreinte recalculée du prompt, cohérente avec le registre réel).

Autorité B = A + paragraphe (A préfixe strict de B), prompt de lot identique, registre R1 (A) :

- registre : **refuse** (`registryRefusedForeignAuthority=1`) ;
- magasin : **sert la réponse A** (`REUSE_OF_VALID_REAL_RESPONSE`, 0 fetch) ;
- validation du lot sur l'autorité B : `ok=true` ;
- `onValidation` : **la réponse A est inscrite au registre sous l'autorité B** (`A_RESPONSE_RECORDED_UNDER_B=true`).

Reproduit avec l'entrée historique telle quelle (C3) **et** avec une copie enrichie `targetId/documentAuthoritySha256` = A (C4). En outre, le test PB7-04 du candidat exécuté sur v1.0.16 avec `lib/llm.js` + `lib/ef03b-resilience.js` de v1.0.15 (mutant R0) échoue sur « magasin : refus d'autorité journalisé : [] » (le magasin a servi). `PB_B7_SECONDARY_REUSE_GAP` : **reproduit**.

## 3. Correctif — contrôles d'identité

`checkEf03bReuseIdentity(entry, current)` : entrée présente → finalité EF-03B → identité courante présente → `NON_REUSABLE_FOR_EF03B_V3` si entrée sans `targetId` ou sans sha256 d'autorité → cible → autorité → contrat → sceau requis → sceau égal ; puis (si OK) `reuseContextCheck` historique : statut VALID (+ politique gelée : `httpStatus 200`, VALID le plus récent), fournisseur, modèle, contrat, sceau, hash du corps. `promptSha256` = clé de la politique gelée.

Mesures v1.0.16 (harnais, chacune une seule divergence) : cible ≠ → `EF03B_REUSE_TARGET_MISMATCH` ; autorité ≠ → `AUTHORITY_MISMATCH` ; contrat v2 ou absent → `CONTRACT_MISMATCH` ; sceau autre/absent → `SEAL_MISMATCH` ; appel sans sceau → `SEAL_REQUIRED` (v1.0.15 : **servi**) ; modèle, fournisseur, statut INVALID/UNKNOWN, HTTP 500, corps altéré → refus ; prompt différent → aucune entrée. **Une seule divergence empêche la réutilisation : confirmé.**

## 4. Ordre du chemin de production (tracé dans le code)

`pipeline.js:274-276` → `llmDown.llmCall = adapter.llmCall` → `reviewCall` :
1. **gardes d'autorité** (`withAuthority` → `requireAuthority` : cible inconnue, absente, vide, non normalisée, `IDENTITY_MISMATCH`, `TARGET_MISMATCH`, `CONTEXT_DIVERGENCE`) → `st.authoritySha256` = sha du document **canonique** ;
2. **lookup registre** (`registry.find(basePrompt, sceau, contrat, autorité, cible)`) ;
3. **décision registre** : hit validé → servi (`REVIEW_REGISTRY_REUSE`, le magasin n'est jamais consulté, C0) ; sinon refus tracé ;
4. `call(st, …)` → `llm.llmCall` → **lookup magasin générique** (`policy.decide`, VALID le plus récent pour `promptSha256`) ;
5. **garde d'identité EF-03B** puis **`reuseContextCheck`** ;
6. **validation MONO-11** (lot gelé) ;
7. **`onValidation`** → `markValidation` (par `responseSha256`) → **écriture registre** sous `st.targetId`/`st.authoritySha256`.

**Un refus du registre peut-il être contourné par une entrée du magasin d'identité insuffisante ? NON** (mesuré : C3, C4, C5a/b, C9d refusés ; PB7-04/09/10 ; aucune réponse A sous B).

## 5. T3b / PB7-04 — **`PB7_T3B_CLOSED`**

v1.0.16, chaîne adaptateur réel + transport réel + magasin fichier, autorité B prolongeant A, prompt identique, registre refusant A :
- entrée historique : `NON_REUSABLE_FOR_EF03B_V3` ; entrée enrichie A : `EF03B_REUSE_AUTHORITY_MISMATCH` ;
- recalcul demandé (fetch=1) ; en mode fournisseur factice « ok », la réponse recalculée (marquée `[RECALC-B]`) est validée et **seule** inscrite sous B (`candidateIsStoredAResponse=false`, `A_RESPONSE_RECORDED_UNDER_B=false`) ;
- la méta forgée par l'appelant (`documentAuthoritySha256` = A) est écrasée par l'adaptateur (C9d refusé).

PB7-04 du candidat : PASS sur v1.0.16, FAIL sur lib v1.0.15 (R0), FAIL sur M2, M5, M8, M13 (tous comportementaux).

## 6. Entrées legacy

Sans `targetId` → refus ; sans autorité → refus ; sans les deux → refus ; `targetId:""` → refus ; autorité non sha256 minuscule → refus : tous `NON_REUSABLE_FOR_EF03B_V3`. Le code ne lit jamais le prompt pour déduire une identité et n'écrit rien sur les entrées existantes (aucune migration ; `update` du magasin n'est appelé que par `markValidation`).

## 7. Reuse nominal — fonctionnel

Même prompt/cible/autorité/contrat/sceau/fournisseur/modèle : **servi à 0 fetch** (C2) via l'adaptateur réel ; 20/20 entrées réelles enrichies servies sous leur propre identité au niveau transport (§12) ; PB7-01 et PB7-11 (reprise, 2 cibles, 0 appel). Le reuse EF-03B n'a pas été désactivé.

## 8. Reuse générique non EF-03B — inchangé

Comparaison v1.0.15 / v1.0.16 sur `EF-02D2 relevance`, `EF-02D3 coverage`, `worker`, `downstream`, finalité absente : avant VALID → réel ; après VALID → reuse ; transport sans sceau → reuse ; autre sceau → refus ; autre modèle → refus ; entrées écrites sans champ d'identité : **résultats identiques** (5/5). Seul changement mesuré : les collisions inter-finalités à prompt octet-identique sont désormais refusées (entrée EF-03B demandée par `worker` → `IDENTITY_MISSING` ; entrée non EF-03B demandée par EF-03B → `PURPOSE_MISMATCH`), servies en v1.0.15. Plus strict, non observé dans les données réelles.

## 9. Tests adaptés — audit critique

Sonde de mesure : mutants W1 (magasin ne sert jamais) et W2 (sert une entrée non validée) appliqués **à v1.0.15 et à v1.0.16** (suite complète).

| Test | A. objectif initial | B. changement | C. objectif encore testé | D. réalisme | E. régression qui passerait | Classement |
|---|---|---|---|---|---|---|
| T-STREAM-05 | reuse seulement après VALID, coût 0, entrée complète | identité ajoutée à META ; assertion ajoutée (sans autorité → refus) ; sélection de l'entrée `[0]` au lieu de `.pop()` | oui | oui | non : tué par W1 et W2 sur les deux versions | `ADAPTATION_VALID_NO_WEAKENING` |
| T-STREAM-22 | revue interrompue jamais réutilisée ; revue validée réutilisée à la reprise | sceau fourni (obligatoire EF-03B) | oui | oui | non : tué par W1 sur les deux versions ; W2 non tué sur les deux (inchangé) | `ADAPTATION_VALID_NO_WEAKENING` |
| RUN-SAFETY-12 | reprise depuis checkpoint + **cache** : réponses VALID réutilisées, ledger REUSE | identité + `pass: 1` | **partiellement** : la reprise réutilise toujours, mais `pass: 1` fait passer l'appel par la branche base de l'adaptateur ; la revue A est désormais servie par le **registre** (vérifié avant le magasin), plus par le magasin. L'empreinte `"a"*64` fournie est écrasée par l'adaptateur | chemin registre réaliste | **oui** : W1 (reuse magasin désactivé) était tué par RUN-SAFETY-12 en v1.0.15 et **ne l'est plus** en v1.0.16 | **`TEST_WEAKENED`** (compensé : W1 reste tué en v1.0.16 par 19 autres tests dont PB7-01/11, T-STREAM-05/22, RUN-SAFETY-13) |
| RUN-SAFETY-13 | pas de double facturation à la reprise | identité + sceau | oui | oui | non : tué par W1 sur les deux versions ; tué aussi par M9 | `ADAPTATION_VALID_NO_WEAKENING` |
| V3 | même contexte ⇒ même prompt de réparation, REUSE_VALID, conservé après STOP/reprise | identité ajoutée par le test (le lot est piloté sans adaptateur) | oui | oui (imite l'adaptateur ; n'exerce pas l'adaptateur, ce qu'il ne faisait pas avant) | non : tué par W1 et W2 sur les deux versions ; tué aussi par M9 | `ADAPTATION_VALID_NO_WEAKENING` |

Le README du candidat compte « 6 adaptés » : ce sont ces 5 plus RUN-SAFETY-21 (§10).

## 10. RUN-SAFETY-21 — **`INVERSION_CONTRACTUALLY_CORRECT`**

Données réelles f78528fe présentes et exercées (pas de « fixture ignorée »). Nouvel attendu : 4 entrées historiques sans identité, appelées avec une identité EF-03B complète → 4 appels réels, 4 refus `NON_REUSABLE_FOR_EF03B_V3`, ledger reuse=0/real=5. Conforme au nouveau contrat (§6). Démonstration réelle du fail-closed legacy : M6b (legacy accepté) est tué **comportementalement** (« entrée historique sans identité : jamais réutilisée ») ; M6a est tué par le code seulement (la garde de cible refuse encore) ; M5 et M13 tués comportementalement. Ne masque pas de défaut. Nuance mesurée : la sous-partie « ancien contrat MONO-11-v2 » est désormais refusée par la garde d'identité (évaluée avant), elle ne prouve plus le refus pour motif de contrat sur données réelles ; ce refus reste couvert par V12-12 (tue M3b) et PB7-05.

## 11. Tests PB7-01..13 — réexécutés (13/13 PASS) et inspectés

| Test | Ce qu'il prouve réellement | Tué par (mes mutants) |
|---|---|---|
| PB7-01 | entrée écrite avec identité ; nouveau run servi à 0 appel via chaîne complète (lot gelé exécuté) | M7, M9, R0, W1 |
| PB7-02 | cible ≠ refusée (transport) | M1 (comportemental), M5, M13 |
| PB7-03 | autorité ≠ refusée (transport) | M2 (comportemental), M5, M13 |
| PB7-04 | T3b en chaîne de production ; aucune réponse A sous B | M2, M5, M8, M13, R0 (comportementaux) |
| PB7-05 | contrat ≠ : **code** `CONTRACT_MISMATCH` | M3 (code seul), M3b |
| PB7-06 | sceau ≠ et sans sceau : codes `SEAL_MISMATCH`/`SEAL_REQUIRED` | M4, M4b, M4c (code seul, cf. §13) |
| PB7-07/08 | legacy sans cible / sans autorité / sans les deux | M5, M6b (comportementaux), M6a (code) |
| PB7-09 | adaptateur piloté avec prompt de A, carte B ; onValidation n'inscrit pas A sous B | M2, M5, M8 |
| PB7-10 | double refus registre + magasin sur cible | M1, M5, M13 |
| PB7-11 | reuse valide multi-cibles à la reprise | M7, M9, R0 |
| PB7-12 | non EF-03B inchangé ; pas de croisement de finalités | M5, M10, M13 |
| PB7-13 | fonction pure sur les 20 entrées réelles (legacy 20, ok 20, 40 refus cible, 20 refus autorité) | M1, M2, M6a/b |

Limite : PB7-13 appelle `checkEf03bReuseIdentity` directement ; je l'ai complété au niveau transport réel (§12). Aucun test PB7 n'exerce les finalités non-base (voir réserve R1).

## 12. PB7-13 — artefacts réels du smoke

Fixture du candidat vérifiée : 20/20 entrées identiques au magasin réel (hors `cachePath`) ; identité mesurée reproduite depuis les prompts réels 20/20 ; autorités = celles du registre réel (1 par cible). Au niveau **transport réel** (magasin fichier + corps réels) : telles quelles → **0/20 servies** (20 × `NON_REUSABLE_FOR_EF03B_V3`) ; enrichies sous leur propre cible/autorité → **20/20 servies** ; permutées vers les autres cibles → **0/40 servies** (40 × `TARGET_MISMATCH`), dont 14 permutations target-01 ↔ target-02 toutes refusées.

## 13. Matrice de mutation (mes propres mutants ; suite complète + harnais indépendant)

Contrôle M0 : 345/345. Copies sœurs dans le bundle scratch, remplacement exact (1 occurrence vérifiée), suppression après usage.

| Mutant | Suite | Tué par | Nature du kill | Sécurité finale (harnais) |
|---|---|---|---|---|
| M1 contrôle cible retiré | 342/345 | PB7-02, 10, 13 | comportemental | **perdue** quand autorités égales entre cibles (C5b, C5d servis) |
| M2 contrôle autorité retiré | 341/345 | PB7-03, 04, 09, 13 | comportemental | **perdue** (T3b A sous B) |
| M3 contrat EF-03B retiré | 344/345 | PB7-05 | **code seul** | assurée par `reuseContextCheck` (contrat) |
| M3b contrat retiré partout | 343/345 | V12-12, PB7-05 | comportemental | perdue (C7a servi) |
| M4 égalité de sceau EF-03B retirée | 344/345 | PB7-06 | **code seul** | assurée par `reuseContextCheck` (sceau, car le transport de production a toujours un sceau) |
| M4b sceau requis + égalité retirés | 344/345 | PB7-06 | code (1re assertion) | **perdue** sans sceau (C7k servi, comme v1.0.15) |
| M4c sceau requis seul retiré | 344/345 | PB7-06 | **code seul** | assurée par l'égalité (`SEAL_MISMATCH`) |
| M5 magasin ignore l'identité (registre contourné) | 333/345 | 12 tests dont PB7-04 | comportemental | perdue |
| M6a lignes legacy retirées | 341/345 | RUN-SAFETY-21, PB7-07, 08, 13 | code | assurée (la garde de cible refuse `undefined`) |
| M6b legacy accepté | 341/345 | RUN-SAFETY-21, PB7-07, 08, 13 | comportemental | perdue (C3 A sous B) |
| M7 adaptateur ne transmet plus l'identité | 336/345 | 9 tests | comportemental (perte de reuse) | fail-closed |
| M8 autorité relue dans le prompt | 343/345 | PB7-04, 09 | comportemental | perdue |
| M9 entrée écrite sans identité | 332/345 | 13 tests | comportemental (perte de reuse) | fail-closed |
| M10 finalité de l'entrée ignorée | 344/345 | PB7-12 | comportemental | perdue (C9b servi) |
| **M11 garde limitée à `EF-03B review` (base)** | **345/345** | **aucun — SURVIT** | — | **perdue** sur informed-retry / completion / literalization (C9e servis sous autorité B) |
| **M12 méta de l'appelant prioritaire sur l'identité canonique** | **345/345** | **aucun — SURVIT** | — | perdue seulement si un appelant fournit `documentAuthoritySha256` (C9d) ; le lot gelé MONO-11 v0.4 n'en fournit jamais (vérifié : 0 occurrence) |
| M13 garde d'identité seulement si le générique échoue | 334/345 | 11 tests | comportemental | perdue |
| R0 lib v1.0.15 | 330/345 | 15 tests dont PB7-04 | comportemental | perdue (défaut d'origine) |

Mutants mandatés M1–M6 : **tous tués**. M3/M4 : tués uniquement par l'assertion du code de refus ; la sécurité finale reste assurée par la défense historique `reuseContextCheck` ; le test mesure donc directement le **nouveau** contrôle (via le code) mais le résultat comportemental est garanti par la défense historique. Deux mutants hors mandat survivent (M11, M12) : lacunes de tests, pas défauts du code livré.

## 14. Suites complètes (copie scratch)

| Élément | Attendu | Mesuré |
|---|---|---|
| `test/test-monolith.js` v1.0.16 | 345/345 | **345/345** (332 IDs v1.0.15 tous présents + PB7-01..13) |
| `test/test-monolith.js` v1.0.15 (référence) | — | 332/332 |
| chunking | 21/21 | **21/21** |
| secret scan (K1) | 0 | **0** (PASS) |
| anti-hardcoding (H1 + 5 scans) | 0 | **0** (PASS) |
| `build-manifest.js --verify` (réel, lecture seule) | 180, `54266d0d…` | **180 fichiers OK**, `contentHash 54266d0db6a0ce73bb88309a3bb8d53fcaa378c2af3b3e34dadf479f12ada490` |
| `verifyFrozenLots` (réel) | 0 | **0 divergence** (MONO-01/09/10/11) |
| MONO-11 v0.4 | 55/55, 83/83 | **55/55 SHA**, **83/83 tests** |

## 15. Non-régression historique

Toutes vertes en v1.0.16 : R1-01..06 (identité cible/document), R2-01..08 (gardes d'autorité), R4-01..05 (+1) (import de registre), RA1-01..03 (trace parity), V12-01..18 (R5 parité adaptateur/MONO-11, R6 contrat/sceau fail-closed, CAS A V12-04, CAS B V12-05, shadow A10 V12-13 exercé : 12/12 citations), T-EF03B-35 shadow A10 exercé (70 constats, 7 revues byte-identiques), 18 tests lignée/monotonie, X9 agrégation. Code d'agrégation et de lignée non modifié.

## 16. Impact reprise d'un ancien run — `EXPECTED_FAIL_CLOSED_RECOMPUTATION`

Une entrée EF-03B sans identité n'est plus servie par le magasin → recalcul. Nuance mesurée : le **registre** du même run n'est pas affecté ; sur le run phase B, 20/20 entrées EF-03B du magasin sont couvertes par une entrée de registre du même run portant cible + autorité (`out/legacy-impact.json`) : une reprise **dans le même dossier de run, même sceau et même contrat** les servirait par le registre sans appel. Le recalcul supplémentaire touche donc : la réutilisation inter-runs via le magasin, les runs ≤ v1.0.14 dont le registre n'a pas de cible, les revues absentes du registre, et les passes non-base. Qualitativement : appels supplémentaires possibles, coût supplémentaire possible (ordre de grandeur : le coût des revues EF-03B concernées), aucune perte de preuve. Non mesuré par appel fournisseur.

## 17. Verdict PB-B7 — **`PB_B7_CLOSED`**

T3b fermé ✔ ; contrôle cible ✔ ; autorité ✔ ; contrat ✔ ; sceau ✔ (désormais obligatoire pour EF-03B) ; legacy fail-closed ✔ ; refus du registre non contournable ✔ ; reuse valide toujours possible ✔ ; non-EF-03B non régressé ✔. Le correctif couvre aussi les passes non-base (vérifié par le harnais) ; la couverture de tests de ces passes est insuffisante (R1).

## 18. Verdict global — **`V1_0_16_FREEZE_AUDIT_PASS_WITH_RESERVATIONS`**

**Blockers : aucun.**

| Id | Gravité | Réserve |
|---|---|---|
| R1 | MEDIUM | Mutant M11 survit : restreindre la garde à la finalité de base n'est détecté par aucun test ; les passes `informed-retry` / `completion` / `literalization` ne sont protégées que par le code (harnais C9e), pas par la suite. |
| R2 | MEDIUM (gouvernance) | v1.0.16 est déjà commitée et poussée (`766db22a`, `origin/main`), contrairement au statut « NON COMMITÉE » du mandat et du rapport constructeur. |
| R3 | MEDIUM | Non fumée : micro-smoke ciblé PB-B7 requis avant activation. |
| R4 | LOW | RUN-SAFETY-12 affaibli (`TEST_WEAKENED`) : exerce désormais le registre, plus le cache magasin ; compensé au niveau de la suite. |
| R5 | LOW | Mutant M12 survit ; le transport fait confiance à l'identité déclarée (C9c servi en appel direct). Sans effet en production : seul l'adaptateur appelle EF-03B et le lot gelé ne fournit pas `documentAuthoritySha256`. |
| R6 | LOW | M3, M4, M4c tués par le code de refus seulement (défense historique parallèle) ; M4b tué par code sur la 1re assertion alors que le comportement sans sceau régresse. |
| R7 | LOW | Politique gelée : seule l'entrée VALID la plus récente est proposée ; si son identité diverge, refus même si une entrée plus ancienne concorde (C9f) : surcoût possible, fail-closed. |
| R8 | INFO | `markValidation` propage par `responseSha256` à toutes les entrées de même hash, quelle que soit leur identité (C9g) ; nécessite des octets de réponse identiques (id fournisseur compris) : théorique, préexistant. |
| R9 | INFO | RUN-SAFETY-21 : la sous-assertion « ancien contrat » est masquée par la garde d'identité (couverte ailleurs). |
| R10 | INFO | Changement strict inter-finalités (§8) ; anciennes entrées EF-03B non réutilisables (§16). |

Statut PB-B7 : `PB_B7_CLOSED`. Tests adaptés : 4 × `ADAPTATION_VALID_NO_WEAKENING`, RUN-SAFETY-12 `TEST_WEAKENED`. RUN-SAFETY-21 : `INVERSION_CONTRACTUALLY_CORRECT`. Impact legacy : `EXPECTED_FAIL_CLOSED_RECOMPUTATION`.

**Recommandation : GELER** v1.0.16 (décision propriétaire, après prise d'acte de R1–R3 ; R1 et R4 peuvent être traités par des tests dans une version ultérieure sans toucher au runtime). Je ne prononce pas le gel.

## 19. Activation

Non activée. `ACTIVE_VERSION` = `MONOLITH-v1.0.10` (vérifié). Étapes suivantes : 1. gel propriétaire v1.0.16 ; 2. micro-smoke ciblé PB-B7 ; 3. OWNER GATE activation.

## 20. Preuve de lecture seule

- `node tools/build-manifest.js --verify` sur le dossier réel : `{"ok":true,"files":180,"bad":[]}` (avant et après écriture de ce rapport).
- `git status --short -- tools/EvidenceForge` : seuls mes 2 livrables non suivis ; `git diff HEAD -- tools/EvidenceForge` vide.
- Artefacts smoke phase B (770 fichiers) et `h1-v105-runs` (5453 fichiers) : sha256 identiques avant/après.
- `ACTIVE_VERSION` : `MONOLITH-v1.0.10`.

## Preuves (scratch `/private/tmp/claude-501/-Users-christophebonnet/5110422b-0d8e-41bc-a21d-67561ff81ea0/scratchpad/indep-audit/`)

Harnais : `harness/indep-pbb7.js` (`4a729c57…`), `harness/indep-mutants.js` (`5218cbc5…`), `harness/indep-legacy-impact.js` (`69eb6713…`). Sorties : `out/harness-MONOLITH-v1.0.15.json` (`7b8780b2…`), `out/harness-MONOLITH-v1.0.16.json` (`6891bc74…`), `out/mutation-matrix.json` (`84535766…`), `out/weakening-v1015.json` (`de845f0c…`), `out/weakening-v1016.json` (`ef1e087b…`), `out/legacy-impact.json` (`255db4f2…`), `out/v1016-test-monolith.log` (`116729ae…`), `out/v1015-test-monolith.log` (`b646ba1d…`), `out/v1016-test-chunking.log` (`4631dfb3…`), `out/mono11-v04-tests.log` (`a08f1140…`), `out/DIFF-FULL-v1015-v1016.patch` (`9d00a8d3…`). Empreintes complètes dans le JSON.

**STOP — audit livré. v1.0.16 non gelée par cet audit, non activée ; aucun commit, aucun appel fournisseur, aucun smoke.**
