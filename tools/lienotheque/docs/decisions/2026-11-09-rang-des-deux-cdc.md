# Le rang des deux CDC : le v2.0 dit quoi, le v24 dit où on en est

**Décidé par Christophe le 9 novembre 2026.** Remplace la réserve ouverte le même jour par
[`2026-11-09-cahier-de-pilotage-et-ordre-de-preseance.md`](2026-11-09-cahier-de-pilotage-et-ordre-de-preseance.md),
où le rang 3 restait vacant. Lève la dette **D18**.

## Ses mots

> « Rang des CDC : le CDC normatif v2.0 au rang 3 (exigences), le CDC v24 au rang 4 (audit).
> Remplace `docs/cdc-pilotage.md` par la version 25.2 fournie, intacte, et mets `CLAUDE.md`
> d'accord. Verse aussi le CDC normatif v2.0 dans `docs/`, intact (D18). »

## L'ordre de préséance, complet

1. une **décision de Christophe**, datée et inscrite dans `docs/decisions/` ;
2. le **cahier de pilotage** (`docs/cdc-pilotage.md`) ;
3. le **CDC normatif v2.0** (`docs/cdc-normatif-v2.0.md`) — les exigences ;
4. le **CDC d'audit v24** (`docs/cdc-audit-complet-24.md`) — l'audit et la reconstruction ;
5. l'**archive gelée** `docs/decisions.md` (historique jusqu'au 7 novembre 2026 inclus).

Les deux CDC ne sont pas deux versions l'un de l'autre, et c'est pourquoi ils tiennent deux rangs
plutôt qu'un : le v2.0 dit **ce que le produit doit faire**, le v24 dit **où on en est**. Une
exigence du v2.0 ne se modifie que par une décision datée.

## Ce que le versement du v2.0 a appris, et qui corrige une mesure de moi

Le v2.0 était jusqu'ici désigné par une adresse d'artefact, hors du dépôt. Il y entre maintenant,
et son contenu peut être compté au lieu d'être cité de mémoire. Résultat, pris sur le document :

| Mesure | Chiffre |
|---|---|
| exigences numérotées **définies** dans le v2.0 (chacune une fois) | **175** |
| familles d'identifiants | **19** |
| identifiants cités sans être définis | **0** |
| identifiants cités dans un **titre de contrôle** du dépôt | **82** |
| identifiants cités quelque part dans un fichier de contrôle | **93** |
| identifiants cités par des contrôles mais absents du v2.0 | **0** |
| exigences du v2.0 citées par le v24 | **6** (`CLA-01`, `ID-01`, `JOB-06`, `OUT-15`, `REC-06`, `REC-07`) |

> **Correction, 9 novembre 2026.** J'avais annoncé **135 exigences** et **78 identifiants cités
> dans des noms de contrôles**. Les deux chiffres sont faux. Le compte réel est **175** et **82**.
> Je ne sais pas reconstruire d'où venait 135 : ce n'est ni le total, ni le total des douze familles
> que `CLAUDE.md` nommait alors (113). La mesure avait été prise sur l'artefact, sans méthode
> écrite, et ne pouvait donc pas être recontrôlée. Elle l'est maintenant : le document est dans le
> dépôt, et le compte se refait d'une ligne.
>
> Le chiffre faux a voyagé avant d'être pris : il est dans la **v25.2 du cahier** (§ 0, « 135
> identifiants ») et à l'**entrée 23** du journal des autorisations. Le cahier se verse intact —
> seul Christophe le corrige ; le journal est en ajout seul — la correction est portée par l'entrée
> suivante. `CLAUDE.md` et ce dossier portent le bon chiffre.

**Ce qui n'est pas mesuré ici** : combien des 175 exigences sont **tenues**. 82 sont citées par un
titre de contrôle, ce qui dit qu'un contrôle les nomme, pas qu'elles sont satisfaites. Le compte de
ce qui est tenu n'existe pas encore.

## Ce que le versement perd, et qu'il faut savoir

Le v2.0 est un Claude Doc : il n'a pas d'original en Markdown, mais un arbre de prose. Ce qui est
versé est son export Markdown à la révision 55, octet pour octet tel que l'export le rend
(`sha256 9ef0e405…`, 819 lignes, 94 614 octets). Trois contenus embarqués — le schéma
d'architecture, le schéma de navigation, la feuille de route — deviennent un texte entre crochets,
aux lignes 78, 575 et 711 ; deux pastilles (la date, la mention de l'auteur) deviennent du texte à
la ligne 3. Le texte normatif et les tableaux d'exigences sont rendus tels quels. Pour lire les
trois schémas, il faut le document d'origine.

## Autres mots du même message, et où ils vont

| Son mot | Où il est tenu |
|---|---|
| D19 autorisée, les trois gestes, éprouvés par mutation | lot suivant, décision propre |
| licences : collecte et embarquement autorisés | étape 0, décision propre |
| archive des moteurs : la fabriquer et soumettre son empreinte, **aucune publication** | étape 0, décision propre |
| ménage de `main-fusion-wt` : lui montrer la liste exacte des chemins, il validera | liste soumise, **aucune suppression** |
| `Co-Authored-By` : **la garder**, pour tous les commits de ces lots, sans réécrire les précédents | appliquée ; les 24 commits antérieurs la portent déjà |
