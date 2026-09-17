# MONO-05 — Rapport de sécurité

## En-têtes

`Content-Security-Policy` (default-src 'self', script-src 'self', pas de
'unsafe-inline' pour les scripts), `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` — appliqués à
TOUTE réponse (statique et API), vérifiés dynamiquement (T05-01b).

## XSS

Zéro `innerHTML=` dans `app/client/` (vérifié statiquement, T05-28s) — tout
rendu passe par `textContent`/DOM API. Prouvé dynamiquement dans un vrai
Chromium (T05-28a/b/c) : un payload `<img src=x onerror="window.__XSS=1">`
injecté dans `missionId` s'affiche comme texte littéral, ne déclenche jamais
le handler `onerror`, et ne crée aucune balise `<img>` réelle dans le DOM.

## Secrets

`app/server/` ne référence jamais `Authorization`/`Bearer`/une clé `sk-...`/
`apiKey`/`password` (recherche statique, T05-17s/18s) — le `SecretProvider`
reste entièrement dans MONO-04, jamais manipulé directement par MONO-05.
Prouvé dynamiquement (T05-18/19/20) : un secret synthétique
(`sk-TEST-NEVER-REAL-123`) injecté côté configuration serveur n'apparaît
jamais dans `document.documentElement.outerHTML`, `localStorage`,
`sessionStorage`, ni les messages console d'un vrai navigateur.

## Concurrence / idempotence

La protection réelle contre une double exécution ne repose jamais sur le
seul bouton désactivé côté client — `engine.runNode()` (MONO-02, gelé)
effectue sa propre vérification `canRun()`+transition `RUNNING` de façon
synchrone avant tout appel métier ; une collision est détectée et rejetée
(`NODE_NOT_READY`) SANS jamais être persistée comme un échec (bug réel
trouvé et corrigé, voir CDC-TRACE.md). Prouvé par deux méthodes
indépendantes : requêtes HTTP réellement concurrentes (`Promise.all`,
T05-39) et double-clic natif dans un vrai navigateur (T05-39d) — dans les
deux cas, un seul appel réseau réel est observé côté serveur upstream.

## Lineage Gate

`getReport()` refuse (`LINEAGE_BLOCKED`, HTTP 403) côté SERVEUR tant que
`EF-04-LINEAGE != PASS` — vérifié par un appel HTTP direct hors UI
(T05-22b), donc jamais un simple contournement cosmétique du bouton client.
