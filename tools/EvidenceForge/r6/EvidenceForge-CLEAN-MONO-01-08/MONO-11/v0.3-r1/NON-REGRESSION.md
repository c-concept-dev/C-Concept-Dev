# MONO-11 v0.2 — Non-régression

## Lots gelés : intacts par construction et par mesure

| Lot | Sceau | Vérifié par | Résultat |
|---|---|---|---|
| MONO-10 v0.19 | `SHA256SUMS.txt` (79 fichiers) + zip canonique `f5a4165414f4aacc32f48f50eb14d59c87a09e3f138e24f8bd14b956972c2e04` | `frozen-bridge.verifySeal` à chaque chargement ; T19 | 0 divergence |
| MONO-09 v0.2 | `SHA256SUMS.txt` (9) | idem ; T20 | 0 divergence |
| MONO-01 | `manifest/SHA256SUMS` (106) | idem ; T20 | 0 divergence |

Mutation (T20) : une ligne ajoutée à `MONO-09/v0.2/lib/professional-adapter.js` dans une copie temporaire ⇒ `FROZEN_LOT_ALTERED: MONO09` — le lot altéré n'est pas composé.

## Comportements MONO-10 conservés (réutilisés tels quels)

- run attesté, registre authentifié, liaison amont (`upstream-evidence-binder.js`) ;
- `assessCandidates` (identité dérivée de provenance authentifiée) : sur les mêmes entrées de phase 1, la phase 2 recalcule 48 PRESENT / 62 INSUFFICIENT (identique) ;
- `validatePanelValidation` pour l'override humain (T17, T28) ;
- `assertCapabilityUsable` : un booléen `AVAILABLE` sans sonde certifiée ⇒ `NOT_QUALIFIED` (T23) ;
- états de qualification : mêmes quatre valeurs que `canonical-contracts.json`.

## Comportements MONO-01 (EF-02D1/D2/D3, EF-02E, EF-03A/B/C) conservés

- anti-fabrication des références : un titre inventé par l'oracle est refusé par le parseur gelé ⇒ `UNKNOWN`, jamais admis (T24) ;
- EF-02E ne construit un jumeau que pour un membre du `PanelSelection` (jumeaux ⊆ admis, T29) ;
- EF-03B cite des passages exacts du document cible et des œuvres exactes du jumeau.

## Ce qui change (et c'est le seul changement)

`professionalPanelGate` (humain, `HUMAN_AUTHENTICATED`) ⇒ `evidenceGate` (machine, preuves). Les consommateurs gelés de la porte humaine (`panel-gated-adapter.js`, `scientific-readiness.js`, `scientific-qualification.js`) ne sont pas appelés sur le chemin nominal ; ils restent utilisables tels quels pour l'override humain et pour tout run régi par la Charte v1.

## Tests : 44/44 (`node --test test/test-mono11-v0.2.js`)

Gate (T01–T05), anti-hardcoding (T06–T10b, 3 domaines), anti-circularité (T11–T14), lignée (T15–T18), intégrité gelée (T19–T20), fail-closed (T21–T23), adversarial/mutation (T24–T29), reprise informée (T30), normalisation (T31–T33), enforcement EF-03B (T34–T35), enforcement EF-02D3 (T36), sceau avant run (T37), reuse (T38), garde `reviews_complete = 100 %` avec mutants (T39–T40), persistance (T41), indisponibilité fatale du fournisseur → fail-closed (T42).

## v0.1 → v0.2
EF-03B et EF-02D3 gelés **inchangés** (sceau MONO-01 0/106) ; leurs prompts et validateurs sont appelés tels quels ; MONO-11 ajoute une validation locale AVANT et une reprise informée. Les 32 tests v0.1 passent inchangés sauf T30, réécrit pour la reprise informée (le rejeu aveugle `resumeDocumentaryReviewSet` n'est plus utilisé).
