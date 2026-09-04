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

**Mise à jour PERF-REAL-01F — la bascule coûte plus cher que l'attente.** Le 429 est
désormais traité comme un signal de capacité et non comme une panne : le plan rapide
abandonne immédiatement, sans dormir, et bascule vers Anthropic. Le mécanisme a fait
exactement ce qu'on lui demandait — 8 signaux, 8 bascules, 0 ms d'attente payée
contre 49 750 ms en 01D, attribution 48/48, aucune panne fournisseur.

Le résultat est pourtant moins bon :

| Mesure | 01D | 01F |
| --- | --- | --- |
| p50 | 527,5 ms | **416,1 ms** |
| **p95** | 3 394,9 ms | **3 947,0 ms** |
| max | 3 641,8 ms | **5 027,0 ms** |

Parce que ce lot livre enfin le chiffre qui manquait — **la première mesure réelle
d'Anthropic sur le plan rapide** : p50 = 3 435,9 ms, min 1 769,9 ms (8 points ;
le p95 y vaut le maximum). Groq seul rend 343,4 ms de médiane.

La règle du projet dit qu'attendre n'a de sens que si l'attente annoncée est
inférieure au coût de la bascule. **2 750 ms annoncés contre 3 436 ms de bascule :
attendre était le meilleur choix.** Le contrat de ce lot est dominé, non par erreur
de mise en œuvre, mais parce que le chiffre permettant de le savoir n'existait pas.

Ce que la mesure recommande, et qui n'a PAS été appliqué ici : le plafond d'attente
du plan rapide devrait valoir **1 000 ms** — le plus grand nombre rond strictement
inférieur à la bascule la plus rapide observée (1 769,9 ms), selon la règle qui a
déjà produit les quatre autres plafonds du produit. Il honorerait les `Retry-After`
courts que Groq annonce à 1 000 ms, et basculerait pour les longs. C'est la première
fois que cette valeur peut être dérivée d'une mesure plutôt que posée.

**Mise à jour PERF-REAL-01G — quatre seuils, aucun gagnant.** Le jeu fermé
{0, 1 000, 1 500, 2 000} ms a été mesuré au protocole identique, 48 échantillons
chacun, 192 au total, même code, seule la valeur de seuil changeant.

| Politique | Seuil | p50 | p95 | max | 429 | Bascules |
| --- | --- | --- | --- | --- | --- | --- |
| A | 0 ms | 336,8 ms | **3 336,3 ms** | 5 270,3 ms | 7 | 7 |
| B | 1 000 ms | 467,6 ms | **3 260,9 ms** | 5 242,9 ms | 7 | 7 |
| C | 1 500 ms | 405,1 ms | **5 020,2 ms** | 10 239,9 ms | 5 | 5 |
| D | 2 000 ms | 616,0 ms | **3 398,0 ms** | 3 611,6 ms | 0 | 0 |

`NO_CALIBRATION_WINNER = YES`. Aucune n'est retenue — la section 29 interdit
d'adopter la moins mauvaise, et le worker est revenu à son seuil par défaut déclaré.

**Pourquoi aucun seuil ne peut suffire :** il choisit entre attendre (2 750 ms) et
basculer (2,2 à 10,2 s selon les runs). Les deux branches dépassent le budget de
3 secondes dès que Groq sature. Le problème n'est ni la reprise, ni le seuil, ni le
payload — c'est qu'il n'existe aujourd'hui aucune voie sous 3 secondes lorsque le
fournisseur primaire est plein.

Deux limites enregistrées : un seul délai annoncé (2 000 ms) est apparu, si bien que
B et C se sont comportées comme A faute d'occurrence du cas qui les distingue ; et D
n'a rencontré aucun 429, donc n'a jamais exercé le mécanisme qu'elle devait mesurer.
Le relevé du budget déclaré, qui aurait permis d'établir la comparabilité des runs,
avait disparu en 01E lors d'un renommage de champs — il est rétabli, après coup.

**Mise à jour PERF-CAPACITY-DECISION-01 — la dette change de nature, elle ne se
ferme pas.** Ce lot n'a rien mesuré et rien codé : il a relu les preuves de 01B à 01G
et pris une décision. Deux constats la portent.

Le premier est que le banc **confond deux contrats**. À 700 ms d'espacement et
402,7 ms de latence nominale, il émet 54,4 appels par minute depuis un client unique
et sériel, soit environ 23 120 jetons par minute contre 8 000 souscrits — près de trois
fois la capacité. Sans concurrence et sans pause, ce n'est pas un banc de latence :
c'est un banc de **débit soutenu**, et son p95 global décrit un système qui sature son
propre fournisseur. La population non saturée, elle, tient le contrat : p95 = 1 535,3 ms
en 01C, 780,5 ms sur les 40 échantillons Groq de 01F. Le contrat de 3 secondes n'est
donc pas démenti — il n'a **jamais été éprouvé sous une charge énoncée**.

Le second est que la cible de capacité **n'existe pas**. Utilisateurs simultanés,
requêtes par seconde, pic, jetons par minute : tous inconnus, et ce lot s'interdit de
les inventer. `CAPACITY_TARGET_UNDEFINED = YES`.

S'y ajoute un fait relevé ici et jamais mesuré : le plan rapide et les trois rôles
OPRIE partagent **une seule clé, donc un seul budget de 8 000 jetons/min**, sans aucune
isolation. Les campagnes 01B à 01G ont bénéficié de la totalité de ce budget ; en
production, la part réelle du plan rapide ne peut être que plus petite.

Six options ont été comparées sur dix critères. La direction retenue est un
séquencement : séparer les deux contrats et corriger le protocole, obtenir la cible de
charge, acheter la capacité si le pic l'exige, isoler les deux plans si la contention
domine. La bascule sur signal de capacité est **conservée comme politique de
disponibilité** — elle a converti 192/192 signaux en réponses réussies — et retirée de
la notation du SLA de latence, qu'elle ne peut pas tenir. Anthropic primaire est
`NOT_YET` : ses 27 échantillons réels ont tous été pris sous saturation, par bascule,
et aucune mesure nominale n'existe.

Ce qui referme cette dette est nommé : un banc **nominal non saturé** — mêmes fixtures,
espacement porté à ≥ 3 200 ms pour rester sous le budget déclaré, zéro 429 comme
critère de validité — puis, la cible de charge une fois connue, un banc de saturation
distinct. Décision complète : [PERF-CAPACITY-DECISION-01.md](PERF-CAPACITY-DECISION-01.md).

**Mise à jour PERF-NOMINAL-PROVIDER-01 — la moitié latence de la dette est
refermée ; la moitié capacité reste entière.** Pour la première fois, le plan rapide a été
mesuré **hors saturation** : 144 échantillons officiels, 48 par fournisseur, mêmes fixtures,
même ordre, mêmes index, 3 chauffes exclues, cadence portée à 3 200 ms — et **zéro 429 sur
les trois runs**, budgets déclarés relevés aux deux bouts pour le prouver.

| Fournisseur | Modèle | p50 | p95 | Contrat |
| --- | --- | --- | --- | --- |
| **Groq** | `openai/gpt-oss-20b` | **467,3 ms** | **1 617,0 ms** | **TENU** |
| OpenAI | `gpt-5.6-sol` | 2 186,2 ms | 4 234,2 ms | DÉGRADÉ |
| Anthropic | `claude-sonnet-4-6` | 3 155,3 ms | 5 561,8 ms | NON CONFORME |

**Le contrat de 3 secondes est tenable, et il l'est déjà.** Le p95 de Groq vaut 38 % du
budget, avec 44 appels sur 48 sous la seconde — contre 3 245 à 5 020 ms mesurés par les sept
bancs saturants précédents. Ce que 01B à 01G mesuraient n'était pas la latence du plan
rapide : c'était le coût de la saturation.

**Le doute sur Anthropic est levé par la mesure.** Ses 27 échantillons antérieurs étaient
tous des secondes tentatives prises sous saturation ; mesuré seul et reposé, en première
tentative, il rend p95 = 5 561,8 ms et aucun appel sous 1,9 s. Le `NOT_YET` de
PERF-CAPACITY-DECISION-01 devient, pour la latence, un **NON mesuré**. OpenAI ne passe pas
davantage — mais il consomme 362 jetons par appel contre 426 pour Groq et **1 013 d'entrée
pour Anthropic** : le même prompt coûte 2,8 fois plus cher selon l'enveloppe de sortie
structurée du transport, ce qui appartient au dossier de capacité.

**Conséquence pour les options restantes.** Répartir la charge ne peut plus préserver le
contrat : toute requête détournée de Groq atterrit chez un fournisseur mesuré à 4,2 ou 5,6 s
de p95. La distribution proactive et la bascule de capacité perdent leur attrait comme
réponses de latence. Restent la capacité chez Groq, et l'infrastructure rapide dédiée dont
ce lot ne dit rien.

Ce qui reste dû est **la capacité, et elle seule** : `CAPACITY_PROVEN = NO`,
`CAPACITY_SLA_DEFINED = NO`, `EXPECTED_PEAK_TPM = UNKNOWN`. Ce lot n'a rien saturé et n'en
tire donc aucune conclusion. La preuve suivante est le banc de saturation — mêmes fixtures,
Groq épinglé, débits dérivés d'une cible de charge produit qui n'existe pas encore.
Rapport : [PERF-NOMINAL-PROVIDER-01.md](PERF-NOMINAL-PROVIDER-01.md).

**Mise à jour CAPACITY-SLA-DEFINITION-01 — la dette se scinde, et la ressource rare
change de nom.** Le propriétaire produit a posé une contrainte ferme : **les abonnements ne
changent pas**, chez aucun fournisseur. La question cesse donc d'être « combien acheter »
pour devenir « comment répartir ce qui est déjà payé ».

Ce déplacement révèle un fait que les huit lots précédents avaient tous croisé sans le
nommer. Les budgets déclarés, relevés aux en-têtes pendant les runs nominaux, sont
massivement asymétriques :

| Fournisseur | Budget déclaré | Rapport à Groq | Latence rapide p95 |
| --- | --- | --- | --- |
| **Groq** | **8 000 jetons/min** | — | **1 617 ms** — tient le contrat |
| OpenAI | 1 000 000 jetons/min | × 125 | 4 234 ms — dégradé |
| Anthropic | 10 000 000 jetons d'entrée/min | **× 1 250** | 5 562 ms — non conforme |

**La ressource rare est exactement celle dont le plan rapide a besoin**, et d'un facteur à
trois chiffres. Or le plan profond la consomme sur la même clé `GROQ_API_KEY` — alors qu'il
est, des deux, le seul à pouvoir s'en passer : le contrat existant lui accorde déjà 16 000 ms
d'attente pour l'Analyste, 17 000 pour l'Arbitre et 26 000 pour le Critique, quand le plan
rapide n'en a aucune.

La direction retenue — **à valider, non implémentée** — est de donner à chaque plan le
fournisseur qui correspond à son contrat : le rapide garde Groq, rare et véloce ; le profond
migre vers la capacité abondante déjà payée d'Anthropic et d'OpenAI. C'est une **assignation
de rôle fixe**, indépendante du contenu, du domaine et du sujet — pas du magasinage
sémantique. Elle ne coûte rien et rend au plan rapide jusqu'à la totalité des 8 000
jetons/min.

Son obstacle est nommé et mesurable : **la qualité des sorties OPRIE hors de Groq n'a jamais
été comparée à parité.** Les trois rôles savent s'y exécuter — ils l'ont fait lors des
bascules — mais savoir s'exécuter n'est pas produire une qualité équivalente.

Ce que la capacité actuelle permet, à quota inchangé et en supposant que le plan rapide en
dispose seul : **18 requêtes/min à 426 jetons, 16 à 485 jetons** (13 avec 20 % de marge,
11 avec 30 %). La contrainte qui mord est le jeton et non la requête — 1 000 requêtes/min
sont autorisées contre 16 permises par les jetons, un facteur 60. Toutes ces valeurs sont des
**majorants** : la part réellement disponible est inférieure de ce que consomme le plan
profond, qui n'a pas été mesuré.

**Le propriétaire produit a depuis fourni les six décisions**, et le contrat de capacité de
la bêta est calculé : 6 utilisateurs rapides simultanés, 1 tour/min en nominal, 2 au pic
pendant une rafale de 2 minutes, 485 jetons par requête — le p95 **et** le maximum des 48
relevés, aucun échantillon ne le dépasse.

| | Débit | Jetons/min | Part du quota | Statut |
| --- | --- | --- | --- | --- |
| Nominal | 6 req/min | 2 910 | 36,4 % | SUFFISANT |
| Pic (2 min) | 12 req/min | 5 820 | 72,8 % | SUFFISANT, MARGINAL |

**La marge de 20 % n'est plus choisie, elle est dérivée :** le pic déclaré impose un plafond
de 27,25 %, et 20 % est le seul des trois candidats qui passe — 30 % rendrait le pic
infaisable (103,9 % de l'enveloppe). À 20 %, le pic occupe 90,9 % des 6 400 jetons
utilisables, et **un septième utilisateur au pic dépasserait** (6 790 > 6 400).

**Mais la marge apparente n'en est pas une.** Au pic, il ne reste que **2 180 jetons/min** au
plan profond, qui partage la même clé. Un tour profond exécute trois appels fournisseur au
minimum ; en leur prêtant très généreusement le coût d'un appel *rapide*, son plancher vaut
1 455 jetons — soit **1,5 tour profond par minute** pendant un pic rapide. Ce plancher est
extrêmement conservateur : les trois prompts système profonds pèsent 25 685 caractères contre
794 pour le rapide, 32 fois plus. **Six utilisateurs en rafale dont deux lanceraient un tour
profond saturent Groq.**

La séparation Fast/Deep cesse donc d'être une amélioration souhaitable : elle est la
**condition d'existence du pic déclaré**.

Comportement retenu quand Groq est plein : **le plan rapide se déclare dégradé et ne rend
aucune candidate ; le plan profond poursuit son travail autoritaire**, 5 minutes maximum par
incident. Ce choix est le seul cohérent avec l'architecture — le plan rapide étant candidat et
non autoritatif, le suspendre retire une commodité, pas une capacité.

`CAPACITY_SLA_DEFINED = YES` pour la bêta, `CAPACITY_SLA_PROVEN = NO` : le contrat est
calculé, il n'est pas éprouvé. `RATE_LIMIT_SCOPE = UNKNOWN` : les en-têtes donnent des
valeurs, jamais une portée, et supposer qu'une seconde clé multiplierait la capacité serait un
pari. `DEEP_TPM` reste non mesuré — c'est le seul chiffre qui empêche encore le contrat d'être
autre chose qu'un majorant. Le lot suivant, strictement nécessaire, le mesure.

**La dette se lit désormais en deux moitiés :**

```
FAST_LATENCY_PART   = CLOSED / PROUVÉE   (Groq, p50 467,3 ms, p95 1 617,0 ms)
FAST_CAPACITY_PART  = OPEN
```

Document : [CAPACITY-SLA-DEFINITION-01.md](CAPACITY-SLA-DEFINITION-01.md).

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
