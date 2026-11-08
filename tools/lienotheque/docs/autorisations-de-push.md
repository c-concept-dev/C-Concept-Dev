# Autorisations de push

Le registre dit : « Chaque porte se demande à Christophe dans la fenêtre de cette session, on
attend sa réponse, et **elle s'inscrit au registre avec sa date** » (5 novembre 2026, règle 3).
Push, suppression, écriture dans une vraie bibliothèque, Cloudflare et secrets sont des portes
qui appartiennent à Christophe. **Une recommandation de Claude n'est pas une autorisation.**

## Pourquoi ce fichier existe

Les autorisations **1 à 18** vivent dans `decisions.md`, section « 6 novembre 2026 — Les
autorisations de push, et un écart au protocole ». Ce fichier est désormais une **archive gelée**
que le contrôle complet refuse de voir modifier : le tableau ne pouvait pas y continuer.

Une autorisation n'est pas une décision — c'est une **entrée de journal**, et il y en aura une par
poussée. Elle n'avait donc sa place ni dans l'archive, ni dans `decisions/`, où la règle est une
décision par fichier. D'où ce journal-ci, qui n'est lu par aucun garde-fou et n'a pas à l'être :
ce qu'il garantit est vérifiable à l'œil, après coup, par Christophe comme par quiconque.

**La numérotation continue celle de l'archive**, pour qu'aucune poussée ne porte deux numéros.

## Ce qu'une ligne porte, et pourquoi chacune de ces colonnes

Les **commits nommés** — une autorisation porte sur des commits nommés, jamais sur « la suite ».
Les **mots de Christophe**, cités, et non résumés. L'**origine**, qui dit où la phrase a été dite.
Et les **conditions vérifiées avant de pousser** quand l'autorisation est conditionnelle : contrôle
complet accepté, CI du lot précédent verte, index à ce que le commit porte.

Depuis le 7 novembre, une colonne de plus par consigne de Christophe : **la marge la plus courte
de la course**. Un vert rapporté sans sa marge a précédé un rouge sur le même contrôle, à 55 ms
près ; une course n'est donc pas « verte », elle est verte avec une marge.

| # | commits poussés | autorisation | origine, conditions, marge |
|---|---|---|---|
| 19 | `b39f9071`, geler l'ancien registre et passer à un fichier par décision | « Restructuration du registre, AVANT les lots suivants » puis « Verdict, commit et push » | messages de Christophe dans la fenêtre de la session, 7 novembre 2026 et 8 novembre 2026. **Conditions vérifiées** : contrôle complet accepté sur machine calme et sur secteur (3 037 contrôles lus, 1 rouge épinglé `critere-f3-orphelins-93-98`, charge 7,81 au début et 6,03 à la fin), **copie de travail = index = commit** — les 24 autres chemins mis de côté sur `sauvegarde/lot-vision-07nov` après vérification de leur empreinte —, CI de `18bf579f` verte sur ses trois travaux. **Marge la plus courte : ×1,13** — « écarte un acquis que la lecture a périmé depuis » met **158 931 ms** pour un délai de 180 000, contre 143 617 puis 144 734 aux deux courses précédentes. Vingt et une secondes de marge, et le contrôle n'est pas épinglé : l'entrée 14 n'est plus une amélioration, c'est le prochain rouge |
| 20 | `653b2770`, l'entrée 14 : un mémo de reconnaissance, et la cause d'une exploration arrêtée | « Puis l'entrée 14 : mise de côté, bornage des budgets, mesure avant/après » | message de Christophe dans la fenêtre de la session, 8 novembre 2026. **Conditions vérifiées** : contrôle complet accepté sur machine calme et sur secteur (3 044 contrôles lus, 1 rouge épinglé `critere-f3-orphelins-93-98`, charge 3,52 au début et 3,37 à la fin), **copie de travail = index = commit** sur douze chemins — les 24 autres mis de côté sur `sauvegarde/lot-vision-07nov` après vérification de leur empreinte —, CI de `50254e4d` verte sur ses trois travaux. **Marge la plus courte : ×2,97**, contre ×1,13 avant le lot — « montre les candidats nommés sans jamais les publier » met 60 516 ms pour un délai de 180 000. Le contrôle complet est passé de 1 578 s à **907 s**. **Ce qui reste ouvert, et n'est pas présenté comme réglé** : projetée sur la CI au facteur le plus défavorable mesuré (×1,76, non ×3), cette marge vaut ×1,69 — sous la barre de ×2 |
