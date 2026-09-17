# Migration Notes

Notes complémentaires à `AUDIT-REMEDIATION/01-CANONICAL-SOURCE-
SELECTION.md`, sur des découvertes qui ont affiné la sélection de source
canonique au-delà de ce que les audits fournis affirmaient eux-mêmes —
chacune trouvée par vérification indépendante du contenu réel, jamais
en faisant confiance aveuglément à un audit ou au nom d'un fichier.

## MONO-01 : la copie imbriquée sous MONO-02 n'était pas la révision la plus mûre

L'audit condensé recommandait implicitement de prendre la copie de
MONO-01 imbriquée sous MONO-02 (première trouvée dans une recherche
naïve). Vérification : 148/148 tests, une révision INTERMÉDIAIRE.
La copie imbriquée bien plus profonde (sous MONO-05, via MONO-04→
MONO-03→MONO-02) donne 172/172 — confirmée par diff comme un
sur-ensemble ajoutant exactement les deux fichiers de test nécessaires à
la preuve CROSS_PROCESS de cette mission
(`test_t01_21_eforch_durable_cross_process.js`,
`test_t01_22_createmono01_integration_backend.js`). Sans cette
vérification par contenu, la révision retenue aurait été moins mûre que
nécessaire.

## MONO-02 : `Mono.zip` ne contenait aucune révision suffisante

`Mono.zip` (le bundle brut fourni par l'utilisateur, source primaire
attendue pour la canonicalisation) plafonne à 324 tests pour MONO-02.
MONO-05 lui-même (dans sa suite de non-régression
`test_t05_41_44_nonregression.js`) exige EXACTEMENT 334 en dur. Décision :
abandon COMPLET de `Mono.zip` pour MONO-02 (et par cascade MONO-03/04/05),
au profit du kit HANDOFF déjà utilisé et vérifié par un rejeu de gate
réel lors d'une mission antérieure. Ce n'est pas une préférence
arbitraire pour une source sur une autre : c'est la seule source
disponible qui satisfait le total exigé par un AUTRE lot déjà gelé.

## MONO-06 : le registre embarqué dans certaines archives était obsolète

Confirmé le finding F-11 de l'audit condensé : certaines révisions de
MONO-06 encodent un registre à 721 tests totaux (MONO-05=65), obsolète
par rapport à la baseline R3 réellement utilisée par ce projet
(785 total, MONO-05=119). Le kit HANDOFF utilisé pour cette
canonicalisation porte le registre à jour — vérifié en le faisant
RÉELLEMENT tourner (`runMono06Gate()`), jamais en inspectant seulement
son code source.

## MONO-07 : le ZIP du kit HANDOFF était corrompu

`EvidenceForge-MONO-07-v1.zip` (kit HANDOFF) s'extrait en un dossier
nommé `MONO-07-4` (nom inattendu), composé UNIQUEMENT de fichiers
AppleDouble macOS (`._README.md`, `._package.json`, etc.) — zéro
fichier réel dessous. Diagnostic : export macOS défaillant à la source,
jamais réparé/reconstruit ici. Remplacé par une extraction déjà
connue-bonne (30 fichiers réels), obtenue d'un upload distinct
correctement formé plus tôt dans cette même session de travail.

## Playwright et dépendances de test manquantes

`MONO-05` et `MONO-07` (canoniques) exigent Playwright pour leurs tests
navigateur ; `package.json` de MONO-07 ne le déclare pas dans
`devDependencies`. Installé manuellement (`npm install
playwright@1.56.0`, alignée sur la version déjà pinée par MONO-05) pour
permettre la réexécution complète des suites. Ceci n'affecte AUCUN
fichier du paquet final livré (le `node_modules/` résultant est exclu de
la release, régénérable via `npm ci`/`npm install`).

## Chemins de kit-root utilisés pour la vérification MONO-08

Les suites `test_t08_*` de MONO-08 nécessitent `EVIDENCEFORGE_KIT_ROOT`
(structure `04-ARTEFACTS-CANONIQUES/MONO/*.zip`, les 8 ZIP canoniques) et
`EVIDENCEFORGE_MONO07_LIB_PATH` (le dossier `lib/` de MONO-07,
contenant `harness-env.js`/`e2e-driver.js`/`mono06-gate.js`, réutilisés
tels quels — jamais recopiés dans MONO-08). Ce paquet livre MONO-00→07
en clair sous `MONO-XX/` (pas en ZIP) ; pour rejouer les suites MONO-08
telles quelles, un opérateur doit reconstituer un `kit-root` au format
attendu (zipper `MONO-00/`→`MONO-07/` sous
`04-ARTEFACTS-CANONIQUES/MONO/EvidenceForge-MONO-XX-<rev>.zip`) ou
adapter `EVIDENCEFORGE_KIT_ROOT` à la structure en clair — non fait dans
ce paquet pour éviter de dupliquer 8 fois le même contenu sous forme
zippée en plus de la forme en clair.
