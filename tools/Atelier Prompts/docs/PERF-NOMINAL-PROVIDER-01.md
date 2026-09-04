# PERF-NOMINAL-PROVIDER-01 — Latence nominale du plan rapide, par fournisseur

**Objet :** mesurer la latence réelle du plan rapide sur Groq, Anthropic et OpenAI
**hors saturation**, sur les mêmes fixtures, pour comparer les fournisseurs sur une base
équitable et indépendante des limites de débit.

**Ce lot ne mesure pas la capacité.** Ni saturation, ni jetons/minute nécessaires en
production, ni utilisateurs simultanés, ni pic. Ces questions appartiennent au SLA de
capacité, qui reste indéfini.

---

## 1. Pourquoi ce lot existait

PERF-CAPACITY-DECISION-01 a établi que le banc historique confondait deux contrats : il
poussait le système à environ 2,9 fois sa capacité souscrite, puis notait le p95 obtenu
contre un contrat écrit pour l'interaction d'un utilisateur. Il laissait deux questions
sans réponse mesurée :

1. **Le contrat de 3 secondes tient-il quand le fournisseur n'est pas saturé ?**
   Jamais éprouvé — la seule lecture disponible était une population résiduelle.
2. **Anthropic est-il vraiment lent, ou seulement mal mesuré ?** Ses 27 échantillons
   avaient tous été pris sous saturation, en seconde tentative, après un 429 de Groq.

Ce lot répond aux deux, par la mesure.

---

## 2. Protocole

| Élément | Valeur |
| --- | --- |
| Classes | 6 — SIMPLE, VAGUE, RICHE, CONFIRMATION, ORIENTATION, INCONNU_VALIDE |
| Répétitions | 8 par classe |
| Officiels par fournisseur | **48** |
| Total officiel | **144** |
| Ordre | ROUND_ROBIN — deux appels consécutifs ne portent jamais la même classe |
| Chauffes | 3 par fournisseur, **exclues** des officiels |
| Fixtures | identiques entre fournisseurs, même contenu, même ordre, mêmes `sequence_index` |
| Horloge | `process.hrtime.bigint()` — monotone |
| Percentile | rang le plus proche, `ceil(p/100 × N)` |
| TTFI | envoi HTTP client → réception d'une candidate rapide valide (réseau + Worker + fournisseur + parsing + schéma) |
| Ordre des runs | groq, puis anthropic, puis openai |
| Conditions | même machine, même réseau, même Worker, même fenêtre horaire, même instrumentation |

Les seuils du contrat interactif sont **inchangés**, repris tels quels de PERF-REAL-01B :
p50 ≤ 2 000 ms préféré, p95 ≤ 3 000 ms requis, 3 000–5 000 ms dégradé, > 5 000 ms non conforme.

### Épinglage du fournisseur

Le banc doit pouvoir n'interroger qu'un fournisseur, sans repli. Le mécanisme retenu est
la variable de Worker `FAST_BENCH_PROVIDER`, **exactement le contrat que `/decision`
possède déjà** depuis R5.1 — le lot n'invente pas une seconde architecture de sélection :

- absente ou `"ha"` → chaîne HA complète, comportement de production inchangé ;
- `"groq" | "anthropic" | "openai"` → fournisseur épinglé, **aucun repli** : la chaîne ne
  contient qu'une entrée, il n'existe donc rien vers quoi basculer ;
- toute autre valeur → erreur de configuration explicite, **aucun appel réseau**.

Ce n'est pas une fonctionnalité utilisateur. La variable ne se transmet par aucun en-tête,
aucun paramètre d'URL, aucun champ de corps ; ni l'artefact canonique ni la porte réseau
n'en connaissent l'existence ; et elle est résolue **avant** que le moindre octet de la
demande soit regardé — elle ne peut donc dépendre ni du contenu, ni du domaine, ni du mode.
La valeur déclarée du Worker est `"ha"`, et le Worker y a été **rendu** après la dernière
mesure (version `b9ef1d53-0492-40fb-98b3-7abcfb823ca3`).

### Cadence, et pourquoi celle-là

Le lot exige une cadence **non saturante**, choisie par fournisseur et justifiée. Elle vaut
**3 200 ms pour les trois** — non par facilité, mais parce que la même valeur est
non saturante pour chacun, ce qui rend en outre les trois runs comparables :

| Fournisseur | Limite déclarée observée | Demande du banc à 3 200 ms | Marge |
| --- | --- | --- | --- |
| Groq | 8 000 jetons/min, 1 000 req | ~16,4 appels/min ≈ 7 000 jetons/min | ~12 % — la seule marge étroite, surveillée |
| Anthropic | 10 000 req/min, 10 000 000 jetons d'entrée/min, 2 000 000 de sortie | ~9,1 appels/min ≈ 9 200 jetons/min | > 99,9 % |
| OpenAI | 5 000 req/min, 1 000 000 jetons/min | ~8,0 appels/min ≈ 2 900 jetons/min | > 99,7 % |

Pour Groq, la marge de 12 % a été **vérifiée en cours de route** et non supposée : le
budget restant est resté stable autour de 7 540/8 000 pendant les 51 invocations.

### Règle de validité

Un run n'est nominal que si les sept termes suivants sont vrais **ensemble** : 48
échantillons, zéro 429, zéro signal de capacité, fournisseur épinglé, zéro bascule, zéro
exception, cadence documentée. Un 429 ne fait pas perdre un échantillon — il fait perdre
au run le droit de s'appeler nominal.

**Aucun run n'a eu à être rejoué.**

---

## 3. État de capacité aux deux bouts

| Fournisseur | Départ | Fin |
| --- | --- | --- |
| Groq | 7 318 / 8 000 jetons, 746 / 1 000 requêtes | 7 541 / 8 000 jetons, 696 / 1 000 requêtes |
| Anthropic | 9 999 / 10 000 req, 9 999 000 / 10 000 000 jetons d'entrée | identique |
| OpenAI | 4 999 / 5 000 req, 999 763 / 1 000 000 jetons | identique |

Aucun budget n'a approché l'épuisement. C'est la preuve que ces trois mesures sont
nominales, et non des mesures de saturation déguisées.

---

## 4. Résultats

| Fournisseur | Modèle | p50 | p95 | max | Succès | 429 | Jetons p50 | Contrat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Groq** | `openai/gpt-oss-20b` | **467,3 ms** | **1 617,0 ms** | 2 064,5 ms | 48/48 | 0 | 426 | **TENU** |
| **OpenAI** | `gpt-5.6-sol` | 2 186,2 ms | 4 234,2 ms | 5 914,0 ms | 48/48 | 0 | 362 | DÉGRADÉ |
| **Anthropic** | `claude-sonnet-4-6` | 3 155,3 ms | 5 561,8 ms | 6 515,0 ms | 48/48 | 0 | 1 144 | NON CONFORME |

### Répartition des TTFI

| Fournisseur | ≤ 1 s | 1–2 s | 2–3 s | 3–5 s | > 5 s |
| --- | --- | --- | --- | --- | --- |
| Groq | **44** | 2 | 2 | 0 | 0 |
| OpenAI | 0 | 14 | 29 | 4 | 1 |
| Anthropic | 0 | 3 | 16 | 25 | 4 |

### Classement contractuel

| Fournisseur | p50 ≤ 2 000 | p95 ≤ 3 000 | Dégradé | Non conforme | Run valide | Niveau de preuve |
| --- | --- | --- | --- | --- | --- | --- |
| Groq | **OUI** | **OUI** | non | non | OUI | **HAUT** |
| OpenAI | non | non | **OUI** | non | OUI | **HAUT** |
| Anthropic | non | non | non | **OUI** | OUI | **HAUT** |

---

## 5. Ce que la mesure établit

**Le contrat interactif tient — chez Groq, et hors saturation.** p95 = 1 617 ms pour un
budget de 3 000, avec 44 appels sur 48 sous la seconde. C'est la mesure que le contrat de
3 secondes attendait depuis PERF-03A, et elle n'avait jamais été prise. Elle confirme
l'hypothèse centrale de PERF-CAPACITY-DECISION-01 : ce que les sept lots précédents
mesuraient n'était pas la latence du plan rapide, c'était le coût de la saturation.

| Mesure du plan rapide sur Groq | p95 |
| --- | --- |
| 01B — banc saturant | 3 245,3 ms |
| 01D — banc saturant | 3 394,9 ms |
| 01F — banc saturant, bascule immédiate | 3 947,0 ms |
| 01G — quatre politiques, banc saturant | 3 261 à 5 020 ms |
| **Ce lot — banc nominal** | **1 617,0 ms** |

**Anthropic ne peut pas servir le plan rapide, et ce n'était pas un artefact de mesure.**
C'était le doute légitime que 01F et 01G laissaient ouvert : ses 27 échantillons étaient
des secondes tentatives prises pendant que le système saturait. Cette fois, il a été
mesuré seul, reposé, en première tentative, sans un seul 429 : **p95 = 5 561,8 ms,
p50 = 3 155,3 ms, aucun appel sous 1,9 s**. Il est *non conforme* au contrat interactif —
un cran plus bas que « dégradé ». La réponse `NOT_YET` de PERF-CAPACITY-DECISION-01
devient, pour la latence, un **NON mesuré**.

**OpenAI est dégradé, mais c'est le moins cher en jetons.** p95 = 4 234,2 ms : au-dessus du
contrat, sous le seuil de non-conformité. Il consomme 362 jetons par appel, soit **15 % de
moins que Groq** et **68 % de moins qu'Anthropic**. Il n'est pas un candidat de latence, il
est un candidat de repli à considérer le jour où la capacité, et non la vitesse, sera la
question.

**Le coût en jetons du même prompt varie de 2,8 × selon le transport.** Entrée : OpenAI 287,
Groq 368, Anthropic **1 013**. Le prompt rapide est identique dans les trois cas ; ce qui
change est l'enveloppe du mécanisme de sortie structurée — l'outil Anthropic est
substantiellement plus verbeux que le schéma JSON des deux autres. Cette observation
appartient au futur dossier de capacité : elle signifie qu'un jeton de plan rapide n'a pas
le même prix selon le fournisseur qui le sert.

### Plancher de qualité

Les 144 succès respectent le même schéma à deux champs, avec un type parmi les cinq
autorisés et un texte non vide. Aucun READY, aucune route, aucune exécution, aucune fuite
de contrôle interne : `FAST_AUTHORITY_WRITES = 0`, `SCHEMA_INVALID_SUCCESS_COUNT = 0`.

**Une différence de comportement est relevée sans être notée.** La distribution des types
diffère nettement d'un fournisseur à l'autre :

| Fournisseur | ACKNOWLEDGE | ASK_CLARIFICATION | ORIENT_ARCHITECTE | WAIT_FOR_DEEP_VALIDATION |
| --- | --- | --- | --- | --- |
| Groq | 44 | 4 | 0 | 0 |
| Anthropic | 4 | 29 | 14 | 1 |
| OpenAI | 9 | 30 | 9 | 0 |

Groq accuse réception là où les deux autres demandent une clarification. **Ce lot ne dit pas
laquelle est meilleure** : aucune similarité floue, aucun score automatique, aucun juge
LLM. Tous les types sont contractuellement valides. C'est une observation, marquée comme
non autoritative, qui mériterait une revue humaine séparée si le choix de fournisseur
devait un jour dépendre d'autre chose que de la latence.

---

## 6. Ce que la mesure n'établit pas

```
NOMINAL_LATENCY_PROVEN = YES
CAPACITY_PROVEN        = NO
```

Ce lot n'a **rien saturé**. Il ne sait donc rien de la capacité maximale, du point de
saturation, des jetons/minute nécessaires en production, du nombre d'utilisateurs
simultanés soutenables, ni du pic. `CAPACITY_SLA_DEFINED = NO`, et
`EXPECTED_PEAK_TPM = UNKNOWN`.

Il ne dit pas non plus que les trois modèles sont équivalents : il mesure la latence de la
**configuration réellement envisagée** pour le plan rapide, modèle compris.

`PERF-REAL-01` **reste ouverte**. Ce lot en referme la moitié latence — le contrat est
tenable, et par qui — et laisse entière la moitié capacité.

---

## 7. Recommandation

**`NOMINAL_FAST_PROVIDER_CANDIDATE = GROQ`** — seul fournisseur à tenir le contrat, et de
loin : son p95 vaut 38 % du budget, quand le deuxième le dépasse de 41 %. Aucun départage
n'a eu à être inventé : un seul passe.

Ce n'est **pas** une décision d'adoption. Groq était déjà primaire ; ce lot ne change ni
l'ordre, ni le primaire, ni un quota, ni un routage. Il explique pourquoi le primaire
actuel est le bon choix de latence, et il retire deux options du dossier de capacité :
Anthropic ne peut pas devenir primaire du plan rapide pour des raisons de latence, et
OpenAI ne le peut pas non plus.

**Ce que cela change pour la suite.** PERF-CAPACITY-DECISION-01 avait classé A (acheter de
la capacité Groq) en deuxième position derrière F (séparer les SLA). F est désormais fait
pour sa moitié latence. La conséquence est que les options de **répartition** — D, la
distribution proactive, et la bascule de capacité C — perdent leur attrait : toute requête
détournée de Groq atterrit chez un fournisseur mesuré à 4,2 s ou 5,6 s de p95. Répartir ne
peut pas préserver le contrat interactif ; seule la capacité chez Groq le peut, ou une
infrastructure rapide dédiée (option E) dont ce lot ne dit rien.

**Prochaine preuve nécessaire :** le banc de saturation de la section 52 du lot précédent —
mêmes fixtures, Groq épinglé, débits dérivés d'une cible de charge produit énoncée — pour
déterminer le point de saturation réel de l'abonnement et donc le quota exact à acheter. Il
ne peut pas être conçu avant que la cible existe.

---

## 8. Traçabilité

| Élément | Valeur |
| --- | --- |
| Worker | `atelier-decision-groq` |
| Version — run Groq | `b23abe59-d97a-4a49-b645-e189a173d596` |
| Version — run Anthropic | `3c3d4cdf-c6c3-4087-be31-4b636e6ddc1a` |
| Version — run OpenAI | `8307d5eb-f7d0-4d4b-b716-19c944760fa1` |
| Version restaurée (défaut `ha`) | `b9ef1d53-0492-40fb-98b3-7abcfb823ca3` |
| Mesures brutes | `evaluation/perf-nominal-provider-01/results.json` |
| Preuves | `tests/nominal-provider-latency-perfnominal01.test.mjs` |
| Attribution | `wrangler tail --format json`, 51 invocations tracées par fournisseur, 100 % |

Aucun secret n'apparaît dans ce rapport, dans les mesures ou dans les journaux : les
observations ajoutées au Worker sont *metadata seule* — statuts, durées, compteurs, budgets
déclarés — et ne transportent ni prompt, ni réponse, ni clé.
