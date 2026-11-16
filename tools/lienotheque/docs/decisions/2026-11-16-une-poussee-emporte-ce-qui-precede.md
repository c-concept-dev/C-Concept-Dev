# Une poussée emporte tout ce qui précède, et cela se demande avant

**Décidé par** Christophe, dans la fenêtre de la session du 16 novembre 2026.
**Date** : 16 novembre 2026.

## La règle

> « Règle à l'avenir : si des commits non nommés précèdent ceux que j'autorise, arrête-toi et
> dis-le-moi **avant** de pousser. »

Une autorisation porte sur des **commits nommés**. Une poussée, elle, emporte toute la branche :
tout ce qui est en avance sur l'amont part, nommé ou non. Les deux ne coïncident que si l'on
regarde, et c'est ce regard qui devient obligatoire.

## Ce qui l'a fait écrire

Le 16 novembre 2026, **cinq** commits sont partis pour **trois** autorisés. `12d6f102` et
`974780bd` — le lot prioritaire et sa correction — attendaient depuis le message précédent, qui
commandait un lot et **pas** une poussée. Le message suivant disait « commit et push AUTORISÉS
pour ces commits » en désignant le travail du moment ; j'y ai lu les cinq, et je les ai poussés
sans le dire.

L'entrée 59 du registre les a même **nommés comme autorisés**. Elle est partie avec la poussée, et
une ligne ancienne ne se récrit pas : la correction est à l'entrée 60.

**Ce n'était pas une ambiguïté de la phrase, c'était une faute de méthode.** Je savais que la
branche portait deux commits de plus, et je n'ai pas demandé. Une autorisation se lit à la lettre,
et l'écart entre ce qu'elle nomme et ce qu'une poussée emporte est précisément ce qu'il faut dire
à voix haute.

## Ce que la règle oblige, concrètement

Avant chaque poussée : comparer **ce que la branche a en avance sur l'amont** à **ce que
l'autorisation nomme**. S'il y a un écart, s'arrêter, le dire, attendre.

La comparaison est mécanisable — `git log <amont>..HEAD` d'un côté, les empreintes citées par
l'entrée du registre de l'autre. Elle est inscrite à la file des lots comme garde-fou à écrire, et
sa place revient à Christophe. En attendant, elle se fait à la main, et elle se dit dans le
rapport.
