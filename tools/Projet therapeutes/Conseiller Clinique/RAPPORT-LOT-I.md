# Lot I — photos conservées dans le document

24 octobre 2026. Périmètre : Studio Clinique côté navigateur ; Worker et schéma inchangés.

## Mesure préalable

- Dans une fenêtre Safari privée, l'ouverture de « L'histoire du couple — De Néandertal à nous » a produit 19 GET `/fetch-image`, tous HTTP 200, avec un corps JSON contenant des photos. Il n'y a donc aucun code ni corps d'échec réel à relever dans cette session ; les anciens cadres gris ne peuvent être attribués à un quota, à une clé ou au fournisseur sur cette mesure. Le Worker ne relaie pas les en-têtes de quota Pexels au navigateur. Son code relaie le statut et le corps d'une réponse Pexels non OK ; la réponse peut aussi être 200 avec une liste vide. L'essai de Pixabay n'a lieu qu'après une réponse Pexels OK.
- `POST /media-assets/from-url` accepte les hôtes Pexels/Pixabay, télécharge le fichier, le stocke dans R2, l'indexe dans D1 et renvoie `asset_id` (SHA-256), `deduplicated` et l'attribution. La route d'envoi d'un PNG/JPEG local existe aussi. Le Worker n'a donc pas besoin d'être modifié.
- Les champs facultatifs `imageRef`, `imageAlt`, `imageAssetId` des couvertures et `assetId` des blocs image existaient déjà. `imageRef` reste la provenance ; l'identifiant devient la source stable au rendu. Aucun champ de schéma n'a été ajouté.
- Pexels autorise téléchargement, copie et adaptation, sous réserve notamment de ne pas redistribuer l'image seule : [conditions](https://www.pexels.com/terms-of-service/). Son [API](https://www.pexels.com/api/documentation/) annonce par défaut 200 requêtes/heure et 20 000/mois et des en-têtes de quota sur sa propre réponse. Pixabay permet également copie et usage avec restriction sur la redistribution autonome : [conditions](https://pixabay.com/service/terms/). Sa [documentation API](https://pixabay.com/api/docs/) indique une limite par défaut de 100 requêtes/60 secondes, une mise en cache des requêtes API pendant 24 h, et demande de télécharger les images sur son propre serveur plutôt que de les afficher durablement par hotlink. La portée exacte des licences pour un média servi par une URL Studio accessible publiquement n'a pas été établie juridiquement.

Le fichier d'avenants joint dans `files-11.zip` mesure 42 983 octets, SHA-256 `035d990e…`, et non les 78 797 octets/SHA `7e885143…` annoncés. Le mandat explicite du message a servi de référence ; cet écart reste à clarifier.

## Réalisation

- À la génération d'un document structuré et lors du geste explicite « Figer les photos », le navigateur enregistre le fichier exact choisi dans les médias du Studio puis écrit son identifiant dans le document. Une image déjà enregistrée n'est pas recherchée à nouveau. Les recherches et médias anciens sans identifiant gardent le fonctionnement antérieur.
- « Figer les photos » indique la progression et le bilan, puis marque le document non sauvegardé ; « Sauvegarder » reste un geste distinct. Si le stockage refuse un fichier, aucun champ du document n'est modifié.
- Une recherche sans résultat affiche « Photo introuvable » et « Changer l'image », sans cadre gris muet. Les insertions depuis Médias et le remplacement de photo préservent la requête d'origine.
- Aucun fichier Worker, aucune règle de validation et aucun schéma n'ont été modifiés.

## Contrôles

- Test ciblé `verify-lot-i-photos-conservees.cjs` : identifiants et provenance, bilan, photo absente, refus HTTP 503 du stockage sans mutation du document, geste explicite non sauvegardant, réouverture sans `/fetch-image` pour un asset conservé, message de remplacement. Quatre mutations (`ignore_id`, `requery`, `false_count`, `silent_save`) ont chacune fait échouer le contrôle attendu.
- HTML sans photo enregistrée identique à l'octet à la version antérieure pour les fixtures Présentation, Carrousel et Fiche. Tests ciblés complémentaires : couverture, recadrage WebKit/Chromium, panneau Médias, insertion de bloc image, options photo du lot 7, remplacement de photo — tous réussis.
- En direct sur la copie `TEST-CODEX-LOT-I-2026-10-24`, identifiant `8d2ef476-21cf-472c-a83c-54261ad7dc5d` : GET initial 200 ; « Figer les photos » a indiqué **19 enregistrées, 0 introuvable** ; état « Modifications non sauvegardées » jusqu'au clic sur « Sauvegarder » ; après rechargement du navigateur et réouverture, les images sont visibles, et le filtre réseau Safari `fetch-image` donne **0 résultat**. Le rechargement recrée le contexte JavaScript ; la connexion privée Safari reste la même.

## Médias créés ou dédupliqués pendant l'essai

Le stockage peut dédupliquer par SHA-256 ; l'interface ne prouve pas que chacun de ces médias est exclusivement lié à la copie. Ils sont donc conservés pour éviter d'effacer une ressource partagée. Identifiants :

```text
7afaaf8c4dfc6d031b0e80db4d738f5401330ac890f261ff1e16e1a2043681c4
d0425ad6576ef5d744657d692e1c670de56ace0a50a6b1d589ae6e207cb4106b
2f2927bb78be12cfe0ff7c207ad71c4fc2bfbfd3f4522594996cebfce4f08bcf
c88ad4e12656d036d8baed66145b4f99e733a97923252f510700eae63d0fc2b6
e6a63e1d6ba7940bb2bbb067e99a4b1c7d44551c7fdcadede2c3d7906557edf7
79f4d670d76439046b9bd886c36d93dd400915736977b67afcdd442ab52285cc
9c91ef9a9a21c39c5ce6cbba5c31682b071fa51289ccccc6e9ec9e3acba964fa
974da54f495df76503a56a7bcc1f3841729cad0a808e6034a210af435cbe9f4c
770bedfc67b266d594b87bd4595975f39ebb3b757abdd291522c5ab72eedfbf0
31e18086ac3c0beaaaa68c3e61c84f40601d0a213366ce9b914d47fdf1fa6261
f2eaa6e7b0c088d0932617b945e1e44fec33acc3265309643725b33a428952bd
61ee371ba913c1f78ee65065a049cbec2baff85119ee7b9d01768ae5fbdb577b
e9a901a8ddd0add38decadc4d2dc05ef6a61b23b7e5a465c090219ac7d3a9c91
3c7a8ba240460642be30ef4cb0945074a7c4c4b30339587d6eb834a3d42fe723
37694f6115048319b17dba3508b2247628538cecbf3249dbf3864c63ff45ca4c
300b357cdbf49e61caf3c6d42fed67bab3124d7d03a0df63e83a599070b1d4fa
7241685fe61f65783928ff94ae153a41135d40715e54b36b755aa51ebd11292a
de2fbd0972d6b59b43bf76f5b1ffc94351ccc5bdde21ba0cf8af8911506bff30
53e39f9933ccbf12fbc28d34c0cd041535d9e384fc40317c931a8f1f30c38dae
```

## Publication et limite

Correctif poussé sur `main` par les commits `55387255`, `ea77b155`, `1817027e` ; Pages a publié le script `v=20261024-lot-i-photos-3`. La mesure HTTP ne reproduit pas les anciens échecs : leur cause précise reste inconnue. L'essai en direct vérifie une réouverture après rechargement, pas un nouveau profil Safari indépendant.

La suppression de la copie et le contrôle GET 404 sont à renseigner après confirmation de suppression dans Safari.

Pendant l'inspection réseau, le pilote Safari a inclus une valeur d'en-tête d'authentification dans une sortie interne. Elle n'a été ni copiée dans le dépôt ni reproduite dans ce rapport ; sa rotation après l'essai est recommandée.
