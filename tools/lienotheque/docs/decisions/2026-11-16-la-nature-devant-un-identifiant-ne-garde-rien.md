# Un mot de nature devant un identifiant ne peut pas remplacer la déclaration

**Décidé par** la condition que Christophe a posée le 16 novembre 2026, appliquée à la mesure.
**Date** : 16 novembre 2026.

## Ce qui était proposé

Christophe, le 16 novembre 2026 : « une convention pour que l'épingle ne grandisse pas à chaque
entrée : les identifiants qui ne sont pas des commits s'écrivent avec leur nature devant (« version
… », « travail … », « course … »), et le garde-fou ne juge que les autres. À mesurer avant
d'adopter. » Puis, le même jour : « La convention n'est adoptée que si la mesure montre qu'elle
n'ouvre aucune échappatoire à de vrais commits. »

La mesure montre qu'elle en ouvre. **La convention n'est donc pas adoptée**, et l'épingle
`fixtures/references/citations-qui-ne-sont-pas-des-commits.json` reste la seule façon de déclarer
qu'un identifiant n'est pas un commit.

## La raison de fond : le défaut et l'exemption s'écrivent pareil

Le garde-fou de la dette D12 est né d'une empreinte **pariée avant que le commit existe**
(entrée 37 du registre, 11 novembre 2026) : un identifiant que l'historique ne porte pas. Or c'est
exactement ce qu'est un identifiant qui n'est pas un commit. Les deux se ressemblent **trait pour
trait** dans le texte, et rien dans la phrase qui les porte ne les sépare.

Une convention d'écriture laisse donc la prose se déclarer elle-même hors de portée du contrôle.
Écrire « course `0ee45c0e` » suffirait à faire taire le garde-fou sur le défaut même qui l'a fait
naître. Un fichier de déclaration, lui, demande **d'écrire ce que la chose est réellement**, dans
un endroit qu'on relit — c'est ce travail de dire qui distingue l'oubli de l'intention.

## Trois mesures, du 16 novembre 2026

**1. Deux vrais commits sont déjà précédés du mot « course », collé.** Sur les 258 citations des
documents relus, 216 portent un vrai commit ; **deux** de celles-là seraient exemptées dès
aujourd'hui :

| où | ce qui est écrit |
|---|---|
| `docs/decisions.md` | « il est passé sur la course `45294a61` » |
| `docs/decisions/2026-11-07-lenteur-voie-oracle-devant-0b.md` | « (course `18bf579f`) » |

Les deux désignent une course par le commit qu'elle a mesuré — une tournure naturelle, et c'est
bien pourquoi elle est là deux fois. Pire : la **première phrase continue** par « il a échoué sur
`44726ce2` », un autre commit désignant une autre course, celui-là **sans** mot devant. Dans une
seule phrase, la convention jugerait l'un et pas l'autre, selon le rythme de l'écriture.

**2. Vingt-trois des quarante-deux citations épinglées vivent dans l'archive gelée.**
`docs/decisions.md` est gelé par empreinte : le contrôle complet refuse de le voir modifier. La
convention ne pourrait donc jamais y être appliquée, c'est-à-dire sur **55 %** de ce qu'elle
prétend remplacer.

| document | citations épinglées | citations en tout |
|---|---|---|
| `docs/decisions.md` *(archive gelée)* | 23 | 90 |
| `docs/autorisations-de-push.md` | 11 | 134 |
| `docs/file-des-lots.md` | 8 | 22 |

**3. L'épingle ne grandit pas à chaque entrée.** Ses onze lignes sont apparues entre le 5 et le
14 novembre : **six** le 5 novembre — un arriéré, dix jours avant que l'épingle existe —, une le
11, une le 12, **trois** le 14. Pendant ce temps le registre a reçu **36 entrées**, et **34 des
37 documents relus** ne citent aucun identifiant épinglé. Le rythme est d'environ **une ligne pour
trois entrées**, et il vient des décisions, non des entrées.

## Ce qui reste vrai de la demande

Deux choses, dites au lot 0m et non démenties ici : la convention **n'aurait jamais pu vider**
l'épingle, puisque les lignes anciennes ne se réécrivent pas ; et seule sa forme **stricte** — le
mot collé à la citation — est mécanisable, la forme lâche laissant passer « mesuré sur
`ca36cf98` ».

Et une chose à faire quand même : **écrire la nature devant un identifiant qui n'est pas un
commit**, par courtoisie pour qui lit, sans que le garde-fou en dépende. Sept des quarante-deux
citations épinglées le font déjà.
