# RAPPORT LOT 10G.3B.3F — Engine Adapters

## Verdict

**PASS**

## Changement de phase

3F est le premier lot où le runtime ADN pilote effectivement le produit.

Le HTML autonome embarque désormais le runtime issu des modules 3C–3F et le pipeline construit une enveloppe ADN après la décision provider.

## Rapide

Le parcours Rapide :
- conserve le moteur historique gelé ;
- construit un ADN State enrichi ;
- sélectionne les verrous adaptatifs ;
- mappe les 13 verrous vers le runtime historique ;
- réalise une union additive avec les verrous historiques ;
- réassemble le prompt si un verrou ADN manquait ;
- fige le contrat historique pour le contrôle futur.

Aucun verrou historique n'est retiré en 3F.

## Architecte

Architecte reste strictement gelé.

L'enveloppe externe lui transmet désormais un `CONTRAT D’EXÉCUTION ADN — CADRAGE À PRÉSERVER` compact. Le contrat est présenté comme donnée de cadrage et non comme une instruction remplaçant la phase d'analyse JSON.

## Atelier

Atelier reste volontaire. Le runtime crée uniquement une projection de contexte avant d'ouvrir le parcours manuel.

## Routing Engine effectif

`adpDecideRapide()` consulte désormais le Routing Engine ADN. La panne du provider n'est plus assimilée automatiquement à un besoin Architecte.

La décision provider valide reste autoritaire. En fallback total, l'absence de preuve de préparation donne Rapide plutôt qu'Architecte.

## Runtime navigateur

Le HTML reste autonome : aucun import externe n'est nécessaire. Un bundle classique est généré depuis les sources `core/adn` puis embarqué inline.

## Validation

- 92/92 tests PASS
- guard PASS
- Rapide hash inchangé
- Architecte hash inchangé
- Atelier hash inchangé
- FORMATS hash inchangé
- VERROUS hash inchangé
- ARCH_SYSTEM hash inchangé
- ARCH_SCHEMA hash inchangé
- aucun déploiement

## Fichiers historiques modifiés hors zones gelées

- `atelier-prompts-v11.5-lot10g-decision-provider.html` : orchestration externe / bundle ADN / adapters.
- `core/adn/index.js` : export du nouvel adapter.

## Nouveaux fichiers principaux

- `core/adn/engine-adapters.js`
- `core/adn/browser-runtime.generated.js`
- `tools/build-adn-browser-runtime.mjs`
- `tests/engine-adapters.test.mjs`
- `tests/engine-adapters-html-integration.test.mjs`

## Prochaine étape

**10G.3B.3G — Compliance Engine commun.**

Objectif : faire converger les contrôles de complétude et de conformité de Rapide et Architecte vers une couche commune, notamment pour résoudre l'absence de contrôle final transversal d'Architecte identifiée en 3A.
