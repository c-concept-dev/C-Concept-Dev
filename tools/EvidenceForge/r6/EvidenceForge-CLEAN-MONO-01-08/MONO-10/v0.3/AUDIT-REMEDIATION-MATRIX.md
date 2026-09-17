# MONO-10 v0.3 — Matrice de remédiation des audits A et B

Chaque ligne : le constat, sa **reproduction** dans le lot v0.2 historique, la
fermeture livrée en v0.3, et le test qui l'atteste. Les lots v0.1 et v0.2 sont
**HISTORIQUES** et n'ont pas été touchés : ils servent ici de variante
« défense désactivée » pour les mutations différentielles `MUT-D*`.

## Audit A

| # | Constat | Reproduit en v0.2 | Fermeture v0.3 | Preuve |
|---|---|---|---|---|
| A-01 | L'adaptateur à porte n'est pas livré — il n'existe que dans un test | oui (`v0.2/core/panel-gated-adapter.js` absent) | `core/panel-gated-adapter.js` livré, exporté, consommé par l'intégration | T22, MUT-D12, I-05 |
| A-02 | Le statut de vérification amont est réécrit par une décision humaine | oui (aucune séparation de champs) | `legacyVerificationStatus` / `humanPanelDecision` / `effectiveCorpusEligibility` | T23, T24, MUT-D13, I-06 |
| A-03 | Le blanchiment de fixture fonctionne | oui (`assertProductionEvidence` accepte l'artefact réétiqueté) | `RunEvidenceManifest` + `runBinding` à empreinte croisée | T01–T05, MUT-D06, MUT-L01, I-23 |
| A-04 | L'indépendance des sources est présumée | oui (`STRONG` sur deux préfixes de protocole) | `sourceAuthorityId` / `sourceFamilyId` déclarés ; `INDEPENDENCE_UNKNOWN` sinon | T06–T08, MUT-D04 |
| A-05 | Une référence de lignée n'est jamais résolue | oui (empreinte `000…0` acceptée) | `resolveLineage` contre un registre d'artefacts disponibles | T17–T20, MUT-D03, I-09 |
| A-06 | Un nom seul obtient `MODERATE` | oui | `display-name` ne contribue jamais ; plafond `WEAK` | T09, MUT-D05 |

## Audit B

| # | Constat | Fermeture v0.3 | Preuve |
|---|---|---|---|
| B-02 | L'indépendance dérive de `provider ‖ evidenceType` | modèle d'autorité/famille déclarée | T06–T08 |
| B-03 | La décision humaine n'est pas liée à tout ce qu'elle valide | `missionHash`, `candidateAssessmentHash`, refs découverte/vérification, `evidenceRefsHash`, `candidateBindingHash` — tous recalculés | T21, MUT-L06 |
| B-05 | La classe d'exécution est auto-déclarée | la provenance vient du manifeste de run | T01–T05 |
| B-06 | La lignée est seulement « non vide » | résolution réelle | T17–T20 |
| B-07 | Un statut d'inconnu forcé fait disparaître un bloquant | statut **dérivé** de `transitions[]` ; `UNKNOWN_STATUS_FORGED` | T11, MUT-D02 |
| B-08 | Une transition d'inconnu sans preuve est acceptée | motif **et** `evidenceRefs` obligatoires | T12 |
| B-09 | La fusion garde arbitrairement la première version | chaîne reconstruite ; blocage le plus sévère conservé ; fork détecté | T14, T15 |
| B-10 | Des inconnus disparaissent en aval | `assertNoSilentLoss` à chaque étape | T16, I-26 |

## Points §1–§19 du mandat v0.3

| § | Exigence | Livré dans | Preuve |
|---|---|---|---|
| §1 | Adaptateur à porte livré hors tests | `core/panel-gated-adapter.js` | T22, I-05 |
| §2 | Ne jamais muter le statut de vérification historique | `core/effective-eligibility.js` | T23, I-06 |
| §3 | Éligibilité dérivée, explicite, motivée | `deriveEffectiveEligibility` | T24, I-06 |
| §4 | L'indépendance se démontre | `core/identity-evidence.js` | T06–T08 |
| §5 | Un nom seul plafonne à `WEAK` | idem | T09 |
| §6 | Liaison complète de la décision humaine | `core/panel-gate.js` | T21, MUT-L06 |
| §7 | Provenance d'exécution vérifiable | `core/run-evidence-manifest.js` | T01–T05 |
| §8 | Une fixture ne devient jamais réelle par réétiquetage | idem | T01, MUT-L01, I-23 |
| §9 | PRE et FULL distinctes ; PRE-comme-FULL rejetée | `core/scientific-readiness.js` | T32, T33, MUT-L02, I-12 |
| §10 | Lignée résolue | `core/lineage.js` | T17–T20 |
| §11 | Statut d'inconnu dérivé | `core/unknowns.js` | T11 |
| §12 | Transition motivée **et** prouvée | idem | T12, T13 |
| §13 | Inconnus pris aux artefacts sources | `core/scientific-qualification.js` | T34 |
| §14 | Clés JSON dupliquées détectées avant analyse | `core/llm-capability.js` | T28, MUT-D01 |
| §15 | `credentialProbeSkipped === false` exigé ; absence ⇒ rejet | idem | T29, MUT-D07 |
| §16 | `workerBindingId` / `providerId` / `modelId` comparés | idem | T30, MUT-D08 |
| §17 | L'autorisation aval revalide toutes ses entrées | `core/downstream-authorization.js` | T36, MUT-L03 |
| §18 | Rapport lié à une qualification et un run uniques | `core/scientific-unified-report.js` | I-16 |
| §19 | L'acceptation exige un rapport concret résolu | `core/final-report-acceptance.js` | T35, MUT-L04, I-19 |

## Ce que la v0.3 ne prétend pas

- Aucun run réel n'a été exécuté : `NETWORK_CALLS = 0`, `REAL_LLM_CALLS = 0`,
  `REAL_EF02_RUNS = 0`, `REAL_PROFESSIONAL_RUNS = 0`.
- Le test d'intégration déclare honnêtement `executionMode = TEST`, et prouve
  en fin de chaîne que cette même exécution **ne peut pas** être présentée comme
  une preuve de production.
- La qualité du processus n'est pas le contenu d'un verdict. Un processus
  `QUALIFIED` ne dit rien de la justesse d'une conclusion.
