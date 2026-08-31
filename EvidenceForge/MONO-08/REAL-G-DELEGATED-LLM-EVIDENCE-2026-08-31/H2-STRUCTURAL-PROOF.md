# H2 — Preuve structurelle de non-consommation de `ANTHROPIC_API_KEY` côté client

Statut : **PASS — vérifié indépendamment par Claude dans cette session, à l'instant,
par revue de code déterministe (pas un scan de valeur, impossible par construction
CDC §8.1 H2).**

## Méthode (identique à celle déjà auditée en r1/r2/r3, ré-exécutée ici)

`test/test_t08_v06_delegated_auth.js` extrait le corps complet des deux fonctions
concernées par le chemin `delegated`, retire les commentaires (pour ne détecter qu'une
référence de CODE réelle, jamais une mention dans un commentaire qui explique
justement l'absence), puis vérifie l'absence littérale de `ANTHROPIC_API_KEY` :

- `buildLlmWorkerProviderDelegated()` — `EvidenceForge/MONO-08/v0.6/lib/preflight.js`
- `buildLlmWorkerConfigDelegated()` — `EvidenceForge/MONO-08/v0.6/lib/real-provider-configs.js`

## Résultat (exécution fraîche, commit `4d3b676`)

```text
PASS — H2-extract-preflight. bloc buildLlmWorkerProviderDelegated() extrait pour revue
PASS — H2-preflight. aucune reference CODE (hors commentaires) a ANTHROPIC_API_KEY dans buildLlmWorkerProviderDelegated() (lib/preflight.js)
PASS — H2-extract-real-provider-configs. bloc buildLlmWorkerConfigDelegated() extrait pour revue
PASS — H2-real-provider-configs. aucune reference CODE (hors commentaires) a ANTHROPIC_API_KEY dans buildLlmWorkerConfigDelegated() (lib/real-provider-configs.js)
```

24/24 tests PASS au total sur `test_t08_v06_delegated_auth.js` (voir
`REAL-G-REPORT.md` pour le détail complet).

## Ce que cette preuve couvre / ne couvre pas

- Couvre : aucune lecture, aucune transmission, aucun lookup `SecretProvider`, aucun
  header construit à partir de `ANTHROPIC_API_KEY` **par construction du code** dans le
  chemin `delegated` — c'est une garantie structurelle valable pour tout run utilisant
  ce code, y compris le run réel rapporté par l'opérateur (même code, commit `4d3b676`,
  inchangé — voir `WORKER-DEPLOYMENT-IDENTITY.md`).
- Ne couvre pas (et ne peut pas couvrir, par construction) : la confirmation empirique
  que `ANTHROPIC_API_KEY` était bien absente de l'environnement du process au moment
  précis du run réel de l'opérateur — cela relève d'une preuve d'exécution que Claude
  n'a pas observée directement dans cette session (voir `RUN-CONFIG-REDACTED.md`).

## Verdict H2

```text
H2 = PASS (structurel, ré-vérifié indépendamment)
```
