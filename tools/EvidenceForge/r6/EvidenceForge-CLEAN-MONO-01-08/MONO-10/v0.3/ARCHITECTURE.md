# MONO-10 v0.3 — Architecture

## 1. Ce que ce lot est

MONO-10 qualifie la **qualité d'un processus** de consultation professionnelle
simulée. Il ne décide jamais du contenu d'un verdict, et il ne juge jamais la
compétence réelle d'une personne.

Le noyau `core/` est **universel** : aucun métier, aucune discipline, aucun
panel, aucun expert, aucun cas d'usage, aucun registre d'identité, aucune
taxonomie. Tout ce qui est propre à un cas d'application vit dans `adapters/`,
ou est **injecté** par l'appelant.

## 2. Le principe structurant de la v0.3

> **Aucune valeur auto-déclarée ne constitue à elle seule une preuve.**

En v0.2, plusieurs artefacts se qualifiaient eux-mêmes : un champ
`executionEvidenceClass: "REAL_RUNTIME"` écrit par l'artefact suffisait à le
faire passer pour une preuve réelle ; un tableau `unknowns: []` effacé faisait
disparaître les inconnus ; un objet portant `qualificationStatus: "QUALIFIED"`
obtenait l'autorisation aval. La v0.3 remplace systématiquement la **déclaration**
par la **dérivation** et le **recalcul**.

| Valeur | v0.2 — d'où elle venait | v0.3 — d'où elle vient |
|---|---|---|
| Classe d'exécution | champ écrit par l'artefact | `RunEvidenceManifest` + `runBinding` croisé |
| Indépendance des sources | préfixe de l'identifiant | `sourceAuthorityId` / `sourceFamilyId` **déclarés** |
| Statut d'un inconnu | champ `status` | dérivé de `transitions[]` |
| Phase de préparation | étiquette `phase` | jeu de dimensions réellement évaluées |
| Conformité de la préparation | lue sur l'artefact | **recalculée** sur les artefacts sources |
| Éligibilité au corpus | statut amont réécrit | champ **séparé**, dérivé, motivé |
| Autorisation aval | statut lu sur l'objet | **revalidation** de toutes les entrées |

## 3. Cartographie des modules livrés

### `core/` — noyau générique

| Module | Rôle | Ferme |
|---|---|---|
| `run-evidence-manifest.js` | Provenance d'exécution : manifeste de run, liaison croisée artefact × run | A-03, §7, §8 |
| `identity-evidence.js` | Confiance d'identité à partir de preuves dont l'**indépendance est déclarée** | B-02, A-04, A-06, §4, §5 |
| `relevance.js` | Relation documentaire candidat ↔ mission ; oracle sémantique **injecté** | (inchangé depuis v0.2) |
| `unknowns.js` | Inconnus comme **chaînes d'événements** vérifiables | B-07, §11, §12 |
| `lineage.js` | Références d'artefacts **résolues** contre un registre | B-06, A-05, §10 |
| `candidate-assessment.js` | Réduction documentaire du vivier — **jamais une admission** | §4 |
| `panel-gate.js` | Porte humaine ; toutes les liaisons recalculées et comparées | B-03, §6 |
| `effective-eligibility.js` | `legacy` / `humanPanelDecision` / `effective` — trois champs distincts | A-02, §2, §3 |
| **`panel-gated-adapter.js`** | **Adaptateur d'exécution livré** qui ferme la porte devant EF-02C | **A-01, §1** |
| `llm-capability.js` | Capacité **constatée** par sonde active ; parseur strict | §14, §15, §16 |
| `scientific-readiness.js` | Préparation PRE et FULL, **distinctes par construction** | §9, §10 |
| `scientific-qualification.js` | Qualification du processus, préparations **recalculées** | §9, §13 |
| `scientific-unified-report.js` | Rapport **additif** lié à une qualification et un run uniques | §18 |
| `final-report-acceptance.js` | Acceptation humaine portant sur un **rapport concret** | §19 |
| `downstream-authorization.js` | Autorisation générique ; **revalide toutes ses entrées** | §17 |

### `adapters/` — hors noyau, optionnels

| Module | Rôle |
|---|---|
| `case-phase-adapter.js` | Traduit `downstreamUseAuthorized` vers le vocabulaire d'un cas. Le nom de phase est une **donnée**. |
| `declared-authority-identity-adapter.js` | Déclare l'autorité émettrice et la famille d'un identifiant, depuis une table **injectée**. |

### `tools/`

| Module | Rôle |
|---|---|
| `aggregate-hash.js` | Empreinte agrégée indépendante du chemin absolu, pour que toute baseline publiée reste rejouable. |

## 4. Pourquoi l'adaptateur à porte est dans `core/` et non dans `adapters/`

Parce qu'il **exécute**. En v0.2 il n'existait que dans un fichier de test alors
que la documentation le décrivait comme une étape du run : le composant qui
fermait la porte n'était pas livrable, donc la porte n'existait pas hors du test.
Il ne contient aucun nom de cas : l'adaptateur de base est **injecté**, et seule
son interface à trois méthodes est connue.

## 5. Ce que le noyau refuse de faire

- Deviner l'autorité émettrice d'un identifiant (un préfixe d'URL ne démontre
  aucune indépendance).
- Conclure `OUT_OF_SCOPE` sans avis explicite d'un oracle sémantique injecté.
- Traiter une absence comme une conformité.
- Réécrire un statut produit par un lot amont.
- Simuler, pré-remplir ou déduire une décision humaine.
- Transformer un `unknown` en certitude sans motif **et** sans preuve.
