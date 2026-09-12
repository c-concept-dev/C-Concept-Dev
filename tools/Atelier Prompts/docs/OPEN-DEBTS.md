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

**Mise à jour FAST-CAPACITY-ADMISSION-01 — ce qu'on peut savoir avant d'appeler, et ce qu'on
ne peut pas.** La question était : peut-on décider, AVANT l'appel Groq, si une requête rapide
tient dans la capacité restante, sans inventer de seuil ? La réponse est **non**, et pas par
prudence — par arithmétique, trois fois plutôt qu'une.

1. **Le coût est inconnu avant l'appel.** Le Worker n'a aucune dépendance de production et
   Groq n'expose aucune route de comptage. La seule borne EXACTE disponible est
   « jetons ≤ octets » : 794 + 16 384 + 512 = **17 690 jetons**, soit **2,21 fois le quota
   d'une minute entière**. Une admission fondée dessus refuserait 100 % des requêtes. Elle est
   exacte et inutilisable, les deux à la fois.
2. **Substituer les 426 ou 485 jetons mesurés est exclu** : ce serait faire d'une statistique
   de banc une autorité de production.
3. **La capacité restante n'arrive qu'APRÈS coup.** Les en-têtes de débit voyagent sur la
   réponse ; une vérification préalable lirait une valeur périmée d'au moins un aller-retour,
   sur un seau qui se remplit en 3 à 5 s, aveugle aux appels concurrents et aveugle au plan
   profond qui consomme le même budget sur la même clé.

Un seul signal fournisseur est **autoritatif** : `Retry-After`. Il ne décrit pas un état, il
énonce une instruction datée — « reviens dans 2 000 ms » reste vrai pendant 2 000 ms. Les six
en-têtes de budget sont bien formés mais **observationnels**.

**Le niveau 1 a donc été implémenté, et rien d'autre** : quand Groq annonce un délai, on le
retient et le plan rapide s'abstient jusqu'à l'échéance, à la milliseconde près. Aucun
refroidissement inventé — le repli fixe de 30 s du dépôt a été structurellement séparé de
l'annonce du fournisseur pour qu'il ne puisse plus la contrefaire. Aucune machine à états,
aucun seuil, aucun pourcentage, aucun compteur d'utilisateurs : l'admission ne reçoit qu'une
horloge, et sa signature ne comporte aucun paramètre capable de porter la demande.

**La portée du souvenir a été mesurée, pas supposée.** 50 invocations réelles à corps invalide
— refusées en 400 avant tout appel fournisseur, donc **zéro jeton consommé** — révèlent
**4 isolats distincts seulement**, 87 % des requêtes servies par un isolat déjà vu en rafale
dense et **100 % à la cadence du pic déclaré**. Une mémoire de module suffit : ni KV, ni
Durable Object. La limite est assumée — un isolat neuf perdra son propre appel, coût borné à
un refus par isolat.

**Second changement, tiré de la mesure du lot précédent :** le plan rapide n'a plus qu'un
fournisseur. Groq rend 1 617 ms de p95 au repos, OpenAI 4 234, Anthropic 5 562 — les deux
replis échouent le contrat de 3 secondes AVANT toute saturation. Basculer vers eux produisait
une candidate hors contrat, plus lentement que de n'en produire aucune. `FAST_PROVIDER_ORDER`
vaut désormais `["groq"]` ; `DECISION_PROVIDER_ORDER` et `ROLE_PROVIDER_ORDER` restent
`groq → anthropic → openai` à l'octet près. Un refus rend `503 fast_capacity_unavailable`,
erreur de transport qui ne touche ni readiness, ni route, ni état OPRIE — le plan profond
poursuit son tour, exactement le mode dégradé décidé au contrat de capacité.

Ce lot n'a **pas** déplacé la dette : il évite de harceler un fournisseur saturé, il ne dit
rien de la part que le plan profond prend sur le même budget.
Document : [FAST-CAPACITY-ADMISSION-01.md](FAST-CAPACITY-ADMISSION-01.md).

**Mise à jour DEEP-TOKEN-COST-01 — le chiffre manquant est arrivé, et il reformule le
dossier.** Douze tours profonds réels, corpus de régression existant, compteurs fournisseur,
**aucun code modifié, aucun déploiement** : l'instrumentation suffisait.

| Mesure | Valeur | Contre le quota de 8 000 jetons/min |
| --- | --- | --- |
| Tour le moins cher observé | **7 820 jetons** | 98 % du budget d'une minute |
| **Tour médian** | **16 015 jetons** | **2,0 ×** |
| Tour au p95 | **103 894 jetons** | **13,0 ×** |

**Un seul tour profond dépasse le budget d'une minute entière.** Le plancher structurel de
1 455 jetons estimé au contrat de capacité était **cinq fois trop bas** — l'estimation se
disait conservatrice sans savoir à quel point. Le Critique en est la cause : son pipeline
batché émet de **1 à 13 appels fournisseur** selon le nombre d'issues que l'Analyste marque
« question », et son coût varie d'un facteur 39 entre le tour le moins cher et le plus cher.
L'Analyste et l'Arbitre, eux, sont stables.

**Et la conséquence était déjà là, jamais vue : le plan profond ne tourne déjà plus
majoritairement sur Groq.** Sur ces douze tours nominaux, **77,7 % de ses jetons ont été
servis par Anthropic** (292 887 contre 83 870), par bascule automatique — non par panne du
fournisseur, mais parce que le budget Groq s'épuise EN COURS DE TOUR, souvent dès le deuxième
appel. Groq l'a même dit explicitement une fois, en rendant un `413 rate_limit_exceeded` :
le statut qu'il réserve à une requête UNIQUE dépassant à elle seule la limite par minute.

La « migration du plan profond vers Anthropic » que les deux lots précédents envisageaient
comme une décision à prendre **a donc déjà eu lieu**, de fait, sans avoir été décidée, mesurée
ni choisie — et elle s'exécute au pire moment, après avoir payé un aller-retour Groq perdu.

Ce que cela fait au contrat de capacité de la bêta : il supposait un « reste » de
2 180 jetons/minute pour le plan profond au pic rapide. **Il n'y a pas de reste** — le tour
profond le moins cher en coûte 3,6 fois plus. Les deux plans ne se partagent pas un budget :
le profond le dépasse à lui seul. `DEEP_COST_DOMINANT`, classification dérivée du quota et non
d'un seuil inventé.

Une limite est enregistrée plutôt que masquée : 16 échecs sont classés `technical_failover`
mais 3 erreurs d'API seulement sont journalisées — le chemin d'épuisement 429 lève son erreur
avant toute journalisation. La répartition exacte entre épuisement 429 et autres causes
techniques **n'est pas observable** avec l'instrumentation actuelle.

`DEEP_SEPARATION_FROM_FAST_SUPPORTED_BY_EVIDENCE = YES`, et plus fortement que la séparation ne
le supposait. La preuve suivante change de nature : **la qualité des sorties OPRIE sous
`claude-sonnet-4-6` n'est plus une question hypothétique conditionnant une migration future,
c'est une propriété ACTUELLE et non mesurée de la production.**
Rapport : [DEEP-COUT-JETONS-01.md](DEEP-COUT-JETONS-01.md).

**Mise à jour OPRIE-QUALITY-PARITY-01 — la référence n'existe pas.** Le lot devait comparer la
qualité du plan profond sur Anthropic à celle de Groq, Groq faisant référence. Épinglé sans
repli — un épinglage diagnostic `DEEP_BENCH_PROVIDER` a dû être ajouté, miroir exact de celui
du plan rapide, sans quoi un run « Groq » aurait contenu des réponses d'Anthropic — **Groq n'a
produit que 2 décisions gouvernées sur 12**. Les dix autres tours se sont dégradés avant
d'aboutir. La référence comportementale attendue **n'existe pas** au quota actuel.

| | Groq épinglé | Anthropic épinglé |
| --- | --- | --- |
| Tours gouvernés | **2 / 12** | **11 / 12** |
| Échecs fournisseur | **10** | **0** |
| Reprises | 9 | 0 |
| Échecs de schéma | 0 | 1 |
| Bascules (contamination) | 0 | 0 |

Chez Groq, le nombre de cas ATTEINTS décroît de rôle en rôle — 12 pour l'Analyste, 9 pour le
Critique, 7 pour l'Arbitre — parce qu'un rôle qui échoue empêche les suivants de s'exécuter.
Ce n'est pas un défaut de qualité : c'est l'épuisement du budget en cours de tour, déjà chiffré
par DEEP-TOKEN-COST-01.

**Ce qui a tout de même été établi sur Anthropic.** Aucun défaut critique, **aucun faux READY**,
**aucune clarification manquée** — les quatre cas où l'oracle du corpus exige une question l'ont
tous reçue. Mais il **sur-questionne** : 5 clarifications demandées là où l'oracle n'en attend
aucune, sur 11 décisions. Il questionne dans 9 cas sur 11 quand l'attente est de 4.

La comparaison est **structurelle et déterministe** : aucune similarité textuelle, aucun
embedding, aucun juge LLM, aucun seuil sémantique. Seul le comportement gouverné est comparé.
La vérité terrain se limite à `question_required`, la seule dimension du corpus qui corresponde
directement — et cet oracle a été écrit pour le contrat `/decision`, non pour les états OPRIE.
C'est pourquoi le sur-questionnement est classé MAJOR et non CRITICAL : son statut de défaut
dépend d'une attente qui n'a pas été écrite pour cet usage. `confirmation_required` et `blocked`
ne sont éprouvés par aucune attente ; aucun cas n'a été fabriqué pour combler ce trou.

`ANTHROPIC_DEEP_QUALITY_PARITY = PARTIAL`. Pas PASS, car cinq fausses clarifications sur onze
décisions ne sont pas démontrablement comparables et la référence manque. Pas FAIL, car rien
dans ces données ne disqualifie Anthropic — au contraire : un échec contre dix.

**Ce que le lot démontre dépasse sa question.** Ce n'est pas qu'Anthropic serait un candidat
imparfait pour le plan profond : c'est que **Groq n'en est plus un du tout**. La chaîne HA ne
compense pas une insuffisance passagère, elle dissimule une inadéquation structurelle. La
production s'exécute aujourd'hui sur une chaîne dont le fournisseur primaire échoue quatre fois
sur cinq et dont le repli, non choisi, fait l'essentiel du travail.

`DEEP-PROVIDER-ROUTING-01` n'est pas déclenché — la migration reste fermée sur un verdict
PARTIAL. La preuve manquante est étroite : une attente explicite au niveau OPRIE, écrite par le
propriétaire produit et couvrant aussi `confirmation_required` et `blocked`, permettrait de dire
si le sur-questionnement est un défaut ou un artefact.
Rapport : [OPRIE-QUALITY-PARITY-01.md](OPRIE-QUALITY-PARITY-01.md).

**Mise à jour OPRIE-REFERENCE-ORACLE-01 — la mesure précédente était faite contre la mauvaise
règle.** Le lot précédent s'était arrêté sur une impasse : Groq ne pouvait pas servir de
référence. Une vérité terrain indépendante de tout fournisseur a donc été construite — 30 cas du
corpus existant, tous inclus, aucun inventé, chaque état attendu dérivé **du contrat OPRIE** et
du contenu de la fixture. **Aucun appel fournisseur, aucun déploiement, aucun code modifié.**

| État attendu | Cas |
| --- | --- |
| `operational_request_ready` | **8** |
| `clarification_required` | **18** |
| `confirmation_required` | **0** — aucun cas du corpus ne le déclenche |
| `blocked` | **0** — aucun cas du corpus ne l'atteint |
| non tranchés | **4** |

**Le fait structurant, jamais relevé jusqu'ici : le tour profond n'a aucun canal de matériau.**
`validateAnalystInput` n'accepte que `original_request` et `clarification_history`, là où
`/decision` reçoit `materiau_present` comme *fait fiable*. Une demande qui présuppose un intrant
— « résume ce texte », « analyse ce tableau CSV » — a donc cet intrant **structurellement
absent**, que le corpus l'ait étiquetée « matériau présent » ou « matériau absent » : les deux
étiquettes sont indistinguables du point de vue d'OPRIE, et appartiennent à un autre contrat.

**Conséquence directe sur le lot précédent.** Traités par la règle uniforme, sans consulter leur
historique, quatre des cinq cas comptés comme « fausses clarifications » d'Anthropic reçoivent
`clarification_required` : R08 et R09 (intrant absent), A02 et A03 (objet indéterminé). Seul A01
reste non tranché. **Quatre des cinq « fausses clarifications » n'en étaient pas** — l'oracle
utilisé alors avait été écrit pour `/decision`. Cela ne réhabilite ni ne condamne Anthropic : la
mesure doit être refaite contre la bonne règle.

Autre point que le contrat tranche seul : **`degraded_state` ne peut jamais être une attente
sémantique** — l'Arbitre se voit explicitement interdire de le produire, il n'est déclaré que
par le système sur panne technique. Un 429 Groq ou l'absence de candidate rapide n'est pas un
état OPRIE.

Quatre cas restent **non tranchés** — A01, A05, A06, A07 — et ils posent **une seule** question
produit : lorsque l'objet du travail est déterminé mais que le livrable ne l'est pas, OPRIE
doit-il proposer un livrable scénarisé ou conditionnel, ou poser une question ? Les deux
lectures s'appuient sur une clause réelle du contrat ; aucune ne l'emporte sans décision.

`CORPUS_COVERAGE_GAP = YES` sur `confirmation_required` et `blocked` : aucun cas n'a été fabriqué
pour combler ce trou, le manque est constaté avant toute proposition. L'oracle vit dans
`evaluation/`, n'est importé par aucun code d'exécution, et aucun comportement de production ne
dépend d'un `case_id` — une preuve statique le vérifie sur le worker, le noyau et l'artefact.
Document : [OPRIE-REFERENCE-ORACLE-01.md](OPRIE-REFERENCE-ORACLE-01.md).

**Mise à jour OPRIE-MATERIAL-CONTEXT-01 — le canal de matériau ne mène nulle part.** L'audit
demandé par le lot précédent est fait, sur les contrats réels et sans un seul appel fournisseur.
`MATERIAL_CONTEXT_GAP = REAL`, et plus largement qu'annoncé.

Le produit possède un **canal de matériau complet** — `#v11-files` en `multiple`, glisser-déposer,
extraction de texte, stockage dans `state.docs` sous la forme
`{name, type, size, text, external}` — et une **autorité de readiness**, le plan profond, seul à
décider depuis la migration OPRIE. Les deux ne communiquent pas :

```js
const body = { original_request: oprieOriginalRequest(), clarification_history: ... };
function oprieOriginalRequest(){ return String(($('#v11-demande')||{}).value||'').trim() }
```

**`state.docs` n'entre dans aucun des deux champs.** Les documents joints par la personne sont
entièrement ignorés par le rôle qui décide de la readiness.

**Portée délimitée, sans exagération :** le défaut ne se manifeste que lorsqu'une demande
*présuppose* un intrant. Sur les 30 cas de l'oracle, **6 sont affectés** — R08 à R13. Les huit
cas « matériau absent » ne le sont pas : l'absence y est réelle, la clarification restera
correcte. Les seize autres relèvent d'un problème sans rapport — objet ou livrable indéterminé.
**Trois des cinq cas historiquement signalés — A01, A02, A03 — ne relèvent pas de ce défaut.**

**Le produit distingue déjà présent et exploitable**, sans qu'il faille l'inventer : seuls les
formats textuels donnent un contenu, les autres sont marqués `external: true`. Le contrat minimal
proposé s'y adosse — deux dimensions, `present` et `usable`, chacune pouvant valoir `unknown`,
metadata seule, une quinzaine de jetons. `REQUIRED` est écarté à dessein : déterminer ce que la
demande *exige* est le raisonnement de l'Analyste, et le lui fournir créerait une autorité
parallèle. Le contexte dit ce qui est **disponible**, jamais ce qui est **nécessaire**.

**Rien n'a été implémenté, et c'est le résultat du lot.** Le canal traverse quatre couches ;
**deux sont interdites ici** — l'enveloppe navigateur touche au HTML canonique, la couche de sens
touche aux prompts des rôles. Construire les deux couches intermédiaires seules aurait produit un
canal à moitié fait : un champ traversant le transport pour atteindre des rôles à qui personne
n'a expliqué comment le lire, changeant le comportement du plan profond sans contrat pour le
décrire. `IMPLEMENTATION_TYPE = BLOCKED_ARCH_CHANGE`.

Visibilité par rôle, tranchée plutôt que supposée : **Analyste oui**, c'est lui qui identifie les
inconnues matérielles ; **Critique oui**, il ne peut auditer la légitimité d'une question sans
savoir si le document était joint ; **Arbitre non**, il arbitre ce que les deux précédents ont
soulevé. Piège identifié : `buildRoleInput` diffuse `base` aux trois rôles — le contexte ne doit
donc pas y être ajouté, sous peine d'atteindre l'Arbitre par effet de bord.

**L'oracle n'a pas été retouché.** Ses attentes sont correctes pour le contrat actuel ; elles
changeraient si le canal existait — cela se documente, cela ne se réécrit pas en silence.
Document : [OPRIE-MATERIAL-CONTEXT-01.md](OPRIE-MATERIAL-CONTEXT-01.md).

**Mise à jour OPRIE-MATERIAL-CONTEXT-02 — le canal est posé, et il ne suffit pas.** Le contrat
`material_context {present, usable}` est implémenté de bout en bout, exactement tel qu'il avait
été spécifié : champ optionnel dont l'absence vaut `unknown`, transport strict — une clé
**nommée** ajoutée, toute autre toujours refusée en 400 —, propagation sélective vers l'Analyste
et le Critique **jamais vers l'Arbitre**, deux prompts amendés d'un point chacun, enveloppe
navigateur lisant `state.docs` à l'instant de l'envoi. Validé en production.

**Et l'observation réelle montre que l'état ne change pas.** Deux tours sur R08, même demande,
120 s d'écart :

| | Sans contexte | Avec `{present:true, usable:true}` |
| --- | --- | --- |
| État | `clarification_required` | `clarification_required` |
| Question | « Pourriez-vous **fournir le texte** que vous souhaitez résumer ? » | « Pouvez-vous **coller directement le texte** dans votre message ? » |

**Le matériau n'est plus invisible — la question le prouve.** Elle ne demande plus le document en
ignorant son existence, elle demande d'en coller le **contenu**. Le raisonnement a compris qu'un
document existe et qu'il ne le reçoit pas.

**Mais le contenu n'a jamais été transmis.** `state.docs[].text` est extrait par le navigateur et
y reste. Savoir qu'un document existe ne permet pas de le résumer : la clarification qui subsiste
est donc **légitime au regard du contrat** — une information matérielle non substituable manque
réellement.

**Une ambiguïté du contrat, révélée par la mesure et non par la relecture :** `usable`, tel
qu'implémenté, signifie « lisible par le navigateur », pas « disponible au raisonnement profond ».
La spécification ne distinguait pas les deux. Ce n'est pas une erreur d'implémentation — le
contrat a été posé tel qu'écrit — c'est une limite de la spécification que seule l'exécution
pouvait faire apparaître.

Le canal de **visibilité** est posé ; le canal de **contenu** ne l'est pas.
`OPRIE_MATERIAL_CONTEXT_02_VERDICT = PARTIAL`.

L'artefact canonique a changé, mécaniquement : le noyau OPRIE est embarqué verbatim dans le bundle
navigateur. Quatorze preuves gardant l'ancienne empreinte ont été mises à jour, chacune avec sa
note. Aucun changement visuel, aucun redesign. L'oracle n'a pas été touché.

Le choix suivant appartient au propriétaire : ouvrir un canal de contenu — avec ses questions
réelles de volume (16 384 octets de transport), de coût et de confidentialité — ou admettre que le
plan profond ne lit pas les documents et tenir `material_context` pour ce qu'il est réellement :
ce qui permet à l'Analyste de poser **la bonne question** plutôt que la mauvaise.
Document : [OPRIE-MATERIAL-CONTEXT-02.md](OPRIE-MATERIAL-CONTEXT-02.md).

**Mise à jour OPRIE-MATERIAL-CONTENT-01 — le contenu, et ce qu'il coûterait.** Le lot précédent
avait posé le canal de *visibilité* et montré qu'il ne suffit pas : le plan profond sait qu'un
document est joint, il ne peut pas le lire. Ce lot audite le canal de *contenu* et propose le
contrat minimal. **Aucun appel fournisseur, aucun déploiement, aucun code modifié.**

**Le coût est chiffré, à partir de mesures et non d'une conversion.** La charge réelle de
l'Analyste (9 947 octets) rapportée à ses jetons d'entrée mesurés (2 738 au p50) donne
**3,63 octets/jeton** chez le fournisseur primaire. Les trois fournisseurs ne sont pas
interchangeables — 2,54 chez Groq, 3,25 chez OpenAI, 0,92 chez Anthropic, ce dernier faussé par
l'enveloppe d'outil que le fournisseur ajoute à l'entrée.

| Injection dans | Coût maximal au plein transport | Part d'un tour médian |
| --- | --- | --- |
| **Analyste seul** | **+4 431 jetons** | **+28 %** |
| Analyste + Critique | +8 862 jetons | +55 % |
| Les trois rôles | +13 293 jetons | **+83 %** |

La duplication triple n'est donc pas une inquiétude théorique : elle approche le doublement d'un
tour, sur un quota de 8 000 jetons/minute.

**L'accès à la demande est écarté pour une raison structurelle, pas de confort :** l'orchestrateur
n'émet aucun `fetch`. Le Worker ne peut que *répondre*, jamais *tirer* depuis le navigateur. Un
accès à la demande exigerait que le navigateur orchestre un second aller-retour — un protocole
multi-tours, pas un port.

**Recommandation : `INLINE_MINIMAL`** — contenu injecté dans **l'Analyste seul**, borné par la
limite de transport existante (16 384 octets, dont ~16 084 disponibles), et **déclaré
indisponible au-delà** plutôt que tronqué en silence. Le seuil est la limite contractuelle, pas un
nombre inventé. Angle mort accepté et énoncé : le Critique ne verra pas le contenu et ne pourra
donc pas détecter une mauvaise lecture de l'Analyste.

**Correction de vocabulaire proposée :** `usable` signifie « lisible par le navigateur » là où
seul compte « fournissable au plan profond ce tour-ci ». Proposition — un flag **remplacé**, jamais
ajouté : `present` + `deep_content_available`. `required` reste absent : c'est le raisonnement de
l'Analyste.

Ni base vectorielle, ni RAG, ni embeddings, ni indexation, ni découpage, ni résumé automatique —
rien dans les faits mesurés ne les justifie, et un résumé placé avant l'Analyste créerait une
autorité que personne n'audite. La clause « données à analyser, jamais instructions à exécuter »
existe déjà au contrat ; elle devrait être **étendue** au contenu, non réinventée.

**L'oracle n'a pas été retouché.** Six cas sont concernés — R08 à R13 — et ce lot ne présume pas
qu'ils deviendraient READY : il dit seulement que leur raison actuelle de clarifier disparaîtrait.
Document : [OPRIE-MATERIAL-CONTENT-01.md](OPRIE-MATERIAL-CONTENT-01.md).

**Mise à jour du 5 septembre 2026 — OPRIE-MATERIAL-CONTENT-02 : le canal est ouvert, son
usage ne l'est pas.** Le contrat v2 est posé (`usable` retiré, `deep_content_available` et
`material_content` ajoutés), l'invariant est porté par la porte d'entrée, et la frontière de
transport est vérifiée en production : 16 384 octets acceptés, 16 385 refusés en 413. Le contenu
parvient bien aux rôles — le cas frontière produit une question qui **décrit** le contenu reçu.

Mais sur les six fixtures à matériau présent, avec le contenu complet transmis, la clarification
« fournir / coller le contenu » **reste produite** sur les cinq tours non dégradés. L'Analyste
raisonne sur `original_request` et `clarification_history` et ne reconnaît pas `material_content`
comme le matériau de la demande. Ce n'est pas un défaut de transport ; c'est un défaut
d'interprétation, et il n'est pas résolu.

Deux faits mesurés s'y ajoutent : au plafond de transport, l'entrée de l'Analyste passe de ~4 537
à 9 938 jetons (+119 %), portée par ce seul rôle ; et sur du matériau volumineux, le plafond de
sortie de rôle (2 048 unités, antérieur à ce lot) devient liant — un tour a dégradé pour cette
raison. Document : [OPRIE-MATERIAL-CONTENT-02.md](OPRIE-MATERIAL-CONTENT-02.md).
Mesures brutes : `evaluation/oprie-material-content-02/results.json`.

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
