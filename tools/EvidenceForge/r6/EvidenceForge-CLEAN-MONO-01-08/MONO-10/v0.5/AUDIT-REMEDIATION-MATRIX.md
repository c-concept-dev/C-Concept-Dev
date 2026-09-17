# MONO-10 v0.5 — Matrice de remédiation

v0.1 → v0.4 sont **HISTORIQUES, immuables et `NON_GELABLE`**. Ces statuts ne sont
ni réhabilités ni réinterprétés. v0.3 sert de variante « défense désactivée » pour
la mutation M10, en lecture seule.

## Bloqueurs v0.4 — reproduits avant correction (§1)

| # | Constat | Reproduit | Fermeture v0.5 | Preuve |
|---|---|---|---|---|
| **B01** | l'appelant injecte sa propre racine de confiance | **oui** — `QUALIFIED` + `AUTHORIZED` | frontière provisionnée par l'environnement ; espace PRODUCTION inatteignable en processus ; marques d'origine | T01, T02, M01, M35, M36 |
| **B02** | rejeu d'attestation (anti-rejeu optionnel) | **oui** — 3 acceptations | store provisionné, persistant, obligatoire en production ; `getSeen` distingue rejeu et revérification | T10, T11, M05, M31, M32 |
| **B03** | même clé ancrée TEST **et** PRODUCTION | **oui** | empreinte unique par frontière ; espaces séparés | T06, M30 |
| **B04** | preuves humaines inventées admises au corpus | **oui** — corpus + `AUTHORIZED` | `evidenceRefs` **résolues** contre le registre authentifié | T19, T20, T21, M39, M40 |
| **B09** | callback d'authentification humaine fourni par l'appelant | **oui** | mécanisme provisionné par la frontière ; origine du callback tracée | T17, T18, M08, M46 |
| B05 | `DEFER`/`REJECT` au corpus | déjà fermé en v0.4 | + éligibilité jamais acceptée en entrée | T22, T23, T24 |
| B06 | dimensions synthétiques | déjà fermé en v0.4 | conservé | T38, M17 |
| B07 | réétiquetage de lignée | déjà fermé en v0.4 | + registre authentifié, métadonnée absente = échec | T32, T33, M13, M44 |
| B08 | fausse résolution d'inconnu | déjà fermé en v0.4 | + registre authentifié exigé | T34, T35, M14 |
| B10 | mission désappariée au rapport | déjà fermé en v0.4 | conservé | T43, M23 |

## Sections §0–§59 du mandat

| § | Exigence | Livré dans | Preuve |
|---|---|---|---|
| §0 | distinguer cohérence et authenticité | `scientific-qualification.js` | T15, M19, M20, I-12 |
| §1 | reproduire les bloqueurs | — | rapport §1 |
| §2–§4 | frontière opérateur, aucun ancrage libre | `operator-trust-boundary.js` | T01, HYG-04 |
| §5 | vérificateur de haut niveau | `operator-trust-verifier.js` | T02, M35 |
| §6 | contrat de provisionnement | `TRUST-MODEL.md`, `KEY-MANAGEMENT.md` | — |
| §7–§8 | espaces TEST/PRODUCTION séparés, clé unique | `operator-trust-boundary.js` | T05, T06, M02, M30 |
| §9–§11 | cycle de vie, rotation, révocation | `key-lifecycle.js` | T07, T08, T09, M27–M29 |
| §12–§13 | anti-rejeu obligatoire et persistant | `replay-protection.js` | T10, T11, M05, M31, M32 |
| §14–§16 | attestation signée, racine engagée, ordre | `runtime-attestation.js`, `run-evidence-manifest.js` | T12–T14, M37, M38 |
| §17–§18 | frontière d'authentification humaine | `operator-human-auth-boundary.js`, `human-act.js` | T17, T18, M08 |
| §19–§20 | preuves humaines résolues, liaison complète | `panel-gate.js` | T19–T21, M11, M39, M40 |
| §21–§23 | éligibilité recalculée, statut legacy intact | `effective-eligibility.js` | T22–T24, M41–M43 |
| §24–§26 | provenance résolue, indépendance dérivée | `evidence-source-provenance.js`, `identity-evidence.js` | T25–T28, M10 |
| §27–§28 | dimensions sourcées, readiness recalculée | `scientific-readiness.js` | T38, T39, M17 |
| §29 | registre authentifié | `authenticated-artifact-registry.js` | M33, M34, M47, I-03 |
| §30–§33 | lignée stricte, arêtes typées, métadonnée absente = échec | `lineage.js` | T29–T33, M12, M13, M44 |
| §34–§36 | inconnus : résolution, rejeu, fraîcheur | `unknowns.js` | T34–T37, M14–M16 |
| §37–§38 | sonde LLM authentifiée | `llm-capability.js` | T40–T42, M18 |
| §39 | qualification | `scientific-qualification.js` | T15, M19, M20 |
| §40 | aucun drapeau de contournement | `downstream-authorization.js` | T47, M21 |
| §41–§43 | rapport, acceptation, aval | modules dédiés | T43–T48, M22–M24, M45, M46 |
| §44 | politique de callback | `human-act.js` (`CALLBACK_ORIGIN`) | T17, M46 |
| §45–§48 | TRUST, THREAT, KEY-MANAGEMENT, REPLAY-PROTECTION | documents dédiés | — |
| §49–§55 | 48 tests, 48 mutations | `test/test-mono10-v0.5.js` | 48/48 |
| §56–§57 | intégration hors ligne, simulation de production | `test/…-integration.js` | 22/22 |
| §58–§59 | anti-hardcoding, universalité | — | HYG-01, UNI-1…6 |

## Ce que v0.5 ne prétend pas

- **La racine est déplacée hors de l'appelant, pas rendue inviolable.** Qui
  contrôle l'environnement et le système de fichiers de l'exploitant contrôle la
  racine. `THREAT-MODEL.md` §2 le nomme.
- **Aucun run réel** : `NETWORK_CALLS = 0`, `REAL_LLM_CALLS = 0`,
  `REAL_EF02_RUNS = 0`, `REAL_PROFESSIONAL_RUNS = 0`, `REAL_HUMAN_ACTS = 0`.
- **Une révocation invalide rétroactivement** ce que la clé avait signé. C'est
  délibéré et documenté : une clé compromise a pu servir à antidater.
- La qualité du processus n'est pas le contenu du verdict.
