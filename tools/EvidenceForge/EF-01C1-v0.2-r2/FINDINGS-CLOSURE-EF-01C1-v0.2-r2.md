# EF-01C1-v0.2-r2 — Clôture des findings

| Finding | Intitulé | Statut | Preuve |
| --- | --- | --- | --- |
| **F-C1-R2-01** | Strict JSON fence envelope tolerance | **CLOSED** | T01–T12d (banc ciblé) |
| **F-C1-R2-02** | `max_tokens` 1024 → 4096 | **CLOSED** | T25 (valeur réellement envoyée au Gateway) |
| **F-C1-R2-03** | Raw provider evidence persisted before parsing | **CLOSED** | T16–T18b, T19–T24b |
| **F-C1-R2-04** | Real planner model must be explicit | **CLOSED** | T26, T27, T27b, T28, T28b, T29, T29b |

---

## F-C1-R2-01 — CLOSED

**Défaut** : `JSON.parse()` strict sur le texte assistant brut ; une unique
enveloppe Markdown ` ```json … ``` ` faisait échouer le parsing sur le premier
caractère, alors que le JSON intérieur était exploitable. Reproduit 2/2 sur
appels réels.

**Correction** : `normalizeStrictJsonEnvelope()` retire **une** enveloppe de
transport, et rien d'autre.

**Frontière tenue** : `JSON_REPAIR_ALLOWED = NO`,
`PROSE_EXTRACTION_ALLOWED = NO`. Prose avant/après, fences multiples, fence non
fermée, langage non autorisé, texte hors fence, JSON invalide sous fence :
**tous FAIL**, et testés comme tels (T05–T12).

## F-C1-R2-02 — CLOSED

**Défaut** : `max_tokens: 1024` — identique au finding **F-P2-03** déjà
diagnostiqué et corrigé sur EF-01B (r1 → r2, 1024 → 4096), jamais porté à
EF-01C1. Latent : non atteint lors des deux échecs réels, car le parsing
échouait avant.

**Correction** : une seule valeur littérale, au même site que le précédent
EF-01B. Vérifiée sur le payload réellement transmis, pas sur la source.

## F-C1-R2-03 — CLOSED

**Défaut** : `writePlannerEvidence()` n'était appelée qu'**après** un parsing
réussi. Les deux réponses provider réellement reçues ont été **définitivement
perdues** : ni texte brut, ni `rawResponseHash`, ni `providerRequestId`, ni
modèle observé, ni `localInvocationId`.

**Correction** : `planner-provider-evidence.json`, écrit **avant** le parsing,
classé `RAW_PROVIDER_EVIDENCE`, jamais un `plannerRun`.

**Invariant** : `INVALID_RESPONSE_CREATES_VALID_PLANNER_RUN = NO` et
`INVALID_RESPONSE_CREATES_VALID_PLANNER_OUTPUT = NO`. Une preuve d'échec n'est
jamais confondue avec un run valide.

**Note honnête** : cette correction ne restitue rien. Les deux réponses perdues
avant ce lot **ne sont pas reconstituables et n'ont pas été inventées**. Elle
garantit seulement que cela ne se reproduira plus.

## F-C1-R2-04 — CLOSED

**Défaut** : `LLM_REAL_MODEL` absente → repli silencieux sur
`DEFAULT_REAL_LLM_MODEL`. Le planner a tourné sur un modèle par défaut alors que
le resolver réel de la **même mission** avait été observé sur un autre. Les deux
étages n'avaient pas la même configuration provider, sans que rien ne le
signale.

**Correction** : fail-closed `REAL_MODEL_NOT_EXPLICIT` en mode RÉEL, contrôlé
deux fois, **avant tout appel réseau**.

**Ce que la correction ne fait pas** : elle **ne choisit pas** le modèle.
`MODEL_HARDCODED = NO`. La sélection du modèle réel appartient au propriétaire,
au moment du prochain run.

---

## PARSER_ENVELOPE_PARITY_EF01B = DEFERRED

`EF-01B-v0.2-r2/lib/parser.js` est **tout aussi strict** que l'était EF-01C1 :
il ne tolère aucune enveloppe de transport. Le resolver réel n'a réussi que
parce que sa réponse était du JSON nu. **Il n'y a pas d'asymétrie de robustesse
entre les deux lots — les deux sont également exposés.**

**Aucune modification d'EF-01B n'est faite dans ce lot**, pour trois raisons :

1. EF-01B n'est **pas bloqué** aujourd'hui : son evidence réelle existe, est
   valide et auto-vérifiée (6/6).
2. EF-01B appartient à une **autre lignée déjà validée** ; la modifier ici
   élargirait le périmètre d'un lot correctif ciblé.
3. La mission en cours n'en a **aucun besoin** pour reprendre : le RunContract
   réel est construit et confirmé.

**Risque assumé, nommé** : si un futur resolver réel renvoie du JSON encadré,
EF-01B échouera exactement comme EF-01C1 vient de le faire, et **perdra son
evidence de la même manière** (son `evidence-writer` est lui aussi appelé après
parsing). Une harmonisation — enveloppe **et** evidence-avant-parsing — est donc
souhaitable, mais elle constitue **un lot séparé**, à décider par le
propriétaire.
