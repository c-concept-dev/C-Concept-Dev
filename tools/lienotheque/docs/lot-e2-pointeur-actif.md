# Le pointeur actif : par bibliothèque ou par document ? — options chiffrées

> **État : soumis, pas approuvé.** Aucune ligne n'est écrite sur ce point. Les mesures sont
> faites ; ce qui est estimé est marqué comme tel.

## 0. Le fait qui change la question

Avant de chiffrer quoi que ce soit : **le projet a déjà tranché, et dans un seul des deux
dépôts.**

Le dépôt SQLite — celui que le port du noyau décrit, celui que D1 reprendra au lot E — modélise
l'activation **par document**, et sa contrainte vit dans la base :

```sql
-- Une seule version active par document : la contrainte vit dans la base, pas dans le code.
CREATE UNIQUE INDEX idx_version_active ON version(document_id) WHERE active = 1;
```

```ts
const activerVersion = (id) => transaction(base, () => {
  base.prepare("UPDATE version SET active = 0 WHERE document_id = ?").run(documentId);
  base.prepare("UPDATE version SET active = 1 WHERE id = ?").run(id);
});
```

L'hôte Rust, lui, tient **un seul `base/active.json` pour toute la bibliothèque** :

```rust
pub fn charge_active(&self) -> io::Result<Option<String>> {
    match self.version_active()? {   // ← base/active.json, un pointeur
        Some(pointeur) => self.lire_version(&pointeur.version),
```

La question n'est donc pas « quel modèle choisir » mais **« lequel des deux dépôts a tort »**. Et
c'est une divergence qui se paiera au lot E de toute façon, quand le Worker servira la même
bibliothèque que l'application : deux dépôts censés porter le même schéma de données, dont l'un
ne sait tenir qu'un document.

Je ne l'avais pas vu en écrivant le plan précédent, et c'est pourquoi j'y ai présumé que
l'application tenait plusieurs documents.

## 1. Le coût de passer l'hôte à « un actif par document »

### Fichiers touchés

| Fichier | Occurrences | Ce qu'il faut y faire |
|---|---|---|
| `src-tauri/src/depot.rs` | 23 | le cœur : `activer`, `version_active`, `charge_active`, plus leurs six tests |
| `src-tauri/src/lib.rs` | 4 | deux commandes — `vue_de_bibliotheque`, `version_active` — prennent un document |
| `src-tauri/src/traitement.rs` | 2 | un appel à `activer` : inchangé si la signature garde la version |
| `src-tauri/src/roulement.rs` | 2 | idem, un appel |
| `apps/app/src/pont/bureau.ts` | 1 | la signature des deux commandes |
| `apps/app/src/App.tsx` | — | là où la vue est demandée |

**Le cœur est petit** : `activer` et `version_active` sont deux fonctions de dix lignes, et le
reste n'en est que l'appel. Ce qui coûte n'est pas le changement, c'est de décider ce que
`charge_active()` veut dire quand il n'y a plus un seul actif — et cela ne se résout pas en Rust
mais en répondant au point 2.

### Forme du pointeur

Deux formes possibles, et je recommande la seconde :

| Forme | Pour | Contre |
|---|---|---|
| `base/actives/<empreinte>.json`, un fichier par document | chaque activation n'écrit qu'un fichier | 250 fichiers ; lire l'ensemble demande 250 lectures |
| **`base/actives.json`**, une table empreinte → version | **une lecture pour tout l'ensemble, une écriture atomique** | une écriture réécrit la table entière |

La seconde garde la propriété qui compte, et c'est elle que JOB‑06 réclame : **l'écriture reste
atomique**. `ecrire_atomique` écrit un temporaire, le synchronise, puis renomme — et le renommage
est l'opération que le système garantit indivisible. Une table de 250 entrées fait quelques
kilo-octets : la réécrire entièrement à chaque activation ne coûte rien de mesurable.

L'identité du document, côté hôte, est **l'empreinte de sa source** — c'est déjà par elle que
`charge_de` retrouve un fichier, et deux documents homonymes dans deux dossiers n'ont rien à
voir. Aucune notion nouvelle à introduire.

### Migration des bibliothèques déjà traitées

Mesuré sur la bibliothèque d'essai, qui est le seul cas réel aujourd'hui :

| | |
|---|---|
| Versions écrites | 7 |
| `base/active.json` | 1 pointeur, vers la dernière version activée |
| Travaux portant `empreinte` + `version_cible` | 8 |

La migration est **déterministe et locale** : chaque travail terminé porte déjà l'empreinte de sa
source et sa version cible. On lit les travaux, on écrit la table, on retire l'ancien pointeur.
Aucune relecture de document, aucun retraitement — de l'ordre de quelques millisecondes, et
réversible tant qu'on ne supprime pas `active.json`.

**Ce qui se perd si on ne migre pas** : les six documents déjà traités resteraient invisibles sauf
le dernier activé. C'est l'état actuel.

### Ce que cela casse pour F3 à F5

**Rien, et c'est mesurable plutôt que supposé** : ces corpus n'ont qu'un document chacun. La table
d'actifs y porte une seule entrée, et les quatre critères du CDC qui les éprouvent ne lisent la
version active que par `charge_active()`.

Le seul point de vigilance est la signature : `charge_active()` sans argument n'a plus de réponse
unique. Deux façons de le traiter :

- `charge_active(empreinte)` — explicite, et casse les quatre appels existants ;
- garder `charge_active()` qui refuse quand il y a plus d'un actif.

Je recommande la première : un appel qui refuse à partir du deuxième document est une bombe à
retardement posée exprès.

## 2. Une vue d'ensemble peut-elle se construire par-dessus sans dupliquer l'activation ?

**Oui, et c'est le point qui rend l'option peu coûteuse.**

Ce que l'activation garantit aujourd'hui, et qu'il ne faut pas réécrire :

| Garantie | Où elle vit | Ce qui la préserve |
|---|---|---|
| Écrire une version ne touche pas l'active (JOB‑06) | `ecrire_version` | inchangé : elle n'écrit que `versions/<id>.json` |
| On refuse d'activer une version jamais écrite | `activer` | inchangé : la vérification porte sur la version, pas sur le pointeur |
| Écriture atomique du pointeur | `ecrire_atomique` | inchangé : une table s'écrit comme un pointeur |
| Une annulation ne touche pas l'active | la file ne conclut rien | inchangé : l'annulation n'appelle jamais `activer` |
| Une seule version active par document | la contrainte SQLite | **enfin vraie des deux côtés** |

La vue d'ensemble se construit alors **en lecture seule, par-dessus** : lire la table d'actifs,
lire chaque version qu'elle désigne, et assembler. Aucune logique d'activation n'y est reprise —
elle ne fait que *consulter* ce que l'activation a écrit. C'est la différence entre lire un index
et le tenir.

Deux réserves honnêtes :

- **Le coût de lecture croît avec la bibliothèque.** Mesuré : 1,10 Mo par version, 7,7 Mo pour
  sept. À 250 documents, de l'ordre de 275 Mo à lire pour assembler une vue d'ensemble complète —
  **inacceptable tel quel**. La vue d'ensemble ne doit donc porter que ce qu'un catalogue montre :
  titre, compteurs, classement. Pas les passages, pas les pages. C'est une **projection**, pas une
  concaténation, et c'est à écrire explicitement sinon elle grossira jusqu'à devenir inutilisable.
- **SYN** (synchronisation) n'est pas touché par ce changement, mais il le sera par la projection :
  deux appareils qui activent des versions différentes du même document doivent converger. La
  contrainte « une active par document » le rend décidable là où un pointeur unique par
  bibliothèque le rendait arbitraire. C'est un argument **pour** le changement, pas contre.

## 3. Ma recommandation

**Passer l'hôte à un actif par document, dans la forme `base/actives.json`, avec une migration
déterministe depuis les travaux.**

La raison n'est pas que ce serait plus pratique pour les étapes 4 à 7 de l'autre plan — ce serait
un mauvais motif, et le genre de raisonnement qui fait tordre une architecture pour une
fonctionnalité. La raison est que **le modèle par document est déjà celui du port et de son
adaptateur**, qu'il est écrit dans le schéma avec son commentaire et sa contrainte, et que l'hôte
en est la seule exception.

Tant que cette exception tient :

- les deux dépôts censés porter le même schéma n'en portent pas le même ;
- le lot E la découvrira au moment où le Worker servira la bibliothèque, c'est-à-dire au pire
  moment ;
- et une bibliothèque de 250 livres n'en montre qu'un.

Le coût mesuré est petit — deux fonctions de dix lignes, six tests, deux commandes, une
migration de quelques millisecondes — et il ne grandira pas en attendant. Ce qui grandira, c'est
ce qui s'appuiera entre-temps sur le pointeur unique.

### Ce que je ne recommande pas, et pourquoi

| Option | Pourquoi non |
|---|---|
| Garder un actif par bibliothèque, et faire du Catalogue une liste de versions | Le Catalogue devrait alors décider lui-même laquelle est « la bonne » par document : c'est reprendre la logique d'activation dans un écran, exactement ce que votre question 2 cherche à éviter |
| Aligner l'inverse — passer le dépôt SQLite à un actif par bibliothèque | Casse la contrainte en base, rend SYN arbitraire, et contredit un commentaire de schéma qui dit le contraire |
| Attendre le lot E | Le changement ne coûte pas moins plus tard, et tout ce qui s'écrit d'ici là s'appuie sur le mauvais modèle |

## 4. Ce que je ne fais pas sans votre accord

Rien de ce document n'est engagé. En particulier : aucune ligne de `depot.rs` n'est touchée,
aucune migration n'est écrite, et `base/active.json` de la bibliothèque d'essai est intact.

Les étapes 4 à 7 du plan de classement restent suspendues à cette décision — sauf l'étape 5
(écrire le classement par document), qui est écrivable dès maintenant et resterait juste dans les
deux modèles, mais qui ne serait visible dans aucun écran tant que l'hôte n'en montre qu'un.
