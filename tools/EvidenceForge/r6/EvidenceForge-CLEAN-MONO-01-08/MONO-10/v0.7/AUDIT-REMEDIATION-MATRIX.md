# MONO-10 v0.7 — matrice de remédiation

## 1. Reproduction avant correction (§2)

Chaque constat de l'audit A indépendant de v0.6 a été **reproduit sur le lot
historique v0.6, chargé en lecture seule**, avant toute correction.

| Constat | Reproduction sur v0.6 | Fermeture v0.7 |
|---|---|---|
| **B1** `legacyVerificationGrantsEligibility` | REPRODUIT — corpus `["c-2"]` alors que le panel avait REJETÉ `c-1` ; `c-2` était `INSUFFICIENT_DOCUMENTARY_BASIS`, jamais présenté | option supprimée ; état `ELIGIBLE_BY_LEGACY_VERIFICATION` supprimé ; politique liste blanche `narrowOnly` |
| **B2** `historicalInputContract.operatorAuthenticated` | REPRODUIT — `resolved = true` avec un booléen écrit par l'appelant | `OperatorHistoricalInputAuthority` provisionnée ; neuf champs engagés ; contrat d'appelant ignoré et signalé |
| **B3** rejeu par seconde frontière | REPRODUIT — frontière A consomme, frontière B accepte | `replayNamespaceId` dérivé ; répertoire refusé ; marqueur de réserve ; registre de processus ; namespace engagé par le descripteur |
| **B4** FULL synthétique à références empruntées | REPRODUIT — ACCEPTÉ, références emprutées à `candidateAssessment` | `DIMENSION_EXPECTED_RELATIONS` ; relation lue sur le registre ; phase **dérivée** |
| **B5** pont affirmant `CONFIRMED`/`VERIFIED` | REPRODUIT — `contribution: 0.6` sur un identifiant nommé « jamais-verifie » | assertion `UNKNOWN`, contribution `0`, `OUTPUT <= INPUT` |
| **B6** ambiguïté silencieuse | REPRODUIT — 1 référence pour 2 contenus, `ambiguous` inexistant | multimap ; `ambiguous[]` ; aucune référence produite ; ambiguïté propagée au candidat |
| **M7** `elevate(hash arbitraire)` | REPRODUIT — `BOUND_TO_RUN → PRODUCTION_CAPABILITY_PROVED` ; 0 consommateur critique de `assertAtLeast` | échelle supprimée ; capacités typées émises par l'autorité compétente ; trois sinks les exigent réellement |
| **M8** garde doc/code inopérante | REPRODUIT — 0 test lisant un document | source canonique machine-lisible ; code importé ; documents validés ; mutation de document testée |

**8 constats sur 8 reproduits, 8 fermés.**

## 2. Constats supplémentaires traités

| Constat | Origine | Traitement |
|---|---|---|
| `trusted` échappait au motif de la liste noire | audit v0.6, mineur | liste blanche : le nom des attaques n'a plus à être devine |
| statut de clé absent ou nul valait `ACTIVE` | audit v0.6, mineur | `KEY_STATUS_INVALID` (§38) |
| indépendance de sources auto-déclarée | audit v0.6, observation non déclarée | `EvidenceProvenanceAuthority` ; racines résolues, déclaration consignée sans effet |
| preuve non authentifiée présentable à un humain | trouvé pendant cette construction | l'évaluation écarte les références non authentifiées ; le candidat devient `INSUFFICIENT_DOCUMENTARY_BASIS` |

## 3. Erreurs diagnostiquées comme erreurs de test, produit laissé intact

| Symptôme | Diagnostic |
|---|---|
| `T41` exigeait `independentProviders === 0` | l'assertion pertinente est l'absence de relation `INDEPENDENT` ; `MODERATE` est le résultat honnête |
| `M19` déclarait l'attaque non pertinente | le registre de processus n'avait pas été amorcé pour le couple testé |
| `I-13` attendait un corpus partiel | le comportement réel est plus strict : une décision manquante invalide la porte entière |
| `I-19` cherchait « oeuvre-3 » dans un identifiant d'artefact | l'identifiant est local ; c'est la **racine** portée par l'artefact qu'il faut vérifier |
| `READINESS_BINDINGS_MISMATCH` sur la chaîne nominale | le producteur des liaisons venait du contexte à la création et manquait à la revalidation ; il est désormais lu sur l'entrée enregistrée |

## 4. Une dérive détectée par la garde elle-même

Pendant la rédaction, `T44` a signalé que `UPSTREAM-EVIDENCE-BINDING.md`
documentait deux valeurs (`VERIFIED`, `UNVERIFIED`) absentes de l'énumération
`upstreamAssertionStates`. Le document a été corrigé. C'est la garde qui a
trouvé l'erreur, avant tout auditeur.

## 5. Mesures

| Mesure | Valeur |
|---|---|
| Tests adversariaux | 126 PASS / 0 FAIL |
| Mutations | 54 / 54 |
| Intégration hors ligne (vrai consumer MONO-09 v0.2) | 28 PASS / 0 FAIL |
| Domaines d'universalité | 6 / 6 |
| Termes de cas / domaine / fournisseur dans le code actif | 0 / 0 / 0 |
| Clés d'affaiblissement refusées | 31 / 31 |
| Lots historiques modifiés | 0 |
