# Trace runtime réelle — LOT 10G.3B.3F.2

## Freeze

- Branche initiale : `main`.
- HEAD observé avant audit : `a1105282f21a009d9a4122caa2948d6164117ada`.
- Dépôt initial propre.
- Tests initiaux : **111/111 PASS**.
- Garde initiale : **PASS**.
- Diff-check initial : **PASS**.

Le dépôt a ensuite reçu des commits et pulls externes pendant la mission, sans commande Git exécutée par l'agent. Les diagnostics ci-dessous précèdent toute modification fonctionnelle.

## Reproduction publiée

URL : `https://c-concept-dev.github.io/C-Concept-Dev/tools/Atelier%20Prompts/atelier-prompts-v11.5-lot10g-decision-provider.html`

1. Mode explicitement sélectionné : Rapide.
2. Demande : `je veux préparer mon voyage en Italie`.
3. UI : question unique sur les villes ou régions.
4. Réponse : `Rome et Florence`.
5. UI suivante : sélection Architecte, statut « Préparation approfondie », génération immédiate du fichier d'échange.
6. Aucune seconde clarification n'est affichée avant ce basculement.

Console navigateur : aucune trace produite par ce parcours. Le contrôleur conserve ses états dans une fermeture ; `state.answers`, `adpState`, `lastEnvelope` et `lastProjection` n'étaient pas inspectables depuis l'extérieur.

## Réponses provider confirmées

Appels au primaire Workers AI avec l'origine autorisée :

| Tour | HTTP | Latence | Décision |
|---:|---:|---:|---|
| 1 | 200 | ~4,43 s | `clarification_necessaire`, route `null` |
| 2 | 200 | ~2,35 s | `exploitable`, route `architecte` |

Le primaire étant exploitable au moment du diagnostic, Groq n'est pas appelé.

## Preuve JSON fournie

`demande-pour-ia-745EZ7.json` conserve bien :

- la demande originale ;
- la question précédente et la réponse `Rome et Florence` dans l'entrée à analyser ;
- `readiness.state=contractualization` ;
- `can_analyze=true`, `can_execute=false` ;
- technique 9 désactivée avant exécution ;
- le bloc `EXECUTION READINESS GATE`.

Cette preuve confirme que l'historique n'est pas perdu. Elle confirme aussi que le Readiness Gate est seulement envoyé à Architecte : il n'a pas encore rendu de décision au moment où l'UI quitte la boucle provider.
