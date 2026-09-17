"use strict";
/**
 * MONO-06 — artifact-registry.js
 *
 * Registre STATIQUE des 13 artefacts canoniques et de leurs proprietes
 * deja gelees (nom de ZIP, dossier racine attendu, emplacement du/des
 * manifeste(s) interne(s), commande de test, compte de tests attendu).
 *
 * Ce fichier ne contient AUCUNE logique metier EvidenceForge : il ne fait
 * que decrire OU se trouvent les preuves deja produites par MONO-00->05 et
 * les 7 lots historiques (cf. 00-START-HERE/ETAT-EN-UNE-PAGE.md et
 * 05-INVENTAIRES/artefact-inventory.json). Aucune valeur ici n'est
 * inventee : chaque champ est recopie depuis ces documents geles, et
 * verifie une seconde fois independamment (voir reports/mono-06-harness-report-v1.md).
 *
 * runner: decrit COMMENT rejouer les tests reels de l'artefact.
 *   - "npm"      : npm install (si besoin) puis `npm test`, la sortie
 *                  contient une ligne "TOTAL CUMULE : N tests".
 *   - "efOrch"   : pas de package.json ; installer fake-indexeddb,
 *                  construire le monolithe, verifier sa fidelite, puis
 *                  executer chaque test_ef_orch_*.js individuellement et
 *                  sommer les lignes "TOUS LES TESTS PASSENT (n)".
 *   - "mono00"   : melange pytest (3 fichiers .py) + un fichier .js execute
 *                  directement avec node ; sommer les comptes trouves dans
 *                  chaque sortie (voir mono00-runner.js).
 */

const MONO_ROOT = "04-ARTEFACTS-CANONIQUES/MONO";
const HIST_ROOT = "04-ARTEFACTS-CANONIQUES/HISTORIQUES";

const ARTIFACTS = [
  {
    id: "MONO-00",
    expectedJsonContractCount: 3,
    group: "MONO",
    zipPath: `${MONO_ROOT}/EvidenceForge-MONO-00-v1.zip`,
    rootDirInZip: "EvidenceForge-MONO-00-v1",
    manifestPaths: [{ path: "manifest/SHA256SUMS.txt", baseRel: "." }],
    runner: "mono00",
    expectedTests: 27,
    npmInstall: false
  },
  {
    id: "MONO-01",
    expectedJsonContractCount: 9,
    group: "MONO",
    zipPath: `${MONO_ROOT}/EvidenceForge-MONO-01-v1.zip`,
    rootDirInZip: "MONO-01",
    manifestPaths: [{ path: "manifest/SHA256SUMS", baseRel: "." }],
    nestedManifestPaths: [],
    runner: "npm",
    npmInstall: false,
    expectedTests: 172
  },
  {
    id: "MONO-02",
    expectedJsonContractCount: 5,
    group: "MONO",
    zipPath: `${MONO_ROOT}/EvidenceForge-MONO-02-R1.zip`,
    rootDirInZip: "MONO-02",
    manifestPaths: [{ path: "manifest/SHA256SUMS", baseRel: "." }],
    nestedManifestPaths: [
      { path: "dependencies/MONO-01/manifest/SHA256SUMS", baseRel: "dependencies/MONO-01" }
    ],
    runner: "npm",
    npmInstall: false,
    expectedTests: 334
  },
  {
    id: "MONO-03",
    expectedJsonContractCount: 6,
    group: "MONO",
    zipPath: `${MONO_ROOT}/EvidenceForge-MONO-03-R1.zip`,
    rootDirInZip: "MONO-03",
    manifestPaths: [{ path: "manifest/SHA256SUMS", baseRel: "." }],
    nestedManifestPaths: [
      { path: "dependencies/MONO-02/manifest/SHA256SUMS", baseRel: "dependencies/MONO-02" },
      { path: "dependencies/MONO-02/dependencies/MONO-01/manifest/SHA256SUMS", baseRel: "dependencies/MONO-02/dependencies/MONO-01" }
    ],
    runner: "npm",
    npmInstall: false,
    expectedTests: 64
  },
  {
    id: "MONO-04",
    expectedJsonContractCount: 5,
    group: "MONO",
    zipPath: `${MONO_ROOT}/EvidenceForge-MONO-04-R1.zip`,
    rootDirInZip: "MONO-04",
    manifestPaths: [{ path: "manifest/SHA256SUMS", baseRel: "." }],
    nestedManifestPaths: [
      { path: "dependencies/MONO-03/manifest/SHA256SUMS", baseRel: "dependencies/MONO-03" },
      { path: "dependencies/MONO-03/dependencies/MONO-02/manifest/SHA256SUMS", baseRel: "dependencies/MONO-03/dependencies/MONO-02" },
      { path: "dependencies/MONO-03/dependencies/MONO-02/dependencies/MONO-01/manifest/SHA256SUMS", baseRel: "dependencies/MONO-03/dependencies/MONO-02/dependencies/MONO-01" }
    ],
    runner: "npm",
    npmInstall: false,
    expectedTests: 69
  },
  {
    id: "MONO-05",
    expectedJsonContractCount: 3,
    group: "MONO",
    zipPath: `${MONO_ROOT}/EvidenceForge-MONO-05-R3.zip`,
    rootDirInZip: "MONO-05",
    manifestPaths: [{ path: "manifest/SHA256SUMS", baseRel: "." }],
    nestedManifestPaths: [
      { path: "dependencies/MONO-04/manifest/SHA256SUMS", baseRel: "dependencies/MONO-04" },
      { path: "dependencies/MONO-04/dependencies/MONO-03/manifest/SHA256SUMS", baseRel: "dependencies/MONO-04/dependencies/MONO-03" },
      { path: "dependencies/MONO-04/dependencies/MONO-03/dependencies/MONO-02/manifest/SHA256SUMS", baseRel: "dependencies/MONO-04/dependencies/MONO-03/dependencies/MONO-02" },
      { path: "dependencies/MONO-04/dependencies/MONO-03/dependencies/MONO-02/dependencies/MONO-01/manifest/SHA256SUMS", baseRel: "dependencies/MONO-04/dependencies/MONO-03/dependencies/MONO-02/dependencies/MONO-01" }
    ],
    runner: "npm",
    npmInstall: true,
    npmInstallMode: "ci", // protocole gele du lot (voir son propre README) — jamais "npm install" (correction post-audit)
    playwrightInstall: true,
    // Mis a jour pour la rebaseline corrective R2 (MONO05-R2-REG-01 +
    // MONO05-R2-REG-02, voir CDC-TRACE.md) : 65 (historique) + 21 (REG-01) +
    // 13 (REG-02) + 7 (croise) = 106.
    expectedTests: 119
  },
  {
    id: "EF-ORCH",
    expectedJsonContractCount: 0,
    group: "HISTORIQUE",
    zipPath: `${HIST_ROOT}/EF-ORCH-RELEASE-v0.1.zip`,
    rootDirInZip: "EF-ORCH-RELEASE-v0.1",
    manifestPaths: [{ path: "SHA256SUMS.txt", baseRel: "." }],
    runner: "efOrch",
    expectedTests: 842
  },
  {
    id: "EF-PR-GEN-01",
    expectedJsonContractCount: 4,
    group: "HISTORIQUE",
    zipPath: `${HIST_ROOT}/EF-PR-GEN-01-FINAL.zip`,
    rootDirInZip: "EF-PR-GEN-01",
    manifestPaths: [],
    manifestStatus: "HISTORICAL_FREEZE_CONFIRMED_NO_MANIFEST",
    runner: "npm",
    npmInstall: true,
    npmInstallPackage: "jsdom",
    // Version figee (correction post-audit — jamais "latest" pour un harnais de
    // non-regression). Provenance : la plage declaree dans le package.json GELE
    // de ce lot est "^24.0.0" (jamais modifiee) ; 24.1.3 est la version reelle
    // resolue par npm au moment de la construction de MONO-06 (30 aout 2026),
    // confirmee compatible par l'execution reelle 105/105.
    npmInstallPackageVersion: "24.1.3",
    expectedTests: 105
  },
  {
    id: "EF-02ABC",
    expectedJsonContractCount: 3,
    group: "HISTORIQUE",
    zipPath: `${HIST_ROOT}/EF-02ABC-v1.zip`,
    rootDirInZip: "EF-02ABC-v1",
    manifestPaths: [],
    manifestStatus: "HISTORICAL_FREEZE_CONFIRMED_NO_MANIFEST",
    runner: "npm",
    npmInstall: true,
    npmInstallPackage: "jsdom",
    // Meme provenance que EF-PR-GEN-01 ci-dessus.
    npmInstallPackageVersion: "24.1.3",
    expectedTests: 30
  },
  {
    id: "EF-02D",
    expectedJsonContractCount: 21,
    group: "HISTORIQUE",
    zipPath: `${HIST_ROOT}/EF-02D-v1.zip`,
    rootDirInZip: "EF-02D-v1",
    manifestPaths: [{ path: "EF-02D-MANIFEST-SHA256.txt", baseRel: "." }],
    runner: "npm",
    npmInstall: false,
    expectedTests: 49
  },
  {
    id: "EF-02E",
    expectedJsonContractCount: 18,
    group: "HISTORIQUE",
    zipPath: `${HIST_ROOT}/EF-02E-v1.zip`,
    rootDirInZip: "EF-02E-v1",
    manifestPaths: [{ path: "EF-02E-MANIFEST-SHA256.txt", baseRel: "." }],
    runner: "npm",
    npmInstall: false,
    expectedTests: 60
  },
  {
    id: "EF-03",
    expectedJsonContractCount: 39,
    group: "HISTORIQUE",
    zipPath: `${HIST_ROOT}/EF-03-v1.zip`,
    rootDirInZip: "EF-03-v1",
    manifestPaths: [{ path: "EF-03-MANIFEST-SHA256.txt", baseRel: "." }],
    runner: "npm",
    npmInstall: false,
    expectedTests: 100
  },
  {
    id: "EF-04",
    expectedJsonContractCount: 37,
    group: "HISTORIQUE",
    zipPath: `${HIST_ROOT}/EF-04-v1.zip`,
    rootDirInZip: "EF-04-v1",
    manifestPaths: [{ path: "EF-04-MANIFEST-SHA256.txt", baseRel: "." }],
    runner: "npm",
    npmInstall: false,
    expectedTests: 37
  }
];

// Mis a jour pour la rebaseline corrective R1 (regressionId:
// MONO02-CORPUS-BY-REF-MAP, voir CDC-TRACE.md) : MONO-02 passe de 324 a
// 334 tests (10 tests de regression reels ajoutes, aucun test historique
// retire) ; MONO-03/04/05 restent inchanges dans leur propre total (rebase
// de dependance uniquement, aucun changement de code propre).
// Mis a jour pour la rebaseline corrective R2 (regressionId:
// MONO05-R2-REG-01 + MONO05-R2-REG-02, voir CDC-TRACE.md) : MONO-05 passe
// de 65 a 106 tests (41 tests de regression reels ajoutes, aucun test
// historique retire).
// Mis a jour pour la rebaseline corrective R3 (regressionId:
// MONO05-R3-REG-01, voir CDC-TRACE.md) : MONO-05 passe de 106 a 119 tests
// (13 tests de regression reels ajoutes, aucun test historique retire).
const EXPECTED_MONO_TOTAL = 27 + 172 + 334 + 64 + 69 + 119; // 785 (etait 772 avant R3)
const EXPECTED_HISTORIQUE_TOTAL = 842 + 105 + 30 + 49 + 60 + 100 + 37; // 1223

module.exports = { ARTIFACTS, EXPECTED_MONO_TOTAL, EXPECTED_HISTORIQUE_TOTAL };
