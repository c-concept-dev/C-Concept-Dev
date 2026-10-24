# Synchronisation des polices macOS

Studio Clinique, servi en HTTPS, interroge ce compagnon local sur `https://127.0.0.1:43839/v1/fonts`. Il relève par CoreText les familles actives sur ce Mac toutes les quelques secondes pendant que la page est visible. Il ne transmet ni fichiers de police, ni documents, ni clé du Worker. L’accès HTTP est limité à l’origine `https://c-concept-dev.github.io` et le serveur n’écoute que sur `127.0.0.1`.

Sur macOS avec les Command Line Tools, `sh install.sh --activate` compile le scanner, copie le serveur dans `~/Library/Application Support/StudioCliniqueFontSync`, crée un certificat HTTPS limité à `localhost` et `127.0.0.1`, lui accorde la confiance SSL dans le trousseau de l’utilisateur et lance un LaunchAgent utilisateur. Cette confiance locale est nécessaire pour que Safari accepte la connexion depuis la page HTTPS. Le certificat et sa clé privée restent hors du dépôt, dans le dossier de l’utilisateur ; la clé est en mode `600`.

Pour vérifier : `curl -H 'Origin: https://c-concept-dev.github.io' https://127.0.0.1:43839/v1/fonts`. Dans le Studio, ouvrir les options de police : le groupe « Polices actives sur ce Mac » remplace le catalogue historique si le compagnon répond. Une police ajoutée ou désactivée dans Livre des polices apparaît ou disparaît du menu en quelques secondes. Certaines applications, dont Safari, peuvent garder des glyphes en cache et demander un rechargement pour afficher une police tout juste installée.

Pour arrêter le service : `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/dev.cconcept.studioclinique.fontsync.plist`. Supprimer ensuite le LaunchAgent et le dossier `StudioCliniqueFontSync` si le compagnon n’est plus souhaité. Retirer également dans Trousseaux d’accès le certificat intitulé « Studio Clinique local font sync » pour révoquer sa confiance.

Ce compagnon met à jour le choix des polices dans l’éditeur. Il ne rend pas une police locale disponible dans un export ouvert sur un autre ordinateur ; les polices web ou intégrées restent nécessaires pour garantir ce rendu.
