# OPRIE-MATERIAL-PROVENANCE-01 — Une étiquette que personne n'a jamais définie

Le lot précédent a fait lire le matériau à l'Analyste, puis lui a fait porter ce qu'il y lit avec
la provenance `explicit_user_statement`. Le Critique a refusé. Ce lot demande la seule question
qui vaille : **cette provenance était-elle correcte ?**

La réponse est qu'on ne peut pas le savoir — parce qu'elle n'est définie nulle part.

**Aucun code de production n'a été modifié.**

---

## A. Modèle de provenance actuel

Chaque élément matériel du candidat doit porter un enregistrement
`{field, value, provenance}`. Huit valeurs sont légales. Elles décrivent **comment un fait est
venu à la connaissance du système** : une déclaration, une réponse, une préférence, une déduction,
une délégation, un fait à rechercher, une estimation, un scénario.

---

## B. Énumération et schéma

```js
export const PROVENANCE_VALUES = Object.freeze([
  "explicit_user_statement", "clarification_answer", "confirmed_preference", "safe_deduction",
  "delegated_decision", "external_fact_to_research", "labeled_estimate", "conditional_scenario"
]);
```

`core/adn/operational-request-state.js`, repris tel quel dans le schéma JSON envoyé aux trois
fournisseurs :

```js
provenance: { type: "string", enum: [...PROVENANCE_VALUES] }
```

**Le schéma ne porte aucun champ `description`.** Les huit valeurs voyagent jusqu'au modèle comme
huit chaînes nues.

---

## C. Sémantique de `explicit_user_statement`

**Il n'en existe aucune.**

| Où on a cherché | Ce qu'on a trouvé |
| --- | --- |
| `core/adn/operational-request-state.js` | le nom, dans un tableau gelé |
| Schéma JSON de l'Analyste | le nom, dans un `enum`, sans `description` |
| Prompt Analyste, règle 2 | les huit noms énumérés, aucun défini |
| Prompt Critique | aucune définition |
| Prompt Arbitre | aucune mention |
| `docs/` | aucune définition |
| Tests | des usages, jamais une définition |

La seule chose qui approche une définition est une **règle de vérification chez le Critique**, et
elle ne parle pas de `explicit_user_statement` en particulier :

> *« Vérifiez que chaque élément matériel du candidat est réellement **ancré dans original_request
> ou clarification_history** via sa provenance déclarée. »*

**`EXPLICIT_USER_STATEMENT_INCLUDES_MATERIAL_FACT = AMBIGUOUS`.** Le nom se lit naturellement comme
« la personne l'a dit elle-même ». La règle d'ancrage du Critique le confirme opérationnellement.
Mais aucun artefact contractuel ne l'écrit, donc rien ne le **prouve** — ni dans un sens, ni dans
l'autre.

---

## D. L'écrivain — l'Analyste

L'Analyste est le seul producteur. Depuis OPRIE-MATERIAL-INTERPRETATION-01, son contrat lui dit :

> *« Un fait lu dans material_content a une provenance, et c'est explicit_user_statement : la
> personne a fourni ce matériau avec sa demande, ce qu'il énonce vient donc d'elle. »*

**Cette phrase affirme une sémantique que le contrat n'établit pas.** Elle est raisonnable ; elle
n'est pas fondée. Le §23 de ce lot demandait de la traiter comme suspecte : elle l'est.

---

## E. Le consommateur déterministe — et il ne lit pas l'étiquette

```js
const hasProvenance = records.some((record) => record.field === field && sameValue(record.value, value));
```

`assessProvenance` apparie sur `field` + `value`. **Il n'inspecte jamais `record.provenance`.** Il
ne compare rien à `original_request` ni à `clarification_history`. Le seul consommateur
déterministe du système est donc **indifférent à l'étiquette** : il vérifie qu'un enregistrement
existe, pas qu'il dit vrai.

Ce qu'il gouverne : `unsupported_additions`, donc le `pass` de
`assessIntentPreservationDeterministic`.

---

## F. Le consommateur qui bloque — le Critique

Deux règles, et elles se referment l'une sur l'autre :

| Règle | Ce qu'elle dit |
| --- | --- |
| MISSION 1 | tout élément matériel doit être **ancré dans `original_request` ou `clarification_history`** |
| point 7 | *« VOUS NE RECEVEZ PAS CE CONTENU : […] jamais si l'Analyste a bien lu le matériau »* |

Une valeur issue du matériau n'est ancrée dans aucune des deux sources, et le Critique n'a aucun
moyen de vérifier qu'elle vient du matériau. **Il doit donc la lister en `unsupported_additions_found`,
et l'escalader en veto qualifié si elle est matérielle.** C'est exactement ce qu'il fait.

**`CRITIC_CURRENT_REJECTION_CONTRACTUALLY_VALID = YES`.** Le Critique n'est pas en faute : il
applique une règle écrite à une époque où ces deux sources étaient les seules. `material_content`
est arrivé à OPRIE-MATERIAL-CONTENT-02 ; cette règle n'a jamais été mise à jour.

---

## G. L'Arbitre, et OPRIE

L'Arbitre **reçoit** `provenance_records` à l'intérieur de `analyst_output`. Il n'a aucune règle
d'ancrage propre : sa seule mention de provenance interdit de justifier une information absente par
une intention implicite. Il retient le veto du Critique.
**`ARBITER_CURRENT_VETO_CONTRACTUALLY_VALID = PARTIAL`** — valide en tant qu'arbitrage d'un veto
fondé, mais rendu sans pouvoir départager, faute de recevoir même `material_context`.

En aval, `validateProvenanceRecord` vérifie l'appartenance à l'énumération, rien de plus.

---

## H. Statut gelé

| | |
| --- | --- |
| Dans une des sept plages `frozen-guard` | **non** — vérifié par calcul d'offsets sur l'artefact canonique |
| Protégé par un invariant de test | **oui, deux fois** |

```
tests/operational-request-state.test.mjs
  « PROVENANCE_VALUES couvre exactement le vocabulaire du CDC »

tests/operational-request-analyst-provenance-value.test.mjs
  « P1 : PROVENANCE_VALUES et CANDIDATE_FIELDS restent inchangés »
```

Le premier **trace le vocabulaire au CDC** — ce n'est pas un choix d'implémentation, c'est la
spécification. Le second est une garde anti-régression dont la raison d'être est précisément
d'empêcher qu'un lot modifie les valeurs légales.

**`PROVENANCE_SCHEMA_FROZEN = PARTIAL`** : pas par hachage, mais par invariant explicite adossé au
CDC. Étendre l'énumération exige de réécrire ces deux gardes, c'est-à-dire de casser volontairement
l'invariant qui existe pour l'interdire.

---

## I. Classification du fait matériau

| Origine factuelle | Provenance correcte |
| --- | --- |
| « le numéro de dossier est ZX-4821 », écrit dans la demande | `explicit_user_statement` |
| « ZX-4821 », lu dans un document que l'utilisateur a joint | **aucune valeur existante** |

Les deux viennent de l'utilisateur ; ce ne sont pas la même origine. Le contrat actuel ne peut pas
les distinguer, et **provenance n'est pas fiabilité** : un fait correctement sourcé sur un matériau
utilisateur n'est ni vrai, ni suffisant, ni pertinent pour autant.

---

## J. Options considérées

| Option | Verdict | Raison |
| --- | --- | --- |
| A — employer une provenance existante | impossible | aucune des huit ne couvre le cas |
| B — prouver que `explicit_user_statement` englobe le matériau | impossible | la valeur n'a aucune définition écrite |
| C — ajouter une provenance générique (`user_provided_material`) | **possible techniquement, bloqué contractuellement** | hors plages gelées, mais protégée par deux invariants tracés au CDC — **et sans effet seule**, la règle d'ancrage du Critique refusant aussi bien une provenance vraie qu'une fausse |
| D — assouplir le Critique sans provenance vraie | refusé | contournement explicitement interdit (§5, §46) |

---

## K. Décision : STOP

**`ROOT_CAUSE = WRONG_PROVENANCE` et `CRITIC_AWARENESS`, indissociables.**

Le vocabulaire ne comporte aucune valeur pour un fait porté par un matériau fourni par
l'utilisateur, **et** la règle d'ancrage du Critique énumère deux sources là où le contrat en
compte trois depuis OPRIE-MATERIAL-CONTENT-02.

Corriger l'une sans l'autre ne produit rien : une provenance vraie mais inconnue du Critique serait
refusée exactement comme la fausse. Et corriger le vocabulaire exige de modifier un invariant
tracé au CDC.

Le §17 le dit : *« Si OUI : ne pas changer seul. »* Le §44 : *« FROZEN_CONTRACT_CHANGE_REQUIRED →
STOP. Rapporter. Ne pas modifier seul. »*

---

## L, M, N. Rejeux

**Non exécutés, et c'est la conséquence de la décision.** Les tests synthétiques du §24 au §28
valident une provenance corrigée ; il n'en existe pas. Les rejeux Critique (§29) et Arbitre (§30)
sont explicitement conditionnés à *« APRÈS provenance corrigée »*. Le §49 interdit de rejouer
R08–R13 avant fermeture du cas synthétique.

Le comportement actuel de la chaîne est déjà mesuré, en réel, dans
`docs/OPRIE-MATERIAL-INTERPRETATION-01.md` : le rejouer sans changement n'aurait produit aucune
information nouvelle, au prix de plusieurs tours profonds.

---

## O. Régressions

Aucun code de production modifié, donc aucune régression possible. La suite est passée trois fois
de suite, FROZEN, BROWSER_RUNTIME et SECRET_SCAN au vert, à titre de contrôle d'intégrité de
l'arbre.

---

## P. Verdict

**BLOCKED.**

L'audit est complet et concluant : le schéma de provenance est identifié, la sémantique de
`explicit_user_statement` est établie comme **inexistante**, le fait matériau est classifié comme
**sans provenance correcte disponible**, les quatre consommateurs sont audités, et le statut
d'invariant du vocabulaire est déterminé.

Ce qui bloque n'est pas une incertitude : c'est une autorisation. Étendre un vocabulaire tracé au
CDC et corriger la règle d'ancrage du Critique sont deux décisions de contrat, pas deux détails
d'implémentation.

---

## Q. Prochaine action sûre

Un lot unique, car les deux moitiés sont indissociables — proposition à autoriser, non appliquée :

1. **Ajouter une seule valeur générique** au vocabulaire de provenance, par exemple
   `user_provided_material` : sans domaine, sans fournisseur, sans canal technique dans le nom, et
   dans la famille sémantique des huit existantes. Mettre à jour, en connaissance de cause, les
   deux gardes d'invariant et la trace au CDC.
2. **Corriger la règle d'ancrage du Critique** pour qu'elle énumère les trois sources du contrat
   au lieu de deux — correction factuelle d'une règle périmée, strictement symétrique de celle déjà
   appliquée à l'Analyste, et non une exemption accordée à une provenance fausse.
3. **Remplacer la phrase de l'Analyste** qui affirme `explicit_user_statement` pour un fait
   matériau : elle est aujourd'hui la seule source de cette sémantique, et elle n'est pas fondée.
4. **Aucun contenu brut** vers le Critique ni vers l'Arbitre : l'audit ne le rend pas nécessaire.
   Le Critique n'a pas besoin de lire le matériau pour accepter qu'une valeur en provienne — il a
   besoin que sa règle d'ancrage connaisse le canal.
