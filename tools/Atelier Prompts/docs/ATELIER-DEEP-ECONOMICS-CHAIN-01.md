# ATELIER-DEEP-ECONOMICS-CHAIN-01 — La chaîne économique du Deep, lue d'un bout à l'autre

Index de publication. **Aucun appel API. Aucun code de production modifié par ce document.**

Cinq lots, écrits dans cet ordre, forment **un seul fil de décision**. Publiés ensemble parce
qu'aucun ne se lit seul : le quatrième recommande ce que le cinquième rejette, et le troisième
n'a de valeur que rapporté au premier. Les commits restent distincts ; ce document ne réécrit
aucun raisonnement, il en donne l'ordre et l'état.

---

## Le fil

| # | Lot | Question posée | Ce qui en sort |
| --- | --- | --- | --- |
| 1 | `ATELIER-DEEP-EFFICIENCY-ECONOMICS-01` | Pourquoi le Deep coûte-t-il ce qu'il coûte ? | Le Deep part parce qu'un message arrive, pas parce qu'il faut |
| 2 | `ATELIER-INTERMEDIATE-DEEP-VALUE-01` | Peut-on sauter un étage ? | **NON** — aucune frontière structurelle sûre pour écarter Critique ou Arbitre |
| 3 | `ATELIER-DEEP-TURN-AMORTIZATION-01` | Peut-on réutiliser d'un tour à l'autre ? | **NON** pour les sorties de rôle. Mais l'énoncé du contrat est repayé à chaque appel |
| 4 | `ATELIER-LLM-ARCHITECTURE-SURGEON-01` | Le modèle a-t-il jamais été choisi ? | **NON, hérité d'un smoke.** Recommande A1+ (tout-Haiku + cache) — **RECOMMANDATION RÉFUTÉE, voir 5** |
| 5 | `DEEP-HAIKU-FIT-01` | Haiku suffit-il ? | **NON** — 45 appels réels. Haiku échoue sur le contrat de sortie, pas sur le sens |

## L'état à la publication

| Question | État |
| --- | --- |
| Saut d'étage Deep | **REJETÉ** (lot 2) |
| Mode Deep intermédiaire | **NE PAS CRÉER** (lot 2) |
| Réutilisation Analyste / Critique / Arbitre | **REJETÉE** (lot 3) |
| Substitution Haiku | **REJETÉE par campagne réelle** (lot 5) |
| `DEEP_MODEL_FINAL` | **`claude-sonnet-4-6`, inchangé** |
| `RELEASE_GATE_AUTHORIZED` | **NO** (lot 5, § 27 : pas de verdict PASS) |
| `OPRIE_AUTHORITY_PRESERVED` | **YES** — sur toute la chaîne, aucun lot n'y touche |

## Ce que la chaîne a prouvé, et qui ne dépend d'aucun modèle

Le résultat le plus solide n'est pas économique. Sous un modèle qui mettait le contrat de sortie
en défaut sept fois sur quatorze, **aucun défaut n'a produit un mauvais état** : ils ont tous
produit *aucun* état. Les validateurs déterministes, indépendants du modèle, ont refusé chaque
sortie non conforme, sans exception. `FALSE_READY_COUNT = 0`.

La protection ne vient pas de la puissance du modèle. C'est ce que le lot 4 § M avançait, et
c'est ce que le lot 5 a vérifié contre un adversaire réel.

## Ce qui reste ouvert, et n'est entrepris par aucun de ces cinq lots

1. **Un rejet `exactKeys` de `validateCriticOutput` sort en HTTP 502 sans état sémantique.**
   Ni éligible au failover, ni éligible à la dégradation. Branche nommée et laissée ouverte par
   `OPRIE-CRITIC-B01B-FAILURE-CLASSIFICATION-01`. Inoffensive aujourd'hui parce que Sonnet 4.6 ne
   la déclenche pas — **c'est une dépendance au modèle, pas une propriété du système.**
2. **Les plafonds internes sont calibrés sur la verbosité d'un modèle nommé** : 1 600 pour les
   batches de revue de substitution, 2 048 pour le Critique global, 4 096 pour les rôles. Tout
   changement de modèle les remet en jeu.
3. **`confirmation_required` n'est mesurable sur aucun modèle**, faute de fixture
   (`CORPUS_COVERAGE_GAP = YES`, `OPRIE-REFERENCE-ORACLE-01` § D). Trou antérieur à la chaîne.
4. **Le tarif et le TTL du cache de préfixe** conditionnent toute la valeur du lot 3. Le lot 3 ne
   les avait pas vérifiés et le disait.

## Les deux pistes qui survivent à la chaîne

Aucune ne demande de changer de modèle, ni de toucher à un prompt, un schéma, un rôle, un routage
ou une autorité :

- **Streaming de progression par étage.** Les événements `operational_request_role_ok` existent
  déjà côté serveur. Risque nul, traite le grief des 20 à 92 secondes perçues.
- **Cache de préfixe fournisseur.** Le modèle reçoit exactement les mêmes octets ; l'invalidation
  est littérale — si un prompt change d'un caractère, la clé change et le cache est manqué.

Elles restent disponibles. **Ce document ne les entreprend pas.**
