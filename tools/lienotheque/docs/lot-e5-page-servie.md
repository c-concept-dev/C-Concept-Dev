# Le Worker sert la page — proposition, soumise avant tout code

Écrite le 19 octobre 2026. Rien n'est écrit sur cette base avant approbation.

---

## 1. Ce n'est pas une préférence : le code l'exige déjà

Deux faits relevés dans le dépôt, et ils décident à eux seuls.

**Le témoin de session est `SameSite=Lax`.** Un navigateur n'envoie pas un témoin `Lax` sur une
requête vers un autre site. Une page servie ailleurs qu'au Worker ne pourrait donc **jamais**
présenter sa session, quoi qu'on écrive. Il faudrait passer à `SameSite=None`, c'est-à-dire
renoncer à la protection que `Lax` donne contre les requêtes déclenchées par un site tiers.

**Il n'y a aucun CORS dans le Worker.** Vérifié : pas une ligne. Un appel depuis une autre
origine serait refusé par le navigateur avant même d'arriver.

Autrement dit, la version en ligne telle qu'elle est écrite **suppose déjà** que la page et l'API
partagent l'origine. Servir la page depuis le Worker ne change pas une décision : elle la rend
vraie.

## 2. Ce que cela demande

### La configuration : quatre lignes

```toml
[assets]
directory = "../app/dist"
# « none » laisse le Worker répondre aux chemins qu'aucun fichier ne couvre : c'est lui qui rend
# les 404, et c'est ce qu'on veut. L'application navigue par ancres — « #lecteur/page=3 » — donc
# elle n'a **aucun besoin** du repli d'application monopage, qui renverrait index.html sur
# n'importe quelle adresse et masquerait les 404 de l'API.
not_found_handling = "none"
```

Pas de `binding` : le Worker n'a pas à lire ces fichiers lui-même, la couche des ressources les
sert devant lui.

### Le code du Worker : zéro ligne

La couche des ressources répond avant le Worker pour les chemins qui correspondent à un fichier,
et lui passe tout le reste. Aucune route ne change, aucune porte ne bouge.

### Ce qui change ailleurs, et c'est une simplification

| fichier | ce qui change |
|---|---|
| `apps/app/src/pont/choix.ts` | l'adresse du service devient **relative** : même origine, donc `base: ""`. Le réglage de construction `VITE_LIENOTHEQUE_SERVICE` disparaît — six lignes de moins |
| `apps/worker/package.json` | le déploiement construit l'application d'abord : `wrangler deploy` exige que `dist` existe. Une ligne |
| `apps/worker/wrangler.toml` | les quatre lignes ci-dessus, plus le commentaire qui dit pourquoi |

### Un garde-fou, vingt-cinq lignes

C'est le seul vrai risque de ce changement, et il mérite son test : **un fichier peut masquer une
route.** Si l'application livrait un jour un fichier à un chemin qu'une route emploie, la couche
des ressources répondrait la première et la route deviendrait muette, sans erreur.

Aujourd'hui la collision est impossible, et c'est vérifiable :

| ce qui est servi | chemins |
|---|---|
| les fichiers | `/` et `/assets/…` — **dix fichiers, pas un de plus** |
| le Worker | 22 chemins, dont aucun ne commence par `/assets/` et aucun n'est `/` |

Le test fige cette séparation : il relit les routes déclarées et les fichiers construits, et
refuse tout recouvrement. Une route nouvelle nommée `/assets/quelque-chose` échouerait ici
plutôt qu'en silence en production.

## 3. Le périmètre réel, en chiffres

| ce qui est ajouté | mesure |
|---|---|
| configuration | **4 lignes** (plus le commentaire) |
| code du Worker | **0 ligne** |
| code de l'application | **−6 lignes** (un réglage de construction en moins) |
| procédure de déploiement | **1 ligne** |
| garde-fou | **~25 lignes** de test |
| poids des ressources | **4,6 Mo, 10 fichiers** |

Les limites de la couche des ressources — vingt mille fichiers, vingt-cinq mébioctets par
fichier — sont hors de portée : notre plus gros fichier fait 1,7 Mo.

## 4. Ce qu'il faut accepter, dit franchement

**La page devient publique.** Quiconque atteint le Worker reçoit `index.html`, le script et les
polices. C'est le cas de toute application web, et ce n'est pas une fuite : l'application
n'affiche rien sans session, et toutes les données passent par les portes déjà éprouvées. Mais
c'est une surface publique de plus, et elle n'existait pas.

**Le déploiement du Worker dépend désormais de la construction de l'application.** Une
construction cassée empêche de déployer l'API. C'est un couplage, et il est plutôt sain — les
deux partent ensemble, donc la page servie correspond toujours à l'API qui la sert — mais il
est réel.

**4,6 Mo dont 2,8 de poids mort probable.** Le fond d'écran fait 1,7 Mo, et les deux polices
sont livrées **deux fois** : en TTF (2,0 Mo) et en WOFF2 (0,4 Mo). Aucun navigateur visé n'a
besoin des TTF. Ce n'est pas l'objet de ce changement, mais le dire ici évite de découvrir plus
tard qu'on sert 2 Mo pour rien.

## 5. Le point qui pourrait coûter cher plus tard

Une clé d'accès est liée au **domaine** où elle a été enrôlée. Changer ce domaine rend les clés
enrôlées **inutilisables** : il faut recommencer la cérémonie sur chaque appareil.

Si la version en ligne vit à terme sur un domaine à vous, mieux vaut **commencer par là** plutôt
que d'enrôler sur `workers.dev` et d'avoir à tout refaire. Un domaine personnalisé sur le Worker
se déclare dans la configuration et ne change rien au reste de cette proposition.

Si l'adresse `workers.dev` convient, voici les deux valeurs :

| réglage | valeur |
|---|---|
| `ORIGINE_CEREMONIE` | l'origine complète du Worker, en `https` |
| `DOMAINE_CEREMONIE` | `lienotheque-api.11drumboy11.workers.dev` — **l'hôte entier** |

L'hôte entier, et non `11drumboy11.workers.dev` : les deux seraient acceptés par les
navigateurs, mais le second rendrait les clés valables pour **tout** Worker de ce compte. Le
premier les attache à celui-ci.

## 6. Ce que je ne fais pas dans ce changement

- **Aucun déploiement** sans votre mot, comme toujours.
- **Aucun allègement des ressources** : les polices en double et le fond lourd sont un sujet à
  part, et le mélanger à celui-ci rendrait les deux illisibles.
- **Aucun domaine personnalisé** : il demande des enregistrements DNS qui sont à vous.
- **Aucun repli d'application monopage** : l'application navigue par ancres et n'en a pas besoin,
  et l'activer masquerait les 404 de l'API.

---

## 7. Ce que la mise en œuvre a démenti (19 octobre 2026)

**« −6 lignes côté application » était faux.** J'annonçais que le réglage d'adresse disparaîtrait,
l'origine devenant la même. Il ne disparaît pas : `chargerVue()` lit l'instantané servi par le
greffon de Vite **indépendamment du pont**, et les épreuves de rendu reposent sur l'absence de
pont dans un `vite preview` nu. Un pont présent en permanence appellerait un service qui n'est
pas là.

Le réglage change donc de nature plutôt que de disparaître : d'une **adresse** à un **drapeau**
— « cette construction parle à un service » — puisque l'adresse, elle, est bien devenue inutile.

**Et une erreur que seul l'essai local pouvait montrer.** Avec des ressources déclarées, le
moteur a refusé de démarrer :

```
Incorrect type for map entry 'SERVICE': the provided value is not of type
'function or ExportedHandler'.
```

workerd lit les exports nommés du module d'entrée comme autant de points d'entrée possibles, et
`index.ts` réexportait `SERVICE`, `VERSION`, `CAPACITES` et `creerApp` — des valeurs commodes
pour un test. Le module d'entrée n'exporte plus que son gestionnaire ; les sept fichiers de test
importent désormais `creerApp` de `app.js`, où il est écrit.

**Le repli TTF avait un test qui l'exigeait.** Il ne donnait aucune raison : il figeait l'état du
jour, dans un bloc dont l'exigence réelle est « aucune ressource distante » — que le WOFF2 local
satisfait seul. Le test dit maintenant l'inverse, et pourquoi.

### Vérifié en local, avant tout déploiement

| sonde | résultat |
|---|---|
| `/` | la page, 200 |
| `/sante` | l'API, 200 |
| `/nawak` | **le 404 du Worker**, pas la page — `not_found_handling = "none"` fait son office |
| `/assets/…woff2` | 200, `font/woff2` |

Et 162 épreuves de rendu vertes sur les trois moteurs après le retrait des TTF : ces tests
mesurent des positions de texte, donc une police absente s'y verrait.

### La dette qui reste

Le fond d'écran pèse **1,7 Mo** sur les 2,6 Mo que la page fait désormais. Le réduire demande de
reconvertir une ressource de la charte validée — ce n'est pas deux lignes, et le mêler à la mise
en marche rendrait les deux illisibles. À traiter à part.
