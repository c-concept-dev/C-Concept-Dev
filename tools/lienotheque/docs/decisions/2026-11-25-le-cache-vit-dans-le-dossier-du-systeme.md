# Le cache vit dans le dossier du système, et un cache déclaré introuvable refuse

**Décidé par Christophe le 25 novembre 2026**, sur l'inventaire mesuré des quatre caches et la
proposition écrite qu'il avait demandée avant toute ligne de code. Elle **découpe** le lot
`0z undecies` : trois points maintenant, quatre rangées pour la suite.

Elle ne remplace aucune décision antérieure. Elle **achève** ce que celle du 24 novembre 2026,
`2026-11-24-une-fonction-d-effacement-arrive-avec-son-appelant.md`, avait renvoyé au lot du cache :
« une intention, pas un comportement — et le lot `0z undecies`, dette **D33**, tranchera ».

## Ce qui était en place, et pourquoi c'était faux

Le module `@lienotheque/cache` portait un chemin **en dur** vers un volume externe —
`/Volumes/Macbook Pro/lienotheque-cache` — et, quand ce volume n'était pas monté, se **repliait**
sur `join(process.cwd(), ".cache")`, c'est-à-dire **dans la copie de travail**.

| ce qui était écrit | ce qui est mesuré |
|---|---|
| le repli est une **exception**, pour ne pas échouer au milieu d'un traitement | il était la **règle** : une machine d'intégration continue n'a aucun `/Volumes`, donc **toutes** ses courses se repliaient, et écrivaient dans la copie fraîche |
| un cache absent ne coûte qu'un avertissement | il a coûté **877 s** en un seul contrôle complet, le 24 novembre 2026 : `test/f4-lecture.test.ts` a pris 876 s au lieu de 8,97 s, le volume étant refusé pendant la course |
| le défaut sert le produit | le produit **n'emploie jamais** `ouvrirCache`. Son chemin lui vient de l'hôte par un tuyau, et le moteur livré `moteur.js` porte `sousDossier` cinq fois et les quatre noms de coins, mais **zéro** `ouvrirCache` et **zéro** `CACHE_PAR_DEFAUT` |

Et le chemin du produit se composait **deux fois** : l'hôte passait `app_cache_dir().join("lectures")`
tandis que la chaîne y creusait son coin `lectures`. Le chemin réel était `…/lectures/lectures`.
Rien n'en échouait — un dossier de plus se crée sans bruit —, et c'est précisément pourquoi il a
vécu : un défaut que rien ne regarde ne se corrige pas.

## La règle

> **Le défaut est le dossier de cache du système, selon la plateforme. Un dossier déclaré et
> introuvable refuse, avant tout traitement, en se nommant. Aucun repli, et jamais dans la copie de
> travail.**

Le défaut, par plateforme — le projet est multiplateforme, et l'intégration continue tourne sur
deux de ces systèmes :

| système | dossier |
|---|---|
| macOS | `~/Library/Caches/lienotheque` |
| Linux | `${XDG_CACHE_HOME:-~/.cache}/lienotheque` |
| Windows | `%LOCALAPPDATA%\lienotheque\cache` — écrit et éprouvé, Windows étant **suspendu, pas abandonné** |

**Pourquoi un refus plutôt qu'un choix.** Un dossier que la personne a nommé et qui manque est une
erreur de chemin ou un volume démonté. Choisir ailleurs à sa place, c'est travailler là où elle ne
regarde pas, et le lui apprendre trop tard — ou ne jamais le lui apprendre, ce qui est arrivé.

**Pourquoi un paramètre et non une variable d'environnement.** La plateforme et l'environnement
entrent par les réglages de la fonction. `process.env` et `process.platform` sont **globaux au
processus** : deux contrôles en parallèle se les disputeraient. C'est la même raison qui a fait
rendre la corbeille injectable dans `Depot` la veille, au lot `0z decies`.

## Ce que le lot a fait, et ce qu'il n'a pas fait

Fait : `CACHE_PAR_DEFAUT` supprimé, le refus posé, le repli supprimé avec `PLAFOND_REPLI`, `repli`,
`plafondRepli`, `replie` et `avertir` — cette dernière n'avait plus d'objet, son unique appel
annonçant le repli ; l'hôte passe `app_cache_dir()` **nu**.

**Rien n'a été effacé ni déplacé** : ni dans les bibliothèques de Christophe, ni sur le disque
externe, ni les dossiers `.cache` de repli existants, qui sont ignorés par git et dont Christophe
décidera. Les six fichiers que rien d'autre ne portait ont été **copiés**, non déplacés, hors du
cache, les six empreintes `sha256` vérifiées.

## Le découpage, et son ordre

Christophe a voulu quatre rangées séparées, dans cet ordre :

1. **`0z terdecies`** — renommer `<racine>/cache` en `<racine>/lectures`, avec une **migration
   éprouvée sur des copies**. Le mot « cache » invite à l'effacement, et ce dossier porte des
   heures de travail : 12 235 pages de lectures dans une bibliothèque, 3 438 dans une autre, soit
   ≈ 3 h 24 et ≈ 57 min à refaire à ≈ 1 s la page. **Les vraies bibliothèques ne seront touchées
   qu'avec l'accord explicite de Christophe, bibliothèque par bibliothèque.**
2. **`0z quaterdecies`** — **peser le cache et l'afficher, en lecture seule.** Un plafond que
   personne ne voit appliquer est un plafond que personne ne croira.
3. **`0z quindecies`** — les règles de retrait des lectures et des réponses Vision, **uniquement
   après l'affichage**, avec leur décision et leurs exceptions au garde-fou des effacements.
4. **`0z sexdecies`** — le rangement de l'atelier du disque externe : **décision de Christophe,
   rien d'automatique.**

## Ce que cette décision ne dit pas

Elle ne décide **ni le plafond, ni qui l'applique, ni quand**. Elle ne décide pas non plus la
politique d'éviction — et la mesure du 25 novembre 2026 dit déjà que celle qui est écrite,
l'éviction du plus ancien, est **à l'envers pour ce cache** : les dix plus anciens fichiers de
l'atelier sont des captures et des **lectures d'OCR**, c'est-à-dire ce qui coûte le plus cher à
refaire. Cela se tranchera à la troisième rangée, par coin, après l'affichage.

Elle ne change rien à `nettoyer()` ni à `peser()`, gardées la veille sur le mot de Christophe.
