# EvidenceForge — MONO-06 : Frozen Regression Harness

Harnais de non-régression global. Ne redéfinit aucune logique métier
EvidenceForge, aucun contrat gelé, aucune state machine, aucun
ResumePolicy. Vérifie automatiquement, à partir des 13 artefacts
canoniques déjà livrés (`04-ARTEFACTS-CANONIQUES/`), que MONO-00→05 et
les 7 lots historiques restent cohérents.

## Principe d'isolation baseline / execution (gouvernance du 30 août 2026)

Pour chaque artefact, MONO-06 crée **deux extractions indépendantes** du
même ZIP canonique :

- **baseline pristine** — jamais exécutée, jamais installée dedans. Sert
  uniquement aux checks d'intégrité (présence, manifeste, hash bytewise
  imbriqué, contrats JSON, recherche statique, limites connues).
- **execution workspace** — jetable, seule à recevoir `npm install`,
  `node_modules`, et l'exécution réelle des suites de tests.

Un side effect de test (ex. les captures d'écran Playwright de MONO-05
régénérées à chaque exécution) ne compare donc jamais l'execution
workspace après coup à son état initial — seule la baseline pristine sert
de référence d'intégrité. Voir `CDC-TRACE.md` pour l'historique complet
de cette décision.

## Contenu

```
lib/
  artifact-registry.js          — registre statique des 13 artefacts (aucune logique metier)
  workspace.js                  — extraction isolee baseline/execution
  manifest-hash-verifier.js     — T06-03 (manifeste racine + nested, base explicite par sous-arbre)
  nested-dependency-verifier.js — T06-04 (chaine bytewise complete, y compris provenance MONO-01 -> 7 lots historiques)
  test-runner.js                — T06-05 a T06-11 (execution reelle, execution workspace uniquement)
  contract-presence-checker.js  — T06-12 (presence + parse + compte attendu, detecte une disparition)
  static-search-runner.js       — T06-13/14/15 (hardcoding pilote, derive epistemique, secrets — perimetre precis, voir en-tete du fichier)
  known-limitations-checker.js  — T06-16 (limites connues toujours documentees)
  package-presence-checker.js   — T06-01/02
  harness.js                    — orchestrateur (aucune logique metier)
bin/run-harness.js              — CLI (--kit-root explicite, jamais de chemin implicite)
contracts/regression-harness-report-v1.json — schema du rapport
test/run-all.js                 — suite de tests du harnais lui-meme (T06-17/18 + scenarios adversariaux)
reports/mono-06-harness-report-v1.md — rapport de la derniere execution reelle
manifest/SHA256SUMS
```

## Utilisation

```bash
node bin/run-harness.js --kit-root <chemin racine du kit HANDOFF> --out rapport.json
```

Le chemin du kit est toujours un argument explicite — aucun défaut lié à
un environnement de session particulier (portabilité vérifiée par
`test/run-all.js`, scénario T06-PORTABILITY).

## Ce qui a été réellement prouvé, pas supposé

- Rejoué deux fois de façon indépendante sur le kit réel : rapport
  strictement identique (T06-18).
- 4 scénarios adversariaux exigés par `CRITERES-AUDIT-MONO-06.md`
  reproduits et confirmés détectés : octet muté dans une dépendance
  imbriquée à 4 niveaux de profondeur, contrat JSON retiré, chaîne `JMJS`
  injectée dans un fichier `lib/` de MONO-02, secret `sk-abcdef1234567890`
  injecté dans un fichier `lib/` de MONO-04.
- Les ZIP canoniques du kit original restent bit-à-bit identiques avant
  et après une exécution complète du harnais (aucune modification, même
  involontaire, d'un lot gelé).
- Total réel rejoué : MONO-00→05 = 721/721, 7 lots historiques =
  1223/1223 — comptes obtenus par exécution réelle des suites, jamais
  recopiés depuis `ETAT-EN-UNE-PAGE.md`.

## Bugs réels trouvés et corrigés pendant la construction (dans MONO-06 lui-même, jamais dans un lot gelé)

Voir `CDC-TRACE.md` pour le détail complet — résumé (2 cycles) :
1. Résolution de chemin incorrecte dans le vérificateur de manifeste.
2. Comptage de tests manqué sur un fichier dont les lignes `PASS`
   n'étaient pas en début de ligne.
3. Recherche statique naïve produisant des centaines de faux positifs.
4. Vérification de contrat ne détectant pas une disparition de fichier.
5. **(Audit indépendant, critique)** T06-15 excluait automatiquement tout
   secret situé dans `.md`/`test/`/`fixtures/`/`scripts/` — un vrai
   secret à ces emplacements passait en faux `PASS`. Corrigé en
   fail-closed : recherche sur tous les fichiers texte, exemption
   uniquement par allowlist exacte (fichier + hash de la valeur).
6. **(Audit indépendant)** Les valeurs de secrets détectées étaient
   recopiées en clair dans le rapport — corrigé avec rédaction
   obligatoire (`redactSecret()`), y compris dans les textes de
   justification de l'allowlist (découvert une seconde fois pendant la
   correction elle-même).
7. **(Audit indépendant)** MONO-05 utilisait `npm install` au lieu du
   protocole gelé `npm ci` exigé par le CDC — corrigé.
8. **(Audit indépendant)** Installations `jsdom` non déterministes
   (`latest` implicite) pour EF-PR-GEN-01/EF-02ABC — version figée à
   `24.1.3` avec provenance documentée.
9. **(Audit indépendant)** Aucun timeout sur les commandes externes —
   ajout de `lib/exec-with-timeout.js` avec 4 politiques nommées.

## Limite connue et assumée par MONO-06

`contract-presence-checker.js` fige un `expectedJsonContractCount` par
artefact, établi une fois à partir du premier run propre confirmé et
inscrit dans `artifact-registry.js`. Si un futur lot gelé ajoute
légitimement un contrat JSON, ce compte devra être mis à jour
explicitement (jamais silencieusement) — un ajout ferait alors passer le
check (`filesChecked > expected` reste `PASS`), seule une **diminution**
est traitée comme anomalie.
