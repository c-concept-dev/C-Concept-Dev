# Fixtures

Vérités attendues et paramètres des jeux de référence (CDC normatif v2.0, section « Fixtures »).
Les œuvres sous droits ne sont **jamais** versionnées : seuls leurs empreintes, leurs vérités et
leurs paramètres le sont. Les fichiers eux-mêmes restent dans un stockage privé (`fixtures/fichiers/`,
ignoré par Git).

| Fixture | Contenu | Vérité attendue | Référence | État |
|---|---|---|---|---|
| F1 | Aebersold, PDF natif, 55 pages | Texte identique à la couche PDF | 100 % | `fb385094…` |
| F2 | Realbook Bass F, 508 pages | Page 28 : 36 accords, tonalité A♭ | 1 page lue | `7174e9db…` |
| F3 | 70s Funk & Disco Bass, 29 images, 99 MP3 | Exercice → piste | 95/95 | `f408fcdc…`, recette `methode-pastille-piste.v1` |
| F4 | Westwood vol. 1, 143 photos, 92 MP3 | Premier exercice et page par piste | 83/92 et 89/92 | **fichiers absents du stockage privé** — recette `methode-pastilles-cd.v4` |
| F5 | Requêtes de recherche | Pages attendues | — | Lot C |
| F6 | Scénarios de synchronisation | SYN-01 à SYN-09 | — | Lot E |
| F7 | Échantillon d'optimisation | OPT-01 à OPT-04 | Mesures du 2 octobre 2026 | Lot C |
| F8 | Échantillon de réimport | Alias retrouvés | — | Lot E |

## Empreintes des jeux, calculées le 5 novembre 2026

**Empreinte de contenu, jamais chemin + taille + date** — la forme faible a déjà trompé deux fois
dans ce projet. L'empreinte d'un jeu compose, dans l'ordre, le chemin relatif et l'empreinte
SHA-256 de chacun de ses fichiers : elle change si un octet, un nom ou un fichier change.

| Jeu | Fichiers | Taille | Empreinte du jeu | Dans la bibliothèque |
|---|---|---|---|---|
| F1 | 1 | 6,2 Mo | `fb38509468775a68c355f483f49fb7224f08880b4317e86e387d6b4ec49b473b` | `d1092737` |
| F2 | 1 | 67,0 Mo | `7174e9db0f9860343b8d7ba744f3b54046b0f920077064a30008cfc8b1302f58` | `549b95ee` |
| F3 | 100 | 54,3 Mo | `f408fcdc79c94b3ad02fa0e05388934d6b74e0a7e128d9692fc1d385df6d71b6` | `fc41f8c5` |
| F4 | — | — | **aucun fichier** | — |
| F5 | 100 | 63,4 Mo | `5f409bdbc14f65197b21d0f471b0b95164568196b9856726983f4d3f84602d5a` | — |
| aebersold-002 | 1 | 2,4 Mo | `4faca00192bbbcacd935062ac2c2c01908eebd6af25482f30c3b5d5a9af5b1df` | `d090cacc` |

**Deux réserves, dites plutôt que tues :**

1. **F4 est vide.** `fixtures/fichiers/F4/` ne contient aucun fichier : la vérité attendue
   « 83/92 et 89/92 » ne peut être rejouée par personne aujourd'hui.
2. **Le tableau ci-dessus dit F5 « requêtes de recherche »**, mais `fixtures/fichiers/F5/` porte
   depuis le 5 novembre 2026 le jeu *Funk Fusion Bass* — 1 PDF et 99 MP3. Les deux emplois du
   même nom coexistent, et c'est un piège : **le contenu du dossier fait foi**, pas la ligne du
   tableau.
