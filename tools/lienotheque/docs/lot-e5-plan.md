# Lot E5 — la version en ligne : plan soumis avant tout code

Écrit le 17 octobre 2026, après la clôture des trois réserves du chemin du texte.

---

## 0. Une correction de nom, avant tout le reste

La demande disait « E3, la version en ligne ». L'ordre de construction, écrit dans
`lot-e-proposition.md` §10, dit autre chose :

| lot | contenu | état |
|---|---|---|
| **E1** = BAS-01 | registre, D1, R2, sessions, liens signés, sauvegarde et restauration, façade | **franchi le 10 octobre 2026** |
| **E2** = BAS-02 | réimport réel des 234 ouvrages | **différé** jusqu'à ce que Liénothèque soit terminée |
| **E3** = BAS-03 | comparaison et validation, rapport daté | **bloqué par E2** |
| **E4** = BAS-04 | bascule | — |
| **E5** | **version en ligne** (PLT-03) | ce plan |
| **E6** = BAS-05 | suppression de l'ancienne bibliothèque | — |

**La version en ligne est E5.** E3 est la comparaison de la nouvelle bibliothèque avec
l'ancienne : elle suppose que la nouvelle existe, donc E2, qui est précisément repoussé. E3 ne
peut pas être le prochain lot.

**Et une collision de noms vaut d'être signalée**, parce qu'elle explique la confusion : les
documents de plan appellent « lot E2 » le travail de capacité — le chemin du texte, le
classement, les pages — tandis que l'ordre de construction appelle « E2 = BAS-02 » le réimport
réel. Deux choses sans rapport sous la même étiquette. Ce plan n'emploie « E5 » que pour la
version en ligne.

---

## 1. Ce qui existe déjà, et qui est mesuré

**E1 répond par-dessus le réseau depuis le 10 octobre.** Quatre routes, mesurées :

| route | réponse | latence |
|---|---|---:|
| `/search-library` | passage, titre, page imprimée, axes | 168 ms |
| `/d1-query` | résultats depuis une intention à termes | 162 ms |
| `/rag-search` | le même contenu sous le nom attendu par l'appelant | 167 ms |
| `/library-facets` | comptes par axe | 163 ms |

Ressources créées, et rien d'autre : D1 `lienotheque-registre`, D1 `lienotheque-essai`,
D1 `lienotheque-restauration-essai`, R2 `lienotheque-medias`, toutes en WEUR. **Coût : zéro
au-dessus de l'abonnement.**

**Le bureau, lui, fait maintenant son travail** : 2 818 passages lus sur les sept documents de la
mini-bibliothèque, 1 416 pages visibles, la recherche trouve, le classement s'importe.

**Et l'application est déjà une application web.** React 19 et Vite : elle se construit pour le
navigateur sans rien y changer.

---

## 2. Le seul véritable obstacle

L'application ne sait parler qu'au bureau.

| | |
|---|---|
| ponts | **un seul** — `apps/app/src/pont/bureau.ts`, 25 fonctions |
| gardes `estBureau()` | **17**, toutes dans `App.tsx` |
| hors du bureau | l'application s'affiche et **ne fait rien** |

Ces dix-sept gardes sont la couture d'E5. Aujourd'hui, elles ne sont pas un choix entre deux
chemins : elles sont une impasse. Chacune dit « si nous ne sommes pas sur le bureau, ne rien
faire », et aucune ne dit ce qu'il faudrait faire à la place.

**C'est la bonne nouvelle de ce lot** : la frontière existe déjà, elle est au bon endroit, et
elle est tenue par un seul fichier. Il n'y a pas d'architecture à défaire — il y a une seconde
implémentation à écrire derrière une frontière qui est posée.

---

## 3. La question à trancher avant d'écrire une ligne

Le 3 octobre 2026, une décision prévoyait **trois implémentations du port de dépôt** :
`node:sqlite` pour les tests, l'hôte Rust pour le bureau, et **SQLite en WebAssembly pour la
version en ligne**.

E1 a depuis bâti autre chose : une **façade Worker sur D1**, qui répond aux quatre routes en
moins de 170 ms. Ces deux voies ne peuvent pas être toutes les deux la réponse.

### Voie A — SQLite en WebAssembly dans le navigateur

| pour | contre |
|---|---|
| fonctionne hors connexion | il faut **télécharger la bibliothèque entière** dans le navigateur |
| aucun aller-retour réseau | à 250 documents, la base pèse ce qu'elle pèse, et chaque visite la retélécharge |
| le port existe déjà, en trois implémentations prévues | un binaire WebAssembly de plus à produire, livrer et suivre |
| | HEB-02 veut qu'aucun binaire ne passe par le port : les octets vivent à côté |

### Voie B — la façade Worker, déjà bâtie

| pour | contre |
|---|---|
| **elle existe, elle est déployée, elle est mesurée** | demande une connexion |
| rien à télécharger | la latence s'ajoute à chaque geste — 165 ms mesurés |
| l'index plein texte de D1 travaille côté serveur, là où il est | une route de plus par besoin nouveau |
| les liens signés servent déjà les fichiers depuis R2 | |

### Ma recommandation : la voie B

Trois raisons, dans cet ordre.

**Elle est construite et mesurée.** La voie A demanderait de rebâtir en WebAssembly ce qui
répond déjà en 165 ms.

**Elle résout la troisième réserve au lieu de la déplacer.** La recherche du bureau parcourt les
fichiers de version — tenable à huit documents, intenable à deux cent cinquante (réserve 9.3).
D1 porte l'index plein texte, et la façade le sert déjà. La voie A porterait le même problème
dans le navigateur, avec moins de mémoire.

**Le hors-connexion a déjà son répondant : le bureau.** La version en ligne sert à lire depuis
ailleurs, pas à remplacer l'application installée. Lui demander de fonctionner sans réseau
reviendrait à écrire une seconde fois le bureau, en moins bien.

**Ce que la voie B coûte, et qu'il faut accepter** : la version en ligne ne lira rien sans
connexion, et chaque geste paiera un aller-retour. Si ce n'est pas acceptable, c'est maintenant
qu'il faut le dire, et non après le second pont.

---

## 4. Les étapes, dans l'ordre où elles se vérifient

| # | ce qui est fait | comment on sait que c'est fait |
|---|---|---|
| 1 | **Le port, nommé.** Extraire des 25 fonctions de `bureau.ts` l'interface que l'application emploie, sans rien changer d'autre | Le bureau continue de passer ses tests, à l'identique |
| 2 | **Le second pont** : `pont/ligne.ts`, même port, façade Worker derrière | Les mêmes épreuves d'écran passent avec un Worker simulé |
| 3 | **Le choix du pont en un seul endroit**, à la place des 17 gardes | Aucune `estBureau()` ne subsiste hors du choix lui-même |
| 4 | **La cérémonie WebAuthn** — la page qui manquait, et dont l'absence a fait reporter la cérémonie au lot E1 | Deux utilisateurs s'authentifient ; aucune clé dans le navigateur (LIV-04) |
| ~~5~~ **fait** | **Les images et médias par liens signés**, depuis R2 | Personne ne signait : `signer` n'avait aucun appelant. La route `/laissez` les émet, et un lien expiré refuse. Section 8 |
| ~~6~~ **fait, avec une réserve nommée** | **La recherche en ligne sur la mini-bibliothèque** | Le **même** `chercher` sur la **même** vue : identiques par construction. Le découpage par document attend la décision des écrans. Section 8 |
| 7 | **Le déploiement** | **Soumis avant**, jamais fait d'office |

Les étapes 1 à 3 sont de la mécanique : elles ne changent aucun comportement et se vérifient par
l'absence de régression. Les étapes 4 à 6 ajoutent ce qui n'existe pas.

---

## 5. Ce que cela coûte

Je ne donne pas d'estimation en heures, et je préfère dire pourquoi : sur F4, mon extrapolation
depuis deux échantillons annonçait onze minutes pour un traitement qui en a pris cinquante-sept.
Une estimation que la mesure dément vaut moins que pas d'estimation.

Ce que je peux donner, c'est la **surface** :

| étape | surface |
|---|---|
| 1 — le port nommé | un fichier d'interface, 25 signatures déjà écrites |
| 2 — le second pont | un fichier, 25 fonctions, chacune un appel HTTP |
| 3 — le choix | une fonction, 17 gardes retirées |
| 4 — WebAuthn | la cérémonie côté page, les tables existent déjà au registre |
| 5 — liens signés | déjà bâtis au lot E1 ; il s'agit de les employer |
| 6 — la recherche | aucune logique nouvelle : `chercher` reçoit déjà ses passages en entrée |

Les étapes 5 et 6 sont petites **parce qu'E1 et E2 ont fait le travail** : les liens signés
existent, et la recherche a été séparée de sa source d'approvisionnement à l'étape 4 du
classement.

---

## 6. Ce que je ne fais pas sans un accord séparé

- **Aucun déploiement**, et aucun changement de configuration ou de secret (CLAUDE.md, règle 7).
- **Rien sur le vrai corpus.** La mini-bibliothèque reste le terrain d'épreuve, comme convenu.
- **Jamais `clone-proxy` ni `therapeute-library`**, ni en écriture ni en lecture.
- **Aucune suppression** de base D1 ou d'espace R2.
- **Pas de seconde adresse pour le banc de comparaison** : elle appartient à E3.

---

## 7. Ce qui reste ouvert, et que ce plan ne referme pas

**Le canevas** (réserve 9.2, reclassée). Les documents natifs sans image embarquée — DSM-5, *La
danse du couple* — n'ont aucune page à montrer. En ligne comme au bureau. Si la version en ligne
doit les afficher, le rendu devra être tranché ; la décision de `dommatrix.ts` reste valable tant
qu'on ne le demande pas.

**La dégradation de F4** (réserve 9.1). Sa cause n'est pas trouvée. Elle ne concerne pas la
version en ligne, qui ne traite rien — mais elle concerne le jour où le vrai corpus sera traité.

**L'index plein texte** (réserve 9.3). La voie B le résout pour la version en ligne, puisque D1
le porte. Elle ne le résout **pas** pour le bureau, qui continuera de parcourir ses fichiers de
version. Deux chemins, deux sources : c'est exactement le genre de divergence que le passage par
document a corrigé ailleurs, et il faudra y revenir.

---

## 8. Les étapes 5 et 6 : les liens signés, et la vue servie plutôt que rebâtie

### Étape 5 — personne ne signait

Les laissez-passer existaient depuis E1, et `signer` **n'avait aucun appelant dans tout le
dépôt**. La route `/laissez` les émet.

**La clé de l'objet est composée par le service, jamais reçue.** C'est la règle d'`objets.ts`, et
c'est elle qui tient l'isolation des fichiers puisqu'un seul compartiment les porte toutes :
l'appelant donne une version et un nom, pas un chemin. Un test envoie une clé toute faite avec
des remontées de répertoire et vérifie qu'elle n'ouvre rien — et que le compartiment n'est pas
même touché.

Le nom est vérifié **avant** toute composition, sur une forme étroite. R2 ne résout pas les
chemins — « .. » y serait un segment comme un autre — mais une clé qui ressemble à une remontée
finit par être lue par quelque chose qui, lui, la résout : un cache, un miroir, un outil
d'inspection. Mieux vaut qu'elle n'existe jamais.

**Un vrai défaut trouvé au passage :** `/fichier/:laissez` lisait `Date.now()` au lieu de
l'horloge injectée, seul endroit de l'application à le faire. Mon test de péremption a échoué
pour cette raison, et c'est le test qui avait raison.

### Étape 6 — la vue est servie, pas rebâtie

`chercher` prend une `VueBibliotheque` entière. Deux chemins s'offraient : rebâtir la vue en SQL
dans le Worker, ou servir l'instantané que `instantane.ts` construit déjà à l'ingestion.

**Retenu : l'instantané, rangé comme objet R2.** Une seconde mise en œuvre de la vue serait une
seconde vérité, et celle des deux qui finirait par mentir — c'est le mode de panne contre lequel
ce dépôt met en garde partout, et `instantaneDeLot` porte déjà la cicatrice d'un second chemin de
code qui avait divergé.

Conséquence directe, et c'est tout l'intérêt : la recherche en ligne fait tourner **le même
`chercher` sur la même vue**. Les résultats sont identiques **par construction**, et non par
ressemblance. Un test le montre sur cinq requêtes, dont la suite entière avant le mot isolé.

### Une troisième famille d'objets, avec sa raison

`objets.ts` disait « deux familles, et il n'y en aura pas d'autres **sans raison** ». La voici.

Une vue de bibliothèque rassemble ce que **toutes** les versions actives donnent à voir. La
ranger sous `derives/<version>/` obligerait à inventer une version qui n'existe pas, et cette
version inventée serait ensuite lue par du code qui croit aux versions. Une famille de plus coûte
une ligne et un motif de plus au garde-fou ; une fausse version coûte un malentendu durable.

Le garde-fou qui interdit à tout autre module de composer un préfixe **couvre la famille neuve** :
sans quoi elle serait née sans surveillance.

### La fraîcheur : à l'activation, pas sur un intervalle

`PUT /vue` et `PUT /vue/passages` rangent la vue, **derrière le jeton de service et lui seul** :
c'est un appel de machine à machine — la chaîne de traitement tourne sur la machine de
l'ingestion, pas dans un navigateur, et n'a aucune session personnelle à présenter. C'est
exactement l'usage pour lequel le jeton existe, comme `/vision`.

Une vue poussée toutes les heures serait périmée cinquante-neuf minutes sur soixante sans que
personne sache de combien. Poussée à l'activation, elle est aussi fraîche que la dernière
activation, et **jamais plus périmée que ce que le bureau montre lui-même**.

**La vue est validée avant d'être rangée.** Ranger un objet qu'on ne saurait pas relire
reporterait la panne chez le lecteur, le jour où il ouvre la bibliothèque. Mieux vaut refuser
maintenant, à qui peut corriger. La lecture, elle, ne valide pas : elle transmet des octets, et
le pont les passe par leur contrat à l'arrivée. L'asymétrie est voulue — les défauts du contrat
s'appliquent une fois, à l'écriture.

### Ce qui n'est pas fait, et qui le dit

**Quatre fonctions du port en ligne refusent**, avec une erreur nommée `PasEncoreEnLigne` qui
cite le geste : `apercuDeBibliotheque`, `versionActive`, `classementsDeBibliotheque`,
`classerDocument`. Elles demandent un découpage des objets **par document** — un aperçu, une vue
et des passages par empreinte — et ce découpage dépend de ce que les écrans montreront en ligne,
question ouverte et tranchée à part.

Elles **lèvent plutôt que de rendre une liste vide** : une liste vide se confond avec une
bibliothèque vide, et un écran qui n'affiche rien sans dire pourquoi coûte des heures à
diagnostiquer. C'est la même raison qui fait qu'un enrôlement sans clé échoue en le disant.

**Le déclenchement côté bureau reste à brancher.** La route existe et est éprouvée ; ce qui
l'appellera au moment de l'activation appartient au chemin de publication, c'est-à-dire à
l'étape 7. La chaîne d'ingestion n'a pas encore de geste « publier cette version en ligne ».

### Les « quatre épreuves », et ce qu'elles pouvaient être ici

Le plan annonçait « les mêmes quatre épreuves qu'au bureau, mêmes résultats ». Ces épreuves
étaient celles de l'épreuve humaine, menées sur des documents sous droits qui ne sont pas au
dépôt : elles ne peuvent pas devenir des tests versionnés.

Ce qui a été éprouvé à la place est plus fort que leur transposition : non pas que les résultats
se ressemblent, mais qu'ils soient **la même chose** — même fonction, mêmes octets. Les épreuves
humaines pourront se rejouer en ligne le jour de la mise en marche, sur la mini-bibliothèque.

---

## 9. Trois scénarios pour les écrans en ligne — à trancher avant d'écrire le découpage

Soumis le 19 octobre 2026. Rien n'est écrit sur cette base avant qu'un scénario soit retenu.

### Les quatre faits qui commandent le choix

Relevés dans `apps/app/src/App.tsx`, aux endroits où le port est réellement appelé :

| ligne | ce qui est demandé | pour quel écran |
|---|---|---|
| 217 | `apercuDeBibliotheque` **et** `classementsDeBibliotheque`, ensemble, au chargement | le **Catalogue** : la liste et ses filtres |
| 252 | `vueDeDocument` **et** `passagesDeDocument`, pour le document regardé | le **Lecteur** et la **recherche** |
| 187 | `versionActive`, puis `imageDePage` | résoudre l'image d'une page, à la demande |
| 399 | `classerDocument`, puis relecture des classements | le geste manuel depuis le Catalogue |

Et le fait le plus structurant, vérifié dans `apps/app/src/pages/Recherche.tsx` :

> **La recherche porte sur une seule vue — celle du document ouvert.** Pas sur la bibliothèque.
> L'en-tête annonce « Rechercher dans toutes vos bibliothèques », et ce n'est pas ce que le code
> fait ; cet écart existe déjà au bureau et ne relève pas d'E5.

Autre fait utile : **`versionActive` ne sert qu'à `imageDePage`**. Rien d'autre ne l'appelle. Si
l'instantané portait la version de ses images, cette fonction disparaîtrait du port en ligne.

### Scénario A — un document à la fois

Ce qui est en ligne : **le Lecteur et la recherche**, sur le document publié. Pas de Catalogue,
pas de changement de document. C'est exactement ce que le code sert aujourd'hui.

| fonction | ce qu'il faut |
|---|---|
| `apercuDeBibliotheque` | **rien** — aucun écran ne l'appelle, elle continue de refuser |
| `versionActive` | **rien**, si l'instantané porte la version de ses images ; sinon, un champ à ajouter |
| `classementsDeBibliotheque` | **rien** — pas de Catalogue, donc pas de filtres |
| `classerDocument` | **rien** — la lecture seule en ligne, le classement reste un geste de bureau |

Objets : les **deux** déjà en place. Aucun découpage par document.

Ce qu'on perd : on ne choisit pas le document en ligne. La bibliothèque en ligne **est** le
dernier document publié. Pour deux personnes qui consultent un ouvrage de référence, c'est
peut-être tout ce qu'il faut ; pour une bibliothèque de deux cent cinquante documents, non.

### Scénario B — Catalogue et Lecteur, en lecture seule

Ce qui est en ligne : **le Catalogue** (liste, filtres), **le Lecteur**, la **recherche** dans le
document ouvert. On choisit son document ; on ne classe pas.

| fonction | ce qu'il faut |
|---|---|
| `apercuDeBibliotheque` | un objet `vues/apercu.json` — la liste des documents |
| `vueDeDocument`, `passagesDeDocument` | **deux objets par document**, nommés par l'empreinte, qui doit être vérifiée avant de composer la clé |
| `versionActive` | la version dans l'aperçu ou dans l'instantané — à décider là |
| `classementsDeBibliotheque` | les classements, dans l'aperçu ou à côté |
| `classerDocument` | **rien** — continue de refuser, et le dit |

Ce que cela change pour la publication : elle devient **incrémentale**. Publier une version
pousse les deux objets de **son** document, plus un aperçu rafraîchi. L'aperçu est alors le seul
objet que deux publications simultanées pourraient se disputer — une question à traiter, pas un
obstacle.

C'est le scénario qui donne une bibliothèque en ligne utilisable sans rien rouvrir de ce qui est
décidé.

### Scénario C — tout, classement en ligne compris

Le scénario B, plus `classerDocument` qui écrit.

| fonction | ce qu'il faut |
|---|---|
| tout ce du scénario B | idem |
| `classerDocument` | une route d'écriture, porte = session **et** droit de contribution, et le classement rangé dans la base de la bibliothèque |

Et le coût qu'il faut nommer : **le classement existerait alors à deux endroits** — dans la base
(ce que la route écrit) et dans l'instantané (ce que les écrans lisent). Les deux ne seraient
d'accord qu'entre deux publications. C'est exactement la seconde vérité qu'on vient d'éviter en
servant l'instantané plutôt qu'en le rebâtissant, et elle reviendrait ici pour de bon.

Il y a des réponses — ne pas servir les classements depuis l'instantané mais depuis la base,
republier aussitôt après chaque classement — mais chacune est une décision de plus, et aucune
n'est petite.

### Ma recommandation

**B**, et A seulement si la version en ligne doit exister vite et pour un document.

B donne ce qu'on attend d'une bibliothèque consultable — choisir, lire, chercher — sans rouvrir
une seule décision prise. Son coût est du travail, pas du risque : trois objets de plus et une
vérification d'empreinte.

C attendra qu'on sache si classer en ligne est vraiment demandé. Le faire parce qu'on peut
coûterait la cohérence qu'on vient d'acheter.
