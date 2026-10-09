# Lot E, étape 0 — proposition chiffrée

**Rien n'a été créé, rien n'a été déployé, aucune base n'a été touchée.** Ce document est une
proposition à relire ; chaque étape qui engage une dépense, un réimport ou une bascule attend un
accord écrit et séparé.

Compte vérifié avant toute lecture : `wrangler whoami` répond **11drumboy11@gmail.com**, le compte
du Worker `lienotheque-api`. Inventaire en lecture seule du 9 octobre 2026 :

| Ressource | État |
|---|---|
| D1 `therapeute-library` | **161 Mio**, en service, Studio Clinique en dépend |
| D1 `therapeute-library-staging` | 60 Kio, vide |
| R2 `studio-clinique-brand-assets` | un seul compartiment, sans rapport avec la bibliothèque |
| Vectorize `therapeute-library` | 1024 dimensions, cosinus |

Ces quatre ressources ne seront **ni modifiées ni supprimées** par ce lot.

---

## La contrainte qui commande tout le reste

On ne touche jamais à la bibliothèque actuelle. On en construit une seconde, à côté, avec les mêmes
234 ouvrages, et les deux coexistent jusqu'à ce que la nouvelle soit éprouvée. L'architecture doit
donc répondre à trois questions avant toute autre : **comment deux bibliothèques vivent sans se
voir, comment on passe de l'une à l'autre par un réglage, et comment on prouve que la nouvelle vaut
l'ancienne.** Les points 1, 5 et 6 y répondent ; les autres les servent.

---

## 1. Schéma D1 et isolation entre bibliothèques

Le schéma local de `packages/depot-sqlite` est repris **tel quel**. Il a été écrit pour cela : types
du plus petit dénominateur commun, aucune extension, aucune colonne binaire — les octets vivent
dans le dossier de la bibliothèque, la base ne garde qu'empreintes et chemins (HEB-02, déjà tenu).

**Une base D1 par bibliothèque, plus un registre.**

```
lienotheque-registre          bibliothèques connues, leur état, leur emplacement, les sessions
lienotheque-<clé>             une base par bibliothèque, schéma de depot-sqlite à l'identique
```

L'isolation est **structurelle, pas conditionnelle** : un jeton limité à une bibliothèque donne
accès à une base, pas à une ligne d'une base commune. Aucune clause `WHERE` oubliée ne peut faire
fuir une bibliothèque dans une autre, parce qu'il n'y a pas de requête capable de les atteindre
toutes les deux. C'est la seule raison de ce découpage, et elle suffit : le plan payant autorise
10 Go par base et 50 000 bases.

La base `therapeute-library` n'est **jamais** déclarée dans la configuration du Worker Liénothèque.
Un contrôle de `pnpm check` peut le vérifier sur le fichier de configuration lui-même : une liaison
portant ce nom fait échouer la vérification. La règle devient une donnée, comme la liste des mots
interdits.

**Migrations.** Une seule source de vérité : le tableau `MIGRATIONS` déjà écrit. Les fichiers `.sql`
que réclame `wrangler d1 migrations apply` sont **engendrés** depuis ce tableau au moment de la
construction, et un test vérifie qu'ils n'ont pas dérivé. Sans cela, le schéma local et le schéma
en ligne divergent le jour où quelqu'un corrige un seul des deux.

**Réserve à lever.** La table `document` porte une colonne `bibliotheque_id` qui devient redondante
quand chaque base n'en contient qu'une. Elle ne gêne pas et elle garde le schéma portable ; on la
laisse plutôt que de réécrire une migration publiée.

## 2. R2 : organisation et liens signés

**Un seul compartiment, `lienotheque-medias`, préfixé par bibliothèque.**

```
<clé>/sources/<empreinte[0:2]>/<empreinte>          le fichier déposé, immuable
<clé>/derives/<version>/pages/page-0001.webp        ce qu'une version a produit
```

Les objets sont adressés par leur empreinte SHA-256, qui est déjà la clé primaire de la table
`fichier`. Deux versions qui partagent un fichier partagent l'objet ; un fichier renommé ne bouge
pas ; un objet n'est jamais réécrit.

Un seul compartiment plutôt qu'un par bibliothèque, parce qu'une liaison R2 se déclare dans la
configuration **au déploiement** : une bibliothèque de plus imposerait un redéploiement. Un préfixe
n'impose rien. Le prix de ce choix doit être dit : pour R2, **l'isolation est tenue par le code, pas
par la structure**. On la concentre en un seul endroit — une fonction qui construit les clés à
partir du jeton, jamais à partir de la requête — et un test vérifie qu'aucun autre module ne
compose de préfixe.

**Liens signés (SEC-05).** Deux manières :

| | Comment | Ce que ça coûte |
|---|---|---|
| **a. URL présignée R2** | Signature S3 dans le Worker, 60 à 300 s de validité ; le média part directement de R2 | Une paire de clés S3 de plus dans les secrets |
| **b. Servi par le Worker** | Jeton court signé (HMAC, secret du Worker) portant bibliothèque, clé, expiration et session ; le Worker lit par sa liaison et retransmet | Pas de clé S3 du tout ; le flux traverse le Worker |

**Recommandation : (b) d'abord, partout.** Un secret de moins est un secret de moins (SEC-06), la
sortie R2 est gratuite, et le Worker sait déjà comparer un jeton sans laisser le temps de réponse
dire où il diffère. On passera à (a) pour les gros médias **le jour où une mesure le réclame**, pas
avant. Dans les deux cas : un identifiant difficile à deviner n'est pas une autorisation — c'est la
signature qui autorise, et elle est vérifiée.

## 3. Sessions sans ressaisie (SEC-02, PLT-11)

Deux utilisateurs nommés, 90 jours sans ressaisie, révocable à distance, Touch ID souhaité.

**Recommandation : clés d'accès (passkeys) dans notre propre Worker, sans compte tiers.** Un cookie
`HttpOnly; Secure; SameSite=Lax`, 90 jours, renouvelé à chaque usage ; une table `session` dans le
registre, qu'une révocation vide immédiatement ; Touch ID par WebAuthn, qui est fait exactement pour
ça. Aucun fournisseur d'identité, aucune donnée chez un tiers, et l'exigence est tenue à la lettre
plutôt qu'approchée.

L'autre voie serait **Cloudflare Access** (gratuit jusqu'à 50 utilisateurs) : rien à écrire,
révocation au tableau de bord, journal d'audit offert. Trois raisons de ne pas la retenir ici : elle
suppose un fournisseur d'identité tiers ou un code à usage unique par courriel — donc une ressaisie
périodique ; sa durée de session ne va pas jusqu'à 90 jours ; et elle se placerait devant l'API, ce
qui casserait les appels de Studio Clinique pendant la coexistence.

**Le point délicat, à dire tout de suite.** Studio Clinique envoie aujourd'hui `X-API-Key` depuis le
navigateur, et cette clé est la clé maîtresse — le CDC accepte ce risque jusqu'au lot E, et c'est
précisément ici qu'il se solde. La façade accepte **deux portes** : le cookie de session pour les
écrans Liénothèque, et un **jeton limité à une bibliothèque et à des actions** pour une application
(INT-01, SEC-03), envoyé sous le même nom d'en-tête `X-API-Key` pour que le code de Studio Clinique
n'ait pas à changer. Ce jeton-là n'est pas la clé maîtresse : il est limité, révocable seul, et sa
révocation n'atteint aucun autre accès. SEC-01 et SEC-04 sont tenues au moment de la bascule, pas
avant — et c'est le seul moment où elles peuvent l'être.

## 4. Provisionnement : de « locale » à « publiée », et retour

Une bibliothèque naît **locale** : c'est ce que le lot D2 a livré. La publier, c'est, dans l'ordre :
créer la base D1 avec sa région **choisie explicitement** (HEB-05 ; défaut proposé et expliqué :
Europe de l'Ouest, là où vivent les deux utilisateurs), y appliquer les migrations, l'inscrire au
registre, téléverser les objets sous son préfixe, puis pousser les lignes. HEB-06 demande que
l'écran propose un défaut et une estimation de poids et de coût sans exiger de décision technique :
l'estimation se calcule depuis la base locale, qui connaît déjà le poids de tout.

**Le vrai obstacle technique, et la façon dont je propose de le contourner.** Une liaison D1 se
déclare dans la configuration au déploiement. Trois sorties possibles :

| | Comment | Verdict |
|---|---|---|
| API REST de D1 | Le Worker appelle l'API de Cloudflare avec un jeton de compte | **Écartée.** Le Worker porterait un jeton capable de supprimer une base — exactement ce que SEC-08 interdit |
| Un Worker par bibliothèque | Isolation parfaite | **Écartée.** Trop lourd pour deux bibliothèques |
| **Réserve de liaisons nommées** | `BIB_1`…`BIB_4` déclarées une fois ; le registre associe une clé à une place | **Retenue** |

La réserve de liaisons garde le Worker **sans aucun jeton de compte**. Son prix : publier une
bibliothèque de plus est un déploiement, pas un clic. Avec deux bibliothèques au programme, cette
friction est au bon endroit — elle met une main humaine sur chaque création de base.

**Retour arrière sans perte.** Publier ne retire jamais rien de l'ordinateur : la copie locale reste
celle qui fait foi. Dépublier, c'est repasser l'état du registre à `locale` et cesser de servir. La
base D1 et le préfixe R2 **restent en place** ; ils ne sont supprimés que sur ordre explicite, jamais
par le retour arrière lui-même, jamais automatiquement.

## 5. Façade de compatibilité Studio Clinique (INT-04, RCH-12)

### Ce que j'ai trouvé en lisant son code

Studio Clinique appelle quatre routes en `POST`, avec l'en-tête `X-API-Key` :
`/d1-query`, `/search-library`, `/library-facets`, `/rag-search`. Les réponses attendues sont
`{ results: [...] }`, `{ facets: {...} }` et `{ chunks: [...] }`, et chaque élément porte
`id, book_id, book_title, author, chapter, page_number, page_end, content, approach, language,
score`. La base actuelle est **une seule table plate `chunks`** portant ces colonnes.

Et surtout, l'adresse du Worker se résout par une cascade :

```js
window.conversationalSystem?.WORKER_URL || window._therapyWorkerUrl
  || window.CONFIG?.WORKER_URL || localStorage.getItem('workerUrl')
  || 'https://clone-proxy.11drumboy11.workers.dev'
```

**La bascule est donc une seule valeur.** Pas une migration, pas une modification du code de Studio
Clinique : `WORKER_URL` pointe vers l'ancien Worker ou vers le nouveau. Remettre l'ancienne valeur
annule la bascule en une seconde, et les deux bibliothèques sont intactes des deux côtés.

### Ce que la façade doit faire

Exposer les quatre routes avec les mêmes corps de requête et les mêmes formes de réponse, en les
**projetant** depuis le schéma normalisé de Liénothèque — jamais en recopiant une table plate à
côté, qui divergerait dès la première correction.

La projection pose une question de principe. `author`, `approach`, `language`, `chapter` sont des
**mots du domaine**, et rien de générique n'a le droit de les connaître (CLA-01). La façade est donc
pilotée par une **table de correspondance rangée dans la bibliothèque**, au même titre qu'un modèle
de `fixtures/modeles/` :

```json
{ "book_title": "titre du document", "author": "axe:auteur",
  "approach": "axe:approche", "language": "axe:langue",
  "content": "texte du passage", "page_number": "page imprimée de l'ancre" }
```

Le code de la façade ne contient aucun de ces mots ; il lit une correspondance. Une autre
application, un autre domaine, une autre correspondance, et pas une ligne de code de plus.

**Deux réserves honnêtes.** `/d1-query` ne reçoit pas du SQL mais une intention, que le Worker
actuel traduit en l'un de deux gabarits préparés fixes ; la façade doit reproduire la **sémantique**
de ces deux gabarits, ce qui demande de les lire ligne à ligne au lot E2. Et un commentaire du
Worker affirme que `/rag-search` n'a plus de consommateur réel, alors qu'un appel subsiste dans le
code — à vérifier avant de décider si la façade doit vraiment la servir, plutôt qu'à supposer.

## 6. Comparer les deux bibliothèques avant la bascule

C'est la preuve qui autorise le lot E4, et elle doit exister avant qu'on en ait besoin.

Un **banc de comparaison** interroge les deux Workers avec exactement le même corps, sur un jeu de
requêtes figé — le F5 du CDC : 30 à 50 requêtes par bibliothèque, français, anglais, sigles courts,
auteurs, phrases exactes, filtres — et mesure quatre choses :

| Ce qu'on mesure | Le seuil que je propose |
|---|---|
| **Rappel par ouvrage** : pour chaque requête, l'ensemble des livres rendus | Aucune requête ne perd un livre que l'ancienne trouvait |
| **Recouvrement des passages** : Jaccard sur `book_title\|page_number\|content[:60]` | Rapporté, non bloquant — un passage mieux découpé n'est pas une régression |
| **Exactitude de la page**, sur un échantillon relu à la main | C'est ici que la nouvelle doit **dépasser** l'ancienne : c'est sa raison d'être |
| **Latence p50 et p95** | p95 au plus 1,5 fois celle de l'ancienne (RCH-11 exige ce rapport avant toute bascule) |

S'y ajoute le contrôle qui ne se négocie pas : **chaque extrait rendu existe mot pour mot dans la
source** (RCH-09, MCP-04). Zéro citation non vérifiée, ou pas de bascule.

Le CDC prévoit la fixture **F8** — dix livres de l'ancienne base, retrouvés via la façade, alias
conservés. Elle sert de contrôle serré à l'intérieur du banc.

**Une précaution de méthode.** L'ancienne base n'est pas une vérité : le CDC remplace sa réparation
par un réimport complet, et F2 montre 305 titres sur 437 dans sa couche existante. « Au moins aussi
bien » se mesure donc contre ses **réponses réelles**, pas contre un idéal — et là où la nouvelle
diverge, c'est un humain qui tranche, pas un seuil.

## 7. Sauvegarde et restauration (SEC-10)

À éprouver **avant** qu'aucune donnée réelle n'existe sur Cloudflare.

- **D1.** Time Travel couvre 30 jours de retour en arrière, mais ce n'est pas une sauvegarde qu'on
  tient dans la main. On ajoute un export `wrangler d1 export` **vers le volume externe**, hebdomadaire
  et avant chaque migration. Lancé depuis le Mac : un jeton Cloudflare n'a rien à faire dans un dépôt
  public, donc aucune action GitHub ne sauvegarde quoi que ce soit.
- **R2.** Les objets sont adressés par leur empreinte et jamais réécrits ; la sauvegarde, c'est le
  dossier local de la bibliothèque, qui les contient déjà. Autrement dit : **R2 est la copie, le Mac
  est l'original.** C'est la meilleure histoire de sauvegarde possible, et elle est déjà vraie.
- **Le registre** est minuscule et part avec le reste.
- **L'épreuve que SEC-10 réclame** — une restauration réelle, chronométrée : on restaure l'export
  dans une base nommée sans ambiguïté `lienotheque-restauration-essai`, on relance le banc de
  comparaison contre elle, on chronomètre. D'abord sur des données d'essai (F3, qui nous appartient),
  puis une seconde fois après le premier import réel.

## 8. Mode mixte avec tunnel (PLT-06)

Le principe : les métadonnées et les dérivés légers viennent de Cloudflare, les médias lourds restent
sur le Mac et passent par un tunnel quand il est allumé ; quand il ne l'est pas, **l'interface le
dit** — c'est le critère d'acceptation, et un sablier n'est pas une annonce.

Un tunnel Cloudflare nommé est gratuit, mais il réclame **un domaine sur Cloudflare** : les adresses
éphémères en `trycloudflare.com` ne sont ni stables ni authentifiées. Le tunnel serait publié derrière
Cloudflare Access avec un jeton de service, pour que **seul le Worker** puisse l'atteindre, et le
Worker l'interrogerait avec un délai court — une à deux secondes — pour annoncer l'absence plutôt que
de la faire attendre.

**Recommandation : pas de tunnel pour les 234 ouvrages.** Ce sont des documents et des pages ; leurs
dérivés optimisés tiennent dans R2 sans difficulté, et le mode « publiée » suffit. Le tunnel gagne sa
place sur le **corpus musical** — audio et vidéo —, où le poids change d'ordre. Cela repousse la
question du domaine hors du lot E1 et laisse le lot E petit.

## 9. Coût mensuel estimé

Socle : **abonnement Workers Paid, 5 $/mois**, déjà payé pour les Workers existants (à confirmer).

| Poste | Pendant la coexistence | Après suppression de l'ancienne |
|---|---|---|
| Stockage D1 | 161 Mio + ~200 à 400 Mio ≈ 0,6 Go, compris dans l'abonnement | ~0,3 Go, idem |
| Lignes lues D1 | très en deçà du compris | idem |
| R2 | **0 $** jusqu'à 10 Go ; 0,30 $ à 30 Go ; 1,35 $ à 100 Go | idem, un préfixe de moins |
| Vectorize | ~0,15 $ (deux index) | ~0,08 $ |
| Tunnel, Access | 0 $ | 0 $ |
| Domaine, si tunnel | ~1 €/mois | ~1 €/mois |
| **Infrastructure** | **5 $ + 0 à 2 $** | **5 $ + 0 à 2 $** |
| Réponses rédigées (Haiku) | ~1 centime l'unité : 1 $ pour 100, 10 $ pour 1 000 | identique |
| Vision ciblée | plafond que vous fixez | identique |

**La conclusion est nette : la coexistence des deux bibliothèques ne coûte presque rien.** Garder
l'ancienne pendant la validation ajoute 161 Mio de base et un index — soit une dizaine de centimes
par mois. Ce n'est pas un argument pour se presser de la supprimer.

Ce qui coûte, ce sont les réponses rédigées et la vision ciblée, les deux seuls postes qui croissent
avec l'usage. Le CDC le dit déjà, et c'est le plafond du Worker qui les borne.

**Dépenses ponctuelles du réimport (E2)** : embeddings des passages des 234 ouvrages, quelques
dollars ; vision ciblée sur les zones difficiles, selon le plafond ; transcription Whisper s'il y a
de l'audio, 0,27 $ pour dix heures. Chiffrables dès que vous m'aurez donné le poids du corpus.

## 10. Ordre de construction

| Lot | Ce qu'on fait | Ce qui autorise le suivant |
|---|---|---|
| **E1** | Registre, schéma sur D1, préfixes R2, sessions par clé d'accès, liens signés, provisionnement, sauvegarde et restauration éprouvées, façade répondant aux quatre routes **depuis une bibliothèque d'essai** (F3, qui nous appartient) | Restauration chronométrée et documentée ; aucune clé dans un navigateur ; banc de comparaison vert sur la bibliothèque d'essai. **Rien de réel n'a été touché** |
| **E2** | Réimport réel des 234 ouvrages dans la **nouvelle** bibliothèque | **Accord explicite et séparé.** L'ancienne reste intacte |
| **E3** | Comparaison et validation (F8, requêtes F5), rapport daté | Le rapport, lu et accepté par vous |
| **E4** | Bascule : une valeur de configuration | **Accord explicite et séparé.** Retour arrière par la même valeur |
| **E5** | Version en ligne | — |
| **E6** | Suppression de l'ancienne bibliothèque | **Accord explicite et séparé**, et pas avant qu'une restauration de son export ait été prouvée chronomètre en main |

---

## Questions qu'il me faut pour chiffrer sérieusement

1. **Domaine.** En possédez-vous un sur Cloudflare ? Sans lui, pas de tunnel nommé — ce qui ne gêne
   pas le lot E1 tel que je le propose, mais décide du corpus musical plus tard.
2. **Nommage.** `lienotheque-<nom>` pour les bases et les préfixes. Quel nom pour la bibliothèque
   thérapeutique ? Il doit se distinguer sans ambiguïté de `therapeute-library`.
3. **Plafond mensuel.** Quel montant maximum pour l'usage IA, et le Worker doit-il **refuser** une
   fois le plafond atteint ? RCH-10 exige un refus propre, donc il me faut un chiffre.
4. **Format de la base actuelle.** J'ai lu le **code** du Worker, pas la base. Pour finir la table de
   correspondance de la façade, il me manque le nombre total de passages et de savoir si
   `author`, `approach`, `language` et `chapter` sont renseignés pour les 234 ouvrages ou seulement
   pour une partie. Trois `SELECT` en lecture seule répondraient — **je ne les ai pas lancés et je ne
   les lancerai pas sans votre accord**, la base étant interdite par CLAUDE.md.
5. **Poids du corpus.** Poids total des sources des 234 ouvrages, et des dérivés optimisés si vous le
   connaissez. C'est la seule vraie inconnue de l'estimation : elle décide à elle seule si R2 coûte
   zéro ou un dollar et demi.
6. **Abonnement.** Workers Paid, confirmé ? `wrangler queues list` a répondu sans erreur de
   facturation, ce qui le laisse penser, mais HEB-04 demande une vérification, pas une déduction.
7. **Médias.** La bibliothèque thérapeutique porte-t-elle de l'audio ou de la vidéo, ou seulement des
   documents ? C'est ce qui décide tunnel ou R2.
8. **Second utilisateur.** Sa clé d'accès dès E1, ou plus tard ? Et quels droits : lecture,
   contribution, administration (SEC-03) ?
