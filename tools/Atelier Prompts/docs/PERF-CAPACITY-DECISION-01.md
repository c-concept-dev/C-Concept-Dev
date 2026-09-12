# PERF-CAPACITY-DECISION-01 — Stratégie de capacité du plan rapide

**Type :** décision d'architecture — capacité, fournisseurs, séparation SLA / modèle de charge.
**Aucun code n'a été modifié dans ce lot.** Aucun ordre de fournisseur, aucun quota,
aucun routage, aucune reprise, aucun modèle, aucun déploiement, aucun push.

Ce document **n'est pas une autorité**. Aucun code ne le lit. Il enregistre une
décision et les preuves qui la portent, de sorte que la décision ne vive pas
uniquement dans une conversation. La seule autorité sémantique du produit reste
OPRIE ; le plan rapide reste candidat, non autoritatif.

---

## A. Le vrai problème

Le plan rapide n'est pas lent. Le projet **n'a pas de contrat de capacité**.

Il souscrit 8 000 jetons par minute sur un compte Groq unique, partagé par la même
clé entre le plan rapide et les trois rôles OPRIE, et il mesure son contrat de
**latence interactive** avec un banc qui demande environ 23 120 jetons par minute à
ce compte. Toutes les queues de latence mesurées depuis PERF-REAL-01B décrivent donc
le comportement du système **pendant qu'il sature son propre fournisseur**, et non ce
qu'un utilisateur éprouve. La question à trancher — quelle architecture de capacité
pour le plan rapide — ne peut pas l'être avant que la charge à servir soit énoncée.
Elle ne l'est pas.

---

## B. Ce qui est prouvé, ce qui ne l'est pas, ce qui reste inconnu

### Prouvé — mesuré, traçable dans `evaluation/perf-real-01/`

| Fait | Valeur | Source |
| --- | --- | --- |
| Latence nominale Groq du plan rapide | p50 323,9–616 ms ; p95 780,5–1 214,6 ms | 01F (n=40), 01G A/B/C (n=41/41/43) |
| Budget déclaré par Groq | **8 000 jetons/min**, 1 000 requêtes | en-têtes relevés en 01D |
| La contrainte qui mord | les **jetons**, pas les requêtes — 934/1 000 requêtes restaient quand les jetons sont tombés à 52/8 000 | 01D |
| Coût d'un appel rapide | 425 jetons p50 (367 entrée / 59 sortie) | 01E |
| Plancher structurel, prompt système intégralement supprimé | **192 jetons** | 01E |
| Soutenable au débit du banc | **147 jetons** | 01E |
| Débit et demande du banc | 54,4 req/min → **23 120 jetons/min** | 01E |
| 429 = signal de capacité, pas panne | `Retry-After` 2 000 ms observé (1 000 ms en 01D), honoré + marge 750 ms | 01C, 01G |
| Anthropic sur le plan rapide | p50 **3 435,9 ms** en 01F ; 3 136,7 à 5 020,2 ms selon les campagnes de 01G ; min 1 769,9 ms, pire échantillon **10 239,9 ms** | 01F (n=8), 01G (n=19) |
| Fiabilité d'Anthropic sur ce chemin | 27/27 bascules réussies, 0 panne | 01F, 01G |
| Aucun seuil borné ne tient le contrat | {0, 1 000, 1 500, 2 000} ms → p95 3 260,9 / 3 336,3 / 3 398,0 / 5 020,2 ms | 01G, 192 échantillons |
| Frontière d'autorité | `FAST_AUTHORITY_WRITES = 0` sur toutes les campagnes | 01B → 01G |

**Réduire le payload ne peut pas fermer l'écart** : 192 > 147, quel que soit le
prompt. C'est une impossibilité arithmétique, pas un manque d'effort.

### Non prouvé

- **Qu'un quota supérieur rende p95 ≤ 3 000 ms.** Il retire le goulot prouvé ; il ne
  prouve pas le contrat. Un banc réel resterait nécessaire.
- **Qu'Anthropic primaire tiendrait le contrat.** Les 27 échantillons Anthropic ont
  tous été pris **sous saturation et par bascule**, c'est-à-dire après une tentative
  Groq échouée. Aucune mesure nominale, à basse pression, n'existe. Le chiffre est
  réel mais le protocole le désavantage.
- **Qu'OpenAI puisse servir le plan rapide.** Zéro échantillon rapide réel.
- **Que les quatre campagnes de 01G soient comparables entre elles.** Le relevé du
  budget déclaré manquait ; la campagne D n'a rencontré aucun 429 et n'a donc jamais
  exercé le mécanisme qu'elle devait mesurer.
- **Que le p95 Groq de 3 398 ms mesuré en 01G-D soit un comportement nominal.** Il a
  été obtenu **sans un seul 429**, tout en valant 3 à 4 fois le p95 Groq des trois
  autres campagnes. La cause n'est pas établie. C'est la seule observation du dossier
  qui suggère que la saturation puisse aussi se manifester en latence plutôt qu'en
  refus — et elle n'est pas expliquée.

### Inconnu

- **Tous les termes du contrat de capacité** : utilisateurs simultanés, req/s,
  pic de req/s, pic de jetons/min. `CAPACITY_TARGET_UNDEFINED = YES`.
- **La consommation réelle du plan profond.** Fast et Deep partagent une seule clé
  `GROQ_API_KEY`, donc un seul budget de 8 000 jetons/min, sans aucune isolation.
  Aucun banc ne les a jamais fait tourner ensemble : les mesures de 01B à 01G ont
  bénéficié de la **totalité** du budget. En production, le budget effectif du plan
  rapide ne peut être que **plus petit** que celui qui a été mesuré.
- **Le prix et les paliers.** Aucune donnée tarifaire dans le dépôt.
  `PRICE_DATA_REQUIRED = YES`.
- **Si le contrat du fournisseur plafonne par organisation ou par clé.** Une seconde
  clé ne contourne pas un plafond de compte ; le supposer serait une faute.
- **La latence nominale d'Anthropic et d'OpenAI** sur le schéma rapide, hors pression.

---

## C. Le banc actuel est-il valide ?

**Protocole :** 48 échantillons, 6 classes × 8, tour de rôle, 700 ms d'espacement,
3 chauffes exclues, client unique et sériel, horloge monotone, percentile au rang le
plus proche.

**Ce qu'il mesure réellement.** Avec 402,7 ms de latence nominale et 700 ms
d'espacement, la période vaut 1 102,7 ms, soit **54,4 requêtes par minute depuis un
seul client sériel**, soit ~23 120 jetons/min contre 8 000 souscrits — environ 2,9 ×
la capacité. Il n'émet jamais deux appels en même temps : il n'a donc **aucune
concurrence**. Il ne s'arrête jamais : il ne laisse donc **jamais la fenêtre de
jetons se remplir**. C'est un **test de débit soutenu mono-client**, et son p95 est
la latence d'un système poussé à près de trois fois sa capacité souscrite.

`CURRENT_BENCH_VALID_FOR_LATENCY = PARTIALLY.` Son horloge, sa définition du TTFI, sa
méthode de percentile et ses fixtures sont saines, et sa population **non saturée**
est une mesure de latence légitime : 01C donne p95 = 1 535,3 ms sur les 34
échantillons sans reprise, 01F donne p95 = 780,5 ms sur les 40 échantillons Groq. Mais
son p95 **global** n'est pas une latence vécue par un utilisateur : aucun utilisateur
n'émet 54 requêtes par minute.

`CURRENT_BENCH_VALID_FOR_CAPACITY = PARTIALLY.` Il prouve que la saturation existe et
localise la contrainte (jetons, pas requêtes) : c'est une vraie preuve de capacité.
Mais il n'éprouve **qu'un seul point de charge**, choisi par commodité — les 700 ms
étaient un espacement de banc, pas un débit dérivé du produit — sans concurrence,
sans rampe et sans cible. Il ne peut donc pas dire **à quelle charge** le système
sature ; seulement qu'il sature à celle-ci.

`LATENCY_SLA_AND_CAPACITY_SLA_CONFLATED = YES.` Un nombre unique — le p95 sur 48
échantillons saturants — a servi de verdict à un contrat écrit pour de la latence
interactive.

**Ce que cela ne veut pas dire.** Cela ne veut pas dire que le contrat de 3 s est
tenu. Cela veut dire qu'il **n'a jamais été éprouvé sous une charge énoncée**, et que
la seule lecture propre disponible aujourd'hui — la population non saturée — se situe
confortablement à l'intérieur.

---

## D. Les deux contrats, séparés

**A. SLA de latence d'interaction utilisateur** — inchangé, et il le reste tant
qu'une décision produit explicite ne le change pas :

```
préféré        p50 <= 2000 ms
requis         p95 <= 3000 ms
dégradé        3000 - 5000 ms
non conforme   > 5000 ms
```

**B. SLA de capacité / saturation** — **non spécifié à ce jour.**

```
EXPECTED_CONCURRENT_FAST_USERS  = UNKNOWN
EXPECTED_FAST_REQUESTS_PER_SEC  = UNKNOWN
EXPECTED_PEAK_REQUESTS_PER_SEC  = UNKNOWN
EXPECTED_PEAK_TPM               = UNKNOWN
CAPACITY_TARGET_UNDEFINED       = YES
```

Ces valeurs ne sont pas inventées ici. Les **questions produit minimales** dont elles
dépendent sont énumérées en section J.

---

## E. Options comparées

Notation qualitative 1 = faible … 5 = fort. Les pondérations du cahier des charges
sont qualitatives ; **aucun gagnant arithmétique n'est calculé** — le total par option
est un jugement, énoncé comme tel.

| Critère | A — Groq + quota | B — Anthropic primaire | C — Groq + bascule capacité | D — distribution proactive | E — infra rapide dédiée | F — séparer les SLA |
| --- | --- | --- | --- | --- | --- | --- |
| LATENCY | 5 | 1 | 2 | 2 | 4 | 3 |
| CAPACITY | 4 | 3 | 2 | 5 | 5 | 3 |
| COST | 2 | 2 | 3 | 3 | 3 | 5 |
| SIMPLICITY | 5 | 4 | 4 | 1 | 3 | 5 |
| ROBUSTNESS | 3 | 4 | 5 | 4 | 4 | 3 |
| SCALABILITY | 3 | 3 | 2 | 5 | 4 | 3 |
| OBSERVABILITY | 4 | 3 | 5 | 2 | 4 | 5 |
| IMPLEMENTATION_RISK | 5 | 4 | 5 | 2 | 3 | 5 |
| SEMANTIC_RISK | 5 | 5 | 5 | 4 | 4 | 5 |
| REVERSIBILITY | 4 | 5 | 5 | 3 | 4 | 5 |
| **Jugement d'ensemble** | **4 / 5** | **2 / 5** | **3 / 5** | **3 / 5** | **4 / 5** | **4 / 5** |
| **NIVEAU DE PREUVE** | HAUT (latence) / MOYEN (capacité) | BAS | HAUT | BAS | BAS | HAUT |

### A — Groq primaire, quota supérieur

La seule option qui traite la **cause prouvée** sans écrire une ligne. Elle conserve
la meilleure latence mesurée du dossier et son risque d'implémentation est nul, parce
qu'il n'y a pas d'implémentation. Faiblesses : c'est une dépense, elle paie aussi la
capacité inutilisée, elle ne réduit pas la concentration sur un fournisseur unique, et
un plafond de palier peut exister. **Un quota supérieur ne prouve pas p95 ≤ 3 s** : il
retire le goulot ; il faudra le remesurer.

### B — Anthropic primaire

Rejetée par la mesure, pas par principe. Toutes les preuves de latence disponibles
pointent dans la mauvaise direction : promouvoir Anthropic primaire échangerait un
fournisseur à 343 ms de médiane contre un fournisseur à 3 436 ms de médiane, **pour
résoudre un problème de capacité**. C'est le mauvais instrument. Sa fiabilité, en
revanche, est excellente et mesurée : 27/27.

### C — Groq primaire + bascule sur signal de capacité (état actuel)

Techniquement correcte, mesurée, la mieux instrumentée du produit. Elle a converti
**100 % des signaux de capacité en réponses réussies** — 192/192 en 01G, 48/48 en 01F.
Mais elle **n'ajoute aucune capacité** : elle redirige le débordement vers un
fournisseur plus lent, et elle se dégrade à mesure que la saturation croît puisqu'une
part croissante du trafic atterrit sur la branche lente.

**Verdict de la section 14 du cahier des charges :** oui, elle reste utile — comme
**politique de disponibilité**, et il faut cesser de la noter contre le SLA de
latence. Elle achète de la disponibilité au prix de la latence. C'est un échange
légitime pour un contrat de disponibilité et illégitime pour un contrat interactif de
3 secondes. Les deux lectures doivent coexister sans se confondre.

### D — Distribution multi-fournisseurs proactive

La seule option qui **additionne** des quotas, donc la bonne réponse à l'échelle. Elle
est prématurée : elle envoie délibérément du trafic vers un fournisseur à 3,4 s
**avant** que Groq soit plein, donc elle dégrade le p95 avant d'améliorer la capacité,
et il n'existe aujourd'hui aucune mesure nominale permettant de pondérer quoi que ce
soit.

Les quatre variantes ne doivent pas être confondues : **ROUND_ROBIN** enverrait à
l'aveugle près de la moitié du trafic rapide vers le fournisseur lent — clairement
mauvais ; **WEIGHTED** exige des poids qui, sans banc nominal, seraient devinés ;
**CAPACITY_AWARE** s'appuierait sur les en-têtes déjà relevés depuis 01D et reste la
plus défendable ; **HEALTH_AWARE** est orthogonal et déjà couvert par les classes
d'échec. Seule CAPACITY_AWARE mérite considération, et seulement après le banc
nominal. `ARCHITECTURE_CHANGE = YES` — M-03 a explicitement décidé de ne pas avoir
cela ; revenir dessus est une décision, pas un réglage.

### E — Infrastructure rapide dédiée (fournisseur, modèle ou quota propre)

C'est la seule option qui traite un problème que le dossier a rendu **structurellement
certain sans jamais le mesurer** : Fast et Deep partagent une clé, un compte et donc
un budget de 8 000 jetons/min, sans la moindre isolation. Leurs besoins sont opposés —
le plan rapide est candidat, coûte 425 jetons et vise 3 secondes ; le plan profond est
autoritatif, son Critique traite des lots à 24 400 caractères d'entrée et tolère des
attentes allant jusqu'à 26 000 ms par rôle. **Un tour profond peut consommer le budget
de la minute dont le plan rapide a besoin**, et aucun banc ne les a jamais fait tourner
ensemble.

Contraintes : un modèle plus petit devrait tenir le même schéma rapide, les mêmes cinq
types, la même non-autorité et un plancher de qualité mesuré — sinon l'option est
refusée. Et le mécanisme d'isolation doit être **vérifié contractuellement** : si les
limites de Groq s'appliquent par organisation, une seconde clé n'ajoute rien.

### F — Séparer le SLA de latence du SLA de capacité, sans changer l'architecture

Sa valeur est **épistémique, pas opérationnelle** : elle ne rend rien plus rapide. Elle
transforme un nombre ininterprétable en deux nombres interprétables, et elle est la
**condition préalable** de toutes les autres : A, D et E exigent une cible de charge
qui n'existe pas, et B exige un banc nominal que le protocole de F produit. Elle est
gratuite, immédiatement réversible, et sans aucun risque sémantique.

### Options secondaires, examinées et écartées ici

- **Hedging** (requêtes dupliquées) : réduirait la queue, mais double les jetons sur
  un budget déjà dépassé de 2,9 ×. Aggrave la cause pour traiter le symptôme.
  **Écarté.**
- **Multi-clés / sharding** : ne peut être évalué que contractuellement. Supposer que
  plusieurs clés contournent un plafond de compte serait une faute. **Écarté en
  l'état, à vérifier avant tout usage.**
- **Cache** : les entrées du plan rapide sont la demande utilisateur libre. Aucune clé
  de cache concrète ni motif de réutilisation n'a été identifié. **Écarté.**

### Contraintes dures — vérifiées pour chaque option

Aucune des options A à F ne touche à la sémantique : OPRIE reste l'autorité unique, le
plan rapide reste candidat, le plan profond reste autoritatif, le plan rapide ne peut
ni READY, ni router, ni exécuter, ni écrire QG, ni écrire OPRIE. Aucune sélection de
fournisseur par le contenu, aucun codage en dur de domaine, aucun faux READY, aucune
manipulation de seuil pour faire passer un test. Les deux seuls vecteurs de risque
sémantique sont **D** — le routage doit rester purement technique et indépendant du
contenu — et **E** — un modèle plus petit doit tenir le schéma et un plancher de
qualité. Tous deux sont notés 4 et non 5 pour cette raison.

### Fiabilité et disponibilité — à ne pas mélanger

Un 429 **ne doit pas** dégrader le score de fiabilité de Groq. Sur le chemin rapide,
le nombre de **pannes** fournisseur de Groq est de **0** sur toutes les campagnes :
chaque non-succès était un signal de capacité, correctement annoncé et correctement
honoré. La preuve de fiabilité de Groq est donc forte ; c'est sa **capacité souscrite**
qui est faible. Ce sont deux axes distincts et le dossier ne doit plus les additionner.

### Coût

Aucune donnée tarifaire n'existe dans le dépôt, et une grille publique n'établit ni le
palier de ce compte ni ses termes d'engagement. La seule source admissible est le
contrat réel du propriétaire du compte. `PRICE_DATA_REQUIRED = YES` — le critère COST
du tableau est donc un **ordre de grandeur relatif** entre options, pas un chiffrage.

---

## F. Classement

**TOP 1 — F, séparer les SLA.** Gratuite, réversible, ne bloque sur rien, et elle peut
reformuler le problème avant qu'un euro soit dépensé ou une ligne écrite. Tant que le
banc confond latence et saturation, aucune des autres options ne peut être évaluée :
on ne saurait pas reconnaître un succès.

**TOP 2 — A, augmenter la capacité souscrite chez Groq.** La seule option qui traite la
cause prouvée, en conservant la meilleure latence mesurée, avec zéro risque
d'implémentation et zéro risque sémantique. Conditionnée à deux faits absents : la
cible de pic et le prix.

**TOP 3 — E, infrastructure rapide dédiée.** La seule qui traite la contention
Fast/Deep que la clé partagée rend structurellement certaine. Elle passe devant D
parce qu'elle isole un domaine de panne sans introduire de routage, et parce que son
gain de capacité ne dépend pas d'un fournisseur lent.

**Direction recommandée : classe de décision F — combinaison avec séquencement.**

```
1. Séparer les deux contrats et corriger le protocole de mesure   (option F)
2. Obtenir la cible de charge produit                             (questions, section J)
3. Si le pic dépasse la capacité souscrite : acheter la capacité   (option A)
4. Si la contention Fast/Deep se révèle dominante : isoler          (option E)
5. Conserver la bascule sur signal de capacité comme politique
   de DISPONIBILITÉ, sans la noter contre le SLA de latence        (option C)
6. Différer la distribution proactive à l'échelle                  (option D)
7. Ne pas promouvoir Anthropic primaire sans banc nominal          (option B)
```

---

## G. Réponses explicites

**ANTHROPIC PRIMAIRE MAINTENANT ? — `NOT_YET`.**
27 échantillons rapides réels existent — 8 en 01F, 19 en 01G — tous pris sous saturation et par bascule après
un 429 Groq : p50 3 136–5 020 ms, pire échantillon 10 239,9 ms, contre 343,4 ms de
médiane pour Groq. Sa fiabilité est excellente (27/27), sa latence mesurée est
disqualifiante. Ce n'est pas `NO` parce que le protocole désavantage structurellement
Anthropic : ses échantillons sont des secondes tentatives, prises pendant que le
système sature. Un banc nominal, à basse pression, peut changer ce chiffre — il
n'existe pas.

**GROQ PRIMAIRE MAINTENANT ? — `CONDITIONAL`.**
Conditionné à la capacité, pas à la latence. Groq détient la preuve de latence la plus
forte du dépôt et zéro panne sur le chemin rapide. Il détient aussi le goulot prouvé.
Il reste primaire **si** le quota souscrit couvre le pic énoncé, **ou si** le pic
énoncé se révèle nettement inférieur à 8 000 jetons/min. Si aucune des deux, la
primauté n'est pas le problème : c'est le compte.

**ACHETER DE LA CAPACITÉ GROQ AVANT DE CHANGER LE CODE ? — `CONDITIONAL`.**
Conditionné à deux faits absents : la cible de pic et le prix. Si le pic, part du plan
profond comprise, tient sous ~6 000 jetons/min, il ne faut rien acheter — c'est le banc
qu'il faut corriger. Si le pic dépasse nettement 8 000, l'achat est la **première**
action et il est strictement meilleur que tout changement de code, parce qu'il traite
la cause prouvée à risque d'implémentation et à risque sémantique nuls. **Dans aucun
cas le code ne doit changer en premier** : 01D à 01G ont épuisé les leviers logiciels
et l'ont mesuré.

**FAST ET DEEP DOIVENT-ILS AVOIR DES STRATÉGIES FOURNISSEUR SÉPARÉES ? — `YES`,
mécanisme à établir.**
La direction est fondée sur un fait vérifiable, pas sur une intuition : une seule clé
`GROQ_API_KEY` sert les deux plans, donc un seul budget de 8 000 jetons/min, sans
aucune isolation. Leurs contrats sont opposés — 425 jetons et 3 secondes d'un côté, des
lots de 24 400 caractères et des attentes tolérées jusqu'à 26 000 ms de l'autre. Ce qui
reste ouvert n'est pas la direction mais **le mécanisme et l'ampleur** : le partage n'a
jamais été mesuré en charge conjointe, et il est interdit de supposer qu'une seconde
clé lève un plafond de compte. Les deux relèvent des expériences ci-dessous.

---

## H. Recommandations conditionnelles selon la charge

Puisque la charge réelle est inconnue, les trois régimes sont énoncés séparément et
marqués comme **conditionnels**.

| Régime | Meilleure architecture | Justification |
| --- | --- | --- |
| **Trafic faible** — pic bien sous 8 000 jetons/min | Statu quo : Groq primaire, bascule capacité en filet | La capacité actuelle suffit ; le seul défaut est un banc qui mesure la mauvaise chose. Aucune dépense, aucun code. |
| **Trafic moyen** — pic autour ou au-dessus de 8 000 | A, puis E si la contention Fast/Deep domine | Acheter la capacité conserve la meilleure latence et la plus grande simplicité ; isoler les deux plans empêche le profond d'affamer le rapide. |
| **Échelle** — plusieurs multiples du quota, ou exigence de résilience multi-fournisseurs | E + D (CAPACITY_AWARE), après bancs nominaux par fournisseur | À ce stade seulement, la complexité de routage se paie : elle additionne des quotas et supprime la dépendance à un fournisseur unique. |

---

## I. Enregistrement de décision (ADR)

```
DECISION
    Séparer le SLA de latence interactive du SLA de capacité, corriger le protocole
    de mesure en conséquence, et différer tout changement d'architecture jusqu'à ce
    qu'une cible de charge produit existe. Conserver Groq primaire et la bascule sur
    signal de capacité en l'état.

STATUS
    ACCEPTÉE comme direction — non implémentée. Aucun code, aucun déploiement.

CONTEXT
    PERF-REAL-01B à 01G ont épuisé les leviers logiciels : le réglage du débit n'a
    rien à offrir (01D), la réduction du payload est arithmétiquement impossible
    (01E, plancher 192 > 147 soutenables), la bascule immédiate coûte plus cher que
    l'attente qu'elle remplace (01F), et aucun des quatre seuils bornés ne tient le
    contrat (01G). La cause finale mesurée est la capacité : 8 000 jetons/min
    souscrits contre ~23 120 demandés par le banc.

OPTIONS CONSIDERED
    A Groq + quota supérieur ; B Anthropic primaire ; C Groq + bascule capacité ;
    D distribution proactive ; E infrastructure rapide dédiée ; F séparation des SLA.
    Secondaires écartées : hedging, multi-clés, cache.

DECISION DRIVERS
    1. Le banc mesure la saturation et sert de verdict à un contrat de latence.
    2. La cible de capacité n'existe pas ; on ne saurait pas reconnaître un succès.
    3. Groq nominal tient le contrat ; Groq saturé ne le tient pas.
    4. Anthropic n'a aucune mesure nominale ; ses seuls chiffres sont biaisés.
    5. Fast et Deep partagent un budget sans isolation, jamais mesuré ensemble.
    6. Aucun changement logiciel restant n'agit sur la cause.

CHOSEN DIRECTION
    F, puis A si la cible l'exige, puis E si la contention domine. C conservée comme
    politique de disponibilité et retirée de la notation du SLA de latence.

REJECTED FOR NOW
    B — preuve de latence disqualifiante et aucune mesure nominale.
    D — dégrade le p95 avant d'améliorer la capacité ; changement d'architecture que
        M-03 a explicitement décidé de ne pas avoir ; pondérations non mesurables.
    Hedging — double les jetons sur un budget déjà dépassé.
    Multi-clés — non vérifié contractuellement.
    Cache — aucune clé ni motif de réutilisation identifiés.

RISKS
    1. Corriger le banc peut être lu comme un déplacement de poteaux. Atténuation :
       les seuils du contrat restent inchangés, à l'octet près ; seul le modèle de
       charge est explicité, et les deux lectures sont conservées côte à côte.
    2. Un banc nominal peut montrer que même sans saturation le contrat n'est pas
       tenu — l'observation inexpliquée de 01G-D (p95 Groq 3 398 ms sans aucun 429)
       le rend possible. Dans ce cas la décision change et l'option E remonte.
    3. Acheter de la capacité sans cible achèterait un nombre arbitraire.
    4. La contention Fast/Deep pourrait être plus grande que l'écart mesuré, rendant
       les campagnes 01B à 01G optimistes.

REVERSIBILITY
    Totale. Aucun code, aucun quota, aucun ordre de fournisseur, aucun déploiement
    n'a changé. Ce document s'annule en le contredisant.

NEXT PROOF
    Expérience 1 — banc nominal non saturé, par fournisseur.
    Expérience 2 — banc de saturation, après énoncé de la cible de charge.
```

---

## J. Preuve suivante et plan d'expérience minimal

### Questions produit minimales — sans elles, la cible de capacité reste indéfinie

1. Nombre d'utilisateurs **rapides simultanés** au pic.
2. Tours par minute et par utilisateur actif — le plan rapide se déclenche une fois
   par tour.
3. Durée et forme du pic (rafale courte ou plateau).
4. Le plan profond tourne-t-il **en même temps** que le rapide pour un même
   utilisateur, et à quelle fréquence — les deux partagent le même budget.
5. Durée de service dégradé acceptable, et comportement voulu quand le budget est
   épuisé : attendre, basculer, ou le dire à l'utilisateur.
6. Répartition géographique — le Worker est global, le compte fournisseur ne l'est pas.

Avec (1) et (2), `EXPECTED_PEAK_TPM` se **calcule** — utilisateurs × tours/min × 425
jetons, plus la part du plan profond — au lieu d'être inventé.

### Expérience 1 — banc nominal, non saturé, par fournisseur *(tranche la F, arme la A et la B)*

Mêmes 6 classes × 8 fixtures, même horloge, même définition du TTFI, même méthode de
percentile. **Le seul changement est l'espacement.** À 425 jetons par appel, 8 000
jetons/min autorisent 18,8 appels/min ; un espacement ≥ 3 200 ms donne une période
d'environ 3 600 ms, soit ~16,7 appels/min et ~7 100 jetons/min — environ 11 % de marge,
la fenêtre ne se vide jamais. Chaque campagne est conditionnée à un budget déclaré
plein au départ, vérifiable grâce au relevé d'en-têtes rétabli en 01G.

**Critère de validité :** zéro 429 sur la campagne. Un seul 429 invalide la campagne,
qui est rejouée avec plus de marge.

**Lecture :** le p50 et le p95 nominaux du plan rapide, et donc la réponse à la
question pour laquelle le contrat de 3 secondes a été écrit — *tient-il quand le
fournisseur n'est pas saturé ?* Cette mesure n'a jamais été prise.

Puis le même protocole, à l'identique, la chaîne **épinglée** sur Anthropic, puis sur
OpenAI. Attention à ne pas surestimer ce qui existe : `DECISION_PROVIDER` épingle un
fournisseur **pour `/decision` uniquement**, et sa documentation le dit. La route
rapide, elle, emploie toujours l'ordre complet de la chaîne. La couture existe —
`runFastInteractionWithHaChain` accepte déjà un paramètre `order` — mais la porte ne
l'expose pas. Épingler un fournisseur pour le plan rapide demande donc un **petit
changement explicite**, à autoriser dans le lot de mesure, et non dans celui-ci.
Ce coût admis, trois campagnes de 48 échantillons donnent la première comparaison
nominale non biaisée entre fournisseurs, et referment la lacune de preuve qui bloque
l'option B.

### Expérience 2 — banc de saturation *(tranche la A et la D, définit le SLA de capacité)*

**Uniquement après que la cible de charge existe** — proposer des paliers avant serait
inventer des nombres. Mêmes fixtures, Groq épinglé, trois débits **dérivés de la cible
énoncée** : nominal, pic cible, deux fois le pic cible. Chaque palier tourne jusqu'à
l'apparition du premier 429 ou jusqu'au bout.

**Lecture :** le débit et le nombre de jetons/min auxquels le premier 429 apparaît,
c'est-à-dire le **point de saturation réel de l'abonnement actuel** ; et, par
comparaison à la cible, **le quota exact à acheter**. C'est ce qui transforme
« augmenter la capacité » d'une intuition en un chiffre.

**Ce que ces deux expériences ne doivent pas faire :** être fusionnées. C'est
exactement la confusion que ce lot vient de constater.

---

## Ce qui n'a pas été fait, délibérément

Aucun ordre de fournisseur changé, aucun quota changé, aucun routage ajouté, aucune
politique de reprise touchée, aucun modèle changé, aucun déploiement, aucun push, aucune
modification du HTML canonique, aucun bloc gelé approché. `PERF-REAL-01` **reste
ouverte** : ce lot n'apporte aucune preuve réelle nouvelle, il interprète celles qui
existent. La porte de livraison reste fermée.
