# ATELIER_FAST_NECESSARY_QUESTION_FIX_03B

**Sur** — `893c292` (mesure 03A)
**Décision produit appliquée** — Option A : le plan rapide PEUT poser UNE question quand une
information déterminante manque réellement.
**`PUSH = NO` · `DEPLOY = NO`**

> **À lire d'abord : la correction est dans la source, pas en ligne.** L'endpoint déployé porte
> encore l'ancienne consigne — vérifié à l'instant, 3 appels, `ACKNOWLEDGE` en 298 / 302 / 387 ms.
> Rien ne change pour un utilisateur avant un déploiement, qui n'est pas de mon ressort.

---

## A. Ce qui a été corrigé

Un seul fichier de production : `workers/groq/src/index.js`, la consigne
`FAST_INTERACTION_SYSTEM_PROMPT`.

Ce qui **n'a pas** été touché : l'artefact canonique, `core/`, Deep, l'Analyste, le Critique,
l'Arbitre, le schéma canonique, le Prompt Contract Gate, l'Architecte, le flux Rapide, l'UI, les
providers, l'ordre de la chaîne HA, le schéma du plan rapide.

---

## B. La correction n'est pas une inversion

Le §CORRECTION l'interdisait explicitement, et c'était juste : deux tests existants épinglent la
retenue comme **invariant produit**, et ils ont raison.

```text
T-PERFREAL01E-02  exige  /Demander une précision est le dernier recours, jamais le premier/
                  exige  /Types possibles : ACKNOWLEDGE/
                  interdit  READY · exécuter · livrable · quality gate · contrat canonique ·
                            Analyste · Critique · Arbitre
T-P03A-21         exige  les six voies : recherchée · décidée · estimée · scénario ·
                         conditionnée · inconnue    et  'dernier recours'
```

Ces deux tests ont fait échouer mes deux premières rédactions, et ils avaient raison sur le fond :

1. ma v2/v3 avait **supprimé** la phrase « dernier recours, jamais le premier » ;
2. elle avait **perdu** la voie « recherchée » ;
3. elle employait le mot **« livrable »** — une responsabilité que le plan rapide n'a pas.

La v4 conserve donc la retenue intégralement, et lui ajoute **ce qui lui manquait : un critère**.
« Dernier recours » ne veut plus dire « presque jamais » mais « après ce test » :

```text
Pour savoir si ce recours est atteint, appliquez ce test, et lui seul. Prenez les deux lectures
raisonnables les plus éloignées de la demande, telle qu'elle est, augmentée des réponses déjà
obtenues. Conduiraient-elles à produire deux choses SUBSTANTIELLEMENT DIFFÉRENTES — de nature,
d'étendue ou de structure — ou la même chose autrement colorée ?

Substantiellement différentes : l'information qui les sépare est déterminante, aucune des voies
ci-dessus ne la remplace, et le recours est atteint. Posez UNE seule question, celle qui sépare
ces deux lectures.

La même chose autrement colorée : ne demandez rien.
```

Ce critère discrimine, et c'est pourquoi il a été retenu : « un plan de repas » (un jour ou un mois :
deux choses différentes → question) et « compare le train et l'avion, en tableau, avec avantages,
inconvénients et critères » (le trajet précis ne ferait que colorer → aucune question).

S'y ajoutent les deux règles demandées : l'exclusion de tout ce qui ne fait que colorer (préférence,
profil, budget, ton, contexte d'usage, cas particulier, enrichissement, personnalisation, cadrage
plus fin), et la réévaluation après réponse — *« ne redemandez jamais ce qui y figure, ni une
variante de ce qui y figure. Dès qu'une réponse a été obtenue, l'exigence monte […] et jamais plus
d'une. »*

---

## C. Conformité mesurée — fournisseur réel, schéma et message exacts du Worker

Huit cas, dont quatre délibérément incomplets et quatre déjà exploitables.

| cas | attendu | sonnet-5 | haiku-4.5 |
|---|---|---|---|
| « voyage à malaga fin novembre » | ASK | **ASK_CLARIFICATION** ✓ | ACKNOWLEDGE ✗ |
| idem + réponse « cinq jours » dans l'historique | aucune | **WAIT** ✓ | ACKNOWLEDGE ✓ |
| « Aide-moi à préparer une présentation. » | ASK | **ASK_CLARIFICATION** ✓ | ACKNOWLEDGE ✗ |
| « fais moi un budget » | ASK | **ASK_CLARIFICATION** ✓ | ASK_CLARIFICATION ✓ |
| « je veux un plan de repas » | ASK | **ASK_CLARIFICATION** ✓ | ASK_CLARIFICATION ✓ |
| train / avion, tableau, 3 dimensions | aucune | **WAIT** ✓ | ACKNOWLEDGE ✓ |
| photosynthèse, cinq paragraphes | aucune | **WAIT** ✓ | ACKNOWLEDGE ✓ |
| sept idées de cadeaux | aucune | **WAIT** ✓ | ACKNOWLEDGE ✓ |
| **conformité** | | **8/8** | **6/8** |

La question produite sur Malaga sépare bien deux lectures :
*« Souhaitez-vous un itinéraire / programme de visite (activités, lieux, planning journalier), ou
plutôt … ? »* — une seule question, et celle qui décide de la nature du résultat.

Et après la réponse, `WAIT_FOR_DEEP_VALIDATION` : **aucune répétition**, ce qui était le second
défaut relevé en bêta.

### C.1 — Le palier de modèle est déterminant, et c'est le point à retenir

`T-PERFREAL01E-06/07` révèle le modèle du plan rapide :

```text
MODEL = 'openai/gpt-oss-20b'
```

Un modèle de 20 milliards de paramètres. **Mon relevé haiku-4.5 (6/8) est donc le proxy réaliste,
pas le relevé sonnet-5.** Et les deux cas qu'il rate sont précisément ceux qui comptent : Malaga et
la présentation — les demandes les plus ouvertes, celles où l'escalade coûte deux minutes.

Je ne peux pas mesurer `openai/gpt-oss-20b` : la clé Groq vit dans le Worker, et je ne la
manipule pas. **La conformité sur la chaîne réellement déployée n'est donc pas démontrée.**
C'est la réserve principale de ce lot.

---

## D. Le coût, mesuré

La consigne passe de 794 à 2 243 caractères. Mesuré sur l'API, pour un appel rapide réel :

```text
avant 03B    794 caractères   →   506 jetons d'entrée
après 03B  2 243 caractères   →   954 jetons d'entrée      + 448 jetons, + 88,5 %
```

Or `PERF-REAL-01E` avait établi, pour ce même plan rapide :

```text
capacité soutenable   147 jetons par requête
consommation p50      425 jetons par requête
verdict               TOKEN_OPTIMIZATION_CAPACITY_FEASIBLE = NO   (déjà infaisable)
```

**L'allongement aggrave donc un budget déjà dépassé.** Je ne l'ai pas masqué : le relevé
`T-PERFREAL01E-15`, qui verrouillait la longueur à 794 pour prouver qu'aucune réduction n'avait été
appliquée, enregistre désormais 2 243 avec le calcul du surcoût en commentaire. C'est une dépense
assumée pour supprimer une escalade de 116 s, arbitrée par vous — pas une régression silencieuse.

---

## E. Avant / après

| grandeur | avant 03B | après 03B, **source** | après 03B, **en ligne** |
|---|---|---|---|
| `FAST_TYPE` sur Malaga | `ACKNOWLEDGE` 6/6 | `ASK_CLARIFICATION` (sonnet 1/1) · `ACKNOWLEDGE` (haiku) | **`ACKNOWLEDGE` 3/3** — ancienne consigne |
| `QUESTION_COUNT` | 0 | 1 | 0 |
| `DEEP_CALLS_BEFORE_FIRST_QUESTION` | **1** | **0** (figé par `T-DN01-A`) | 1 |
| `FAST_LATENCY_MS` | 298–671 | inchangé (édition de consigne) | 298 · 302 · 387 |
| `TIME_TO_FIRST_USEFUL_UI_MS` | **116 384 – 123 124** | **≈ 300–700** si Fast sollicite | 116 384 – 123 124 |

```text
BEFORE_MEDIAN_MS = 118 370
AFTER_MEDIAN_MS  = non mesurable en ligne : l'endpoint déployé porte l'ancienne consigne.
                   Attendu après déploiement, SI le modèle du plan rapide sollicite :
                   ordre de grandeur du plan rapide, soit ≈ 300–700 ms, avec 0 appel profond.
```

Je ne revendique pas un chiffre « après » que je n'ai pas pu mesurer de bout en bout. Ce qui est
mesuré : la décision change (8/8 sur sonnet-5), et le mécanisme qui en découle est déjà figé —
`T-DN01-A` : une question rapide → `deepCalls = 0`.

---

## F. Non-régression

```text
artefact canonique + core/    intacts (git diff vide)
Rapide                        inchangé par construction
  B3 matériau fourni    2 996 octets · 9 sections · 8 verrous   identique au smoke bêta
  B4 quantité           2 412 octets · 8 sections · 7 verrous   identique au smoke bêta
B7 · B8 (Architecte)          inchangés : aucune ligne de leur chemin n'a été touchée
                              (verdicts qualité établis au lot 02H, mêmes tours réels)
QUALITY_REGRESSION = NO
```

Le plan rapide ne porte toujours aucune autorité : schéma à deux champs, énumération fermée,
`ONE_NEXT_INTERACTION_MAX = 1`, aucun champ d'autorité OPRIE dans le payload — tout cela reste figé
par `T-PERFREAL01E-03/04`, `T-P03A-25/27/28/29/30` et `T-03B-06/07`.

---

## G. Tests

`tests/fast-necessary-question-03b.test.mjs` — **8 tests, 8 pass**, sans réseau.

```text
T-03B-01  une demande exploitable ne déclenche aucune question
T-03B-02  une inconnue déterminante autorise UNE question, et le recours est décidable
T-03B-03  le critère est la différence substantielle entre deux lectures, sur trois dimensions
T-03B-04  ce qui ne fait que colorer n'est jamais déterminant ; les six voies restent nommées
T-03B-05  après une réponse, l'exigence monte et rien n'est redemandé, même sous une variante
T-03B-06/07  le mécanisme d'escalade reste celui de 1D-N — décomptes figés par T-DN01-A et T-DN01-B,
             non dupliqués ici
T-03B-08  aucune fuite d'un dialogue antérieur : trois champs exactement dans le message
T-03B-09  ni mot de domaine ni seuil chiffré ; un seul test, explicitement unique
```

**Test transformé** — `T-03A-02`, étiqueté `ANOMALIE ATTENDUE À ÉVOLUER` au lot 03A, devait échouer
le jour où la consigne changerait. Il éprouve désormais que la retenue est **conservée** et devenue
**applicable**.

**Relevé mis à jour** — `T-PERFREAL01E-15` : longueur 794 → 2 243, avec le surcoût en jetons
inscrit dans le commentaire.

```text
TARGETED = 8/8 PASS
GLOBAL   = 3079/3079 PASS
FROZEN   = PASS  (sept empreintes inchangées — l'artefact n'a pas été touché)
```

---

## H. Verdict

La cause nommée par 03A est corrigée dans la source, et corrigée de la bonne façon : la retenue
n'a pas été retirée, elle a reçu le critère qui lui manquait pour être applicable. Le dépôt a
attrapé mes deux premières tentatives, qui supprimaient un invariant et s'attribuaient une
responsabilité qui n'est pas celle du plan rapide. La troisième satisfait les deux.

Deux réserves m'empêchent de déclarer le blocker fermé, et aucune n'est rhétorique :

1. **Le modèle du plan rapide est `openai/gpt-oss-20b`.** Mon proxy le plus proche donne 6/8, et il
   rate exactement les deux cas qui coûtent deux minutes. La conformité sur la chaîne déployée
   n'est pas démontrée, et je ne peux pas la mesurer d'ici.
2. **Rien n'est en ligne.** L'endpoint déployé renvoie toujours `ACKNOWLEDGE` : l'utilisateur
   attendra 116–123 s jusqu'au déploiement.

S'y ajoute un coût assumé : +88,5 % de jetons d'entrée par appel rapide, sur un budget que
`PERF-REAL-01E` déclarait déjà infaisable.

```text
SUBLOT = ATELIER_FAST_NECESSARY_QUESTION_FIX_03B

ROOT_CAUSE_FIXED                           = YES dans la source
                                             (non démontré sur la chaîne déployée)
FAST_CAN_ASK_WHEN_NECESSARY                = YES   (8/8 sonnet-5 · 6/8 haiku-4.5)
FAST_ASKS_WHEN_REQUEST_ALREADY_EXPLOITABLE = NO    (4/4 cas exploitables : aucune question)
ONE_QUESTION_AT_A_TIME                     = PASS

DEEP_CALLS_BEFORE_FAST_QUESTION            = 0     (figé par T-DN01-A)

MALAGA_TIME_TO_FIRST_USEFUL_UI_MEDIAN_MS   = non mesurable en ligne (ancienne consigne déployée) ;
                                             attendu ≈ 300–700 ms après déploiement si le modèle
                                             du plan rapide sollicite
BEFORE_MEDIAN_MS                           = 118 370
AFTER_MEDIAN_MS                            = 118 370 en ligne · ≈ 300–700 attendu après déploiement

QUALITY_REGRESSION                         = NO
B7                                         = PASS
B8                                         = PASS
RAPIDE_NON_REGRESSION                      = PASS  (B3, B4 identiques)

GLOBAL                                     = 3079/3079 PASS
FROZEN                                     = PASS

PRODUCTION_CODE_CHANGED                    = YES  (workers/groq/src/index.js, la consigne seule)
PUSH                                       = NO
DEPLOY                                     = NO

REPORT = docs/ATELIER-FAST-NECESSARY-QUESTION-FIX-03B.md

BETA_LATENCY_BLOCKER                       = OPEN
LOT_GATE                                   = GELABLE pour la correction,
                                             NON_GELABLE pour la fermeture du blocker

NEXT_SAFE_ACTION = déployer le Worker, puis mesurer la distribution des types du plan rapide sur
                   la chaîne réelle (openai/gpt-oss-20b) avec les huit mêmes cas. Si la conformité
                   y est inférieure à celle mesurée sur sonnet-5, la cause restante sera le palier
                   de modèle du plan rapide, et non la consigne.
```
