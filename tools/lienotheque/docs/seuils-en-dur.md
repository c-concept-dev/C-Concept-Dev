# Recensement des seuils numériques en dur du code générique

Relevé par balayage de `outils/*/src`, `packages/noyau/src`, `packages/depot-sqlite/src` et
`apps/app/src-tauri/src` : toute constante nommée en majuscules initialisée par un nombre.
**CLA-01 ne les voit pas** — il ne cherche que du vocabulaire.

**Deux limites du relevé, dites tout de suite** : il ne voit que les constantes **nommées**. Un
nombre nu dans une comparaison lui échappe, et il y en a **64 de plus**, dans 32 fichiers, hors
`0` et `1` (`if (nombreDeMedias < 4)`, `signaux.length >= 2`, …). Et il ne dit pas si une valeur a
été **mesurée** ou **posée** : cela se lit au registre, entrée par entrée, et ce travail reste à
faire pour la plupart.

**123 constantes**, en trois natures :

| Nature | Combien | Ce que la doctrine du 5 novembre en dit |
|---|---|---|
| **format** | 18 | imposées par un format de fichier, une unité, une norme. Rien à mesurer, rien à adapter |
| **produit** | 23 | choix d'ergonomie, de budget, de version ou tarif externe. Ne dépendent d'aucun document |
| **jugement** | 82 | **seuils qui décident de quelque chose dans un document.** C'est la catégorie que la doctrine visait |

## Les seuils de jugement — la dette

| Où | Nom | Valeur |
|---|---|---|
| `outils/recettes/src/banc.ts:160` | `ECART_MAX_REPLI_STRUCTUREL` | 4 |
| `outils/recettes/src/banc.ts:334` | `PAS_ECHANTILLON` | 8 |
| `outils/recettes/src/banc.ts:335` | `ECHANTILLON_MAX` | 16 |
| `outils/recettes/src/chiffres.ts:25` | `PART_HAUTEUR` | 0.62 |
| `outils/recettes/src/chiffres.ts:28` | `PART_MORCEAU` | 0.92 |
| `outils/recettes/src/chiffres.ts:32` | `PART_LARGEUR` | 1.25 |
| `outils/recettes/src/chiffres.ts:41` | `PART_ETROITESSE` | 0.15 |
| `outils/recettes/src/interprete.ts:40` | `FENETRE` | 2 |
| `outils/recettes/src/interprete.ts:77` | `ECART_TOLERE` | 4 |
| `outils/recettes/src/interprete.ts:188` | `PLAFOND_VISION` | 0.85 |
| `outils/recettes/src/numeros.ts:106` | `ECART_FRANC` | 1.6 |
| `outils/recettes/src/pistes.ts:31` | `POIDS_LECTURE` | 4 |
| `outils/recettes/src/pistes.ts:35` | `POIDS_ELEMENT` | 2 |
| `outils/recettes/src/pistes.ts:37` | `PENALITE_REPETITION` | 0.3 |
| `outils/recettes/src/pistes.ts:40` | `PRIOR_DEPART` | 0.1 |
| `outils/recettes/src/pistes.ts:43` | `FACTEUR_ENGAGEMENT` | 4 |
| `outils/recettes/src/pistes.ts:45` | `ACCORD_SUR` | 0.5 |
| `outils/recettes/src/pistes.ts:48` | `PRIME_DERNIERE` | 2 |
| `outils/recettes/src/pistes.ts:61` | `PENALITE_SAUT_CORROBORE` | 1.5 |
| `outils/recettes/src/reperes.ts:82` | `PAGE_MAX` | 400 |
| `outils/recettes/src/reperes.ts:84` | `BANDE_NUMERO` | 0.07 |
| `outils/recettes/src/reperes.ts:87` | `COIN_LARGEUR` | 0.3 |
| `outils/recettes/src/reperes.ts:89` | `CONFIANCE_MINIMALE` | 0.6 |
| `outils/recettes/src/reperes.ts:278` | `LARGEUR_MINIMALE_REPERE` | 0.35 |
| `outils/recettes/src/reperes.ts:398` | `REMPLISSAGE_MINIMAL` | 0.45 |
| `outils/recettes/src/reperes.ts:417` | `PRESENCE_MINIMALE` | 0.25 |
| `outils/recettes/src/reperes.ts:943` | `MEME_HAUTEUR` | 0.03 |
| `outils/recettes/src/sequence.ts:21` | `PORTEE` | 40 |
| `outils/ingestion/src/instantane.ts:148` | `REPERES_POUR_UNE_PORTEE` | 3 |
| `outils/ingestion/src/instantane.ts:154` | `FILET_DE_LA_PORTEE` | 2 |
| `outils/ingestion/src/texte.ts:387` | `PART_OCR_MINIMALE` | 0.25 |
| `outils/ingestion/src/texte.ts:428` | `PAGES_POUR_VOTER` | 4 |
| `outils/ingestion/src/texte.ts:440` | `PART_DE_L_APPUI` | 0.2 |
| `outils/ingestion/src/texte.ts:441` | `APPUI_MINIMUM` | 3 |
| `outils/ingestion/src/voie-oracle.ts:103` | `APPARITIONS_POUR_JUGER` | 12 |
| `outils/ingestion/src/voie-oracle.ts:155` | `SEUIL_SANS_MANIERE_DE_LIRE` | 0.5 |
| `outils/redresseur/src/pages.ts:10` | `BANDE_CENTRALE` | 0.18 |
| `outils/redresseur/src/rotation.ts:47` | `ECART_DECISIF` | 0.25 |
| `outils/redresseur/src/rotation.ts:55` | `NOTE_MINIMALE_POUR_TRANCHER` | 10 |
| `outils/images/src/conduites.ts:38` | `POINTS_MINIMUM` | 6 |
| `outils/images/src/conduites.ts:46` | `PART_DU_POINT` | 1 |
| `outils/images/src/conduites.ts:57` | `RAPPORT_DE_TAILLE` | 2 |
| `outils/images/src/conduites.ts:70` | `PART_DE_LA_LARGEUR` | 0.12 |
| `outils/images/src/conduites.ts:78` | `ECART_TOLERE` | 1 |
| `outils/images/src/conduites.ts:81` | `SEUIL_ENCRE` | 128 |
| `outils/lecteur-texte/src/filigranes.ts:31` | `PART_FILIGRANE` | 0.5 |
| `outils/lecteur-texte/src/passages.ts:46` | `BANDE_MARGE` | 0.12 |
| `outils/lecteur-texte/src/passages.ts:54` | `MOTS_MINIMUM` | 20 |
| `outils/lecteur-texte/src/passages.ts:57` | `PAGE_MAXIMUM` | 9_999 |
| `outils/lecteur-texte/src/passages.ts:75` | `SEUIL_LISIBILITE` | 0.08 |
| `outils/lecteur-texte/src/passages.ts:117` | `SEUIL_FORME` | 0.6 |
| `outils/lecteur-texte/src/passages.ts:202` | `FEUILLES_REGARDEES` | 10 |
| `outils/lecteur-texte/src/passages.ts:203` | `FEUILLES_A_DEUX_FOLIOS` | 2 |
| `outils/lecteur-texte/src/passages.ts:258` | `PAYSAGE_MINIMUM` | 1.1 |
| `outils/vision/src/candidats.ts:75` | `MARGE_RELATIVE` | 0.4 |
| `outils/vision/src/marges.ts:19` | `MEME_HAUTEUR` | 0.03 |
| `outils/vision/src/marges.ts:30` | `MARGE_RECADRAGE` | 1 |
| `outils/vision/src/marges.ts:34` | `BANDE_NUMERO` | 0.06 |
| `outils/vision/src/marges.ts:38` | `LARGEUR_MAX_RELATIVE` | 3.5 |
| `outils/vision/src/marges.ts:43` | `LARGEUR_MIN_RELATIVE` | 0.18 |
| `outils/vision/src/marges.ts:50` | `ENCRE_MINIMALE` | 0.12 |
| `outils/optimiseur/src/silences.ts:25` | `TRANCHE` | 0.05 |
| `outils/optimiseur/src/silences.ts:26` | `DUREE_MINIMALE` | 0.6 |
| `outils/optimiseur/src/silences.ts:27` | `PART` | 0.08 |
| `outils/optimiseur/src/silences.ts:28` | `SEGMENT_MINIMAL` | 3 |
| `packages/noyau/src/accord-nom-contenu.ts:78` | `MOTS_DE_LA_SUITE` | 6 |
| `packages/noyau/src/detecteurs-de-noms.ts:152` | `CHAMPS_REGARDES` | 4 |
| `packages/noyau/src/maniere.ts:297` | `MINIMUM` | 0.005 |
| `packages/noyau/src/marques-recurrentes.ts:73` | `COTE_MINIMAL` | 0.004 |
| `packages/noyau/src/marques-recurrentes.ts:74` | `COTE_MAXIMAL` | 0.15 |
| `packages/noyau/src/marques-recurrentes.ts:81` | `RAPPORT_DE_TAILLE` | 1.5 |
| `packages/noyau/src/marques-recurrentes.ts:84` | `MEME_ABSCISSE` | 0.03 |
| `packages/noyau/src/marques-recurrentes.ts:86` | `MEME_ORDONNEE` | 0.03 |
| `packages/noyau/src/marques-recurrentes.ts:92` | `PART_DES_PAGES` | 0.5 |
| `packages/noyau/src/marques-recurrentes.ts:226` | `TOURS_DE_GLISSEMENT` | 10 |
| `packages/noyau/src/marques-recurrentes.ts:476` | `NUMEROTATION_PROBABLE` | 0.5 |
| `packages/noyau/src/moteur-oracle.ts:25` | `REPERES_DE_L_ECHANTILLON` | 8 |
| `packages/noyau/src/table.ts:75` | `LIGNES_POUR_UNE_COLONNE` | 4 |
| `packages/noyau/src/table.ts:136` | `ECART_RELATIF_TOLERE` | 0.1 |
| `packages/noyau/src/table.ts:307` | `ECARTS_TOLERES` | 8 |
| `packages/noyau/src/table.ts:434` | `RANGEES_POUR_UNE_TABLE` | 4 |
| `apps/app/src-tauri/src/doublons.rs:47` | `LONGUEUR_MOT_MINIMALE` | 4 |

## Les choix de produit

| Où | Nom | Valeur |
|---|---|---|
| `outils/recettes/src/reperes.ts:940` | `VERSION_LECTURE` | 11 |
| `outils/ingestion/src/pages-images.ts:23` | `LARGEUR_PAR_DEFAUT` | 1240 |
| `outils/ingestion/src/voie-oracle.ts:94` | `VERSION_DE_LA_VOIE` | 3 |
| `outils/ingestion/src/voie-oracle.ts:99` | `LARGEUR_DE_RENDU` | 1800 |
| `outils/ingestion/src/voie-oracle.ts:140` | `ENDROITS_COUVERTS` | 128 |
| `outils/ingestion/src/voie-oracle.ts:141` | `SECONDES_PAR_ESSAI_AU_PLUS_LENT` | 10.2 |
| `outils/cache/src/index.ts:20` | `PLAFOND_PAR_DEFAUT` | 50 |
| `outils/cache/src/index.ts:22` | `PLAFOND_REPLI` | 2 |
| `outils/redresseur/src/rotation.ts:43` | `REDUCTION_PAR_DEFAUT` | 2 |
| `outils/lecteur-texte/src/epub.ts:42` | `TAILLE_FEUILLET` | 300 |
| `outils/vision/src/relecture.ts:46` | `DOLLARS_PAR_EURO` | 1.08 |
| `outils/vision/src/relecture.ts:57` | `JETONS_FIXES_PAR_APPEL` | 1058 |
| `outils/vision/src/relecture.ts:60` | `JETONS_ENTREE_PAR_ZONE` | 60 |
| `outils/vision/src/relecture.ts:65` | `JETONS_SORTIE_PAR_ZONE` | 50 |
| `outils/optimiseur/src/derives.ts:98` | `POINTS_FORME_ONDE` | 3072 |
| `outils/optimiseur/src/tables-mmr.ts:69` | `RALLONGE_MAX` | 2560 |
| `outils/optimiseur/src/tables-mmr.ts:70` | `PAS_RALLONGE` | 64 |
| `packages/noyau/src/cause.ts:14` | `PLAFOND` | 600 |
| `packages/noyau/src/laissez-passer.ts:127` | `DUREE_PAR_DEFAUT` | 180 |
| `packages/noyau/src/recherche.ts:71` | `PAR_GROUPE` | 6 |
| `packages/noyau/src/session.ts:19` | `DUREE_SESSION` | 90 |
| `packages/depot-sqlite/src/depot.ts:30` | `PLAFOND_RECHERCHE` | 50 |
| `apps/app/src-tauri/src/recherche.rs:13` | `PLAFOND` | 50 |

## Les nombres imposés

| Où | Nom | Valeur |
|---|---|---|
| `outils/recettes/src/banc.ts:159` | `BASE_GROUPE_NUMERO` | 1_000 |
| `outils/recettes/src/numeros.ts:17` | `CHIFFRES_PAR_GROUPE` | 3 |
| `outils/recettes/src/numeros.ts:20` | `BASE` | 10 |
| `outils/ingestion/src/lot.ts:139` | `PREMIER_RANG` | 1 |
| `outils/formats/src/identifier.ts:15` | `TAILLE_ENTETE` | 4096 |
| `outils/formats/src/zip.ts:21` | `FIN_TABLE` | 0 |
| `outils/formats/src/zip.ts:22` | `ENTREE_TABLE` | 0 |
| `outils/formats/src/zip.ts:23` | `ENTETE_LOCAL` | 0 |
| `outils/formats/src/zip.ts:29` | `TELQUEL` | 0 |
| `outils/formats/src/zip.ts:30` | `DEGONFLE` | 8 |
| `outils/optimiseur/src/derives.ts:94` | `ENTETE` | 8 |
| `outils/inspecteur/src/index.ts:11` | `POINTS_PAR_POUCE` | 72 |
| `packages/noyau/src/accord-nom-contenu.ts:74` | `CARACTERES_DU_JETON` | 4 |
| `packages/noyau/src/ceremonie.ts:88` | `TAILLE_DONNEES_AUTH` | 37 |
| `packages/noyau/src/ceremonie.ts:91` | `PRESENCE` | 0 |
| `packages/noyau/src/ceremonie.ts:92` | `UTILISATEUR_VERIFIE` | 0 |
| `packages/noyau/src/signature.ts:32` | `TAILLE` | 32 |
| `apps/app/src-tauri/src/roulement.rs:148` | `APERCU_OCTETS` | 60 |
