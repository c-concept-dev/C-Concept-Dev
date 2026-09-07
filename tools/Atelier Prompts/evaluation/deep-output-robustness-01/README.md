# DEEP-OUTPUT-ROBUSTNESS-01

Deux questions, deux réponses, zéro appel API.

## A — un tour peut-il encore disparaître ?

Il le pouvait. Il ne le peut plus sur le chemin mesuré.

Le Critique batché était le seul des trois rôles dont le refus de validation sortait **sans provenance**.
Sans étiquette, une erreur est présumée être la nôtre : `programming_error`. Cette classe n'est
éligible ni au repli ni à la dégradation, donc l'exception remontait telle quelle et le client
recevait un `HTTP 502` dont le contrat gelé interdit tout champ d'état. Ni READY, ni clarification,
ni dégradation : **aucun état OPRIE**. Deux tours sur huit ont disparu comme ça en campagne réelle.

L'Analyste et l'Arbitre, eux, traversent `parseRoleOutput`, qui étiquette tout refus de leur
validateur. La même faute produisait donc un état gouverné sur deux rôles et un trou sur le
troisième. Le correctif supprime cette asymétrie, en six lignes, avec un mécanisme qui existait déjà.

**Aucun contrat n'a été relâché.** Les mêmes sorties sont refusées, avec les mêmes messages.
Ce qui change est la réponse à « de qui est la faute ».

## B — les plafonds étaient-ils coupables ?

Sur un défaut des trois, oui. Sur les deux autres, non — et c'est ce qui tranche.

Le marqueur décisif tenait en une ligne : **43 appels sur 45 se terminent en `tool_use`**.
Le modèle s'arrête parce qu'il a fini, pas parce qu'on l'a coupé.

| étage | plafond | sortie observée | `stop_reason` | verdict |
|---|---|---|---|---|
| Analyst | 4096 | 529 – 1928 (47 %) | `tool_use` 10/10 | non causal |
| Critic global | 2048 | 213 – 962 (10–47 %) | `tool_use` 14/14 | **non causal** — 7 sorties invalides, zéro troncature |
| Critic batch | 1600 (dérivé) | 1163 – 1600 | `max_tokens` **2/10** | **causal** — seul plafond incriminé |
| Arbiter | 4096 | 565 – 1789 (14–44 %) | `tool_use` 7/7 | non causal — 2 sorties sans `reason` |

Élever le plafond de batch corrigerait un défaut et laisserait les deux autres intacts.
Haiku échouerait exactement de la même façon. **Aucun plafond n'a donc été modifié.**

## Fichiers

- `root-cause.json` — la chaîne causale du 502, pas à pas, et l'asymétrie qui la produisait
- `output-limits.json` — CONFIGURED / EFFECTIVE / OBSERVED / STOP_REASON par étage
- `targeted-cases.json` — les cinq cas historiques relus, et pourquoi aucun n'a été rejoué
- `regressions.json` — les quatre tests de lots antérieurs mis à jour, et ce que chacun garde encore
- `summary.json` — le verdict et ses conditions

## Ce que le lot n'a pas fait

Pas de prompt réécrit. Pas de schéma touché. Pas de plafond bougé. Pas d'hybride, pas de routeur,
pas de cache. Pas un seul appel API : la preuve était déjà dans les 45 appels du lot précédent.
