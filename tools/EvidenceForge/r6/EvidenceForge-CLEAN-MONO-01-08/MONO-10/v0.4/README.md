# MONO-10 v0.4 — Racine de confiance et authentification des preuves

Lot **successeur** de MONO-10 v0.3 (historique, `NON_GELABLE`). Aucun lot
antérieur n'a été modifié.

## Le principe

> Une chaîne cohérente n'est pas une preuve de production.
> La racine de confiance est **extérieure** à la chaîne.

## Exécuter les tests

```
node test/test-mono10-v0.4.js <racine du bundle>   # 82 contrôles, T01-T24 + 24 mutations
node test/test-mono10-v0.4-integration.js          # 17 contrôles de bout en bout (autonome)
```

Aucun réseau, aucun LLM réel, aucun run EF-02, aucune exécution aval.

## Avant de déployer

1. Configurer les **ancrages de confiance** (clés publiques des autorités, par
   mode d'exécution). Aucun ancrage de production n'est livré : sans
   configuration, le lot échoue fermé.
2. Fournir un **mécanisme d'authentification d'acte humain** pour la production.
   Sans lui, toute décision humaine est `NOT_AUTHENTICATED`.
3. Fournir un **registre d'autorités d'identité**. Sans lui, aucune indépendance
   n'est démontrable et la confiance plafonne à `MODERATE`.

## Documents

| Fichier | Contenu |
|---|---|
| `TRUST-MODEL.md` | d'où vient la confiance, où vivent les clés |
| `THREAT-MODEL.md` | ce qui est couvert **et ce qui ne l'est pas** |
| `ARCHITECTURE.md` | d'où vient chaque valeur |
| `CONTRACT-MAPPING.md` | contrat ↔ module ↔ contrôle exécutable |
| `RUN-ORDER.md` | ordre normatif et barrières |
| `LINEAGE.md` | graphe d'arêtes typées |
| `NON-REGRESSION.md` | intégrité des lots historiques |
| `AUDIT-REMEDIATION-MATRIX.md` | chaque bloqueur → sa fermeture → sa preuve |
| `MIGRATION-v0.3-v0.4.md` | ce qu'un appelant doit changer |
| `governance/` | la charte d'identité, d'ADN et de gouvernance |
