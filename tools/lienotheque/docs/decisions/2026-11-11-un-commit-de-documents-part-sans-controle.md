# Un commit qui ne touche que des documents part sans contrôle complet

**Exception accordée par Christophe le 11 novembre 2026**, et c'est une exception — pas un
assouplissement de la règle. Ses mots :

> « Exception explicite, à inscrire dans `docs/decisions/` et au § 4.4 : un commit qui ne touche
> **QUE des documents** (hors fichiers lus par les garde-fous : épingles, marges, fixtures) part
> sans contrôle complet **si** le crochet passe, **si** le dernier contrôle complet est accepté sur
> le même code, et **si** la CI est lue après. Tout autre commit : règle stricte. »

## Les trois conditions, et aucune n'est décorative

| condition | ce qu'elle empêche |
|---|---|
| le **crochet de pré-commit** passe | qu'un commit emporte un fichier fantôme, un mot de domaine, une promesse non attendue, un fichier refusé ou une marque de mesure |
| le **dernier contrôle complet est accepté sur le même code** | qu'on profite de l'exception après avoir touché du code, « parce que le reste n'est que de la documentation » |
| la **CI est lue** après la poussée | qu'un document casse ce que personne ne regarde — un lien mort dans l'index des décisions, un tableau que le banc d'universalité parcourt |

## Ce que « que des documents » exclut, et pourquoi c'est la moitié de la règle

**Tout fichier lu par un garde-fou**, quelle que soit son extension :

- `fixtures/references/echecs-connus.json`, les **épingles** — elles décident quels rouges sont
  tolérés. Une épingle modifiée change le verdict du contrôle sans changer une ligne de code, et
  c'est exactement ce qui a rendu la CI rouge le 10 novembre ;
- `fixtures/references/marges-de-delai.json`, la **barre des marges** — y poser un nombre à la
  place de `null` suffit à rendre le refus actif ;
- les **fixtures** en général, et les modèles de `fixtures/modeles/` que le banc d'universalité
  parcourt.

Ceux-là sont des **données qui commandent**, pas des documents. Ils relèvent de la règle stricte.

## Pourquoi cette exception est juste, et pourquoi elle est étroite

Un contrôle complet coûte quinze minutes et une machine au calme. Le passer pour un commit qui
n'ajoute qu'une ligne au registre des poussées ne protège rien : aucun fichier exécutable n'a
changé, et la course rejouerait à l'identique ce qu'elle vient d'accepter.

Mais l'exception est étroite **parce que le raisonnement « ce n'est que de la documentation » est
précisément celui qui laisse passer les fautes**. Le registre du 7 novembre en porte deux : un
commit d'autorisation qui devait emporter une ligne en a emporté quatre-vingt-seize, et une
section effacée par une copie venue d'ailleurs. Les deux ne touchaient « que des documents ».

C'est pourquoi la première condition est le **crochet**, et non l'attention : il juge l'index, il
compte les chemins, et il ne se fatigue pas.

## Premier emploi

L'entrée **34** du registre des poussées, le 11 novembre 2026 : quatre chemins, tous des
documents, poussés après le contrôle complet accepté de 12 h 43 sans qu'aucun fichier de code
n'ait changé depuis. Elle le disait déjà — « je le dis plutôt que d'annoncer une course de plus » —
avant que l'exception n'existe. Elle existe maintenant, et elle est nommée.
