# MONO-10 v0.4 — Ordre d'exécution

Ordre **normatif**. Toutes les barrières sont *fail-closed* : en cas de doute, on
s'arrête, on ne présume pas.

| # | Étape | Module livré | Exige | S'arrête si |
|---|---|---|---|---|
| 0 | **Configurer les ancrages de confiance** | *hors lot — exploitant* | clés publiques des autorités, par mode | aucun ancrage : rien n'est authentifiable |
| 1 | **Obtenir une attestation de run** | *hors lot — autorité runtime* | `runId`, `nonce`, `missionHash`, `producerId/Version`, échéance | l'autorité n'est pas ancrée pour ce mode |
| 2 | Ouvrir le manifeste | `core/run-evidence-manifest.js` | attestation **vérifiée** | signature, mode, mission ou échéance invalides |
| 3 | Découverte professionnelle | adaptateur **injecté** | — | — |
| 4 | Vérification documentaire | adaptateur **injecté** | — | — |
| 5 | Évaluation des candidats | `core/candidate-assessment.js` | découverte, vérification, libellés, registre d'autorités | schémas invalides |
| 6 | Gabarit de porte humaine | `core/panel-gate.js` | évaluation liée au run | aucun candidat présentable |
| 7 | **Décision humaine** | *hors moteur* | un humain remplit chaque décision | ⚠️ **jamais simulée, jamais pré-remplie** |
| 8 | Validation de la porte | `core/panel-gate.js` | décisions exhaustives, liées, **authentifiées** | liaison obsolète ; `evidenceRefs` réécrites ; acte non authentifié ; `APPROVE` sur identité `AMBIGUOUS` |
| 9 | Dérivation de l'éligibilité | `core/effective-eligibility.js` | décision + authenticité | `DEFER`/`REJECT`/porte absente ⇒ jamais éligible |
| 10 | Fermeture de la porte | **`core/panel-gated-adapter.js`** | porte validée | `PANEL_GATE_MISSING` ; `ELIGIBILITY_NOT_DERIVED` |
| 11 | Construction du corpus | adaptateur, **via la porte** | uniquement les éligibles | un non-éligible atteindrait le corpus |
| 12 | Étapes aval (jumeaux, revues, agrégats) | adaptateurs **injectés** | corpus fermé par la porte | — |
| 13 | Constat de capacité LLM | `core/llm-capability.js` | transport **injecté** + run attesté | schéma invalide ; clé dupliquée ; attestation d'identifiant absente ; sonde d'un autre run |
| 14 | Préparation PRE | `core/scientific-readiness.js` | artefacts amont + registre typé | dimension insatisfaite ; inconnu bloquant ; lignée non résolue |
| 15 | Préparation FULL | `core/scientific-readiness.js` | artefacts aval | idem, plus les quatre dimensions FULL |
| 16 | Qualification du processus | `core/scientific-qualification.js` | artefacts **sources** | attestation absente en production ; divergence au recalcul ; dimension non sourcée |
| 17 | Rapport unifié additif | `core/scientific-unified-report.js` | rapport antérieur + qualification | missions, runs ou attestations différents |
| 18 | Gabarit d'acceptation | `core/final-report-acceptance.js` | rapport unifié | rapport absent |
| 19 | **Acceptation humaine** | *hors moteur* | un humain décide | ⚠️ **jamais simulée** |
| 20 | Validation de l'acceptation | `core/final-report-acceptance.js` | rapport **concret** | contenu présenté différent ; acte non authentifié ; champ interdit |
| 21 | Autorisation d'usage aval | `core/downstream-authorization.js` | qualification + sources + rapport + acceptation | revalidation impossible ou divergente ; confiance non vérifiée |
| 22 | Traduction vers un cas | `adapters/case-phase-adapter.js` | nom de phase fourni **par le cas** | nom absent |

## Les deux points où un humain — et seulement un humain — décide

- **Étape 7** : approuver, rejeter ou différer chaque candidat présenté.
- **Étape 19** : accepter le rapport, l'accepter avec réserves, ou le renvoyer.

Le moteur produit des gabarits dont **tous** les champs de décision valent
`null`. En production, la décision doit en outre être validée par un mécanisme
d'authentification injecté : sans lui, `NOT_AUTHENTICATED`, fail-closed.

## Ce que cet ordre n'autorise pas

- Sauter l'étape 0 ou 1 : sans ancrage ni attestation, rien n'est authentifié.
- Sauter l'étape 10 : l'étape 11 refuse une vérification qui n'a pas traversé la porte.
- Présenter une PRE (14) là où une FULL (15) est exigée.
- Présenter à l'étape 16 une préparation plus favorable que le recalcul.
- Faire de l'étape 21 une simple lecture de l'étape 16.
- Désactiver par politique l'un des cinq contrôles non négociables.
