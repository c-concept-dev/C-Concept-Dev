// EvidenceForge — EF-ORCH-03C — Exécuteur EF-01A — v0.1
// Transforme un RunContract confirmé en EvidenceForge.MissionDraft / EF-01A-v2,
// EXACTEMENT compatible avec le vrai module EF-01A (mêmes noms de champs,
// même forme de document, mêmes conventions de génération d'ID, même
// statut:"brouillon" forcé à l'export).
//
// EF-01A réel est presque entièrement une interface de saisie humaine (DOM,
// drag-drop, formulaire) sans logique métier propre au-delà de la mise en
// forme finale. La confirmation macro du RunContract remplace déjà cette
// saisie humaine — cet exécuteur reproduit donc directement la forme de
// sortie plutôt que de piloter un DOM headless (décision actée avant codage).
//
// Principe d'adressage, non négociable :
//   - CONTENU (octets) -> adressé par hash (documentBytes[hashSha256]).
//     Un même hash implique le même contenu, donc une seule entrée suffit.
//   - OCCURRENCE (id, ajouteLe) -> adressée par POSITION dans la liste
//     d'origine du RunContract (metadata.documents.targetDocuments[i] /
//     .suppliedEvidence[i]), jamais par hash. Deux occurrences distinctes
//     (même dans deux catégories différentes, ou deux fois dans la même
//     catégorie) peuvent partager le même contenu tout en restant deux
//     documents différents avec des id/ajouteLe différents — indexer les
//     métadonnées d'occurrence par hash les fusionnerait à tort.
//
// Aucune métadonnée volatile n'est générée ici (pas de Date.now(), pas de
// Math.random()) : id de mission, dateCreation, id/date de chaque OCCURRENCE
// de document sont des FAITS D'EXÉCUTION injectés par l'appelant, jamais
// fabriqués en silence.
//
// Toute donnée obligatoire non reconstructible à partir du RunContract seul
// (en particulier : les octets réels d'un document, dont le RunContract ne
// porte que le hash) provoque une erreur explicite — jamais un champ vide
// ou fabriqué silencieusement.
"use strict";

const { sha256Bytes } = require("./ef-orch-hash-v0.1.js");

function str(v) {
  return String(v == null ? "" : v).trim();
}

function toUint8Array(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  throw new Error("buildMissionDraftFromRunContract: octets de document dans un format non reconnu (attendu Uint8Array ou ArrayBuffer).");
}

// Reproduit fidèlement bufferToBase64 du vrai EF-01A (découpage par blocs
// pour éviter un dépassement de pile sur de gros fichiers), pas une
// conversion "équivalente" par un autre chemin.
function bufferToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// buildMissionDraftFromRunContract(runContract, injected)
//
// injected.metadata = {
//   missionId, dateCreation,
//   documents: {
//     targetDocuments:  [ { id, ajouteLe }, ... ]  // aligné par INDEX sur perimetre.documentsAudites
//     suppliedEvidence: [ { id, ajouteLe }, ... ]  // aligné par INDEX sur perimetre.sourcesFournies
//   },
//   langues?, typesDocumentsAdmis?, fenetreDebut?, fenetreFin?, criteresExclusion?
// }
// injected.documentBytes = { [hashSha256]: Uint8Array | ArrayBuffer }  // adressé par CONTENU
// ---------------------------------------------------------------------------
async function buildMissionDraftFromRunContract(runContract, injected) {
  const inj = injected || {};
  const meta = inj.metadata || {};
  const documentBytes = inj.documentBytes || {};
  const docsMeta = meta.documents || {};

  if (!runContract || runContract.schema !== "EvidenceForge.RunContract") {
    throw new Error("buildMissionDraftFromRunContract: RunContract manquant ou de schéma inattendu.");
  }
  if (!str(runContract.missionReformulee)) {
    throw new Error("buildMissionDraftFromRunContract: RunContract.missionReformulee manquant ou vide — ne peut pas produire MissionDraft.question.");
  }
  if (!str(meta.missionId)) {
    throw new Error("buildMissionDraftFromRunContract: metadata.missionId manquant — l'identifiant de mission est une métadonnée volatile qui doit être injectée par l'appelant, jamais générée ici.");
  }
  if (!str(meta.dateCreation)) {
    throw new Error("buildMissionDraftFromRunContract: metadata.dateCreation manquant — même règle que missionId, jamais Date.now() généré en silence dans cet exécuteur.");
  }

  async function buildDocEntry(doc, occurrenceMeta, category, index) {
    const nom = str(doc && doc.nom);
    const hash = str(doc && doc.hashSha256);
    if (!nom || !hash) {
      throw new Error("buildMissionDraftFromRunContract: entrée invalide dans " + category + "[" + index + "] (nom ou hashSha256 manquant dans le RunContract) — RunContract non exploitable tel quel pour EF-01A.");
    }

    // Adressage par OCCURRENCE (position), jamais par hash : deux occurrences
    // au même contenu doivent pouvoir garder des id/ajouteLe distincts.
    if (!occurrenceMeta || !str(occurrenceMeta.id) || !str(occurrenceMeta.ajouteLe)) {
      throw new Error(
        "buildMissionDraftFromRunContract: métadonnées id/ajouteLe manquantes pour l'occurrence " + category + "[" + index + "] (\"" + nom + "\", hash " + hash + ")" +
        " — injecter injected.metadata.documents." + category + "[" + index + "] = { id, ajouteLe }."
      );
    }

    // Adressage par CONTENU (hash), volontairement partagé entre occurrences identiques.
    const rawBytes = documentBytes[hash];
    if (rawBytes === undefined || rawBytes === null) {
      throw new Error(
        "buildMissionDraftFromRunContract: octets non fournis pour le contenu de hash " + hash + " (requis par " + category + "[" + index + "] \"" + nom + "\")" +
        " — contenuBase64 n'est pas reconstructible à partir du seul RunContract. Fournir injected.documentBytes[\"" + hash + "\"]."
      );
    }

    const bytes = toUint8Array(rawBytes);
    const recomputedHash = await sha256Bytes(bytes);
    if (recomputedHash !== hash) {
      throw new Error(
        "buildMissionDraftFromRunContract: intégrité rompue pour " + category + "[" + index + "] \"" + nom + "\" — hash déclaré dans le RunContract (" + hash +
        ") ne correspond pas au hash recalculé des octets fournis (" + recomputedHash + "). Octets jamais acceptés sans recalcul."
      );
    }

    return {
      id: str(occurrenceMeta.id),
      nom,
      type: str(doc.type) || "inconnu",
      tailleOctets: bytes.length,
      hashSha256: hash,
      contenuBase64: bufferToBase64(bytes),
      ajouteLe: str(occurrenceMeta.ajouteLe)
    };
  }

  const perimetre = runContract.perimetre || {};
  const targetDocsSource = perimetre.documentsAudites || [];
  const suppliedSource = perimetre.sourcesFournies || [];
  const targetDocsMeta = Array.isArray(docsMeta.targetDocuments) ? docsMeta.targetDocuments : [];
  const suppliedMeta = Array.isArray(docsMeta.suppliedEvidence) ? docsMeta.suppliedEvidence : [];

  // Invariant de cardinalité exacte : une table de métadonnées d'occurrence
  // doit correspondre EXACTEMENT aux occurrences qu'elle décrit — ni moins
  // (occurrence sans métadonnée, déjà détecté plus loin de toute façon),
  // ni plus (métadonnée surnuméraire qui disparaîtrait silencieusement sans
  // ce contrôle, en particulier si une occurrence a été retirée du
  // RunContract entre deux étapes sans que ses métadonnées ne suivent).
  if (targetDocsMeta.length !== targetDocsSource.length) {
    throw new Error(
      "buildMissionDraftFromRunContract: cardinalité incorrecte pour targetDocuments — attendu " + targetDocsSource.length +
      " métadonnée(s) d'occurrence (autant que RunContract.perimetre.documentsAudites), reçu " + targetDocsMeta.length + "."
    );
  }
  if (suppliedMeta.length !== suppliedSource.length) {
    throw new Error(
      "buildMissionDraftFromRunContract: cardinalité incorrecte pour suppliedEvidence — attendu " + suppliedSource.length +
      " métadonnée(s) d'occurrence (autant que RunContract.perimetre.sourcesFournies), reçu " + suppliedMeta.length + "."
    );
  }

  const targetDocuments = [];
  for (let i = 0; i < targetDocsSource.length; i++) {
    targetDocuments.push(await buildDocEntry(targetDocsSource[i], targetDocsMeta[i], "targetDocuments", i));
  }
  const suppliedEvidence = [];
  for (let i = 0; i < suppliedSource.length; i++) {
    suppliedEvidence.push(await buildDocEntry(suppliedSource[i], suppliedMeta[i], "suppliedEvidence", i));
  }

  // Champs que le RunContract ne porte pas (il n'a pas vocation à les
  // porter — ils appartiennent au formulaire EF-01A, pas à la décision de
  // méthodologie du RunContract). Défauts identiques à ceux du vrai module
  // quand l'utilisateur ne les remplit pas : pas une invention, un alignement
  // sur le comportement réel observé. Un appelant qui les connaît par
  // ailleurs peut les fournir.
  const langues = Array.isArray(meta.langues) ? [...meta.langues] : [];
  const typesDocumentsAdmis = Array.isArray(meta.typesDocumentsAdmis) ? [...meta.typesDocumentsAdmis] : [];
  const fenetreDebut = str(meta.fenetreDebut);
  const fenetreFin = str(meta.fenetreFin);
  const criteresExclusion = str(meta.criteresExclusion);

  return {
    schema: "EvidenceForge.MissionDraft",
    schemaVersion: "EF-01A-v2",
    id: str(meta.missionId),
    question: str(runContract.missionReformulee),
    fenetreDebut,
    fenetreFin,
    criteresExclusion,
    dateCreation: str(meta.dateCreation),
    statut: "brouillon", // le vrai module force toujours cette valeur à l'export, jamais autre chose
    langues,
    typesDocumentsAdmis,
    targetDocuments,
    suppliedEvidence
  };
}

// ---------------------------------------------------------------------------
// createEF01AExecutor(injected) -> executor(input) compatible Stage Adapter
// `input` attendu = le RunContract confirmé lui-même (EF-01A n'a aucune
// dépendance amont dans le pipeline — cf. StageInputResolver, inputFrom:[]).
// `injected` (métadonnées volatiles + octets) est fourni à la construction,
// séparé du RunContract : ce sont des faits de CETTE exécution, pas un
// contenu du contrat méthodologique confirmé par l'utilisateur.
// ---------------------------------------------------------------------------
function createEF01AExecutor(injected) {
  return async function ef01aExecutor(input) {
    const output = await buildMissionDraftFromRunContract(input, injected);
    return { status: "ok", output };
  };
}

const EFOrchEF01AExecutor = { buildMissionDraftFromRunContract, createEF01AExecutor };

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchEF01AExecutor;
}
if (typeof window !== "undefined") {
  window.EFOrchEF01AExecutor = EFOrchEF01AExecutor;
}
