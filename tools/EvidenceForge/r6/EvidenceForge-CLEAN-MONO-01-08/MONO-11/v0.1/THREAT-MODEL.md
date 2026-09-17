# MONO-11 v0.1 — Modèle de menace

## Adversaire

Un appelant qui veut faire entrer au panel un candidat sans preuve, faire passer un acte machine pour un acte humain, faire lire au gate un verdict attendu, ou altérer un lot gelé sans être vu.

## Classes fermées, et par quoi

| Attaque | Fermeture | Test |
|---|---|---|
| admission sans pertinence réelle (overlap lexical, libellé de requête) | `RelevanceEvidence.relevanceClass === SUPPORTED` requis, dérivée de jugements EF-02D2 avec preuves attribuées ; invariant `GATE_INVARIANT_VIOLATION` si approbation sans SUPPORTED | T01, T09, T24 |
| admission sur ORCID / citations / statut amont | le gate ne lit pas ces champs ; corpus attribué requis | T13, T14 |
| corpus non attribué (œuvres d'un homonyme) | attribution prouvée par l'adaptateur sur chaque œuvre ; absente ⇒ `UNKNOWN` ⇒ `INSUFFICIENT` | T13, T27 |
| identité ambiguë admise | `AMBIGUOUS` terminal ; override humain refusé ; MONO-10 refuse aussi `APPROVE` sur AMBIGUOUS | T02, T28 |
| acte machine déguisé en humain | `actorType: "machine"` + `notAHumanAct` ; `human-act.js` (gelé) refuse ; MONO-11 ne mint aucun `HumanActProof` | T17, T18 |
| override humain fabriqué | validé par `validatePanelValidation` (MONO-10) : acte authentifié par la frontière, preuves résolues, `HUMAN_AUTHENTICATED` | T17, T28 |
| gate influencé par l'aval | `GATE_SEES_DOWNSTREAM` sur toute clé aval | T26 |
| oracle hors contrat (dimension manquante, JSON cassé, référence inventée) | parseur gelé + classe `UNKNOWN` | T24, T25 |
| LLM déclaré mais non prouvé | capacité certifiée par sonde réelle via la frontière (`PRODUCTION_LLM_CAPABILITY`) ; un booléen ⇒ `NOT_QUALIFIED` | T23 |
| artefact MONO-11 modifié après enregistrement | ledger append-only, hash chaîné, `verifyChain` recalcule chaque artefact | T15 |
| lot gelé altéré | `verifySeal` avant chargement ⇒ `FROZEN_LOT_ALTERED` | T20 |
| pipeline vide présenté comme succès | 0 admis ⇒ `FAIL_CLOSED_NO_ADMITTED_PROFESSIONAL` ; 0 jumeau ⇒ `FAIL_CLOSED_NO_TWIN` ; qualification `NOT_QUALIFIED` | T21, T22 |

## Ce que le lot ne prétend pas

- il ne prouve pas qu'un jugement de pertinence est **vrai** : il prouve qu'il a été rendu par un modèle réel, sur des œuvres attribuées, en citant des références exactes, et qu'il est rejouable par hash ;
- il n'authentifie pas un acte machine par une signature de la frontière : l'authenticité tient à la liaison au run attesté (manifeste), au registre MONO-10 (racine à l'ouverture du ledger) et au hash du module de gate ; c'est une **dette déclarée** (voir `MANIFEST.json > debts`) ;
- il ne corrige pas les réserves amont du cas courant (screening ratifié en bloc, qualifications de test) : elles se propagent ;
- succès technique ≠ succès scientifique ; `QUALIFIED_WITH_RESERVATIONS` est le plafond.
