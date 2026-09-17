# MONO-10 v0.3 — Qualification scientifique

Lot **successeur** de MONO-10 v0.2 (historique, `NON_GELABLE`). Aucun lot
antérieur n'a été modifié.

## Exécuter les tests

```
node test/test-mono10-v0.3.js <racine du bundle>      # 88 contrôles adversariaux
node test/test-mono10-v0.3-integration.js             # 26 contrôles de bout en bout
```

Aucun réseau, aucun LLM réel, aucun run EF-02, aucune exécution aval.

## Documents

| Fichier | Contenu |
|---|---|
| `ARCHITECTURE.md` | ce que fait le lot, et d'où vient chaque valeur |
| `CONTRACT-MAPPING.md` | contrat ↔ module livré ↔ invariant |
| `RUN-ORDER.md` | ordre d'exécution normatif et barrières |
| `LINEAGE.md` | résolution de lignée et liaison au run |
| `NON-REGRESSION.md` | intégrité des lots gelés |
| `AUDIT-REMEDIATION-MATRIX.md` | chaque constat d'audit → sa fermeture → sa preuve |
| `MIGRATION-v0.2-v0.3.md` | ce qu'un appelant doit changer |
| `schemas/MONO-10-SCHEMAS-v0.3.json` | schémas implémentés |

## Le principe

> Aucune valeur auto-déclarée ne constitue à elle seule une preuve.
