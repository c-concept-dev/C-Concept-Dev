# Trois échéances tranchées : D3, D10 et le lot 2

**Décisions de Christophe le 14 novembre 2026**, mot pour mot :

> « Décisions de calendrier (inscris-les) :
> - **D3** : nouvelle échéance, petit lot juste après 0x (la vraie cause d'abstention, même sujet
>   que 0x).
> - **D10** : reportée à l'étape 2 (le repli quand Tesseract manque en relève).
> - **Lot 2** (mesure 48 → 52) : absorbé par l'étape 1 (mesuré 48 → 51 ; le 52ᵉ lien relève de
>   l'étape 3).
>
> Ordre ensuite : D3, 0m, 0w, 0t, 0u, 0l, 0p, 0y, puis l'étape 2. »

## Ce qui les a provoquées

La clôture de l'étape 1, le même jour, a fait passer deux échéances d'un coup. D3 était due
« avant l'étape 1 » et D10 « étape 1 » ; ni l'une ni l'autre n'était levée, et aucune ne pouvait
l'être par un constat — l'épingle `tesseract-absent-aucune-page-lue` est toujours dans
`fixtures/references/echecs-connus.json`, et le repli qu'elle attend n'est pas écrit.

La ligne du lot 2 lisait encore « en attente du 1 » alors que l'étape venait de se fermer.

Les trois ont donc été **soumises plutôt que prises** : déplacer une échéance ou déclarer un lot
absorbé est décider, non constater, et la règle du 10 novembre 2026 réserve ces gestes à
Christophe. C'est la raison pour laquelle le cahier a porté pendant quelques heures deux échéances
visiblement dépassées : une échéance fausse et visible vaut mieux qu'une échéance juste et
inventée.

## Ce que chacune tranche

**D3 passe juste après le lot 0x, et le rapprochement est juste.** C'est le même défaut, un étage
plus bas. Le lot 0x interdit à l'écran de présenter « je ne sais pas lire cette version » comme
« cette bibliothèque est vide » ; D3 interdit à l'abstention de présenter « je n'ai pas fini de
regarder » comme « rien ne numérote ». Le § 3.5 du cahier énonce déjà la règle et nomme les causes
qui doivent rester distinctes — `vivier_non_borne` et `exploration_interrompue` en sont. Le travail
n'est donc pas d'inventer une cause, mais de poser la **préséance** entre celles qui existent, et
de la rendre mécanique.

**D10 part à l'étape 2 parce que c'est là que vit ce qui la relève.** L'épingle dit « Tesseract
absent » ; ce qui la lèvera est le **repli** correct quand l'outil manque, et ce repli est du
ressort de l'étape 2. Reporter la dette, ici, n'est pas la repousser : c'est la ranger là où elle
sera payée par le travail prévu, au lieu d'un lot dédié qui ferait la même chose deux fois.

**Le lot 2 disparaît parce qu'il a été fait**, pas faute de l'avoir été. La mesure à blanc sur le
document entier, par la porte, appels tracés et coût rapporté, est la troisième case de l'étape 1,
cochée le 12 novembre. Et la part qui semblait manquer — le 52ᵉ lien — **n'appartenait pas à cette
étape** : un lien de plus demande la détection des listes de pistes et le seuil de corroboration,
qui sont l'étape 3. Le chiffre inscrit est donc **48 → 51**, celui que la mesure a rendu, et non
48 → 52, celui qu'on espérait.

C'est la deuxième fois en deux jours qu'un objet de travail se déplace vers l'étape 3 pour la même
raison : le **port 2** y est parti le 12 novembre, parce que brancher un relecteur sans la règle de
corroboration paierait un appel pour une valeur que le code doit écarter. La règle de corroboration
attire à elle ce qui en dépend, et il valait mieux le constater deux fois que de le deviner une.

## L'ordre, et ce qu'il dit

**D3, 0m, 0w, 0t, 0u, 0l, 0p, 0y, puis l'étape 2.** D3 passe devant 0m, qui était en tête de la
liste précédente, pour la même raison que 0x y était passé : ce qui touche à ce que l'écran dit
vraiment passe avant ce qui garde le registre. Et le lot **0y** — les deux défauts d'écran relevés
le 14 novembre — ferme la liste : ils sont réels, mineurs, et ils ont rendu le défaut de 0x
beaucoup plus difficile à lire.
