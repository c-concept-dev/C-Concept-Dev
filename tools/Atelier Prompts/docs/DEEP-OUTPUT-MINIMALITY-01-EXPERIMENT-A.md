# DEEP-OUTPUT-MINIMALITY-01 — Expérience A

> Le champ était bien mort, et il est retiré proprement.
> Mais la balance sur laquelle on devait le peser mesurait un autre modèle.

**`SEMANTIC_PASS_PERFORMANCE_UNMEASURED`.** `SEMANTIC_PASS = YES` · `PERFORMANCE_PASS = NOT_MEASURED`
· `PERFORMANCE_CLAIM = NONE`. 0 appel API, 0 USD.

> **Décision propriétaire du 2026-09-07.** Le budget API n'est pas relevé ; la modification n'est pas
> annulée ; elle est **préservée par un commit local explicite**, et **aucune affirmation de gain**
> — ni ≥ 20 %, ni latence, ni coût, ni jetons Sonnet — n'est faite. La règle « commit seulement si
> performance PASS » est levée pour ce seul checkpoint. Le blocage ne portait que sur la mesure
> live ; la simplification structurelle, elle, est acceptée.

## 1. L'audit est confirmé

`candidate_action` n'était lu par personne.

`evaluateSubstitutionCandidateGate` lit exactement six champs — `applicable`, `justification`,
`requires_user_reserved_choice`, `preserves_objective`, `contradicts_known_facts`,
`produces_complete_deliverable`. `candidate_action` n'en fait pas partie.
`materializeSubstitutionReviewFromCandidates` ne retient ensuite que `justification` et le verdict
du gate, puis rend `{alternatives_reviewed, available_alternative}` — où `candidate_action`
n'apparaît jamais.

Le champ était **exigé du modèle, validé structurellement, puis jeté**.

`CANDIDATE_ACTION_RUNTIME_CONSUMERS_BEFORE = 0`. `PERSISTED_DOWNSTREAM_COUNT = 0`.

## 2. La modification

Une seule variable. Prompt (exemple JSON des six familles, gabarit du fan-out, phrase de définition,
énumération des clés exactes), schéma, et `SUBSTITUTION_CANDIDATE_FIELDS`. Plus la prose devenue
fausse — « sept champs » devient « six ».

Les constantes dérivées ont suivi **d'elles-mêmes**, comme le contrat le prévoit
(« si le contrat change de forme, le coût suit automatiquement ») :

| | avant | après |
|---|---|---|
| clés par candidate | 7 | **6** |
| champs lus par le Gate | 6 | **6** — inchangé, c'est tout le propos |
| `per_target_output_units` | 1 260 | 1 080 |
| plafond effectif du batch | 1 600 | 1 375 |
| `maxAnswerableTargetsPerBatch` | 1 | **1 — cardinalité inchangée** |

`GLOBAL` **2965/2965** trois fois. `FROZEN` OK. `SECRET_SCAN` OK. Tous les invariants PASS.

Deux tests de lots antérieurs ont été adaptés : `XB-5` (liste des clés attendues, 7 → 6) et
`CSR01-ROOT-b` (constante 7 → 6 ; la ligne de **dérivation**, qui est ce que ce test garde vraiment,
est intacte). Plus le réalignement mécanique de l'empreinte HTML dans 15 fichiers — même rituel que
B-01B, CPT-01, UAF-02 et DOR-01.

## 3. Ce qui bloque la mesure

La seule trace **par fixture** qui existait — `evaluation/deep-cout-jetons-01`, d'où viennent Q01,
Q02, Q07, Q08, A01 et A02 — n'a pas été produite par le Deep de production :

```
inventaire.ordre_fournisseur_des_roles : [groq, anthropic, openai]
inventaire.{analyst,critic,arbiter}.modele_groq : openai/gpt-oss-20b
tours[0].jetons_par_fournisseur : { groq: 8724, anthropic: 0, openai: 0 }
```

Comparer une exécution candidate sur Sonnet à cette baseline attribuerait à la suppression de
`candidate_action` tout ce qui n'est qu'une différence de modèle. L'expérience serait fatalement
confondue.

La seule baseline Sonnet réelle — `deep-production-blockers-01/paired-latency.json` — est agrégée
**par population**, jamais par fixture, et ne sépare pas, dans les 1 066 jetons du Critique, la part
de l'appel global de celle des batches. Or c'est exactement cette part-là qu'il faut mesurer.

La baseline doit donc être rejouée sur Sonnet — ce que le §11 espérait éviter — et le coût double :

| expérience | coût estimé | plafond 0,30 USD |
|---|---|---|
| §12 nominal, 6 cas avant/après | ~1,22 USD | ×4 |
| 4 clarifications lentes | ~0,82 USD | ×2,7 |
| 2 fixtures avant/après | ~0,41 USD | dépassé |
| 2 fixtures légères type Q01 | ~0,24 USD | tient, mais 2 batches seulement |

`§13` impose alors STOP et décision propriétaire. Je n'ai lancé aucun appel.

## 4. Correction d'un lot antérieur

Cette découverte oblige à corriger DEEP-INTERACTION-LATENCY-01, qui a présenté ces 12 tours comme
des mesures du Deep de production. Ils ne le sont pas.

**Ce qui tient toujours**, parce que lu dans le code ou confirmé sur données Sonnet :

- appels de Critique = 1 + nombre d'issues `material`+`question` ;
- cardinalité de batch à 1, dérivée du contrat ;
- revues strictement auto-contenues, donc early-stop logiquement sûr ;
- latence proportionnelle aux jetons de sortie — 18,9 / 20,6 / 22,6 ms par jeton selon la population,
  mesuré sur Anthropic ;
- clarification ouverte Sonnet, p50 = 91 694 ms.

**Ce qui ne tient pas comme fait Sonnet** :

- la queue à 218 s et les 13 appels de Critique ;
- les coûts par tour en USD listés pour Q01/Q02/Q07/Q08/A01/A02 ;
- les projections d'early-stop chiffrées à partir de ces tours ;
- et surtout **la part du Critique à 52–86 % de la sortie**.

Ce dernier point change la carte. Sur Sonnet, un tour de clarification se répartit ainsi :

| étage | part de la sortie |
|---|---|
| Analyste | 32,1 % |
| Critique | **25,5 %** |
| Arbitre | **42,4 %** |

Le Critique n'est pas le premier écrivain du tour. **L'Arbitre l'est.** Le levier que cette
expérience actionne est donc plus petit qu'annoncé, et il n'est pas le principal.

## 5. EVIDENCE_CORRECTION

Le détail complet est dans `evaluation/deep-output-minimality-01-experiment-a/evidence-correction.json`,
et les artefacts concernés portent désormais le marqueur `INVALID_FOR_SONNET_ROLE_DISTRIBUTION`.
**Rien n'a été supprimé ni réécrit** : les valeurs d'origine restent en place, marquées.

**Mal attribué** — les 12 fixtures de `deep-cout-jetons-01` (R01…Q08, A01, A02), lues comme des
mesures du Deep alors qu'elles ont été produites sur `groq` / `openai/gpt-oss-20b`. L'erreur est de
lecture, pas de mesure : ce lot-là n'a jamais prétendu mesurer Sonnet, et son propre inventaire le
disait.

**Reste établi** — appels Critique = 1 global + issues `material`+`question` (lu dans le code) ;
cardinalité de batch = 1 ; `ANALYST_ISSUE_INFLATION` confirmé structurellement ;
`CRITIC_BATCH_MULTIPLICATION` confirmé comme mécanisme ; `EARLY_STOP_SAFE = YES` par preuve
contractuelle ; latence Sonnet corrélée aux jetons de sortie ; clarification ouverte Sonnet
p50 ≈ 91,7 s ; capacité fournisseur écartée sur la population Anthropic.

**Retiré comme preuve Sonnet** — la répartition par rôle issue des fixtures Groq, les coûts par tour,
les 13 appels et la queue à 218 s comme mesures runtime Sonnet, et toute projection présentée comme
une mesure réelle.

**Donnée Sonnet valide** — `deep-production-blockers-01/paired-latency.json`, dont
`comparability.json` établit axe par axe `fournisseur = anthropic`, `modèle = claude-sonnet-4-6`
pour les deux campagnes. Provenance : **PROVEN**.

| étage | jetons de sortie p50 | part |
|---|---|---|
| Analyste | 1 340 | ≈ 32,1 % |
| Critique | 1 066 | ≈ 25,5 % |
| **Arbitre** | **1 774** | **≈ 42,4 %** |

**Réserve méthodologique explicite** : ce sont des rapports de **médianes par étage**, jamais des
moyennes de parts par tour. `paired-latency.json` n'agrège que min/p50/p95/max et
`control-runs.jsonl` ne porte aucun compte de jetons — **aucune donnée Sonnet par tour n'existe dans
le dépôt**. La somme 4 180 est une somme de médianes, pas un total mesuré. Ces parts sont un ordre de
grandeur défendable, pas une mesure exacte. Ce qui ne dépend pas du mode d'agrégation, en revanche :
**l'Arbitre produit plus de sortie que le Critique** sur la population ouverte.

## 6. Décision propriétaire appliquée

~~1. Relever le budget~~ — **refusé.**  à ~0,45 USD pour une expérience avant/après honnête sur 2 fixtures Sonnet
   portant des batches — ou l'autoriser à ~0,85 USD pour les 4 clarifications lentes, seul format
   qui donnerait une médiane défendable.
**2. Accepter la modification sur ses seules garanties structurelles — RETENU.** : le champ n'était lu par
   personne, la suite est verte, le contrat de sortie maigrit d'un septième. Sans mesure, on ne
   pourra pas prononcer le `≥ 20 %` du §17 — le lot resterait `SEMANTIC_PASS`, performance non
   établie.
~~3. Annuler~~ — **refusé.**  la modification et la remettre en réserve.

Le propriétaire a tranché : budget non relevé, modification conservée, commit exceptionnel
autorisé, **aucune revendication de performance**. Le levier reste par ailleurs secondaire — sur
Sonnet, c'est l'Arbitre qui écrit le plus.

`NEXT_SAFE_ACTION = DEEP OUTPUT MINIMALITY — TARGET THE TRUE SONNET OUTPUT DRIVERS`
