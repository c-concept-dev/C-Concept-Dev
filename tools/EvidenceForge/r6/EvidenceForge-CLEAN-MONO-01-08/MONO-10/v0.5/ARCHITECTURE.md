# MONO-10 v0.5 — Architecture

## 1. Ce que ce lot est

MONO-10 qualifie la **qualité d'un processus** de consultation professionnelle
simulée. Il ne décide jamais du contenu d'un verdict, et ne juge jamais la
compétence réelle d'une personne.

Le noyau `core/` est **universel** : aucun métier, discipline, panel, expert,
fournisseur, registre, taxonomie ni cas d'usage.

## 2. La décision architecturale

> **EvidenceForge choisit ce qu'il vérifie. Il ne choisit pas à qui il fait confiance.**

```
INTERNAL_CHAIN_CONSISTENCY          les artefacts concordent entre eux
AUTHENTICATED_PRODUCTION_EXECUTION  une frontière EXTÉRIEURE atteste le run
```

En `PRODUCTION`, `QUALIFIED` exige **les deux**.

## 3. D'où vient chaque valeur

| Valeur | v0.4 | v0.5 |
|---|---|---|
| Racine de confiance | argument `anchorSet` | **frontière provisionnée par l'environnement** |
| Mode d'exécution | champ d'attestation | dérivé d'une frontière dont l'espace est figé |
| Mécanisme d'acte humain | callback de l'appelant | **provisionné par la frontière** |
| Anti-rejeu | `Set` optionnel de l'appelant | **store persistant, obligatoire en production** |
| Registre d'artefacts | objet de l'appelant | **construit depuis le run authentifié** |
| Provenance d'une preuve d'identité | libellé inline | **résolue contre le registre authentifié** |
| Preuves vues par l'humain | chaînes opaques | **références résolues** |
| Éligibilité au corpus | dérivée | dérivée **et** jamais acceptée en entrée |
| Racine du manifeste | — | **engagée par l'attestation** (`runManifestRootHash`) |

## 4. Modules livrés

### `core/` — noyau générique (22 modules)

| Module | Rôle | Ferme |
|---|---|---|
| `canonical.js` | forme canonique et empreintes | — |
| `key-lifecycle.js` | ACTIVE / RETIRED / REVOKED, fenêtres, empreintes | §9–§11 |
| `runtime-attestation.js` | format et vérification cryptographique (bas niveau) | §14, §15 |
| **`operator-trust-boundary.js`** | **frontière provisionnée hors processus** | **§2–§8** |
| **`operator-trust-verifier.js`** | **seule surface de vérification de production** | **§4, §5** |
| `replay-protection.js` | contrat de store, mémoire et persistant | §12, §13 |
| `operator-human-auth-boundary.js` | mécanismes d'authentification humaine provisionnés | §17, §18 |
| `human-act.js` | déclaration ≠ authenticité ; origine du callback tracée | §17, §44 |
| `run-evidence-manifest.js` | manifeste ouvert depuis une attestation vérifiée | §15, §16 |
| `authenticated-artifact-registry.js` | registre rattaché au run authentifié | §29 |
| `lineage.js` | graphe d'arêtes typées, 7 contrôles par référence | §30–§33 |
| `evidence-source-provenance.js` | provenance résolue depuis un enregistrement documentaire | §24 |
| `identity-evidence.js` | indépendance **dérivée** de provenances résolues | §25, §26 |
| `relevance.js` | relation candidat ↔ mission ; oracle **injecté** | *(inchangé depuis v0.2)* |
| `unknowns.js` | chaîne d'événements à preuves **résolues** | §34–§36 |
| `candidate-assessment.js` | réduction documentaire — **jamais** une admission | — |
| `panel-gate.js` | porte humaine ; preuves **résolues** ; liaison complète | §19, §20 |
| `effective-eligibility.js` | recalculée, jamais acceptée | §21–§23 |
| `panel-gated-adapter.js` | adaptateur d'exécution **livré** | §22 |
| `llm-capability.js` | capacité constatée, liée au run attesté | §37, §38 |
| `scientific-readiness.js` | PRE/FULL, dimensions **sourcées** | §27, §28 |
| `scientific-qualification.js` | authenticité **et** cohérence exigées | §39 |
| `scientific-unified-report.js` | rapport **additif**, lié run/mission/attestation | §41 |
| `final-report-acceptance.js` | rapport concret + acte authentifié | §42 |
| `downstream-authorization.js` | revalidation obligatoire, motifs dérivés | §40, §43 |

### `validators/` — surface de validation unique (17 domaines)
### `adapters/` — hors noyau : `case-phase-adapter.js`
### `tools/` — `operator-provisioning.js` (rôle exploitant), `aggregate-hash.js`

## 5. Les quatre marques d'origine

Un appelant peut imiter la **forme** d'une interface ; il ne peut pas en obtenir
la marque. Frontière, vérificateur, store anti-rejeu et registre authentifié sont
tous protégés ainsi (`*_FORGED`).

## 6. Ce que le noyau refuse de faire

- Recevoir une clé, un ancrage ou un callback de confiance d'un appelant.
- Se déclarer en production : il ne peut que **présenter une attestation**.
- Deviner l'origine d'une preuve d'identité.
- Traiter une absence comme une conformité.
- Réécrire un statut produit par un lot amont.
- Inventer une signature humaine.
- Accepter une éligibilité fournie en entrée.
- Fermer un inconnu sur une preuve qui n'existe pas.
- Laisser une politique désactiver un contrôle critique.
