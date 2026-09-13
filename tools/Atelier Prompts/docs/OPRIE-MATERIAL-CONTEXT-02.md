# OPRIE-MATERIAL-CONTEXT-02 — Le canal est posé, et il ne suffit pas

Le contrat `material_context` est implémenté de bout en bout, exactement tel qu'il avait été
spécifié : transport, propagation sélective, amendement des deux prompts, enveloppe navigateur.
Tout ce que le lot demandait a été fait, et validé en production.

**Et l'observation réelle montre que cela ne change pas l'état.** Informé qu'un document est
joint, le plan profond continue de demander une clarification — mais il ne demande plus le
document en ignorant son existence : il demande d'en **coller le contenu dans le message**. Il a
compris que le matériau existe *et* qu'il ne le reçoit pas.

Le canal de **visibilité** est posé. Le canal de **contenu** ne l'est pas. Verdict : **PARTIAL**.

---

## A. Contrat implémenté

```jsonc
"material_context": {          // champ OPTIONNEL de /operational-request
  "present": true | false | "unknown",
  "usable":  true | false | "unknown"
}
```

Absence du champ ⇒ `{present: "unknown", usable: "unknown"}`. Jamais `true` par défaut. `required`
et `accessible` restent délibérément absents — le premier parce que déterminer ce que la demande
*exige* est le raisonnement de l'Analyste, le second faute de source qui le porte.

---

## B. Source navigateur

`state.docs`, lu **à l'instant où le corps de la requête est assemblé** :

```js
function oprieMaterialContext(){
  const docs=(typeof state!=='undefined'&&state&&Array.isArray(state.docs))?state.docs:null;
  if(!docs)return{present:'unknown',usable:'unknown'};
  return{ present:docs.length>0,
          usable:docs.some(d=>d&&d.external!==true&&typeof d.text==='string'&&d.text.length>0) };
}
```

Aucune extension, aucun type MIME, aucun nom de fichier n'entre dans ce calcul : `usable` reflète
exactement ce que `addFiles` a constaté en tentant la lecture.

---

## C. Transport

`validateAnalystInput` accepte désormais une clé **optionnelle nommée**, sans relâcher la
rigueur : `requireKeysWithOptional` refuse toute clé non énumérée, exactement comme
`requireExactKeys` le faisait. Validé en production :

| Requête | Réponse |
| --- | --- |
| `material_context` incomplet (`present` seul) | **400** |
| Valeur illégale (`present: "oui"`) | **400** |
| Clé inconnue (`autre`) | **400** |
| Contexte valide | **accepté**, le tour part vers les rôles |
| Requête sans le champ | **acceptée** — rétrocompatibilité |

---

## D. Propagation par rôle

| Rôle | Reçoit | Pourquoi |
| --- | --- | --- |
| Analyste | **oui** | il identifie les inconnues matérielles |
| Critique | **oui** | il ne peut auditer la légitimité d'une question sur un document sans savoir s'il était joint |
| **Arbitre** | **non** | il arbitre ce que les deux précédents ont soulevé |

**Le piège a été évité.** `buildRoleInput` diffuse `base` aux trois rôles ; y ajouter le contexte
l'aurait rendu visible à l'Arbitre par simple effet de bord. Il vit donc **à côté** de `base` et
n'est transmis qu'explicitement, aux deux premiers rôles.

---

## E. Amendement des prompts

Un point ajouté à chacun, et un seul. L'Analyste : le contexte énonce une disponibilité, jamais
une exigence ; `present=true` ne rend jamais une demande prête ; `usable=true` ne rend jamais une
information suffisante ; `"unknown"` ne vaut jamais `false` ; et **si la demande déclare qu'un
intrant manque, cette déclaration l'emporte**. Le Critique : le contexte ne sert qu'à vérifier la
légitimité d'une question portant sur la disponibilité d'un matériau. L'Arbitre : **inchangé**, il
ignore jusqu'à l'existence du champ.

**Une garde a corrigé une première rédaction.** Le mot « exploitable » est interdit dans les
prompts depuis CLEAN-01 — c'est le vocabulaire du décideur flou retiré alors. Les deux points ont
été reformulés en « contenu lisible par le système ». La garde est volontairement grossière, et
elle a raison de l'être.

---

## F. Fraîcheur

Le contexte est construit **dans le corps de la requête**, à l'instant de l'envoi, sans copie,
sans cache, sans mémorisation. Il n'existe donc aucune fenêtre pendant laquelle le signal
pourrait devenir périmé — et donc **aucune durée de validité à inventer** :
`INVENTED_MATERIAL_TTL_COUNT = 0`. Si la source est hors de portée, le résultat est `unknown`,
jamais un défaut optimiste.

---

## G. Politique de conflit

Un conflit entre la demande (« je n'ai pas encore le document ») et le contexte (`present: true`)
n'est **pas détecté mécaniquement** — le faire exigerait de comparer des textes, c'est-à-dire
exactement l'appariement flou que le dépôt proscrit. La règle vit dans le contrat, et le rôle qui
lit les deux canaux la tranche : *« si la demande ou l'historique déclare explicitement qu'un
intrant manque, cette déclaration l'emporte sur le contexte »*. Le contexte décrit ce dont le
système dispose, jamais ce que la personne affirme.

---

## H. Confidentialité et coût

Metadata seule : deux booléens. Ni nom de fichier, ni type MIME, ni taille, ni contenu. Environ
quinze jetons, contre 16 015 pour un tour profond médian — moins d'un millième.

---

## I. Observation réelle — R08, avant et après

Deux tours réels, même demande, 120 secondes d'écart.

| | Sans contexte | Avec `{present: true, usable: true}` |
| --- | --- | --- |
| État | `clarification_required` | `clarification_required` |
| Question | *« Pourriez-vous fournir le texte que vous souhaitez résumer ? »* | *« Pouvez-vous coller directement le texte à résumer dans votre message ? »* |
| Latence | 34,9 s | 47,9 s |

**L'état n'a pas changé. La question, si.**

---

## J. Ce que cette observation révèle

Le lot posait explicitement l'attente : *« ne pas imposer que ces six cas deviennent READY ; la
correction attendue est seulement qu'ils ne clarifient plus uniquement parce que le matériau est
artificiellement invisible »*. C'est précisément ce qui s'est produit, et à moitié seulement.

**Le matériau n'est plus invisible** — la question le prouve : elle ne demande plus le document
comme si son existence était ignorée, elle demande d'en coller le **contenu**. Le raisonnement a
compris qu'un document existe et qu'il ne le reçoit pas.

**Mais le contenu, lui, n'a jamais été transmis.** `state.docs[].text` est extrait par le
navigateur et reste dans le navigateur. Savoir qu'un document existe ne permet pas de le résumer.
La clarification qui subsiste est donc **légitime au regard du contrat** : une information
matérielle non substituable — le contenu — manque réellement.

### Une ambiguïté du contrat, révélée par la mesure

`usable`, tel qu'implémenté, signifie **« lisible par le navigateur »**. Ce n'est pas
**« disponible au raisonnement profond »**. La formulation retenue — « un contenu lisible par le
système » — ne distingue pas les deux, et l'observation montre que la distinction compte. Envoyer
`usable: true` alors que le plan profond ne peut rien lire surestime ce dont il dispose.

Ce n'est pas une erreur d'implémentation : le contrat a été implémenté tel qu'il avait été
spécifié. C'est une **limite de la spécification**, que seule l'exécution pouvait faire apparaître.

---

## K. Régressions

`GLOBAL = 2801/2801 ×3`, `FROZEN = PASS`, `BROWSER_RUNTIME = PASS`, `SECRET_SCAN = PASS`.

**L'artefact canonique a changé**, et c'est mécanique : le noyau OPRIE est embarqué verbatim dans
le bundle navigateur, donc modifier le contrat d'entrée le répercute dans le HTML. Quatorze
preuves qui gardaient l'ancienne empreinte ont été mises à jour, chacune avec la note expliquant
pourquoi. Aucun changement visuel, aucun redesign, aucun comportement d'interface touché.

Les preuves du lot précédent, qui caractérisaient l'**absence** du canal, ont été retournées pour
caractériser sa **présence** — en disant ce qui a changé, jamais en silence. L'oracle, lui, n'a
pas été touché.

---

## L. Limites

1. **Le contenu du matériau n'est toujours pas transmis.** C'est la limite centrale, et elle est
   structurelle : aucun canal de contenu n'existe entre le navigateur et le plan profond.
2. **`usable` est ambigu** — lisible par qui ? Voir J.
3. **Une seule fixture observée en réel**, R08, deux tours. Les cinq autres cas affectés n'ont pas
   été rejoués : l'observation étant négative sur l'état, la rejouer cinq fois aurait coûté cinq
   tours profonds pour un résultat déjà connu.
4. **A01, A02, A03 n'ont pas été rejoués** : ils ne présupposent aucun matériau, et le contexte ne
   peut pas les toucher — c'est vérifié par construction, pas par mesure.
5. **Les quatre cas non tranchés de l'oracle** restent liés à une décision produit intacte.

---

## M. Verdict

```
MATERIAL_CONTEXT_CONTRACT_IMPLEMENTED = YES
OPRIE_MATERIAL_CONTEXT_02_VERDICT     = PARTIAL
```

Tout ce que le lot demandait est fait : contrat optionnel, absence valant `unknown`, demande
immuable, historique intact, propagation sélective vérifiée jusqu'à l'Arbitre exclu, prompts
amendés minimalement, fraîcheur par construction, aucun TTL, aucun codage en dur, aucune règle
fournisseur, rétrocompatibilité stricte, régressions vertes.

Ce qui n'est pas atteint est l'**effet** : le canal de visibilité ne suffit pas à lever la
clarification, parce que le contenu manque toujours. Le dire est plus utile que de compter
l'implémentation comme un succès.

---

## N. Action suivante

Le choix appartient au propriétaire produit, et il est net :

**Soit** ouvrir un canal de contenu — transmettre `state.docs[].text` au plan profond, ce qui pose
des questions réelles de volume (la limite de transport est de 16 384 octets), de coût en jetons
et de confidentialité, toutes hors du périmètre de ce lot.

**Soit** admettre que le plan profond ne lit pas les documents, et faire de `material_context` ce
qu'il est réellement : un signal qui permet à l'Analyste de poser **la bonne question** — coller
le contenu — plutôt que la mauvaise. C'est déjà ce que l'observation montre, et c'est un gain réel,
plus modeste que celui espéré.

Dans les deux cas, `usable` mérite d'être renommé ou redéfini pour dire **par qui** le contenu est
lisible. La mesure a montré que l'ambiguïté n'est pas théorique.
