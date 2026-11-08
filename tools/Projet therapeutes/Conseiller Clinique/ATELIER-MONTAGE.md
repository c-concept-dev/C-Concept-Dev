# Atelier Diapos : montage vidéo local

L'application autonome `atelier-diapos.html` ouvre un export HTML interactif de Studio Clinique, prépare les images des étapes et permet de produire un ZIP JPEG ou un MP4 H.264/AAC de 1920 × 1080. Les fichiers restent dans le navigateur de l'ordinateur ; aucune clé Worker n'est requise.

## Utilisation

1. Déposer l'export interactif HTML dans Atelier Diapos et attendre les vignettes.
2. Ajouter autant de pistes MP3 **voix** et **musique ou ambiance** que nécessaire.
3. Placer chaque piste sur la ligne de temps, régler entrée, sortie, volume, fondus, boucle et sourdine.
4. Déplacer les repères de début des étapes. La dernière étape finit à la durée du film.
5. Utiliser **Lire** pour contrôler le montage, puis **Exporter la présentation en MP4**.

La baisse automatique de la musique sous les voix est réglable (−18 dB, −12 dB ou aucune). Une piste muette ne contribue pas au fichier final. Les MP3 sont importés par lecture locale et mélangés dans une seule piste AAC du MP4 ; le navigateur doit prendre en charge WebCodecs et AudioContext. Si l'encodage n'est pas disponible, le ZIP d'images reste utilisable.

## Construction et vérification

`node tests/embarquer-atelier-montage.cjs` remet le code du montage et le moteur MP4 dans le fichier HTML autonome. Le moteur embarqué est **Mediabunny 1.65.2**, sous MPL-2.0 ; licence dans `MEDIABUNNY-LICENSE.txt`, source : https://github.com/Vanilagy/mediabunny/tree/v1.65.2. Le fichier `atelier-muxer.bundle.js` est la forme exécutable embarquée de cette version, issue des exports `Output`, `Mp4OutputFormat`, `BufferTarget`, `CanvasSource`, `AudioBufferSource`, `Input`, `BlobSource`, `ALL_FORMATS` et `VideoSampleSink`.

`tests/verify-atelier-montage.cjs` vérifie trois pistes MP3, les commandes individuelles, l'export AAC et la vidéo 1920 × 1080. Le moteur compare ensuite **chaque étape** du MP4 à l'image source décodée ; en cas d'écart, il bloque le téléchargement et affiche l'erreur. Le test de 64 étapes reproduit le risque d'étapes sautées de l'ancien export fondé sur l'horloge réelle.
