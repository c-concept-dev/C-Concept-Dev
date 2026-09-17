# EF-01C1 — Changelog

## v0.2-r2.0 (correctif ciblé — robustesse du planner réel)

Lot **successeur** de `EF-01C1-v0.2-r1`, qui reste **immuable** et n'a été
modifié à aucun moment. **Aucun appel provider réel** pendant ce lot.

Origine : deux appels planner réels ont échoué de façon identique
(`LLM_RESPONSE_INVALID`, réponse encadrée par une fence ```json), à ~52 minutes
d'intervalle, configuration inchangée — reproduction 2/2.

- **F-C1-R2-01** — `lib/parser.js` : `normalizeStrictJsonEnvelope()` retire
  **une** enveloppe Markdown entourant l'intégralité du JSON, et rien d'autre.
  Aucune réparation de JSON, aucune extraction depuis de la prose. Le contrat
  scientifique reste strict.
- **F-C1-R2-02** — `lib/real-llm-call.js` : `max_tokens` 1024 → 4096. **Une
  seule valeur littérale**, même correctif que EF-01B-v0.2-r2 (F-P2-03), jamais
  porté jusqu'ici.
- **F-C1-R2-03** — `lib/evidence-writer.js` + `lib/executor.js` :
  `planner-provider-evidence.json` écrit **avant** le parsing, classé
  `RAW_PROVIDER_EVIDENCE`, jamais un `plannerRun`. Une réponse reçue laisse
  désormais une preuve même si son parsing échoue.
- **F-C1-R2-04** — `lib/executor.js` + `lib/real-llm-call.js` : un appel RÉEL
  exige `LLM_REAL_MODEL` explicite, contrôlé avant tout réseau
  (`REAL_MODEL_NOT_EXPLICIT`). Aucun modèle codé en dur, défaut global
  inchangé.
- **`lib/errors.js`** : ajout additif du code `REAL_MODEL_NOT_EXPLICIT`.
- **Inchangé, et prouvé par les tests** : `prompts/` (prompt, `PROMPT_ID`,
  `PROMPT_VERSION`, `PROMPT_TEMPLATE_HASH`), `lib/hash.js`, `CONTRACT.md`,
  `PROMPT-REGISTRY.md`, `README.md`, schéma `plannerOutput`, bindings F-07 et
  RunContract, sémantiques F-03/F-04/F-05/F-06, interdiction `humanValidation`.
- **Vérifications** : banc ciblé r2 50/50 PASS ; suite r1 rejouée contre r2
  22/22 PASS ; 0 appel réseau/provider/LLM réel.
- **`PARSER_ENVELOPE_PARITY_EF01B = DEFERRED`** — EF-01B est également strict
  mais n'est pas bloqué ; aucune modification ici, harmonisation = lot séparé.

## v0.2-r1.0 (correctif ciblé F-07, réutilisation F-03/F-04/F-05/F-06)

- **F-07 (MAJOR)** : le planner dépend désormais causalement du contenu
  RÉEL du resolver (`resolvedDisciplines[].rationale` + `resolverOutputHash`),
  jamais d'un simple compteur — deux sorties resolver différentes
  produisent toujours un `inputHash` différent (prouvé par test), et dans
  la quasi-totalité des cas un texte de prompt différent aussi.
- **F-03/F-04/F-06** : réutilisation de `lib/real-llm-call.js`
  (EF-01B-v0.2-r1) — `model`/`transport` toujours observés, jamais
  déclaratifs ; `localInvocationId`/`providerRequestId` distingués.
- **F-05** : `provenance.rawResponseHashScope = "assistant_text"` explicite.
- Nouveau prompt versionné `EF01C1-planner-v0.2-r1.0`.

## v0.2.0 (SUPERSEDED par v0.2-r1)

Voir `EF-01C1-v0.2/CHANGELOG.md` — planner non lié causalement au contenu
resolver réel (F-07), corrigé par v0.2-r1.
