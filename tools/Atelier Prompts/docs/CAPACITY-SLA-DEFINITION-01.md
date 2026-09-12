# CAPACITY-SLA-DEFINITION-01 — Contrat de capacité du plan rapide, à abonnements figés

**Objet :** définir le contrat de capacité du plan rapide **à l'intérieur des abonnements
déjà souscrits**, après que sa latence nominale a été prouvée.

**Contrainte produit ferme, posée par le propriétaire :** les abonnements ne changent pas.
Aucun achat de quota, chez aucun fournisseur. La question n'est plus « combien acheter ? »
mais « comment répartir ce qui est déjà payé ? ».

**Aucun code n'a été modifié, aucun déploiement, aucun push, aucun ordre de fournisseur
touché.** Le SLA de latence n'est pas modifié.

Ce document **n'est pas une autorité**. Aucun code ne le lit. OPRIE reste l'autorité
sémantique unique ; le plan rapide reste candidat, non autoritatif.

---

## 1. État : le problème a changé de nature

| Contrat | État |
| --- | --- |
| **Latence** | **DÉFINI et PROUVÉ** — p50 ≤ 2 000 ms préféré, p95 ≤ 3 000 ms requis |
| **Capacité** | **DÉFINI pour la bêta** — 6 utilisateurs simultanés, 6 req/min, 12 au pic ; **non éprouvé** |

PERF-NOMINAL-PROVIDER-01 a prouvé que le plan rapide tient son contrat de latence sur
Groq, hors saturation : **p50 = 467,3 ms, p95 = 1 617,0 ms**, 48/48 succès, zéro 429. Le
problème de latence est clos.

Le propriétaire produit a depuis fourni les six décisions de charge, et la contrainte
d'abonnements figés. Le contrat de capacité de la **bêta** est donc **calculé** dans ce
document — et il tient, à une condition mesurable qui ne l'est pas encore : la part que le
plan profond prend sur la même clé Groq. **Ce qui reste ouvert n'est plus la définition du
contrat, c'est sa preuve.**

---

## 2. Le fait décisif de ce lot : l'asymétrie des capacités déjà payées

Les trois budgets ont été relevés aux en-têtes des fournisseurs pendant les runs nominaux.
Ils ne sont pas estimés, ils sont déclarés :

| Fournisseur | Budget déclaré | Requêtes/min | Rapport à Groq | Latence rapide p95 | Jetons/appel p50 |
| --- | --- | --- | --- | --- | --- |
| **Groq** | **8 000 jetons/min** | 1 000 | — | **1 617 ms** — tient | 426 |
| **OpenAI** | 1 000 000 jetons/min | 5 000 | **× 125** | 4 234 ms — dégradé | 362 |
| **Anthropic** | 10 000 000 jetons d'entrée/min, 2 000 000 de sortie | 10 000 | **× 1 250** | 5 562 ms — non conforme | 1 144 |

**La ressource rare est Groq, et elle l'est d'un facteur trois chiffres.** Les deux
fournisseurs abondants sont précisément ceux qui ne tiennent pas le contrat interactif ; le
fournisseur qui le tient est celui dont le budget est le plus étroit du dossier.

**Et le second fait, établi sans aucune mesure :** le plan rapide et les trois rôles OPRIE
partagent une seule clé `GROQ_API_KEY`, donc **un seul budget de 8 000 jetons/min, sans la
moindre isolation**. Le plan profond consomme aujourd'hui la ressource rare, alors qu'il est
le seul des deux à pouvoir s'en passer.

---

## 3. Ce que le plan profond tolère, et que le plan rapide ne tolère pas

Le contrat existant du produit, écrit dans `workers/groq/src/index.js`, fixe déjà des
plafonds d'attente par rôle profond — dérivés en HA-02 du coût mesuré d'une bascule :

| Rôle | Plafond d'attente | Plan |
| --- | --- | --- |
| Analyste | 16 000 ms | profond |
| Arbitre | 17 000 ms | profond |
| Critique | 26 000 ms | profond |
| **Interaction rapide** | **0 ms** | rapide |

Le plan profond est donc **déjà contractuellement tolérant à la latence**, à hauteur de 16 à
26 secondes par rôle. Le plan rapide, lui, dispose de 3 secondes pour l'ensemble du tour.

Les deux plans ont des besoins opposés, et ils se partagent aujourd'hui la même ressource
rare. C'est la description exacte d'une mauvaise allocation.

---

## 4. Modèle de jetons — mesuré, non estimé

| Grandeur | Valeur | Source |
| --- | --- | --- |
| `TOKENS_PER_FAST_REQUEST_P50` | **426** | 48 relevés d'usage fournisseur, PERF-NOMINAL-PROVIDER-01 |
| `TOKENS_PER_FAST_REQUEST_P95` | **485** | idem — mesuré, donc utilisable comme valeur conservatrice |
| min / max / moyenne | 410 / 485 / 434,3 | idem |
| Entrée p50 / p95 | 368 / 395 | idem |
| Sortie p50 / p95 | 57 / 100 | idem |

`DEEP_TPM` = **UNKNOWN**. Aucun tour profond n'a jamais été mesuré en jetons. Cette mesure
n'a pas été prise dans ce lot, par décision du propriétaire produit. Elle reste **requise**,
et elle est peu coûteuse : l'instrumentation existante émet déjà `jetons_entree`,
`jetons_sortie` et `jetons_total` pour **chaque** appel Groq, rôles OPRIE compris — un seul
tour profond réel observé sous `wrangler tail` suffirait à l'obtenir, sans une ligne de code.

Par conséquent `TOTAL_PROVIDER_TPM = FAST_TPM + DEEP_TPM` reste **incalculable**.

---

## 5. Plafonds de débit du plan rapide, à quota Groq inchangé

Calculs de **capacité**, pas garanties de latence.

**Hypothèse haute — le plan rapide dispose de la totalité des 8 000 jetons/min** (ce qui est
faux aujourd'hui, puisque le profond partage) :

| Base | Débit maximal | Par seconde |
| --- | --- | --- |
| p50 = 426 jetons | **18 requêtes/min** | 0,31 req/s |
| p95 = 485 jetons (conservateur) | **16 requêtes/min** | 0,27 req/s |

**La contrainte qui mord est le jeton, pas la requête** : 1 000 requêtes/min sont autorisées
contre 16 permises par le budget de jetons — un facteur **60**. Toute réflexion en
« requêtes par seconde » manquerait la vraie limite.

**Effet de la marge de sécurité :**

| Marge | Jetons utilisables | Débit (p50) | Débit (p95) |
| --- | --- | --- | --- |
| 0 % | 8 000 | 18 req/min | 16 req/min |
| 20 % | 6 400 | 15 req/min | 13 req/min |
| 30 % | 5 600 | 13 req/min | 11 req/min |
| 50 % | 4 000 | 9 req/min | 8 req/min |

**Toutes ces valeurs sont des majorants.** La capacité réellement disponible au plan rapide
est aujourd'hui **strictement inférieure**, d'une quantité non mesurée : celle que consomme
le plan profond sur la même clé.

---

## 6. Marge de sécurité — désormais **dérivée**, non plus choisie

Le pic déclaré fixe lui-même le plafond. Six utilisateurs à deux tours/minute demandent
**5 820 jetons/min** ; sur un budget de 8 000, cela laisse exactement **27,25 %**. Toute marge
supérieure à cette valeur rend le pic déclaré infaisable.

| Marge | Jetons utilisables | Nominal 2 910 | Pic 5 820 |
| --- | --- | --- | --- |
| 0 % | 8 000 | tient (36,4 %) | tient (72,8 %) |
| **20 %** | **6 400** | **tient (45,5 %)** | **tient (90,9 %)** |
| 25 % | 6 000 | tient (48,5 %) | tient (97,0 %) |
| **30 %** | **5 600** | tient (52,0 %) | **DÉPASSE (103,9 %)** |
| 50 % | 4 000 | tient (72,8 %) | DÉPASSE (145,5 %) |

`HEADROOM_POLICY` = **20 %**, et c'est un résultat, pas une préférence : parmi les trois
candidats proposés (20 / 30 / 50 %), **20 % est le seul compatible avec le pic déclaré**. Le
plafond arithmétique exact vaut 27,25 % ; la règle du dépôt — retenir le plus grand nombre
rond strictement inférieur à la borne mesurée, celle-là même qui a produit les quatre
plafonds d'attente du produit — donne 25 %, et 20 % est le candidat proposé qui s'en approche
par le bas avec une réserve réelle.

**Ce que 20 % achète :** 6 400 jetons/min utilisables, le pic à 90,9 % de cette enveloppe,
et 580 jetons/min de réserve au-dessus du pic.

**Une précision qui compte :** le pic est déclaré comme une **rafale courte de 2 minutes**.
La fenêtre de débit de Groq se reconstitue en 3,4 à 5,1 s (mesuré) — elle est donc glissante
à l'échelle de la minute. Une rafale de deux minutes n'est **pas** amortie par la fenêtre :
elle dure assez longtemps pour que chacune de ses minutes doive tenir seule dans le budget.
C'est pourquoi le pic est traité ici comme une contrainte par minute, et non comme un
transitoire absorbable.

## 7. Portée des limites de débit

`RATE_LIMIT_SCOPE` = **UNKNOWN**.

Les en-têtes relevés (`x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens`,
`x-ratelimit-limit-requests`) donnent des **valeurs** mais aucune **portée** : rien n'y
indique si le budget s'applique à la clé, au projet, à l'organisation ou au compte. Le
produit n'utilise qu'une seule clé Groq : l'expérience ne peut donc pas distinguer les
hypothèses.

**Conséquence opérationnelle :** il est interdit de supposer qu'une seconde clé
multiplierait la capacité. Tant que la portée n'est pas établie par le contrat du
fournisseur, « isoler le plan rapide par une seconde clé Groq » n'est pas une option
chiffrable — c'est un pari.

---

## 8. Entrées produit — **fournies par le propriétaire**

```
INITIAL_RELEASE_TYPE                  = BETA
EXPECTED_CONCURRENT_FAST_USERS        = 6
TYPICAL_FAST_TURNS_PER_USER_PER_MIN   = 1
PEAK_FAST_TURNS_PER_USER_PER_MIN      = 2
PEAK_SHAPE                            = SHORT_BURST
PEAK_DURATION_MIN                     = 2
ACCEPTABLE_DEGRADED_DURATION          = 5 min maximum par incident
GROQ_FULL_BEHAVIOR                    = FAST DÉGRADÉ / AUCUNE CANDIDATE / LE PROFOND CONTINUE
EXPECTED_BURST_MULTIPLIER             = 2   (dérivé : pic ÷ nominal)
GEOGRAPHIC_DISTRIBUTION               = UNKNOWN — sans effet sur le budget de jetons
DEEP_SHARE_OF_PROVIDER_CAPACITY       = UNKNOWN — non mesuré
```

Deux valeurs restent inconnues, et une seule des deux compte.

La **répartition géographique** n'a pas été fournie et n'entre dans aucun calcul de ce
document : le Worker est global, le budget de jetons ne l'est pas, et un budget par minute ne
dépend pas d'où viennent les requêtes.

La **part du plan profond**, elle, est déterminante — voir la section 12.

## 9. Le contrat de capacité, calculé

**`CAPACITY_SLA_DEFINED = YES`** pour la bêta. Toutes les valeurs ci-dessous se dérivent des
décisions produit et du coût en jetons mesuré ; aucune n'est choisie.

```
SUPPORTED_CONCURRENT_FAST_USERS   = 6
SUPPORTED_FAST_RPM                = 6 requêtes/min
SUPPORTED_FAST_RPS                = 0,10 requête/s
SUPPORTED_FAST_TPM                = 2 910 jetons/min      (6 × 1 × 485)
PEAK_FAST_RPM                     = 12 requêtes/min
PEAK_FAST_RPS                     = 0,20 requête/s
PEAK_FAST_TPM                     = 5 820 jetons/min      (6 × 2 × 485)
PEAK_DURATION                     = 2 minutes, rafale courte
HEADROOM                          = 20 %  -> 6 400 jetons/min utilisables
FAST_DEEP_CAPACITY_POLICY         = SÉPARATION par assignation de rôle fixe
DEGRADED_BEHAVIOR                 = plan rapide dégradé, aucune candidate rendue,
                                    le plan profond poursuit son tour ; 5 min max par incident
```

### Valeur conservatrice : 485 jetons, et pourquoi elle est légitime

485 n'est pas une majoration prudente inventée pour la circonstance : c'est **à la fois le p95
et le maximum** des 48 relevés d'usage fournisseur de PERF-NOMINAL-PROVIDER-01. Trois
échantillons sur quarante-huit l'atteignent, **aucun ne le dépasse**. Dimensionner à 485,
c'est dimensionner sur la requête rapide la plus chère jamais observée sur ce corpus.

Le même calcul à la médiane mesurée (426 jetons) donne 2 556 jetons/min en nominal et
5 112 au pic — les chiffres retenus au contrat sont donc bien les plus défavorables des deux.

## 10. Options de répartition, à abonnements figés

Seules les stratégies compatibles avec les abonnements existants sont comparées.

| | S1 — Groq d'abord pour le rapide | S2 — déplacer le profond vers Anthropic/OpenAI | S3 — pools séparés rapide/profond | S4 — débordement dégradé sur l'existant | S5 — distribution proactive | S6 — rester simple + déclencheurs |
| --- | --- | --- | --- | --- | --- | --- |
| Latence rapide | 5 — préserve le seul fournisseur qui tient | **5** — libère toute la ressource rare | **5** | 2 — la branche de débordement est à 4,2–5,6 s | 1 — envoie du trafic rapide chez les lents | 5 — inchangée |
| Contention | 1 — inchangée, le profond mange la ressource rare | **5** — la supprime à la racine | **5** | 3 | 3 | 1 |
| Simplicité | 5 — c'est l'état actuel | 4 — une constante d'ordre par plan | 3 | 4 — déjà implémenté | 1 | 5 |
| Coût | 5 — nul | 5 — capacité déjà payée | 5 | 5 | 4 | 5 |
| Résilience | 4 — chaîne HA intacte | 4 | 4 | **5** | 4 | 4 |
| Observabilité | 3 — budgets indiscernables entre plans | **5** — les deux plans deviennent lisibles séparément | 5 | 4 | 2 | 3 |
| Risque sémantique | 5 | **3** — la qualité OPRIE sous un autre modèle n'est pas mesurée | 3 | 5 | 4 | 5 |

### Ce que la comparaison désigne

**S2 est la seule option qui traite la cause avec de la capacité déjà payée.** Elle consiste
à donner à chaque plan le fournisseur qui correspond à son contrat : le rapide garde Groq,
rare et véloce ; le profond va vers Anthropic et OpenAI, abondants et lents — et il tolère
déjà 16 à 26 secondes par rôle. Elle ne coûte rien, elle rend au plan rapide jusqu'à la
totalité des 8 000 jetons/min, et elle rend les deux plans observables séparément.

**Ce n'est pas du magasinage sémantique.** L'affectation est une **assignation de rôle
fixe** — plan rapide → Groq, plan profond → Anthropic puis OpenAI — décidée une fois,
indépendante du contenu, du domaine, du sujet, de la classe de demande et du profil
utilisateur. `SEMANTIC_PROVIDER_SELECTION_COUNT` reste 0 par construction.

**Son risque est réel et il est nommé :** la qualité des sorties OPRIE sous Anthropic ou
OpenAI n'a jamais été mesurée à parité. Les trois rôles savent déjà s'exécuter chez eux — ils
figurent dans `ROLE_PROVIDER_ORDER` et y ont servi lors des bascules — mais « savoir
s'exécuter » n'est pas « produire une qualité équivalente ». C'est la preuve suivante, et
elle doit précéder toute mise en œuvre.

**S4 reste utile, mais pas pour ce qu'on croit** — voir section 11.

**S5 est écartée pour le plan rapide** : toute requête rapide envoyée délibérément chez
Anthropic ou OpenAI hérite d'un p95 mesuré à 5 562 ou 4 234 ms. Distribuer proactivement le
trafic rapide, c'est choisir de rater le contrat.

**S6 est ce qui s'applique en attendant les réponses produit** : ne rien construire, et
armer des déclencheurs.

---

## 11. Débordement, dégradation, et la distinction à ne pas perdre

`CAPACITY_FAILOVER_ROLE` = **AVAILABILITY**, jamais LATENCY.

C'est une conclusion mesurée, pas une opinion : PERF-REAL-01F a montré que la bascule
immédiate sur 429 convertit **100 % des signaux de capacité en réponses réussies** — et fait
passer le p95 de 3 394,9 à 3 947,0 ms. PERF-NOMINAL-PROVIDER-01 en donne la raison : la
branche de repli est mesurée à 4 234 ms (OpenAI) et 5 562 ms (Anthropic) au repos.

**Le repli de capacité préserve la disponibilité et ne peut pas préserver la latence.** Les
deux ne doivent jamais être notés ensemble.

### `DEGRADED_MODE_POLICY` — décidée par le propriétaire

**Quand Groq est plein : le plan rapide se déclare dégradé, ne rend aucune candidate, et le
plan profond poursuit son travail autoritaire.** Durée tolérée : **5 minutes maximum par
incident**.

Les quatre comportements possibles et leur coût mesuré, pour mémoire :

| Comportement | Ce qu'il préserve | Ce qu'il coûte | Retenu |
| --- | --- | --- | --- |
| A. Bascule vers Anthropic/OpenAI | la réponse arrive (192/192 mesurés) | 4,2 à 5,6 s — hors contrat | non |
| B. Attente contrôlée | reste sur le fournisseur rapide | 2 750 ms mesurés — hors contrat | non |
| **C. État dégradé explicite** | **le budget, et l'honnêteté du contrat** | le plan rapide ne rend rien à ce tour | **OUI** |
| D. Rejet immédiat | le budget | pire que C sans contrepartie | non |

**Ce choix est cohérent avec l'architecture, et c'est ce qui le rend bon.** Le plan rapide est
*candidat et non autoritatif* : il n'a jamais eu le droit de conclure quoi que ce soit. Le
suspendre retire donc une commodité, pas une capacité — le plan profond continue son tour,
OPRIE reste l'autorité, l'utilisateur obtient le même résultat, seulement sans
l'accompagnement interactif. Aucune des trois autres options n'a cette propriété : A et B
paient une latence hors contrat pour produire une candidate dont personne ne dépend.

Corollaire explicite : **le débordement de capacité vers Anthropic ou OpenAI est écarté pour
le plan rapide**, conformément à la décision produit. Ces deux fournisseurs restent
disponibles pour la disponibilité du plan *profond*, jamais pour prétendre tenir un SLA de
latence rapide qu'ils ne tiennent pas.

## 12. Tiers de capacité, et le statut du quota Groq

| Tier | Régime | Débit | Jetons/min (485) | Jetons/min (426) | % du quota | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| **TIER_1** | Bêta nominal — 6 × 1 | 6 req/min (0,10 req/s) | **2 910** | 2 556 | 36,4 % | **SUFFISANT** |
| **TIER_2** | Production normale | UNKNOWN | UNKNOWN | UNKNOWN | — | UNKNOWN |
| **TIER_3** | Pic — 6 × 2, rafale 2 min | 12 req/min (0,20 req/s) | **5 820** | 5 112 | 72,8 % | **SUFFISANT, MARGINAL** |

`TIER_2` reste inconnu parce que le propriétaire a défini une **bêta**, pas une cible de
production. Ce n'est pas un manque : c'est le périmètre de la décision. Il devra être défini
avant la sortie de bêta, et la section 13 dit à quel signal.

### `CURRENT_GROQ_CAPACITY_STATUS` = **SUFFISANT** pour la bêta

À une condition, et elle est décisive.

**Marge réelle en régime nominal :** 2 910 sur 8 000, soit **63,6 % du quota libre**. Sur
l'enveloppe de 6 400 jetons utilisables après marge de 20 %, le nominal en occupe **45,5 %**.

**Marge réelle au pic :** 5 820 sur 8 000, soit **27,3 % du quota libre** — et **90,9 % de
l'enveloppe utilisable**. Il reste 580 jetons/min au-dessus du pic.

**Où la bêta casse, exactement.** À 20 % de marge, le sixième utilisateur au rythme de pic
consomme 5 820 des 6 400 jetons disponibles ; **un septième en demanderait 6 790, au-dessus de
l'enveloppe**. Sans aucune marge, le plafond dur est de **8 utilisateurs simultanés au rythme
de pic** (7 760 jetons), le neuvième dépassant le quota. La cible de 6 est donc tenue, mais
elle est à **deux utilisateurs du plafond absolu** et à **un utilisateur du plafond avec
marge**.

### La condition : ce qui reste au plan profond

Tous les chiffres ci-dessus supposent que le plan rapide dispose du budget entier. **C'est
faux :** le plan profond consomme la même clé.

| Régime rapide | Jetons/min restants pour le profond |
| --- | --- |
| Nominal (2 910) | **5 090** |
| **Pic (5 820)** | **2 180** |

Un tour profond exécute **trois appels fournisseur au minimum** — Analyste, Critique, Arbitre,
séquence figée dans `OPERATIONAL_REQUEST_ROLE_SEQUENCE`. En leur prêtant, très généreusement,
le coût d'un appel *rapide* — 485 jetons — le plancher d'un tour profond vaut **1 455 jetons**.
Ce plancher est extrêmement conservateur : les trois prompts système profonds pèsent
**25 685 caractères** contre 794 pour le prompt rapide, soit **32 fois plus**, avant même le
contenu utilisateur.

Conséquence, au plancher et donc dans le meilleur des cas :

- en régime **nominal**, les 5 090 jetons restants autorisent environ **3,5 tours profonds par
  minute** ;
- au **pic**, les 2 180 jetons restants n'en autorisent plus que **1,5**.

**Six utilisateurs en rafale de pic dont deux lanceraient un tour profond saturent Groq.**
C'est le résultat central de ce lot : la séparation Fast/Deep n'est pas une amélioration
souhaitable, elle est la **condition d'existence du pic déclaré**. Le chiffre exact manque —
`DEEP_TPM` n'a pas été mesuré — mais le plancher structurel suffit à établir que la marge
apparente de 27,3 % au pic n'est pas une marge : c'est ce qui reste à partager avec un plan
profond qui coûte davantage.

## 13. Déclencheurs de croissance — désormais chiffrés

Trois déclencheurs, chacun dérivé d'une mesure ou d'une décision, aucun choisi.

1. **Utilisation soutenue du budget Groq > 80 % sur une minute.** Le seuil n'est plus posé : il
   vaut `1 − marge`, et la marge vaut 20 % parce que le pic déclaré l'impose (section 6).
   Franchir 80 % en régime soutenu signifie que le pic n'a plus de réserve.
2. **Tout signal de capacité en production — seuil : plus de zéro par heure.** Un seul 429
   coûte 2 750 ms d'attente ou 2,2 à 10,2 s de bascule, et les deux dépassent le budget de
   3 secondes. Avec la politique dégradée retenue, il coûte désormais une candidate rapide
   non rendue. Le premier 429 en production est l'événement à surveiller.
3. **p95 rapide observé en production > 3 000 ms.** C'est le contrat lui-même, mesuré sur le
   trafic réel plutôt que sur un banc.

Deux déclencheurs de sortie de bêta s'y ajoutent, directement lisibles du contrat :

4. **Un septième utilisateur rapide simultané** — au rythme de pic, il dépasse l'enveloppe
   utilisable (6 790 > 6 400).
5. **Plus d'un tour profond par minute pendant un pic rapide** — au plancher structurel, le
   budget restant n'en autorise que 1,5.

L'instrumentation nécessaire aux cinq existe déjà : `capacity_signal`, `provider_outcome`,
`budget_limite` et `budget_restant` sont émis à chaque appel Groq depuis PERF-REAL-01D/01G,
pour le plan rapide **comme pour les trois rôles profonds**.

## 14. Prochaine preuve — un seul lot est strictement nécessaire

**`DEEP-TOKEN-COST-01` — mesurer le coût réel en jetons d'un tour profond.**

C'est le seul chiffre qui manque pour que le contrat de capacité cesse d'être un majorant. La
section 12 établit que le pic rapide ne laisse que 2 180 jetons/min au plan profond et que le
plancher structurel d'un tour en consomme au moins 1 455 : le contrat tient ou ne tient pas
selon un nombre que personne n'a mesuré.

Ce lot ne demande **ni code, ni déploiement, ni décision** : l'instrumentation émet déjà
`jetons_entree`, `jetons_sortie` et `jetons_total` pour chaque appel Groq, rôles profonds
compris, depuis PERF-REAL-01E. Quelques tours réels observés sous `wrangler tail` suffisent —
sur les mêmes fixtures que le banc rapide, pour rester comparables.

Il rend trois choses : `DEEP_TPM` par tour, la part réelle du budget disponible au plan
rapide, et le verdict définitif sur `CURRENT_GROQ_CAPACITY_STATUS` au pic.

**Ce qui vient ensuite, mais seulement ensuite :**

- **`OPRIE-QUALITY-PARITY-01`** — comparer la qualité des sorties OPRIE sur Anthropic et
  OpenAI à celle de Groq, sur les mêmes demandes. C'est la condition de la migration du plan
  profond, et donc de la séparation Fast/Deep. Comparaison **humaine ou structurelle** :
  aucune similarité floue, aucun score automatique, aucun juge LLM.
- **`CAPACITY-BENCH-01`** — le banc de capacité, désormais dérivable du contrat :

```
LOAD 1  nominal    ->  6 req/min   ( 2 910 jetons/min)  espacement ~9 530 ms
LOAD 2  pic        -> 12 req/min   ( 5 820 jetons/min)  espacement ~4 530 ms, tenu 2 min
LOAD 3  surcharge  -> 18 req/min   ( 8 730 jetons/min)  au-delà du quota, pour localiser la rupture
```

Chaque espacement se calcule — `60 000 / débit − latence nominale`, avec 467,3 ms mesurés —
et non plus au jugé. LOAD 3 dépasse délibérément le quota : c'est une **surcharge contrôlée**
destinée à observer le comportement dégradé retenu, pas un régime supporté. Le banc de 700 ms
qui a produit sept lots de mesures trompeuses n'est pas reconduit.

## 15. Enregistrement de décision (ADR)

```
DECISION
    USE_EXISTING_SUBSCRIPTIONS_ONLY. Aucun achat de quota chez aucun fournisseur.
    Le contrat de capacité de la BÊTA est défini : 6 utilisateurs rapides simultanés,
    6 requêtes/min en nominal, 12 au pic pendant 2 minutes, 485 jetons par requête,
    20 % de marge. Le quota Groq actuel le tient — sous une condition non encore
    mesurée, la part qu'y prend le plan profond.

CONTEXT
    Le plan rapide tient son contrat de latence sur Groq hors saturation
    (p50 467,3 ms, p95 1 617,0 ms). Les deux autres fournisseurs échouent ce même
    contrat au repos (4 234 et 5 562 ms). Mais Groq déclare 8 000 jetons/min quand
    OpenAI en déclare 1 000 000 et Anthropic 10 000 000 : la ressource rare est
    exactement celle dont le plan rapide a besoin — et le plan profond, qui tolère
    déjà 16 à 26 s par rôle, la consomme sur la même clé.

WORKLOAD_ASSUMPTIONS
    Aucune. Les six valeurs de charge viennent du propriétaire produit :
    BÊTA, 6 utilisateurs simultanés, 1 tour/min en nominal, 2 au pic, rafale de
    2 minutes, 5 minutes de dégradation tolérées par incident.

MEASURED_INPUTS
    485 jetons par requête rapide — p95 ET maximum de 48 relevés fournisseur.
    8 000 jetons/min déclarés par Groq. 1 000 000 chez OpenAI, 10 000 000 chez
    Anthropic. Latences nominales des trois fournisseurs. Trois appels minimum par
    tour profond, prompts système 32 fois plus longs que celui du plan rapide.

UNKNOWN_INPUTS
    DEEP_TPM — jamais mesuré. RATE_LIMIT_SCOPE — les en-têtes donnent des valeurs,
    pas une portée. TIER_2 production normale — hors périmètre d'une bêta.
    Qualité OPRIE hors de Groq. Tarifs — aucun n'entre dans ce document.

CAPACITY_MODEL
    FAST_TPM = utilisateurs × tours/min × 485.
    Nominal 6 × 1 × 485 = 2 910 (36,4 % du quota).
    Pic     6 × 2 × 485 = 5 820 (72,8 % du quota, 90,9 % de l'enveloppe à 20 %).

HEADROOM
    20 %, DÉRIVÉ et non choisi : le pic déclaré impose un plafond de 27,25 %, et 20 %
    est le seul des trois candidats proposés qui passe. 30 % rend le pic infaisable.

FAST_DEEP_POLICY
    SÉPARATION, par assignation de rôle fixe : le rapide garde Groq, le profond migre
    vers la capacité abondante déjà payée d'Anthropic puis d'OpenAI. Indépendante du
    contenu, du domaine et du sujet — ce n'est pas du magasinage sémantique. Elle passe
    du rang de bonne idée à celui de CONDITION du pic déclaré : au pic, le budget
    restant n'autorise qu'environ 1,5 tour profond par minute, au plancher.

CURRENT_QUOTA_FIT
    TIER_1 nominal : SUFFISANT, 63,6 % du quota libre.
    TIER_3 pic     : SUFFISANT mais MARGINAL — 90,9 % de l'enveloppe utilisable,
                     un septième utilisateur au pic la dépasserait.
    TIER_2         : UNKNOWN, hors périmètre de la bêta.

GROWTH_TRIGGER
    Utilisation Groq soutenue > 80 % ; tout 429 en production ; p95 production
    > 3 000 ms ; un septième utilisateur rapide simultané ; plus d'un tour profond
    par minute pendant un pic rapide.

NEXT_PROOF
    DEEP-TOKEN-COST-01 — mesurer le coût en jetons d'un tour profond réel. Sans lui,
    tous les chiffres de ce contrat restent des majorants.
```

## 16. Ce qui n'a pas été fait, délibérément

Aucun abonnement modifié, aucun quota acheté, aucun ordre de fournisseur changé, aucun
primaire changé, aucun code de production touché, aucun déploiement, aucun push, aucun seuil
de latence modifié, aucun appel fournisseur émis par ce lot.

La séparation Fast/Deep reste une **direction**, pas une mise en œuvre : elle attend la
comparaison de qualité OPRIE à parité, et ce lot ne l'anticipe pas.

```
CAPACITY_SLA_DEFINED   = YES   (pour la bêta)
CAPACITY_SLA_PROVEN    = NO    (aucun banc de capacité n'existe encore)
```

La distinction est entière : le contrat est **écrit et calculé**, il n'est pas **éprouvé**.
Aucune charge réelle n'a été appliquée à ce système ; ce qui précède est de l'arithmétique
appuyée sur des mesures unitaires, pas un test de tenue.

`PERF-REAL-01` reste **ouverte**, scindée en deux moitiés dont une seule est close :

```
FAST_LATENCY_PART   = CLOSED / PROUVÉE   (Groq, p50 467,3 ms, p95 1 617,0 ms)
FAST_CAPACITY_PART  = OPEN
```

