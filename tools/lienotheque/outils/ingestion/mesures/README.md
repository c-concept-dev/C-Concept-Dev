# Bancs de mesure

Ces scripts ne font partie d'aucune chaîne. Ils servent à **mesurer avant d'écrire** : chacun a
répondu à une question posée pendant un chantier, et sa sortie a décidé — ou démenti — un
correctif. On les garde parce qu'une mesure qu'on ne peut pas refaire ne prouve plus rien.

## Convention

**Un nom de document passe par la ligne de commande, jamais écrit dans le fichier.** C'est ce qui
permet à un banc de servir au domaine suivant, et ce qui le tient du bon côté de CLA-01 même si
le garde-fou ne le contrôle pas.

**Périmètre de CLA-01** : le garde-fou de vocabulaire couvre le code de production
(`packages/*/src`, `outils/*/src`, `apps/*/src`, `apps/app/src-tauri/src`), pas ce dossier. Des
fichiers suivis ailleurs — bancs, tests, fixtures, prototypes — nomment des documents par
construction : c'est le périmètre voulu, pas une fuite.

## Comment cet index a été établi

Les sorties ci-dessous ont été **retrouvées dans la transcription de la session** qui a lancé ces
scripts, pas reconstituées de mémoire. Deux limites à garder en tête :

- c'est la **première** sortie de chaque script qui a été retrouvée. Un script marqué « jamais
  abouti » a pu aboutir à un essai ultérieur ; la trace de ce premier essai est ce qui est dit
  ici, rien de plus ;
- un rattachement au CDC n'est écrit que lorsque le CDC ou l'avis du 1er novembre nomme la
  mesure. Ailleurs : **non établi**. Une attribution vraisemblable n'est pas une attribution.

## Index

| fichier | ce qu'il mesure | première sortie retrouvée | statut | section CDC |
|---|---|---|---|---|
| `comptes-de-pages.ts` | la couche et le rendu comptent-ils les mêmes pages | `17` documents mesurés | a produit | §-1 quater (nommé dans l'avis du 1/11) |
| `glissement-double-page.ts` | les index de `lireLeTexte` sont-ils ceux du rendu ou de demi-pages | — | sortie non retrouvée | §-1 quater (nommé dans l'avis) |
| `mesurer-renvois.ts` | un renvoi imprimé « piste N » sur toutes les pages | lancé en arrière-plan | sortie non retrouvée | avis §5 : une famille sur seize |
| `mesurer-noms.ts` | ce que le croisement nom ↔ contenu rend sur toutes les pages | `prêt à lancer` | sortie non retrouvée | avis §5 : croisement nom ↔ contenu |
| `structure-de-la-table.ts` | où sont les colonnes : deux panneaux ou une table | `2 colonne(s) de nombres, x ≈ 435 (24,2 %)` | a produit | non établi |
| `lire-les-tables.ts` | ce que le détecteur de table rend page par page | `6 colonnes, 38 rangées, 13 utilisables` | a produit | non établi |
| `garde-fou-jpeg.ts` | quel critère du garde-fou se déclenche | `18 originaux, 17 mesurés` | a produit | §-1 quinquies |
| `essai-extraction.ts` | ce que la structure voit, et ce que le rendu voit | `JPEG FATAL`, 10 pages → 6 | a produit | §-1 quinquies |
| `ou-sont-les-fatals.ts` | quelles pages portent une image fatale au WebAssembly | `10 pages ; 1 fatale` | a produit | §-1 quinquies |
| `comparer-images.ts` | l'image d'une page survit-elle à la copie, octet pour octet | — | sortie non retrouvée | §-1 quinquies (axes de fidélité) |
| `scanner-jpeg-fatals.ts` | le critère sur tout le corpus | `250 documents lus sur 250 ; 2 CMJN` | a produit | §-1 quinquies |
| `compter-par-page.ts` | — (sans en-tête) | `Exit code 1`, fichier introuvable | jamais abouti | inconnu |
| `ressources-heritees.ts` | combien de documents héritent leurs ressources d'un parent | — | sortie non retrouvée | non établi |
| `retrouver-les-originaux.ts` | l'empreinte du contenu d'une page | — | sortie non retrouvée | §-1 quinquies |
| `apparier-par-le-rendu.ts` | de quel original chaque extrait vient, par l'image | table de distances sur les extraits | a produit | §-1 quinquies (corpus d'essai non fidèle) |
| `inventaire-des-sources.ts` | — (sans en-tête) | `Error: listen EPERM` | jamais abouti | inconnu |
| `retrouver-les-entiers.ts` | — (sans en-tête) | lancé en arrière-plan | sortie non retrouvée | inconnu |
| `mesurer-noms-entier.ts` | — (sans en-tête) | — | sortie non retrouvée | non établi |
| `voie-en-production.ts` | les enregistrements d'un dossier, pris comme la chaîne les prend | déplacé en arrière-plan | sortie non retrouvée | non établi |
| `rendre-en-png.ts` | rendre une page en PNG couleurs vraies | `ERR_MODULE_NOT_FOUND @napi-rs/canvas` | jamais abouti | inconnu |
| `marque-sous-le-seuil.ts` | — (sans en-tête) | dépassement de 600 s | jamais abouti | non établi |
| `polarite-de-la-marque.ts` | la même image, valeurs renversées | lancé en arrière-plan | sortie non retrouvée | §-1 sexies point 3 (hypothèse infirmée) |
| `fenetre-de-la-marque.ts` | un PNG en niveaux de gris de la fenêtre de lecture | trois PNG écrits | a produit | §-1 sexies point 3 |
| `fenetres-autour-du-signe.ts` | plusieurs fenêtres ancrées sur la forme détectée | `8 apparitions : pages 5, 8, 11, 23, 26, 28, 34, 38` | a produit | §-1 sexies point 3 |
| `comment-regrouper.ts` | jusqu'où pousser une composante connexe | dépassement de 600 s | jamais abouti | §-1 sexies point 2 |
| `lire-sans-supposer.ts` | renverser la fenêtre, pas la page | `vivier 22, 12 apparitions, lues 9/12` | a produit | §-1 sexies point 2 |
| `noms-par-ensembles.ts` | un nom désigne par ses suites de mots, pas ses mots isolés | — | sortie non retrouvée | §-1 sexies |
| `echantillon-au-hasard.ts` | tirage reproductible sur une vraie bibliothèque | `250 documents actifs, 1868 enregistrements` | a produit | non établi |
| `ou-passent-les-propositions.ts` | ancienne règle contre règle renforcée, vivier borné | `1868 noms ; 6 documents`, colonnes « ancienne règle / règle renforcée » | a produit | §-1 sexies, la mesure 11 → 117 |

**Récapitulatif** : 14 ont produit une sortie retrouvée, 5 n'ont jamais abouti (erreur,
dépassement, module manquant), 10 ont une sortie non retrouvée. Rien n'a été trié ni retiré.
