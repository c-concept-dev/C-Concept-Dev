# REVIEW RESUME DESIGN v1 — MONOLITH-v1.0.8

## 1. Décision : priorité 1 (streaming) suffit ; pas de checkpoint interne à la revue

Le mandat demandait un checkpoint interne à TWINS_REVIEWS « seulement si nécessaire ». Il n'est **pas** introduit, pour trois raisons :

1. **La cause est le transport, pas la durée de l'étape.** Les trois 524 tombent à 125,1 s ± 0,03 s sur le **premier** appel de revue, avant tout octet : c'est la fenêtre edge, pas une limite de l'étape. Le streaming (`STREAMING-TRANSPORT-DESIGN-v1.md`) fait commencer la réponse en quelques secondes ; la génération n'est plus bornée que par inactivité (90 s sans octet) et durée totale (15 min).
2. **Le contrat de reprise existant couvre déjà la revue.** Chaque appel réel validé est enregistré dans le magasin partagé (MONO-11, statut VALID) ; à la reprise, une revue déjà validée est **réutilisée à coût 0** (T-STREAM-22, L5). Le seul travail rejoué est la revue interrompue elle-même (jamais réutilisable, par construction) — soit exactement ce qu'un checkpoint interne éviterait aussi… sauf qu'un checkpoint ne pourrait pas non plus sauver une réponse partielle (contrat : aucune réponse partielle n'est un résultat).
3. **Un checkpoint intra-étape toucherait le lot gelé.** `runDownstream` (MONO-11 v0.3-r1, gelé) enchaîne couverture → jumeaux → revues → agrégation en mémoire ; y insérer un point de reprise par jumeau supposerait de modifier son orchestration ou de dupliquer sa logique dans le MONOLITH — hors mandat (« NE MODIFIE AUCUN ARTEFACT GELÉ »).

## 2. Ce que la reprise fait (inchangé, vérifié)

| Situation à la reprise | Comportement |
|---|---|
| checkpoint professionnel DONE | panel jamais recalculé ; reprise directe à TWINS_REVIEWS (X4) |
| couverture EF-02D3 d'une passe 1 **valide** | réutilisée (coût 0) |
| couverture EF-02D3 d'une passe 1 **invalide** (reprise informée) | rejouée en réel : les réponses invalides ne sont jamais réutilisables (contrat MONO-11) |
| jumeaux | reconstruits localement (déterministes, 0 appel) |
| revue EF-03B validée avant l'interruption | réutilisée (coût 0) — T-STREAM-22 |
| revue EF-03B interrompue | recalculée en réel (aucune trace partielle) — T-STREAM-22 |
| agrégation | recalculée ; ses appels validés sont réutilisés |

## 3. Limitation consignée (hors périmètre transport)

Chaque reprise du run réel a re-dépensé ≈ 0,85 USD de couverture (`JMMJS-TWINS-524-REPLAY-v1.md § 7`) : les passes 1 invalides sont rejouées en réel et, non déterministes, peuvent produire une autre réponse invalide qui change le prompt de la reprise informée. C'est le contrat gelé de validation/reuse (VALID uniquement) — juste, mais coûteux à la reprise. Une politique « réutiliser une passe 1 invalide pour ne rejouer que la reprise informée » exigerait une décision de gouvernance sur le contrat MONO-11 ; elle n'est ni implémentée ni recommandée sans audit.

## 4. Quand un checkpoint interne deviendrait nécessaire

Si un run réel sous v1.0.8 (proxy v0.7 déployé) montrait encore des interruptions **après** le premier octet (inactivité fournisseur > 90 s, durée > 15 min, coupures réseau récurrentes) sur des revues distinctes d'un même run, un checkpoint par revue validée deviendrait rentable. Il devrait alors être conçu comme une **projection** persistée des revues VALID (déjà dans le magasin) permettant à `runDownstream` de les recevoir en entrée — ce qui suppose une version MONO-11 non gelée. À ce jour, aucune donnée ne le justifie.
