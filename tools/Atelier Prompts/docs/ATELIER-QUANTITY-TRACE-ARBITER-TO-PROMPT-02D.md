# ATELIER-QUANTITY-TRACE-ARBITER-TO-PROMPT-02D

**Sous-lot :** `ATELIER_QUANTITY_TRACE_ARBITER_TO_PROMPT_02D`
**Nature :** audit de trace en lecture seule. Aucun correctif.
**Question :** une quantité explicitement formulée survit-elle jusqu'au prompt final — et sinon, où
disparaît-elle **pour la première fois** ?

**Réponse.** Elle disparaît au **mapping canonique**. L'Arbitre l'extrait correctement, **avec sa
modalité** — « Exactement dix slogans », « Moins de huit mots par slogan » — et le mapper la porte
fidèlement dans `intent.explicit_constraints[].text`, en **prose**. Mais `contract.quantities` reste
`[]`, et c'est le seul champ que lit le sélecteur de verrous. Faute de `quantities`, pas de verrou
`volume` ; faute de `volume`, pas de section `CONTRAINTES QUANTIFIÉES` ; et le gate passe parce qu'il
n'a reçu aucune obligation quantitative à contrôler.

Le cas qui *fonctionne* le fait pour une raison qui aggrave le diagnostic : la seule source
structurée de Rapide est `detecterQuantite(demande)`, **une regex sur la demande brute qui ne
reconnaît que des chiffres**, et dont la liste d'unités ne contient ni `paragraphes` ni `slogans`.

---

## A. Baseline

```
git status --short -- 'tools/Atelier Prompts'  → 4 rapports non suivis (1D-O, 02A, 02B, 02C)
git branch --show-current                      → main
git rev-parse HEAD                             → 0b78458ab9b42d3dbf6e406f2622a777ad19df17
git log -3  → 0b78458 (02C) / 99dea87 (02B) / 51ecbfb
```

`HEAD == 0b78458` : **OUI**, exactement le commit attendu.

## B. Problème hérité

02B avait mesuré 5 cas sur 8 avec quantité explicite sans verrou `volume` ni section
`CONTRAINTES QUANTIFIÉES`, `qg = PASS` — mais avait refusé de conclure, parce que son contrat
canonique venait d'une **fixture** : `QUANTITY_CAUSE = NOT_PROVEN`. Ce lot lève la réserve avec de
vraies sorties d'Arbitre.

## C. Corpus

Trois cas, tous réutilisés de `evaluation/corpus-lot10g2a.json`, tous porteurs d'une quantité
explicite non ambiguë, et tous passés par le **vrai** `/operational-request` déployé.

| cas | demande | HTTP | état rendu | latence |
|---|---|---|---|---|
| **R01** | « Fais-moi une checklist de **20 points** pour préparer un voyage en Italie » | 200 | `operational_request_ready` | 51 145 ms |
| **R03** | « Explique la photosynthèse à un enfant de 10 ans en **cinq paragraphes** courts » | 200 | `operational_request_ready` | 42 748 ms |
| **R06** | « Propose **dix** slogans chaleureux de moins de **huit mots** pour une boulangerie » | 200 | `operational_request_ready` | 31 253 ms |

Trois appels réels, aucun banc, aucune campagne.

## D. User request

| cas | `QUANTITY_TEXT` | `VALUE` | `TARGET` | `TYPE` |
|---|---|---|---|---|
| R01 | « 20 points » | 20 | points | exact (implicite) |
| R03 | « cinq paragraphes » | 5 | paragraphes | exact |
| R06 | « dix slogans » / « moins de huit mots » | 10 / 8 | slogans / mots par slogan | exact / maximum |

## E. Arbiter — la quantité est extraite, et correctement

```
QUANTITY_PRESENT_IN_ARBITER = 3/3
ARBITER_FIELD_PATH = operational_request_candidate.confirmed_constraints[]
```

| cas | `confirmed_constraints` réellement rendus par l'Arbitre |
|---|---|
| R01 | `["Le livrable doit contenir exactement 20 points"]` |
| R03 | `["Exactement cinq paragraphes", "Paragraphes courts", "Niveau de langage adapté à un enfant de 10 ans"]` |
| R06 | `["Exactement dix slogans", "Moins de huit mots par slogan", "Registre chaleureux"]` |

La quantité est là, avec sa **modalité** (« exactement », « moins de ») et sa **cible** (points,
paragraphes, slogans, mots par slogan). `expected_deliverable` la reprend également.

| | |
|---|---|
| `PRODUCED_BY` | l'Arbitre, rôle OPRIE |
| `READ_BY` | `mapOprieToCanonicalContract` (`oprie-canonical-mapping.js:237`) ; puis, en aval, `rapide-canonical-enrichment.js:244` qui les **promeut en obligations** |
| `DECISIONAL` | **oui** — ce ne sont pas des champs de trace : ils deviennent des obligations lues par la chaîne |
| `DERIVABLE` | non : c'est la source |

`ARBITER_EXTRACTION_GAP = NON.` Le §5 ne s'applique pas.

**Mais une limite structurelle, qu'il faut nommer ici** : le schéma du candidat n'a **aucun champ de
quantité structuré**. `CANDIDATE_JSON_SCHEMA` déclare chaque champ comme `string` ou
`array of string` — l'Arbitre ne peut donc exprimer une quantité **que** comme prose. Champs réels
observés : `objective, expected_deliverable, confirmed_constraints, confirmed_preferences,
confirmed_priorities, delegated_decisions, available_inputs, remaining_unknowns,
external_facts_to_research, assumptions_allowed, secondary_objectives`.

## F. Canonical Contract — la rupture

```
QUANTITY_PRESENT_IN_CANONICAL = 3/3 en PROSE · 0/3 en STRUCTURE
```

Contrats canoniques réels, produits par `mapOprieToCanonicalContract` sur les trois sorties
d'Arbitre, tous validés (`verdict.ok = true`, `problems: []`) :

| cas | `quantities` | `obligations` | `output.length_policy` | `intent.explicit_constraints[0].text` |
|---|---|---|---|---|
| R01 | **`[]`** | `[]` | `null` | « Le livrable doit contenir exactement 20 points » |
| R03 | **`[]`** | `[]` | `null` | « Exactement cinq paragraphes » |
| R06 | **`[]`** | `[]` | `null` | « Exactement dix slogans » |

Le mapping est visible à `oprie-canonical-mapping.js:237` :

```js
explicit_constraints: strings(candidate.confirmed_constraints).map((value) => ({ … }))
```

`confirmed_constraints` → `intent.explicit_constraints[].text`. **Fidèle, et uniquement textuel.**
Rien ne remplit `quantities`, qui existe pourtant comme champ racine du contrat.

```
FIRST_BREAK = CANONICAL_MAPPING_GAP
source field        : operational_request_candidate.confirmed_constraints[]
mapper              : core/adn/oprie-canonical-mapping.js:237
destination attendue : contract.quantities[] = [{target, unit, exact, min, max}]
condition qui écarte : aucune — il n'existe simplement aucun chemin de confirmed_constraints
                       vers quantities, et la source n'offre aucune forme structurée à mapper
```

## G. ADN — ce que l'état reçoit réellement

```
QUANTITY_VISIBLE_TO_ADN = 1/3
```

| cas | `state.completeness.quantities` | obligations ADN |
|---|---|---|
| R01 | **`[{id:"Q-001", target:"éléments", unit:null, exact:null, min:20, max:null}]`** | « Le livrable doit contenir exactement 20 points » |
| R03 | **`[]`** | « Exactement cinq paragraphes », « Paragraphes courts », … |
| R06 | **`[]`** | « Exactement dix slogans », « Moins de huit mots par slogan », … |

La prose arrive bien : `rapide-canonical-enrichment.js:244-256` promeut
`intent.explicit_constraints` en **obligations**, avec trace
(`promoted_from: intent.explicit_constraints[i]`), et `:338` en tire un signal de verrou `scope`.
**Jamais un signal `volume`.**

Alors d'où vient le `Q-001` de R01, puisque le contrat ne porte rien ? De la voie legacy :

```js
// HTML — adnRefineRapidEnvelope
quantities: adnQuantitiesFromRapid(ctx)

function adnQuantitiesFromRapid(ctx){
  if(!ctx||!ctx.quantiteExplicite||!ctx.quantite)return [];
  …
}
```

`ctx.quantite` est produit par le moteur historique, et le commentaire qui suit immédiatement
l'admet : « les entrées sémantiques restent, **TEMPORAIREMENT**, celles du moteur Rapide
historique ».

Et cette voie legacy est une **regex sur la demande brute** :

```js
function detecterQuantite(demande){
  const n = sansAccents(demande);
  if((m = n.match(/entre\s+(\d{1,4})\s+et\s+(\d{1,4})/)))            …
  if((m = n.match(/(?:au moins|minimum|…)\s+(\d{1,4})/)))            …
  if((m = n.match(/\bexactement\s+(\d{1,4})/)))                      return {min:+m[1], max:+m[1]};
  if((m = n.match(new RegExp('(\\d{1,4})\\s+(?:' + UNITES_COMPTABLES + ')\\b'))))  …
  return null;
}
```

```
UNITES_COMPTABLES = items|entrees|elements|exercices|sections|questions|points|etapes|slides|
  diapositives|lignes|fonctions|mesures|activites|parties|propositions|idees|recommandations|
  options|creneaux|recettes|exemples|cas|scenarios
```

Deux limites lexicales, cumulatives :

1. **`\d{1,4}` — chiffres seulement.** « cinq », « dix », « huit » ne correspondent à aucune règle.
2. **Liste d'unités fermée.** Elle ne contient **ni `paragraphes`, ni `slogans`, ni `mots`**. R03 et
   R06 échoueraient donc *même écrits en chiffres*.

R01 réussit parce que « 20 points » satisfait les deux : un chiffre, et `points` est dans la liste.

**Et même dans ce cas qui réussit, la modalité est perdue** : le contrat de l'Arbitre dit
« **exactement** 20 points », la structure dérivée dit `{min:20, max:null, exact:null}` — soit
« au moins 20 ». Parce que la regex lit la **demande brute** (« checklist de 20 points », sans
« exactement ») au lieu du **contrat** (qui, lui, porte « exactement »).

## H. Lock selection

```
QUANTITY_RELEVANT_LOCK_SELECTED = 1/3
```

| cas | verrous réellement sélectionnés | `volume` |
|---|---|---|
| R01 | `role, perimetre, format, **volume**, interdits, hypotheses, controle` | **OUI** |
| R03 | `role, perimetre, format, interdits, hypotheses, controle` | **NON** |
| R06 | `role, perimetre, interdits, hypotheses, controle` | **NON** |

Et il n'existe **qu'un seul** sélecteur de `volume`, `adaptive-lock-selector.js:161-170` :

```js
const quantityIds = quantitySourceIds(state);
if (list(state.completeness.quantities).length) {
  candidates.push({ id: "volume", reason: "Une ou plusieurs contraintes quantitatives doivent être
    rendues vérifiables.", priority: "mandatory", … });
}
```

Aucun mécanisme plus générique n'existe : le §10 demandait de ne pas présumer que `volume` est le bon
verrou — vérifié, c'est le seul, et sa condition unique est `quantities` non vide. Les obligations
issues de la prose ne l'atteignent pas.

## I. Projection

```
QUANTITY_PROJECTED = 1/3
```

| cas | sections du prompt livré | `CONTRAINTES QUANTIFIÉES` |
|---|---|---|
| R01 | RÔLE \| TÂCHE \| PÉRIMÈTRE \| FORMAT \| **CONTRAINTES QUANTIFIÉES** \| INTERDICTIONS \| INFOS MANQUANTES \| VÉRIFICATION | **OUI** |
| R03 | RÔLE \| TÂCHE \| PÉRIMÈTRE \| FORMAT \| INTERDICTIONS \| INFOS MANQUANTES \| VÉRIFICATION | **NON** |
| R06 | RÔLE \| TÂCHE \| PÉRIMÈTRE \| INTERDICTIONS \| INFOS MANQUANTES \| VÉRIFICATION | **NON** |

La projection est fidèle au verrou : là où `volume` est sélectionné, il est projeté. Ce n'est donc
pas un `PROJECTION_GAP`.

## J. Prompt Contract Gate

```
GATE_RAN = 3/3 · GATE_STATUS = PASS 3/3
GATE_QUANTITY_CHECK_EXECUTED = 1/3
QUANTITY_MISMATCH_DETECTED = 0/3
```

`prompt-contract-gate.js:149-159` :

```js
const q = plain(list(c.quantities)[0]);
if (list(c.quantities).length) {
  … lock_id: 'volume', source_path: 'quantities[0]' …        // exigence REQUIRED
} else na('quantity', 'quantity', 'quantities', 'volume');     // NOT_APPLICABLE
```

Le gate construit une exigence quantitative **si et seulement si** `contract.quantities` est non
vide. Sinon il déclare la quantité `NOT_APPLICABLE` — et il a raison : le contrat ne porte aucune
obligation quantitative. Sa règle existe et fonctionne (`QUANTITY_MISMATCH`, lignes 500 et 508) ;
elle n'est simplement jamais armée.

```
Classification : PROMPT_GATE_INPUT_GAP — et non PROMPT_GATE_RULE_GAP.
```

C'est la réponse au §15, et elle est nette : **A. le gate n'a jamais reçu la quantité comme
obligation.** Conformément au §7 de 02C, on ne lui reproche pas de ne pas contrôler ce qu'il n'a
jamais reçu.

## K. Final Prompt

```
FINAL_PROMPT_PRESERVES_QUANTITY = 3/3 en TEXTE · 1/3 en CONTRAINTE OPPOSABLE
```

| cas | valeur exacte | cible exacte | modalité préservée | forme |
|---|---|---|---|---|
| R01 | 20 | points | **NON** (« exactement » → `min:20`) | section `CONTRAINTES QUANTIFIÉES` + `TÂCHE` |
| R03 | cinq | paragraphes | oui (dans la demande recopiée) | `TÂCHE` **seulement** |
| R06 | dix, huit | slogans, mots | oui (idem) | `TÂCHE` **seulement** |

La nuance est décisive, et c'est elle qui explique pourquoi 02A avait pu mesurer « 28/28 jetons
conservés » tout en manquant le défaut : **la quantité est bien dans le prompt, parce que la demande
y est recopiée mot pour mot dans `TÂCHE`.** Elle n'y est pas comme **contrainte** : ni règle
quantifiée, ni point de vérification. Un modèle lisant le prompt de R06 voit « dix slogans de moins de
huit mots » dans l'énoncé de la tâche, et aucune obligation ni aucun contrôle sur ces deux nombres.

## L. Trace — R01

```
20 points
 → ARBITER   : confirmed_constraints[0] = "Le livrable doit contenir exactement 20 points"   ✓
 → CANONICAL : quantities = []   ✗   |   intent.explicit_constraints[0].text = "…exactement 20 points"   ✓ (prose)
 → ADN       : completeness.quantities = [{target:"éléments", min:20, max:null, exact:null}]   ✓ via LEGACY detecterQuantite
 → LOCK      : volume   ✓
 → PROJECTION: CONTRAINTES QUANTIFIÉES   ✓
 → GATE      : exigence armée, PASS   ✓
 → PROMPT    : 20 présent, mais modalité DÉGRADÉE (exactement → au moins)
 FIRST_BREAK = CANONICAL_MAPPING_GAP   (rattrapé par la voie legacy, avec perte de modalité)
```

## M. Trace — R03

```
cinq paragraphes
 → ARBITER   : confirmed_constraints[0] = "Exactement cinq paragraphes"   ✓
 → CANONICAL : quantities = []   ✗   |   explicit_constraints ✓ (prose)
 → ADN       : completeness.quantities = []   ✗   (« cinq » non reconnu ; « paragraphes » hors liste)
 → LOCK      : volume NON
 → PROJECTION: CONTRAINTES QUANTIFIÉES NON
 → GATE      : quantité NOT_APPLICABLE, PASS
 → PROMPT    : « cinq » présent dans TÂCHE seulement, aucune contrainte
 FIRST_BREAK = CANONICAL_MAPPING_GAP
```

## N. Trace — R06

```
dix slogans / moins de huit mots
 → ARBITER   : confirmed_constraints = ["Exactement dix slogans", "Moins de huit mots par slogan"]   ✓
 → CANONICAL : quantities = []   ✗   |   explicit_constraints ✓ (prose, 2 entrées)
 → ADN       : completeness.quantities = []   ✗
 → LOCK      : volume NON
 → PROJECTION: CONTRAINTES QUANTIFIÉES NON
 → GATE      : quantité NOT_APPLICABLE, PASS
 → PROMPT    : « dix » et « huit » présents dans TÂCHE seulement
 FIRST_BREAK = CANONICAL_MAPPING_GAP
```

## O. First-break analysis

| CASE | USER_QUANTITY | ARBITER | CANONICAL | ADN | LOCK | PROJECTION | GATE | FINAL_PROMPT | FIRST_BREAK |
|---|---|---|---|---|---|---|---|---|---|
| R01 | 20 points | YES | **prose seule** | YES¹ | YES | YES | PASS | texte + contrainte² | `CANONICAL_MAPPING_GAP` |
| R03 | cinq paragraphes | YES | **prose seule** | NO | NO | NO | PASS | texte seul | `CANONICAL_MAPPING_GAP` |
| R06 | dix slogans / huit mots | YES | **prose seule** | NO | NO | NO | PASS | texte seul | `CANONICAL_MAPPING_GAP` |

¹ par la voie **legacy**, non par le contrat. ² modalité dégradée.

Une seule cause première pour les trois cas, conformément au §18 : je ne liste pas les conséquences
aval (`LOCK_SELECTION`, `PROJECTION`, `PROMPT_GATE_INPUT`) comme des causes distinctes. Elles sont
toutes déterminées par `quantities = []`.

## P. Common root cause

```
COMMON_ROOT_CAUSE =
  Le contrat canonique n'a aucun canal STRUCTURÉ pour une quantité. mapOprieToCanonicalContract
  porte confirmed_constraints en prose vers intent.explicit_constraints et laisse quantities vide ;
  la seule source structurée de Rapide reste detecterQuantite(demande), une regex legacy sur la
  demande brute, limitée aux chiffres et à une liste d'unités fermée.
```

`MULTIPLE_ROOT_CAUSES = NO.` Les trois cas partagent exactement cette cause, et les deux limites
lexicales de la voie legacy n'en sont pas une seconde : elles expliquent seulement pourquoi le
rattrapage fonctionne sur R01 et pas sur R03/R06.

**Asymétrie Rapide / Architecte, et elle est éclairante.** L'Architecte *possède* une dérivation
structurée — `arch-canonical-enrichment.js :: enrichQuantities` lit
`analysis.livrable.quantites = {min, max, unite}`, un champ **structuré** du schéma 3.4, et remplit
`target.quantities`. Son commentaire dit d'ailleurs : « Le schéma 3.4 ne porte pas de champ `exact` :
ARCH ne peut donc jamais produire une exactitude. **La limite est de la source, pas du mapping.** »
La même phrase s'applique mot pour mot à Rapide — à ceci près que Rapide n'a aucune source
structurée du tout. C'est le troisième lot consécutif où Architecte possède la forme correcte et
Rapide ne l'a pas (cf. 02C).

## Q. Evidence quality

| preuve | qualité |
|---|---|
| sorties d'Arbitre (R01, R03, R06) | **`REAL_ARBITER`** — 3 appels au Worker déployé, HTTP 200, états réels |
| contrats canoniques | **`REAL_CANONICAL`** — produits par `mapOprieToCanonicalContract` sur ces sorties, `verdict.ok = true` |
| état ADN, verrous, projection, prompt | **`REAL_CANONICAL`** — chaîne exécutée sur ces contrats via `runRapidePipeline` |
| `detecterQuantite`, `UNITES_COMPTABLES`, sélecteur de verrous, gate | **`STATIC_CODE_TRACE`** — lus dans la production |
| — | aucune `FIXTURE` dans la chaîne causale |

```
REAL_EVIDENCE_SUFFICIENT = YES
FIXTURE_ONLY_CAUSAL_CLAIM = NO
```

Le §22 est satisfait : la rupture supposée était au niveau ou avant le mapping canonique, et la preuve
repose sur trois Arbitres réels, non sur une fixture.

## R. Tests

Aucun test ajouté ni modifié — le lot est en lecture seule. Réutilisés : le corpus
`evaluation/corpus-lot10g2a.json`, le harnais `tests/rapide-assembler-harness.helper.mjs`
(`runRapidePipeline`), et le mapper de production importé directement. Les scripts de trace vivent
hors du dépôt.

Coût des appels réels : 3 tours profonds, ~0,43 USD au tarif mesuré en 1D-K (0,144 USD/tour).

## S. Minimal next correction

```
MINIMAL_NEXT_CORRECTION =
  ouvrir un canal STRUCTURÉ pour la quantité entre l'Arbitre et contract.quantities.
```

Ce que cela implique, et pourquoi je ne le fais pas ici : la correction n'est **pas** locale, contrairement
aux lots 02B et 02C. Elle exige une décision d'amont, car aucune des deux options n'est neutre :

- **Option 1 — structurer à la source.** Ajouter au candidat de l'Arbitre un champ de quantité
  structuré (`{target, unit, exact, min, max}`). C'est un **changement de schéma et de prompt** des
  rôles Deep — interdit dans 02D, et à peser : c'est la seule option qui préserve la **modalité**
  (« exactement » vs « au moins »), que la voie legacy perd même quand elle réussit.
- **Option 2 — dériver de la prose dans le mapper.** Lire `confirmed_constraints[].text` et en
  extraire une structure. C'est exactement le **codage lexical en dur** que `GATE-103` interdit
  (« ni appariement flou, ni seuil sémantique, ni codage en dur du domaine »), et cela reproduirait
  au niveau canonique le défaut de `detecterQuantite`.

Je ne tranche pas entre les deux : c'est un arbitrage de gouvernance, pas un choix technique. Et une
troisième voie existe peut-être — faire lire au sélecteur de verrous les **obligations** plutôt que
`quantities` — mais elle déplacerait l'autorité de sélection vers de la prose, ce qui mérite son
propre examen.

`NEW_COMPONENT_REQUIRED = NO` · `NEW_ARCHITECTURE_REQUIRED = NOT_PROVEN`

## T. Verdict

La quantité n'est pas perdue par négligence : elle est perdue **par absence de forme**. L'Arbitre la
comprend et l'énonce correctement — « Exactement dix slogans », « Moins de huit mots par slogan » —
et le mapper la transmet fidèlement. Mais il la transmet comme une phrase, et le système ne sait
contraindre que des nombres. `contract.quantities` est un champ structuré sans producteur structuré.

Tout le reste en découle mécaniquement : un seul sélecteur choisit `volume`, et sa seule condition est
`quantities` non vide ; la projection est fidèle au verrou absent ; et le gate, dont la règle
`QUANTITY_MISMATCH` existe et fonctionne, déclare la quantité `NOT_APPLICABLE` parce que le contrat
ne lui en présente aucune. `PROMPT_GATE_INPUT_GAP`, pas `PROMPT_GATE_RULE_GAP` — la réserve de 02B
est levée.

Le cas qui réussit est le plus instructif. R01 passe non par le contrat mais par une regex héritée
sur la demande brute, qui exige un chiffre et une unité figurant dans une liste fermée où manquent
`paragraphes`, `slogans` et `mots`. Et elle lit la demande plutôt que le contrat : elle perd donc
l'« exactement » que l'Arbitre avait pourtant établi, et transforme une exigence exacte en minimum.

Enfin, l'Architecte dispose déjà de la forme correcte — `enrichQuantities` dérive une structure d'un
champ structuré du schéma 3.4 — et son propre commentaire énonce le principe qui manque à Rapide :
*la limite est de la source, pas du mapping*. C'est le troisième lot consécutif où le mode Architecte
porte la bonne forme et Rapide ne l'a pas.
