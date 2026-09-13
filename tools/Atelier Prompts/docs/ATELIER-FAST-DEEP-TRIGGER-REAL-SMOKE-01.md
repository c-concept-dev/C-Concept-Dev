# ATELIER-FAST-DEEP-TRIGGER-REAL-SMOKE-01

**Sous-lot :** `ATELIER_FAST_DEEP_TRIGGER_REAL_SMOKE_01D_O`
**Nature :** smoke de runtime réel. Aucun changement de code, aucune correction pendant le smoke.

**Résultat.** Sur le cas contradictoire G1, avec le **vrai** endpoint Groq déployé et le **vrai**
pilote : `ASK_CLARIFICATION` en **573 ms**, question affichée, **zéro appel profond**. Puis, après une
réponse réelle de l'utilisateur, le plan rapide n'a plus rien eu à demander et l'autorité a repris la
main — **un** appel profond, parti **après** la réponse rapide. Deep a réellement quitté le chemin du
dialogue rapide.

---

## A. État Git

```
git status --short -- 'tools/Atelier Prompts'  → (vide)
git branch --show-current                      → main
git rev-parse HEAD                             → 51ecbfb97d95fae5b73cbcfde97ead07ec3337d4
git log -3  → 51ecbfb Update studio-clinique.html
               e6d1371 ATELIER-FAST-DEEP-TRIGGER-FIX-01D-N: le plan profond redevient une escalade
               01e08fb Create ATELIER-FAST-DEEP-TRIGGER-CONFORMANCE-01.md
```

`HEAD` n'est pas `e6d1371` mais un **descendant explicite et documenté** :

- `git merge-base --is-ancestor e6d1371 HEAD` → **OUI** ;
- `git diff --name-only e6d1371..HEAD -- 'tools/Atelier Prompts'` → **0 fichier**.

Le seul commit intercalaire touche `tools/Conseiller Clinique/studio-clinique.html`, hors périmètre.
**Aucun changement sémantique du trigger.** Arbre propre.

## B. Correction métadonnée 1D-N

```
AUDIT_METADATA_CORRECTION = NO — aucune correction nécessaire.
```

Le §2 supposait que le rapport 1D-N portait `PRODUCTION_CODE_CHANGED = NO`. Vérification faite :

```
grep -n "PRODUCTION_CODE_CHANGED" docs/ATELIER-FAST-DEEP-TRIGGER-FIX-01.md  → aucune occurrence
```

Le champ ne figure pas dans le fichier : le bloc de verdict était la restitution terminale du
sous-lot, et il portait bien `PRODUCTION_CODE_CHANGED = YES`. Les deux seules mentions de
« production » dans le rapport sont exactes :

- ligne 4 — « **Nature :** correctif de production ciblé » : le rapport se déclare bien comme un
  changement de production ;
- ligne 22 — « le code de production **était** inchangé depuis la baseline des audits » : au passé,
  et portant sur l'état **de départ**, ce qui était vrai (`0 fichier` hors `docs/`).

Aucune réécriture n'a donc été faite, conformément au « Aucune autre réécriture » du §2.

## C. Scénario G1

Cas contradictoire déjà connu du corpus 1D-B/1D-C, réutilisé tel quel — aucune fixture métier
nouvelle :

> « Fais-moi un texte très court mais parfaitement exhaustif qui couvre absolument tout le sujet. »

Historique : Groq y rendait `ASK_CLARIFICATION` 3 fois sur 3, en 416–469 ms.

**Montage du smoke.** Plan rapide **réel** : endpoint `/fast-interaction` déployé, prompt de
production, aucun stub. Plan profond : **sentinelle** — une fonction qui journalise bruyamment si
elle est appelée, branchée sur le `fetchImpl` du harnais réel, lequel enregistre l'appel *avant* de
l'invoquer. Un appel profond est donc impossible à manquer, et aucun n'a été facturé.

## D. Fast latency

| tour | demande | type rendu | latence | HTTP |
|---|---|---|---|---|
| 1 | G1, Architecte | **`ASK_CLARIFICATION`** | **573 ms** | 200 |
| 2 | G1 + réponse utilisateur | `ACKNOWLEDGE` | 449 ms | 200 |
| 3 | demande complète (checklist) | `ACKNOWLEDGE` | 326 ms | 200 |
| 4 | G1, Rapide | **`ASK_CLARIFICATION`** | 427 ms | 200 |

Les quatre mesures tiennent le contrat rapide (`p50 ≤ 2 s`, `p95 ≤ 3 s`) avec une marge de plus de
cinq fois. G1 à 573 ms contre 416–469 ms historiquement : même ordre de grandeur, variance
fournisseur ordinaire, largement dans le contrat.

## E. Fast ASK visible

Tour 1, question réellement affichée :

> « Pour quel sujet précis souhaitez-vous que je rédige ce texte ? »

`pendingQuestion = true`, champ de réponse ouvert et vide. La personne pouvait répondre
immédiatement, **sans qu'aucun fournisseur profond n'ait été appelé.**

## F. Deep call evidence

```
retour=true   fastCalls=1   DEEP_CALLS=0
lastTurn=null   canonicalContract=null   lifecycle=null
marques : fast_start → fast_end → fast_render → deep_not_started
```

`DEEP_CALL_COUNT = 0`, et ce n'est pas « non observé » — c'est prouvé par quatre témoins
indépendants et concordants :

1. **compteur d'appels du harnais** — `spy.deepCalls` est incrémenté dans `fetchImpl` *avant* toute
   invocation de la fonction profonde : il compte la tentative du pilote, pas son succès. Il vaut 0.
2. **sentinelle silencieuse** — la fonction profonde journalise à chaque entrée. Elle n'a rien
   journalisé au tour 1, et elle l'a fait aux tours 2 et 3. Elle fonctionne, et elle s'est tue.
3. **télémétrie du pilote** — `deep_not_started{reason:'FAST_ASK_ONE_QUESTION'}` est présent ;
   `deep_start` et `deep_end` sont **absents**.
4. **état du pilote** — `lastTurn`, `canonicalContract` et `lifecycle` sont tous `null` : aucun tour
   autoritaire n'a été appliqué, aucun contrat canonique produit, aucun cycle d'exécution ouvert.

Le harnais lève d'ailleurs sur tout point d'entrée inattendu (`PERF-04 : point d'entrée inattendu`) :
aucun appel réseau tiers n'a pu passer inaperçu.

## G. Réponse utilisateur

Réponse réellement fournie à la question posée par G1 :

> « Le sujet est la sécurité des mots de passe, et je préfère la brièveté. »

Portée dans `clarification_history`, question refermée, nouveau tour lancé.

## H. Tour suivant

```
[FAST RÉEL] http=200 type=ACKNOWLEDGE 449 ms
marques : fast_start → fast_end → fast_silent → deep_start → deep_end → orchestration
fastCalls=1   DEEP_CALLS=1   deep at=450 ms   fastResolvedAt=449 ms
```

`NEW_FAST_CALL = YES` — le plan rapide a bien **réévalué** le tour.
`FULL_DEEP_STARTED_IMMEDIATELY = NO` — l'escalade est partie **à 450 ms**, soit une milliseconde
après la réponse rapide de 449 ms, jamais avant.

**Et 1D-G se voit à l'œuvre dans le même relevé.** Le texte rendu par Groq était :

> « Compris, je vais rédiger un texte très court mais exhaustif sur la sécurité des mots de passe. »

Un `ACKNOWLEDGE` qui affirme. Il n'a **pas été affiché** — marque `fast_silent` — parce que la
rétrogradation de 1D-G l'a converti en silence. Le lot précédent tient donc aussi en runtime réel.

## I. Deuxième interaction

Le plan rapide n'a **pas** produit de seconde question : la réponse de l'utilisateur avait résolu
l'ambiguïté, il a donc rendu `CONTINUE_WITH_DEEP_VALIDATION` (via `ACKNOWLEDGE → silence`).

```
SECOND_FAST_RESULT = CONTINUE_WITH_DEEP_VALIDATION
SECOND_TURN_DEEP_CALL_COUNT = 1
```

C'est exactement le cas que le §6 déclare conforme. Je n'ai pas forcé artificiellement une seconde
question.

## J. Escalade réelle

Tour 3, demande complète et directement exploitable — « Écris une checklist de 20 points pour
préparer un déménagement, groupée en quatre étapes chronologiques. » :

```
[FAST RÉEL] ACKNOWLEDGE 326 ms → fast_silent → deep_start
DEEP_CALLS=1   deep at=327 ms   fastResolvedAt=326 ms
```

```
ESCALATION_DEEP_CALL_COUNT = 1
DEEP_START_BEFORE_FAST_RESULT = NO
```

L'ordre est prouvé deux fois indépendamment : 450 > 449 au tour 2, 327 > 326 au tour 3. Une seule
escalade à chaque fois — ni zéro, ni deux.

## K. Fast failure

Non provoqué en runtime réel : faire échouer proprement un endpoint déployé exigerait soit de le
modifier, soit de couper le réseau — hors périmètre, et le §9 l'autorise explicitement.

```
FAST_FAILURE_FAIL_CLOSED_PRESERVED = TEST_ONLY
REAL_SMOKE_NOT_REQUIRED_FOR_FAILURE_PATH
```

La preuve automatisée existante est réutilisée, et elle couvre quatre formes d'échec :
`T-DN01-C` (exception réseau, HTTP 502, type hors énumération, texte vide), `T-DN01-D` (aucun
endpoint rapide), `T-P04-TRIGGER-3`, `T-P04-04`. Toutes vertes, toutes rendant `deepCalls = 1`.

## L. Saisie utilisateur

```
USER_INPUT_STABLE = YES
```

Champ de réponse à `""` d'un bout à l'autre des quatre tours, aucune question remplacée, aucune
réinitialisation observée.

Et le risque n'est pas seulement non survenu, il est devenu **inatteignable sur le chemin du
dialogue** : effacer une saisie exige une question affichée *puis* un second `oprieAsk` sur le même
tour. Au tour 1, la question est affichée et **aucun plan profond ne part** — il n'existe donc plus
rien qui puisse produire ce second appel. Le défaut identifié en 1D-J (`$('#v11-answer').value=''`)
subsiste dans le code mais n'est plus joignable par cette voie. `FOLLOW_UP_ONLY`.

## M. Modes

`ARCHITECTE` — mode réellement concerné, tours 1 à 3. Conforme.

`RAPIDE` — contrôle léger, tour 4, même demande G1 : `ASK_CLARIFICATION` en 427 ms, question
affichée, `DEEP_CALLS = 0`, marques identiques. **Aucune régression.** Le smoke n'a pas été étendu en
campagne multi-mode.

`ATELIER` — hors périmètre, non touché.

## N. Tests ciblés

`tests/fast-deep-trigger-dn01.test.mjs` + `tests/fast-frontend-integration-perf04.test.mjs` :
**67 tests, 0 échec.**

## O. Suite globale

**2996 / 2996 / 0**, un seul run — conformément au §12, aucune mutation n'ayant été faite.

## P. FROZEN

`PASS` — `{"status": "OK"}`, 7/7 plages gelées conformes.

## Q. Régressions

Aucune. Chaque observation du smoke est classée :

| observation | classe |
|---|---|
| G1 → `ASK_CLARIFICATION`, 0 appel profond | `EXPECTED_BEHAVIOR` |
| tour 2 → `ACKNOWLEDGE` puis escalade | `EXPECTED_BEHAVIOR` |
| `ACKNOWLEDGE` affirmatif non affiché | `EXPECTED_BEHAVIOR` (1D-G) |
| G1 à 573 ms contre 416–469 ms historiques | `EXTERNAL_PROVIDER_VARIANCE` — même ordre, contrat tenu |
| tour 3 → escalade unique, après le rapide | `EXPECTED_BEHAVIOR` |
| Rapide identique à Architecte | `EXPECTED_BEHAVIOR` |

`REAL_PRODUCT_REGRESSION = 0` · `TEST_BUG = 0` · `HARNESS_BUG = 0` · `STALE_FIXTURE = 0` ·
`UNKNOWN = 0`.

## R. Dette

Aucune dette créée : aucun fichier modifié, aucun test ajouté, aucune télémétrie permanente
introduite. La sentinelle et le script de smoke vivent hors du dépôt.

`FOLLOW_UP_ONLY`, inchangés depuis 1D-N : `TECHNICAL_STOP` non implémenté comme type Fast ;
`ACKNOWLEDGE` et `ORIENT_ARCHITECTE` hors contrat CDC §7 ; CDC §15 en retard sur la décision Rapide ;
`DEEP_CONFIRMS_FAST` et `fast_discarded_concluded` inatteignables depuis le pilote ; le défaut
d'effacement de saisie dans `oprieAsk`, désormais injoignable par le dialogue.

## S. Conclusion produit

Ce que le smoke montre, du point de vue de la personne qui utilise l'atelier : elle écrit une demande
contradictoire, et **573 millisecondes plus tard** on lui pose une question précise et unique. Rien
d'autre ne se produit — aucune chaîne de trois rôles ne part en arrière-plan pour tourner trente à
quatre-vingt-dix secondes avant d'être abandonnée dès qu'elle répond. Elle répond ; le plan rapide
constate qu'il n'a plus rien à demander ; l'autorité prend alors la main, une fois, pour préparer le
prompt.

C'est la mission du référentiel appliquée à la lettre : *comprendre, clarifier seulement si
nécessaire, puis construire*. Et c'est la règle de proportionnalité du garde-fou §9 rendue
observable — `DEEP = ESCALADE, PAS = CHEMIN RÉFLEXE`, mesuré à 0 appel quand une question suffit et à
1 appel quand le travail le mérite.

## T. Verdict

Le correctif 1D-N est confirmé en runtime réel, sur le fournisseur de production, avec quatre témoins
concordants pour le zéro appel profond : compteur du harnais, sentinelle, télémétrie du pilote, état
du pilote. L'ordre `Fast puis escalade` est prouvé deux fois à la milliseconde. Le contrat de
fluidité est tenu avec un facteur cinq de marge. Rapide ne régresse pas.

Une seule chose méritait d'être corrigée et ne l'a pas été, parce qu'elle n'existait pas : le rapport
1D-N ne portait pas de `PRODUCTION_CODE_CHANGED` erroné — le champ n'y figure pas, et la restitution
terminale disait bien `YES`.

`LOT_1D_N` est gelable. `LOT_1D_O` passe.
