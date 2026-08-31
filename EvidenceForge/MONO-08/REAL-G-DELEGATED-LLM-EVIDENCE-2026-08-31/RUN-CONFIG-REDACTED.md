# Configuration du run REAL G — rapportée par l'opérateur (NON exécutée par Claude dans cette session)

**Statut de cette information : OPERATOR-REPORTED, non ré-exécutée ni observée
directement par Claude dans cet environnement.** Cet environnement Claude distant ne
détient à aucun moment `EVIDENCEFORGE_WORKER_API_KEY` ni `ANTHROPIC_API_KEY`
(confirmé — `env | grep` ne retourne rien pour ces deux variables dans cette session).
Le run réel décrit ci-dessous n'a donc pu être exécuté que sur la machine de
l'opérateur (Mac), pas ici.

```text
LLM_AUTH_MODE = delegated
LLM_WORKER_BASE_URL = https://evidenceforge-llm-proxy.11drumboy11.workers.dev
LLM_PREFLIGHT_MODEL = claude-haiku-4-5
OPENALEX_BASE_URL = https://openalex-proxy.11drumboy11.workers.dev
CROSSREF_BASE_URL = https://api.crossref.org
PUBMED_BASE_URL = https://eutils.ncbi.nlm.nih.gov

EVIDENCEFORGE_WORKER_API_KEY = PRESENT (jamais affichée, jamais demandée dans le chat)
ANTHROPIC_API_KEY = ABSENT (rapporté par l'opérateur)
```

## Ce qui est confirmé indépendamment par Claude (code source, statique)

- `LLM_AUTH_MODE=delegated` sélectionne bien `buildLlmWorkerProviderDelegated()` dans
  `lib/preflight.js` (4ᵉ entrée de `buildProviders()`), qui exige
  `EVIDENCEFORGE_WORKER_API_KEY` et ne lit jamais `ANTHROPIC_API_KEY` — vérifié
  structurellement dans `H2-STRUCTURAL-PROOF.md`.
- `LLM_PREFLIGHT_MODEL=claude-haiku-4-5` correspond au défaut documenté introduit dans
  le correctif r3 (`DEFAULT_LLM_PREFLIGHT_MODEL`), donc cohérent que la valeur soit
  identique que la variable soit explicitement définie ou laissée absente.

## Ce qui n'est PAS confirmé indépendamment par Claude

- Que ce run a réellement eu lieu sur la machine de l'opérateur avec ces valeurs
  exactes.
- Que `EVIDENCEFORGE_WORKER_API_KEY` était réellement un credential Worker valide au
  moment du run (pas seulement présent).
- Que `ANTHROPIC_API_KEY` était réellement absente du process au moment précis du run
  (proof structurelle du code = oui ; proof d'exécution réelle = non observée
  directement par Claude).

Voir `LLM-REALITY-LEVEL2.md` pour l'analyse complète du gap de preuve NIVEAU 2 et les
commandes permettant à l'opérateur de fournir un artefact vérifiable.
