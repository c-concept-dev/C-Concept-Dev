# Le cahier de pilotage, et l'ordre de préséance des documents

**Décidé par Christophe le 9 novembre 2026**, dans la fenêtre de la session. Ses mots :

> « Christophe fournit un cahier de pilotage : `cdc-pilotage-lienotheque-v25.md`. Versionne-le dans
> le dépôt (`tools/lienotheque/docs/`), en commit séparé, sans le modifier ; ajoute à `CLAUDE.md`
> qu'il est relu en tête de chaque session et mis à jour le jour même, et précise l'ordre de
> préséance qu'il décrit (décisions datées > ce cahier > CDC v24 > archive gelée). Signale-moi
> toute contradiction entre ce cahier et le dépôt ou le registre, sans la trancher toi-même. »

Puis, après la relecture :

> « Remplace la v25 par la v25.1 AVANT le commit […] D20 tout de suite : écris dans
> `docs/decisions/` les décisions du 8 et du 9 novembre […] D18 : verse `cdc-audit-complet-24.md`
> dans `docs/` […] Je trancherai le rang. »

Le **cahier des charges de pilotage** (`docs/cdc-pilotage.md`, version 25.1) porte la feuille de
route jusqu'à la version définitive, les règles non négociables de produit et de méthode, et les
dettes connues. Il **se relit en tête de chaque session**, avant toute décision, et **se met à jour
le jour même** : toute étape commencée, finie ou reportée y est inscrite le jour où elle bouge.
Reporter sans nommer, c'est oublier.

**Ordre de préséance.** En cas de contradiction :

1. une **décision de Christophe**, datée et inscrite dans `docs/decisions/` ;
2. le **cahier de pilotage** ;
3. le **CDC** ;
4. l'**archive gelée** `docs/decisions.md` (historique jusqu'au 7 novembre 2026 inclus).

Une contradiction se **signale** à Christophe ; elle ne se tranche **jamais** en silence — pas
davantage entre un de ces documents et l'état réel du dépôt.

## Le rang 3 n'est pas encore attribué

> **Tranché le même jour, après l'écriture de ce fichier.** Christophe a donné le rang 3 au **CDC
> normatif v2.0** et le rang 4 au **CDC d'audit v24** :
> [`2026-11-09-rang-des-deux-cdc.md`](2026-11-09-rang-des-deux-cdc.md). La préséance compte donc
> **cinq** rangs, et non quatre. **Les deux chiffres de cette section sont faux** : le v2.0 porte
> **175** exigences, non 135, et **82** de ses identifiants sont cités dans un titre de contrôle,
> non 78. La section reste telle qu'elle a été écrite, avec sa date ; la correction est détaillée
> dans la décision qui la remplace.

Le rang 3 dit « le CDC » au singulier, mais deux documents le revendiquent, et **Christophe
tranchera** (dette D18) :

- le **CDC d'audit v24** (`docs/cdc-audit-complet-24.md`, écrit le 4 novembre 2026, 145 ko), que le
  cahier nomme comme référence fonctionnelle ;
- le **CDC normatif v2.0**, que `CLAUDE.md` nomme depuis l'origine comme source qui fait foi.

Mesuré le 9 novembre : le v2.0 porte **135 exigences numérotées** ; le v24 n'en cite que **6**
(`CLA-01`, `JOB-06`, `OUT-15`, `REC-06`, `REC-07`, `ID-01`), donc **129 lui manquent**. Et **78** de
ces identifiants sont cités dans des **noms de contrôles** du dépôt, comme la règle 4 de
`CLAUDE.md` l'exige. Les deux documents ne sont donc pas deux versions l'une de l'autre : le v2.0
est la liste numérotée des exigences, le v24 le document d'audit et de reconstruction. D'ici le
verdict de Christophe, une divergence entre eux se signale.

## Le nom du fichier, et pourquoi il ne porte pas de numéro de version

Christophe laissait le choix entre `docs/cdc-pilotage-lienotheque-v25.md` et un nom en `v25-1`.
Le fichier est versé sous un troisième nom, **`docs/cdc-pilotage.md`**, sans numéro : `CLAUDE.md`
le désigne par son chemin, et un numéro dans le chemin rendrait ce pointeur faux à chaque révision
— exactement la classe de défaut que la dette D13 doit attraper. La version vit **dans** le
document, à sa troisième ligne, et Git porte l'historique. Un `git mv` suffit à revenir à l'une des
deux formes proposées.
