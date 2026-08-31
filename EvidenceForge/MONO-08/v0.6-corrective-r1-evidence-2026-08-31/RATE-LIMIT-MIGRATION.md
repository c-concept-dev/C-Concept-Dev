# Défaut/Risque 3 — Rate limiting en configuration legacy

## Version Wrangler utilisée

```text
4.127.1
```

Installée localement via `npx --yes wrangler` (téléchargement npm
standard, aucun compte Cloudflare requis pour cette commande). Vérifiable
avec `npx wrangler --version`.

## Syntaxe précédente (commit 4952ce4)

```jsonc
"unsafe": {
  "bindings": [
    { "name": "RATE_LIMITER", "type": "ratelimit", "namespace_id": "1", "simple": { "limit": 30, "period": 60 } }
  ]
}
```

Confirmé par Wrangler lui-même comme non stable, lors du dry-run :

```text
▲ [WARNING] Processing wrangler.jsonc configuration:
    - "unsafe" fields are experimental and may change or break at any time.
```

(transcription complète : `wrangler-dry-run-before-fix.txt`)

## Recherche de la syntaxe stable actuellement supportée

Le schéma de configuration livré avec Wrangler 4.127.1 lui-même a été
inspecté directement (fichier `config-schema.json` du paquet npm installé
localement — jamais une syntaxe inventée) :

```bash
$ node -e "
const s = require('.../wrangler/config-schema.json');
console.log(Object.keys(s.definitions.RawConfig.properties).filter(k => /ratelimit/i.test(k)));
"
# -> ['ratelimits']
```

Le schéma confirme un champ **top-level stable** `ratelimits` (tableau),
distinct de `unsafe.bindings`, avec la forme :

```json
{
  "name": "string — nom du binding dans le Worker",
  "namespace_id": "string",
  "simple": { "limit": "number", "period": "10 ou 60 uniquement (enum)" }
}
```

Aucune mention `"unsafe"` ni `"experimental"` associée à ce champ dans le
schéma.

## Migration appliquée

```jsonc
"ratelimits": [
  {
    "name": "RATE_LIMITER",
    "namespace_id": "1",
    "simple": { "limit": 30, "period": 60 }
  }
]
```

Même binding name (`RATE_LIMITER`), même sémantique (`simple`, compteur
glissant), même seuil de départ (30 requêtes / 60 s — la valeur `60` est
d'ailleurs l'une des deux seules valeurs autorisées par le schéma stable,
donc déjà conforme sans changement de seuil). Suppression complète du
bloc `unsafe`.

## Preuve de validation après migration

```text
$ npx wrangler deploy --dry-run
...
Your Worker has access to the following bindings:
Binding                                 Resource
env.RATE_LIMITER (30 requests/60s)      Rate Limit

--dry-run: exiting now.
```

**Aucun avertissement `unsafe` restant.** Le binding est reconnu
nativement comme ressource `Rate Limit` par Wrangler. Transcription
complète : `wrangler-dry-run-after-fix.txt`.

## Sémantique préservée (vérifiée par les tests Worker existants, inchangés)

- Binding `RATE_LIMITER` : nom identique, code (`src/worker.js::
  checkRateLimit()`) inchangé — il consomme `env.RATE_LIMITER.limit({key})`
  quelle que soit la syntaxe de configuration qui produit ce binding.
- Limite configurable : oui (`limit`/`period` dans `wrangler.jsonc`).
- `429` avant tout appel upstream : inchangé, revérifié par `worker.test.js`
  (Worker-K, Worker-K-body — voir `worker-test-after-fix.out`).
- Cas K (matrice d'acceptation) : inchangé, revérifié par
  `test_t08_v06_delegated_auth.js` (assertion « K. »).

## Verdict

**C. RATE LIMIT : `MIGRATION REQUIRED` → migration effectuée avec succès
vers la syntaxe `CURRENT STABLE`.** Aucun nouveau service, aucune nouvelle
architecture introduite — seule la configuration Wrangler du binding a
changé de forme, jamais son nom, sa sémantique, ni le code qui le
consomme.
