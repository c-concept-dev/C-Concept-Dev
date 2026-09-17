# MONO-10 — Migration v0.1 → v0.2

v0.1 reste **inchangé** et historique. v0.2 est un successeur additif.

## Rupture structurelle : `lib/` devient `core/` + `adapters/`

v0.1 plaçait tout dans `lib/`. v0.2 sépare **physiquement** :

- `core/` — noyau générique. Aucun nom de cas, de domaine, de fournisseur ni de
  registre. Vérifié par test d'hygiène discriminant.
- `adapters/` — traductions vers le vocabulaire d'un cas d'application. Optionnel :
  une mission qui n'est pas ce cas ne rencontre jamais ce vocabulaire.

## Renommages de contrat

| v0.1 | v0.2 | Raison |
|---|---|---|
| `p0_2Allowed` | `downstreamUseAuthorized` | nom de phase métier dans le noyau |
| `resolveP0_2Authorization()` | `resolveDownstreamUseAuthorization()` | idem |
| `legacyVerdict` | `priorVerdict` | « legacy » présuppose une histoire ; « prior » est neutre |
| `legacyScientificValidity` | `priorScientificValidity` | idem |
| `applyLegacyVerdictPolicy()` | `applyPriorVerdictPolicy()` | idem |
| `assertLegacyUntouched()` | `assertPriorUntouched()` | idem |

## Nouveaux modules

`execution-evidence.js` (classe d'exécution), `identity-evidence.js` (modèle
générique d'identité), `relevance.js` (pertinence sans égalité de libellés),
`unknowns.js` (lineage-first), `downstream-authorization.js` (autorisation aval
générique).

## Changements de comportement

| Sujet | v0.1 | v0.2 |
|---|---|---|
| `STRONG` sans registre académique | impossible | possible, par indépendance des sources |
| Libellés proches non identiques | `OUT_OF_SCOPE` | `PLAUSIBLE` |
| Aucun recouvrement, aucun oracle | `OUT_OF_SCOPE` | `UNKNOWN` |
| Binding de porte | syntaxique | recalculé et comparé |
| Fixture en qualification | pouvait contribuer à `QUALIFIED` | rejetée avant qualification |
| `AVAILABLE` | partiel | 10 conditions obligatoires |
| Parseur de sonde | tolérant | schéma fermé |
| Unknowns | reconstruits, perdables | lineage-first, perte détectée |
| Lignée vide | acceptée | `NOT_READY` / `NOT_QUALIFIED` |

## Pour un appelant v0.1

1. `require("../core/...")` au lieu de `require("../lib/...")`.
2. Remplacer `p0_2Allowed` par `downstreamUseAuthorized`, et mapper vers un nom
   de phase **via `adapters/case-phase-adapter.js`** si nécessaire.
3. Fournir `executionEvidenceClass` sur chaque artefact — il n'y a plus de défaut
   permissif.
4. Fournir `missionLabels` (et éventuellement `semanticOracle`) plutôt qu'un
   `missionDimensionSet` comparé littéralement.
5. Fournir un `identityExtractor` si le domaine a ses propres registres ;
   l'extracteur par défaut traite tout identifiant comme opaque et de même rang.
