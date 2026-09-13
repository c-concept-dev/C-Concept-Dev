# ATELIER-RELEASE-GATE-01

**Verdict : `PASS_WITH_OWNER_ACCEPTANCE_REQUIRED`.** Zéro appel API, zéro dollar, zéro ligne de code de production touchée.

## La technique est prête, et elle le prouve

| | |
|---|---|
| GLOBAL | **2965 / 2965**, trois fois de suite |
| FROZEN | 7 empreintes conformes, dont les deux nommées au §15 |
| Runtime navigateur | régénération à **zéro diff** — aucun build périmé |
| Secret scan | aucun |
| Fast | Groq seul — p50 **467 ms**, p95 **1617 ms**, 0 × 429 |
| Deep | Anthropic seul, `claude-sonnet-4-6`, aucun repli fournisseur |
| Haiku | zéro trace dans le chemin de production |
| 502 sans état OPRIE | **0** |

La lignée n'est pas canonique — l'historique a été réécrit hors session — mais le contenu l'est
intégralement : 588 fichiers avant, 599 après, **zéro perdu**. La réécriture a ajouté du travail,
jamais retiré.

L'audit du lot précédent ne trouve **aucun affaiblissement de test** sur 31 fichiers. Les quatre
tests historiques modifiés gagnent des assertions au lieu d'en perdre ; le seul point à signaler est
qu'une garantie de taxonomie a été remplacée par une garantie de configuration (voir `diff-audit.json`).

## Ce qui reste à trancher, et qui n'appartient qu'à Christophe

**Poser une question coûte plus cher que produire un livrable.**

- « Résume ce texte en dix lignes » → **57 s** pour répondre « Quel est le texte ? »
- « Prépare ça pour demain » → **87 s** pour demander quoi préparer
- Trois scénarios de réduction budgétaire, avec bénéfices, risques et conditions → **68 s**

La population ouverte affiche un p50 de **91,7 s**. Le contrat produit du §2 admet qu'un vrai travail
de fond prenne du temps ; il interdit que chaque échange devienne une attente longue. La première
moitié est respectée, la seconde ne l'est pas.

Ce lot ne propose **aucune** solution : §3 et §20 l'interdisent, et un Release Gate qui redessine
n'est plus un Release Gate. Le constat est remis tel quel.

Second point, moindre : le coût de la queue Deep n'est pas plafonné — 0,057 USD au tour médian,
jusqu'à ~0,5 USD sur un tour mesuré à 15 appels fournisseur.

## Fichiers

`lineage.json` · `diff-audit.json` · `contracts.json` · `performance.json` · `economics.json` ·
`regressions.json` · `release-decision.json` · `summary.json`
