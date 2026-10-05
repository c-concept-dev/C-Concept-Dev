# Vision ciblée pour les pastilles à deux chiffres de F4 (OUT-08)

**Proposition. Rien n'est implémenté.** Ce document attend un accord avant qu'une ligne de code
soit écrite. Il dit ce qu'on enverrait, à qui, combien ça coûte, comment la confiance se calcule,
et comment on saurait que ça a marché.

> **Révision du 5 octobre 2026 — la cible a changé.** Ce plan visait les numéros d'élément dans
> la marge. Trois mesures l'ont contredit, et elles sont consignées dans `docs/decisions.md` :
>
> 1. Une part des clichés était simplement **mal orientée** ; le vote d'orientation sur le lot a
>    porté F4 de 16/92 à 52/92, sans un seul appel à un modèle.
> 2. La **fenêtre de pastille ne déborde pas** : zéro cas sur 122.
> 3. Les **numéros de marge se lisent** ; ce qui ne se lit pas, ce sont les **pastilles à deux
>    chiffres** — 9 justes sur 19, contre 13 sur 13 pour celles à un chiffre, et chaque échec est
>    un chiffre perdu.
>
> Après portage des seuils et recadrages du prototype, F4 est à **61/92 et 77/92** (critère 83 et
> 89). Le document est réécrit en conséquence : **on recadre le bloc d'une pastille, plus un numéro
> de marge.** La charpente ne change pas — Worker, contrats, budget, confiance, rejeu, mesure —,
> seulement ce qu'on recadre, combien il y en a, et le chiffre à battre.

## 1. Ce que la mesure dit du manque

Le critère d'acceptation de F4 — au moins 83 premiers éléments sur 92 et 89 pages sur 92 — n'est
toujours pas tenu, mais il s'est beaucoup rapproché, et **sans un seul appel à un modèle** :

| Mesure complète | Premiers éléments | Pages |
|---|---:|---:|
| Avant l'orientation | 16 / 92 | 21 / 92 |
| Vote d'orientation sur le lot (OUT-03) | 52 / 92 | 67 / 92 |
| Seuils en percentile et recadrages du prototype | **61 / 92** | **77 / 92** |
| Critère | 83 / 92 | 89 / 92 |

Restent 32 écarts. Ce qui les produit est maintenant connu au chiffre près, parce qu'on a comparé
les lectures pastille par pastille avec l'oracle du prototype sur les treize clichés de référence :

| Pastilles de l'oracle | Lues juste |
|---|---:|
| À un chiffre | **13 / 13** |
| À deux chiffres | **9 / 19** |

Et **chaque échec est un chiffre perdu** : « 4 » là où la pastille porte 14, « 2 » pour 12. Jamais
un chiffre inventé, jamais deux chiffres faux. Sur les 32 écarts du lot, 16 sont une dérive de −1
dans la suite attribuée — la signature exacte d'un chiffre manquant en amont.

Le fait qui commande tout le reste, et qui a démenti la première version de ce plan : **les numéros
de marge se lisent.** Ce qui résiste, c'est le second chiffre d'une pastille — chiffre clair sur
pavé sombre, de l'ordre de 40 px de haut sur un cliché photographié. Les seuils multiples, les cinq
recadrages et le vote du prototype ont pris la moitié de ces cas ; l'autre moitié ne cède à aucun
réglage local, et nous avons épuisé les réglages locaux.

C'est exactement le cas que OUT-08 décrit : *« Envoie à Claude uniquement les zones difficiles, à
bonne résolution, avec budget par lot. »*

## 2. Ce que la vision ciblée fait — et ce qu'elle ne fait pas

**Elle fait** : relire le pavé d'une pastille dont la lecture locale est douteuse, et rendre son
numéro avec une confiance.

**Elle ne fait pas** :

- Elle ne remplace pas l'OCR local. La passe locale reste première, avec ses seuils et ses
  recadrages multiples ; la vision ne voit que ce qu'elle n'a pas tranché. Un lot où tout se lit ne
  coûte rien — et sur F4, deux pastilles sur trois se lisent.
- Elle n'envoie jamais une page, ni un cliché, ni le document. Seulement des pavés de pastille.
- Elle ne décide pas d'un lien. Elle rend un numéro ; l'attribution décide ensuite sur toute la
  suite à la fois, avec les pas que la recette autorise, et Vérifier tranche ce qui reste douteux.
- Elle ne cherche pas les pastilles. Leur détection est complète : c'est leur contenu qui manque.

## 3. Le recadrage minimal : le bloc de la pastille

C'est le cœur de la proposition, et c'est aussi ce qui la rend défendable — en coût comme en
droits.

**Ce qu'on envoie.** Le pavé sombre d'une pastille, aux chiffres clairs, parfois flanqué d'une
étiquette à sa gauche. Pas la page, pas la marge, pas le numéro d'élément : le bloc seul.

**Où il est.** Le lecteur de repères le trouve déjà et le rapporte : `zoneRepere` porte sa boîte
en part de page depuis que la bande du Lecteur a dû l'englober. On ne cherche donc rien de neuf —
on recadre ce qui est déjà localisé, à la résolution de l'original.

**Lesquels envoyer.** Pas tous. Seulement ceux dont la lecture locale est douteuse, et la mesure
dit exactement lesquels :

- la pastille est présente — `presencePiste` au-dessus du seuil — mais aucun chiffre n'a été voté ;
- ou le vote a rendu **un seul chiffre** là où la séquence attend un nombre à deux chiffres. C'est
  la signature de tous les échecs restants, sans exception.

Une pastille à un chiffre ne part jamais : elles se lisent 13 fois sur 13.

**Combien ça pèse.** Un bloc de pastille mesure de l'ordre de deux fois et demie la hauteur d'un
numéro d'élément, soit environ 100 × 60 px sur les clichés de F4 (1786 × 2410). Avec une marge
claire autour — un chiffre collé au bord se lit mal, par un moteur comme par un modèle — on
reste sous 200 × 150 px.

C'est **dix fois plus petit** que les recadrages de marge du plan initial, et il y en a bien
moins : dix-neuf pastilles à deux chiffres pour quatorze clichés, soit de l'ordre de **deux cents
pour le lot entier**, contre neuf cents zones de marge estimées auparavant.

Un pavé de cette taille n'est pas l'œuvre : c'est un numéro de piste dans un cartouche.

## 4. L'appel au Worker

**L'application n'a jamais la clé.** Elle appelle le Worker, qui détient `ANTHROPIC_API_KEY` côté
Cloudflare. C'est la règle 6, et c'est le motif déjà employé ailleurs dans ce dépôt.

**Contrat d'abord** (règle 2). Deux schémas dans `@lienotheque/contrats`, validés des deux côtés :

- `DemandeVision` : une liste de zones, chacune avec son empreinte de recadrage, ses octets en
  base64, l'alphabet attendu (`chiffres`, déjà déclaré par la recette) et l'intervalle de numéros
  que la recette autorise — ici de 1 au nombre de pistes du support, un fait tiré du média et non
  de son nom (REC-05).
- `ReponseVision` : par zone, `{ numero: entier | null, confiance: 0..1 }`. `null` est une réponse
  valable et attendue : un pavé illisible est illisible, et le dire vaut mieux que le deviner.

Ces deux contrats existent déjà dans `packages/contrats/src/vision.ts`, écrits et testés avant
toute implémentation, comme la règle 2 l'exige. Seule leur cible change, pas leur forme.

**Le modèle.** Claude Haiku 4.5 (`claude-haiku-4-5`) : lire un nombre à un ou deux chiffres sur un
pavé de 200 × 150 px ne demande pas davantage, et c'est le modèle le moins cher du catalogue —
1 $ le million de jetons d'entrée, 5 $ en sortie.

**La forme de la réponse.** Sorties structurées (`output_config.format`), ou un outil déclaré
`strict: true` avec `additionalProperties: false`. Dans les deux cas la réponse est validée par le
contrat avant d'entrer où que ce soit ; une réponse non conforme est refusée, pas rattrapée au
jugé. Le choix forcé d'outil (`tool_choice: any`) reste accepté sur Haiku 4.5, mais les sorties
structurées sont plus simples et valent sur tous les modèles.

**Mise en cache des invites.** L'instruction et l'alphabet sont identiques d'une zone à l'autre :
ils forment un préfixe stable, marqué `cache_control: { type: "ephemeral" }`. Le préfixe minimal
cacheable dépend du modèle (512 à 4096 jetons) — à vérifier par la mesure, pas à supposer.

## 5. Le budget par lot

**Déclaré en donnée, pas en code.** La recette gagne un bloc `vision` :

```
"vision": {
  "zones_max_par_lot": 300,
  "zones_max_par_page": 6,
  "cout_max_eur": 0.50
}
```

Un autre domaine, une autre recette, un autre budget : rien à recompiler.

**Estimé avant d'être dépensé.** La chaîne compte ses candidats, annonce « N zones, environ X »,
et attend. C'est le motif de REC-04 — proposer le recalcul avec estimation, sans l'imposer.

**Arrêt net.** Budget épuisé, les pavés restants ne sont pas lus — et ne disparaissent pas :
ils remontent dans Vérifier comme **informations**, exactement comme les pages sans lecture et les
médias orphelins y remontent depuis le lot C. L'écran existe déjà et sait les recevoir.

**Ce que le budget protège vraiment.** Un mot franc sur les ordres de grandeur. Un pavé de
200 × 150 px coûte quelques dizaines de jetons d'entrée ; les deux cents pavés douteux du lot F4
tiennent donc dans moins d'un centime. **Le budget n'est pas là pour l'argent.** Il est là pour
borner ce qui quitte la machine et pour qu'une boucle qui s'emballe s'arrête d'elle-même. Le
chiffre exact se mesure avec `count_tokens` sur de vrais recadrages avant d'être écrit dans une
recette — on ne pose pas un plafond sur une estimation.

## 6. Confiance et preuve « vision » dans le lien

**Une nouvelle preuve.** `Preuve` passe de `lu | sequence | nom_de_fichier | manuel` à cette liste
plus `vision`. Le lien porte alors son auteur — `{ type: "outil", outil: { nom: "vision-ciblee",
version } }` — et « Pourquoi ce lien » peut dire, en français et sans jargon, que le numéro a été
relu sur l'image. *Cela étend la liste des preuves de ANC-02 : à confirmer comme amendement au
CDC.*

**La confiance ne vient pas du modèle seul.** Un modèle sûr de lui n'est pas un modèle juste. La
confiance retenue croise trois choses :

1. ce que le modèle rend ;
2. **l'accord avec la suite attribuée** — le numéro relu entre dans l'attribution comme une
   lecture de plus, avec son poids, et c'est elle qui tranche sur tout le lot à la fois sous les
   pas que la recette autorise. Un numéro qui ne tient pas dans la suite ne l'emporte pas ;
3. un plafond propre à la vision, **sous le seuil de la recette** (0,6 pour F4).

Conséquence voulue : **un numéro lu par vision et non corroboré par la séquence part à Vérifier.**
C'est la même règle que pour une piste déduite de ses voisines — déduire n'est pas lire —, et
c'est ce que CLA-05 demande : aucune valeur appliquée sous le seuil sans
validation. Corroboré par la séquence, il peut passer automatiquement.

## 7. Rejouer à l'identique (REC-02)

Un appel à un modèle n'est pas déterministe ; l'interpréteur, lui, doit l'être.

La réponse est donc **mise en cache par empreinte de recadrage**, à côté des lectures d'OCR, dans
le cache de travail. Un rejeu lit le cache et rend exactement le même résultat ; le banc d'essai
(OUT-15) tourne sans réseau. Le lien garde la version de l'outil et l'empreinte du recadrage :
on sait toujours de quelle image vient un numéro.

Et la clef de ce cache porte sa version, comme `VERSION_LECTURE` le fait depuis le lot C — la
leçon est récente : un cache qui ne connaît pas la forme de ce qu'il garde finit par servir le
passé sans qu'aucune erreur ne le dise.

## 8. Comment on saura que ça a marché

Dans cet ordre, et en s'arrêtant si une étape ne donne rien :

1. **Treize clichés, pastille par pastille**, contre l'oracle du prototype. Le chiffre à battre
   est celui du tableau de la section 1 : **9 sur 19 pastilles à deux chiffres**. On attend 19 sur
   19, et **aucune régression sur les 13 pastilles à un chiffre**, qui ne partent pas en vision.
2. **Le lot entier** : le critère est 83 sur 92 et 89 sur 92.
3. **F3 ne bouge pas** : 95 sur 95. Un gain sur F4 payé par une régression sur F3 n'est pas un
   gain — et le lot C a montré que ce genre de dégât peut rester invisible sur le corpus qui le
   produit.

Les mesures passent par le banc, depuis le cache, donc elles se rejouent.

## 9. Ce qui vous revient

1. **Le feu vert, puis la clé.** Le Worker est décidé — `apps/worker` déployé sous le nom
   « lienotheque-api », jamais `clone-proxy` ni `Worker/` — et c'est vous qui posez
   `ANTHROPIC_API_KEY`. Rien n'est créé, pas même un `wrangler.toml`, avant que vous le disiez.
2. **L'amendement au CDC** : `vision` comme cinquième preuve de ANC-02.
3. **Le périmètre.** OUT-08 est au lot D ; F4 est le seul corpus qui le réclame aujourd'hui.
   Est-ce qu'on le fait maintenant pour clore F4, ou est-ce qu'on consigne F4 comme non tenu
   jusqu'au lot D ?
4. **Le plafond**, une fois mesuré sur de vrais recadrages.

## 10. Découpage, si c'est oui

| Lot | Ce qui se fait | Ce qui le prouve |
|---|---|---|
| 1 | Contrats `DemandeVision` / `ReponseVision`, `Preuve: vision`, bloc `vision` de la recette | Contrats validés, recette refusée si le budget manque |
| 2 | Sélection des pavés douteux et recadrage, hors réseau | Sur F4 : les pavés retenus sont exactement les pastilles que l'oracle sait à deux chiffres et que nous lisons court ; mesure de `count_tokens` sur de vrais recadrages |
| 3 | Route du Worker, clé côté Cloudflare, sorties structurées | Réponse non conforme refusée ; la clé n'apparaît dans aucune réponse |
| 4 | Cache par empreinte, budget, arrêt net, informations dans Vérifier | Rejeu identique sans réseau ; budget épuisé → informations, jamais une erreur |
| 5 | Confiance croisée avec l'attribution, preuve dans le lien | Un numéro qui ne tient pas dans la suite ne l'emporte pas ; non corroboré, il part à Vérifier |
| 6 | Mesure : treize clichés, puis le lot, puis F3 | Les trois chiffres du point 8 |
