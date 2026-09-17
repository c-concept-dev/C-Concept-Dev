# MONO-10 — migration v0.17 → v0.18

MONO-10 v0.17 est **HISTORIQUE / IMMUTABLE**. v0.18 est un successeur
**strictement documentaire / test**, comme chacun des lots depuis v0.12.

> **Aucune API ne change. Aucun comportement ne change. Aucune sécurité n'est
> ajoutée. Aucune réserve n'est fermée.** Un appelant de v0.11 à v0.17 n'a rien
> à modifier.

## 0. Pourquoi ce lot existe

L'audit final indépendant de v0.17 a rendu `NON_GELABLE`, **sans aucun bloqueur
runtime** : runtime byte-identique à v0.11–v0.16, delta strictement
documentaire, provenance mesurée et vraie, sceaux et fenêtre reproduits. Un
seul bloqueur, et il est instructif :

> **`DOC-19` n'était pas causal contre la faute réelle de v0.16.** La ligne
> fautive de `MIGRATION-v0.13-v0.14.md:102` telle qu'elle existait en v0.16 —
> le token `NOT_FIXED_IN_V015` suivi du mot « depuis », après « à l'époque de
> v0.14 » — réinjectée **verbatim** dans v0.17 donnait **0 hit**.

Cause technique : le mécanisme général de citation (`isCitedBefore`) contenait
le motif « à l'époque » et était évalué **avant** les deux contrôles qui
comptaient — le couplage entre la version du cadre et celle du token, et la
présence de « depuis ». Une faute qui contenait précisément un statut périmé
présenté comme courant était donc blanchie comme « citation historique ». Les
témoins de v0.17 mordaient sur des formes **voisines** de la faute (« depuis »
sans « à l'époque », « à l'époque » collé au token), jamais sur la faute
elle-même. Quatre documents (`README.md`, `AUDIT-REMEDIATION-MATRIX.md`,
`MANIFEST.json`, `MIGRATION-v0.16-v0.17.md` §3) affirmaient « même NN, depuis
refusé » : ces claims étaient **fausses**.

> `unknown remains unknown` — et **`known false must not remain stated as true`**.

## 1. B1 — `DOC-19` : ordre impératif des contrôles

Pour tout token de statut de réserve dont la version n'est pas la version
courante, dans la phrase qui le porte :

| Ordre | Contrôle | Verdict |
|---|---|---|
| 1 | **continuité adjacente** : « depuis », « encore », « toujours », « à ce jour », « aujourd'hui », « reste », « demeure », « désormais » — immédiatement après le token (ponctuation, « est », « et », « c'est » tolérés entre les deux) ou immédiatement avant lui | `FAIL`, quel que soit le contexte (citation comprise) |
| 2 | **couplage** : le cadre le plus proche avant le token — « à l'époque de v0.MM », « dans le cadre v0.MM », « cadre historique v0.MM » | MM ≠ NN → `FAIL` ; MM = NN → `PASS` |
| 3 | **citation adjacente** — « … », « annonçait », « disait », clé `was` — **sans** « à l'époque », qui n'est plus un marqueur de citation ici | `PASS` |
| 4 | aucun des cas ci-dessus | `FAIL` (ancien token dans un contexte courant) |

Conséquence assumée : une citation qui reproduirait verbatim une formulation
de continuité adjacente à un ancien token est refusée elle aussi. Les
documents de ce lot décrivent donc la faute de v0.16 comme « le token
`NOT_FIXED_IN_V015` suivi du mot « depuis » » — une mention (« le token … »
est un marqueur de méta-mention pour l'étape 3), jamais une reproduction. Le
verbatim n'existe que dans le témoin du test, où il doit mordre. Limite
connue, dite ici : une continuité **non adjacente** (« … , et c'est encore le
cas ») n'est pas détectée par l'étape 1 ; elle relève de l'étape 4 si aucun
cadre ni aucune citation ne la couvre.

### Témoins

| Témoin | Document réel | Verdict attendu |
|---|---|---|
| **obligatoire** : la faute B2 de v0.16, **verbatim** — la ligne telle qu'elle existait en v0.16 : statut de v0.14 annoncé « à l'époque de v0.14 », puis le token de v0.15 suivi du mot « depuis » (le texte exact est dans le témoin du test, il ne peut pas être reproduit ici sans faire mordre le détecteur — c'est le but) | `MIGRATION-v0.13-v0.14.md`, à la ligne qui la portait | `FAIL` (continuité) |
| variante 1 : cadre « à l'époque de v0.14 » suivi du token de v0.15 | `MIGRATION-v0.13-v0.14.md` | `FAIL` (couplage) |
| variante 2 : cadre v0.14, token de v0.15, mot « depuis » | idem | `FAIL` (continuité) |
| variante 3 : cadre v0.14, « aujourd'hui », token de v0.15 | idem | `FAIL` (continuité) |
| variante 4 : « comme à l'époque de v0.14 », token de v0.15, « depuis » | idem | `FAIL` (continuité) |
| variante 5 : cadre v0.14, token de v0.15, « encore » | idem | `FAIL` (continuité) |
| variante 6 : cadre v0.14, token de v0.15, « toujours » | idem | `FAIL` (continuité) |
| variante 7 : cadre v0.14, token de v0.15, « à ce jour » | idem | `FAIL` (continuité) |
| token courant de `OPEN-FINDINGS.md` remplacé par celui de v0.15 ; phrase courante portant le token de v0.15 dans `README.md` ; cadre « à l'époque de v0.16 » remplacé par « depuis » | — | `FAIL` |
| **contrôle** : cadre v0.14 et token de v0.14 (« À l'époque de v0.14 : NOT_FIXED_IN_V014 ») | `MIGRATION-v0.13-v0.14.md` | ne doit **pas** mordre |
| **contrôle** : cadre v0.15 et token de v0.15 (« À l'époque de v0.15 : NOT_FIXED_IN_V015 ») | `MIGRATION-v0.14-v0.15.md` | ne doit **pas** mordre |
| **contrôle** : « Statut courant : NOT_FIXED_IN_V018 » | `README.md` | ne doit **pas** mordre |

Ces trois contrôles montrent ce qu'est une forme historique **valide** : la
version du cadre et celle du token coïncident, et aucun mot de continuité ne
suit. Les sept variantes et le témoin obligatoire montrent ce qui ne l'est pas.

Chaque témoin : paquet propre → `PASS` ; cette seule ligne injectée → `FAIL` ;
revert → `PASS`. Les contrôles sont des mutations **légitimes** que le harnais
applique de la même façon et qui ne doivent produire aucun hit — un détecteur
qui mordrait sur elles serait un détecteur à mot-clé.

## 2. `DOC-25` — `executionMode` et dimensions fantômes

`OPEN-FINDINGS.md` R1 doit porter « plus `executionMode` » après l'énumération
`REQUIRED`, comme `LLM-CAPABILITY-BOUNDARY.md` ; après « plus `executionMode` »,
aucun autre identifiant que `requestId` (comparé seulement s'il est présenté)
ne peut suivre. L'ordre de l'énumération est libre : les listes sont comparées
comme des ensembles. Témoins : « plus `executionMode` » retiré de R1 → `FAIL` ;
`ghostDimension` ajoutée après `executionMode` (`OPEN-FINDINGS.md` R1, `LLM-CAPABILITY-BOUNDARY.md`)
→ `FAIL` ; contrôle : énumération `REQUIRED` permutée → ne mord pas.

## 3. Gloss de provenance : trois notions, mesurées

v0.17 écrivait « conçu en v0.7 » pour `LINEAGE.md`. Le fichier existe depuis
**v0.1**. « v0.7 » est la version que son **titre** affiche ; « v0.10 » est
l'origine de son **contenu**. Les entrées `originTitledDocuments` portent
désormais aussi `firstAppearedIn` (mesuré, égal à `documentHistory`), et
`NON-REGRESSION.md` §8 distingue les trois colonnes. Aucun document historique
n'est réécrit.

## 4. `MANIFEST.correctedStatements` B2 (v0.16) : `where` précis

| Champ | Valeur |
|---|---|
| `historicalFaultLocation` | `MIGRATION-v0.13-v0.14.md:102` tel que livré par v0.16 : le token `NOT_FIXED_IN_V015` suivi du mot « depuis » |
| `preventiveReframings` | `MIGRATION-v0.14-v0.15.md:86`, `MIGRATION-v0.15-v0.16.md:106` — recadrés en v0.17 par précaution, sans faute constatée par un audit |
| `textFixLocation` | v0.17 : les trois lignes recadrées « à l'époque de v0.NN : `NOT_FIXED_IN_V0NN` » |
| `detectorFixLocation` | v0.18 : `test/test-mono10-v0.18-documentary.js`, `DOC-19` |

## 5. Règle des témoins causaux

Inchangée, et complétée : `PASS_CLEAN`, `FAIL_SINGLE_TARGET_FAULT` (une faute,
un document, un seul fichier changé), `PASS_AFTER_REVERT`, sur le document
réel, en mémoire, sans écriture — plus des **contrôles** `PASS` explicites là
où un détecteur pourrait dégénérer en détecteur à mot-clé. Vingt-six
détecteurs (DOC-01 à DOC-25, DOC-27), `DOCUMENTARY_CHECKS_CAUGHT =
DOCUMENTARY_CHECKS_TOTAL`.

## 6. Ce qui n'a PAS changé — et comment le vérifier

`core/`, `adapters/`, `validators/`, `schemas/`, `contracts/`, la **Charte**, les
trois fichiers de test hérités de v0.11 et les trois outils de v0.11 sont
**identiques octet pour octet** à v0.11 … v0.17. `tools/seal-inventory.js` est
identique à v0.12 et à tous les lots depuis. La commande et son résultat
attendu sont dans `NON-REGRESSION.md` §1, rejoués par `DOC-13`.

Delta v0.17 → v0.18, classé :

| Classe | Fichiers |
|---|---|
| `DOCUMENTATION` | `README.md`, `governance/README.md`, `OPEN-FINDINGS.md`, `THREAT-MODEL.md`, `AUDIT-REMEDIATION-MATRIX.md`, `LLM-CAPABILITY-BOUNDARY.md`, `TRUST-MODEL.md`, `ARTIFACT-REGISTRY-TRUST.md`, `READINESS.md`, `CAPABILITY-AUTHORITIES.md`, `REPLAY-PROTECTION.md` (H1), `MIGRATION-v0.16-v0.17.md` (claim invalidée, annotée), `MIGRATION-v0.17-v0.18.md` (nouveau), `AUDIT-VERDICTS.v0.12-v0.18.md` (renommé depuis `AUDIT-VERDICTS.v0.12-v0.17.md`, ligne v0.17 ajoutée) |
| `NON_REGRESSION` | `NON-REGRESSION.md` |
| `MANIFEST` | `MANIFEST.json`, `SHA256SUMS.txt` |
| `DOCUMENTARY_TEST` | `test/test-mono10-v0.18-documentary.js` (remplace `test/test-mono10-v0.17-documentary.js`) |
| `READ_ONLY_AUDIT_TOOL` | aucun ajout ; `tools/seal-inventory.js` inchangé |
| `RUNTIME` / `TEST_RUNTIME` / `OTHER` | **0** |

## 7. Ce que v0.18 ne fait pas

- il ne ferme **aucune** des cinq réserves R1 à R5 (à l'époque de v0.18 : `NOT_FIXED_IN_V018` ; le statut courant est dans `OPEN-FINDINGS.md`) ;
- il ne corrige pas les neuf divergences de `MONO-07` et `MONO-08/v0.6` ;
- il n'ajoute aucune sécurité, ne touche à aucune API, n'implémente pas P0.2 ;
- il ne réécrit aucun lot historique, v0.17 compris ;
- il ne lance aucun run réel : `NETWORK_CALLS = 0`, `REAL_LLM_CALLS = 0`,
  `REAL_EF02_RUNS = 0`, `REAL_PROFESSIONAL_RUNS = 0`, `REAL_HUMAN_ACTS = 0` ;
- il ne déclare pas v0.18 gelé — ce statut appartient au propriétaire
  (CHARTE §19).
