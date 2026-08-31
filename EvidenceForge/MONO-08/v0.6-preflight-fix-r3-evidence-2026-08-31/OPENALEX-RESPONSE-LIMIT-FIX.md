# Défaut Bloquant 1 — OpenAlex : troncature destructive avant JSON.parse()

Statut : **BUG PREFLIGHT CONFIRMÉ, CORRIGÉ.**

## 1. Cause

Constaté lors du PREFLIGHT réel post-déploiement (2026-08-31) :

```text
HTTP 200
hostReachable = true
operationValid = true
responseValid = false
Erreur : corps non JSON : Expected ',' or '}' after property value in JSON at position 4756
```

Code avant correction (`lib/preflight.js::httpRequest()`, commit `6f590e4`) :

```js
res.on("data", function (c) { body += c; if (body.length > 4000) res.destroy(); });
```

Toute réponse HTTP dont le corps dépassait 4000 caractères était tronquée en plein
milieu par `res.destroy()`, puis le corps partiel était transmis tel quel à
`JSON.parse(body)` dans `tryParseJson()`. Une réponse OpenAlex réelle pour
`GET /works?per_page=1` dépasse couramment cette taille (champs
`abstract_inverted_index`, `authorships`, `concepts`, etc.) — le provider était donc
signalé `INVALID_RESPONSE` alors qu'il était en réalité parfaitement fonctionnel.

## 2. Conséquence

Faux négatif systématique sur OpenAlex (et potentiellement tout provider dont la
réponse JSON légitime dépasse 4 Ko), bloquant le PREFLIGHT réel indépendamment de la
disponibilité réelle du service.

## 3. Correction appliquée

`httpRequest()` accumule désormais les chunks en `Buffer` (comptage en **octets**, pas
en longueur de chaîne), avec une limite de sécurité explicite :

```js
const MAX_PREFLIGHT_RESPONSE_BYTES = 1048576; // 1 MiB
```

Comportement :

- en dessous de la limite : le corps complet est reconstruit
  (`Buffer.concat(chunks).toString("utf8")`) et transmis normalement à
  `JSON.parse()` — jamais de troncature artificielle ;
- au-delà de la limite : abandon **propre** (`res.destroy()`), `body: null`,
  `bodyTruncated: true`, `bodyBytes: <total réellement reçu>` — **aucun**
  `JSON.parse()` n'est jamais tenté sur un corps partiel.

`checkProvider()` détecte `probe.bodyTruncated` (juste après confirmation que l'hôte
est atteint, avant toute autre classification par code HTTP) et retourne une
classification dédiée, distincte d'un JSON simplement malformé :

```js
status = "INVALID_RESPONSE";
rawClassification = "RESPONSE_TOO_LARGE";
```

`RESPONSE_TOO_LARGE` n'est **jamais** transformé en `READY`, quel que soit le code
HTTP par ailleurs.

## 4. Limite retenue et justification

`1048576` octets (1 MiB). Une réponse OpenAlex réelle pour `per_page=1` fait
typiquement quelques Ko à quelques dizaines de Ko (le corps ayant déclenché le bug
faisait ~4,7 Ko au moment de la troncature) — 1 MiB offre une marge très large
(~20-200×) tout en bornant strictement la mémoire et le temps consommés par une
sonde de préflight technique, qui ne doit jamais télécharger un corps de taille
arbitraire.

## 5. Tests ajoutés (`test/test_t08_v06_delegated_auth.js`, 24/24 PASS)

- **OA1** : JSON réaliste > 4 Ko (l'ancien seuil destructif) mais < 1 MiB → parse
  complet, `READY`. Exerce `httpRequest()` réellement via un faux `https.request`
  (`fakeHttpsOnce`), pas seulement `checkProvider()` avec un probe injecté.
- **OA2** : JSON > 1 MiB (émis en plusieurs chunks de 64 Ko, comme un vrai flux réseau)
  → `INVALID_RESPONSE` / `RESPONSE_TOO_LARGE`, jamais `READY`, jamais de
  `JSON.parse()` sur corps tronqué (`probe.body === null` en interne).
- **OA3** : JSON réellement malformé, sous la limite → `INVALID_RESPONSE` (comportement
  préexistant, non modifié par ce correctif — test de non-régression explicite).

## 6. Probe réseau réel

Tenté depuis cet environnement Claude distant : `GET https://api.openalex.org/works?per_page=1`
via le code corrigé. Résultat : `NETWORK_BLOCKED` /
`x-deny-reason: host_not_allowed` — le proxy d'egress de **cet environnement
sandbox** (pas le code applicatif) bloque `api.openalex.org`, non listé dans son
allowlist. C'est le comportement `isEgressProxyBlock()` fonctionnant correctement,
sans rapport avec le défaut corrigé ici. Ce n'est **pas** une preuve REAL — voir
`NETWORK-PROBES.md` et la commande fournie à l'opérateur pour un vrai test réseau
depuis le Mac.

## 7. Fichiers modifiés

- `EvidenceForge/MONO-08/v0.6/lib/preflight.js` (`httpRequest()`, `checkProvider()`)
- `EvidenceForge/MONO-08/v0.6/test/test_t08_v06_delegated_auth.js` (OA1/OA2/OA3 +
  helper `fakeHttpsOnce`)

Aucune modification de l'URL OpenAlex ni d'un Worker OpenAlex.
