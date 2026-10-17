# Lot E2 — axes hiérarchiques, texte dans la vue, classement : plan soumis avant tout code

> **État : soumis, pas approuvé.** Rien n'est engagé. Les mesures sont faites ; les estimations
> sont marquées comme telles.

## 1. Les trois manques, vérifiés ligne par ligne

Les trois sont le **même défaut** : un champ ou une capacité qu'un contrat décrit, que sa
validation défend sévèrement, et que rien ne remplit en pratique. C'est le troisième fois dans ce
lot — après les passages qui n'existaient pas et le plafond de tentatives qui ne se déclenchait
jamais — et la méthode qui a marché est la même : un test qui échoue d'abord, une mesure avant
toute estimation.

### 1.1 L'axe hiérarchique

Le contrat le porte et le défend : `StructureAxe = ["plat", "hierarchique"]`,
`ValeurReferentiel.parent`, et deux règles de validation — « Un axe à plat n'a pas de
hiérarchie », « Parent inconnu : … ».

Rien d'autre ne l'implémente :

| Où | Ce qu'on y trouve |
|---|---|
| `packages/noyau/src/organisation.ts` | `ajouterAxe` écrit `structure: "plat"` **en dur**, sans paramètre |
| idem | aucun geste pour rendre un axe hiérarchique ni pour donner un parent à une valeur |
| `apps/app/src/pages/Organisation.tsx` | **zéro** occurrence de `structure` ou de `parent` |

### 1.2 Le texte dans la vue

`outils/ingestion/src/instantane.ts`, ligne 245 :

```ts
texte: [],
```

Le champ existe au contrat (`ecrans.ts` : « Lignes du texte reconnu, pour le panneau repliable »),
et c'est exactement ce que lit la recherche de l'écran —
`extraireAutour(page.texte, morceaux)` dans `packages/noyau/src/recherche.ts`. **La recherche de
l'application cherche donc depuis toujours dans un tableau vide.** Les 2 818 passages produits par
le chemin du texte vivent dans la version et dans la base, pas dans la vue.

### 1.3 Le classement d'un document

`ClassementDocument` existe au contrat ; `enregistrerClassement` et `classement` existent au port
de dépôt ; l'adaptateur SQLite les implémente. **Rien ne les appelle** — ni la chaîne, ni l'hôte,
ni un écran.

Le calcul des filtres le dit lui-même, dans `instantane.ts` :

> « Un axe que personne ne porte n'est pas filtrable : son groupe reste masqué, et il reparaîtra
> le jour où l'application saura le remplir. »

Et il compte sur `page.valeurs`, c'est-à-dire **par page, depuis les éléments** — ce qui convient
à une méthode à exercices et pas à une bibliothèque de livres, où le classement porte sur le
document.

## 2. Mesures faites

### 2.1 Le classement existe déjà, et il est complet

> **Chiffres révisés le 17 octobre 2026.** Les valeurs ci-dessous sont celles de
> `correspondance.json` et de l'export D1, relues directement. Celles d'origine portaient
> 205 appariements, 19 fichiers sans ouvrage et 33 ouvrages sans fichier : **ce n'était pas une
> erreur**, mais un corpus plus petit. Un nouveau balayage a porté le fonds de 224 à 250
> fichiers — il a trouvé les dossiers `Hypnose/` et `Therapie Manuelle/`, et les EPUB — et toute
> la répartition a été recalculée dessus. La ventilation « 199 certains, 6 proposés » n'existe
> plus dans aucune donnée : la table ne marque plus que `valide_par` sur dix entrées. On ne la
> reconstitue pas, et le chiffre de 205 ne doit plus servir de référence nulle part.

| Mesure | Valeur |
|---|---|
| Ouvrages dans la bibliothèque à reprendre | **234** identifiants distincts (240 combinaisons de métadonnées) |
| Dont `approach` renseigné | **234 (100 %)** |
| Dont `language` renseigné | **234 (100 %)** |
| Appariements fichier ↔ ouvrage | **216**, dont 10 portent `valide_par` |
| Fichiers du corpus sans ouvrage | 29 |
| Écartés — ressemblance de sujet, pas d'identité | 5 |
| Ouvrages sans fichier | 2 |
| Ouvrages hors périmètre (outils interactifs de Studio Clinique) | 13 |

**La table couvre l'intégralité du corpus, et cela se vérifie d'une addition :**
216 + 29 + 5 = **250**. Aucun fichier n'est hors compte. C'est cette couverture, et non la
généalogie des chiffres, qui autorise l'import.

**Le classement n'est donc pas à inventer : il est à transporter.** Sur les sept documents de
l'essai, cinq reçoivent leur classement de l'ancienne base sans aucune supposition :

| Document | Approche | Langue |
|---|---|---|
| DSM‑5 | `general` | fr |
| L'intelligence érotique | `sexology` | fr |
| Reconsolidation thérapeutique | `coherence` | fr |
| Thèse schémas | `schema_therapy` | fr |
| La danse du couple | `couple` | fr |
| Le corps n'oublie rien | — aucun appariement | — |
| PPT N2 LM 2 diapos | — aucun appariement | — |

Sur le corpus : **216 documents sur 250 classés par l'import, 34 à la main** — 29 fichiers sans
ouvrage et 5 écartés pour ressemblance de sujet sans identité.

Ce n'est plus une extrapolation. Mesuré le 17 octobre 2026 en croisant `correspondance.json` et
l'export D1 des approches : **les 216 appariements se résolvent tous en un classement valide**,
sans ouvrage sans approche et sans valeur absente du schéma. Les cinq documents de la
mini-bibliothèque ont reçu par cette voie exactement les valeurs relevées plus haut — le relevé
était juste, il est désormais vérifié depuis sa source.

### 2.2 La hiérarchie répond à une distribution mesurable

Les 19 approches sont très inégales :

| | |
|---|---|
| 5 approches de tête (`couple`, `sexology`, `schema_therapy`, `act`, `icv`) | **177 ouvrages sur 240 — 74 %** |
| 12 approches à 7 ouvrages ou moins | **40 ouvrages — 17 %** |

Douze valeurs sur dix-neuf pour un sixième du fonds : une liste à plat de dix-neuf entrées dont
douze sont presque vides est pénible à parcourir, et c'est précisément ce qu'un regroupement
résout. **Quels groupes, c'est votre décision**, pas la mienne : je fournis le geste, vous
décidez de l'arbre.

## 3. Comment le classement d'un document s'écrira

C'est la question que vous avez posée avant tout code, et voici la réponse, en trois points.

### 3.1 Deux déclencheurs, et seulement deux

| Déclencheur | Quand | Ce qu'il écrit |
|---|---|---|
| **L'import** | au réimport des 250, depuis la table d'appariement | le classement que l'ancienne base porte, tel quel |
| **Un geste manuel** | à tout moment, sur un document | ce que vous choisissez |

**Rien d'autre.** En particulier : **jamais déduit du texte.** Le jour où une relecture proposerait
un classement d'après le contenu, ce serait une **proposition** à accepter, marquée comme telle —
comme un lien porte sa preuve et sa confiance (ANC‑02). Un classement deviné qui se présente
comme un classement su est exactement la famille de fautes que ce lot a passé sa journée à
corriger.

### 3.2 Le geste manuel n'est pas dans Organisation

Distinction qui compte, et que je propose de tenir : **Organisation définit les axes et leurs
valeurs ; elle ne range aucun document.** Ranger un document est un geste **sur le document** —
depuis le Catalogue, ou depuis sa fiche.

Mélanger les deux sur un même écran, c'est inviter à changer le vocabulaire de la bibliothèque
alors qu'on voulait ranger un livre. Organisation garde donc ses quatre gestes — renommer,
ajouter, fusionner, retirer — plus les deux de la hiérarchie.

### 3.3 Ce que la vue doit porter

Le classement est **par document**, et la vue compte aujourd'hui **par page**. La vue doit donc
porter le classement du document, et le calcul des filtres compter dessus. Sans cela, aucun axe
n'est filtrable et le point 3 de votre liste reste impossible quoi qu'on écrive ailleurs.

## 4. Les étapes, dans l'ordre où elles se vérifient

| # | Ce qui est fait | Comment on sait que c'est fait |
|---|---|---|
| 1 | Contrat : `ajouterAxe` accepte une structure ; un axe hiérarchique se valide avec ses parents | Tests écrits **avant** : un parent inconnu, une valeur son propre parent, un parent sur un axe à plat — tous refusés |
| 2 | Deux gestes au noyau : rendre un axe hiérarchique, donner un parent à une valeur. Et le retour en arrière : repasser à plat **refuse** s'il reste des parents, plutôt que de les perdre | Le banc d'universalité passe sur un modèle hiérarchique ; un geste refusé se dit |
| 3 | Écran Organisation : rendre hiérarchique, et choisir le parent d'une valeur. Clavier complet, comme le reste de l'écran | Les 19 approches deviennent un arbre à deux niveaux depuis l'écran, et la bibliothèque le relit |
| 4 | `page.texte` rempli depuis les passages de la page | La recherche de l'écran trouve « mémoire traumatique » dans les six documents — ce que la ligne de commande fait déjà |
| 5 | Contrat et écriture du classement d'un document, par l'import | Les cinq documents appariés portent leur approche et leur langue, les deux autres portent **rien** et le disent |
| 6 | Geste manuel de classement depuis le Catalogue | Les deux documents sans appariement se rangent à la main, et la vue le voit |
| 7 | La vue porte le classement et les filtres comptent dessus | L'axe « Approche » devient `filtrable`, et une recherche filtrée sur une valeur ne rend que ses documents |

Les étapes 1 à 3 répondent à votre point 1, les étapes 4 à 7 à votre point 3. L'étape 4 est
indépendante des autres et pourrait partir seule si vous préférez voir la recherche dans
l'application avant le classement.

## 5. Ce que cela coûte

**En argent : nul.** Tout est local ; aucune ressource Cloudflare, aucun appel payant.

**En temps de traitement : nul pour les étapes 1 à 3 et 5 à 7** — ce sont des gestes sur le
schéma et des écritures de classement, pas des relectures de documents.

**L'étape 4 demande de reconstruire la vue des huit documents**, donc de rejouer leur traitement.
Mesuré : 1 042 s pour les sept, 5 s pour le huitième. Le cache de lecture épargne l'OCR déjà
fait ; l'estimation est donc **inférieure à ces 1 042 s**, et je la mesurerai plutôt que de
l'annoncer.

**En volume** : le texte dans la vue grossit le fichier de version. Mesuré :
**7,7 Mo pour 7 versions, soit 1,10 Mo par document** — passages compris, puisqu'ils y sont déjà.
Remplir `page.texte` recopierait ce texte une seconde fois dans le même fichier, et doublerait
donc à peu près ce chiffre.

C'est le point du plan qui mérite une question plutôt qu'une estimation : **faut-il recopier le
texte dans la vue, ou la recherche de l'écran doit-elle lire les passages ?** Recopier est le
chemin court — un champ à remplir — mais met le même texte à deux endroits d'un même fichier, et
« deux magasins à tenir d'accord » est ce que la migration des passages disait vouloir éviter.
Je le signale à l'étape 4 et je propose de trancher avant de l'écrire, pas après.

## 6. Ce que je ne fais pas sans un accord séparé

Inchangé :

- aucun réimport réel des 234 ouvrages ;
- aucune bascule, aucune suppression de l'ancienne bibliothèque ;
- aucun changement de configuration ni de secret Cloudflare ;
- `therapeute-library` n'est pas touchée.

Et deux de plus, propres à ce plan :

- **l'arbre des approches est votre décision** : je livre le geste, pas la taxonomie ;
- **aucun classement déduit du texte**, même comme proposition, sans que vous l'ayez demandé.

## 7. Ce qui reste ouvert et que je n'ai pas tranché

- **Le seuil de lisibilité à 60 %** marque encore 15 listes de contributeurs du DSM‑5 comme
  douteuses. Reporté à l'échelle complète, avec votre accord — j'ai essayé une correction, mesuré
  qu'elle rescapait aussi le charabia, et l'ai abandonnée.
- **Les formats sans pages fixes** (EPUB, DOCX) : 19 documents, étape 7 du plan du texte, toujours
  ouverte. L'EPUB de l'essai échoue définitivement avec une cause nommée, ce qui est le
  comportement correct en attendant.
