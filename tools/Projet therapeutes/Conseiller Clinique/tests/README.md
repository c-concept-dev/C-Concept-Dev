# Édition directe — vérification 57f

Depuis ce dossier : `npm install`, `npx playwright install chromium`, puis `npm test`.

Variables optionnelles : `CHROMIUM_PATH` pour un exécutable Chromium installé ; `EVIDENCE_DIR` pour les captures (dossier temporaire système par défaut).

Le test sert le client localement, avec ses vrais schémas et son validateur. Il remplace les réponses du modèle et de la sauvegarde ; aucune requête externe n’est transmise. Les accès aux polices sont simulés pour tester autorisation/refus. Le rechargement de page est réel ; les documents rechargés proviennent des corps de requête de sauvegarde capturés.

Les points d’observation ajoutés au HTML par le serveur de test ne sont pas présents dans le client livré.
