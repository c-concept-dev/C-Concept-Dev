# Liénothèque

*Vos documents et médias, enfin reliés.*

Bibliothèque universelle et modulaire : elle lit vos documents, audios, vidéos et images, les relie
entre eux (une page à sa piste, un livre à son livre audio, une vidéo à sa transcription) et vous
permet de tout retrouver, sur la vraie page ou au vrai minutage.

## État : lot 0 en cours
- `@lienotheque/contrats` : contrats Zod des fichiers, documents, versions, ancres, liens, cartes de
  synchronisation, recettes, travaux, opérations, résultats d'outils et état de service, avec export
  JSON Schema.
- `@lienotheque/jetons` : jetons de la charte graphite et cuivre v3.0.1, feuille CSS générée pour les
  trois variantes, tests de contraste WCAG 2.2.
- `@lienotheque/app` : React 19, Vite, TypeScript strict. Composants portés du kit UI v1.1, accueil
  statique des maquettes, bascule clair / hybride / sombre intégral.
- `@lienotheque/worker` : squelette Hono, route de santé. Aucun déploiement au lot 0.
- `apps/app/src-tauri` : prototype bureau mesuré, décision du socle en attente
  (voir `docs/decisions.md`).

```
pnpm install
pnpm check    # typage strict + tests
pnpm build    # dist/schemas/*.schema.json, dist/lienotheque.css et l'application web
```

Référence visuelle : `docs/ui-kit/catalogue.html` (kit UI v1.1) et `docs/charte/` (charte v3).

Consignes de développement : voir `CLAUDE.md`. Décisions : `docs/decisions.md`.
