# Ce que Claude peut changer seul au cahier de pilotage, et ce qu'il ne peut pas

**Règle permanente, posée par Christophe le 10 novembre 2026**, à la levée de la dette D24. Ses
mots :

> « Règle permanente pour le cahier (à inscrire dans `docs/decisions/`) : tu peux **lever une
> dette ou cocher une case**, si c'est prouvé (commit, mesure) et dit dans le message de commit.
> Sans mon mot, tu ne modifies **ni une règle, ni l'ordre de la feuille de route, ni la doctrine,
> ni n'ajoutes une étape**. »

## La règle, telle qu'elle s'applique

| geste sur `docs/cdc-pilotage.md` | sans demander | conditions |
|---|---|---|
| **lever une dette** (D…) | oui | prouvée par un commit et une mesure, et dite dans le message de commit |
| **cocher une case** d'étape ou de lot | oui | mêmes conditions |
| modifier une **règle** | **non** | le mot de Christophe |
| changer l'**ordre de la feuille de route** | **non** | le mot de Christophe |
| toucher à la **doctrine** | **non** | le mot de Christophe |
| **ajouter une étape** | **non** | le mot de Christophe |

## Ce qui distingue les deux colonnes, et pourquoi la frontière tombe là

Lever une dette ou cocher une case, c'est **constater** : l'état du dépôt a changé, et le cahier
le dit avec retard. Le constat est vérifiable par quiconque — un commit, une mesure —, et le
laisser attendre un aller-retour ne protège rien ; cela rend seulement le cahier faux plus
longtemps.

Modifier une règle, réordonner la feuille de route, toucher à la doctrine, ajouter une étape :
c'est **décider**. Ces gestes n'ont pas de preuve, ils ont un auteur. Le cahier est l'instrument
par lequel Christophe tient le projet ; la décision lui appartient, et une recommandation de
Claude n'est pas une autorisation (règle du 5 novembre 2026, inscrite au registre des poussées).

## Les deux conditions ne sont pas décoratives

**Prouvé** : un commit qui porte le changement, et une mesure qui dit ce qu'il vaut. Une dette
levée sans mesure est une dette déplacée du cahier vers l'oubli.

**Dit dans le message de commit** : c'est là que le geste devient relisible. Un cahier qui change
sans qu'on sache quel commit l'a changé est exactement ce que cette règle évite — et c'est
pourquoi la condition porte sur le **message**, pas sur un fichier à part.

## Premier emploi

La dette **D24** — `couche-texte.ts` appelant `getDocument` sans les ressources pdf.js — a été
levée sous cette règle le 10 novembre 2026, avec la mesure dans sa ligne : 2 documents sur 232 de
la bibliothèque réelle réclament une police standard, et la lecture y est identique à la décimale.
Voir [2026-11-10-les-ressources-pdfjs-suivent-toute-lecture.md](2026-11-10-les-ressources-pdfjs-suivent-toute-lecture.md).
