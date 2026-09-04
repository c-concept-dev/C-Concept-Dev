# FAST-CAPACITY-ADMISSION-01 — Ce qu'on peut savoir avant d'appeler, et ce qu'on ne peut pas

**Question posée :** peut-on déterminer de façon fiable, **avant** l'appel Groq, si une
requête rapide tient dans la capacité restante, sans inventer de seuil ?

**Réponse : non.** Et pas par prudence — par arithmétique, trois fois plutôt qu'une. Ce lot
implémente donc le **niveau 1** : un souvenir mécanique du délai que le fournisseur annonce
lui-même, et rien de plus.

Ce document **n'est pas une autorité**. Aucun code ne le lit. OPRIE reste l'autorité
sémantique unique ; le plan rapide reste candidat, non autoritatif.

---

## 1. Audit des signaux fournisseur

Relevés sur des réponses Groq réelles, en observation seule, depuis PERF-REAL-01D.

| Signal | Source | Valeur observée | Classification |
| --- | --- | --- | --- |
| `TPM_LIMIT` | en-tête `x-ratelimit-limit-tokens` | `8000` | **OBSERVATIONAL_ONLY** |
| `TPM_REMAINING` | en-tête `x-ratelimit-remaining-tokens` | 52 → 7 541 selon la charge | **OBSERVATIONAL_ONLY** |
| `TPM_RESET` | en-tête `x-ratelimit-reset-tokens` | `3.442s` à `28.245s` | **OBSERVATIONAL_ONLY** |
| `RPM_LIMIT` | en-tête `x-ratelimit-limit-requests` | `1000` | **OBSERVATIONAL_ONLY** |
| `RPM_REMAINING` | en-tête `x-ratelimit-remaining-requests` | 696 → 985 | **OBSERVATIONAL_ONLY** |
| `RPM_RESET` | en-tête `x-ratelimit-reset-requests` | `6h5m45.6s` | **OBSERVATIONAL_ONLY** |
| `RETRY_AFTER` | en-tête `retry-after`, ou délai explicite dans le corps de l'erreur 429 | 1 000 et 2 000 ms | **AUTHORITATIVE_PROVIDER_SIGNAL** |

**Pourquoi les six premiers ne sont qu'observationnels, et un seul est autoritatif.**

Les en-têtes de budget existent, sont bien formés et cohérents entre eux. Ce n'est pas leur
exactitude qui est en cause, c'est **le moment où ils arrivent** : ils voyagent sur la
**réponse**. Il n'existe chez Groq aucune route de consultation du quota. Toute vérification
préalable lirait donc la valeur rapportée par l'appel *précédent* — périmée d'au moins un
aller-retour, sur un seau qui se remplit en continu (le `reset` observé descend jusqu'à 3,4 s).

`Retry-After`, lui, ne décrit pas un état : il énonce une **instruction datée**. « Reviens dans
2 000 ms » reste vrai pendant 2 000 ms, quoi qu'il arrive ailleurs. C'est le seul signal du
lot sur lequel une décision peut se fonder sans périmer.

`PROVIDER_SIGNAL_RELIABILITY` = **un seul signal autoritatif, six observationnels.**

---

## 2. Le coût d'une requête peut-il être connu avant l'envoi ?

| Terme | Connu avant l'appel ? | Source |
| --- | --- | --- |
| Jetons d'entrée | **NON** | aucun tokenizer embarqué, aucune route de comptage chez Groq |
| Plafond de sortie | **OUI** | `maxCompletionTokens: 512`, configuré et contractuel |
| Enveloppe de transport / schéma | non séparable | incluse dans l'entrée facturée |

`EXACT_PRECALL_INPUT_TOKEN_COUNT` = **NO**. Le Worker n'a **aucune dépendance de production**
(`dependencies: {}`) ; embarquer le tokenizer du modèle `openai/gpt-oss-20b` reviendrait à
importer un vocabulaire de plusieurs mégaoctets sur le chemin le plus sensible à la latence du
produit — et resterait une reconstitution, non le compteur du fournisseur.

### La borne exacte existe, et c'est elle qui ferme le niveau 2

La section 7 du lot autorise une estimation **si une borne supérieure exacte existe**. Elle
existe : pour un BPE au niveau de l'octet, un jeton consomme au moins un octet, donc
`jetons ≤ octets`. C'est démontrable, pas estimé.

```
prompt système        ≤    794 jetons   (794 octets, valeur du dépôt)
message utilisateur   ≤ 16 384 jetons   (TRANSPORT_LIMITS.analyst, plafond de transport)
sortie maximale       =    512 jetons   (plafond explicite configuré)
                        ────────────
BORNE EXACTE          ≤ 17 690 jetons
quota d'une minute    =  8 000 jetons
```

**La seule borne rigoureuse disponible vaut 2,21 fois le quota d'une minute entière.** Une
admission qui l'utiliserait refuserait **100 % des requêtes**, y compris quand le budget est
plein. Elle est exacte et inutilisable — les deux à la fois.

Et la remplacer par les 426 ou 485 jetons mesurés est exclu : la section 9 l'interdit
nommément, et ce serait faire d'une statistique de banc une autorité de production. La
mesure décrit ce qui *a coûté* ; elle ne borne pas ce qui *va coûter*.

`REQUEST_COST_PRECALL_COMPUTABLE` = **PARTIAL** — le plafond de sortie, oui ; l'entrée, non.
`EMPIRICAL_TOKEN_METRIC_USED_AS_AUTHORITY` = **NO**.

---

## 3. Analyse de course

Même en supposant le coût connu, la comparaison `restant ≥ requis` ne serait pas décidable.

| Facteur | Effet |
| --- | --- |
| **Fraîcheur** | Le `restant` connu date de la réponse précédente : au moins un aller-retour de retard, sur un seau qui se remplit en 3 à 5 s. |
| **Concurrence** | Plusieurs requêtes rapides peuvent lire le même `restant` et décider toutes les deux d'être admises. |
| **Isolats multiples** | Chaque isolat n'observe que ses propres appels. Aucun ne connaît la consommation des autres. |
| **Plan profond** | Les trois rôles OPRIE consomment le **même budget sur la même clé**, et leurs appels sont totalement invisibles au chemin rapide. |
| **Portée du quota** | Le budget est au périmètre du compte ; l'observation est locale. |

`ADMISSION_STATE_SCOPE` = **PROVIDER_GLOBAL** — la vérité vit chez le fournisseur ; ce que le
Worker peut en savoir est local, partiel et daté.

`RACE_CONDITION_IDENTIFIED` = **YES**. `PRECALL_ADMISSION_STRONGLY_SAFE` = **NO**.

Le niveau 2 est donc fermé pour trois raisons indépendantes, dont chacune suffirait : le coût
n'est pas calculable, la seule borne exacte est dégénérée, et l'état de capacité est périmé et
aveugle.

---

## 4. Portée du souvenir : mesurée, pas supposée

La section 19 exige de **prouver** la portée avant de choisir un stockage. Un Worker
Cloudflare n'offre aucune garantie publique de réutilisation d'isolat : la question ne se
raisonne pas.

**Protocole.** Une identité aléatoire tirée une fois par isolat, un compteur d'invocations, et
des requêtes à **corps invalide** — refusées en 400 par la porte, **avant tout appel
fournisseur**. Coût de la mesure : **zéro jeton, zéro appel Groq**.

| Motif | Invocations | Isolats distincts | Servies par un isolat déjà vu |
| --- | --- | --- | --- |
| Rafale dense — 1 s d'espacement | 30 | 4 | 26 / 30 — **87 %** |
| **Cadence du pic déclaré — 5 s** | 20 | 4 | 20 / 20 — **100 %** |
| **Total** | **50** | **4** | un isolat a servi jusqu'à 21 invocations |

Les quatre isolats ont **survécu à une pause de 20 s**. À la cadence qui compte — celle du pic
de 12 requêtes/minute du contrat de capacité — **toute requête tombe sur un isolat qui a déjà
vu passer du trafic**.

`RETRY_AFTER_STORAGE_SCOPE` = **ISOLATE_MODULE_MEMORY**. Ni KV, ni Durable Object, ni aucun
état distribué : la mesure montre qu'ils ne sont pas nécessaires, et un Durable Object
introduirait un point de sérialisation sur le chemin le plus sensible à la latence du produit.

**La limite est assumée, pas masquée.** Un isolat qui n'a pas encore rencontré de 429 ne sait
rien du refroidissement et tentera son propre appel — qu'il perdra. Le coût de cette ignorance
est **borné à un refus par isolat**, soit quatre au maximum d'après la mesure. C'est
exactement ce qui range ce mécanisme parmi les meilleurs efforts et non parmi les garanties.

`PRECALL_ADMISSION_BEST_EFFORT` = **YES**.

---

## 5. Ce qui a été implémenté — niveau 1, et rien d'autre

**Deux changements, tous deux mécaniques.**

### a. Le souvenir du délai annoncé

Quand Groq répond 429 **en annonçant un délai**, ce délai est retenu ; jusqu'à son expiration,
le plan rapide s'abstient d'appeler et rend un résultat technique. À l'échéance, l'appel
suivant repart normalement. Il n'y a pas d'autre état — un horodatage, deux issues.

**Aucun refroidissement n'est inventé.** Seule une valeur réellement annoncée — en-tête
`retry-after`, ou délai explicite dans le corps de l'erreur — ouvre une abstention. Le repli
fixe de 30 s du dépôt reste ce qu'il a toujours été, le dernier recours de la boucle de
reprise, et **n'entre jamais** dans le souvenir : la ligne qui les confondait a été scindée en
deux pour que la distinction soit structurelle et non affaire de discipline.

`INVENTED_COOLDOWN_COUNT` = **0**. `RETRY_AFTER_EXACT_PROVIDER_DERIVED` = **YES**.

### b. Le plan rapide n'a plus qu'un fournisseur

PERF-NOMINAL-PROVIDER-01 a mesuré les trois au repos, sur les mêmes fixtures : Groq
**1 617 ms** de p95, OpenAI **4 234 ms**, Anthropic **5 562 ms**. Les deux replis échouent le
contrat interactif de 3 secondes **avant même toute saturation**. Basculer vers eux ne
préservait donc pas la latence : cela produisait une candidate hors contrat, plus lentement
que de n'en produire aucune.

`FAST_PROVIDER_ORDER = ["groq"]`. `DECISION_PROVIDER_ORDER` et `ROLE_PROVIDER_ORDER` — qui
régissent `/decision` et les trois rôles OPRIE — restent `groq → anthropic → openai`, à
l'octet près. Seul le plan rapide a désormais son ordre propre, parce que seul son contrat de
latence rend un repli lent contre-productif.

L'épinglage diagnostic `FAST_BENCH_PROVIDER` continue d'atteindre les trois fournisseurs :
c'est un outil de mesure d'opérateur, jamais un repli de production.

### Le résultat technique

Un refus rend `503 fast_capacity_unavailable`. C'est une **erreur de transport**, produite
avant toute validation de schéma : elle ne traverse pas le plan rapide, ne produit aucune
candidate, et n'a aucun chemin vers un état OPRIE, une readiness ou une route. Le plan profond
poursuit son tour, intact — c'est exactement le mode dégradé décidé au contrat de capacité.

Le contrat d'interface visé côté produit — « Réponse rapide momentanément indisponible.
Analyse complète en cours… » — **n'est pas implémenté ici** : ce lot produit le signal
technique, la surface reste hors périmètre.

---

## 6. Ce qui n'a pas été fait

**Aucune machine à états.** Ni `NORMAL`, ni `PRESSURED`, ni `SATURATED`, ni `RECOVERING` : le
lot attendait la démonstration que plusieurs états distincts soient actionnables, et elle n'a
pas eu lieu. Un horodatage suffit.

**Aucun seuil, aucun pourcentage, aucun compteur d'utilisateurs.** Les nombres du contrat de
capacité — 6 utilisateurs, 12 requêtes/minute, 20 % de marge, 426 et 485 jetons — vivent dans
des documents et des mesures. Aucun n'apparaît dans une condition ; une preuve dédiée le
vérifie caractère par caractère.

**Aucune inspection sémantique.** L'admission ne reçoit qu'une horloge : sa signature ne
comporte aucun paramètre capable de porter la demande. Elle ne peut donc dépendre ni du
contenu, ni du domaine, ni du mode, ni d'un état OPRIE — non par discipline, mais faute de
pouvoir.

**Aucune persistance distribuée**, aucun repli du plan rapide vers Anthropic ou OpenAI, aucun
changement du plan profond, aucun changement de l'artefact canonique.

---

## 7. Limites, énoncées

1. **Le mécanisme est un meilleur effort, et se déclare tel.** `FAST_ADMISSION_STRENGTH =
   "BEST_EFFORT"` figure dans le code et dans chaque trace. Il n'empêche pas un 429 ; il
   empêche de *rappeler* un fournisseur qui vient de dire quand revenir.
2. **La portée d'isolat est observée, pas contractuelle.** Cloudflare ne garantit rien.
   Quatre isolats aujourd'hui ne signifient pas quatre demain.
3. **L'activation du refroidissement n'a pas été forcée en production.** Provoquer un 429
   réel exigerait de saturer volontairement le fournisseur, ce que ce lot n'a pas fait.
   L'arithmétique d'expiration est prouvée localement, à la milliseconde près, sur les
   deux bords de l'échéance.
4. **Rien ici ne protège la capacité.** Le plan profond consomme le même budget sur la même
   clé, et le chemin rapide ne le voit pas. Seule la séparation Fast/Deep traiterait cela.

---

## 8. Traçabilité

| Élément | Valeur |
| --- | --- |
| Worker | `atelier-decision-groq` |
| Version — sonde de portée d'isolat | `db0f1ab0-153b-48b1-b85d-ba5649a17241` |
| Version — mécanisme de niveau 1 | `4da62e5b-aac7-4932-bddb-ac23d2cac924` |
| Mesures brutes | `evaluation/fast-capacity-admission-01/results.json` |
| Preuves | `tests/fast-capacity-admission-fastcapadm01.test.mjs` |
| Fumée après déploiement | `/fast-interaction` 200, corps invalide 400, origine refusée 403, préflight 204, `/decision` 200 |
| Vérifié en production | plan rapide `provider_order: ["groq"]` ; `/decision` `["groq","anthropic","openai"]` |

Aucun secret n'apparaît dans ce rapport, dans les mesures ou dans les journaux : les
observations ajoutées sont *metadata seule* — décision d'admission, motif, horodatage
d'échéance, force du pré-contrôle — et ne transportent ni prompt, ni réponse, ni clé.

---

## 9. Action suivante

**`DEEP-TOKEN-COST-01` reste la preuve manquante**, et ce lot ne l'a pas déplacée. Le
mécanisme livré ici évite de harceler un fournisseur saturé ; il ne dit rien de la part que le
plan profond prend sur le même budget. Tant que ce nombre manque, le contrat de capacité de la
bêta reste un majorant.
