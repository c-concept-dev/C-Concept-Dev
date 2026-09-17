# MONO-10 v0.3 — Ordre d'exécution

Ordre **normatif**. Chaque étape nomme le module livré qui l'exécute, ce qu'elle
exige, et ce qui l'arrête. Toutes les barrières sont *fail-closed* : en cas de
doute, on s'arrête, on ne présume pas.

| # | Étape | Module livré | Exige | S'arrête si |
|---|---|---|---|---|
| 0 | Ouvrir le run | `core/run-evidence-manifest.js` | `runId`, `executionMode` honnête | `executionMode` absent ou manifeste incohérent |
| 1 | Découverte professionnelle | adaptateur de base **injecté** | — | — |
| 2 | Vérification documentaire | adaptateur de base **injecté** | — | — |
| 3 | Évaluation des candidats | `core/candidate-assessment.js` | découverte + vérification + libellés de mission | schémas d'entrée invalides ; lignée de candidat absente |
| 4 | Gabarit de porte humaine | `core/panel-gate.js` | évaluation liée | aucun candidat présentable |
| 5 | **Décision humaine** | *hors moteur* | un humain remplit chaque décision | ⚠️ **jamais simulée, jamais pré-remplie, jamais déduite** |
| 6 | Validation de la porte | `core/panel-gate.js` | décisions exhaustives et liées | liaison obsolète ; `APPROVE` sur identité `AMBIGUOUS` ; décision manquante |
| 7 | Dérivation de l'éligibilité | `core/effective-eligibility.js` | statut amont + décision humaine | `candidateId` absent |
| 8 | Fermeture de la porte à l'exécution | **`core/panel-gated-adapter.js`** | porte validée | `PANEL_GATE_MISSING` ; `ELIGIBILITY_NOT_DERIVED` |
| 9 | Construction du corpus | adaptateur de base, **via la porte** | uniquement les éligibles | un non-éligible atteindrait le corpus |
| 10 | Constat de capacité LLM | `core/llm-capability.js` | transport **injecté** | schéma de sonde invalide ; clé dupliquée ; attestation d'identifiant absente |
| 11 | Préparation PRE | `core/scientific-readiness.js` | artefacts amont + registre de lignée | dimension insatisfaite ; inconnu bloquant |
| 12 | Étapes aval (jumeaux, revues, agrégats) | adaptateurs **injectés** | corpus fermé par la porte | — |
| 13 | Préparation FULL | `core/scientific-readiness.js` | artefacts aval | idem étape 11, plus les quatre dimensions FULL |
| 14 | Qualification du processus | `core/scientific-qualification.js` | artefacts **sources** | divergence au recalcul ; lignée non résolue ; inconnu bloquant |
| 15 | Rapport unifié additif | `core/scientific-unified-report.js` | rapport antérieur + qualification | missions différentes ; runs différents ; lignée non résolue |
| 16 | Gabarit d'acceptation | `core/final-report-acceptance.js` | rapport unifié | rapport absent |
| 17 | **Acceptation humaine** | *hors moteur* | un humain décide | ⚠️ **jamais simulée** |
| 18 | Validation de l'acceptation | `core/final-report-acceptance.js` | le rapport **concret** | rapport absent ; contenu présenté différent ; champ interdit présent |
| 19 | Autorisation d'usage aval | `core/downstream-authorization.js` | qualification + sources + rapport + acceptation | revalidation impossible ou divergente ; chaîne d'inconnu altérée |
| 20 | Traduction vers un cas | `adapters/case-phase-adapter.js` | nom de phase fourni **par le cas** | nom de phase absent |

## Points où un humain — et seulement un humain — décide

- **Étape 5** : approuver, rejeter ou différer chaque candidat présenté.
- **Étape 17** : accepter le rapport, l'accepter avec réserves, ou le renvoyer.

Le moteur produit des gabarits dont **tous** les champs de décision valent `null`,
et refuse toute décision dont `actorType !== "human"`, dont `actorIdentity` est
vide, ou dont `decidedAt` n'est pas un horodatage réel.

## Ce que cet ordre n'autorise pas

- Sauter l'étape 8 : l'étape 9 refuse une vérification qui n'a pas traversé la porte.
- Présenter une PRE (étape 11) là où une FULL (étape 13) est exigée.
- Présenter à l'étape 14 une préparation plus favorable que le recalcul.
- Faire de l'étape 19 une simple lecture de l'étape 14.
