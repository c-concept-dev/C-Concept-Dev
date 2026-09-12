# ATELIER_CANONICAL_QUANTITY_TO_ADN_FIX_02E

**Nature** — `TARGETED PRODUCTION FIX`
**Lot précédent** — `ATELIER_QUANTITY_TRACE_ARBITER_TO_PROMPT_02D` (read-only)
**Base git** — `0b78458` (`ATELIER-RAPIDE-CANONICAL-FAIL-CLOSED-FIX-02C`)
**Aucun secret, aucune clé, aucun identifiant ne figure dans ce document.**
**`PUSH = NO` · `DEPLOY = NO`**

> Principe appliqué, énoncé par le propriétaire produit :
> *« Une quantité déjà comprise comme contrainte utilisateur ne doit jamais être redécouverte
> depuis le texte brut pour devenir effective. »*

---

## A. Baseline

| Élément | Valeur |
|---|---|
| `HEAD` avant lot | `0b78458` |
| Sous-arbre Atelier muté hors Claude | NON (`git status` propre hors travaux 02B/02C/02D non commités par le propriétaire) |
| Suite globale avant lot | **3012 tests / 3012 pass / 0 fail** (02E en ajoute 12 → 3024) |
| `FROZEN` avant lot | `PASS` (7 empreintes) |
| Empreinte HTML canonique avant | `d7c9e4a7ab22fc74307d741c741b1045400da2e71dea1e34994b7aaf21217486` |
| Empreinte HTML canonique après | `5ed464dcd45d6ddb0f2dec9db32fdbbcca830dc5b17a9372036a1ec99241c028` |
| Runtime compilé après | `40b0fc6bf224226381a64a3bc2aa07e543002e5ba3a41d0c27899a9313d2a073` (573 169 octets) |

Le corpus de mesure est celui de 02D : **trois sorties d'Arbitre réelles**, capturées par appel
effectif, conservées hors dépôt (`/tmp/q02d/arbiter-R01|R03|R06.json`) et rejouées telles quelles.
Aucune fixture n'a remplacé une sortie réelle.

| cas | demande réelle |
|---|---|
| **R01** | « Fais-moi une checklist de 20 points pour préparer un voyage en Italie » |
| **R03** | « Explique la photosynthèse à un enfant de 10 ans en cinq paragraphes courts » |
| **R06** | « Propose dix slogans chaleureux de moins de huit mots pour une boulangerie » |

---

## B. Cause 02D

02D avait établi que la compréhension n'est pas le point de rupture. L'Arbitre comprend la quantité
et la pose en contrainte confirmée, avec sa modalité :

```text
R01 → « Le livrable doit contenir exactement 20 points »
R03 → « Exactement cinq paragraphes »
R06 → « Exactement dix slogans »
```

Ces contraintes traversent le mapper et se retrouvent dans `intent.explicit_constraints[].text`.
Mais `quantities` restait vide, et le signal quantité de l'ADN Rapide ne venait pas de là : il
venait de `original_request`, relu par des motifs qui n'acceptaient que `\d{1,4}`.

**Précision apportée à 02D.** La trace 02D mesurait la sortie du *mapper* (`quantities: []`).
Remesuré ici sur le contrat **enrichi** — l'objet réellement consommé en production —, l'état avant
correction est plus nuancé, et pire que ce que 02D laissait croire :

```text
R01 AVANT | quantities = [{"target":"éléments","exact":null,"min":20,"max":null,"source":"derived_deterministic"}]
R03 AVANT | quantities = []
R06 AVANT | quantities = []
```

R01 n'était donc pas « sans quantité » : il portait une quantité **fausse**. La personne demandait
une checklist *de* 20 points, l'Arbitre confirmait *exactement* 20 points, et la règle `counted_unit`
rendait `min: 20` — c'est-à-dire « au moins 20 ». Une contrainte exacte était devenue un plancher.
Et la cible, `points`, avait été remplacée par le littéral `'éléments'`.

Deux défauts distincts, donc, sous un seul symptôme :

1. **dépendance à la forme lexicale** — « 5 paragraphes » produisait une contrainte, « cinq
   paragraphes » aucune ;
2. **perte de modalité et de cible** — même quand une quantité passait, elle ne portait ni la
   modalité que l'Arbitre avait confirmée, ni le mot que la personne avait employé.

---

## C. Chemin avant correction

Mesuré sur les trois cas réels, sept étapes, avant patch :

| étape | R01 | R03 | R06 |
|---|---|---|---|
| ARBITER (contrainte confirmée) | OK | OK | OK |
| CANONICAL (`quantities` exact) | ROMPU (`min:20`) | ROMPU (`[]`) | ROMPU (`[]`) |
| ADN (`completeness.quantities`) | ROMPU | ROMPU | ROMPU |
| LOCK (`volume`) | OUI | NON | NON |
| PROJECTION | ROMPU | ROMPU | ROMPU |
| GATE | `REQUIRED` mais `{min:20}` | `NOT_APPLICABLE` | `NOT_APPLICABLE` |
| FINAL | ROMPU | ROMPU | ROMPU |

`FIRST_BREAK` avant correction = **CANONICAL** sur les trois cas.

Le gate, côté exigences, recevait exactement ceci :

```text
R03/R06 AVANT → {"id":"quantity","status":"NOT_APPLICABLE","blocking":false,"expectation":null}
```

Un contrôle non armé ne peut rien refuser. `GATE_QUANTITY_CHECK_EXECUTED` valait donc 1/3 — et ce
tiers contrôlait la mauvaise modalité.

---

## D. Source legacy

La voie legacy est `detecterQuantite(demande)`, appelée sur la **demande brute**, puis lue par
`adnQuantitiesFromRapid(ctx)` via `ctx.quantiteExplicite` / `ctx.quantite`.

Deux propriétés la rendent structurellement inapte à porter ce signal :

- elle n'accepte que `\d{1,4}` — les nombres écrits en mots lui sont invisibles ;
- elle dépend de `UNITES_COMPTABLES`, un lexique d'unités qui ne contient ni `paragraphes`, ni
  `slogans`, ni `mots`.

Ces deux manques ne sont pas des oublis à combler : combler le second reviendrait à faire grandir un
lexique métier au rythme des demandes reçues, ce que le lot interdit explicitement. **Aucun mot n'a
été ajouté à `UNITES_COMPTABLES`.** `UNIT_LEXICON_EXPANDED = NO`, et `T-02E-09` le fige.

La voie legacy n'a pas été supprimée (cf. §S) : elle n'est simplement plus la source.

---

## E. Source canonique

Le point canonique existant le plus proche était déjà là, rempli, confirmé, et ignoré :

```text
contract.intent.explicit_constraints[].text
```

C'est la représentation dans laquelle l'Arbitre a déjà écrit la contrainte avec sa modalité. Aucun
champ n'a été créé, aucun schéma modifié : la correction consiste à **lire ce qui était écrit**.

`CANONICAL_SCHEMA_CHANGED = NO`.

---

## F. Correction minimale

Deux fichiers de production, un seul mécanisme, aucun nouveau composant.

### F.1 — `core/adn/rapide-canonical-enrichment.js`

**(a) La contrainte canonique devient la source ; la demande brute devient un repli.**

```js
const contraintesCanoniques = list(plain(contract.intent).explicit_constraints)
  .map((item, i) => ({ text: text(item?.text), index: i }))
  .filter((item) => item.text);
let quantity = null;
let quantitySource = null;
for (const item of contraintesCanoniques) {
  const derive = deriveQuantityFromRequest(item.text, { counting_units, number_words });
  if (derive) { quantity = derive; quantitySource = `intent.explicit_constraints[${item.index}]`; break; }
}
if (!quantity) {
  quantity = deriveQuantityFromRequest(request, { counting_units, number_words });
  if (quantity) quantitySource = 'original_request';
}
```

La demande brute n'est plus *nécessaire* pour retrouver ce que le contrat sait déjà. Elle reste
lisible pour le cas où aucune contrainte confirmée ne porte de quantité — un repli, pas une autorité.
`RAW_USER_TEXT_REQUIRED_FOR_QUANTITY = NO`.

**(b) La cible est lue, plus supposée.**

```js
target: text(quantity.target) || 'éléments',
```

**(c) L'écriture du nombre devient indifférente, par vocabulaire injecté.**

```js
function quantityNumberPattern(number_words) { /* alternance construite depuis les clés fournies */ }
function resolveQuantityNumber(token, number_words) { /* chiffre → parseInt ; mot → table */ }
```

La fonction ne connaît **aucun** mot : elle reçoit un inventaire et une position. Sans
`number_words`, elle se comporte exactement comme avant le lot.

**(d) La garde d'autorité est inchangée.**

```js
if (quantity && !list(contract.quantities).length) { … }
```

Une `quantities` déjà remplie en amont (USER, ou ARCH) l'emporte sur toute dérivation, comme avant.
Aucune fusion, aucune moyenne, aucune seconde autorité. `SECOND_AUTHORITY_CREATED = NO`.

### F.2 — `atelier-prompts-v11.5-lot10g-decision-provider.html`

L'inventaire de nombres est déclaré à côté de `UNITES_COMPTABLES` et injecté au point d'appel
existant (`rapideProjectionCanonique`) :

```js
      format_vocabulary:rapideVocabulaireFormats(),
      counting_units:UNITES_COMPTABLES,
      number_words:NOMBRES_ECRITS
```

`ARBITER_CHANGED = NO` · `PROMPT_GATE_CHANGED = NO` · `FAST_DEEP_CHANGED = NO` ·
`NEW_COMPONENT_CREATED = NO` · `NEW_ARCHITECTURE_CREATED = NO`.

---

## G. Quantity derivation

Sept règles, toutes conservées, toutes désormais indifférentes à l'écriture du nombre et porteuses
d'une cible lue :

| règle | forme | rendu |
|---|---|---|
| `exact_explicit` | « exactement N \<cible\> » | `{exact:N, target}` |
| `range` / `range_reversed` | « entre A et B \<cible\> » | `{min, max, target}` |
| `lower_bound` | « au moins / au minimum / minimum / mini / pas moins de N » | `{min:N, target}` |
| `lower_bound_suffix` | « N (au) minimum » | `{min:N, target:null}` |
| `upper_bound` | « au plus / au maximum / maximum / max / pas plus de / **moins de** N » | `{max:N, target}` |
| `counted_unit` | « N \<unité comptable\> » | `{min:N, target}` |

**Ajout à déclarer explicitement.** `moins de` a été ajouté à l'alternance `upper_bound`. Le §6 du
brief énumère les modalités à préserver — « exactement N, au moins N, au maximum N, entre A et B,
longueur cible » — et `moins de` n'y figure pas. Je l'ai ajouté parce que R06, cas réel du corpus,
porte « de **moins de** huit mots par slogan » : sans cette forme, une borne haute réellement
exprimée par la personne restait muette. C'est un **choix de ma part, réversible d'une ligne**, et je
le signale plutôt que de le laisser passer dans un diff.

### Un point de grammaire, pas un cas particulier

`un` et `une` sont **exclus** de l'inventaire. Ce sont les deux seuls cardinaux français qui sont
aussi des articles : les inclure faisait qu'« **une** fonction de code » — où personne n'a rien
dénombré — produisait `{min:1, target:'fonction'}`, parce que `fonctions?` figure dans
`UNITES_COMPTABLES`. Le défaut a été **réellement rencontré et mesuré** : il a fait échouer
`T-QG02B-27`. Le chiffre `1` reste accepté ; il n'est jamais un article.

C'est une règle générale de langue, pas une exception inscrite pour faire passer un test.

---

## H. ADN signal

Mesuré après correction, sur les trois cas réels :

```text
R01 → [{"id":"Q-001","target":"points","unit":null,"exact":20,"min":null,"max":null,"obligation_ids":[]}]
R03 → [{"id":"Q-001","target":"paragraphes","unit":null,"exact":5,"min":null,"max":null,"obligation_ids":[]}]
R06 → [{"id":"Q-001","target":"slogans","unit":null,"exact":10,"min":null,"max":null,"obligation_ids":[]}]
```

`QUANTITY_VISIBLE_TO_ADN = 3/3`, avec la valeur, **la cible que la personne a employée**, et **la
modalité que l'Arbitre avait confirmée**.

---

## I. Lock selection

`volume` est sélectionné **3/3** après correction (1/3 avant). La politique de sélection n'a pas été
touchée : le verrou était déjà conditionné à la présence d'une quantité, et la quantité arrive
désormais. `QUANTITY_RELEVANT_LOCK_SELECTED = 3/3`.

---

## J. Projection

C'est ici que l'honnêteté du rapport se joue, parce que la chaîne ne se referme pas entièrement.

**R01 — projeté.**

```text
## CONTRAINTES QUANTIFIÉES
- Exactement 20 éléments, sans doublon.
```

Valeur juste, modalité juste. La cible s'affiche `éléments` et non `points` : la ligne est rendue par
`'Exactement ' + q.exact + ' ' + (ctx.fmt.unite || 'éléments')`, qui lit **l'unité du format**, pas
la cible canonique.

**R03 et R06 — non projetés.**

```text
## CONTRAINTES QUANTIFIÉES
- Volume attendu : aussi court que le sujet le permet, sans remplissage mots.
```

La quantité est absente. La cause est une garde de rendu antérieure au lot :

```js
if(!ctx.fmt.enumerable)
  return t + '- Volume attendu : ' + ctx.mots + ' mots.\n' + …
```

R03 et R06 ne sont pas des formats énumérables (`explication`, `reponse_simple`). La section retourne
avant d'atteindre la ligne de quantité. Le contrat le sait, l'ADN le sait, le gate l'exige — le
gabarit ne l'écrit pas.

`QUANTITY_PROJECTED = 1/3`.

Cette garde est une **politique de rendu**, hors frontière de ce lot (§FRONTIÈRE : « ne pas modifier
la politique de projection »), et le code la justifie explicitement là où elle est écrite. Elle est
consignée en dette (§S) et non corrigée ici.

---

## K. Gate

Le gate n'a pas été modifié. Rejoué après correction, il reçoit :

```text
R01 → {"id":"quantity","status":"REQUIRED","lock_id":"volume","blocking":true,"source_path":"quantities[0]","expectation":{"exact":20,"min":null,"max":null}}
R03 → {"id":"quantity","status":"REQUIRED","lock_id":"volume","blocking":true,"source_path":"quantities[0]","expectation":{"exact":5,"min":null,"max":null}}
R06 → {"id":"quantity","status":"REQUIRED","lock_id":"volume","blocking":true,"source_path":"quantities[0]","expectation":{"exact":10,"min":null,"max":null}}
```

| | avant | après |
|---|---|---|
| `GATE_QUANTITY_CHECK_EXECUTED` | 1/3 (et sur `min:20`, modalité fausse) | **3/3, `blocking:true`, modalité juste** |

Le gate reçoit désormais la contrainte qu'il ne pouvait auparavant pas contrôler. `T-02E-10` le fige.

---

## L. Numeric vs written

L'équivalence est éprouvée par égalité stricte entre les deux écritures, non par deux assertions
séparées :

```js
assert.deepEqual(
  deriveQuantityFromRequest('Donne sept idées.', { counting_units: UNITES, number_words: { sept: 7 } }),
  deriveQuantityFromRequest('Donne 7 idées.',    { counting_units: UNITES }));
```

Et au niveau du contrat (`T-02E-03`), « exactement cinq paragraphes » et « exactement 5 paragraphes »
produisent la **même** quantité canonique. `NUMERIC_AND_WRITTEN_EQUIVALENCE = PASS`.

---

## M. Modalities

| modalité | test | résultat |
|---|---|---|
| exacte | `T-02E-04` | `PASS` |
| minimum | `T-02E-05` | `PASS` |
| maximum | `T-02E-06` | `PASS` |

Sur le corpus réel, la modalité `exact` survit 3/3 là où elle était 0/3 (R01 la dégradait en `min`).
`MODALITY_PRESERVED = PASS`.

---

## N. Non-hardcoding

Ce que le lot interdisait, et ce qui a été fait :

| interdiction | état |
|---|---|
| ajouter `paragraphes` | non ajouté |
| ajouter `slogans` | non ajouté |
| ajouter des professions / domaines | non ajouté |
| liste extensible de mots métier | non créée |
| une regex par cas | non créée — les six règles préexistantes sont conservées telles quelles |
| étendre `UNITES_COMPTABLES` | **inchangé**, figé par `T-02E-09` |

Le seul vocabulaire introduit est un inventaire **grammatical clos** de nombres écrits, injecté de
l'extérieur comme `counting_units` l'était déjà. Il ne grandit pas avec le produit.

Deux tests ferment la porte au faux positif et au hardcodage :

- `T-02E-08` — « Le tempo doit être de 120 BPM », « La température cible est 180 degrés », « Le
  budget est de 5000 euros » ne produisent **aucune** quantité de livrable : aucune modalité de
  dénombrement n'y figure. Et quand une modalité *est* présente — « Exactement 120 BPM » — la cible
  rendue est `bpm`, jamais `éléments` : c'est précisément la lecture de la cible qui empêche un
  nombre métier de se déguiser en quantité de livrable ;
- `T-02E-11` — « Produis exactement sept éléments », formulation qu'aucune règle du correctif ne
  traite spécialement, est dérivée correctement (`exact:7`, `target:'elements'`) **sans ajout de
  code**.

`DOMAIN_HARDCODING_ADDED = NO` · `BUSINESS_NUMBER_FALSE_POSITIVE = NO`.

---

## O. Corpus 02D

Rejeu des sept étapes, après correction, sur les trois sorties d'Arbitre réelles :

| cas | ARBITER | CANONICAL | ADN | LOCK | PROJECTION | GATE | FINAL | `FIRST_BREAK` |
|---|---|---|---|---|---|---|---|---|
| **R01** | OK | OK | OK | OK | OK | OK | OK | **NONE** |
| **R03** | OK | OK | OK | OK | ROMPU | OK | ROMPU | **PROJECTION** |
| **R06** | OK | OK | OK | OK | ROMPU | OK | ROMPU | **PROJECTION** |

`FIRST_BREAK = NONE` est atteint sur **R01 seulement**. Sur R03 et R06 la rupture s'est **déplacée**
de CANONICAL (étape 2) à PROJECTION (étape 5) : les quatre étapes que ce lot devait réparer sont
réparées, et la rupture résiduelle est celle du gabarit de rendu, explicitement hors frontière.

Je ne déclare donc pas `FIRST_BREAK = NONE` sur les trois cas. Le brief l'attendait « sur les cas
couverts » ; les étapes couvertes par ce lot sont intactes 3/3, l'étape non couverte reste rompue 2/3.

**Vérification du prompt final.** Sur R03, `\b5\b` apparaît bien dans le prompt — mais dans
« 5. Reste-t-il un espace réservé… », un numéro de puce de la checklist de vérification. C'était un
faux positif de ma première mesure, corrigé. Le nombre demandé ne survit sur R03 et R06 que dans le
rappel de la tâche (`## TÂCHE`, qui reprend la demande), jamais comme contrainte opposable.

`FINAL_PROMPT_PRESERVES_QUANTITY = 1/3`.

---

## P. Tests ciblés

`tests/canonical-quantity-to-adn-02e.test.mjs` — **12 tests, 12 pass**. Le vocabulaire n'y est pas
redéclaré : les tests **lisent** `NOMBRES_ECRITS` et `UNITES_COMPTABLES` dans l'artefact HTML, pour
qu'un écart entre production et test soit impossible.

```text
T-02E-01  une quantité explicite du contrat canonique atteint l'ADN
T-02E-02  un nombre écrit en mots atteint l'ADN
T-02E-03  chiffres et lettres sont équivalents
T-02E-04  la modalité exacte est préservée
T-02E-05  la modalité minimum est préservée
T-02E-06  la modalité maximum est préservée
T-02E-07  la contrainte canonique est la source, la demande brute seulement un repli
T-02E-08  un nombre métier n'est pas pris pour une quantité de livrable
T-02E-09  aucun mot de domaine n'a été ajouté au lexique d'unités
T-02E-10  le gate reçoit désormais une obligation quantitative
T-02E-11  une quantité inconnue du correctif fonctionne sans ajout
T-02E-12  la dérivation ne lit plus la demande brute quand le contrat porte la contrainte
```

---

## Q. Tests globaux

**3024 tests / 3024 pass / 0 fail.**

Le premier lancement après patch donnait 27 échecs. Classement, un par un :

| test | classement | traitement |
|---|---|---|
| 20 tests d'empreinte HTML (`CANONICAL_HTML_CHANGED = NO`, `T-HTMLFINAL02-02…10`, …) | `STALE_FIXTURE` | rituel d'empreinte exécuté (§R) |
| `T-QG02B-27` | **`NEW_REGRESSION`** | **régression réelle, corrigée** : `un`/`une` dans l'inventaire faisaient compter « une fonction de code ». Les deux articles ont été retirés (§G). |
| `T-REN-06` | `STALE_FIXTURE` | attendait `target:'éléments'` ; la cible est désormais lue → `'idees'` |
| `T-REN-07` | `STALE_FIXTURE` | trois `deepEqual` sur une forme qui porte maintenant `target` |
| `T-REN-08` | `STALE_FIXTURE` | idem, + l'assertion « QUANTITY_WORDS_GAP hors périmètre » remplacée par l'invariant réel : **sans vocabulaire fourni, rien n'est inventé ; avec, l'écriture est indifférente** |
| `T-RAPCHAR01-06` | `STALE_FIXTURE` | `target` d'une fourchette ; l'assertion produit `/Entre 3 et 5/` est intacte |
| `T-RAPCHAR01-13` | `HISTORICAL_IMPLEMENTATION_CONTRACT` | **portait le nom de sa propre échéance** : `[EXPECTED_CANONICAL_FIX] … QUANTITY_WORDS_GAP`. Écrit pour échouer le jour où la correction arriverait. Réécrit pour éprouver l'équivalence elle-même. |
| `T-RAP01R-08` | `STALE_FIXTURE` | `target` d'une quantité exacte ; `T-RAP01R-33` (formulation unique et correcte) n'a pas bougé |

`UNKNOWN = 0`. Une seule régression réelle, trouvée et corrigée.

`T-RAPCHAR01-13` mérite d'être souligné : le dépôt avait **déjà nommé** l'écart que 02E referme. Sa
réécriture ne relâche rien — elle compare désormais « trois options » et « 3 options » et exige
qu'ils portent la même contrainte et sélectionnent le même verrou. L'écart legacy (« trois » reste
invisible à `detecterQuantite`) y est conservé en assertion, comme constat.

---

## R. FROZEN

`PASS`. Les sept empreintes sont **identiques** à celles d'avant le lot :

```text
moteur Rapide    3725f2c9335cb176084cf62c51472b5f02a1faa5bed496c424954c841a689664
moteur Architecte bebb29dc9a0b6f70fb23b22cf13e6573688d8e2dbfbfd54356a14bf1522b6d1e
moteur Atelier   8c3511538a96d4be3953270c4a5463da6b8d4807187a0b7d4b1c31c0e4589802
FORMATS          f4c9f1da5a14ecbe28d3cd0853871aa621909360ab6475bebeb76bc2191e141b
VERROUS          0019d7e26efab37164b435667d89494135cc4ae7f9f8206e95472435d1dd63ff
ARCH_SYSTEM      7fc7b736f6b80049c42a39d74a0fae76eee26d9e2af8249c7761de1ec3236317
ARCH_SCHEMA      a976687cf6412be80f74eac88762f8c4a4115fe30697bdefd0ea5e6e318fd84b
```

Aucune plage gelée n'a été touchée. C'est aussi ce qui explique §J : la ligne de rendu de la quantité
vit dans le moteur Rapide gelé, et la garde `!ctx.fmt.enumerable` avec elle.

**Rituel d'empreinte exécuté :**

1. `node tools/build-adn-browser-runtime.mjs` → `status OK`, 573 169 octets ;
2. empreinte HTML `d7c9e4a7…` → `5ed464dc…`, propagée dans les **15** fichiers de test qui l'épinglent ;
3. `node tools/build-release-manifest.mjs --tests=3024` → manifeste 15 737 octets,
   `sha256 83e409f2d897f501e33403b602a3265bdf77efc9e5f4c92f3c82bfeb0aa39ca9`,
   90 fichiers de release, `empreinteJeu b74910ddc3544dc284dc78b416cdcae689285b621ba4208baa49efb545176be9`,
   `nonClasses []`.

---

## S. Dette

**Dette retirée**

- La voie canonique ne dépend plus de la forme lexicale du nombre.
- La voie canonique ne dépend plus de `UNITES_COMPTABLES` pour la règle « exactement N \<cible\> ».
- La cible n'est plus un littéral `'éléments'` : elle est lue.
- `QUANTITY_WORDS_GAP`, nommé par le dépôt lui-même, est refermé.

**Dette créée** — aucune.

**Dette constatée, non traitée (hors frontière), par ordre d'effet produit**

1. **`FOLLOW_UP-02E-A` — la garde `!ctx.fmt.enumerable` empêche la projection.**
   C'est la rupture résiduelle 2/3 de §J : sur un format non énumérable, la section
   `CONTRAINTES QUANTIFIÉES` retourne avant d'écrire la quantité, même exacte, même exigée par le
   gate. C'est ce qui fait que « exactement cinq paragraphes » n'atteint toujours pas le prompt.
   *Politique de projection + plage gelée `moteur Rapide` → décision propriétaire requise.*

2. **`FOLLOW_UP-02E-B` — la ligne projetée affiche l'unité du format, pas la cible canonique.**
   R01 rend « Exactement 20 éléments » alors que le contrat porte `target: "points"`.
   `ctx.fmt.unite || 'éléments'` ignore `quantities[0].target`, désormais fiable.
   *Même plage gelée, même nature de décision.*

3. **`FOLLOW_UP-02E-C` — `detecterQuantite` / `adnQuantitiesFromRapid` restent branchés.**
   La voie legacy n'est plus la source sur le chemin canonique, mais elle subsiste. §18 du brief
   interdit de nettoyer au-delà du strictement nécessaire : sa suppression n'était pas nécessaire au
   correctif, elle n'a pas été faite. Le dépôt qualifie déjà `adnMergeLegacyLocks` de
   `[CARACTÉRISATION — COMPORTEMENT DESTINÉ À DISPARAÎTRE]` (`T-RAPCHAR-13b`).

4. **`FOLLOW_UP-02E-D` — `moins de` ajouté à `upper_bound`.**
   Justifié par R06, absent de la liste de modalités du §6. Réversible d'une ligne (§G).

---

## T. Verdict

La cause racine identifiée par 02D est corrigée : la quantité comprise par l'Arbitre n'est plus
redécouverte depuis le texte brut pour devenir effective. Elle est **lue là où elle était déjà
écrite**, elle traverse l'ADN avec sa valeur, sa cible et sa modalité, elle sélectionne le verrou, et
elle arme le contrôle du gate — 3/3 sur les trois cas réels.

Elle n'atteint le prompt final que sur 1 cas sur 3. La rupture s'est déplacée vers une garde de rendu
antérieure, située dans une plage gelée et explicitement hors frontière du lot. Je ne l'ai pas
franchie, et je ne présente pas la chaîne comme refermée.

Un point de méthode, énoncé sans détour : une régression réelle a été introduite pendant ce lot
(`un`/`une` comptés comme cardinaux), trouvée par la suite existante, et corrigée par une règle de
grammaire générale plutôt que par une exception. C'est la suite qui l'a vue, pas moi.

### Verdict formel

```text
SUBLOT = ATELIER_CANONICAL_QUANTITY_TO_ADN_FIX_02E

ROOT_CAUSE_FIXED                     = YES
CANONICAL_QUANTITY_SOURCE_USED       = YES
RAW_USER_TEXT_REQUIRED_FOR_QUANTITY  = NO
LEGACY_QUANTITY_AUTHORITY            = NO

QUANTITY_PRESENT_IN_CANONICAL        = 3/3
QUANTITY_VISIBLE_TO_ADN              = 3/3
QUANTITY_RELEVANT_LOCK_SELECTED      = 3/3
QUANTITY_PROJECTED                   = 1/3
GATE_QUANTITY_CHECK_EXECUTED         = 3/3
FINAL_PROMPT_PRESERVES_QUANTITY      = 1/3

NUMERIC_WRITTEN_EQUIVALENCE          = PASS
EXACT_MODALITY                       = PASS
MIN_MODALITY                         = PASS
MAX_MODALITY                         = PASS
CANONICAL_OVERRIDES_LEGACY           = PASS

BUSINESS_NUMBER_FALSE_POSITIVE       = NO
DOMAIN_HARDCODING_ADDED              = NO
UNIT_LEXICON_EXPANDED                = NO
ARBITER_CHANGED                      = NO
PROMPT_GATE_CHANGED                  = NO
CANONICAL_SCHEMA_CHANGED             = NO
FAST_DEEP_CHANGED                    = NO
NEW_COMPONENT_CREATED                = NO
NEW_ARCHITECTURE_CREATED             = NO
SECOND_AUTHORITY_CREATED             = NO

TARGETED_TESTS                       = 12/12 PASS
GLOBAL_TESTS                         = 3024/3024 PASS
FROZEN                               = PASS

LOT_GATE                             = NON_GELABLE
```

`LOT_GATE = NON_GELABLE` est prononcé sur un seul critère du §CRITÈRE DE PASS :
`FINAL_PROMPT_PRESERVES_QUANTITY` exige `PASS` et vaut 1/3. Les dix autres critères sont `PASS`.
La cause du manquant est `FOLLOW_UP-02E-A` — une garde de rendu située dans la plage gelée
`moteur Rapide`, que le §FRONTIÈRE de ce lot interdit de toucher. Le correctif est complet dans sa
frontière ; le gel dépend d'une décision qui appartient au propriétaire produit.
