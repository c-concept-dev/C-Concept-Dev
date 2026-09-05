# OPRIE-MATERIAL-CONTEXT-01 — Un canal de matériau qui ne mène nulle part

## A. Découverte

Le lot précédent avait relevé que `/decision` reçoit `materiau_present` et que
`/operational-request` ne reçoit rien de tel. Ce lot devait vérifier si c'était un défaut réel.

**Ce l'est, et plus largement qu'annoncé.** Le produit possède un canal de matériau complet —
sélecteur de fichiers multiple, glisser-déposer, extraction de texte, stockage — et une autorité
de readiness — le plan profond, seul à décider depuis la migration OPRIE. **Les deux ne
communiquent pas.**

**Aucun appel fournisseur n'a été émis. Aucun code de production modifié. Aucun déploiement.**

---

## B. Contrats actuels

| | `/decision` | `/operational-request` |
| --- | --- | --- |
| Clés acceptées | `demande`, `materiau_present`, `mode_demande` | `original_request`, `clarification_history` |
| Matériau | **`materiau_present`, booléen strictement requis** | **aucun champ** |
| Validation | `typeof !== "boolean"` → 400 | `requireExactKeys` — toute clé en plus → 400 |
| Statut contractuel | *« `materiau_present` est un fait fiable : ne prétendez jamais qu'un matériau est présent lorsque sa valeur est false »* | — |

Entrées des rôles, telles que `buildRoleInput` les compose :

```
analyst  { original_request, clarification_history }
critic   { original_request, clarification_history, analyst_output, previous_vetoes }
arbiter  { original_request, clarification_history, analyst_output, critic_output }
```

`base` est diffusé aux trois. Un champ ajouté à `base` les atteindrait donc **tous les trois** —
ce qui n'est pas nécessairement souhaitable, voir G.

---

## C. Source de vérité du matériau

Elle existe, elle est unique, et elle est côté navigateur : **`state.docs`**.

```
{ name, type, size, text, external }
```

Alimentée par `#v11-files` — `multiple`, acceptant `.txt .md .json .csv .html .htm .pdf .docx
image/*` — et par le glisser-déposer. Le texte n'est extrait que pour les formats textuels ; les
autres sont marqués `external: true`, **sans contenu exploitable**.

**Le produit distingue donc déjà, de fait, un matériau *présent* d'un matériau *exploitable*.**
La distinction que la section 12 demandait d'auditer n'a pas à être inventée : elle est déjà là,
portée par un champ qui existe.

---

## D. Analyse du défaut

Le chemin réel, en une ligne :

```js
const body = { original_request: oprieOriginalRequest(), clarification_history: oprieClarificationHistory() };
```

et

```js
function oprieOriginalRequest(){ return String(($('#v11-demande')||{}).value||'').trim() }
```

**`state.docs` n'entre dans aucun des deux champs.** Le plan profond — devenu, selon le
commentaire du produit lui-même, *« la seule autorité de readiness »* — ignore entièrement les
documents joints par la personne.

`MATERIAL_CONTEXT_GAP = REAL`.

**Portée du défaut, à ne pas exagérer.** Il ne se manifeste que lorsqu'une demande *présuppose*
un intrant. Une demande autoportante n'est pas concernée : sur les 30 cas de l'oracle, **6 sont
affectés** — R08 à R13, ceux que le corpus étiquette « matériau présent ». Les huit cas
« matériau absent » ne le sont pas : là, l'absence est réelle et la clarification restera
correcte. Les seize autres relèvent d'un tout autre problème — objet ou livrable indéterminé.

**Ce qui manque exactement** n'est pas le contenu du matériau. C'est **le fait qu'un matériau
requis par la demande soit disponible, et s'il est exploitable**.

---

## E. Contrat proposé

Conçu selon les contraintes du lot : générique, additif, optionnel, orienté capacité, sans
taxonomie métier, compact.

```jsonc
// champ OPTIONNEL de /operational-request, à côté de original_request
"material_context": {
  "present": true | false | "unknown",   // un matériau est-il joint ?
  "usable":  true | false | "unknown"    // son contenu est-il exploitable par le raisonnement ?
}
```

**Deux dimensions, et deux seulement.** La section 13 en proposait quatre — `PRESENT`,
`ACCESSIBLE`, `USABLE`, `REQUIRED`. Deux sont écartées, et pour des raisons opposées :

- **`REQUIRED` n'appartient pas au contexte.** Déterminer si la demande *exige* un matériau est
  précisément le raisonnement de l'Analyste. Le lui fournir reviendrait à créer l'autorité
  parallèle que la section 4 interdit. Le contexte dit ce qui est **disponible**, jamais ce qui
  est **nécessaire**.
- **`ACCESSIBLE` n'a pas de porteur.** Dans ce produit, un fichier joint est lu immédiatement ou
  marqué `external` ; il n'existe pas d'état intermédiaire « présent mais pas encore chargé ».
  Introduire cette dimension serait spéculer.

**`unknown` est un état de première classe** : un appelant qui ne sait pas le dit, et l'absence
du champ vaut `unknown` par défaut. Aucun remplissage optimiste — `present` n'est jamais `true`
par défaut, `usable` n'est jamais déduit de `present`.

**Plusieurs matériaux.** `present` répond « au moins un », `usable` « au moins un exploitable ».
Rien dans ce contrat ne suppose un matériau unique, et rien n'exige d'en connaître le nombre :
la section 34 demande le minimum nécessaire, et l'identité des matériaux n'entre dans aucune
décision d'état.

**Ce que ce contrat n'est pas.** Il n'est ni un nom de fichier, ni un type MIME, ni une
taxonomie de domaine. Il ne dit pas « document », « code » ou « image ». Il exprime une
disponibilité, pas une nature.

### Propriétés contractuelles

| Propriété | Valeur |
| --- | --- |
| Optionnel | **oui** — les requêtes sans le champ continuent de fonctionner à l'identique |
| Rétrocompatible | **oui** — additif, aucun versionnement nouveau |
| `original_request` | **immuable** — aucune fusion silencieuse du matériau dedans |
| `clarification_history` | **inchangé** — aucun fait technique n'y est injecté |
| Coût en jetons | ~15 jetons — deux booléens ; aucune duplication de contenu utilisateur |
| Confidentialité | metadata seule — aucun nom de fichier, aucun contenu |
| Indépendance fournisseur | totale — aucune règle Groq, Anthropic ou OpenAI |

---

## F. Chemin de propagation

Le canal doit traverser **quatre couches**, et c'est ce qui décide de l'issue de ce lot :

| Couche | Changement requis | Statut dans ce lot |
| --- | --- | --- |
| 1. Enveloppe navigateur | `oprieRequestTurn` ajoute `material_context` dérivé de `state.docs` | **INTERDIT** — modifierait le HTML canonique |
| 2. Contrat de transport | `validateAnalystInput` accepte la clé optionnelle | autorisé, additif |
| 3. Entrée des rôles | `buildRoleInput` la transmet aux rôles concernés | autorisé, additif |
| 4. **Prompts des rôles** | dire à l'Analyste et au Critique ce que le champ signifie | **INTERDIT** — la section 4 interdit de modifier les prompts |

**Deux des quatre couches sont hors de portée de ce lot**, et ce ne sont pas les moins
importantes : sans la première, aucune donnée n'entre ; sans la quatrième, la donnée entre sans
que le contrat ne dise ce qu'elle veut dire.

Implémenter les couches 2 et 3 seules produirait un canal à moitié construit : un champ
traverserait le transport et atteindrait des rôles à qui personne n'a expliqué comment le lire.
Le comportement du plan profond changerait — silencieusement, sans contrat, et sans que rien ne
permette de prédire dans quel sens. C'est exactement ce que la section 42 appelle une
surcorrection, et la section 62 demande alors de s'arrêter plutôt que d'improviser.

**`IMPLEMENTATION_TYPE = BLOCKED_ARCH_CHANGE`.** Le contrat est spécifié en entier ci-dessus ;
il est implémentable en un seul lot autorisé, et il ne l'a pas été ici.

---

## G. Visibilité par rôle

| Rôle | Doit-il le voir ? | Pourquoi |
| --- | --- | --- |
| **Analyste** | **OUI** | C'est le rôle qui identifie les inconnues matérielles. Sans le contexte, il ne peut pas savoir qu'un intrant présupposé est disponible — c'est là, et là seulement, que naît le défaut. |
| **Critique** | **OUI** | Son mandat inclut d'auditer la légitimité de chaque question de l'Analyste, via l'échelle de substitution. Juger « l'Analyste a-t-il eu raison de demander le document ? » sans savoir si le document était joint est impossible. |
| **Arbitre** | **NON** | Il arbitre ce que les deux rôles précédents ont soulevé. Lui donner le contexte brut créerait un troisième endroit où le même fait est interprété — une duplication que la section 20 met en garde contre, et un risque de divergence entre trois lectures d'une même donnée. |

Conséquence de conception : `buildRoleInput` diffuse `base` aux trois rôles. Le contexte ne doit
donc **pas** être ajouté à `base`, mais transmis explicitement aux deux rôles concernés — sans
quoi l'Arbitre le recevrait par effet de bord.

---

## H. Rétrocompatibilité

Le champ est optionnel et additif. Les requêtes existantes — celles du produit aujourd'hui,
celles des fixtures, celles des bancs des lots précédents — continuent de fonctionner sans une
ligne de changement. Aucun versionnement nouveau n'est requis : la section 30 le demandait, un
champ additif y suffit.

---

## I. Confidentialité et coût en jetons

Le contexte est **metadata seule**. Il ne transporte ni nom de fichier, ni type MIME, ni taille,
ni contenu. Deux booléens : environ quinze jetons, à comparer aux 16 015 jetons d'un tour profond
médian — soit moins d'un millième. La section 36 demandait que le contexte reste compact ; il
l'est par construction, puisqu'il ne peut rien contenir d'autre.

---

## J. Preuves

L'audit repose sur la lecture des contrats, pas sur des appels : `REAL_PROVIDER_CALL_COUNT = 0`.
Les preuves sont statiques et vérifiables — `requireExactKeys` sur les deux routes, la
validation booléenne de `materiau_present`, la composition de `buildRoleInput`, le corps envoyé
par `oprieRequestTurn`, le corps de `oprieOriginalRequest`, et la forme de `state.docs`.

Matrice complète et fixtures affectées : `evaluation/oprie-material-context-01/results.json`.

---

## K. Impact sur l'oracle

**L'oracle n'a pas été modifié.** Ses attentes sont correctes **pour le contrat actuel**, où
aucun canal de matériau n'existe : demander l'intrant y est conforme. Elles changeraient si le
canal était ajouté — cela se documente, cela ne se réécrit pas en silence.

| Cas | Impact du canal, s'il existait |
| --- | --- |
| **R08** | **affecté** — la clarification tient à l'absence de canal, pas à une absence de matière |
| **R09** | **affecté** — idem |
| **A01** | **aucun** — non tranché, et pour une raison sans rapport : livrable indéterminé |
| **A02** | **aucun** — objet indéterminé, aucun matériau présupposé |
| **A03** | **aucun** — idem |

Six cas au total sont affectés — **R08 à R13**. Les huit cas « matériau absent » ne le sont pas :
l'absence y est réelle, et la clarification restera correcte quel que soit le canal. C'est le
test inverse que la section 40 demandait, et il est satisfait par construction : le contexte ne
dit jamais qu'un matériau est présent quand il ne l'est pas.

**Trois des cinq cas historiquement signalés ne relèvent pas de ce défaut du tout.** A01, A02 et
A03 sont un problème d'objet ou de livrable indéterminé, déjà séparé par le lot précédent. Le
canal de matériau ne les touche pas.

---

## L. Limites

1. **Le contrat est proposé, pas éprouvé.** Aucun test de comportement réel n'a pu être fait,
   puisque rien n'a été implémenté.
2. **La qualité du raisonnement une fois le contexte fourni est inconnue.** Savoir qu'un
   matériau est disponible ne garantit pas que l'Analyste en tirera la bonne conclusion.
3. **`usable` dépend de l'extraction navigateur.** Un PDF joint sera `present: true,
   usable: false` — ce qui est exact aujourd'hui, mais reflète une limite d'implémentation du
   produit, pas une propriété du matériau.
4. **Les quatre cas non tranchés de l'oracle** — A01, A05, A06, A07 — restent liés à une
   décision produit que ce lot n'a pas touchée, comme la section 50 l'exigeait.

---

## M. Verdict

```
MATERIAL_CONTEXT_GAP = REAL
IMPLEMENTATION_TYPE  = BLOCKED_ARCH_CHANGE
```

Le défaut est réel, sa portée est délimitée — six cas sur trente —, et le contrat minimal qui le
corrige est entièrement spécifié. Il n'a pas été implémenté parce que deux de ses quatre couches
sont explicitement interdites à ce lot : l'enveloppe navigateur touche au HTML canonique, et la
couche de sens touche aux prompts des rôles. Construire les deux couches intermédiaires seules
aurait produit un canal à moitié fait, changeant le comportement du plan profond sans contrat
pour le décrire.

---

## N. Action suivante

**`OPRIE-MATERIAL-CONTEXT-02`**, implémentation en un seul lot, avec les deux autorisations que
celui-ci n'avait pas : modifier l'enveloppe du produit et amender les prompts de l'Analyste et
du Critique. Le contrat de la section E est prêt à être posé tel quel.

Ordre recommandé, chaque étape restant additive et réversible : le champ optionnel dans le
transport, puis sa transmission aux deux rôles concernés — jamais à l'Arbitre —, puis la phrase
de contrat dans les deux prompts, puis l'enveloppe navigateur. Aucune de ces étapes ne doit
donner au contexte le pouvoir de déclarer un état : il informe le raisonnement, il ne le
remplace pas.
