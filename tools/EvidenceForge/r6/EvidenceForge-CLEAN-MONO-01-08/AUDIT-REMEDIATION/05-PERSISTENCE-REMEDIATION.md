# 05 — Persistence Remediation (CROSS_INSTANCE vs CROSS_PROCESS)

## Terminologie (mandat section 10)

- **CROSS_INSTANCE** : même processus OS, même backend en mémoire
  réutilisé (mêmes `Map`), seulement un nouvel objet JS wrapper.
- **CROSS_PROCESS** : processus OS RÉELLEMENT distincts, aucun objet/
  Map/mono01/mono03 partagé, l'état ne survit que via un support durable
  externe rouvert indépendamment par le second processus.

`CROSS_INSTANCE != CROSS_PROCESS` — ne jamais confondre les deux, ne
jamais présenter l'un comme preuve de l'autre.

## Ce que le test historique MONO-07 prouve réellement

`test/e2e/test_t07_e2e_resume.js` (MONO-07, **non modifié par cette
mission**) :
- construit `envA` ;
- construit `runRegistryB` à partir de `envA.mono01` ET `envA.mono03`
  (mêmes instances) ;
- `envB = { ...envA, runRegistry: runRegistryB, operatorApi: operatorApiB }`.

Seule la `Map` interne des engines change. Le backend MONO-03 en mémoire,
le backend EF-ORCH en mémoire, `mono01`/`mono03`/`mono04` : tous
identiques entre A et B, dans le MÊME processus Node.

**Classification correcte : CROSS_INSTANCE.** Ce test reste une preuve
solide et suffisante de réhydratation logique (l'engine reconstruit
l'état correctement à partir des artefacts persistés) — il n'a jamais
prétendu prouver autre chose une fois correctement nommé. Le rapport/
README source parlait de « crash/resume réel » et de « nouvelle
instance » — une terminologie surqualifiée (finding F-13 de l'audit
condensé), jamais corrigée dans la prose de MONO-07 elle-même (lot gelé,
RÈGLE CARDINALE — aucune valeur fonctionnelle n'est en jeu, seulement une
imprécision de vocabulaire dans un commentaire narratif).

Ce test est **PRÉSERVÉ TEL QUEL**, jamais réécrit, jamais supprimé, dans
le paquet final.

## La nouvelle preuve CROSS_PROCESS

`test/test_t08_cross_process.js` (MONO-08, nouveau) :

1. **Backend durable** : `lib/file-durable-backend.js` — fichiers JSON
   individuels sur disque, écriture atomique (fichier temporaire +
   `rename`). Implémente EXACTEMENT les deux contrats abstraits déjà
   gelés (`ef-orch-durable-backend-v0.1.js` : `get/put/has/keys` ;
   `persistence-backend.js` : `get/put/has/delete/keys`), tous deux
   documentant explicitement qu'une implémentation de production est
   attendue en injection externe — composition pure, aucune ligne de
   MONO-01/MONO-03 modifiée.

2. **Processus A** (`test/cross-process/worker-a.js`), lancé via
   `child_process.spawn("node", [...])` (processus OS réel, jamais
   simulé) :
   - construit ses PROPRES `mono01`/`mono03` (via `createMono01`/
     `createMono03` directement, contournant
     `cfg.createOperatorBackends()` — Option A) avec le backend fichier ;
   - crée un run (`createRealMissionRun`, mode LOCAL_CONTROLLED,
     adaptateur/fetch synthétiques, aucun réseau réel) ;
   - avance le graphe SEULEMENT jusqu'à `EF-ORCH-SUBSYSTEM=SUCCESS`
     (`driveRun(..., {stopBeforeNode:"EF-PR-GEN-01"})`) — 13/14 nœuds
     restent volontairement non exécutés ;
   - se termine COMPLÈTEMENT (`process.exit`).

3. **Processus B** (`test/cross-process/worker-b.js`), lancé SEULEMENT
   après confirmation de la sortie de A (jamais en parallèle) :
   - reconstruit `mono01`/`mono03`/`runRegistry`/`operatorApi` À NEUF
     dans son propre processus (le cache de modules Node est propre à
     chaque processus : aucune astuce nécessaire, c'est une garantie du
     runtime) ;
   - ouvre le MÊME dossier sur disque (aucun canal IPC transportant un
     objet — seul le chemin, une chaîne, transite via `argv`) ;
   - appelle `rehydrateRealMissionRun()` (fonction MONO-08 déjà
     existante et testée ailleurs, jamais réimplémentée ici) ;
   - termine le run jusqu'à 14/14 SUCCESS.

4. L'orchestrateur vérifie : PID(A) ≠ PID(B) ≠ PID(orchestrateur) ; A
   sort avec exit 0 en ayant produit EXACTEMENT le progrès partiel
   attendu ; B sort avec exit 0 en ayant produit 14/14 SUCCESS ; le
   backend fichier lui-même respecte son contrat (`get`/`put`/`has`/
   `delete`/`keys`, visibles depuis une SECONDE instance du backend
   pointant vers le même dossier, jamais le même objet JS).

**Résultat** : `CROSS_PROCESS = PASS`. Support durable nommé
explicitement : `FILE_DURABLE` (fichiers JSON individuels, écriture
atomique temp+rename), chemins disque imprimés dans le rapport. Aucun
réseau réel. 12/12 assertions PASS
(`TEST-REPORTS/MONO-08/test_t08_cross_process.out`).

## Ce qui N'A PAS été fait

- MONO-05 n'a pas été modifié pour permettre l'injection d'un backend
  durable dans `createOperatorBackends()` — l'Option A (composition
  directe) a suffi (voir `04-CONTRACT-IMPACTS.md`, point 1).
- Aucun mécanisme de production réellement déployé (IndexedDB, base de
  données, stockage cloud) n'a été branché — `FILE_DURABLE` est une
  implémentation de RÉFÉRENCE prouvant que le contrat d'injection
  fonctionne réellement cross-process, pas une recommandation de
  déploiement en l'état pour un usage réseau réel multi-nœuds.
- MONO-04 (cache d'idempotence/circuit breaker in-process, finding F-06
  condensé) n'a pas été impliqué : la preuve CROSS_PROCESS utilise un
  adaptateur LOCAL_CONTROLLED qui n'appelle jamais réellement `mono04`.
