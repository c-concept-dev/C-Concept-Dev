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

**Confirmé par l'utilisateur le 9 octobre 2026** : Workers Paid et R2 Paid actifs, renouvellement
le 5 novembre 2026 ; 40 $ de budget disponible sur le compte. HEB-04 est donc tenue — les limites
à retenir sont celles du plan payant : 10 Go par base D1, 50 000 bases.

**Plafond de précaution retenu : 10 $ par mois** sur les appels IA (réponses rédigées et vision
ciblée), à ajuster avec l'usage réel. Le Worker le fait respecter par un refus propre, jamais par
une dégradation silencieuse (RCH-10) : un compteur mensuel dans le registre, et au-delà, une
réponse qui dit « plafond atteint » plutôt qu'une réponse plus courte sans le dire.

---

## La contrainte qui commande tout le reste

Le CDC l'a inscrite depuis, sous **BAS-01 à BAS-05** : on ne touche jamais à la bibliothèque
actuelle pendant la construction, les deux coexistent, et aucune des étapes BAS-02 (réimport),
BAS-04 (bascule) et BAS-05 (suppression) ne s'exécute sans accord explicite et séparé, donné après
un plan écrit. Les lots E1 à E6 de ce document portent ces cinq étapes ; la correspondance est
donnée au point 10.

On ne touche jamais à la bibliothèque actuelle. On en construit une seconde, à côté, avec les mêmes
234 ouvrages, et les deux coexistent jusqu'à ce que la nouvelle soit éprouvée. L'architecture doit
donc répondre à trois questions avant toute autre : **comment deux bibliothèques vivent sans se
voir, comment on passe de l'une à l'autre par un réglage, et comment on prouve que la nouvelle vaut
l'ancienne.** Les points 1, 5 et 6 y répondent ; les autres les servent.

---

## Le corpus, mesuré plutôt qu'estimé

C'est le point qu'il fallait chiffrer correctement, et il réservait trois surprises.

### Ce que pèse vraiment le dossier

Le dossier des ouvrages, sur le Mac : **11,90 Go de PDF** répartis sur 267 fichiers, plus une poignée d'EPUB qui ne pèsent presque rien. La distribution est très inégale —
médiane 3,2 Mo, troisième quartile 85,7 Mo, maximum 345 Mo : une petite minorité de gros scans fait
l'essentiel du poids.

**Première surprise : 4,52 Go sont des doublons exacts.** Trente-neuf fichiers en double dans
`IRIS SCAN` (un sous-dossier « dossier 2 » qui reprend le dossier parent) et un dans `SEXO`.
Vérifié au hachage, pas seulement au nom : deux fichiers de 267,6 Mo rendent la même empreinte
SHA-256 au bit près. Liénothèque les dédoublonne sans rien demander — l'empreinte **est** la clé
primaire de la table `fichier`. Le corpus réel à héberger n'est donc pas 11,90 Go mais **7,38 Go**.

### Ce que l'optimiseur gagne, mesuré

Cinq documents représentatifs copiés dans un espace de travail local hors du dépôt, passés par
l'optimiseur du projet (`outils/optimiseur`, OPT-01 à OPT-04 : groupe 4 pour le noir et blanc,
AVIF pour le gris et la couleur, résolution jamais réduite, page native jamais touchée). Huit pages
réparties sur toute la longueur de chaque document, **encodées pour de vrai**, pas estimées :

| Document | Poids | Pages dominantes | Pages | Couche texte | Images | Hors images | Mesuré sur | Rapport |
|---|---:|---|---:|---|---:|---:|---:|---:|
| Petit document | 1,1 Mo | native 73 % | 40 | oui | 0,6 Mo | 0,5 Mo | — | — |
| Livre natif | 13,8 Mo | mixte 100 % | 286 | oui | 2,4 Mo | 11,4 Mo | — | — |
| Scan moyen | 55,6 Mo | mixte 100 % | 108 | oui | 54,6 Mo | 1,0 Mo | 8 p. | **×0,43** |
| Gros scan | 85,7 Mo | mixte 100 % | 108 | oui | 84,3 Mo | 1,4 Mo | 8 p. | **×0,42** |
| Très gros scan | 345,0 Mo | mixte 100 % | 158 | oui | 217,4 Mo | 127,6 Mo | 8 p. | **×0,28** |

**Échantillon encodé : 20,4 Mo → 7,1 Mo, soit ×0,350.** Les images de page font **72 %** du poids
des documents lus.

Deux bancs, qui ne modifient rien et se relancent sur n'importe quel dossier :
`outils/ingestion/mesures/poids-optimise.ts` pour le poids et le gain,
`outils/ingestion/mesures/sonde-pdf.ts` pour savoir à quoi les octets d'un PDF sont passés. Les
copies de travail ont été effacées après la mesure.

**Deuxième surprise, et c'est la bonne : tous les scans portent déjà une couche texte.** « Mixte
100 % » veut dire que chaque page porte à la fois une image et du texte — ces ouvrages sont passés
par un lecteur optique avant d'arriver ici. Le réimport n'aura donc pas à tout océriser : le
lecteur de texte (OUT-05) lit cette couche. **Ce que cela retire du coût de E2 est considérable.**

La réserve qui va avec : cette couche existe, sa **qualité** est inconnue. Le CDC relève, sur la
fixture F2, 305 titres sur 437 dans une couche OCR existante. Faut-il s'y fier ou réocériser ?
C'est une mesure à faire au début de E2, sur un échantillon, pas une hypothèse à poser ici.

**Troisième surprise : 122,5 Mo qui ne s'affichent nulle part.** Le très gros scan montrait
127,6 Mo inexpliqués. La sonde `outils/ingestion/mesures/sonde-pdf.ts` a tranché, et **ma première
hypothèse était fausse** : le document porte bien neuf marqueurs de fin de fichier — neuf
enregistrements successifs —, mais les objets périmés qu'ils laissent derrière eux **pèsent zéro**.

Le compte réel est ailleurs : **348 objets image pour 158 pages**, 339,8 Mo au total, tous de
~4 200 × 3 200 pixels — des pages entières photographiées, pas des bandes. Et les 158 pages en
réclament exactement **158**. Les **190 autres, 122,5 Mo, ne sont réclamées par aucune page.**

Ce sont des pages retirées du document au fil de ses neuf enregistrements, dont les octets n'ont
jamais été repris. Elles ne s'affichent nulle part, et personne ne les lira jamais. Le lecteur de
format n'avait donc aucun défaut : il comptait ce qu'il faut compter.

**Trois conséquences.**

D'abord, Liénothèque copie **des pages, pas des fichiers** : une image qu'aucune page ne réclame
n'est jamais convertie et ne part jamais chez l'hébergeur. Ce document de 345 Mo ne pèsera pas
121 Mo une fois optimisé (345 × 0,35) mais **61 Mo** (217,4 × 0,28). Le gain est meilleur que le
rapport ne le laisse croire, parce qu'une partie du poids disparaît sans même être encodée.

Ensuite, **l'estimation de 1,9 Go est une borne haute**, et c'est heureux : elle part de la part
d'images mesurée sur les fichiers entiers (72 %), alors que seules les images réclamées par une
page comptent. S'il existe d'autres documents porteurs d'orphelines — et il y en a probablement —,
le poids réel sera en dessous.

Enfin, une amélioration que je **ne fais pas** dans ce lot mais qui mérite d'être notée :
l'Inspecteur (OUT-01) sait déjà signaler les images répétées ; il ne sait pas signaler les images
qu'aucune page ne réclame. Le réimport les révélera gratuitement, puisqu'il ne copie que ce qu'une
page demande.

Accessoirement, le rapport mesuré (×0,35) **bat la table prudente des contrats** (`RAPPORTS_ESTIMES`
annonce 0,39 en noir et blanc, 0,54 en gris et en couleur). La table n'est pas fausse, elle est
prudente, et elle sert à annoncer un poids avant envoi. Je ne la touche pas dans ce lot.

### Trois poids qu'il ne faut surtout pas confondre

L'ancienne base pèse 168,7 Mo pour 234 ouvrages, dont 75,3 Mo de texte et le reste d'index. Ce n'est **pas** une cible : c'est du texte seul,
découpé en passages pour la recherche, sans une seule image de page. Liénothèque garde en plus les
images, parce que montrer la vraie page est sa raison d'être. Comparer les deux reviendrait à
comparer une table des matières à un livre.

| Ce qu'on pèse | Où ça vit | Poids estimé |
|---|---|---|
| **Texte seul** — les passages, pour chercher | D1, pas R2 | **75,3 Mo de texte mesurés**, ~170 à 250 Mo une fois indexés |
| **Images de page optimisées** — pour montrer la vraie page | R2 | **~1,9 Go** (7,38 Go × 72 % × 0,35) |
| **Sources d'origine**, si on choisit de les garder en ligne | R2 | + 7,38 Go |

**Et c'est là qu'une décision vous revient.** Une bibliothèque publiée n'a besoin, pour être lue
sans l'ordinateur, que des **dérivés** : les images de page optimisées. Les PDF d'origine ne sont
indispensables en ligne que si l'on veut pouvoir les retélécharger ou retraiter dans le nuage. Or
le Mac les garde déjà, et il reste l'original (point 7).

| | Poids R2 | Coût R2 |
|---|---:|---|
| **Dérivés seuls** (recommandé) | ~1,9 Go | **0 $** — très en deçà des 10 Go offerts |
| Sources et dérivés | ~9,3 Go | **0 $**, mais au bord de la tranche gratuite |

Je recommande **les dérivés seuls**, et de garder les sources sur le Mac et sa sauvegarde. Non pour
économiser — les deux coûtent zéro — mais parce que téléverser 7,4 Go d'œuvres sous droits chez un
hébergeur sans en avoir besoin n'est pas un geste neutre, et parce que la marge sous les 10 Go est
ce qui permettra d'ajouter une deuxième bibliothèque sans y repenser.

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

### L'ancienne base, consultée en lecture seule

Consultation autorisée le 9 octobre 2026, **aucune écriture** : `rows_written: 0` sur chaque
requête, et la taille de la base est inchangée. Voici ce qu'elle contient réellement.

| | |
|---|---:|
| Passages | **22 022** |
| Identifiants d'ouvrage distincts | **234** |
| Texte, octets cumulés | **75,3 Mo** |
| Poids de la base D1 | 168,7 Mo |
| Passage moyen | ~3 400 caractères |
| Français | 20 733 passages, 224 ouvrages |
| Anglais | 1 289 passages, 10 ouvrages |

**Le texte ne fait que 45 % de la base.** 75,3 Mo de contenu pour 168,7 Mo occupés : le reste est
l'index de recherche plein texte et la structure. C'est un bon repère pour dimensionner D1 côté
Liénothèque — le texte seul y pèsera du même ordre, et l'index ce que l'index coûte.

**Taux de remplissage des colonnes que la façade doit rendre :**

| Colonne | Renseignée | Verdict pour la correspondance |
|---|---:|---|
| `content`, `page_number`, `language` | 100 % | à faire correspondre |
| `author` | 99,9 % (25 passages vides) | à faire correspondre |
| `approach` | 100 % | à faire correspondre |
| `chapter` | **10 passages sur 22 022** | vestigiale — rien à perdre à la rendre vide |
| `page_end` | **170 passages sur 22 022** | vestigiale — idem |

Deux colonnes sur sept ne servent donc à rien. La façade les rendra, puisqu'elles existent dans le
contrat de fait, mais aucune donnée de Liénothèque n'a besoin de s'y plier.

### Deux corrections que la consultation impose

**`ADMIN_APPROACHES` ne décrit pas les données.** La liste de l'outil d'administration propose
22 valeurs ; la base en contient **19**, dont **quatre que la liste n'offre pas** :

| Dans la base, absente de la liste | Passages |
|---|---:|
| `sexology` | 3 103 |
| `pnl` | 408 |
| `at` | 107 |
| `personality_profiling` | 7 |
| **Total invisible au filtre** | **3 625, soit 16,5 % de la base** |

À l'inverse, sept valeurs de la liste (`outils_couple`, `cbt`, `cft`, `dbt`, `mi`, `pbt`,
`psychodynamic`) n'existent dans aucun passage. **Un filtre construit sur la liste masquerait un
sixième de la bibliothèque** — silencieusement, puisqu'il n'y a aucune erreur à produire.

C'est la confirmation la plus nette de ce que CLA-01 impose : les valeurs d'un axe se lisent dans
les données, jamais dans une liste écrite à côté. La correspondance ci-dessous prend donc les
19 valeurs réelles comme point de départ, et le schéma de la bibliothèque les porte.

**240 ouvrages ou 234 ?** Les deux chiffres circulent parce qu'ils ne comptent pas la même chose :
234 identifiants distincts, mais 240 combinaisons de métadonnées. Un seul identifiant explique
l'écart — `personality-profiling`, dont les **sept passages portent sept jeux de métadonnées
différents**. Sept documents courts entrés sous un même identifiant. C'est minuscule, et c'est
précisément le genre d'anomalie qu'une table plate laisse passer et qu'une table `document` avec
une identité propre rend impossible. Bon candidat pour la fixture F8.

### Ce que la façade doit faire

Exposer les quatre routes avec les mêmes corps de requête et les mêmes formes de réponse, en les
**projetant** depuis le schéma normalisé de Liénothèque — jamais en recopiant une table plate à
côté, qui divergerait dès la première correction.

La projection pose une question de principe. `author`, `approach`, `language`, `chapter` sont des
**mots du domaine**, et rien de générique n'a le droit de les connaître (CLA-01). La façade est donc
pilotée par une **table de correspondance rangée dans la bibliothèque**, au même titre qu'un modèle
de `fixtures/modeles/` :

```json
{
  "book_id":     "document.id",
  "book_title":  "document.titre",
  "author":      "axe:auteur",
  "approach":    { "axe": "approche", "valeurs": ["couple", "sexology", "hypnosis",
                   "schema_therapy", "icv", "general", "act", "trauma", "personal_development",
                   "systemic", "coherence", "pnl", "attachment", "cnv", "ifs", "emdr",
                   "mbct", "at", "personality_profiling"] },
  "language":    { "axe": "langue", "valeurs": ["fr", "en"] },
  "chapter":     null,
  "content":     "texte du passage",
  "page_number": "page imprimée de l'ancre",
  "page_end":    null,
  "chunk_index": "rang du passage dans le document",
  "score":       "confiance du lien"
}
```

Le code de la façade ne contient aucun de ces mots ; il lit une correspondance. Une autre
application, un autre domaine, une autre correspondance, et pas une ligne de code de plus.

Les dix-neuf valeurs d'`approach` sont celles que **la base contient réellement**, par ordre de
poids, et non les vingt-deux que propose l'outil d'administration — la consultation ci-dessus
explique pourquoi l'écart compte. Les deux valeurs de `language` sont confirmées des deux côtés.
Elles deviennent ici les valeurs d'axe du schéma de la bibliothèque : une donnée du domaine, à sa
place. `chapter` et `page_end` sont à `null` parce qu'ils ne portent rien — la façade les rend
vides, comme aujourd'hui pour 99,9 % des passages.

**Une page lue, pas une page devinée.** L'ancien outil attache un numéro de page à un passage par
une carte mot à mot : il compte les mots de chaque page, puis retrouve de quelle page vient chaque
mot du passage. C'est ingénieux et c'est approximatif. Liénothèque attache le passage à une
**ancre**, qui porte la page imprimée réellement lue sur la page. Le `page_number` de la façade sera
donc meilleur que celui de l'ancienne base — et c'est précisément ce que le banc de comparaison
(point 6) doit mesurer, parce que c'est le seul endroit où une divergence entre les deux systèmes
est une **amélioration** et non une régression.

**Une route ouverte, à trancher.** Les routes de mutation et de recherche exigent toutes
`X-API-Key`. Une exception : **`/library-stats` est appelée trois fois sans aucun en-tête**. Elle
rend la liste des ouvrages, leurs auteurs, leurs approches et le nombre total de passages. La
façade doit choisir — la laisser ouverte comme aujourd'hui, ou la fermer, ce qui serait un
changement de comportement pour l'outil d'administration, qui cesserait de répondre sans jeton.
Mon avis : la fermer, et donner son jeton à l'outil d'administration le jour de la bascule. SEC-05
demande que tout accès soit authentifié, et une liste d'ouvrages est déjà une donnée.

**Deux réserves honnêtes.** `/d1-query` ne reçoit pas du SQL mais une intention, que le Worker
actuel traduit en l'un de deux gabarits préparés fixes ; la façade doit reproduire la **sémantique**
de ces deux gabarits, ce qui demande de les lire ligne à ligne au lot E2. Et un commentaire du
Worker affirme que `/rag-search` n'a plus de consommateur réel, alors qu'un appel subsiste dans le
code — à vérifier avant de décider si la façade doit vraiment la servir, plutôt qu'à supposer.

## 5 bis. Ce que l'ancien outil d'administration apprend

`bibliotheque-admin.html` a tourné en production pendant des mois. Ses commentaires forment un
journal de pannes, et ce journal vaut mieux qu'un avis. **Aucune de ses lignes n'est reprise** — le
code de Liénothèque suit ses contrats et ses règles. Ce sont les leçons qui se reprennent, réécrites.

**Quatre pannes, une seule forme : une étape qui annonce un succès sans l'avoir vérifié.**

| Ce qui s'est passé | Ce que Liénothèque en retient |
|---|---|
| La vérification de doublon échouait (réseau, HTTP, JSON illisible) et l'ingestion **continuait comme si l'absence de doublon était confirmée** | Un contrôle qui n'a pas pu s'exécuter n'est pas un contrôle réussi. En cas d'échec, le travail s'arrête — c'est déjà la règle de la file (JOB), elle doit valoir pour chaque vérification |
| La suppression de l'ancien contenu affichait « supprimé » **sans lire le résultat** de l'appel | Un geste destructeur se confirme sur la réponse, jamais sur l'absence d'exception |
| Le Worker avalait les erreurs par passage dans un `try/catch` vide et rendait 200 ; une ingestion **partielle s'affichait comme complète** | Ce qui est écrit se compte et se compare à ce qui devait l'être. Le dépôt rend déjà un bilan par travail — il doit être lu, pas supposé |
| Le rang d'un passage était recalculé **localement sur chaque lot de 20**, créant des rangs en double au-delà de vingt passages et cassant le dédoublonnage | Un fait se calcule à un seul endroit. C'est déjà une règle du projet ; en voici le prix quand on l'enfreint |

**Trois autres idées qui méritent d'être reprises.**

*Une valeur par défaut jamais vérifiée doit se savoir.* L'outil met `language: 'fr'` par défaut et
le commentaire le dit sans détour : cette valeur n'est jamais vérifiée pour un PDF ; seule une
détection positive et fiable la remplace. Liénothèque a la même situation partout où une recette
propose un défaut. La leçon : **distinguer dans la donnée ce qui a été lu de ce qui a été supposé**
— c'est exactement ce que fait déjà `numeroLu` à côté du rang, et il faut l'étendre.

*Ce qui vient du serveur n'est pas digne de confiance.* Les titres et les auteurs rendus par le
Worker sont échappés avant insertion, parce qu'ils viennent de métadonnées saisies à l'ingestion.
Liénothèque valide tout ce qui traverse une frontière par un contrat — même raison, meilleure arme.

*Une liste écrite deux fois diverge.* Les approches étaient codées en dur dans le HTML **et** dans
le script, et les deux listes avaient déjà cessé de correspondre. C'est la règle CLA-01 vue par la
bande : le vocabulaire est une donnée, et une donnée n'a qu'un seul endroit.

**Et une mise en garde.** Le découpage en passages de l'ancien outil tient en un paramétrage
empirique — 500 mots visés, 700 au plus, 900 en limite dure, 100 mots de recouvrement, découpage
par paragraphes avec une acrobatie pour les paragraphes trop longs. Ces nombres ont été réglés par
l'usage, et ils portent la pertinence de l'ancienne base. **Le banc de comparaison les jugera** :
si Liénothèque découpe autrement et retrouve moins bien, c'est le découpage qu'il faudra revoir, pas
la mesure qu'il faudra arranger.

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

Socle : **Workers Paid et R2 Paid, actifs**, renouvellement le 5 novembre 2026.

| Poste | Pendant la coexistence (BAS-02 à BAS-04) | Après BAS-05 |
|---|---|---|
| Stockage D1 | 168,7 Mo (ancienne, mesurée) + ~170 à 250 Mo (nouvelle) ≈ 0,4 Go | ~0,25 Go |
| Lignes lues D1 | très en deçà de ce que le plan comprend | idem |
| **R2, dérivés seuls** | **~1,9 Go → 0 $** (10 Go offerts) | idem |
| R2, si l'on garde aussi les sources | ~9,3 Go → 0 $, mais au bord de la tranche | idem |
| Vectorize | ~0,15 $ (deux index) | ~0,08 $ |
| Tunnel, Access | 0 $ | 0 $ |
| Domaine, si tunnel | ~1 €/mois | ~1 €/mois |
| **Infrastructure** | **0 à 0,20 $ au-dessus de l'abonnement** | **idem** |
| Réponses rédigées (Haiku) | ~1 centime l'unité | identique |
| Vision ciblée | sous le plafond | identique |
| **Plafond IA retenu** | **10 $/mois**, refus propre au-delà (RCH-10) | identique |

**La mesure a tranché une inquiétude : l'hébergement ne coûte rien.** Avec les dérivés seuls, les
1,9 Go tiennent cinq fois dans la tranche gratuite de R2, et les deux bases D1 réunies pèsent moins
d'un demi-giga-octet. Garder l'ancienne bibliothèque pendant toute la validation coûte **une
dizaine de centimes par mois**. Il n'y a donc aucune raison financière de se presser de la
supprimer — et c'est la meilleure nouvelle de ce chiffrage, parce que la prudence ne se paie pas.

Le seul poste qui croît avec l'usage reste l'IA. Le plafond de 10 $ le borne, et le budget de 40 $
disponible laisse quatre mois de marge au plafond plein — très au-delà de ce qu'un usage normal
consommera.

**Dépenses ponctuelles du réimport (BAS-02).** Elles viennent de fondre : tous les scans de
l'échantillon portent déjà une couche texte, donc **pas d'océrisation de masse à prévoir**. Restent
les embeddings des passages — quelques dollars pour l'ordre de grandeur de l'ancienne base — et la
vision ciblée sur les seules zones difficiles, sous le plafond. Le chiffre exact se posera après la
mesure de qualité de la couche texte, au début de E2.

## 10. Ordre de construction

| Lot | Ce qu'on fait | Ce qui autorise le suivant |
|---|---|---|
| **E1** = BAS-01 | Registre, schéma sur D1, préfixes R2, sessions par clé d'accès, liens signés, provisionnement, sauvegarde et restauration éprouvées, façade répondant aux quatre routes **depuis une bibliothèque d'essai** (F3, qui nous appartient) | Restauration chronométrée et documentée ; aucune clé dans un navigateur ; banc de comparaison vert sur la bibliothèque d'essai. **Rien de réel n'a été touché** |
| **E2** = BAS-02 | Réimport réel des 234 ouvrages dans la **nouvelle** bibliothèque | **Accord explicite et séparé.** L'ancienne reste intacte |
| **E3** = BAS-03 | Comparaison et validation (F8, requêtes F5), rapport daté | Le rapport, lu et accepté par vous |
| **E4** = BAS-04 | Bascule : une valeur de configuration | **Accord explicite et séparé.** Retour arrière par la même valeur |
| **E5** | Version en ligne | — |
| **E6** = BAS-05 | Suppression de l'ancienne bibliothèque | **Accord explicite et séparé**, et pas avant qu'une restauration de son export ait été prouvée chronomètre en main |

---

## Ce qui est arrêté

**Décidé par l'utilisateur le 9 octobre 2026 :**

| | |
|---|---|
| Abonnement | Workers Paid et R2 Paid actifs — HEB-04 tenue |
| Plafond IA | **10 $/mois**, refus propre au-delà |
| R2 | **dérivés seuls, jamais les sources** — les œuvres sous droits restent sur le Mac |
| Corpus | 7,38 Go réels, **~1,9 Go de dérivés** (borne haute) |
| Couche texte | sa qualité se mesure sur échantillon **au début de E2**, avant tout réimport |

**Proposé ici, à confirmer d'un mot — ce sont les cinq questions restantes :**

**1. Nommage.** `lienotheque-therapie` pour la base et `therapie/` pour le préfixe R2 ;
`lienotheque-registre` pour le registre ; `lienotheque-essai` pour la bibliothèque d'essai de E1,
nommée pour qu'on ne la confonde jamais avec une vraie. Aucune collision possible avec
`therapeute-library`, qui ne partage ni préfixe ni suffixe.

**2. `/library-stats` : fermée.** Elle est aujourd'hui accessible sans jeton et rend la liste de
vos ouvrages, leurs auteurs et leurs approches. SEC-05 ne souffre pas d'exception, et LIV-04
conditionne la livraison à des tests de fuite négatifs. Le coût de la fermeture est **une ligne**
dans l'outil d'administration — l'en-tête qu'il calcule déjà pour ses six autres appels. À faire au
moment de la bascule, pas avant.

**3. Domaine : hors du chemin critique.** La question reste la vôtre, mais le plan n'en dépend plus.
Un nom en `workers.dev` suffit à tout ce que E1 construit, **y compris aux clés d'accès** : une clé
WebAuthn se rattache au nom d'hôte, et un sous-domaine de `workers.dev` en est un comme un autre.
Le domaine redeviendra utile le jour du corpus musical, pour le tunnel.

**4. Second utilisateur : sa clé d'accès dès E1, en lecture et contribution.** Deux raisons de ne
pas attendre : SEC-02 se vérifie mal à un seul utilisateur, et LIV-06 demande un essai réel sur les
bibliothèques **des deux** utilisateurs. Droits proposés : lire, annoter, corriger un lien — pas
changer le schéma, publier ou supprimer, qui restent à l'administration (SEC-03).

**5. Les sept passages de `personality-profiling` : séparés au réimport.** Ils portent déjà sept
jeux de métadonnées différents — ce *sont* sept documents, et une table `document` avec une
identité propre ne peut de toute façon pas les confondre. Cela ne coûte rien et fait un bon cas
pour la fixture F8.

---

## Le plan final de E1, pour accord

**E1 ne touche à rien de réel.** Pas un octet des 234 ouvrages, pas une ligne de
`therapeute-library`, pas un réglage de Studio Clinique. Tout se construit et s'éprouve sur une
bibliothèque d'essai montée à partir de F3, qui nous appartient.

### Ce qui se construit, dans l'ordre

| | Ce qu'on fait | Pourquoi dans cet ordre |
|---:|---|---|
| 1 | **Le registre** : base `lienotheque-registre`, migrations engendrées depuis `MIGRATIONS`, test de non-dérive | Tout le reste s'y inscrit |
| 2 | **Le schéma d'une bibliothèque sur D1** : `lienotheque-essai`, migrations appliquées, réserve de liaisons `BIB_1`…`BIB_4` | Avant de publier quoi que ce soit, savoir où ça va |
| 3 | **Sauvegarde et restauration** : export vers le volume externe, restauration dans `lienotheque-restauration-essai`, **chronométrée** | SEC-10 l'exige *avant* toute donnée réelle. Le faire tôt, pas en dernier |
| 4 | **R2** : compartiment `lienotheque-medias`, préfixes, une seule fonction qui compose les clés, test qui l'atteste | — |
| 5 | **Liens signés** : jeton court signé, servi par le Worker, vérifié en temps constant | — |
| 6 | **Sessions** : clés d'accès WebAuthn, cookie 90 jours renouvelé, révocation par le registre, **deux utilisateurs** | — |
| 7 | **Jetons limités** par bibliothèque et par action, révocables un à un (SEC-03, INT-01) | La façade en a besoin |
| 8 | **Provisionnement** : locale → publiée → locale, sans perte, avec région explicite et estimation de poids (HEB-03, 05, 06) | — |
| 9 | **La façade** : les quatre routes, pilotées par la table de correspondance, servies depuis `lienotheque-essai` | Elle est le but de E1 |
| 10 | **Le banc de comparaison** : requêtes figées, rappel par ouvrage, recouvrement, exactitude de page, p50/p95, citations mot pour mot | Il est l'outil qui autorisera E3 |

### Ce qui autorise E2 (critère de passage de BAS-01)

- La façade répond aux quatre routes depuis la bibliothèque d'essai, aux formes attendues.
- Le banc de comparaison tourne et rend un rapport — sur l'essai, pas encore sur le vrai.
- **Une restauration réelle a été faite et chronométrée**, et le chiffre est écrit.
- Aucune clé dans un navigateur ; tests de fuite négatifs (LIV-04).
- `pnpm check` vert sur les trois systèmes, rendu vert sur les trois moteurs (LIV-02).
- **Rien de réel n'a été touché**, et cela se vérifie : `therapeute-library` a la même taille et le
  même nombre de passages qu'au 9 octobre 2026 — 168 738 816 octets, 22 022 passages.

### Ressources créées par E1, et leur coût

| Ressource | Nature | Coût |
|---|---|---|
| D1 `lienotheque-registre` | réelle, minuscule | 0 $ |
| D1 `lienotheque-essai` | **d'essai**, nommée comme telle | 0 $ |
| D1 `lienotheque-restauration-essai` | **d'essai**, détruite après la mesure | 0 $ |
| R2 `lienotheque-medias` | réelle, vide au départ | 0 $ |
| Worker `lienotheque-api` | **existe déjà**, routes ajoutées | 0 $ |

**Coût total de E1 : zéro au-dessus de l'abonnement.** Aucune de ces créations ne touche une
ressource existante, et aucune n'engage de dépense. Je demanderai néanmoins votre accord avant la
première commande qui crée quoi que ce soit, conformément à la règle 7 de CLAUDE.md.

### Deux mesures à faire pendant E2, inscrites ici pour ne pas se perdre

**1. La qualité de la couche texte existante**, sur un échantillon relu à la main, avant tout
réimport massif. Elle existe sur toutes les pages de l'échantillon ; reste à savoir si l'on peut
s'y fier ou s'il faut réocériser.

**2. Le taux de compression par type de page, mesuré séparément.** Le relevé de l'étape 0 donne un
rapport global (×0,35) et ne distingue pas le texte pur d'une partition ou d'une tablature. Ce
n'est pas bloquant — le coût R2 est quasi nul dans tous les cas —, mais la mesure doit se faire
**sur les vraies pages réellement traitées**, au fil du réimport, et non sur un nouvel échantillon
prélevé à part : les pages qui passent sont la population, un échantillon n'en serait qu'une image.

La question à laquelle cette mesure doit répondre : **un réglage de qualité différencié par contenu
(OPT-04) ferait-il mieux sans perte de lisibilité ?** Le corpus thérapeutique est presque
entièrement du texte, et un texte noir sur blanc supporte une compression qu'une portée ou une
grille d'accords ne supporterait pas. S'il y a un gain à prendre, il est là ; s'il n'y en a pas, le
rapport le dira et on n'y reviendra plus. Dans les deux cas, OPT-04 reste la borne : **aucune image
n'est re-rendue en dessous de sa résolution d'origine**, quel que soit le réglage de qualité.

### Ce pour quoi je redemanderai un accord, séparément

**E2** (réimport réel), **E4** (bascule) et **E6** (suppression de l'ancienne), comme BAS-02,
BAS-04 et BAS-05 l'imposent. Et, à l'intérieur de E2, une fois de plus avant d'engager la moindre
dépense de vision ciblée au-delà du plafond de 10 $.
