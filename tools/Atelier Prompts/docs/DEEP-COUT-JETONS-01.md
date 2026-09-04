# DEEP-TOKEN-COST-01 — Le coût réel d'un tour profond

> **Pourquoi ce fichier ne porte pas le nom du lot.** La règle d'hygiène du dépôt
> — `**/*token*` dans `.gitignore`, posée pour qu'aucun fichier portant « token »,
> « secret » ou « password » ne puisse être suivi par inadvertance — bloquait
> `DEEP-TOKEN-COST-01.md`. Elle est volontairement grossière, et elle a raison de
> l'être : c'est au document de s'écarter, jamais à la garde de s'assouplir. Même
> décision qu'en PERF-REAL-01E, et pour la même raison. Les mesures brutes vivent
> dans `evaluation/deep-cout-jetons-01/`, les preuves dans
> `tests/deep-cout-jetons-deeptok01.test.mjs`.


**Question :** combien de jetons consomme réellement un tour profond complet sur Groq ?

**Réponse mesurée : un tour médian coûte 16 015 jetons — deux fois le budget d'une minute
entière.** Au p95, il en coûte 103 894, soit treize fois ce budget. Et la conséquence était
déjà là, sans que personne ne l'ait vue : **le plan profond ne tourne déjà plus majoritairement
sur Groq.** 77,7 % de ses jetons sont servis par Anthropic, par bascule automatique, en
fonctionnement nominal.

**Aucun code de production n'a été modifié. Aucun déploiement. Aucune migration.**
L'instrumentation existante suffisait.

Ce document **n'est pas une autorité**. Aucun code ne le lit. OPRIE reste l'autorité
sémantique unique.

---

## A. Inventaire réel

| Élément | État constaté |
| --- | --- |
| Route | `/operational-request` |
| Séquence | `analyst → critic → arbiter`, **toujours complète**, aucun court-circuit |
| Ordre fournisseur des rôles | `groq → anthropic → openai` — inchangé |
| Analyste | mono-appel |
| **Critique** | **pipeline batché : 1 appel global + N appels de lot** |
| Arbitre | mono-appel |
| OPRIE = appel fournisseur séparé ? | **NON** |

`OPRIE_PROVIDER_CALL = NO`, et ce n'est pas une approximation : `OPRIE_ROLES` **est**
`["analyst", "critic", "arbiter"]`. Il n'existe aucun quatrième appel. Par conséquent
**`DEEP_FULL_AUTHORITY_TURN = DEEP_CORE_TURN`**, à l'identique — les deux métriques que le lot
demandait de ne pas confondre se trouvent être la même, et il fallait le vérifier pour le dire.

---

## B. Modèles

| Rôle | Fournisseur primaire | Modèle |
| --- | --- | --- |
| Analyste | Groq | `openai/gpt-oss-20b` |
| Critique | Groq | `openai/gpt-oss-20b` |
| Arbitre | Groq | `openai/gpt-oss-20b` |
| *(bascule)* | Anthropic | `claude-sonnet-4-6` |
| *(bascule)* | OpenAI | `gpt-5.6-sol` |

Les trois rôles partagent le même modèle Groq — vérifié plutôt que supposé, comme la section 5
l'exigeait.

---

## C. Fixtures

Le corpus de régression **existant** a été réutilisé : `evaluation/corpus-lot10g2a.json`,
30 cas. Aucun corpus ad hoc n'a été inventé. Douze cas ont été retenus, répartis sur les cinq
catégories qu'il contient :

| Catégorie | Cas retenus |
| --- | --- |
| suffisante | 3 |
| matériau présent | 2 |
| ouverte | 3 |
| matériau absent | 2 |
| ambiguïté non substituable | 2 |

---

## D. Méthode

Les jetons proviennent **exclusivement des compteurs d'usage du fournisseur**, relevés en
metadata seule. Aucune estimation, aucune conversion caractères → jetons, aucun tokenizer local.

L'instrumentation nécessaire **existait déjà** (PERF-REAL-01E pour Groq, PERF-NOMINAL-PROVIDER-01
pour Anthropic et OpenAI) : ce lot n'a donc rien ajouté. `PRODUCTION_CODE_CHANGED = NO`,
`DEPLOY_PERFORMED = NO`.

**Cadence : 120 secondes entre deux tours.** Justification : un tour dépasse le budget d'une
minute, et la fenêtre Groq se reconstitue en 3 à 28 secondes ; 120 s garantissent qu'un tour
démarre toujours sur un budget plein. **La saturation observée est donc intrinsèque au coût
d'un tour, jamais provoquée par la cadence du banc.**

---

## E. Résultats par rôle — 12 tours complets

| Rôle | Appels/tour (min–p50–max) | Entrée p50 | Sortie p50 | Total p50 | Total p95 | Total max |
| --- | --- | --- | --- | --- | --- | --- |
| Analyste | 1 – 1 – 1 | 2 738 | 685 | **3 641** | 5 022 | 5 022 |
| **Critique** | **1 – 2 – 13** | 6 047 | 939 | **6 986** | **85 331** | **85 331** |
| Arbitre | 1 – 1 – 2 | 4 380 | 915 | **5 781** | 14 766 | 14 766 |

**Le Critique est le coût, et sa variance est le vrai sujet.** Son pipeline batché émet de 1 à
**13 appels** selon le nombre d'issues que l'Analyste a marquées « question » — donc selon la
demande, pas selon un réglage. Entre le tour le moins cher et le plus cher, son coût varie d'un
facteur **39**. Les deux autres rôles sont, eux, remarquablement stables.

---

## F. Résultats par tour — `DEEP_CORE_TURN`

| Mesure | Valeur |
| --- | --- |
| n | 12 tours complets, 0 incomplet |
| min | **7 820 jetons** |
| **p50** | **16 015 jetons** |
| **p95** | **103 894 jetons** |
| max | 103 894 jetons |
| moyenne | 31 396 jetons |
| entrée p50 / sortie p50 | 13 408 / 2 829 |
| appels fournisseur par tour | 3 (min) – 4 (p50) – 15 (max) |
| latence worker | p50 32,6 s, max 218,5 s |

**Même le tour le moins cher jamais observé — 7 820 jetons — occupe 98 % du budget d'une
minute.** Il n'existe donc, dans ce corpus, aucun tour profond que le quota Groq puisse
absorber confortablement.

---

## G. Reprises et bascules

`RETRY_COUNT = 7`. `FAILOVER_COUNT = 19`. `INCOMPLETE_DEEP_TURN_COUNT = 0`.

### Attribution des jetons — le résultat qui reformule le dossier

| Fournisseur | Jetons consommés | Part |
| --- | --- | --- |
| Groq | 83 870 | **22,3 %** |
| **Anthropic** | **292 887** | **77,7 %** |
| OpenAI | 0 | 0 % |

**Le plan profond ne tient déjà pas sur Groq.** Ce n'est pas une projection : sur 12 tours
nominaux, plus des trois quarts de ses jetons ont été servis par Anthropic — non par panne du
fournisseur, mais parce que le budget Groq s'épuise **en cours de tour**, souvent dès le
deuxième ou troisième appel.

La « migration du plan profond vers Anthropic » que les deux lots précédents envisageaient
comme une décision à prendre **a donc déjà eu lieu**, de fait, sans avoir été décidée, mesurée
ni choisie. Elle s'exécute aujourd'hui par le mécanisme de repli, c'est-à-dire au pire moment :
après avoir payé un aller-retour Groq perdu.

### Classes d'échec observées

| Classe | Occurrences |
| --- | --- |
| `arbiter / groq / technical_failover` | 7 |
| `critic / groq / technical_failover` | 6 |
| `analyst / groq / technical_failover` | 3 |
| `analyst / groq / request_rejected` | 2 |
| `arbiter / groq / structured_output_invalid` | 1 |

Trois erreurs d'API Groq ont été journalisées : deux `400 json_validate_failed`, et — le signal
le plus parlant du lot — **un `413` portant le code `rate_limit_exceeded`**. Groq rend ce statut
lorsqu'une requête **unique** dépasse à elle seule la limite de jetons par minute. C'est la
confirmation directe, par le fournisseur lui-même, qu'un appel du plan profond peut excéder le
budget d'une minute entière.

**Limite d'observabilité, énoncée plutôt que masquée.** Seize échecs sont classés
`technical_failover` mais trois erreurs d'API seulement sont journalisées : le chemin
d'épuisement 429 de `fetchGroqWithRetry` lève son erreur **avant** toute journalisation
d'erreur d'API. La répartition exacte entre épuisement 429 et autres causes techniques n'est
donc **pas observable** avec l'instrumentation actuelle. Ce lot le constate et ne le comble pas :
combler cela serait modifier du code de production, ce que son périmètre exclut.

---

## H. Implications de contention Groq

`FAST_P50_TOKENS_REFERENCE = 426` (observationnel, PERF-NOMINAL-PROVIDER-01).

| Rapport | Valeur |
| --- | --- |
| Deep p50 / Fast p50 | **37,6 ×** |
| Deep p95 / Fast p50 | **243,9 ×** |

**Capacité théorique** contre le quota déclaré de **8 000 jetons/minute**, uniquement si Groq
était réservé au plan profond — ordre de grandeur, jamais une règle produit :

| Base | Tours profonds par minute |
| --- | --- |
| p50 (16 015 jetons) | **0,50** |
| p95 (103 894 jetons) | **0,08** |

Un seul tour profond médian consomme **deux fois** le quota d'une minute. Au p95, **treize
fois**.

### Classification — dérivée du quota, pas d'un seuil inventé

La règle est prise dans le fournisseur lui-même : *dominant* signifie qu'**un seul tour dépasse
le budget d'une minute entière**. C'est un fait mesurable, pas un palier choisi.

```
DEEP_COST_DOMINANT
```

Le tour médian vaut 2,00 × le quota ; le p95 vaut 12,99 × ; et même le minimum observé en
occupe 98 %. Aucune des trois autres classes ne peut être soutenue par ces nombres.

### Ce que cela dit du contrat de capacité de la bêta

Le contrat calculé au lot précédent supposait un plan rapide disposant d'une part du budget,
le reste allant au profond. Cette lecture ne tient plus : **il n'y a pas de « reste »**. Au pic
rapide, 2 180 jetons/minute demeuraient — le tour profond le moins cher jamais observé en
coûte 7 820, soit 3,6 fois plus. Le plancher structurel de 1 455 jetons estimé alors était
**cinq fois trop bas**, et l'estimation le disait conservatrice sans savoir à quel point.

Les deux plans ne se partagent pas un budget : **le plan profond le dépasse à lui seul**.

---

## I. Limites

1. **Douze tours.** Le p95 repose sur le maximum observé — il décrit la queue mesurée, pas une
   distribution asymptotique. Le coût du Critique dépendant du nombre d'issues, un corpus plus
   large déplacerait ce chiffre.
2. **La répartition 429 / autres causes techniques n'est pas observable** (voir G).
3. **Ce lot ne mesure pas la capacité soutenue.** Les tours sont espacés de 120 s ; rien ici ne
   dit ce qui se passe quand deux tours profonds se chevauchent.
4. **Les jetons Anthropic sont comptés, mais leur quota ne l'est pas.** Anthropic déclare
   10 000 000 jetons d'entrée par minute : les 292 887 consommés n'y représentent rien. Ce lot
   ne mesure pas la pression sur Anthropic parce qu'il n'y en a pas.
5. **Aucune conclusion de qualité.** Que 77,7 % des jetons profonds soient servis par
   `claude-sonnet-4-6` plutôt que par `openai/gpt-oss-20b` a des conséquences sémantiques que
   ce lot **ne mesure pas** et ne juge pas.

---

## J. Action suivante

`DEEP_SEPARATION_FROM_FAST_SUPPORTED_BY_EVIDENCE = YES` — et la preuve est plus forte que ce
que la séparation supposait. La question n'est plus « faut-il séparer les deux plans ? » mais
« faut-il continuer à faire semblant que le plan profond tourne sur Groq ? ».

**`OPRIE-QUALITY-PARITY-01` devient la preuve manquante, et elle est désormais urgente pour une
raison inattendue :** 77,7 % des jetons profonds sont **déjà** servis par Anthropic. La qualité
des sorties OPRIE sous ce modèle n'est donc plus une question hypothétique conditionnant une
migration future — c'est une propriété **actuelle et non mesurée** de la production.

Ce lot ne lance pas ce chantier. Il constate que le sujet a changé de nature.
