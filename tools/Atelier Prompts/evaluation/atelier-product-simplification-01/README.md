# ATELIER-PRODUCT-SIMPLIFICATION-01 — diagnostic indépendant

**Audit seul. Aucune modification de production. Aucun appel API.**

## Le constat qui change la question

Atelier possède **déjà** l'architecture que la mission demande d'explorer.

`workers/shared/fast-interactive-plane.js` implémente un plan rapide qui produit une question
candidate **sans aucune autorité** — `FAST_FORBIDDEN_AUTHORITY_FIELDS` interdit `state`, `blocked`,
`degraded_state`, `route`, `readiness` ; toute sortie validée porte `authority: "candidate"` en dur ;
`ONE_NEXT_INTERACTION_MAX = 1`. `runInteractiveTurn` lance le plan profond **avant** d'attendre le
rapide : les deux partent à la même milliseconde. Et le front le câble : `oprieRunTurn` lance
`deepPromise`, puis `oprieStartFastPlane`, et `oprieRenderFastInteraction` ouvre la question dès
qu'une interaction sollicitante arrive — soit **~0,5 s** (Fast Groq p50 = 467 ms).

La question n'est donc pas « quelle architecture construire ». C'est : **pourquoi ce plan ne s'est-il
pas exprimé sur le cas Italie ?**

## Ce que la trace dit

Mesure Sonnet réelle du cas Italie, cette session :

| # | rôle | latence | sortie | valeur décisionnelle |
|---|---|---|---|---|
| 1 | analyst | 19 851 ms | 1 184 | **la clarification est déjà connue ici** |
| 2 | critic global | 5 468 ms | 234 | réelle, et bon marché |
| 3 | batch | 18 063 ms | 947 | **la clarification est prouvée ici** |
| 4 | batch | 19 750 ms | 1 015 | nulle pour ce tour |
| 5 | batch | 21 244 ms | 1 074 | nulle pour ce tour |
| 6 | arbiter | 27 893 ms | 1 656 | état forcé ; formulation réelle |

**92 556 ms, 6 appels, 0,197 USD** — pour une question d'une ligne. Les appels 4 et 5 ont depuis été
supprimés par l'arrêt anticipé (74 412 ms, 5 appels).

Mais le plancher reste : **~71 s même avec un arrêt anticipé parfait.** Le plan profond ne peut pas
tenir un contrat de 1–3 s. Il ne doit pas être sur le chemin d'affichage.

## Les deux phrases interdites ne viennent pas du modèle

« Une précision est nécessaire » est un `<div class="v11-eyebrow" id="v11-dialogue-title">`.
« Pour bien préparer votre demande, j'ai besoin d'un détail. » est un
`<p class="v11-clarification-intro" id="v11-dialogue-intro">`. Deux éléments **statiques** du HTML.

La question du modèle, elle, tient déjà le contrat :

> « Qu'attendez-vous concrètement comme résultat : un itinéraire jour par jour, une checklist de
> choses à préparer avant le départ, des recommandations de lieux et activités, ou autre chose ? »

L'UI emballe une bonne question entre un titre technique et une justification redondante.

## Recommandation : A, puis B après mesure

**A — rendre au plan rapide la parole qu'il a déjà.** Supprimer les deux éléments statiques ;
diagnostiquer le silence du plan rapide avec la télémétrie qui existe déjà (`fast_rejected`,
`fast_failure`, `fast_discarded_*`). Zéro contrat touché, zéro risque sémantique.

**B — l'Arbitre devient conditionnel sur le chemin de clarification.** Son état y est logiquement
forcé dès qu'une issue survit au Substitution Gate. Gain estimé : −28 s et −1 656 jetons. À faire
**après** mesure, parce qu'il formule mieux la question que le candidat brut de l'Analyste.

**C — profond conditionnel — est déconseillé.** Il donnerait au plan rapide une autorité de
non-escalade, exactement ce que son schéma interdit, et sacrifierait la garantie qui protège du faux
READY pour un gain que A obtient déjà.

## L'inconnue à lever avant toute implémentation

Une session navigateur sur le cas Italie, en relevant `oprieMark`. Elle dira si le plan rapide a
échoué, a été rejeté, ou a été écarté. **Coût : 0 USD.** Tant qu'elle n'est pas faite, optimiser le
plan profond revient à accélérer un chemin qui n'aurait jamais dû être celui de l'affichage.
