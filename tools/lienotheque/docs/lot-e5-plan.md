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
| 5 | **Les images et médias par liens signés**, depuis R2 | Une page s'affiche en ligne ; un lien expiré refuse |
| 6 | **La recherche en ligne sur la mini-bibliothèque** | Les mêmes quatre épreuves qu'au bureau, mêmes résultats |
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
