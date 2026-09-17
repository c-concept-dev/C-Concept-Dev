# MONO-00 — Frozen Baseline Registry

Premier lot du chantier d'assemblage final EvidenceForge. **Ne construit aucun code de l'orchestrateur** — inventorie, vérifie et verrouille la baseline gelée sur laquelle MONO-01 s'appuiera.

## Contenu

```
registry/    — mono-00-frozen-baseline-registry-v1.json (10 fiches module)
             — mono-00-file-inventory-v1.json (295 fichiers, hash + rôle)
             — mono-00-contract-matrix-v1.json (14 lignes, chaîne bout en bout)
reports/     — verification-report, static-search-report, test-report,
               missing-artifacts, conflicts, competing-versions,
               contract-matrix.md
scripts/     — verify-manifests.sh, static-search.sh, build-registry.py
manifest/    — SHA256SUMS (fichiers internes de CE paquet MONO-00)
```

## Méthode

Chaque paquet canonique gelé (EF-ORCH, EF-PR-GEN-01, EF-02ABC, EF-02D, EF-02E, EF-03, EF-04) a été **extrait dans un répertoire temporaire neuf**, sans dépendance à l'espace de travail où le code a été développé. Manifeste vérifié quand présent (`sha256sum -c` + `diff` d'exhaustivité), tests rejoués à froid (`npm ci && npm test`, ou invocation individuelle pour EF-ORCH qui n'a pas de `package.json`).

**Aucun fichier d'un lot gelé n'a été créé, modifié ou complété.** Les hashes exhaustifs calculés ici (au-delà des manifestes existants) appartiennent exclusivement au registre MONO-00.

## Hiérarchie de preuve utilisée

`VERIFIED_FROM_CANONICAL_PACKAGE` > `VERIFIED_FROM_CANONICAL_ARTIFACTS` > `HISTORICAL_FREEZE_CONFIRMED` > `UNVERIFIED` / `CONFLICT`. Ces niveaux ne sont jamais confondus entre eux — en particulier, une preuve d'exécution réelle en environnement externe (le smoke EF-02A/B/C) reste distincte de la vérification du code lui-même, via des champs granulaires séparés (`packageVerification` / `realSmokeVerification`) plutôt qu'un statut unique qui masquerait la différence.

## Résultat global

**1223/1223 tests historiques rejoués et passants**, sur les sept paquets canoniques retrouvés. Aucun `CONFLICT` réel (un cas apparent résolu par inspection directe du contenu). Aucun `REAL_HARDCODING` trouvé dans le cœur générique d'aucun lot. Deux manques de preuve documentés explicitement (smoke réel physique, manifestes de lots pré-EF-02D) — aucun ne bloque le début de MONO-01.

**Chaîne de contrats bout en bout** : vérifiée programmatiquement (T00-09) contre la matrice — voir `registry/mono-00-contract-matrix-v1.json` et sa note de correction post-audit indépendant (EF-02A↔CorpusSnapshot, EF-03B↔MissionDocumentMapping désormais explicites).

**Portabilité** : `scripts/build-registry.py` et `scripts/static-search.sh` acceptent des chemins explicites (`--baseline-root`/`--output`, ou argument positionnel) et ne codent en dur aucun chemin de session Claude — prouvé par `tests/test_mono00_script_portability.py`, qui les exécute depuis un emplacement arbitraire.

Voir `reports/mono-00-verification-report-v1.md` pour le détail complet, et le rapport final de ce README pour le verdict proposé.
