# Vision ciblée pour les numéros de marge de F4 (OUT-08)

**Proposition. Rien n'est implémenté.** Ce document attend un accord avant qu'une ligne de code
soit écrite. Il dit ce qu'on enverrait, à qui, combien ça coûte, comment la confiance se calcule,
et comment on saurait que ça a marché.

## 1. Ce que la mesure dit du manque

Le critère d'acceptation de F4 — au moins 83 premiers éléments sur 92 et 89 pages sur 92 — n'est
pas tenu : la dernière mesure complète donne **16 sur 92 et 21 sur 92**.

Deux itérations guidées par l'oracle ont été faites, et elles ont déplacé le problème sans le
résoudre. Sur treize clichés où l'oracle relève 27 repères :

| Itération | Repères retrouvés | Faux positifs |
|---|---:|---:|
| Avant | 17 / 27 | 3 |
| 1 — fenêtre alignée sur l'oracle | 20 / 27 | 3 |
| 2 — marge de la demi-page corrigée | 21 / 27 | 8 |

Et le fait qui commande tout le reste : **les repères manquants ne sont pas des repères ratés, ce
sont des numéros d'élément qui ne sont pas lus du tout.** Sur les éléments que la chaîne lit, la
détection de repère est complète. Ce qui manque est le rendement de lecture des chiffres dans la
marge — là où l'oracle emploie une passe dédiée à pleine résolution.

Autrement dit : il n'y a rien à corriger dans l'interprétation. Il y a des chiffres que Tesseract
ne rend pas, sur des clichés photographiés de travers, sans couche texte et sans libellé devant
les numéros. C'est exactement le cas que OUT-08 décrit : *« Envoie à Claude uniquement les zones
difficiles, à bonne résolution, avec budget par lot. »*

## 2. Ce que la vision ciblée fait — et ce qu'elle ne fait pas

**Elle fait** : relire un petit rectangle de marge où la chaîne locale attendait un numéro et n'en
a pas trouvé, et rendre ce numéro avec une confiance.

**Elle ne fait pas** :

- Elle ne remplace pas l'OCR local. La passe locale reste première ; la vision ne voit que ce
  qu'elle n'a pas lu. Un lot où tout se lit ne coûte rien.
- Elle n'envoie jamais une page, ni un cliché, ni le document. Seulement des rectangles de marge.
- Elle ne décide pas d'un lien. Elle rend un numéro ; c'est l'interprète qui décide, avec ses
  règles de séquence, et c'est Vérifier qui tranche ce qui reste douteux.
- Elle ne lit pas les pastilles. Celles-ci se détectent déjà complètement sur les éléments lus.

## 3. Le recadrage minimal

C'est le cœur de la proposition, et c'est aussi ce qui la rend défendable — en coût comme en
droits.

**Où couper.** La recette dit déjà où regarder : `lectures[ancre=element]` déclare
`marges_exterieures` avec `largeur_rel: 0.2` et une `hauteur_rel` de 0,012 à 0,032. On ne
réinvente aucune géométrie : on reprend celle de la recette, avec la correction déjà consignée —
`marges_exterieures` vaut pour **le cliché entier**, donc sur une demi-page la même marge occupe
deux fois la part de largeur.

**Quelles lignes.** Deux sources de candidats, toutes deux issues de la chaîne locale :

1. Une pastille est présente à une hauteur donnée — `presencePiste` haute — sans numéro d'élément
   lu à côté. La pastille dit qu'un élément commence là ; son numéro n'a pas été rendu.
2. La séquence saute. Les règles de F4 posent `ordre: strictement_croissant` et `saut_max: 12` :
   entre deux numéros lus, un trou plus grand que le pas attendu désigne des lignes à relire.

**Combien ça pèse.** Mesuré sur le lot réel : les clichés de F4 font **1786 × 2410 px** (médiane
sur trois sondages : 1725 à 1821 de large, 2410 à 2620 de haut). D'où un recadrage de

- largeur : 0,2 × 1786 ≈ **357 px**
- hauteur : trois fois la hauteur maximale d'un chiffre, soit 3 × 0,032 × 2410 ≈ **230 px**

soit environ **357 × 230 px**, à la résolution native du cliché — jamais réduite. C'est le sens de
« à bonne résolution » : on n'agrandit pas une image déjà dégradée, on coupe dans l'originale.

Un rectangle de cette taille n'est pas l'œuvre : c'est un numéro dans une marge. C'est aussi ce
qui rend l'envoi acceptable au regard de la règle 5 du projet.

## 4. L'appel au Worker

**L'application n'a jamais la clé.** Elle appelle le Worker, qui détient `ANTHROPIC_API_KEY` côté
Cloudflare. C'est la règle 6, et c'est le motif déjà employé ailleurs dans ce dépôt.

**Contrat d'abord** (règle 2). Deux schémas dans `@lienotheque/contrats`, validés des deux côtés :

- `DemandeVision` : une liste de zones, chacune avec son empreinte de recadrage, ses octets en
  base64, l'alphabet attendu (`chiffres`, déjà déclaré par la recette) et l'intervalle de numéros
  que la séquence autorise à cet endroit.
- `ReponseVision` : par zone, `{ numero: entier | null, confiance: 0..1 }`. `null` est une réponse
  valable et attendue : une marge vide est une marge vide.

**Le modèle.** Claude Haiku 4.5 (`claude-haiku-4-5`) : lire un nombre à deux ou trois chiffres sur
un rectangle de 357 × 230 px ne demande pas davantage, et c'est le modèle le moins cher du
catalogue — 1 $ le million de jetons d'entrée, 5 $ en sortie.

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
  "zones_max_par_lot": 400,
  "zones_max_par_page": 6,
  "cout_max_eur": 0.50
}
```

Un autre domaine, une autre recette, un autre budget : rien à recompiler.

**Estimé avant d'être dépensé.** La chaîne compte ses candidats, annonce « N zones, environ X »,
et attend. C'est le motif de REC-04 — proposer le recalcul avec estimation, sans l'imposer.

**Arrêt net.** Budget épuisé, les candidats restants ne sont pas lus — et ne disparaissent pas :
ils remontent dans Vérifier comme **informations**, exactement comme les pages sans lecture et les
médias orphelins y remontent depuis le lot C. L'écran existe déjà et sait les recevoir.

**Ce que le budget protège vraiment.** Un mot franc sur les ordres de grandeur. Un recadrage de
357 × 230 px coûte de l'ordre de la centaine de jetons d'entrée ; quelques centaines de zones
tiennent donc dans quelques centimes. **Le budget n'est pas là pour l'argent.** Il est là pour
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
2. **l'accord avec la séquence** — le numéro doit tenir dans l'ordre strictement croissant et sous
   le `saut_max` de la recette. Un numéro qui contredit ses voisins est refusé, pas pondéré ;
3. un plafond propre à la vision, **sous le seuil de la recette** (0,6 pour F4).

Conséquence voulue : **un numéro lu par vision et non corroboré par la séquence part à Vérifier.**
C'est la même règle que pour un numéro réparé par interpolation — « un numéro réparé n'est pas un
numéro lu » —, et c'est ce que CLA-05 demande : aucune valeur appliquée sous le seuil sans
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

1. **Treize clichés, 27 repères** (pages imprimées 66 à 92) : le terrain des deux itérations
   précédentes, où l'oracle fait foi. On attend nettement mieux que 21 sur 27, et **sans ajouter
   de faux positifs** — ils sont déjà passés de 3 à 8, c'est le chiffre à surveiller.
2. **Le lot entier** : le critère est 83 sur 92 et 89 sur 92.
3. **F3 ne bouge pas** : 95 sur 95. Un gain sur F4 payé par une régression sur F3 n'est pas un
   gain — et le lot C a montré que ce genre de dégât peut rester invisible sur le corpus qui le
   produit.

Les mesures passent par le banc, depuis le cache, donc elles se rejouent.

## 9. Ce qui vous revient

1. **Quel Worker.** Lequel détient `ANTHROPIC_API_KEY` et reçoit la route ? `apps/worker` n'est
   pas déployé, et `clone-proxy` ne doit pas être touché. C'est la seule question qui bloque.
2. **L'amendement au CDC** : `vision` comme cinquième preuve de ANC-02.
3. **Le périmètre.** OUT-08 est au lot D ; F4 est le seul corpus qui le réclame aujourd'hui.
   Est-ce qu'on le fait maintenant pour clore F4, ou est-ce qu'on consigne F4 comme non tenu
   jusqu'au lot D ?
4. **Le plafond**, une fois mesuré sur de vrais recadrages.

## 10. Découpage, si c'est oui

| Lot | Ce qui se fait | Ce qui le prouve |
|---|---|---|
| 1 | Contrats `DemandeVision` / `ReponseVision`, `Preuve: vision`, bloc `vision` de la recette | Contrats validés, recette refusée si le budget manque |
| 2 | Sélection des candidats et recadrage, hors réseau | Sur F4 : les candidats tombent sur les lignes que l'oracle connaît ; mesure de `count_tokens` sur de vrais recadrages |
| 3 | Route du Worker, clé côté Cloudflare, sorties structurées | Réponse non conforme refusée ; la clé n'apparaît dans aucune réponse |
| 4 | Cache par empreinte, budget, arrêt net, informations dans Vérifier | Rejeu identique sans réseau ; budget épuisé → informations, jamais une erreur |
| 5 | Confiance croisée avec la séquence, preuve dans le lien | Un numéro qui contredit la séquence est refusé ; non corroboré, il part à Vérifier |
| 6 | Mesure : treize clichés, puis le lot, puis F3 | Les trois chiffres du point 8 |
