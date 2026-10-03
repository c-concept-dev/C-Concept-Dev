# @lienotheque/worker

Squelette de l'API Liénothèque, sur [Hono](https://hono.dev).

**Lot 0 : aucun déploiement.** Ce paquet n'embarque ni Wrangler, ni configuration Cloudflare, ni
secret. Il expose une application `fetch` ordinaire, vérifiée par `pnpm check` comme le reste du
dépôt. Le déploiement sera décidé plus tard, avec un `wrangler deploy --config <fichier>` explicite
(CLAUDE.md, règle 7) ; il ne doit jamais partir d'un workflow de ce dépôt, où `Worker/**` redéploie
déjà `clone-proxy`.

## Routes

| Route | Réponse |
|---|---|
| `GET /sante` | `EtatService` de `@lienotheque/contrats` : service, version, état, horodatage, capacités annoncées (HEB-01) |

Toute autre route répond `404` en JSON. La réponse de santé est validée par son contrat avant
d'être envoyée : rien ne traverse le réseau sans contrat (CLAUDE.md, règle 2).
