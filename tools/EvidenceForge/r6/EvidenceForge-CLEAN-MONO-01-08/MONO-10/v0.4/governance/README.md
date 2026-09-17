# Gouvernance

`EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md` est le **document directeur**
du projet. Il prime sur toute commodité locale, tout raccourci d'implémentation
et toute dérive liée au cas d'usage courant.

SHA-256 de la copie incluse :
`b4c160d008c33dd338979afd247945fee8dab862c96e0d1f2841c9ad87596a85`

Ce fichier est une **copie conforme** de l'original fourni par le propriétaire.
Il n'a pas été rédigé, complété ni reformulé par l'implémenteur. Lors de la
livraison de MONO-10 v0.3, la charte était absente de l'espace de travail : elle
n'a pas été fabriquée, et son absence a été déclarée comme dette d'emballage.

Articles directement exercés par ce lot :

| Article | Exigence | Où |
|---|---|---|
| §10 | *unknown remains unknown* | `core/unknowns.js` |
| §13 | qualification additive, jamais réécrite | `core/scientific-unified-report.js` |
| §14 | capacité LLM réelle, jamais déclarative | `core/llm-capability.js` |
| §15 | interdiction absolue de fabrication | `core/human-act.js`, `core/identity-evidence.js` |
| §16 | lineage obligatoire | `core/lineage.js` |
| §17 | fail-closed | tout le noyau |
| §19 | gouvernance des rôles — le statut de gel ne relève pas de l'implémenteur | `AUDIT-REMEDIATION-MATRIX.md` |
| §22 | non-régression mesurable | `NON-REGRESSION.md` |
| §24 | aucune dette bloquante silencieuse | `THREAT-MODEL.md` §4 |
| §27 | indépendance au fournisseur | `adapters/` |
