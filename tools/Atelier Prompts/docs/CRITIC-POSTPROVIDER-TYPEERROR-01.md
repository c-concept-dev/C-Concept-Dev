# CRITIC-POSTPROVIDER-TYPEERROR-01 — Le fournisseur avait répondu. C'est après que ça cassait.

Un tour sur vingt se terminait en HTTP 502, sans aucun état sémantique. Les trois appels du Critique
avaient pourtant réussi. Ce lot trouve l'instruction exacte, et ne corrige qu'elle.

---

## A. L'historique des preuves

| Campagne | Tours | 502 | Ce qu'on en savait |
| --- | --- | --- | --- |
| DEEP-PRODUCTION-BLOCKERS-01 | 26 | 1 | B-01B, identifié et fermé |
| DEEP-RESIDUAL-502-ATTRIBUTION-01 | 32 | 1 | **perdu** — journal non capturé |
| ATTRIBUTION-02 (f220099) | 20 | 0 | — |
| ATTRIBUTION-02 (800bcb2) | 20 | **1** | attribué : `TypeError`, phase `critic`, non étiquetée |

Le dernier a livré l'empreinte du message :
`c87a77f227cd55c53850573ae3568ecbce70af4f45dd758728f67a89a623b1a3`.

---

## B. L'instruction exacte

`materializeSubstitutionReviewFromCandidates`, dans `workers/shared/operational-request-core.js` —
l'assertion des six familles de la ladder.

**Localisée par exécution, pas par déduction.** La fonction a été appelée avec les entrées invalides
plausibles ; le message levé a été haché et comparé :

| `candidates` reçu | Résultat | Empreinte du message |
| --- | --- | --- |
| absent · `null` · `[]` · `"x"` · `{}` | `TypeError` | **identique au 502 de production** |
| 5 familles sur 6 | `TypeError` | autre (l'interpolation diffère) |

Le cas de production est donc précisément : **`entry.candidates` n'était pas un objet** — zéro
famille reçue, d'où `reçu ()` dans le message.

Le chemin : le fournisseur rend un batch, puis
`batchResults.map(… materializeSubstitutionReviewFromCandidates(entry?.candidates))`. Les trois
appels réseau avaient réussi ; la levée est dans le **traitement**.

---

## C. La cause racine

`assert()` du noyau lève `new TypeError(message)` — **sans marqueur**. L'exception atteint le
catch-all sans étiquette de classe, devient `programming_error` (« défaut de notre propre code »),
donc fail-closed immédiat, donc **502 sans état sémantique**.

Or le message de cette assertion dit lui-même de qui est la faute :
« **sortie provider contractuellement incomplète**, jamais acceptée comme review valide ».

---

## D. Notre bug, ou sortie de modèle invalide ?

`ROOT_CAUSE_CLASSIFICATION = PROVIDER_OUTPUT_CONTRACT_VIOLATION`.

Le code a **raison** de refuser : une review de substitution sans ses six familles n'est pas
exploitable, et l'accepter fabriquerait une analyse. Ce qui était faux, c'est l'**étiquette** du
refus.

La preuve tient en une comparaison, dans le **même pipeline** :

| Faute du modèle | Marqueur | Classe | Client |
| --- | --- | --- | --- |
| `assembleSubstitutionReviews` — une issue non couverte | `output_contract_violation` ✔ (CSR-01) | `structured_output_invalid` | `degraded_state` 200 |
| `materializeSubstitutionReviewFromCandidates` — six familles non rendues | **absent** | `programming_error` | **502 muet** |

« Tu n'as pas couvert une issue » était une violation de contrat du modèle. « Tu n'as pas rendu les
six familles » passait pour un bug à nous. C'est cette asymétrie, et rien d'autre, qui est corrigée.

---

## E. Le correctif minimal

Une assertion, dans une fonction, dans un fichier. `assert(cond, msg)` devient un `throw` marqué —
**exactement la convention du voisin** :

```js
throw Object.assign(new TypeError(`…message inchangé…`), { output_contract_violation: true });
```

**Le message est inchangé à l'octet près** — précédent CSR-01 : « seul un marqueur structurel est
ajouté ». L'empreinte reste donc celle du 502 observé, ce qui garde le lien avec l'incident pour
qui relira les journaux. Aucune inspection de texte, aucune tolérance nouvelle : **les mêmes entrées
sont refusées qu'avant**, vérifié sur huit formes d'invalidité.

`PROMPTS_CHANGED = NO` · `ROUTING_CHANGED = NO` · `OPRIE_CHANGED = NO` · `B01B_CHANGED = NO` ·
`CSR01_GLOBAL_CLASSIFICATION_CHANGED = NO`.

---

## F. Reproduction déterministe

`tests/critic-postprovider-typeerror-cpt01.test.mjs` — huit tests.

`T-CPT01-01` épingle l'**empreinte du message de production** : si le message change, le lien avec
l'incident se perd, et il vaut mieux que ça casse là.

`T-CPT01-04` rejoue le tour complet sur le vrai chemin HTTP, fournisseur qui **réussit** puis rend
un batch sans `candidates` :

| | Avant | Après |
| --- | --- | --- |
| HTTP | 502 | **200** |
| État | aucun | **`degraded_state`** |
| Classe | `programming_error` | **`structured_output_invalid`** |
| READY fabriqué · repli | non · aucun | non · aucun |

---

## G. Contrôle : un vrai défaut interne reste fail-closed

C'est le garde-fou du correctif, et il compte autant que le correctif.

`T-CPT01-06` : une charge globale incomplète — un rejet structurel **non marqué**, de ceux que
CSR-01 a délibérément laissés en `programming_error` — reste `programming_error`, remonte telle
quelle, et rend **502 sans état sémantique**. Le correctif n'a pas converti « toute exception » en
dégradation.

`CSR01-8` a dû changer de spécimen, et c'est significatif : il illustrait « rejet non marqué » avec
`candidates: "structure invalide"`, précisément le cas que la production a fait échouer. **Son
invariant est intact** — un rejet non marqué ne bascule jamais — seul l'exemple a changé de camp. Le
test affirme désormais les deux côtés de la frontière.

---

## H. Contrôle : une sortie invalide ne casse plus le code

`T-CPT01-07` balaie six formes d'invalidité du batch — `candidates` absent, `null`, tableau,
primitif, vide, familles partielles. Toutes sont **classées** `structured_output_invalid`, aucune ne
laisse remonter une `TypeError` nue.

`T-CPT01-08` inventorie ce qui **n'a pas** été touché : `assembleSubstitutionReviews` porte trois
autres assertions non marquées (identifiant inconnu, collision, entrée invalide). Vraisemblablement
la même classe de faute — mais **aucune n'a été observée en production**, et CSR-01 avait tranché de
les laisser fail-closed. Ce lot ne renverse pas cette décision sans preuve : il la rend visible.

---

## I. Rejeu réel

<!-- REJEU -->

---

## J. Impact release

<!-- RELEASE -->
