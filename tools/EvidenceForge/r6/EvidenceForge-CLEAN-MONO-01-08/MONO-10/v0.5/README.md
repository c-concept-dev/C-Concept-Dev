# MONO-10 v0.5 — Frontière de confiance opérateur

Lot **successeur** de MONO-10 v0.4 (historique, `NON_GELABLE`). Aucun lot
antérieur n'a été modifié.

## Le principe

> **EvidenceForge choisit ce qu'il vérifie.**
> **EvidenceForge ne choisit pas à qui il fait confiance.**

## Exécuter les tests

```
node test/test-mono10-v0.5.js <racine du bundle>              # 113 contrôles, T01-T48 + 48 mutations
node test/test-mono10-v0.5-integration.js <racine du bundle>  # 22 contrôles hors ligne
```

Aucun réseau, aucun LLM réel, aucun run EF-02, aucune exécution aval, aucun acte
humain réel.

## Avant de déployer

L'exploitant — **et non le code de mission** — doit provisionner :

1. **La frontière de confiance** : fichier JSON pointé par
   `EVIDENCEFORGE_OPERATOR_TRUST_CONFIG`. Sans elle, `OPERATOR_TRUST_NOT_PROVISIONED`.
2. **Un store anti-rejeu persistant** : obligatoire en production.
3. **Un mécanisme d'authentification d'acte humain** : sans lui, toute décision
   humaine est `NOT_AUTHENTICATED`.

Voir `KEY-MANAGEMENT.md` et `REPLAY-PROTECTION.md` pour les contrats complets.

## Documents

| Fichier | Contenu |
|---|---|
| `TRUST-MODEL.md` | qui contrôle quoi, où vivent les clés |
| `THREAT-MODEL.md` | ce qui est couvert **et ce qui ne l'est pas** |
| `KEY-MANAGEMENT.md` | provisionnement, rotation, révocation, incident |
| `REPLAY-PROTECTION.md` | nonce, portée, persistance, concurrence |
| `ARCHITECTURE.md` | d'où vient chaque valeur |
| `CONTRACT-MAPPING.md` | contrat ↔ module ↔ contrôle exécutable |
| `RUN-ORDER.md` | ordre normatif et barrières |
| `LINEAGE.md` | graphe typé et registre authentifié |
| `NON-REGRESSION.md` | intégrité des lots historiques |
| `AUDIT-REMEDIATION-MATRIX.md` | chaque bloqueur → sa fermeture → sa preuve |
| `MIGRATION-v0.4-v0.5.md` | ce qu'un appelant doit changer |
| `governance/` | la charte d'identité, d'ADN et de gouvernance |
