# Gouvernance

`EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md` est le **document directeur**
du projet. Il prime sur toute commodité locale et sur toute dérive liée au cas
d'usage courant.

SHA-256 de la copie incluse :
`b4c160d008c33dd338979afd247945fee8dab862c96e0d1f2841c9ad87596a85`

Copie **conforme et non modifiée** de l'original fourni par le propriétaire.

| Article | Exigence | Où elle s'exerce dans v0.7 |
|---|---|---|
| §9 | l'humain valide identité et admissibilité, jamais la vérité | `core/panel-gate.js` |
| §10 | *unknown remains unknown* | `core/unknowns.js` |
| §12 | qualité du processus ≠ contenu du verdict | `core/scientific-qualification.js` |
| §13 | qualification additive, jamais réécrite | `core/scientific-unified-report.js` |
| §14 | capacité LLM réelle, jamais déclarative | `core/llm-capability.js` |
| §15 | interdiction absolue de fabrication | `core/human-act.js`, `core/evidence-source-provenance.js` |
| §16 | lineage obligatoire | `core/lineage.js` |
| §17 | fail-closed | `core/operator-trust-boundary.js` et tout le noyau |
| §19 | le statut de gel ne relève pas de l'implémenteur | `AUDIT-REMEDIATION-MATRIX.md` |
| §22 | non-régression mesurable | `NON-REGRESSION.md` |
| §24 | aucune dette bloquante silencieuse | `THREAT-MODEL.md` §4 |
| §27 | indépendance au fournisseur | `adapters/` |
| §29 | une propriété déclarée n'est pas une preuve | `core/operator-trust-verifier.js`, `core/human-act-proof.js` |
| §15 | aucun identifiant fabriqué | `adapters/upstream-evidence-binder.js` — une source sans identifiant fort ne reçoit aucune référence |
| §16 | arêtes de lignée typées | `core/lineage.js` — `ARTIFACT_TYPE_OF_RELATION` |
| §17 | rien n'est cru au point d'effet | `core/panel-gated-adapter.js`, `core/operator-acceptance-boundary.js` |
| §22 | la non-régression est exécutée, pas racontée | `test/test-mono10-v0.7.js` — `NR-01`, `NR-02` |
| §9 | l'humain valide l'admissibilité, et rien ne le remplace | `core/effective-eligibility.js` — décision absente ⇒ `NOT_ELIGIBLE` |
| §10 | *AMBIGUOUS reste AMBIGUOUS* | `adapters/upstream-evidence-binder.js` — un identifiant ambigu n'est jamais résolu |
| §15 | aucune preuve, aucune force de preuve fabriquée | le pont amont rend `UNKNOWN` et une contribution nulle |
| §29 | un booléen, un hash, une chaîne ne sont pas des autorités | `core/caller-assertion-guard.js`, `core/artifact-capabilities.js` |
| §24 | aucune dette bloquante silencieuse | `README.md` — trois hypothèses déclarées |
