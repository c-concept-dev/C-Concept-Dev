# Dettes ouvertes — Atelier Prompts

Ce fichier existe pour une raison précise : CLEAN-05 a montré que deux des trois
dettes officielles ne vivaient que dans l'historique des lots. Une dette qui
n'existe que dans une conversation finit par disparaître avec elle.

Ce registre **n'est pas une autorité**. Il ne décide rien, aucun code ne le lit,
et il ne remplace aucun contrat. Il énumère, et il est vérifié par
`tests/format-structural-verifiability-formatstruct01.test.mjs` — de sorte qu'une
dette ne puisse ni s'ajouter ni disparaître en silence.

## Ouvertes

### PERF-REAL-01
Les mesures de performance du produit sont **structurelles**, pas réelles :
PERF-03A et PERF-04 prouvent que le plan rapide ne retarde pas le plan profond et
que les gardes de tour tiennent, mais aucune mesure n'est prise sur un parcours
réel, avec un fournisseur réel, sur un échantillon suffisant. Tant que cette
mesure n'existe pas, aucune affirmation de latence utilisateur n'est opposable.

**Mise à jour du 4 septembre 2026 — tentative de mesure, cause trouvée, dette
maintenue.** La route `/fast-interaction` rendait 404 en production : la porte de
PERF-04 n'avait jamais été déployée. Elle l'a été (worker `atelier-decision-groq`,
version `6bdbe2ec-2910-427f-b013-59fa7152cf4a`). La route répond désormais, refuse
ce qu'elle doit refuser et n'invente rien — mais elle n'atteint aucun fournisseur.

La cause est une **jointure de chaîne rompue** :
`runFastInteractionWithHaChain` construit ses entrées sous la clé `run`, tandis
que `runProviderChain` les consomme sous la clé `execute`. La première tentative
lève `execute is not a function`, classée `programming_error` — une classe
volontairement non éligible au repli, parce qu'un défaut de contrat n'est pas une
panne de fournisseur. La chaîne s'arrête donc avant Groq, et douze requêtes réelles
réparties sur six classes de demande ont toutes rendu 502 `fast_interaction_failure`.

Aucune interaction rapide n'étant jamais produite, il n'existe aucun instant de
première interaction à chronométrer : **le TTFI reste non mesurable**, et aucun
seuil du contrat interactif n'est applicable. Les preuves locales n'avaient pas vu
le défaut parce qu'elles vérifiaient la *présence textuelle* de
`runProviderChain({ role: "fast_interaction"` dans la source, sans jamais exécuter
la jointure.

**Mise à jour PERF-REAL-01A — le bloquant est levé, la dette reste ouverte.** La
clé a été alignée sur `execute`, le contrat canonique déjà employé par les deux
autres appelants de la chaîne ; aucun alias de compatibilité n'a été ajouté.
Une preuve *exécutée* de la jointure remplace la vérification textuelle qui avait
laissé passer le défaut. Le worker a été redéployé
(`6ecc4c97-0d54-4c11-a32a-43e0ac802df9`) et `/fast-interaction` atteint désormais
un vrai fournisseur : six requêtes réelles, six réponses 200 au schéma à deux
champs, Groq au premier essai.

Ce qui reste dû est la **mesure elle-même** : six appels ne sont pas un
échantillon. Aucun p50, aucun p95, aucun verdict sur le contrat interactif. Le lot
suivant reprend PERF-REAL-01 à sa section « mesure », avec au moins trente points.

**Mise à jour PERF-REAL-01B — mesurée, et dégradée.** 48 échantillons réels,
6 classes × 8, tour de rôle, 3 chauffes exclues, 700 ms d'espacement, horloge
monotone, percentile au rang le plus proche — plan et seuils figés avant le premier
appel.

| Mesure | Valeur | Contrat |
| --- | --- | --- |
| p50 | 472,9 ms | ≤ 2 000 ms — **tenu** |
| p95 | **3 245,3 ms** | ≤ 3 000 ms — **non tenu** |
| max | 3 328 ms | — |
| succès | 47 / 48 (97,9 %) | — |
| > 5 s | 0 | — |
| > 10 s | 0 | — |

`3 000 < p95 ≤ 5 000` : la bande **DÉGRADÉE**. Trente-et-un appels sur quarante-sept
rendent en moins d'une seconde, neuf dépassent trois secondes, et onze des douze plus
lents portent les index de séquence 38 à 47 — la lenteur est corrélée à la POSITION
dans la série, pas au type de demande. Une explication compatible existe (la politique
429 / Retry-After de Groq) ; elle n'est pas établie, l'attribution par échantillon
ayant manqué.

Le repli, l'épuisement fermé, la frontière d'autorité et la péremption sont tous
vérifiés et intacts. `REAL_PROVIDER_TTFI_PROVEN = YES` : la latence réelle est
désormais connue. C'est le contrat qui n'est pas tenu, pas la mesure qui manque.

Rien n'a été optimisé : ce lot mesurait. La suite est une décision produit, puis un
lot d'optimisation distinct.

**Mise à jour PERF-REAL-01C — la cause est prouvée.** Attribution complète, 48/48,
fournisseur, tentative et reprises. La queue est portée en totalité par les 429 de
Groq : 14 échantillons sur 48 en ont vu un, chacun a fait exactement une reprise et
honoré une attente de 2 750 ms — les 2 000 ms annoncés par Groq plus la marge de
sûreté de 750 ms du worker. Les douze plus lents sont exactement les douze premiers
retriés.

| Population | n | p95 |
| --- | --- | --- |
| sans reprise | 34 | **1 535,3 ms** — le contrat serait tenu |
| avec reprise | 14 | **4 009,5 ms** |

Les deux populations ne se recouvrent pas. La pression monte au fil de la série —
0, 0, 5 puis 9 réponses 429 par quart — ce qui explique ce que 01B avait vu comme
un effet de position.

Écartées par la mesure : bascule de fournisseur (48/48 sur groq, `attempt_index` 0),
saturation ou concurrence (régulateur à 0 ms), effet d'isolat et réseau client
(le `wallTime` du worker suit la latence fournisseur à la milliseconde).

Une instrumentation *metadata-only* a été ajoutée au worker pour rendre cela
observable — `fetchGroqWithRetry` calculait déjà ces nombres, le chemin de succès
les jetait. Aucun comportement modifié, aucun délai ajouté
(déploiement `81617950-d862-42fa-be5d-b04eb9ef5271`).

Rien n'a été corrigé : le levier existe mais chaque option — réduire la pression,
revoir la marge de 750 ms, basculer plus tôt, accepter la bande dégradée — change un
contrat. C'est une décision produit.

**Mise à jour PERF-REAL-01D — l'optimisation n'a pas eu lieu, et la cause finale
n'est pas dans le code.** L'audit du contrôle de débit M-03 montre qu'il n'a rien à
offrir au chemin Fast : son stimulateur y est créé et attendu mais **inerte**
(`recordWaitMs` n'a aucun appelant de production, depuis la correction R2.1), il
refuse par doctrine écrite d'inventer une fenêtre de débit, et sa seule autre
capacité — la concurrence bornée — s'applique à un lot, là où le Fast traite une
requête par invocation. L'écart est de **contrat**, pas de câblage.

Le relevé des en-têtes de Groq donne la cause finale : **8 000 jetons par minute**
déclarés, contre environ 14 000 demandés par le banc. Le budget de jetons est tombé
à 52 sur 8 000 pendant que 934 requêtes sur 1 000 restaient disponibles — la
contrainte qui mord est le débit de jetons, pas le nombre d'appels. Aucun
stimulateur ne crée de jetons : il ne pourrait que déplacer l'attente avant l'appel,
ce que le lot exclut lui-même comme succès.

Rebenchmark au protocole identique : p50 = 527,5 ms, **p95 = 3 394,9 ms**, 48/48
succès, attribution 48/48 sur les quatre dimensions. 21 réponses 429 contre 14 en
01C — pire, sans qu'une ligne de politique ait bougé. Les populations restent
disjointes : sans reprise p95 = **529,3 ms**, avec reprise p95 = 3 626,7 ms.

Quatre voies, toutes des décisions produit : augmenter la capacité souscrite,
réduire le coût en jetons d'un appel Fast, répartir la charge entre fournisseurs, ou
constater que 1,4 requête par seconde soutenue n'est pas un profil interactif.
Construire une fenêtre TPM à partir des en-têtes désormais relevés serait possible
et non inventé, mais c'est un changement d'architecture que M-03 a explicitement
décidé de ne pas avoir.

**Mise à jour PERF-REAL-01E — la deuxième voie est fermée par l'arithmétique.** La
comptabilité du fournisseur, relevée plutôt qu'estimée, donne **425 jetons** par
appel (p50) : 367 d'entrée, 59 de sortie, `finish_reason` toujours à `stop` — le
plafond de 512 n'est jamais atteint et ne coûte donc rien.

Le banc tourne à **54,4 appels/minute** (700 ms d'espacement + 402,7 ms de latence
nominale) et demande donc **23 120 jetons/minute** à un quota de 8 000. La capacité
autorise **147 jetons par requête**. Il faudrait en retirer **65,4 %**.

C'est impossible : en supprimant *intégralement* le prompt système — ce que le
contrat Fast interdit, mais qui borne le problème — un appel coûte encore
**192 jetons** (schéma 69, enveloppe de rôles imposée par l'API 46, demande la plus
courte 27, sortie la plus courte 50). 192 dépasse 147. Aucune version du prompt ne
change cette conclusion.

Rien n'a donc été amputé. Le payload était déjà minimal — ni contexte canonique, ni
exemples, ni verrous, ni schéma répété : `DUPLICATE_FAST_CONTEXT_COUNT = 0` avant
comme après. Et les 221 jetons du prompt système portent la non-autorité, la
discipline du dernier recours et l'énumération des types, qu'aucun autre mécanisme
n'impose.

`TOKEN_OPTIMIZATION_CAPACITY_FEASIBLE = NO`. Restent les deux voies de capacité :
augmenter le quota souscrit — à 24 000 TPM le banc actuel passerait sans qu'une
ligne change — ou répartir la charge entre fournisseurs, ce qui transforme un repli
technique en répartition.

Rapport détaillé : [PERF-REAL-01-REPORT.md](PERF-REAL-01-REPORT.md).
Mesures brutes : `evaluation/perf-real-01/results.json`.

## Fermées

| Dette | Fermée par | Ce qui a été établi |
| --- | --- | --- |
| ORCH-LEGACY-CLEAN-01 | CLEAN-01 | Le décideur conversationnel hérité, son appariement flou au seuil 0,6 et son repli « local proportionné » sont retirés du produit et du bundle. |
| FORMAT-STRUCT-01 | FORMAT-STRUCT-01 | Les trente-deux formats du registre gelé sont classés ; un seul est structurellement vérifiable (`json`) ; aucune règle non vérifiable ne peut produire un succès. |
| EXEC-PHASE-INSTRUMENT-01 | EXEC-PHASE-INSTRUMENT-01 | Fermée par `CLOSED_BY_BOUNDARY_PROOF` : la frontière d'exécution est prouvée, l'intérieur du moteur reste non observable. Limitation : `INTERNAL_ARCHITECTE_PHASES_NOT_INSTRUMENTED_DUE_FROZEN_RANGE`. |

### Ce que FORMAT-STRUCT-01 laisse mesuré, et non résolu

Deux phrases de validité du registre gelé sont **entièrement décidables** sans
lire le sens :

- `tableau_comparatif` — « En-tête et séparateur présents, même nombre de
  colonnes sur chaque ligne. »
- `list` — « Un élément par ligne, aucune ligne d'introduction. »

Elles ne sont pas implémentées, et la raison se mesure : le point où un format
reçoit sa forme structurelle pour le **seul chemin qui produit un livrable final**
— Architecte Pro — est `archVocabulaireStructurel`, situé **à l'intérieur de la
plage gelée du moteur Architecte**. L'étendre change le hash gelé.

Ce lot l'a vérifié de la seule façon honnête : en tentant la modification, en
constatant la rupture du hash, et en revenant à l'octet près. `T-FORMATSTRUCT-25`
localise ce blocage au caractère près.

Étendre la couverture du seul côté Rapide était techniquement possible et aurait
été pire : deux vocabulaires divergents pour un même registre, c'est-à-dire deux
réponses différentes à la même question.

**Le jour où le moteur Architecte est dégelé, ces deux formats sont les premiers
à traiter** — leur prédicat est déjà écrit, mot pour mot, dans le registre.

### Ce que EXEC-PHASE-INSTRUMENT-01 laisse mesuré, et non résolu

Le noyau de cycle connaît cinq phases — `READINESS`, `PROMPT_QG`, `EXECUTION`,
`OUTPUT_QG`, `TERMINAL` — et les impose dans un **ordre strict** : entrer dans
l'une exige d'avoir traversé la précédente, et sauter en refuse l'entrée
(`PHASE_SKIPPED`).

Or **trois de ces cinq phases se produisent à l'intérieur d'un seul appel**,
`archConstruireExecuter`, situé dans la plage gelée du moteur Architecte. Vu du
dehors, elles sont un seul événement.

Les deux mécanismes se combinent : une instrumentation **partielle** est refusée
par le noyau lui-même, et une instrumentation **complète** exigerait de modifier
une plage gelée. Le produit n'entre donc dans aucune phase, n'enregistre aucune
tentative fournisseur et n'applique aucun verdict terminal — et ne prétend nulle
part le contraire.

**Ce qui est prouvé se trouve à la frontière**, et couvre ce dont le produit
dépend : le cycle s'ouvre exactement une fois par tour, depuis l'unique endroit
qui pose le contrat canonique ; un tour périmé ne le rouvre pas ; un rejeu ne le
duplique pas ; une bascule de mode ne le duplique pas ; l'exécution réelle porte
son propre garde de ré-entrée, **hors gel** ; un résultat tardif ne réécrit pas
le premier ; et l'erreur technique ne se déguise jamais en succès.

**Le jour où le moteur Architecte est dégelé**, l'instrumentation des trois
phases internes devient possible sans rien inventer : le vocabulaire de phases
existe déjà, ordonné, dans `core/adn/execution-lifecycle.js`.
