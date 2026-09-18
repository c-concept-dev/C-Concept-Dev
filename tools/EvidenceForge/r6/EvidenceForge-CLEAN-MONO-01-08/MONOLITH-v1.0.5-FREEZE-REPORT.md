# RAPPORT DE GEL — MONOLITH-v1.0.5 (2026-09-18, gel administratif et cryptographique, 0 USD, aucun appel fournisseur)

1. **Décision de gel** : MONOLITH-v1.0.5 = **GELÉ**, décision du propriétaire produit après audit global (verdict GELABLE). Aucun changement fonctionnel.
2. **Candidat exact** : `tools/EvidenceForge/` au commit `3add607fdfcb5d4864dd3ed4cc541217c95e854d` (smoke Run Safety) ; sous-arbre byte-identique au HEAD
   du dépôt au moment du gel (`ebc2d072615e57f0d358185fa5899908ebf66174`) : `git diff --name-status 3add607f..HEAD -- tools/EvidenceForge/` vide.
3. **Provenance Git** : FUNCTIONAL_EVIDENCEFORGE_TREE_HASH `974fcfd656bd3892e264377cd0ea8700649b7abd` ; FUNCTIONAL_MONOLITH_TREE_HASH
   `ab8554a6e3b9d456524157ed5feaa6e3993f98f4` (recalculés par `git rev-parse HEAD:<chemin>`, égaux à ceux de l'audit). Le HEAD global contient des commits
   Atelier Prompts / Studio postérieurs au candidat : ils ne touchent pas EvidenceForge. Notions distinctes : GIT_TREE_HASH (tree git), CONTENT_HASH
   (`MANIFEST.json contentHash 151937a1d3e1b1fff6691274f1d9b7dda52e6285df80bdaaf7c961931459facc`, 94 fichiers, recalculé par `build-manifest.js --verify`),
   ZIP_SHA256 (octets du ZIP canonique).
4. **Tests (rejoués avant packaging, sans fournisseur)** : monolith **198/198**, navigateur **33/33**, lanceur **14/14**, secrets **0 hit**, anti-hardcoding
   **0 hit** (9 522 jetons de 6 runs réels), manifest interne 94 fichiers / 0 mauvais, `SHA256SUMS.txt` 94/94 OK. Les trois fichiers de résultats réécrits par
   les suites (horodatages) ont été restaurés (`git checkout --`) : aucun changement fonctionnel ne subsiste.
5. **Lots gelés** : MONO-01 106, MONO-09 v0.2 9, MONO-10 v0.19 79 (zip `f5a41654…`), MONO-11 v0.3-r1 52 (zip `3c44b397…`) — **0 divergence** (`verifyFrozenLots`).
6. **Méthode de packaging** : `tools/package.sh` (existant) n'est pas déterministe (horodatages, ordre) ; un outil **administratif** hors runtime a été ajouté :
   `tools/EvidenceForge/bin/freeze-package.py` — contenu lu depuis **git archive** du tree (jamais le système de fichiers local), liste triée, aucune entrée de
   répertoire, horodatage fixe 1980-01-01, attributs fixes 0100644 / Unix, aucun champ extra, DEFLATE 9 (Python 3.13.1, zlib 1.2.12), exclusions `*.zip`,
   `*.sha256`, `.DS_Store`, `__MACOSX`, `.git`, `node_modules`, `*.log`, `.env*`, `runs/`, `scratch/`. Racine unique `MONOLITH-v1.0.5/` (les archives v1.0.x
   antérieures étaient à plat : différence de mise en forme documentée, contenu identique au tree).
7. **BUILD A** (`/tmp/ef-freeze-a`) : `c6eae8afb03c66963194427bb30bb49b2697b9ca236dcdd8b83bf7f1bb39b7a1`, 460 673 octets, 96 entrées.
8. **BUILD B** (`/tmp/ef-freeze-b`, répertoire indépendant, 2 s plus tard) : `c6eae8afb03c66963194427bb30bb49b2697b9ca236dcdd8b83bf7f1bb39b7a1`, 460 673 octets.
9. **BUILD C** (`/tmp/ef-freeze-c`, après promotion, depuis le tree canonique `HEAD:…/MONOLITH-v1.0.5`) : `c6eae8afb03c…39b7a1`, `cmp` avec le ZIP canonique : identique.
   Une reconstruction supplémentaire depuis `origin/main` après push est effectuée et rapportée dans la sortie terminale du gel.
10. **Hashes** : ZIP_SHA256 `c6eae8afb03c66963194427bb30bb49b2697b9ca236dcdd8b83bf7f1bb39b7a1` ; CONTENT_HASH `151937a1…9facc` ; GIT_TREE_HASH (voir 3).
11. **Comparaison byte à byte** : `cmp A B` identique ; `cmp C canonique` identique ; SHA A = B = C = canonique.
12. **Inventaire du ZIP** : 96 entrées, toutes sous `MONOLITH-v1.0.5/` ; = 94 fichiers du MANIFEST interne (0 extra, 0 manquant, 0 hash différent) +
    `MANIFEST.json` + `SHA256SUMS.txt` ; aucun `.DS_Store`, `__MACOSX`, `.env*`, `.log`, `runs/`, zip ; scan de secrets 0 hit ; `shasum -c SHA256SUMS.txt` 94/94 OK.
13. **Manifeste** : `MONOLITH-v1.0.5-FREEZE-MANIFEST.json` (externe, identité du ZIP) ; le `MANIFEST.json` interne (contenu du bundle) n'est pas modifié
    et n'inclut pas le ZIP : aucun cycle.
14. **Emplacement du ZIP** : convention existante (zip dans le dossier de version, versionné en git comme `MONOLITH-v1.0.4/EvidenceForge-MONOLITH-v1.0.4.zip`) :
    `tools/EvidenceForge/r6/EvidenceForge-CLEAN-MONO-01-08/MONOLITH-v1.0.5/EvidenceForge-MONOLITH-v1.0.5.zip` ; `.sha256` à côté
    (`<SHA256>  EvidenceForge-MONOLITH-v1.0.5.zip`, vérifié par `shasum -a 256 -c`). Le ZIP non déterministe précédent (`c258072f…`, 458 536 octets, même
    contenu à plat) est remplacé par le ZIP canonique.
15. **Commit administratif** : un seul commit contenant exclusivement : le ZIP canonique (remplacement), `EvidenceForge-MONOLITH-v1.0.5.zip.sha256`,
    `MONOLITH-v1.0.5-FREEZE-MANIFEST.json`, `MONOLITH-v1.0.5-FREEZE-DECISION.md`, ce rapport, `bin/freeze-package.py`. Aucun fichier runtime, config, UI,
    pipeline, test fonctionnel, policy ou lot gelé. SHA du commit et vérification `origin/main` : sortie terminale du gel.
16. **Working tree final** : aucune modification fonctionnelle ; `git diff --name-only 3add607f HEAD -- tools/EvidenceForge` = 0 fichier avant le commit
    administratif ; après ce commit, seuls les artefacts listés en 15 s'ajoutent (FREEZE_ADMIN_TREE_HASH ≠ FUNCTIONAL_TREE_HASH par construction).
17. **Limitations conservées** (non bloquantes, cf. manifeste de gel `knownLimitations` et audit global AA) : fichiers d'arrêt = dernier cycle ; kits EF-01
    couverts aux transitions d'étape ; bouton d'arrêt masqué aux portes ; latence d'affichage du coût ; équilibrage de portefeuille = proposition heuristique ;
    Pages publie le dépôt ; `PANEL_SUFFICIENT` non observé en réel ; budget par étape absent ; bornes de sortie moins efficaces qu'estimé ; cache/lots/EF-02D3
    non traités ; anciens `budget.json` sans mode.
18. **Verdict final** : **FROZEN** — MONOLITH-v1.0.5 = GELÉ. Toute évolution part dans MONOLITH-v1.0.6 ou ultérieure.
