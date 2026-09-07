# DEEP-HAIKU-FIT-01 — Haiku n'échoue pas sur le sens, il échoue sur le contrat de sortie

Une seule variable a changé : `claude-sonnet-4-6` → `claude-haiku-4-5-20251001`. Aucun prompt,
aucun schéma, aucun validateur, aucun plafond, aucun cache, aucun rôle, aucun fichier de production.

`ALL_HAIKU_VERDICT = ALL_HAIKU_FAIL_MULTIPLE_ROLES`

---

## A. Le résultat en une ligne

**Haiku raisonne juste et rend rarement une structure complète.** Sur les quatre tours qu'il a
réellement gouvernés, il a rendu exactement l'état que Sonnet rend — y compris sur le cas
éliminatoire du faux READY. Sur les quatre autres, il n'a pas rendu d'état du tout : deux
`degraded_state` et **deux tours terminés en HTTP 502 sans aucun état OPRIE**, sur des cas où Sonnet
est gouverné 60 fois sur 60 et 10 fois sur 10.

| | Sonnet (baseline déjà payée) | Haiku (ce lot) |
| --- | --- | --- |
| Tours gouvernés | 8 / 8 | **4 / 8** |
| `degraded_state` | 0 | 2 |
| Aucun état OPRIE (502) | 0 | **2** |
| Faux READY | 0 | **0** |
| Valeur inventée | 0 | **0** |
| Valeur du livrable recopiée dans le candidat | 0 / 60 | **1 / 1** |
| Latence médiane, tours gouvernés | 20 809 ms (matériau) · 91 694 ms (ouvert) | **20 160 ms** |
| Jetons d'entrée médians / tour | 13 081 | 13 674 (+4,5 %) |
| Jetons de sortie médians / tour | 1 193 | **2 275 (×1,91)** |
| Coût médian / tour | 0,057 $ | **0,025 $ (−56 %)** |

La latence est meilleure. Le coût est meilleur — moins que promis, mais meilleur. **Ce n'est pas ce
qui fait échouer le lot.** Ce qui le fait échouer, c'est que le système ne produit plus d'état
sémantique un tour sur deux.

---

## B. Ce qui a été mesuré, et comment

**8 cas**, couvrant les huit obligations du § 9, chacun traversant le système réel :
Analyste Haiku → Critique Haiku (global + batches) → Arbitre Haiku → validateurs → OPRIE.
**45 appels API, 0,4410 $**, sous le plafond de 0,50 $. **Zéro tour Sonnet rejoué** (§ 23) : les
baselines sont celles de `deep-anthropic-acceptance-01`, `oprie-arbiter-material-context-delivery-01`
et `deep-production-blockers-01`.

**Le modèle a été substitué dans un intercepteur de `fetch` propre au banc**, pas dans le dépôt : le
corps de requête sortant est identique octet pour octet, au seul champ `model` près.
`PRODUCTION_CODE_CHANGED = NO`. Cette méthode se prouve elle-même : chaque appel journalisé porte le
modèle demandé par le code (`claude-sonnet-4-6`) et le modèle réellement appelé
(`claude-haiku-4-5-20251001`).

**Identifiant vérifié, jamais inventé** : `GET /v1/models/claude-haiku-4-5` et
`GET /v1/models/claude-haiku-4-5-20251001` renvoient tous deux
`id = claude-haiku-4-5-20251001`, `max_input_tokens = 200 000`, `max_tokens = 64 000`. Les deux
plafonds couvrent largement les besoins d'Atelier (13 000 en entrée, 4 096 demandés en sortie).

**Tarifs relus le jour de la mesure** sur `platform.claude.com/docs/en/about-claude/pricing`, jamais
repris de Studio Clinique : Haiku 4.5 **1,00 $ / 5,00 $** par million, Sonnet 4.6 **3,00 $ /
15,00 $**. Contrôle de cohérence : 13 081 × 3 + 1 193 × 15 = 0,0571 $, soit exactement le 0,057 $
de la baseline.

**`CASE 9` (confirmation_required) n'est pas couvert** — aucune fixture du corpus ne déclenche cet
état (`CORPUS_COVERAGE_GAP = YES`, OPRIE-REFERENCE-ORACLE-01 § D). Aucun cas n'a été fabriqué pour
combler ce trou. La fitness de Haiku sur `confirmation_required` reste donc **inconnue**, et c'est
une limite de ce lot, pas une omission.

---

## C. Les trois défauts critiques

### C.1 Le Critique global n'émet pas les champs que son propre schéma déclare requis

**Sept appels de Critique global sur quatorze** ont rendu une structure incomplète — six avec la liste de clés capturée, le septième (la toute première amorce du harnais) identifié par le même message de rejet. Le pire, sur le
cas nominal matériau, n'a rendu **qu'une clé sur sept** :

```
attendu : operational_request_candidate_review, vetoes, semantic_drift_detected,
          semantic_drift_notes, significant_stakes, significant_stakes_reason,
          question_substitution_review
C5 rendu : operational_request_candidate_review
C1, C6   : `vetoes` manquant
```

Reproduit **trois fois sur trois** sur C5, **deux fois sur deux** sur C6 — aux jetons près identiques
(22 595 / 4 960 les deux fois). Ce n'est pas une fluctuation ; `temperature` vaut 0.

**Et voilà ce que ça déclenche chez nous.** `validateCriticOutput` → `exactKeys` → `TypeError` non
étiquetée → `failureClassOf` rend `programming_error` → **non éligible au failover** *et* non
éligible à la dégradation → `provider_ha_fail_closed` → l'exception remonte hors de l'orchestrateur,
qui ne la reconnaît pas comme une chaîne épuisée → **HTTP 502, `semantic_state = null`**.

Ni READY, ni clarification, ni `degraded_state`. **Aucun état OPRIE.**

C'est exactement la branche que OPRIE-CRITIC-B01B-FAILURE-CLASSIFICATION-01 avait nommée et laissée
ouverte : *« la question plus large des autres rejets de `validateCriticOutput` reste ouverte et non
tranchée ici »*. Sous Sonnet elle ne se déclenchait pas. Sous Haiku elle devient le chemin nominal.
**Le défaut de sortie est au modèle ; le défaut de classification est à nous.** Ce lot ne corrige ni
l'un ni l'autre.

### C.2 La revue de substitution se fait tronquer par un plafond calibré sur Sonnet

Sur C1, un batch de revue de substitution sort à **1 600 jetons exactement, `stop_reason =
max_tokens`**, aucune clé exploitable. Déterministe : deux tours sur deux, mêmes jetons.

Le plafond de batch est 1 600. Sur C6, les batches sortent à 1 441 et 1 487 — sous le plafond, mais
de peu. `GROQ_CRITIC_CAPABILITY` a été calibré sur la verbosité **mesurée de Sonnet** (maximum
observé 1 401). Haiku produit ~1,9 fois plus.

Ce qui se perd n'est pas décoratif : **la revue de substitution EST la garantie « QUESTIONNER =
dernier recours »**. La perdre par troncature, précisément sur la population où l'Analyste veut
poser des questions, retire la protection au moment où elle sert. Le tour dégrade proprement — mais
Sonnet, lui, rend READY sur ce cas.

§ 12 interdit d'adapter un prompt à Haiku, § 14 interdit de baisser un plafond. **Constaté, pas
corrigé.**

### C.3 Le candidat porte la valeur du livrable, et le tour est déclaré READY dessus

Sur C7 — matériau transmis, un tour de clarification répondu — l'Analyste écrit :

```
available_inputs = ["Le numéro de dossier présent dans le matériau transmis (NUMERO_DOSSIER = ZX-4821)"]
```

L'Arbitre reprend la ligne à l'identique et prononce `operational_request_ready`.

Le contrat de l'Analyste est explicite : *« consignez dans `available_inputs` l'INTRANT dont
l'exécution aura besoin […] DÉCRIT et jamais recopié — « le numéro de dossier, présent dans le
matériau transmis », jamais sa valeur »*. Et le livrable demandé **est** ce numéro. Le plan profond
a donc exécuté la demande au lieu de la préparer.

C'est le défaut précis que OPRIE-INPUT-AVAILABILITY-FIELD-01 et
OPRIE-EXPECTED-DELIVERABLE-SEMANTICS-01 ont fermé, et il rouvre avec le modèle. Baseline Sonnet :
**valeur recopiée 0 / 30 puis 0 / 30**.

**Ce n'est pas comptabilisé comme faux READY** : sur cette fixture Sonnet rend READY lui aussi.
Ce qui diverge est le contenu du candidat, pas l'état — et aucun étage ne l'a relevé.
`FALSE_READY_COUNT = 0` reste vrai, et n'est pas la bonne nouvelle qu'il paraît.

---

## D. Ce qui a tenu, et qu'il faut dire

Rien de ce qui suit n'annule le verdict, mais tout y appartient.

| Protection | Verdict |
| --- | --- |
| **Cas éliminatoire du faux READY** (matériau annoncé, contenu inaccessible) | **TENUE** — `clarification_required`, 0 READY, 0 valeur inventée, 0 provenance matériau, question juste |
| Six familles de substitution | TENUE quand le Critique répond — C4 : 2 cibles, `question_is_last_resort = true`, `illegitimate_question_found = []` |
| Frontière B-01B | TENUE — aucune issue portée en question sans `impact = material` |
| Veto qualifié | TENUE — C8 : veto fondé, `disagree`, `significant_stakes = true`, sur la contradiction réelle entre matériau disponible et fait absent |
| Aucun READY fabriqué sur une chaîne en échec | TENUE — fail-closed partout |
| Provenance à trois origines | TENUE sur C7 : `explicit_user_statement`, `clarification_answer`, `user_provided_material`, sans contamination |
| Autorité d'OPRIE | **INTACTE** — aucune décision d'état hors de l'Arbitre ; les validateurs déterministes ont refusé chaque sortie non conforme, sans exception |

**Le point le plus important du lot est peut-être celui-là.** Aucun défaut n'a produit un mauvais
état : ils ont tous produit *aucun* état. Les validateurs, indépendants du modèle, ont fait
exactement ce que OPRIE-QUALITY-PARITY-01 et ATELIER-LLM-ARCHITECTURE-SURGEON-01 § M prédisaient —
la protection ne vient pas de la puissance du modèle. Elle a tenu contre un modèle qui la mettait
en défaut sept fois sur quatorze.

---

## E. Latence et coût : ce que ça aurait rapporté

**Latence.** Sur les tours gouvernés : médiane **20 160 ms**, dont **15 232 ms** sur le cas matériau
(Sonnet 20 809) et **21 613 / 39 423 ms** sur la population ouverte (Sonnet 91 694). Par étage,
médianes : Analyste 7 841 ms, Critique 6 351 ms, Arbitre 7 681 ms.
`LATENCY_IMPROVEMENT = YES`, très nettement sur la population qui portait les 92 secondes.

*Avertissement de lecture* : un tour interrompu s'abrège. La médiane des huit tours (23 117 ms)
mélange des tours complets et des tours coupés, et ne veut rien dire. Aucun p95 n'est annoncé —
8 cas ne le portent pas (§ 19).

**Coût.** 13 674 jetons d'entrée et 2 275 de sortie par tour → **0,02505 $**, contre 0,057 $ :
**−56 %**. L'hypothèse de −67 % (A1) et de −87 % (A1+) **n'est pas confirmée** : elle supposait un
volume de sortie identique à celui de Sonnet. Il est presque doublé.

**Et l'entrée, elle, est bien comparable.** Haiku 4.5 et Sonnet 4.6 partagent le tokenizer antérieur
— le nouveau commence à Claude 4.7. Mesure : 13 674 contre 13 081, +4,5 %. Les comptes de jetons de
ce lot et ceux de la baseline sont donc directement comparables, et le doublement de la sortie est
une propriété du modèle, pas un artefact de comptage.

---

## F. Rôle en défaut

| Rôle | Sorties structurées valides | Divergence sémantique | Verdict |
| --- | --- | --- | --- |
| **Analyste** | 14 / 14 — jamais une clé manquante | 1 CRITICAL (C.3), 2 MATERIAL sur `available_inputs` | en défaut sur le sens, pas sur la forme |
| **Critique** | **7 globals incomplets sur 14, plus 2 batchs tronqués sur 10** | aucune quand il répond | **principal responsable** |
| **Arbitre** | 5 / 7 — `reason` omis deux fois | aucune | en défaut sur la forme, fail-closed correct |

`FAILING_ROLE = critic, arbiter, analyst` → **multiple**.

**§ 25 s'applique : on s'arrête ici.** Aucun système hybride n'est proposé, aucune escalade Sonnet,
aucun routeur, aucun retry. Le § 26 ne s'applique pas — Haiku ne passe pas.

**Et l'hybride A3 n'est pas la réponse évidente qu'il paraît.** A3 (Analyste et Critique en Haiku,
Arbitre en Sonnet) supposait que l'Arbitre serait le point faible. C'est le **Critique** qui l'est,
et A3 le laisse en Haiku. La lecture de S/T du lot précédent — *« échec sur l'Arbitre seul → A3, et
seulement alors »* — n'est donc pas déclenchée.

---

## G. Ce que ce lot laisse ouvert, sans y toucher

Trois constats qui appartiennent au propriétaire, pas à ce lot :

1. **Un rejet `exactKeys` de `validateCriticOutput` sort en 502 sans état sémantique.** Branche
   nommée et laissée ouverte par OPRIE-CRITIC-B01B-FAILURE-CLASSIFICATION-01. Elle est aujourd'hui
   inoffensive parce que Sonnet ne la déclenche pas — c'est une dépendance au modèle, pas une
   propriété du système. **Un défaut de robustesse réel, indépendant de la question Haiku.**
2. **Les plafonds internes sont calibrés sur la verbosité d'un modèle nommé.** 1 600 pour les
   batches, 2 048 pour le Critique global, 4 096 pour les rôles. Tout changement de modèle les
   remet en jeu.
3. **`confirmation_required` n'est mesurable sur aucun modèle**, faute de fixture. Le trou est
   antérieur à ce lot et le dépasse.

**GLOBAL n'était pas au vert au checkpoint.** `T-HTMLFINAL02-10` échoue à `ca6fa4d` :
`docs/RELEASE-MANIFEST.md` annonce 68 fichiers, l'inventaire en compte **72**. Dérive laissée par
les quatre commits documentaires précédents, worktree propre, sans rapport avec ce lot. Le manifeste
**n'a pas été régénéré ici** — hors périmètre, et le régénérer masquerait la dérive au lieu de la
signaler. Les artefacts de ce lot n'entrent pas dans le jeu de release : l'inventaire vaut 72 avant
et après. `2946 / 2947` dans les deux cas. `FROZEN = OK`, 7 empreintes inchangées.

---

## H. Décision

`DEEP_MODEL_FINAL = claude-sonnet-4-6` — **inchangé**. Le § 27 conditionne la modification
canonique à un verdict PASS ; il n'y en a pas. Aucune ligne de production n'a bougé.

`RELEASE_GATE_AUTHORIZED = NO` · `NEXT_SAFE_ACTION = STOP — OWNER DECISION`

Ce qui reste vrai du lot précédent : le Deep coûte cher parce qu'il **refacture 97 % d'entrée
constante**, et l'utilisateur attend parce qu'**il ne voit rien pendant 20 à 92 secondes**. Le cache
de préfixe et le streaming de progression n'ont besoin d'aucun changement de modèle, ne touchent
aucune autorité, et ce lot vient de montrer qu'ils ne dépendent pas de Haiku. Ils restent
disponibles ; ce document ne les entreprend pas.
