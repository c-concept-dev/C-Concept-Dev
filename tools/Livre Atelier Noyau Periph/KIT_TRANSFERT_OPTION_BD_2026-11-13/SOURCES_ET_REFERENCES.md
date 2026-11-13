# Sources et références

## Code local

- `atelier-auteur-core.js` : génération du manuscrit, mémoire narrative, sauvegarde et EPUB.
- `atelier-editeur-core.js` : contrôles déterministes et revues éditoriales.
- `shell-biographie.html` : interface, worker, mode manuel, sauvegarde et reprise.
- `integration.js` : tests d’intégration existants.

## Documentation officielle OpenAI

- Génération et édition d’images : <https://developers.openai.com/api/docs/guides/image-generation>
- Bonnes pratiques de prompting visuel et cohérence des personnages : <https://developers.openai.com/api/docs/guides/image-prompting>

Points retenus :

- génération et édition sont disponibles ;
- plusieurs images peuvent servir de références ;
- les itérations multi-tours permettent de corriger une image ;
- une référence de personnage réutilisable aide à préserver son apparence ;
- le noyau doit rester indépendant du modèle précis et de la version d’API.

## Principe de prudence

Les possibilités et modèles disponibles peuvent évoluer. La nouvelle conversation doit vérifier la documentation officielle avant l’implémentation de l’adaptateur réel.

