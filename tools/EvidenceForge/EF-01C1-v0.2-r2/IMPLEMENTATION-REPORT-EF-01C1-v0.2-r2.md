# EF-01C1-v0.2-r2 — Rapport d'implémentation

Lot **successeur** de `EF-01C1-v0.2-r1`, qui reste **immuable** et n'a été
modifié à aucun moment. Aucun appel provider réel n'a été effectué pendant ce
lot.

## Origine : un incident réel, reproduit

Deux appels planner réels `EF-01C1-v0.2-r1` ont été effectués sur la mission
JMJS P0.1, à ~52 minutes d'intervalle, configuration inchangée. **Les deux ont
échoué de façon identique** :

```
[LLM_RESPONSE_INVALID] reponse planner non-JSON ou JSON malformee :
Unexpected token '`', "```json{"... is not valid JSON
```

Le réseau a fonctionné dans les deux cas : le Worker a été joint, le provider a
répondu, `content[0].text` a bien été fourni. L'échec est intégralement au
parsing. La reproduction 2/2 écarte l'hypothèse d'une variance
d'échantillonnage.

## Les quatre corrections

### F-C1-R2-01 — Tolérance d'enveloppe de transport

`lib/parser.js` expose désormais `normalizeStrictJsonEnvelope(rawText)`, appelée
avant le `JSON.parse` strict.

**Deux familles acceptées, exhaustivement** : JSON brut (retourné **inchangé**,
pas même trimé) ; ou une **unique** fence Markdown entourant l'intégralité du
JSON, ouverte par ` ``` ` ou ` ```json ` et fermée en fin de réponse.

**Ce qui reste interdit, et est testé comme tel** : chercher la première `{` ou
la dernière `}`, extraire du JSON depuis de la prose, supprimer du texte
explicatif, réparer une virgule ou un guillemet, accepter plusieurs fences, une
fence non fermée, une fence d'un autre langage, ou du texte hors fence. **Le
contrat JSON scientifique est strictement inchangé** : si le contenu intérieur
n'est pas du JSON valide, le parsing échoue exactement comme avant.

`json` est accepté **sans sensibilité à la casse** — choix explicite, testé
(T09b), documenté ici.

### F-C1-R2-02 — `max_tokens` 1024 → 4096

`lib/real-llm-call.js` — **une seule valeur littérale change**. Même site
(ligne du payload), même valeur cible et même finding que
`EF-01B-v0.2-r2` (F-P2-03), jamais porté jusqu'ici à EF-01C1. Le test T25
vérifie la valeur **réellement transmise au Gateway**, pas la constante source.

### F-C1-R2-03 — Evidence persistée avant parsing

Le système distingue désormais deux faits :

| Fait | Preuve |
| --- | --- |
| une réponse provider a été **reçue** | `planner-provider-evidence.json`, écrit **avant** tout parsing |
| un `plannerOutput` a été **validé** | `planner-output.json` + `plannerRun`, seulement si `parsingStatus = SUCCESS` |

L'artefact brut est classé **`RAW_PROVIDER_EVIDENCE`** et **n'est jamais un
`plannerRun`**. Il porte
`evidenceType`, `evidenceVersion`, `localInvocationId`, `providerRequestId`,
`modelRequested`, `modelObserved`, `transport`, `promptId`/`promptVersion`,
`inputHash`, `assistantText` **brut**, `rawResponseHash`,
`rawResponseHashScope: "assistant_text"`, horodatages, et `parsingStatus`.

En cas d'échec : `parsingStatus = FAILED` + `parsingFailure {code, message,
stage, failedAt}`, l'erreur typée remonte inchangée, **aucun** `plannerRun`
valide et **aucun** `planner-output.json` ne sont produits.

Le contrat gelé n'est pas modifié : cet artefact est **additif** et propre au
successeur.

### F-C1-R2-04 — Modèle réel explicite

Un appel `PROVIDER_OBSERVED_CALL` exige `LLM_REAL_MODEL` non vide. Le contrôle
est posé **deux fois** : au tout début d'`acquirePlannerRun()` (avant
`loadHashDeps`, avant la construction du prompt, avant le hash d'entrée), et une
seconde fois dans `callTracedRealLlm()` au plus près du réseau
(`requireExplicitRealModel`). Sinon : `REAL_MODEL_NOT_EXPLICIT`, **aucun octet
émis** (prouvé par T27 et T29b, qui comptent les appels Gateway).

**Aucun modèle n'est codé en dur** — ni `claude-opus-4-8`, ni
`claude-haiku-4-5`. Le défaut global de R6 n'est pas modifié : il cesse
simplement d'être atteignable en mode RÉEL. `LOCAL_CONTROLLED`, qui injecte déjà
son modèle, est inchangé (T29).

## Invariant de provenance — l'ordre compte

```
assistantText ORIGINAL (fence comprise)
  -> rawResponseHash            (F-05, scope "assistant_text", inchangé)
  -> persistance evidence brute (F-C1-R2-03)
  -> normalizeStrictJsonEnvelope (F-C1-R2-01)
  -> JSON.parse strict
  -> validateRealPlannerOutputFields (R6, gelée)
```

Le hash n'est **jamais** calculé après normalisation. T13 et T14 le vérifient :
`rawResponseHash` du texte fencé diffère du hash du JSON normalisé.

## Ce qui n'a pas bougé

Prompt canonique, `PROMPT_ID`, `PROMPT_VERSION`, `PROMPT_TEMPLATE_HASH`, schéma
`plannerOutput`, liste des connecteurs supportés, binding `resolverOutputHash`
(F-07), binding `runContractHash`, sémantique de provenance modèle (F-03) et
transport (F-04), distinction `localInvocationId`/`providerRequestId` (F-06),
interdiction de `humanValidation` (CDC §7), validation R6.
`prompts/`, `lib/hash.js`, `CONTRACT.md`, `PROMPT-REGISTRY.md`, `README.md` sont
**byte-identiques à r1**.

## Vérifications

- Banc ciblé r2 : **50/50 PASS**
- Suite de compatibilité r1 rejouée contre r2 : **22/22 PASS** (F-01→F-07)
- `EF-01C1-v0.2-r1` : **12/12 OK**, inchangé
- Appels réseau / provider / LLM réels : **0**
