# Provenance — MONO-03 (copie gelée, nesting MONO-02, nesting MONO-01.x)
Copie intégrale et bytewise de MONO-03-R1 (manifeste 189/189, tests 64/64,
regénérée pour la rebase R1 — voir dependencies/MONO-03/dependencies/PROVENANCE.md),
qui contient elle-même sa propre copie de MONO-02-R1 (152/152, 334/334,
correctif MONO02-CORPUS-BY-REF-MAP) et de MONO-01.x (106/106, 172/172,
inchangé). Jamais modifiée ici au-delà de cette rebase de dépendance.

MONO-04 ne `require()` aucun port MONO-01.x, aucun fichier gelé historique,
ni aucun module de MONO-03/MONO-02 directement dans `lib/` — il ne
construit qu'une frontière d'exécution externe technique, injectée par
l'appelant final (l'orchestrateur réel, hors périmètre de ce lot) au moment
où celui-ci construit ses `workerCallFn`/`connectorRunners`/`adapter` pour
MONO-01.x. Les tests de MONO-04 utilisent cette copie imbriquée uniquement
pour la non-régression (T04-39/40/41) et pour prouver, avec le VRAI
`EFOrchExecutionPort`/`EligibilityPanelPort`/`DocumentaryReviewPort`, que
les fonctions techniques produites par MONO-04 (fetchImpl OpenAlex,
workerCallFn LLM, ExternalStageAdapter) s'insèrent correctement dans ces
points d'injection déjà gelés, sans jamais les modifier.

Vérification effectuée au moment de la copie :
`sha256sum -c manifest/SHA256SUMS` → **187/187 OK** (MONO-03),
**44/44 OK** (MONO-02 imbriqué), **106/106 OK** (MONO-01.x imbriqué).
