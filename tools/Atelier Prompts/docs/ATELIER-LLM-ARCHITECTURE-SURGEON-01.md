# ATELIER-LLM-ARCHITECTURE-SURGEON-01 — Le modèle n'a jamais été choisi, il a été hérité

Analyse seule. **Aucun appel API. Aucun code modifié.**

---

## A. Diagnostic exécutif

Trois constats, dans l'ordre de leur importance.

**1. Sonnet n'a jamais été comparé à quoi que ce soit pour les rôles profonds.** Le commentaire qui
l'introduit dit exactement pourquoi il est là : *« Choisi à la place de claude-sonnet-5 pour le
premier smoke de parité /decision : modèle antérieur documenté, réduisant les variables
expérimentales »*. Il a été retenu pour **un smoke de la route `/decision`**, puis les rôles OPRIE
l'ont hérité. Aucun lot n'a jamais posé la question « Haiku suffirait-il ? ».

**2. Le pipeline à trois rôles est un choix d'architecture qui a fait ses preuves, pas un invariant
produit.** Sa valeur est démontrée ; sa *nécessité sous cette forme* ne l'est pas.

**3. Le gaspillage principal n'est pas le nombre d'étages — c'est le volume.** 97 % de l'entrée est
immuable et refacturée à chaque appel ; et sur les demandes ouvertes, les sorties internes triplent
et emportent la latence avec elles (×4,41 de latence pour ×3,68 de sortie, déjà établi).

`CURRENT_ARCHITECTURE_OVERENGINEERED = PARTIALLY` — pas dans sa structure, dans son dimensionnement.

---

## B. Audit Studio Clinique

| | Studio Clinique | Atelier |
| --- | --- | --- |
| Haiku | **9 appels** : clarity gate, planification, rerank, enrichissement, résumé de session | **aucun** |
| Sonnet | 7 appels, dont la génération utilisateur (`max_tokens: 8000`, `stream: true`) | **tous les rôles** |
| `max_tokens` internes | **200 à 800** — *« un accusé court n'a jamais besoin de 4000 »* | **4096** partout |
| Streaming | oui, sur le livrable | non |
| `Promise.all` | 10 usages | `runBounded` sur les batches Critic (déjà présent) |
| `temperature: 0` | sur les étapes structurées | partout (déjà) |

**Principes transférables :** dimensionner le modèle à la tâche ; réserver le gros modèle à ce que
l'utilisateur lit ; borner `max_tokens` par étape ; streamer ce qui est long.

**À ne surtout pas copier.** Le repli de planification de Studio Clinique route par mots-clés :
`_q.includes('excel')`, `'cours'`, `'fiche'`, `'tableau'`. C'est exactement ce qu'Atelier interdit,
et c'est aussi ce qui le rend non universel. Son résumé de session par Haiku est également
inadapté : Atelier exige lineage et provenance, un résumé génératif ne peut pas en tenir lieu.

---

## C, D. Audit de complexité et de dimensionnement

Ce qui n'est **pas** surdimensionné : le nombre d'étages (valeur démontrée), la concurrence des
batches (déjà bornée), `temperature 0`, l'absence de cache applicatif.

Ce qui l'est : **le modèle** (hérité d'un smoke), **le plafond de sortie uniforme** (4096 pour trois
rôles dont les besoins mesurés sont 1852 / 1401 / 2805), et **la verbosité contractuelle** des rôles
internes.

---

## E. Ajustement Haiku, rôle par rôle

| Rôle | Nature réelle de la tâche | Protection déjà en place | Verdict |
| --- | --- | --- | --- |
| **Analyste** | extraction structurée : candidat 11 champs, provenance, issues | schéma strict, `normalizeCandidate`, `normalizeRoleIssues`, B-01B | **PLAUSIBLE** |
| **Critique** | revue templatée : 6 alternatives × N issues, dérive, vetos | schéma strict, `assembleSubstitutionReviews`, gate de substitution | **PLAUSIBLE** |
| **Arbitre** | **décider l'état** + préserver l'intention | `validateArbiterOutput`, machine d'état OPRIE | **INCONNU** |

L'Arbitre est le seul dont le mode d'échec est exactement le dommage qu'on protège : il a déjà
empêché un faux READY. C'est là que Haiku doit être jugé sur preuve, pas sur intuition.

**Mais le § 8 a raison sur l'ordre : tester tout-Haiku d'abord.** Proposer un hybride maintenant
serait ajouter de la complexité avant d'avoir la preuve qu'elle est nécessaire.

---

## F. Volume de sortie

Sorties mesurées (p50) : Analyste 448, Critique 227, Arbitre 521 — **modestes**. Sur les demandes
ouvertes : 1 340 / 1 066 / 1 774 — **×3,5**, et c'est là que partent les 92 secondes.

Deux sources structurelles, citables :

**1. L'Arbitre réémet tout le candidat.** `ARBITER_OUTPUT_FIELDS` contient
`operational_request_candidate` : les onze champs sont re-sérialisés dans sa sortie alors qu'ils
existent déjà dans celle de l'Analyste. Une part substantielle du plus gros producteur de sortie est
de la recopie.

**2. Le Critique justifie ce qu'il rejette.** Le prompt exige, pour chaque issue, les six
alternatives de la ladder avec conclusion **et** justification — *« y compris pour une alternative
jugée non disponible »*. Deux issues = douze justifications, dont la plupart ne seront jamais lues.

`OUTPUT_VOLUME_EXCESS_SUSPECTED = YES`, sur la population ouverte.

## G, H. Répétition d'entrée et cache

Établi au lot précédent : **12 741 jetons constants sur 13 081**, soit 97 %. `STATIC_PREFIX_WASTE =
HIGH`. Le cache de préfixe fournisseur reste la seule mesure qui divise la facture sans toucher un
seul octet de sémantique. `PROMPT_CACHING_PRIORITY = HIGH`.

## I, J. Compaction et delta de contexte

`CONVERSATION_REPETITION_WASTE = LOW` — le contexte de conversation pèse ~340 jetons, 3 %. Compacter
ou envoyer un delta optimiserait 3 % en risquant le lineage. `CONVERSATION_COMPACTION_PRIORITY = LOW`
· `DELTA_CONTEXT_PRIORITY = LOW`. **C'est une piste qui paraît évidente et qui ne rapporte rien.**

## K. Streaming / UX

Aujourd'hui l'utilisateur voit une interaction candidate du plan rapide (~1 s), puis rien pendant 20
à 92 s. Les événements `operational_request_role_ok` existent déjà côté serveur : afficher
« Analyse… → Revue… → Arbitrage… » ne demande aucune autorité nouvelle et ne change aucun contrat.
`STREAMING_UX_PRIORITY = HIGH` — c'est le meilleur rapport effet/risque de tout ce document.

## L. Déport déterministe

`DETERMINISTIC_VALIDATION_OFFLOAD_POTENTIAL = LOW` — et c'est une bonne nouvelle. Validation de
schéma, présence de champs, format de provenance, exactitude de cardinalité, B-01B : **tout est déjà
déterministe** et hors LLM. Il n'y a pas de décision structurelle égarée dans un prompt. Reste à
vérifier si les *prompts* re-expliquent des règles que les validateurs imposent déjà — auquel cas
c'est du texte à retirer, pas de la logique à déplacer.

## M. Indépendance des contrôles

Question honnête : trois appels au **même** modèle donnent-ils trois contrôles indépendants ? Non,
pas complètement — ils partagent le biais du modèle. Ce qui rend le pipeline robuste n'est pas la
triplication, c'est que **les validateurs déterministes, eux, sont indépendants du modèle**. Ce
constat plaide *pour* Haiku : la protection ne vient pas de la puissance du modèle.

`SAFE_PARALLELISM_POTENTIAL = LOW` — les trois rôles sont séquentiellement dépendants, et le
parallélisme sûr disponible (batches, plan rapide) est **déjà exploité**.

---

## N. Quatorze pistes

| # | Idée | Gain latence | Gain coût | Risque qualité | Complexité |
| --- | --- | --- | --- | --- | --- |
| 1 | Cache de préfixe fournisseur | faible | **−60 %** | nul | faible |
| 2 | Deep tout-Haiku | **fort** | **−67 %** | **à tester** | faible |
| 3 | L'Arbitre ne réémet plus le candidat, seulement l'état + corrections | moyen | moyen | moyen (contrat de sortie) | moyenne |
| 4 | Ne pas justifier les alternatives rejetées | moyen | moyen | moyen (auditabilité) | faible |
| 5 | Afficher la progression par étage (événements déjà émis) | **perçu, fort** | nul | **nul** | faible |
| 6 | Retirer des prompts ce que les validateurs imposent déjà | faible | faible | faible | faible |
| 7 | `max_tokens` par rôle au besoin mesuré | tail | **nul** — seule la sortie réelle est facturée | nul | faible |
| 8 | Fusionner global + batches quand les cibles sont peu nombreuses | moyen | faible | faible | moyenne |
| 9 | Ne produire `next_question` que si l'état l'exige | faible | faible | faible | faible |
| 10 | Pré-refus déterministe des entrées malformées avant tout Deep | nul | marginal | nul | faible |
| 11 | Retirer du bundle les adaptateurs Deep Groq/OpenAI morts | nul | nul | nul | faible |
| 12 | Ne pas renvoyer `material_content` inchangé | nul | **~0** (3 %) | lineage | moyenne |
| 13 | Traiter `confirmation_required` (11 cas historiques) à part | nul | nul | inconnu | moyenne |
| 14 | Retry Haiku borné avant toute escalade | — | — | à cadrer | moyenne |

Les pistes 12 et 13 sont listées **pour être écartées** : elles paraissent raisonnables et ne
rapportent rien. La 7 mérite d'être dite explicitement — abaisser `max_tokens` **ne réduit aucun
coût**, seule la sortie réellement produite est facturée ; c'est un garde-fou de latence, pas
d'économie.

---

## O. Classification des invariants

| Élément | Classe |
| --- | --- |
| OPRIE seule autorité | **PRODUCT_INVARIANT** |
| Fast candidate-only | **SAFETY_INVARIANT** |
| Analyste / Critique / Arbitre | **ARCHITECTURAL_CHOICE** — valeur prouvée, forme non imposée |
| **Sonnet 4.6** | **HISTORICAL_IMPLEMENTATION_DECISION** — hérité d'un smoke `/decision` |
| 3 à 5 appels par tour | conséquence de l'architecture |
| Contexte complet à chaque tour | **HISTORICAL_ACCIDENT** — aucun état n'existe entre tours |
| Justifications longues | ARCHITECTURAL_CHOICE, jamais réexaminé |
| Batches Critic | ARCHITECTURAL_CHOICE |
| Full Deep à chaque message | ARCHITECTURAL_CHOICE, nécessaire *dans cette architecture* |

---

## P, Q. Architectures candidates et classement

| | Fast | Analyste | Critique | Arbitre | Appels | Coût/tour | Risque | Complexité |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A0** actuel | Groq | Sonnet | Sonnet | Sonnet | 3–5 | 0,057 $ | aucun | — |
| **A1** tout-Haiku | Groq | Haiku | Haiku | Haiku | 3–5 | **0,019 $** | **à tester** | **faible** |
| **A1+** A1 + cache | Groq | Haiku | Haiku | Haiku | 3–5 | **0,008 $** | à tester | faible |
| **A2** deux appels | Groq | Haiku | — (validateurs) | Haiku | 2–3 | 0,013 $ | **élevé** | moyenne |
| **A3** hybride | Groq | Haiku | Haiku | Sonnet | 3–5 | 0,032 $ | moindre | **moyenne** |

**Classement** — fluidité, qualité, simplicité, robustesse, coût, maintenabilité :

1. **A1 / A1+** — même structure, même nombre d'étages, mêmes garanties, mêmes validateurs. On ne
   retire **aucun** contrôle : on change la taille du modèle et on cesse de refacturer le préfixe.
   Zéro nouveau composant.
2. **A0** — la référence sûre.
3. **A3** — n'a de sens que si A1 échoue précisément sur l'Arbitre.
4. **A2** — supprime le Critique, donc la garantie du dernier recours. Écartée par le lot précédent.

**Test NASA** : A1 n'ajoute aucune couche, aucun routeur, aucun composant. C'est la seule proposition
du document qui rend le système *plus simple* tout en le rendant moins cher.

---

## R. Le plus petit test capable de décider

**8 cas**, chacun passant par le système complet — modèle → validateurs → pipeline → OPRIE — et non
par une réponse texte isolée.

| # | Cas | Ce qu'il discrimine |
| --- | --- | --- |
| 1 | READY difficile (cas nominal matériau) | le cœur |
| 2 | Faux READY historique (celui que l'Arbitre a arrêté) | **le cas décisif** |
| 3 | Clarification, demande ouverte sans matériau | population coûteuse |
| 4 | Question dernier recours / substitution | garantie B-01B |
| 5 | Matériau présent, fait à extraire (ZX-4821) | provenance + available_inputs |
| 6 | Matériau annoncé, contenu inaccessible | contrôle négatif |
| 7 | Contradiction / dérive sémantique | valeur du Critique |
| 8 | Sortie structurellement invalide | classification d'échec |

`MIN_CASES = 6` · `MAX_CASES = 12` · appels ≈ **24 à 48** (3–5 par tour) · coût attendu **< 0,50 $**
· durée ≈ 15 min. Les références Sonnet sont **déjà payées** : ne pas les rejouer.

**Règle de lecture (§ 35)** : chaque divergence est classée MATERIAL ou NON_MATERIAL. Le cas 2 est
éliminatoire — un faux READY sous Haiku rejette A1, quel que soit le score des sept autres.

---

## S, T. Recommandation et arbre de décision

**Ordre recommandé — le moins risqué et le plus rentable d'abord :**

1. **Streaming de progression par étage** (piste 5). Aucun risque, aucune autorité touchée, traite
   directement le grief produit des 92 secondes perçues. À faire quoi qu'il arrive.
2. **Cache de préfixe** (piste 1). −60 %, zéro surface sémantique, sous réserve de vérifier le tarif
   en console.
3. **Benchmark Haiku 8 cas** (< 0,50 $). Puis :
   - tout-Haiku passe, **cas 2 inclus** → adopter A1+ ; −87 % de coût, latence nettement meilleure,
     zéro composant nouveau ;
   - échec **sur l'Arbitre seul** → A3, et seulement alors ;
   - échec ailleurs → rester en A0 et se retourner vers les pistes 3, 4, 6 (volume de sortie).

Ce que je **ne** recommande pas : toucher au nombre d'étages, compacter la conversation, envoyer des
deltas, ou construire un routeur. Ces pistes coûtent de la complexité et rapportent 3 %.
