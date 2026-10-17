# CDC — ÉTAPE DE CLÔTURE P0.1 (lot futur) — EvidenceForge

**Statut : CONCEPTION SEULE. Rien n'est codé.** Ce document ne produit aucun verdict et aucun contrat. Il ne lance aucun fournisseur. Il ne crée aucun run.
**Date :** 2026-10-02. **Prérequis :** v1.0.17 (R-A, `CDC-MISSION-CONTRACT-ENFORCEMENT-v1.0.17.md`), gelée après audit indépendant.

**Références, toutes en lecture seule :**

- autopsie `EF-REPORT-P01-VERDICT-AUTOPSY-v1` (2026-09-19) ;
- audit `JMMJS-P0.1-CLOSURE-AUDIT` (2026-10-01) ;
- politique propriétaire **`D103-P0.1-politique-decision-v1.1`** (json `32de5078…`), approuvée le 2026-09-19 ;
- verdict gouverné `D103-P0.1-verdict-v1.1.json` (`b5c0fc3b…`) ;
- canon `…exigences-structurelles-CANONICAL-v1.json` (`af863c98…`) ;
- mapping probatoire `…evidence-mapping-v1.1.json` (`bc77e74e…`) ;
- contrat `D103-P0.2-INPUT-CONTRACT-v1.json` (`44f1ec73…`), dans `~/evidenceforge-work/reports/jmmjs-p01-closure/`.

---

## 0. Ce que ce lot doit être

La clôture P0.1 a déjà été réalisée **une fois, hors moteur**, sous gouvernance du propriétaire. Le parcours comprenait 18 candidates, 6 portes humaines et 13 exigences canoniques. Il a mobilisé la politique v1, rejetée (`NOT_ADMISSIBLE`), puis la politique v1.1. Il a abouti au verdict `P0_1_GO_WITH_RESERVATIONS`, au contrat P0.2 v1 et à un audit PASS.

Le lot de clôture **industrialise ce parcours**. Il n'invente pas une nouvelle sémantique. Il en garde intactes les deux leçons :

1. **La disposition EvidenceForge n'est jamais une direction de preuve.** Défaut `POLICY_DEFECT:EVIDENCEFORGE_DISPOSITION_WAS_INCORRECTLY_USED_AS_REQUIREMENT_EVIDENCE_DIRECTION`. Un `concern` documenté peut établir le **besoin** d'une exigence ; un `support` ne la valide pas automatiquement.
2. **La décision métier appartient à une politique déclarée par le propriétaire.** Elle n'appartient ni au code, ni à une valeur de processus. EvidenceForge **évalue** une politique ; il ne la **choisit** pas.

**Conséquence d'architecture.** Le moteur générique ne connaît ni D103, ni JMMJS, ni les chaînes `P0_1_*`. Le vocabulaire de verdict, les classes, les blockers et le registre BLOCKING sont des **données** d'un **Mission Output Contract** (MOC), ratifié par le propriétaire.

## 1. Invariants du lot (CL-INV)

| ID | Invariant |
|---|---|
| CL-INV-01 | Aucun lot gelé n'est modifié (MONO-01 EF-03A/B/C, MONO-09, MONO-10, MONO-11). Le lot est **additif**. Il **lit** les sorties EF-03B ; il ne les réécrit jamais. |
| CL-INV-02 | Aucun verdict ne dérive de `PROCESS_QUALIFICATION`, `SCIENTIFICALLY_USABLE`, `readiness*`, ni du nombre de réserves de processus (§12). |
| CL-INV-03 | Aucun vote, aucune majorité, aucun comptage de jumeaux comme règle de décision. Une règle porte sur l'**existence** d'une preuve qualifiée, jamais sur un nombre. |
| CL-INV-04 | Aucun seuil numérique dans la politique : des classes de situation et des statuts de gouvernance uniquement (politique v1.1). |
| CL-INV-05 | La décision du propriétaire ne remplace jamais la preuve. Elle valide un périmètre, une correspondance ou un reclassement, toujours de façon tracée. |
| CL-INV-06 | Fail-closed : une entrée manquante, non liée ou altérée donne `NOT_ADMISSIBLE` (un état, pas un verdict). Elle ne donne jamais un verdict par défaut. |
| CL-INV-07 | Le P0.2 INPUT CONTRACT n'existe **que si** le verdict est GO ou GO_WITH_RESERVATIONS. Sinon, le constructeur **lève une erreur** et c'est un rapport de clôture qui est produit. |
| CL-INV-08 | UNKNOWN désigne une donnée dont la valeur est inconnue, jamais un besoin structurel non résolu (`DEFERRED_EVIDENCE_GAPS`). |
| CL-INV-09 | Indépendance des jumeaux : chaque revue d'items est produite sans accès aux sorties des autres jumeaux. L'agrégation n'a lieu qu'après. |
| CL-INV-10 | Aucune correspondance 1:1 automatique entre le §31 de la grille et les verdicts techniques (OWNER_POLICY_DECISION_06b). |
| CL-INV-11 | Recalcul hors ligne : C5 à C8 sont des fonctions pures des artefacts scellés. Le rejeu sans LLM est byte-identique. |
| CL-INV-12 | Anti-hardcoding : aucun jeton de cas dans `lib/`, `tools/`, `test/` (scanner existant). Les vocabulaires viennent du MOC. |

## 2. Architecture (étapes C0 à C8)

```
Porte 1 ── C0 MOC déclaré + ratifié (politique = données, hash)            [acte humain]
             └─ R-A : BUSINESS_VERDICT / DECISION_MATRIX / PER_ITEM_RESPONSE / STRUCTURED_CONTRACT
                deviennent « supported » POUR CE RUN seulement si le MOC est ratifié et le lot actif
C1 Modèle canonique de la grille (extraction déterministe) ── porte RATIFY_GRID_MODEL  [acte humain]
... pipeline inchangé jusqu'à TWINS_REVIEWS (EF-03B gelé, par dimension) ...
C2 Revue PAR ITEM, par jumeau (nouveau schéma EF-P01-ITEM-REVIEW-v1, indépendante)   [LLM, contrainte]
C3 Candidates d'exigences (déterministe, ancrage par item) ── porte CANONICALIZE  [acte humain, par lots]
C4 Relations probatoires constat → exigence (passe contrainte + contrôle)          [LLM + humain, D-C4]
C5 Standing par exigence (règles de la politique)                                  [pur]
C6 Blockers BLK (preuve positive) + registre BLOCKING (propriétaire)               [pur + données]
C7 Recevabilité → séquence de priorité → verdict + dossier de verdict              [pur]
C8 Si GO / GO_WR : P0.2 INPUT CONTRACT (tableau ⇄ JSON) ; sinon : rapport de clôture [pur]
```

C5 à C8 sont **purs et déterministes** : ce sont les étapes qui calculent le verdict. Les seuls appels LLM sont C2 et, selon D-C4, C4. Les actes humains sont C0, C1, C3 et, selon D-C4, C4. C'est le parcours gouverné du 19/09, désormais tracé dans le moteur.

## 3. C0 — Mission Output Contract (MOC)

Document JSON fourni avec la mission ou déposé à la Porte 1, ratifié par le propriétaire (identité, horodatage, sha256). Le schéma est fermé :

```json
{
  "schema": "EvidenceForge.MissionOutputContract", "version": "v1",
  "verdictVocabulary": ["<4 libellés techniques>"],
  "notAdmissibleState": "NOT_ADMISSIBLE",
  "contractRequiredFor": ["<libellés autorisant le contrat>"],
  "gridDocumentSha256": "<sha256 du document-grille du run>",
  "itemStatusVocabulary": ["CONSERVER","MODIFIER","AJOUTER","SUPPRIMER","CLARIFIER","A_REVOIR"],
  "twinVerdictVocabulary": ["OUI","OUI_SOUS_RESERVE","NON","IMPOSSIBLE_A_CONCLURE"],
  "evidentiaryRelations": ["DIRECT_SUPPORT","DIRECT_NEED_EVIDENCE","RESERVATION","CONTRADICTORY_EVIDENCE","IRRELEVANT_OR_CONTEXTUAL","NOT_DETERMINABLE"],
  "standingClasses": ["SUPPORTED","SUPPORTED_WITH_RESERVATIONS","INSUFFICIENT_EVIDENCE","CONTRADICTED"],
  "blockers": [{"code":"BLK-1","name":"…","positiveEvidenceRequired":"…"}],
  "neverBlockers": ["question ouverte","gap documentaire","discipline sous-couverte","divergence non résolue","concern cautious_inference","not_determinable", "…"],
  "blockingRegistry": [],
  "transportClasses": ["reservations","openQuestions","explicitlyUndecidedRules","deferredOutOfScope","deferredEvidenceGaps","nonStructuralQualityCriteria","processReservations","unknownsNonBlocking"],
  "priorityOrder": [{"rank":0,"output":"NOT_ADMISSIBLE"},{"rank":1,"output":"<NO_GO>","when":"BLOCKER_ESTABLISHED"},{"rank":2,"output":"<INSUFFICIENT>","when":"BLOCKING_REGISTRY_UNRESOLVED"},{"rank":3,"output":"<GO_WR>","when":"TRANSPORT_SET_NON_EMPTY"},{"rank":4,"output":"<GO>","when":"TRANSPORT_SET_EMPTY"}],
  "forbiddenCorrespondences": ["PROCESS_QUALIFICATION→*","SCIENTIFICALLY_USABLE→*","READINESS→*"],
  "grid31Mapping": "NONE",
  "contractColumns": ["ID","exigence structurelle","statut","provenance","réserves","unknown autorisé","élément différé","règle explicitement non décidée"]
}
```

- Le MOC de référence est **la traduction exacte de la politique v1.1** : conditions (§1), recevabilité (§2), classes (§3), relations et standing (§4), BLK-1 à 4 et « jamais des blockers » (§5), INSUFFICIENT (§6), métriques interdites (§7), ordre de priorité (§8), OPD-01 (§9), transport (§10), OPD-06b (§11). Le `priorityOrder` reprend le rang de la politique.
- Le moteur **refuse** un MOC dont `forbiddenCorrespondences` n'inclut pas les trois interdits, ou dont une règle référence un champ du processus (§12).
- **Intégration R-A.** Le registre MISSION-DELIVERABLES passe à v2. Une capacité déclarée par le lot (BUSINESS_VERDICT, DECISION_MATRIX, PER_ITEM_RESPONSE, STRUCTURED_CONTRACT) n'est `supported` **que pour un run dont le MOC est ratifié et le lot actif**. Sinon elle reste NOT_PRODUCED_BY_DESIGN : le comportement v1.0.17 est conservé. Les preuves de production lisent les artefacts C7 et C8.

## 4. C1 — Modèle canonique des items et requirements

**Mesure du document réel**, `01_…grille…v0_2.md`, sha `e3916c76…`, lecture seule : 36 rubriques `#` ; 38 lignes interrogatives ; des cases à cocher, des tableaux et des zones à remplir. Les rubriques §6, §9 et §17 ne contiennent **aucune** ligne terminée par « ? » et sont pourtant des rubriques de revue. **L'extraction lexicale seule ne suffit donc pas** : une ratification humaine est indispensable.

**GridItem** est extrait de façon déterministe : sections, sous-titres, lignes interrogatives, listes et cases.

```json
{ "itemId": "GI-<section>-<n>", "sectionId": "6|7|…|16bis|…", "path": ["# 7. …","## Questions de revue"],
  "kind": "REVIEW_ITEM | CONTEXT | DECISION_SCALE | OUTPUT_FIELD | CLOSURE_CRITERION",
  "literalText": "<texte exact>", "startChar": 0, "endChar": 0, "sourceDocumentSha256": "<sha256>" }
```

- `REVIEW_ITEM` : les items à statuer, rubriques de revue §6 à §22. `OUTPUT_FIELD` : §23 à §33, que les jumeaux **remplissent** sans les statuer. `CONTEXT`, `DECISION_SCALE` (§5) et `CLOSURE_CRITERION` (§34) ne sont jamais statués.
- **Porte RATIFY_GRID_MODEL**, acte humain. Le propriétaire voit la liste ; il peut fusionner, scinder ou reclasser un item, avec trace de chaque décision au ledger. Il ratifie l'empreinte `gridModelSha256`. Sans ratification, C2 ne démarre pas.
- **Requirement** : `REQ-nn`, avec texte canonique, `sourceItemIds[]`, `lineage` (candidates → décisions propriétaire datées), `appliesTo`, `reservationsKeptApart`. Les requirements **ne sont pas** les items. Ce sont les exigences structurelles génériques issues de C3, comme les 13 exigences canoniques du 19/09.

## 5. C2 — Statut §5 par item, par jumeau

**Nouveau schéma `EF-P01-ITEM-REVIEW-v1`**, additif, sans rien remplacer d'EF-03A. Une revue par jumeau et par lot de section ; le découpage par sections est déterministe pour borner la sortie.

```json
{ "twinId": "…", "gridModelSha256": "…", "itemAssessments": [
  { "itemId": "GI-7-2", "status": "CONSERVER|MODIFIER|AJOUTER|SUPPRIMER|CLARIFIER|A_REVOIR|NOT_DETERMINABLE",
    "blocking": false, "justification": "…", "epistemicStatus": "documented|cautious_inference|not_determinable",
    "targetEvidenceRefs": ["<passage littéral>"], "twinBasisWorkRefs": ["<œuvre de worksUsed>"],
    "genericNeedRevealed": "<besoin générique ou null>", "hardcodingRisk": "<texte ou null>", "overinterpretationRisk": "<texte ou null>" } ],
  "outputFields": { "redundancies": [], "missing": [], "tooOrienting": [], "ambiguities": [], "confirmedNeeds": [], "unconfirmedNeeds": [], "excludeFromP02": [], "reservations": [] },
  "grid31": { "verdict": "OUI|OUI_SOUS_RESERVE|NON|IMPOSSIBLE_A_CONCLURE", "justification": "…", "blockingItemIds": [], "requiredModifications": [] } }
```

**Règles du validateur** (déterministes ; une passe de reprise informée, puis erreur) :

- **Complétude.** Chaque `REVIEW_ITEM` ratifié reçoit exactement une entrée. Un item omis rend la revue invalide. Aucun défaut silencieux.
- **`NOT_DETERMINABLE` ≠ `A_REVOIR`.** Le premier signifie « le corpus du jumeau ne couvre pas l'item » ; le second, « l'item est examiné mais on ne peut pas conclure ». Les deux sont conservés distincts.
- **Littéralité.** `targetEvidenceRefs` : contrôle littéral **identique** à celui du lot gelé, réutilisé par composition (`contentContainsRef`, autorité normalisée et liée à la cible, comme en v1.0.15/16). `twinBasisWorkRefs` ⊆ `worksUsed`. `documented` exige au moins une œuvre (même règle qu'EF-03B).
- **Vocabulaire.** Les distinctions exigées par la mission (confirmé, confirmé avec réserves, à différer, à rejeter, besoin générique, surinterprétation, hardcoding) sont portées par `status` + `genericNeedRevealed` + les champs de risque. Divergence et insuffisance relèvent de l'agrégation (§7) ; un jumeau ne les déclare jamais.
- **Charte.** Le prompt reprend les règles EF-03B : analyse sous contraintes documentaires, jamais l'opinion réelle du professionnel, aucune citation synthétique, aucun accès aux autres jumeaux.

## 6. C2 — Verdict §31 par jumeau

- Le vocabulaire est **exact** et historique (§31) : OUI / OUI, SOUS RÉSERVE / NON / IMPOSSIBLE À CONCLURE. Il est stocké avec sa justification et ses items bloquants.
- **Cohérence interne** (validateur ; incohérence ⇒ revue invalide) :
  - OUI ⇒ aucun item `blocking` ;
  - NON ⇒ au moins un item `blocking` cité ;
  - IMPOSSIBLE ⇒ justification qui cite au moins un item `A_REVOIR` ou `NOT_DETERMINABLE` ;
  - OUI SOUS RÉSERVE ⇒ aucun item bloquant et au moins une modification ou réserve citée.
- **Statut probatoire.** Le verdict §31 d'un jumeau est un **constat documentaire** de ce jumeau. Il n'est **jamais** agrégé en verdict P0.1, ni par correspondance 1:1 (CL-INV-10), ni par décompte (CL-INV-03). Un NON documenté est un **signal** examiné en C6 : il ne devient un blocker que s'il établit positivement un BLK-n. Sinon il est consigné dans `examinedNotBlockers`, avec son motif.

## 7. Règle d'agrégation non majoritaire

**Niveau item** : agrégat descriptif, qui ne décide rien.

| Classe | Condition | Effet |
|---|---|---|
| `CONVERGENT_STATUS` | au moins 2 jumeaux **indépendants** (même règle qu'EF-03C : aucune œuvre ni source-graine partagée) déterminables, et tous les déterminables du même statut | statut convergent cité avec ses jumeaux |
| `DIVERGENT` | au moins 2 statuts déterminables distincts | **branches conservées**, jamais tranchées |
| `SINGLE_SOURCE` | 1 seul jumeau déterminable | provisoire, transporté |
| `NOT_COVERED` | 0 jumeau déterminable | gap documentaire, transporté ; jamais un blocker |

Le plancher « 2 indépendants » est le plancher **anti-mono-jumeau contractuel** hérité d'EF-03C. Il ne sert qu'à **qualifier** une convergence, **jamais à décider**.

**Niveau exigence (standing, C5)** : il reprend la politique v1.1 et se fonde sur l'**existence**, jamais sur un nombre.

- `SUPPORTED` / `SUPPORTED_WITH_RESERVATIONS` : il existe **au moins une** preuve `documented` qualifiée DIRECT_SUPPORT ou DIRECT_NEED_EVIDENCE, et aucune preuve positive CONTRADICTORY_EVIDENCE directement pertinente. La seconde classe s'applique si une réserve est à transporter.
- `CONTRADICTED` : **une** preuve positive directement pertinente contredit le contenu de l'exigence. Dix soutiens ne l'« emportent » pas.
- `INSUFFICIENT_EVIDENCE` : aucune preuve documented directement pertinente.

Le moteur ne compte jamais de jumeaux. Le nombre de preuves est **affiché**, jamais **utilisé** (test CL-T-07).

## 8. Traitement des divergences

- Une divergence (item ou exigence) est **conservée** avec ses branches et la lignée de chaque branche. Elle n'est **jamais un blocker par elle-même** (politique §5, `neverBlockers`).
- Elle est transportée : `reservations › openQuestions` si l'exigence est adoptée, `deferredItems` si l'exigence est différée.
- Une divergence sur un item `blocking` est examinée en C6. Elle ne produit NO_GO que si la branche bloquante établit **positivement** un BLK-n (preuve documented, objet cité) **et** qu'aucune preuve positive ne contredit cet objet. Sinon elle reste une divergence transportée. Le registre BLOCKING (propriétaire) peut alors déclarer le besoin bloquant, ce qui mène à INSUFFICIENT_EVIDENCE si la preuve reste insuffisante.

## 9. Conditions des verdicts (évaluées par le MOC ; contenu = politique v1.1)

| Rang | Sortie | Condition (toutes les autres sorties de rang inférieur sont écartées) | Ne dérive jamais de |
|---|---|---|---|
| 0 | `NOT_ADMISSIBLE` (état) | un contrôle de recevabilité échoue : empreintes, canon fermé, ledger sans AWAITING, lignée complète, standing attribué à chaque exigence, aucune exigence canonique INSUFFICIENT ou CONTRADICTED sans reclassement propriétaire, `noVerdictInArtifacts` | — |
| 1 | `P0_1_NO_GO` | au moins un blocker BLK-1 à 4 **positivement établi**, avec preuve et objet | insuffisance, UNKNOWN, réserve, deferred, PROCESS_QUALIFICATION, SCIENTIFICALLY_USABLE, discipline sous-couverte, divergence, concern `cautious_inference`, `not_determinable`, question ouverte, gap |
| 2 | `P0_1_INSUFFICIENT_EVIDENCE` | aucun blocker, et au moins un besoin du **registre BLOCKING** en standing INSUFFICIENT_EVIDENCE | jamais transformé en NO_GO |
| 3 | `P0_1_GO_WITH_RESERVATIONS` | aucun blocker, registre BLOCKING résolu, ensemble de transport **non vide** | — |
| 4 | `P0_1_GO` | aucun blocker, registre BLOCKING résolu, ensemble de transport **vide** (impossible tant qu'existe un DEFERRED_EVIDENCE_GAP : OPD-01) | — |

**Dossier de verdict obligatoire** (C7). Il cite :

- les contrôles de recevabilité ;
- le standing par exigence ;
- les blockers examinés **et écartés** (`examinedNotBlockers`, dont les §31 NON non qualifiés) ;
- le registre appliqué ;
- les mesures EvidenceForge lues, comme **contexte** (§12) ;
- le sha256 du MOC ratifié, le `reportHash` et `gridModelSha256` ;
- la règle de rang déclenchée.

## 10. C8 — Production conditionnelle du P0.2 INPUT CONTRACT

- **Garde.** `buildInputContract(verdictDossier)` **lève** `INPUT_CONTRACT_NOT_AUTHORIZED` si le verdict ∉ `MOC.contractRequiredFor`. Aucune production partielle (CL-INV-07, mutant CL-M02).
- **Contenu**, et rien d'autre : `structuralRequirementsAdopted` (exigences SUPPORTED et SUPPORTED_WITH_RESERVATIONS, avec lignée et items sources), `reservations` (attachées, questions ouvertes, critères non structurels, réserves de processus en tant que **transport**), `deferredItems` (hors P0.1, plus `deferredEvidenceGaps` avec condition de réévaluation), `unknownsToPreserve`, `explicitlyUndecidedRules`. Le schéma est fermé : aucune clé de taxonomie, de seuil, de catégorie ou de règle P0.2 (CL-T-11).
- **Deux formes, un seul objet.** Le JSON est canonique. Le tableau, avec exactement les 8 colonnes de la mission, en est **dérivé** de façon déterministe. Isomorphisme vérifié : mêmes IDs, mêmes cellules, et un aller-retour tableau → JSON qui redonne le même objet (CL-T-12).
- **NO_GO ou INSUFFICIENT_EVIDENCE** : rapport de clôture **sans contrat**. Il contient les points bloquants, les exigences rejetées et non établies, les réserves majeures, les preuves manquantes, les raisons exactes et les conditions factuelles de réévaluation.

## 11. Provenance et lignée

Chaîne de traçabilité de chaque cellule de verdict ou de contrat :

```
verdict → règle de rang (MOC sha) → standings → relations probatoires (C4)
        → assessments d'items (C2, jumeau, passe, prompt sha) → passages littéraux (document sha, bornes)
        → œuvres du jumeau → professionnel (OpenAlex/ORCID) → sources ratifiées → requêtes du plan
        → sceaux (MONO-11 runtimeSeal, runCodeHash), reportHash, gridModelSha256, ledger propriétaire
```

- Nouveaux artefacts scellés : `closure/moc.json`, `grid-model.json`, `item-reviews.jsonl`, `requirements-ledger.json`, `relations.json`, `standing.json`, `verdict-dossier.json`, `input-contract.json|.md` ou `closure-report.json`. Tous sont dans un `SHA256SUMS` de clôture.
- Le rapport final ajoute `missionVerdict` et `missionInputContract | closure` par la composition R-A (`attachToReport`). `stage-report.js` reste inchangé.
- Le registre des revues d'items réutilise la liaison d'identité de v1.0.16 : cible, autorité normalisée, contrat, sceau, et en plus `gridModelSha256`. Une réponse d'un autre modèle de grille n'est jamais réutilisée.

## 12. Démonstration : aucun mapping PROCESS_QUALIFICATION / SCIENTIFICALLY_USABLE → verdict

1. **Signature.** `computeVerdict({ moc, gridModel, standings, blockers, blockingRegistry, transportSet })` n'a **aucun** paramètre de qualification. Les mesures de processus n'entrent que dans `contextMeasures`, que la fonction de verdict **ne reçoit pas**. Elles sont jointes au dossier **après** le calcul.
2. **Flux de données.** `qualification.json` et `headline` ne sont lus que par `buildVerdictDossier().context`. Un graphe d'imports, vérifié par test, montre qu'aucun module C5 à C7 n'importe `stage-report`, ne lit `qualification.json` et ne référence `headline`.
3. **MOC.** `forbiddenCorrespondences` est obligatoire, et un MOC dont une règle référence un champ de processus est refusé (CL-T-03).
4. **Métamorphique (CL-T-04).** Pour un dossier fixe, les 4 × 2 combinaisons de PROCESS_QUALIFICATION × SCIENTIFICALLY_USABLE, et les variations de `readiness` et de réserves de processus, donnent un verdict **identique**. Contre-exemples obligatoires : un dossier `QUALIFIED_WITH_RESERVATIONS` produit chacun des 4 verdicts selon les seuls standings et blockers ; `SCIENTIFICALLY_USABLE = NO` n'empêche ni GO ni GO_WR.
5. **Mutants (CL-M04, CL-M05).** Injecter « QUALIFIED_WITH_RESERVATIONS ⇒ GO_WR » ou « SCIENTIFICALLY_USABLE = NO ⇒ NO_GO » doit faire échouer CL-T-04.
6. **Ce que dit le rapport.** Le verdict est **documentaire**, rendu par des jumeaux et non par des professionnels réels. `SCIENTIFICALLY_USABLE` reste affiché **à côté**, sur un axe distinct, jamais fusionné (cf. D-C6).

## 13. Critères d'acceptation (CA)

| ID | Critère |
|---|---|
| CA-01 | **Parité gouvernée (test d'or).** En entrée : canon `af863c98…`, mapping probatoire v1.1 `bc77e74e…`, ledger `d2fdf53b…`, et un MOC = politique v1.1. C5 à C8 recalculent **`P0_1_GO_WITH_RESERVATIONS`** et un contrat **égal**, à la normalisation de forme près, à `D103-P0.2-INPUT-CONTRACT-v1.json` (`44f1ec73…`) : 13 exigences, 5 classes. Fixture lue en lecture seule, par variable d'environnement (CL-INV-12). |
| CA-02 | Rejeu historique : avec la politique **v1** (`80103272…`), le moteur rend **`NOT_ADMISSIBLE`** comme le verdict-v1 historique (`685b1644…`). Le défaut de disposition est reproduit puis corrigé par v1.1. |
| CA-03 | 0 lot gelé modifié ; EF-03B gelé inchangé ; `stage-report.js` inchangé. |
| CA-04 | Aucun verdict sans MOC ratifié : `missionVerdict = { status: "NOT_DECLARED" }`, et R-A affiche les capacités NOT_PRODUCED_BY_DESIGN. |
| CA-05 | Un item `REVIEW_ITEM` omis par un jumeau rend la revue invalide (reprise, puis erreur) ; jamais un statut par défaut. |
| CA-06 | Littéralité et œuvres : 0 citation non littérale acceptée ; contrôle identique au lot gelé. |
| CA-07 | Unicité : un seul verdict ∈ `MOC.verdictVocabulary`, ou NOT_ADMISSIBLE. |
| CA-08 | Le contrat existe ssi le verdict ∈ `contractRequiredFor` ; tableau ⇄ JSON isomorphes. |
| CA-09 | Toute cellule du contrat et toute ligne de standing remontent à au moins un passage littéral et une décision propriétaire datée (lignée complète). |
| CA-10 | Recalcul hors ligne byte-identique (C5 à C8) depuis les artefacts scellés, 0 appel. |
| CA-11 | `missionDeliverables` (R-A) : pour un run avec MOC ratifié, les 4 capacités sont PRODUCED avec preuve sur les artefacts C7 et C8 ; sans MOC, comportement v1.0.17 strictement inchangé. |
| CA-12 | Micro-smoke réel borné (sous OWNER GATE, plafond fixé par le propriétaire) **avant** tout run complet : coût C2 **mesuré** par jumeau et par lot de section. Aucune estimation n'est présentée comme une mesure. Référence mesurée : TWINS_REVIEWS du run `77f94b06` = 6,316 USD pour 14 revues de dossier. |

## 14. Tests

**Nouveaux** (CL-T, à écrire avec le lot) :

- **CL-T-01** extraction de grille déterministe ;
- **CL-T-02** porte RATIFY_GRID_MODEL (refus sans acte, empreinte liée) ;
- **CL-T-03** validation du MOC (interdits obligatoires, champs de processus refusés) ;
- **CL-T-04** invariance métamorphique (§12) ;
- **CL-T-05** complétude et cohérence §31 ;
- **CL-T-06** agrégation par item (4 classes, branches conservées) ;
- **CL-T-07** standing existentiel (le nombre de preuves ne change jamais la classe ; une contradiction positive l'emporte) ;
- **CL-T-08** blockers à preuve positive (chaque `neverBlocker` est testé) ;
- **CL-T-09** ordre de priorité (une fixture par rang) ;
- **CL-T-10** OPD-01 (GO impossible avec un DEFERRED_EVIDENCE_GAP) ;
- **CL-T-11** schéma fermé du contrat (aucune clé de taxonomie ni de seuil) ;
- **CL-T-12** isomorphisme tableau ⇄ JSON ;
- **CL-T-13** garde du contrat (NO_GO et INSUFFICIENT ⇒ exception, rapport de clôture complet) ;
- **CL-T-14** parité gouvernée (CA-01) ;
- **CL-T-15** rejeu politique v1 ⇒ NOT_ADMISSIBLE (CA-02) ;
- **CL-T-16** lignée complète (CA-09) ;
- **CL-T-17** rejeu hors ligne (CA-10) ;
- **CL-T-18** identité de réutilisation C2 (`gridModelSha256`) ;
- **CL-T-19** anti-hardcoding (vocabulaires seulement dans le MOC) ;
- **CL-T-20** interface (porte RATIFY_GRID_MODEL, matrice, verdict, contrat).

**Non-régression** (NR) :

- **NR-01** les 367 tests v1.0.17 et 10 tests navigateur v1.0.17 restent verts ;
- **NR-02** sans MOC, rapport et `missionDeliverables` byte-identiques à v1.0.17 pour un même run seedé ;
- **NR-03** EF-03B, EF-03C et l'agrégation par dimension sont inchangés (sorties byte-identiques sur fixtures) ;
- **NR-04** lots gelés à 0 divergence ;
- **NR-05** les portes historiques (CONFIRM_PLAN, RATIFY_SOURCES, ECONOMIC_REVIEW) sont byte-identiques ;
- **NR-06** les rapports importés v1.0.16 et v1.0.17 se vérifient toujours.

**Mutants** (CL-M) :

| Mutant | Doit être tué par |
|---|---|
| CL-M01 standing par décompte (majorité de soutiens) | CL-T-07 |
| CL-M02 contrat produit malgré NO_GO | CL-T-13 |
| CL-M03 divergence transformée en blocker | CL-T-08 |
| CL-M04 QUALIFIED_WITH_RESERVATIONS ⇒ GO_WR | CL-T-04 |
| CL-M05 SCIENTIFICALLY_USABLE = NO ⇒ NO_GO | CL-T-04 |
| CL-M06 §31 NON ⇒ NO_GO direct | CL-T-08 et CL-T-05 |
| CL-M07 disposition `support` ⇒ DIRECT_SUPPORT | CL-T-14, qui retombe sur le défaut v1 |
| CL-M08 item omis rempli par défaut | CL-T-05 |
| CL-M09 MOC non ratifié accepté | CL-T-03 |
| CL-M10 OPD-01 ignoré | CL-T-10 |

## 15. Décisions du propriétaire requises avant tout codage

| ID | Question | Recommandation |
|---|---|---|
| D-C1 | Le MOC de référence est-il la politique v1.1 telle quelle ? | Oui : c'est la seule politique auditée PASS |
| D-C2 | Modèle d'items : extraction déterministe + ratification (porte), ou liste d'items fournie par le propriétaire ? | Extraction + ratification (la mesure montre que le lexical seul ne suffit pas) |
| D-C3 | Canonicalisation des exigences (C3) : portes humaines par lots, comme le 19/09 ? | Oui, par lots de 3 |
| D-C4 | Relations probatoires (C4) : passe LLM contrainte puis revue humaine, ou humaine seule ? | LLM contrainte (citation obligatoire, schéma fermé) + validation humaine par lot ; la décision humaine ne remplace jamais la preuve |
| D-C5 | Couverture du noyau professionnel (kiné, APA, sciences de l'exercice, MPR) : simple contexte transporté (politique v1.1, § 7), ou condition de recevabilité ? | Contexte transporté (v1.1) ; tout durcissement passe par une décision explicite inscrite au registre BLOCKING |
| D-C6 | Un `P0_1_GO` documentaire exige-t-il une validation professionnelle humaine **séparée** (axe distinct, jamais dérivé de SCIENTIFICALLY_USABLE) ? | À décider ; si oui, ce sera un champ du MOC (`humanValidationRequiredFor`), évalué sur l'acte humain lui-même |
| D-C7 | Plafond du micro-smoke C2 | Fixé par le propriétaire (OWNER GATE) |
| D-C8 | Rejouer C2 sur les jumeaux et corpus scellés d'un run existant (mêmes professionnels, nouveau schéma), ou faire un nouveau run complet ? | Rejeu sur le checkpoint professionnel scellé (pas de nouvelle recherche, pas de nouveau panel) ; à confirmer, car c'est un nouveau coût fournisseur |

## 16. Hors périmètre

Taxonomie P0.2, règles métier, seuils, prescriptions, profils S01/S02, logique médicale. Toute modification des revues EF-03B existantes. Tout verdict sur un run passé sans C2.

**Aucun code n'est écrit pour ce lot. STOP pour audit indépendant.**
