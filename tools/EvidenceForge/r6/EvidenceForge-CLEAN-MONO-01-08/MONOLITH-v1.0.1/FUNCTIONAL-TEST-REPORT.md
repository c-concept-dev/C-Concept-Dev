# FUNCTIONAL-TEST-REPORT — MONOLITH v1.0 (2026-09-14)

Trois niveaux de preuve, tous mesurés :

1. **Suite automatisée** `node test/test-monolith.js` — 41/41 OK (fakes, aucun réseau ; résultats dans `test/results.json`).
2. **Runs réels natifs** via le serveur et l'API (`runs/efm-2026…`), fournisseur réel (`claude-opus-4-8` via le worker délégué), OpenAlex réel.
3. **Exercices d'intégration** (scripts hors paquet, `~/evidenceforge-work/monolith-v1.0-exercises/`) qui font tourner les étapes aval du monolithe sur les entrées **réelles** de P0.1, sans simuler aucun acte humain.

Rappel : rien n'est simulé côté humain. Les portes utilisateur (confirmation du plan, ratification des sources) exigent un clic réel avec un nom ; aucun humain n'étant présent dans ce chantier, **aucun run natif n'a franchi ces portes**. Les étapes situées après les portes ont été exercées avec des actes humains **réels et antérieurs** du propriétaire (SearchProtocol validé, 88 décisions de screening) ou avec la porte machine MONO-11.

## A. Suite automatisée (41 tests)

| Groupe | Tests | Couverture mandat |
|---|---|---|
| Intégrité I1–I5 | 4 lots intacts + zips ; altération détectée ; garde MONO-11 (accepte / refuse) ; paquet hors des lots | corruption d'artefact, lots gelés |
| Mission M1–M3 | intake (.txt/.md, refus .pdf/vide/trop gros) ; reformulation schéma fermé + reprise ; mission invalide ; document injectant des instructions traité comme donnée | mission invalide, output hors schéma, adversarial |
| Screening S1–S3 | doublons déterministes ; preuves absentes du titre/résumé refusées ; sourceId inconnu / oublié / clé non prévue refusés ; lot en échec ⇒ aucune proposition | hallucination fournisseur, références invalides |
| Ratification R1–R4 | `acteur:"human"` + identité sur chaque décision ; exhaustivité ; renversement tracé ; doublon non renversable ; POST_RETRIEVAL_GATE gelé refuse acteur machine / snapshot altéré ; journal OpenAlex expurgé et rejeu cache | identité, corruption d'artefact |
| EF-01 E1–E3 | identité obligatoire ; commentaire auto sans revue humaine ; modèle réel explicite et vérifié (`MODEL_PROVENANCE_MISMATCH`) | — |
| Adaptateur F1–F2 | clôture Markdown retirée seulement si JSON valide ; journal + original | output hors schéma |
| LLM L1–L6 | non configuré (fail-closed) ; crédit épuisé ; 429 + attente bornée ; réseau ; 500 ; **timeout** ; reuse gelé (validé ⇒ réutilisé jamais compté réel ; invalidé ⇒ appel réel) ; aucun secret dans le journal | provider indisponible, crédit, rate-limit, réseau, timeout, réel/reuse |
| Rapport P1–P3 | `SCIENTIFICALLY_USABLE` calculé (toute réserve ⇒ NO) ; classification établi/convergent/divergent/provisoire/non établi ; lignée « pourquoi » complète ; jamais « validé scientifiquement » | agrégation, qualification |
| Pipeline Q1–Q5 | run créé et haché ; portes fermées refusent tout acte ; **sans fournisseur ⇒ STOPPED reprenable** sans étape marquée terminée ; classification reprenable/non ; libellés sans jargon | reprise, provider indisponible |
| Serveur V1 | `/`, `/api/config` sans valeur secrète, 404, 400, traversée de chemin refusée | privacy |
| UI U1 | mode simple sans EF-*/checkpoint/JSON ; deux portes avec nom ; exports ; viewport/print/mobile | UI |
| Anti-hardcoding H1–H3 | 0 hit avec **344 jetons de cas réels** injectés (noms, identifiants, missionId, runId, snapshotId de P0.1) ; mutation détectée ; aucune profession/discipline/quota | anti-hardcoding |
| Secrets K1–K2 | 0 hit, valeurs réelles d'environnement absentes ; mutation détectée | secret scan |

## B. Runs réels natifs (serveur + API, fournisseur réel)

| Run | Entrée | Résultat | Enseignement |
|---|---|---|---|
| `efm-20260914-18748e7b` | question + document (1 073 o) | MISSION OK (reformulation réelle) ; DISCIPLINES **FAILED `LLM_RESPONSE_INVALID`** : le fournisseur a enveloppé un JSON valide dans ```json``` ; parseur gelé EF-01B strict | ⇒ adaptateur additif `mono04-fence-adapter` (F1/F2) ; code reclassé reprenable |
| `efm-20260914-5e9e749a` | idem | MISSION réutilisée (`REUSE_VALID`, 3 ms) ; DISCIPLINES OK avec 1 normalisation de clôture journalisée ; PLAN **FAILED `REAL_MODEL_NOT_EXPLICIT`** (garde gelé EF-01C1 : `LLM_REAL_MODEL` absent) — le résolveur avait tourné sur le modèle par défaut du lot | ⇒ `ensureRealModel()` : modèle de la configuration posé explicitement + `assertObservedModel` (E3) ; run écarté |
| `efm-20260914-07ee674c` | idem | **WAITING_USER / CONFIRM_PLAN** en 47 s : résolveur `claude-opus-4-8` observé, 8 angles, plan 8 requêtes | reformulation signalait une ambiguïté due à l'extrait tronqué (600 car.) ⇒ extrait porté à 6 000 car. |
| `efm-20260914-8beea006` | idem | **WAITING_USER / CONFIRM_PLAN** en 55 s : 7 angles, 7 requêtes, reformulation fidèle (captures `ui-desktop-gate1`, `ui-mobile-gate1`) | porte 1 atteinte proprement ; en attente d'un clic humain réel |
| `efm-20260914-d9f07611` | **question seule** (aucun document) | tentative 1 : PLAN **FAILED `PLANNER_OUTPUT_INVALID`** (le planificateur a produit un `connectorId` non câblé — garde gelé) ; code reclassé reprenable ; **reprise** (`POST /resume`) ⇒ tentative 2 : MISSION/DISCIPLINES conservées, PLAN réel OK ⇒ **WAITING_USER / CONFIRM_PLAN** | reprise réelle démontrée (artefacts valides conservés, seule l'étape manquante rejouée) |
| `efm-import-run-p01-real-ph2v2b-d8f1fa4f` | import lecture seule du run P0.1 seal B (11 artefacts hash-vérifiés) | COMPLETED : `PROCESS_QUALIFICATION = QUALIFIED_WITH_RESERVATIONS`, `SCIENTIFICALLY_USABLE = NO`, 38 établi / 27 convergent / 12 divergent / 11 provisoire / 283 non établi / 4 réserves, 0 appel | preuve d'intégration demandée par le mandat ; rapport et « Pourquoi » rendus (captures `ui-desktop-report`, `ui-mobile-report`, `ui-desktop-expert`) |

Fail-closed observé en réel : chaque échec a arrêté le run avec un code, un message utilisateur et aucun résultat partiel présenté comme résultat ; aucun faux succès.

## C. Exercices d'intégration sur entrées réelles de P0.1 (étapes après les portes)

| Exercice | Ce qui tourne | Résultat mesuré |
|---|---|---|
| `exercise-corpus-p01.js` → `runs/efm-exercise-corpus-82d8aa` | `buildCorpusFromDecisions` : POST_RETRIEVAL_GATE gelé + `resumeRealScreening` + `driveRun` (arrêt avant EF-PR-GEN-01) + `listArtifacts/getArtifact` avec le snapshot v0.8 réel et les **88 décisions humaines réelles** du propriétaire | CorpusSnapshot 88 sources, 22 inclus / 63 exclu / 3 doublon ; statuts, `protocolRef`, `targetDocumentsRef` **identiques** au CorpusSnapshot canonique P0.1 ; `workerCallFn` = 0 ; 10 nœuds NOT_STARTED après EF-ORCH-SUBSYSTEM (arrêt voulu) |
| `exercise-retrieval-p01.js` → `runs/efm-exercise-retrieval-73ee8b` | `prepareRetrieval` (runner équitable gelé, OpenAlex **réel**, RetrievalSnapshot gelé, intégrité vérifiée) + `enrichSources` (88 fiches réelles) + `buildScreeningEvidence` (LLM réel) ; **arrêt à la porte de ratification** (aucune ratification) | 88 sources (86 communes avec v0.8), 7 appels de retrieval, 81/88 résumés, screening 87 jugées + 1 doublon, 29 inclus / 58 exclu proposés, 11 appels réels, 0 passe invalide ; 3 min ; écran de ratification rendu (captures `ui-desktop-gate2`, `ui-mobile-gate2`) |
| `exercise-downstream-p01.js` → `runs/efm-exercise-downstream-f652d7` | `runPanelAndDownstream` : sceau MONO-11 vérifié, frontière MONO-10 PRODUCTION du run, évaluation MONO-10, sonde LLM réelle certifiée, MONO-11 panel autonome → couverture → jumeaux → revues → agrégation → qualification composée → rapport, avec la politique de réutilisation gelée amorcée sur le magasin P0.1 et OpenAlex rejoué depuis le cache P0.1 | **panel 36 / 9 / 50 / 0 / 12 = identique à P0.1 seal B** ; 36 jumeaux, 0 bloqué ; **revues 108/108** ; `QUALIFIED_WITH_RESERVATIONS`, 0 critère en échec, réserve `PANEL_ADMITTED_BY_MACHINE_EVIDENCE_GATE_WITHOUT_HUMAN_ACT` ; chaînes MONO-10 (265 ev.) et MONO-11 (223 ev.) valides ; 223 preuves persistées ; **26 appels réels / 236 réutilisés** ; 107 appels OpenAlex tous rejoués ; 9,3 min ; rapport 32 établi / 30 convergent / 9 divergent / 6 provisoire / 280 non établi |

Toutes les étapes du monolithe ont donc tourné en réel dans le code du monolithe. Ce qui n'a **pas** été observé : un run natif unique traversant les deux portes utilisateur (impossible sans humain présent — non simulé, par règle).

## D. Correspondance avec la liste minimale du mandat

| Exigence | Preuve |
|---|---|
| question seule | run `d9f07611` (jusqu'à la porte 1) |
| question + documents | runs `07ee674c`, `8beea006` (jusqu'à la porte 1) |
| mission invalide | Q1, M2 (`MISSION_INVALID`) ; `POST /api/runs` ⇒ 400 |
| 0 professionnel éligible | `NO_INCLUDED_SOURCE` / `ZERO_PROFESSIONAL_IDENTIFIED` (messages utilisateur, arrêt) ; panel variable : MONO-11 rend 36 admis sur 107 évalués sans quota (H3) |
| provider indisponible | L1, Q3 (réel : run STOPPED sans fournisseur), L2 crédit, L3 429, L4 réseau/500 |
| timeout | L6 (délai borné référencé, `PROVIDER_TIMEOUT` reprenable) |
| reprise | run `d9f07611` (reprise réelle après échec du planificateur) ; L5 (reuse inter-run) ; run `5e9e749a` (reformulation réutilisée) |
| panel variable / 0 revue | MONO-11 gelé : `reviewCardinality` et `reviews_complete = 100 %` inchangés ; 0 revue ⇒ NOT_QUALIFIED (règle du lot, non modifiée) |
| agrégation complète | exercice downstream (108/108, 21 groupes) ; P2/P3 |
| export JSON / PDF | UI (bouton Blob ; impression) ; `GET /api/runs/<id>/report` |
| adversarial : documents contradictoires | traités comme cibles distinctes (`target-01…`) ; divergences rendues sans arbitrage (rapport P0.1 : 12 divergences) |
| identité ambiguë | MONO-09 rend `providerAuthorId: null` si plusieurs identifiants (code repris du script 19) ; MONO-10 les écarte (`unresolvedSkipped`) |
| corpus insuffisant | MONO-11 `INSUFFICIENT_DOCUMENTARY_BASIS` = 12 dans l'exercice |
| hallucination fournisseur / références invalides / output hors schéma | S2, M2, F1, enforcers MONO-11 (reprise informée bornée) |
| corruption d'artefact | I2, R3 (snapshotHash), `DOCUMENT_HASH_MISMATCH` à la reprise, import P0.1 hash-vérifié |
| tentative de hardcoding | H2 (mutation détectée), H1 avec jetons réels |
| UI desktop / mobile / refresh / reprise / progression / résultat long / erreur réseau | `UX-ACCEPTANCE.md` |
| privacy / packaging : secret scan, extraction fraîche, hash paquet, aucun lot gelé modifié | § E |

## E. Packaging

Voir le bloc final du chantier : `tools/package.sh` produit `MANIFEST.json`, `SHA256SUMS.txt` et `EvidenceForge-MONOLITH-v1.0.zip` (hors `runs/`) ; extraction fraîche dans un dossier temporaire ⇒ `SHA256SUMS` re-vérifié, scan de secrets rejoué, `verifyFrozenLots()` rejoué depuis l'extraction (le bundle R6 étant référencé par `bundleRoot`).

FUNCTIONAL_TESTS_PASS = YES (avec la réserve « aucun run natif n'a traversé les deux portes humaines ») · ADVERSARIAL_TESTS_PASS = YES · RESUME_PASS = YES
