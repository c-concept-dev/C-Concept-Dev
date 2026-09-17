# EvidenceForge — MONO-05 : Generic Operator UI

Interface opérateur générique, cliente de MONO-01→04 — jamais le système
lui-même. Aucune logique métier dans l'UI : chaque action est revalidée
côté serveur (`OperatorApi`) avant tout effet réel.

## Architecture

```
Navigateur (app/client/, vanilla JS, zéro framework)
   ↓ fetch("/api/...")
OperatorApi (app/server/operator-api.js) — SEULE frontière
   ↓
MONO-01.x ports · MONO-02 orchestration engine · MONO-03 persistance · MONO-04 gateway
```

Le navigateur n'a **jamais** d'accès direct à un module gelé, au backend de
persistance, ou au `SecretProvider`. `app/server/http-server.js` est le seul
point d'entrée réseau, avec `Content-Security-Policy`,
`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` sur toute
réponse.

## Contenu

```
MONO-05/
├── app/
│   ├── server/
│   │   ├── config.js            (backends explicitement injectés, jamais de défaut implicite)
│   │   ├── run-registry.js      (moteurs MONO-02 vivants, réhydratables depuis MONO-03 après "redémarrage")
│   │   ├── operator-api.js      (la frontière — revalidation serveur systématique)
│   │   └── http-server.js       (routage HTTP, en-têtes de sécurité, fichiers statiques)
│   └── client/
│       ├── index.html
│       └── app.js               (vanilla JS, rendu 100% textContent — jamais innerHTML avec contenu variable)
├── contracts/operator-api-v1.json
├── dependencies/MONO-04/         (copie bytewise, nesting MONO-03/02/01.x)
├── test/
│   ├── unit/                     (2 fichiers, 8 tests)
│   ├── integration/               (5 fichiers, 35 tests, vrais serveurs HTTP + vrai pipeline)
│   └── browser/                   (1 fichier, 22 tests Playwright réels, captures d'écran incluses)
├── reports/                       (5 rapports + 3 captures d'écran responsive)
├── manifest/SHA256SUMS
└── package/EvidenceForge-MONO-05-v1.zip
```

## Ce qui a été réellement prouvé, pas supposé

- **XSS** : un payload `<img src=x onerror="window.__XSS=1">` injecté dans
  `missionId` à la création d'un run, réellement rendu dans un vrai
  Chromium — `window.__XSS` reste `undefined`, le payload apparaît comme
  texte littéral, aucune balise `<img>` n'existe dans le DOM.
- **Secret leak** : un secret synthétique (`sk-TEST-NEVER-REAL-123`) injecté
  côté configuration serveur, recherché dans `document.documentElement.outerHTML`,
  `localStorage`, `sessionStorage`, et les messages console d'un vrai
  navigateur — absent partout.
- **Concurrence** : deux clics natifs déclenchés de façon synchrone sur le
  même bouton dans un vrai navigateur (puis, séparément, deux requêtes HTTP
  réellement concurrentes) — un seul appel réseau réel vers le provider
  externe est observé côté serveur upstream, quel que soit le nombre de
  réponses HTTP 200 renvoyées au client (`attemptCount` reste à 1).
- **Lineage Gate** : `GET /api/runs/:id/report` refusé par le serveur
  (403 `LINEAGE_BLOCKED`) tant que `EF-04-LINEAGE != PASS`, y compris via un
  appel HTTP direct hors UI ; accessible uniquement après un vrai `PASS`
  enregistré via `MONO-03.coordinator`.
- **Redémarrage serveur** : une **seconde instance complète** du serveur
  (nouveaux `mono01`/`mono04`/moteurs en mémoire), pointant sur le **même**
  backend MONO-03, retrouve l'état exact d'un run déjà avancé — MONO-05 ne
  possède jamais l'état.
- **14 nœuds réels** : le graphe rendu (API et navigateur) est comparé
  directement aux IDs du vrai `mono-02-orchestration-graph-v1.json`, jamais
  un compte codé en dur.
- **Responsive** : captures d'écran réelles à 1440×900, 1024×768, 390×844
  (`reports/screenshot-*.png`), aucun débordement horizontal critique, au
  moins un bouton d'action toujours visible.
- **Accessibilité** : navigation `Tab` réelle jusqu'au bouton "Nouveau run",
  style de focus visible vérifié via `getComputedStyle`.

## Bugs réels trouvés et corrigés

Voir `CDC-TRACE.md` — trois bugs de module trouvés (jamais supposés,
toujours reproduits d'abord) : lecture d'état READY depuis le mauvais
niveau (MONO-03 brut au lieu du moteur vivant), et surtout un **bug de
concurrence réel** où une requête rejetée par collision était persistée à
tort comme un échec métier du nœud dans MONO-03. Un **défaut de
reproductibilité du package** (pas un bug fonctionnel) a également été
corrigé après un second audit indépendant : `playwright` n'était pas
déclaré dans `package.json`/`package-lock.json`, rendant le ZIP
implicitement dépendant d'une installation globale préexistante sur la
machine d'origine — corrigé (voir section Installation ci-dessus).

## Limite connue et assumée

`EF-02A/B/C` (ExternalStageAdapter) ne sont pas câblables depuis le
formulaire générique de création de run : leur binding technique exige
l'injection de fonctions `resultProvider` réelles (MONO-04), jamais une
déclaration JSON — construire un tel binding générique reviendrait à
inventer une logique métier dans l'UI (interdit, section 2). Ces nœuds
restent donc `BLOCKED` pour tout run créé exclusivement via cette UI
générique ; leur pilotage reste hors périmètre de MONO-05.

## Installation et vérification indépendante

```
cd MONO-05
npm ci
npx playwright install chromium   # si le binaire Chromium n'est pas déjà présent dans l'environnement
npm test
sha256sum -c manifest/SHA256SUMS
```

**Important (correction post-audit reproductibilité)** : `npm ci` installe
le paquet JS `playwright` (devDependency figée à la version exacte
`1.56.0`, avec `package-lock.json` commité) — mais le **binaire Chromium**
lui-même n'est pas garanti par `npm ci` seul sur une machine neuve sans
cache préexistant (Playwright le télécharge séparément via
`npx playwright install chromium`, ou le résout depuis
`PLAYWRIGHT_BROWSERS_PATH` si déjà configuré dans l'environnement cible).
`test/package-check.js` vérifie explicitement ces deux étapes
séparément — module résolu, puis `chromium.launch()` réussit — et
`test/run-all.js` refuse d'annoncer les 22 tests navigateur comme PASS
s'ils ne peuvent pas réellement s'exécuter : en l'absence de Chromium, ils
sont explicitement rapportés "NON EXÉCUTÉS", jamais silencieusement omis
ni comptés à tort.
