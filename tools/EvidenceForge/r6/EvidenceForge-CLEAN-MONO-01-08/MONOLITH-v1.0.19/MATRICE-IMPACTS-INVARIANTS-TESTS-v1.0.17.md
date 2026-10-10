# MATRICE IMPACTS / INVARIANTS / TESTS — MONOLITH v1.0.17

Données mesurées le 2026-10-02 (`test/results.json` : 377/377, 2026-10-02T17:18:25.452Z). Version machine-lisible : `MATRICE-IMPACTS-INVARIANTS-TESTS-v1.0.17.json`.

**Sous-lot B1-FIX (correctif ciblé, audit indépendant v1.0.17)** : `ACKNOWLEDGE_UNSUPPORTED_DELIVERABLE` n'est pas `WAIVE_DELIVERABLE`. Fichiers modifiés : `lib/mission-deliverables.js`, `lib/pipeline.js`, `index.html`, `test/test-v1017-mission-deliverables.js`, `CDC-MISSION-CONTRACT-ENFORCEMENT-v1.0.17.md` et cette matrice. 0 fichier ajouté, 0 supprimé. Manifeste recalculé après correctif : voir `EVIDENCEFORGE-v1.0.17-CANDIDATE-RECORD.json` (le contentHash ne peut pas être cité dans un fichier qu'il hache).

## 1. Impacts (v1.0.16 → v1.0.17)

| Fichier | Changement | Portée | Risque | Couvert par |
|---|---|---|---|---|
| `lib/mission-deliverables.js` | NOUVEAU ; **correctif B1** : `accepted` invariant, état `PARTIAL_BY_DESIGN_ACKNOWLEDGED` supprimé | registre, évaluation, rapport | faux PRODUCED si lexique trop large (R-1) | MD-01…10, B1-01…B1-10, M01–M04, M10, M11, M13, M15, M16, M17 |
| `lib/pipeline.js` | +54/−7 ; **correctif B1** : note de l'acte humain (information, pas renonciation) | porte 1 (composition), REPORT, statut terminal, gateView, replay | régression de reprise / porte | MD-11…17, MD-20, NONREG-04, X0, RUN-SAFETY-*, T-EF03B-26, M05–M09, M12 |
| `server.js` | +1/−1 | 2 codes HTTP 400 | code non mappé ⇒ 500 | MD-18, V1 |
| `index.html` | +24/−8 ; **correctif B1** : libellé de la case de reconnaissance (informe, ne retire rien) | porte (livrables, case), rapport (section), statut | exception UI | MD-19, navigateur v1.0.17 10/10, v1.0.5–v1.0.8, M14 |
| `lib/cost-view.js` | +2/−2 | coût définitif et historique pour INCOMPLETE_DELIVERABLES | prévision erronée | MD-21, COST-* |
| `config/monolith.config.json` | +2/−2 | version MONOLITH-v1.0.17 | — | V12-18, T-STREAM-20 (adaptés : version seule) |
| `tools/build-manifest.js, tools/package.sh` | +7/−2, nom du zip | provenance mesurée (prédécesseur v1.0.16, registre) | — | build-manifest --verify |
| `test/test-v1017-mission-deliverables.js, tools/browser-tests-v1017.js` | NOUVEAUX | MD-01…22, navigateur 10 | — | — |
| `test/test-monolith.js, test-stream.js, test-v1012-lineage-parity.js` | +3/0, +1/−1, +2/−2 | câblage ; version | test affaibli ? | V12-18 et T-STREAM-20 : seule la constante de version change |
| `lib/stage-report.js, stage-mission.js, stage-ef01.js, stage-professionals.js, ef03b-resilience.js, llm.js` | INCHANGÉS (byte-identiques v1.0.16) | — | — | MD-20 |
| `MONO-01, MONO-09, MONO-10, MONO-11` | INCHANGÉS (gelés) | — | — | I1–I5, MD-20, RUN-SAFETY-19 |

## 2. Invariants

| ID | Invariant | Mécanisme | Tests | Mutants tués |
|---|---|---|---|---|
| INV-01 | Aucun lot gelé modifié | verifyFrozenLots (sceaux + zips) | I1, MD-20, RUN-SAFETY-19 | — |
| INV-02 | Porte historique confirmPlan byte-identique (composition) | extraction de fonction comparée à v1.0.16 et v1.0.4 | MD-20, NONREG-04 | — |
| INV-03 | stage-report.js byte-identique ; hash canonique par sa fonction | comparaison d’octets ; verifyReportHash | MD-10, MD-13, MD-20 | M13 |
| INV-04 | Aucun livrable non déclaré n’est supposé produit | fail-closed UNRECOGNIZED / CONDITION / FORM | MD-05, MD-06 | M03, M11, M15, M16 |
| INV-05 | Aucun mapping PROCESS_QUALIFICATION / SCIENTIFICALLY_USABLE → livrable | invariance métamorphique + lecture statique | MD-09 | M10 |
| INV-06 | Verdict métier jamais produit en v1.0.17 | BUSINESS_VERDICT supported:false | MD-02, MD-07, MD-09, MD-22 | M01 |
| INV-07 | Livrable non garanti ⇒ reconnaissance explicite liée à l’empreinte affichée | DELIVERABLES_ACK_REQUIRED / _MISMATCH | MD-11, MD-18, navigateur | M05, M06, M14 |
| INV-08 | Acceptation seulement si liée (empreinte + identité de la confirmation réelle) ; retirée si la porte refuse | missionDeliverablesForReport ; try/catch | MD-11, MD-16 | M07, M09 |
| INV-09 | Livrable accepté absent ⇒ jamais COMPLETED (INCOMPLETE_DELIVERABLES, terminal) | statut terminal | MD-15, MD-16 | M08, M12 |
| INV-10 | Livrables non produits toujours visibles (jamais masqués) | items conservés, statut NOT_PRODUCED_BY_DESIGN | MD-14, navigateur | — |
| INV-11 | Preuve de production lue dans le rapport, jamais dans headline | P_ (preuves) | MD-07, MD-09 | M04, M10 |
| INV-12 | 0 appel fournisseur ; run réel non modifié | fakes ; empreintes avant/après | MD-22 | — |
| INV-13 | Aucun jeton de cas dans lib/tools/test/config/index/server | anti-hardcoding-scan | T-EF03B-24, SCREEN-COST-16 | — |
| INV-14 | **ACK ≠ WAIVER** : une reconnaissance n'enlève ni le caractère REQUESTED, ni l'acceptation, et n'autorise jamais COMPLETED | `accepted` invariant (true) ; aucun état « partiel reconnu » ; aucun mécanisme de renonciation | MD-08, MD-14, B1-01…B1-10 | M17 |

## 3. Tests MD et B1 (mesurés)

| ID | Résultat | Objet |
|---|---|---|
| MD-01 | ok | module pur et deterministe : seul `crypto` est requis (ni fs, ni reseau, ni LLM) ; deux evaluations du meme texte sont identiques ; empreintes registre / evaluation stables ; une evaluation alteree est detectee |
| MD-02 | ok | livrable riche generique : 4 livrables NON garantis (reponse item par item, matrice de decision, verdict, contrat conditionnel au verdict, formes TABLE+JSON) et 6 garantis ; reconnaissance requise |
| MD-03 | ok | livrable usuel (gabarit du cadrage) : « Analyse documentaire. » / « analyse documentaire par des professionnels reels » => 1 livrable garanti, aucune reconnaissance requise ; livrable vide => 0 livrable |
| MD-04 | ok | negation : « sans verdict ni score » => exclus (jamais des livrables), traces dans `excluded` ; la mention « n'ont pas participe » reste un livrable (exempte de negation) |
| MD-05 | ok | fail-closed : un texte non reconnu (« l », « un poeme ») est UNRECOGNIZED_DELIVERABLE, NOT_SUPPORTED, jamais suppose produit |
| MD-06 | ok | segmentation : « v0.2 » n'est jamais coupe ; condition en tete de clause, en ligne, ou en derniere clause ; un livrable garanti mais conditionnel n'est PAS garanti (CONDITION_NOT_EVALUABLE) ; forme TABLE non produite (FORM_NOT_SUPPORTED), forme JSON produite |
| MD-07 | ok | evaluate : garanti + preuve => PRODUCED (preuve citee) ; garanti sans preuve (0 revue complete) => NOT_PRODUCED_ERROR ; non garanti => NOT_PRODUCED_BY_DESIGN ; synthese REQUESTED/PRODUCED/NOT_PRODUCED_BY_DESIGN/NOT_PRODUCED_ERROR |
| MD-08 | ok | acceptation : une reconnaissance (ACK) n'est PAS une renonciation (B1) => un livrable non garanti RECONNU reste accepte et manquant => INCOMPLETE ; sans acceptation (run anterieur) => INCOMPLETE ; reconnaissance partielle => INCOMPLETE (memes identifiants manquants) |
| MD-09 | ok | AUCUN mapping depuis PROCESS_QUALIFICATION / SCIENTIFICALLY_USABLE : pour toutes les combinaisons (4 statuts x YES/NO, en-tete et qualification), et sans en-tete, les statuts des livrables sont identiques ; le verdict reste NOT_PRODUCED_BY_DESIGN ; le module ne lit jamais `headline` |
| MD-10 | ok | attachToReport : nouveau rapport verifie (verifyReportHash), champs existants intacts, rapport d'origine non mute ; un rapport sans missionDeliverables (v1.0.16) se verifie toujours |
| MD-11 | ok | Porte 1 : livrable non garanti sans reconnaissance => DELIVERABLES_ACK_REQUIRED (details listes), ni plan-confirmation ni acceptation ecrite ; empreinte differente => DELIVERABLES_ASSESSMENT_MISMATCH ; identite absente => HUMAN_IDENTITY_REQUIRED et acceptation RETIREE ; gateView expose l'evaluation persistee |
| MD-12 | ok | Porte 1 (succes, porte historique appelee par composition) : reconnaissance + empreinte => acceptation liee (identite, empreinte, ids reconnus) ; livrable entierement garanti => aucune reconnaissance requise |
| MD-13 | ok | bout en bout, livrable garanti : COMPLETED ; report.missionDeliverables (origine GATE) tous PRODUCED ; en-tete MISSION_DELIVERABLES = COMPLETE ; reportHash valide ; mission-deliverables.json persiste ; state.summary porte l'etat |
| MD-14 | ok | bout en bout, livrables non garantis RECONNUS a la porte : INCOMPLETE_DELIVERABLES (B1 : ACK n'est pas une renonciation), MISSION_DELIVERABLES = INCOMPLETE, les 4 restent REQUESTED, acceptes, reconnus et visibles NOT_PRODUCED_BY_DESIGN (jamais masques) |
| MD-15 | ok | bout en bout, run SANS evaluation de porte (anterieur a v1.0.17) et livrable non garanti : JAMAIS COMPLETED => INCOMPLETE_DELIVERABLES (terminal, rapport conserve et verifie, reserve DELIVERABLES_ASSESSED_AFTER_GATE) ; une nouvelle reprise ne rejoue rien ; replay des revues autorise et archive mission-deliverables.json |
| MD-16 | ok | acceptation NON liee (identite differente de la confirmation reelle, ou empreinte d'une autre evaluation) : ignoree => tout est accepte => INCOMPLETE_DELIVERABLES + reserve DELIVERABLES_ACCEPTANCE_NOT_BOUND ; evaluation alteree => DELIVERABLES_ASSESSMENT_DRIFT |
| MD-17 | ok | runs seedes sans reformulation (tests historiques) : 0 livrable declare => COMPLETED inchange, MISSION_DELIVERABLES = NO_DELIVERABLE_DECLARED |
| MD-18 | ok | serveur : POST /api/runs/:id/confirm-plan sans reconnaissance => 400 DELIVERABLES_ACK_REQUIRED (details) ; GET gate => evaluation des livrables |
| MD-19 | ok | interface : porte 1 affiche les livrables (produit / NON PRODUIT + raison), case de reconnaissance envoyee avec l'empreinte ; rapport : section « Livrables demandes » ; statut INCOMPLETE_DELIVERABLES libelle, rapport charge, reprise masquee ; script syntaxiquement valide |
| MD-20 | ok | non-regression par composition : stage-report.js, stage-mission.js, stage-ef01.js et la porte historique `confirmPlan` byte-identiques a v1.0.16 ; lots geles verifies (MONO-01/09/10/11, 0 divergence) |
| MD-21 | ok | vue de cout : un run INCOMPLETE_DELIVERABLES a un cout definitif (prevision COMPLETE) et compte dans l'historique de reference |
| MD-22 | ok | rejeu LECTURE SEULE d'un run reel anterieur (EVIDENCEFORGE_MD_REPLAY_RUN ; SKIP sinon) : evaluation retrospective depuis mission.json + report.json, aucun octet du run modifie |
| B1-01 | ok | livrable REQUESTED + non garanti + RECONNU + non produit => statut final INCOMPLETE_DELIVERABLES (bout en bout, moteur reel, aval factice) |
| B1-02 | ok | un ACK ne modifie pas le caractere REQUESTED du livrable : requested / requestedStatus identiques avec et sans reconnaissance, et l'evaluation de la porte reste REQUESTED |
| B1-03 | ok | un ACK ne supprime aucun livrable de acceptedMissing : la liste est identique avec et sans reconnaissance (totale ou partielle) |
| B1-04 | ok | un ACK seul ne permet JAMAIS COMPLETED si un livrable manque : runMayComplete reste false pour toutes les formes de reconnaissance ; `accepted` est invariant dans le code ; aucun mecanisme de renonciation n'existe |
| B1-05 | ok | plusieurs livrables, certains produits et un non garanti RECONNU : la partie produite reste PRODUCED, l'ensemble est INCOMPLETE (jamais masque par la reconnaissance) |
| B1-06 | ok | tous les livrables reellement produits : COMPLETED reste possible (bout en bout) et overall = COMPLETE |
| B1-07 | ok | l'empreinte de la liste affichee a la porte de plan reste verifiee : gateView expose une evaluation verifiable et persistee, une empreinte etrangere est refusee (DELIVERABLES_ASSESSMENT_MISMATCH), une reconnaissance sans empreinte est refusee |
| B1-08 | ok | PROCESS_QUALIFICATION ne modifie pas le resultat d'un livrable reconnu : pour les 4 statuts, memes statuts d'items, meme acceptedMissing, meme INCOMPLETE |
| B1-09 | ok | SCIENTIFICALLY_USABLE ne modifie pas le resultat d'un livrable reconnu : YES / NO / absent => memes statuts, meme acceptedMissing, meme INCOMPLETE |
| B1-10 | ok | garde de non-retour : l'etat « partiel reconnu » qui autorisait COMPLETED n'existe plus (ni dans le calcul, ni dans les libelles) ; le mutant qui remet ACK => accepted=false est tue par MD-08 / MD-14 / B1-01..B1-05 (preuve de mutation hors suite) |

Autres suites rejouées après le correctif B1 : chunking 21/21 · navigateur v1.0.5 33/33, v1.0.6 12/12, v1.0.7 11/11, v1.0.8 9/9, **v1.0.17 10/10** · `browser-tests.js` (v1.0) : échec préexistant, **identique avant et après le correctif** (même ligne FAIL, comparaison de logs : R-5) · anti-hardcoding 0 jeton (85 fichiers) · secrets 0 (199 fichiers) · lots gelés 0 divergence.

## 4. Matrice de mutation (17/17 tués)

| Mutant | Défaut injecté | Tests qui échouent |
|---|---|---|
| M01-verdict-supported | BUSINESS_VERDICT déclaré supported | MD-02, MD-07, MD-08, MD-09, MD-11, MD-14, MD-15, MD-16, MD-18, MD-22, B1-01, B1-04, B1-05 |
| M02-no-negation | négation ignorée | MD-04 |
| M03-unrecognized-supported | texte non reconnu classé SUPPORTED | MD-05 |
| M04-produced-always | preuve de production toujours vraie | MD-07 |
| M05-no-ack-check | reconnaissance non exigée à la porte | MD-11, MD-18, B1-07 |
| M06-no-hash-check | empreinte de reconnaissance non vérifiée | MD-11, B1-07 |
| M07-acceptance-kept-on-failure | acceptation conservée si la porte historique refuse | MD-11 |
| M08-always-completed | run toujours COMPLETED | MD-14, MD-15, MD-16, B1-01 |
| M09-acceptance-unbound | acceptation non liée à l’identité de confirmation | MD-16 |
| M10-headline-mapping | QUALIFIED ⇒ verdict PRODUCED (mapping interdit) | MD-09, B1-08, B1-09 |
| M11-condition-ignored | livrable conditionnel garanti | MD-06 |
| M12-incomplete-not-terminal | INCOMPLETE_DELIVERABLES non terminal | MD-15 |
| M13-hash-not-recomputed | reportHash non recalculé | MD-10, MD-13, MD-14, MD-15 |
| M14-ui-no-hash | interface sans empreinte | MD-19 |
| M15-condition-clause-not-merged | clause « si … » traitée comme livrable | MD-02, MD-06, MD-07, MD-08, MD-11, MD-14, MD-15, MD-16, MD-18, B1-01, B1-04 |
| M16-form-ignored | forme TABLE ignorée | MD-06 |
| M17-ack-waives-deliverable | **défaut B1 réinjecté** : un ACK redevient une renonciation (accepted=false) | MD-08, MD-14, B1-01, B1-02, B1-03, B1-04, B1-05, B1-08, B1-10 |

Méthode : copie sœur `ZZ-MUT-*` dans le bundle (les tests comparent aux dossiers frères), un seul défaut par mutant, suite complète `node test/test-monolith.js`, dossier supprimé après mesure.

## 5. Verdict technique

**GELABLE** — blocker B1 de l'audit indépendant levé (invariant ACK ≠ WAIVER) ; réserves R-1…R-10 non bloquantes (voir `CDC-MISSION-CONTRACT-ENFORCEMENT-v1.0.17.md` §8) ; réaudit indépendant ciblé requis ; aucune activation, ACTIVE_VERSION reste MONOLITH-v1.0.16.
