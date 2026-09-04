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
| **Capacité** | **NON DÉFINI** — aucune cible de charge produit n'existe |

PERF-NOMINAL-PROVIDER-01 a prouvé que le plan rapide tient son contrat de latence sur
Groq, hors saturation : **p50 = 467,3 ms, p95 = 1 617,0 ms**, 48/48 succès, zéro 429. Le
problème de latence est clos. **Ce qui reste ouvert est la capacité, et désormais
uniquement sa répartition.**

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

## 6. Marge de sécurité — fourchette recommandée, choix non arbitraire

Une marge ne se choisit pas dans l'abstrait : elle amortit une rafale, et la taille d'une
rafale dépend d'une cible de pic qui n'existe pas encore. Ce que la mesure permet néanmoins
de dire :

- **20 % est un plancher défendable.** La fenêtre Groq se reconstitue en ~5 s (`reset`
  observé entre 3,4 et 5,1 s) ; une marge de 20 % couvre environ trois requêtes rapides
  simultanées de plus que le régime nominal — soit une rafale très courte, pas un pic.
- **30 % est le point où une rafale d'un ordre de grandeur au-dessus du nominal reste
  absorbée**, au prix de 5 req/min de débit soutenu.
- **50 % ramène le plafond à 8 requêtes/min**, ce qui, sur un budget déjà étroit et non
  extensible, coûte plus que ce que la marge protège.

`HEADROOM_POLICY` = **fourchette recommandée 20–30 %, valeur exacte à fixer par le
propriétaire une fois la cible de pic connue.** Aucune valeur n'est retenue ici : sans cible,
un pourcentage serait un chiffre choisi, pas dérivé.

---

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

## 8. Entrées produit manquantes

Ces valeurs ne sont pas inventées. Elles restent inconnues jusqu'à décision du propriétaire.

```
INITIAL_RELEASE_TYPE                  = UNKNOWN
EXPECTED_ACTIVE_USERS                 = UNKNOWN
EXPECTED_CONCURRENT_FAST_USERS        = UNKNOWN
TYPICAL_FAST_TURNS_PER_USER_PER_MIN   = UNKNOWN
PEAK_FAST_TURNS_PER_USER_PER_MIN      = UNKNOWN
PEAK_DURATION_MIN                     = UNKNOWN
ACCEPTABLE_DEGRADED_DURATION          = UNKNOWN
GEOGRAPHIC_DISTRIBUTION               = UNKNOWN
EXPECTED_BURST_MULTIPLIER             = UNKNOWN
DEEP_SHARE_OF_PROVIDER_CAPACITY       = UNKNOWN (non mesuré)
FAST_SHARE_OF_PROVIDER_CAPACITY       = UNKNOWN (complément du précédent)
```

### `MINIMUM_PRODUCT_INPUTS_REQUIRED`

Six décisions, et elles seules, débloquent le contrat de capacité :

1. **Type de lancement** — privé, bêta restreinte, ou public.
2. **Utilisateurs rapides simultanés au pic** — le nombre que le lancement doit tenir.
3. **Tours rapides par minute et par utilisateur actif** — le plan rapide se déclenche une
   fois par tour ; c'est le multiplicateur qui transforme des utilisateurs en jetons.
4. **Forme du pic** — rafale courte ou plateau soutenu, et sa durée en minutes.
5. **Durée de service dégradé acceptable** lors d'un événement de capacité exceptionnel.
6. **Comportement voulu quand Groq est plein** — parmi les quatre options de la section 11.

Avec (2) et (3), tout le reste se **calcule** :
`FAST_TPM = utilisateurs × tours/min × 485 jetons`, puis
`marge appliquée`, puis comparaison aux 8 000 jetons/min disponibles.

---

## 9. Scénarios illustratifs — `ILLUSTRATIVE_ONLY = YES`

**Ces trois lignes ne sont pas un SLA et ne doivent jamais être citées comme tel.** Elles
montrent seulement où se situe la frontière, pour aider à répondre aux questions ci-dessus.
Elles supposent que le plan rapide dispose de **toute** la capacité Groq — hypothèse fausse
aujourd'hui.

| Scénario | Utilisateurs simultanés | Tours/utilisateur/min | Débit | Jetons/min (p95) | Tient dans 8 000 ? |
| --- | --- | --- | --- | --- | --- |
| **BAS** — bêta privée | 10 | 1 | 10 req/min | 4 850 | oui, avec ~39 % de marge |
| **MOYEN** — production restreinte | 25 | 1 | 25 req/min | 12 125 | **non** — 1,5 × le budget |
| **HAUT** — public | 100 | 1,5 | 150 req/min | 72 750 | **non** — 9,1 × le budget |

La frontière est nette et vaut la peine d'être retenue : **à un tour par minute et par
utilisateur, la capacité Groq actuelle sature autour de 16 utilisateurs simultanés** (13 avec
20 % de marge, 11 avec 30 %) — et moins encore tant que le plan profond partage la même clé.

---

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

`DEGRADED_MODE_POLICY` = **décision produit, non prise ici.** Les quatre comportements
possibles quand Groq est plein, avec leur coût mesuré :

| Comportement | Ce qu'il préserve | Ce qu'il coûte |
| --- | --- | --- |
| **A.** Bascule vers Anthropic/OpenAI | la réponse arrive (48/48, 192/192 mesurés) | 4,2 à 5,6 s — hors contrat |
| **B.** Attente contrôlée | reste sur le fournisseur rapide | 2 750 ms mesurés par attente — hors contrat |
| **C.** État dégradé explicite | l'honnêteté envers l'utilisateur, et le budget | le plan rapide ne rend rien à ce tour |
| **D.** Rejet immédiat | le budget | pire que C sans contrepartie |

Le plan rapide étant **candidat et non autoritatif**, l'option C a une propriété que les
autres n'ont pas : le plan profond continue son tour normalement, et l'utilisateur perd une
commodité, pas une capacité. C'est un argument, pas une décision.

---

## 12. Tiers de capacité

```
TIER_1  INITIAL / BÊTA        RPM = UNKNOWN   TPM = UNKNOWN   tenu par l'existant ? UNKNOWN
TIER_2  PRODUCTION NORMALE    RPM = UNKNOWN   TPM = UNKNOWN   tenu par l'existant ? UNKNOWN
TIER_3  PIC                   RPM = UNKNOWN   TPM = UNKNOWN   tenu par l'existant ? UNKNOWN
```

`CURRENT_GROQ_CAPACITY_STATUS` = **UNKNOWN** pour les trois tiers : un statut se prononce
contre une cible, et il n'y en a pas. Ce qui est connu est le **plafond** : 16 à 18 requêtes
rapides par minute à quota plein, moins la part non mesurée du plan profond.

---

## 13. Déclencheurs de croissance

Trois déclencheurs sont proposés. Deux sont **dérivés de mesures**, le troisième attend une
cible — et est marqué comme tel plutôt que chiffré arbitrairement.

1. **Tout signal de capacité en production — seuil : plus de zéro par heure.** Ce n'est pas
   un seuil choisi : un seul 429 coûte 2 750 ms d'attente ou 2,2 à 10,2 s de bascule, et les
   deux dépassent le budget de 3 secondes. Le premier 429 en production est donc déjà
   l'événement à surveiller.
2. **p95 rapide observé en production > 3 000 ms.** C'est le contrat lui-même, mesuré sur le
   trafic réel plutôt que sur un banc.
3. **Utilisation soutenue du budget Groq.** La forme du déclencheur est connue — la fraction
   de 8 000 jetons/min consommée en régime — mais **son seuil ne peut pas être fixé avant la
   cible de pic** : il doit valoir `1 − marge`, et la marge dépend de la rafale à absorber.
   Le poser aujourd'hui serait inventer un nombre.

L'instrumentation nécessaire aux trois existe déjà : `capacity_signal`, `provider_outcome`,
`budget_limite` et `budget_restant` sont émis à chaque appel depuis PERF-REAL-01D/01G.

---

## 14. Prochaine preuve

**Avant toute mise en œuvre, deux mesures, dans cet ordre :**

1. **Coût en jetons d'un tour profond.** Un seul tour réel observé sous `wrangler tail`
   donne `DEEP_TPM` par tour, sans une ligne de code — l'instrumentation l'émet déjà pour
   les trois rôles. Sans ce nombre, la part réellement disponible au plan rapide reste
   inconnue et aucun tier ne peut être validé.
2. **Qualité OPRIE à parité, hors de Groq.** Les mêmes demandes, les mêmes rôles, exécutés
   sur Anthropic puis OpenAI, comparés au résultat Groq. C'est la condition de S2, et la
   seule chose qui empêche aujourd'hui de la recommander en mise en œuvre plutôt qu'en
   direction. La comparaison doit être **humaine ou structurelle** — aucune similarité
   floue, aucun score automatique, aucun juge LLM.

**Puis, une fois le SLA de capacité officiel existant**, le banc de capacité :

```
LOAD 1  charge normale attendue    -> débit dérivé de TIER_2
LOAD 2  pic officiel               -> débit dérivé de TIER_3
LOAD 3  surcharge contrôlée        -> au-delà du pic, pour localiser la rupture
```

Chaque niveau se dérive du SLA — `espacement = 60 000 / débit cible − latence nominale` —
**jamais d'une cadence arbitraire**. Le banc de 700 ms qui a produit sept lots de mesures
trompeuses n'est pas reconduit.

---

## 15. Enregistrement de décision (ADR)

```
DECISION
    USE_EXISTING_SUBSCRIPTIONS_ONLY. Aucun achat de quota chez aucun fournisseur.
    Le contrat de capacité n'est PAS défini : les entrées produit manquent.
    Direction retenue, à valider et non à implémenter : donner à chaque plan le
    fournisseur qui correspond à son contrat — le rapide garde Groq, le profond
    migre vers la capacité abondante déjà payée d'Anthropic et d'OpenAI.

CONTEXT
    Le plan rapide tient son contrat de latence sur Groq hors saturation
    (p50 467,3 ms, p95 1 617,0 ms). Les deux autres fournisseurs échouent ce même
    contrat au repos (4 234 et 5 562 ms). Mais Groq déclare 8 000 jetons/min quand
    OpenAI en déclare 1 000 000 et Anthropic 10 000 000 : la ressource rare est
    exactement celle dont le plan rapide a besoin — et le plan profond, qui tolère
    déjà 16 à 26 s par rôle, la consomme sur la même clé.

FAST_PROVIDER_DIRECTION
    Groq primaire, inchangé. Preuve HAUTE. Aucune raison de changer.

DEEP_PROVIDER_DIRECTION
    Anthropic primaire, OpenAI secondaire — à valider par une comparaison de
    qualité à parité, jamais adoptée sans elle. Assignation de rôle fixe,
    indépendante du contenu : ce n'est pas du magasinage sémantique.

FAST_DEEP_CAPACITY_POLICY
    SÉPARATION. Les deux plans ne doivent plus se disputer la même ressource rare.
    Le mécanisme est l'assignation de fournisseur par plan, pas une seconde clé :
    la portée des limites de débit est inconnue, et supposer qu'une clé
    supplémentaire multiplie la capacité serait un pari.

CAPACITY_UNKNOWN
    Cible de charge produit (six décisions, section 8). Coût en jetons d'un tour
    profond. Portée des limites de débit. Qualité OPRIE hors de Groq.

RISKS
    1. La qualité OPRIE sous un autre modèle n'est pas mesurée — c'est le seul
       obstacle sérieux à la direction retenue, et il est levable par une mesure.
    2. Sans DEEP_TPM, la capacité réellement disponible au plan rapide reste un
       majorant : 16 à 18 req/min est un plafond, pas une promesse.
    3. Les abonnements étant figés, un lancement au-delà d'environ 16 utilisateurs
       simultanés à un tour par minute saturera Groq — et la seule réponse
       disponible sera un mode dégradé, pas de la capacité supplémentaire.
    4. Déplacer le profond consomme davantage chez Anthropic, où un appel rapide
       coûtait déjà 1 144 jetons contre 426 chez Groq. L'abondance y est telle que
       le risque paraît nul, mais il n'est pas quantifié faute de DEEP_TPM.

REVERSIBILITY
    Totale. Rien n'a été changé. La direction, le jour où elle sera mise en œuvre,
    tiendra dans une constante d'ordre de fournisseur par plan, et s'annulera de
    la même façon.

NEXT_PROOF
    1. Coût en jetons d'un tour profond réel (instrumentation déjà en place).
    2. Qualité OPRIE à parité sur Anthropic et OpenAI.
    3. Puis, la cible de charge produit une fois connue, le banc de capacité à
       trois niveaux dérivés du SLA.
```

---

## 16. Ce qui n'a pas été fait, délibérément

Aucun abonnement modifié, aucun quota acheté, aucun ordre de fournisseur changé, aucun
primaire changé, aucun code de production touché, aucun déploiement, aucun push, aucun seuil
de latence modifié, aucun appel fournisseur émis par ce lot.

`CAPACITY_SLA_DEFINED = NO` — les entrées produit manquent, et ce lot s'interdit de les
inventer. `CAPACITY_SLA_PROVEN = NO` — aucun banc de capacité n'existe encore.

`PERF-REAL-01` reste **ouverte**, désormais scindée en deux moitiés dont une seule est
close :

```
FAST_LATENCY_PART   = CLOSED / PROUVÉE   (Groq, p50 467,3 ms, p95 1 617,0 ms)
FAST_CAPACITY_PART  = OPEN
```
