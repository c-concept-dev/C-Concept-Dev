# LOT 10G.3B.3F — Engine Adapters v1

## Objet
Brancher le runtime ADN construit en 3C–3E vers les parcours réels sans modifier les moteurs gelés.

## Architecture

```text
Demande
  ↓
Decision Provider
  ↓
ADN State
  ↓
Adaptive Lock Selector
  ↓
Routing Engine
  ↓
ExecutionContract v1
  ↓
Engine Adapter
  ├─ Rapide
  ├─ Architecte
  └─ Atelier manuel
```

## Stratégie anti-régression

- Les fonctions gelées Rapide, Architecte et Atelier ne sont pas modifiées.
- Rapide conserve tous les verrous historiques sélectionnés et reçoit uniquement, par union, les verrous ADN supplémentaires nécessaires.
- Architecte conserve `ARCH_SYSTEM` et `ARCH_SCHEMA` inchangés ; un contrat compact est ajouté dans l'enveloppe externe comme donnée de cadrage.
- Atelier reste volontaire et manuel.
- Si le runtime ADN navigateur échoue, les parcours historiques restent disponibles par fallback local de compatibilité.
