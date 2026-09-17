# MONO-09 v0.1 — Adaptateurs professionnels réels (successeur additif)

## Ce que ce lot corrige

Le run réel EF-02A→EF-04A du 2026-09-08 a rendu **14/14 nœuds SUCCESS** avec
0 professionnel, 0 jumeau, 0 revue. Trois défauts distincts l'expliquent, plus
un blocage structurel qu'aucun lot additif ne peut lever.

| # | Défaut | Corrigé ici |
|---|---|---|
| A | EF-02A interroge `/authors?search=<slug de discipline>` | **oui** — `lib/seed-discovery.js` |
| B | EF-02C fabrique DOI et `workRef` | **oui** — `lib/identifier-policy.js` |
| C | Un pipeline vide est lisible comme un succès | **oui** — `lib/scientific-readiness-gate.js` |
| D | `scientificValidity` codé en dur à `false` dans MONO-01 | **non — BLOCKER, voir `BLOCKERS.md`** |

## Périmètre

`MONO-01` à `MONO-08` ne sont pas modifiés (vérifié par le test T15 : empreinte
contenu + chemin relatif des 10 lots). Ce lot n'expose que des fonctions pures
et des gates ; il n'appelle ni réseau, ni LLM, ni nœud gelé.

## A — Découverte fondée sur les preuves

L'ancienne stratégie cherchait des auteurs dont le **nom** ressemble au slug
technique de la discipline. Mesuré chez le fournisseur :

| Requête | Résultat |
|---|---|
| `epistemologie` | 3 enregistrements qui sont des titres d'article, pas des personnes |
| `ethique-appliquee` | 0 |
| `methodologie-recherche-qualitative` | 0 |
| via la passerelle, 7 disciplines | **0 candidat** |

La nouvelle stratégie part des **œuvres réellement retenues par l'audit humain** :

1. `extractSeedAuthors` — auteurs des sources dont la décision humaine est
   `inclus`. Refuse un jeu de décisions non lié au snapshot (`SEED_BINDING_MISMATCH`).
2. `resolveAuthorIdentities` — résolution de l'identifiant auteur chez le
   fournisseur, par un résolveur **injecté**. Une identité non résolue reste
   `null`, jamais devinée.
3. `discoverSecondaryCandidates` — expansion documentée depuis les graines
   résolues, pour que le panel ne se réduise pas aux auteurs déjà inclus.
4. `buildDiscoveryOutput` — forme EF-02A, avec provenance complète.

Sur les données réelles : **51 auteurs-graines distincts** issus des 22 sources
incluses. Aucun n'apparaît dans plus d'une œuvre retenue — le corpus est
entièrement dispersé, ce qui est en soi un constat sur la mission.

### Anti-circularité

```
SEED_CANDIDATE  →  DISCOVERED_CANDIDATE  →  VERIFIED_PROFESSIONAL
   (ce lot)            (ce lot)                (EF-02B seul)
```

`SEED_AUTHOR != AUTOMATIC_PANEL_MEMBER`. Aucune fonction de ce lot ne produit
`VERIFIED_PROFESSIONAL` ; `buildDiscoveryOutput` **refuse** un candidat déjà
marqué vérifié (`ANTI_CIRCULARITY_VIOLATION`).

Écarté délibérément : sélection par popularité, citations valant expertise,
quota, auto-validation des auteurs du corpus, choix d'une personne parce qu'elle
confirme la mission.

## B — Politique d'identifiants

Un identifiant absent reste absent. `normalizeWork` expose `doiStatus` parmi
`PROVIDER_SUPPLIED`, `ABSENT_AT_PROVIDER`, `REJECTED_FABRICATED`. Une œuvre sans
identifiant natif est déclarée `usable: false`, jamais complétée.
`assertNoFabricatedIdentifiers` refuse un corpus contaminé.

Jamais fabriqués : DOI, ORCID, identifiant OpenAlex, PMID, institution, identité
d'auteur.

## C — Gate de lisibilité scientifique

`classifyRun` sépare ce que le run réel confondait :

- `TECHNICAL_SUCCESS_SCIENTIFICALLY_EMPTY` — le cas observé
- `TECHNICAL_SUCCESS_SCIENTIFICALLY_PARTIAL` — revues produites, drapeaux gelés
- `TECHNICAL_SUCCESS_SCIENTIFICALLY_USABLE` — inatteignable aujourd'hui (D)
- `TECHNICAL_FAILURE`

`assertVerdictAllowed` refuse l'émission d'un verdict sur un run vide.

## D — Disponibilité LLM

`LLM_CALLS = 0` était possible parce que EF-02D boucle sur `professionalCorpora`
et EF-03B sur `twins × targets` : listes vides, `workerCallFn` jamais atteint. Le
fail-closed d'EF-03B (`workerCallFn manquant`) existe mais est **inatteignable**
sans données. `assertLlmReadiness` vérifie la disponibilité **en fonction du
volume réel**, avant le pipeline, et distingue `NO_LLM_NEEDED_DATA_EMPTY` de
`READY` — un SUCCESS obtenu sans données ne prouve rien.
