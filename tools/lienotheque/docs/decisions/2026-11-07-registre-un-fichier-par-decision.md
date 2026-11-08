# Un fichier par décision, et l'ancien registre gelé

**Décidé par Christophe le 7 novembre 2026**, dans la fenêtre de la session.

`docs/decisions.md` est **gelé comme archive** : plus aucune écriture, aucun découpage, aucune
réécriture. Une note en tête le dit, un garde-fou du contrôle complet le vérifie par empreinte, et
`CLAUDE.md` dit où écrire désormais. Chaque décision nouvelle prend son propre fichier,
`docs/decisions/AAAA-MM-JJ-sujet.md`, et `docs/decisions/README.md` les liste.

## La raison, mesurée

Pendant deux jours, **chaque lot a dû découper ce fichier partagé** pour n'en commiter que sa part.
Le procédé a produit, en une seule journée, trois incidents de la même famille :

| Incident | Cause |
|---|---|
| les lignes 8 à 15 du tableau des autorisations commitées **sous le mauvais titre** | l'ancre d'insertion était **une ligne de tableau**, qui ne dit pas dans quelle section on se trouve |
| une section de registre **effacée** | une restauration par `cp` depuis une copie plus ancienne |
| un décompte de poussées **faux trois fois de suite** | une phrase qui recopiait un tableau voisin, et plusieurs tableaux du fichier ont des lignes de même forme |

Aucun n'est une faute d'attention isolée : tous viennent de ce qu'un fichier de dix mille lignes
doit être découpé par chaque lot. **Supprimer le découpage supprime la classe entière.**

## Ce que le gel coûte, et ce qu'il ne coûte pas

Il ne coûte aucune perte : l'archive reste lisible, et le sommaire y renvoie. Il coûte une
discipline — ne plus ajouter « juste une ligne » à un fichier qu'on sait fermé — et c'est
précisément ce qu'un garde-fou mécanique tient à notre place.
