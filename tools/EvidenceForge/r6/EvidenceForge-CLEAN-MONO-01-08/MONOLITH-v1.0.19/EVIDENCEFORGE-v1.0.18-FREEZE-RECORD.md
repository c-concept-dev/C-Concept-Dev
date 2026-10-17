# MONOLITH-v1.0.18 — Gel canonique

MONOLITH-v1.0.18 = FROZEN_WITH_RESERVATIONS

CREATE_ONLY = CLOSED / VALIDATED. Décision propriétaire explicite après audit indépendant du 2026-10-09.

ACTIVE_VERSION = MONOLITH-v1.0.16 ; activated=false.

- 205 fichiers scellés ; 207 dans l’archive avec MANIFEST et SHA256SUMS.
- contentHash : `720bb6820422becbfc9b3de093684c2f321ad4f10963da2393702e608737c913`
- ZIP SHA-256 : `6b87f50b6aa60ab6b2c91cdb0457e000d8b5bec5968ee09cf45c17f095d173e9`
- MANIFEST SHA-256 : `21d7db91d043b2ad5b1d9795442c47827aa2ef7ea95418596913f1b2255b2811`
- SHA256SUMS SHA-256 : `b5844d29ce7a3928cb3b252ab5e77cdcb3de6b6b8a0f4182fef4035263545d13`
- Tests audités : 377/377 ; mutants : 6/6. Non rejoués pendant le gel.
- Archive extraite dans un nouveau dossier temporaire, inventaire et chaque hash vérifiés ; 0 divergence.
- v1.0.16, v1.0.17 et huit lots protégés : inventaires avant/après identiques.
- 0 provider, 0 USD, aucun nouveau run, aucune modification métier, aucune reprise App.

## Réserves conservées

- Diagnostic fournisseur au démarrage historique : credentials configurés peuvent déclencher une sonde indépendante de CREATE-ONLY.
- resume accepte CREATED mais lance le pipeline ; publicState.resumable reste false pour CREATED. APP-04B doit respecter cette asymétrie.
- Courte séquence de startRun dupliquée dans createRunOnly ; parité différentielle couverte, dette de maintenance conservée.
- Aucune transaction filesystem globale : garanties du store historique en cas d’erreur disque tardive.
- Audit CREATE-ONLY uniquement : intégration Desktop APP-04A, APP-04B et activation non validées.
- Auditeur indépendant : suite complète 377/377 non rejouée faute de lots frères ; journaux et empreintes fournis vérifiés. Tests et mutants non rejoués pendant le gel.

Protocole : commit de gel v1.0.17 `57b4ac65c9c8d7acf399b5e99b84771bf1f3a223`. Le runtime audité et son manifeste restent byte-identiques. Les sidecars de gouvernance sont hors archive runtime et scellés séparément. Les mentions CANDIDATE/frozen=false des preuves antérieures décrivent l’état avant cette décision.

Un commit dédié enregistre le gel ainsi que la candidate auditée auparavant non suivie ; aucune activation, aucun push. SHA consultable via git log sur ce record. STOP.
