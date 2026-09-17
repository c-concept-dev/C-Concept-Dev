# MONO-10 v0.4 — Architecture

## 1. Ce que ce lot est

MONO-10 qualifie la **qualité d'un processus** de consultation professionnelle
simulée. Il ne décide jamais du contenu d'un verdict, et ne juge jamais la
compétence réelle d'une personne.

Le noyau `core/` est **universel** : aucun métier, discipline, panel, expert,
fournisseur, registre, taxonomie ni cas d'usage. Tout ce qui est propre à un cas
vit dans `adapters/`, ou est **injecté**.

## 2. La décision architecturale de v0.4 (§0)

> **Une chaîne cohérente n'est pas une preuve de production.**

v0.3 confondait les deux et devenait `NON_GELABLE` : une chaîne entièrement
fabriquée atteignait `AUTHORIZED`. v0.4 sépare :

```
INTERNAL_CHAIN_CONSISTENCY          les artefacts concordent entre eux
AUTHENTICATED_PRODUCTION_EXECUTION  un runtime EXTÉRIEUR atteste le run
```

`ScientificQualification` porte les deux, séparément. En `PRODUCTION`,
`QUALIFIED` exige les deux.

## 3. D'où vient chaque valeur

| Valeur | v0.3 — d'où elle venait | v0.4 — d'où elle vient |
|---|---|---|
| Classe d'exécution | manifeste fabriqué par l'appelant | attestation signée par une autorité **ancrée** |
| Mode d'exécution | champ du manifeste | **repris** de l'attestation vérifiée |
| Indépendance d'identité | libellé écrit par l'appelant | résolution dans un **registre extérieur** + identifiant + provenance |
| Authenticité d'un acte humain | `actorType: "human"` | mécanisme **injecté** (production) ou fixture déclarée (test) |
| Preuve fermant un inconnu | chaîne opaque | référence qui **résout** contre le registre d'artefacts |
| Phase de préparation | noms de dimensions dans l'artefact | dimensions **tirées de sources résolvables** |
| Obligation de revalidation | `policy.revalidationRequired` | **non négociable** |
| Motif d'une autorisation | chaîne écrite à l'avance | **dérivé** de ce qui a été exécuté |

## 4. Modules livrés

### `core/` — noyau générique

| Module | Rôle | Ferme |
|---|---|---|
| `canonical.js` | forme canonique et empreintes — une seule définition | — |
| `trusted-runtime-authority.js` | **racine de confiance externe** : ancrages, attestations signées | B-1, §1, §2 |
| `run-evidence-manifest.js` | manifeste adossé à une attestation vérifiée | B-1, §3 |
| `human-act.js` | déclaration ≠ authenticité d'un acte humain | §11 |
| `identity-evidence.js` | indépendance **démontrée** via registre extérieur | B-3, §8, §9 |
| `relevance.js` | relation candidat ↔ mission ; oracle **injecté** | *(repris v0.3)* |
| `unknowns.js` | inconnus : chaîne d'événements à preuves **résolues** | B-5, §14–§16 |
| `lineage.js` | graphe d'**arêtes typées**, lié au run | B-7, §12, §13 |
| `candidate-assessment.js` | réduction documentaire — **jamais** une admission | — |
| `panel-gate.js` | porte humaine, `evidenceRefs` hachées **des deux côtés** | B-4, §10 |
| `effective-eligibility.js` | `legacy` / `humanPanelDecision` / `effective` | §7 |
| `panel-gated-adapter.js` | **adaptateur d'exécution livré** | §7 |
| `llm-capability.js` | capacité constatée, **liée au run attesté** | §19 |
| `scientific-readiness.js` | PRE/FULL, dimensions **sourcées** | B-6, §17, §18 |
| `scientific-qualification.js` | qualification du processus, préparations recalculées | §0, §20 |
| `scientific-unified-report.js` | rapport **additif**, lié mission/run/attestation | §21 |
| `final-report-acceptance.js` | acceptation sur rapport **concret**, acte authentifié | §22 |
| `downstream-authorization.js` | revalidation **obligatoire**, motifs **dérivés** | B-2, §5, §6, §23, §24 |

### `validators/`

`validators/index.js` expose en un point la surface de validation du lot, pour
qu'un consommateur n'ait pas à réimplémenter un contrôle en le croyant
équivalent. Aucun validateur n'accorde quoi que ce soit par défaut.

### `adapters/` — hors noyau

`case-phase-adapter.js` (nom de phase = donnée de l'appelant) et
`declared-authority-identity-adapter.js` (libellés d'autorité, encore à résoudre).

### `tools/`

`ephemeral-authority.js` — simulateur d'autorité pour les tests, **sans aucune
clé embarquée**. `aggregate-hash.js` — empreinte agrégée indépendante du chemin.

## 5. Ce que le noyau refuse de faire

- Se déclarer en production : il ne peut que **présenter une attestation**.
- Deviner l'autorité émettrice d'un identifiant.
- Conclure `OUT_OF_SCOPE` sans oracle sémantique explicite.
- Traiter une absence comme une conformité.
- Réécrire un statut produit par un lot amont.
- Inventer une signature humaine là où aucun mécanisme n'existe.
- Laisser une politique d'appelant désactiver un contrôle critique.
- Fermer un inconnu sur une preuve qui n'existe pas.
