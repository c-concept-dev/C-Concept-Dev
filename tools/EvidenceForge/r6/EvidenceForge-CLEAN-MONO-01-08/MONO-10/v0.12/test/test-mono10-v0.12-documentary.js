#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.12 — test/test-mono10-v0.12-documentary.js
 *
 * CONTROLES DE VERITE DOCUMENTAIRE. Aucun run, aucun reseau, aucun LLM.
 *
 * Pourquoi ce fichier existe. Les faussetes que v0.12 corrige ont survecu a
 * trois versions et a trois auto-audits, parce qu'AUCUN controle automatique ne
 * les voyait : la garde documentaire du lot (`CONTRACT-GUARD.md`) couvre des
 * ENUMERATIONS, pas la prose. Une phrase fausse passait donc sans bruit.
 *
 * Chaque controle ci-dessous est double :
 *
 *   1. il verifie que la documentation LIVREE est propre ;
 *   2. il verifie, sur une COPIE EN MEMOIRE volontairement corrompue, qu'il
 *      MORD. Un controle qu'on n'a pas vu echouer ne prouve rien — c'est la
 *      meme exigence de temoin que la suite adversariale applique au code.
 *
 * Usage : node test/test-mono10-v0.12-documentary.js [racineDuPaquet]
 */

const fs = require("fs");
const path = require("path");
const LOT = path.resolve(__dirname, "..");
const BUNDLE = process.argv[2] || path.resolve(LOT, "..", "..");

let pass = 0, fail = 0, caught = 0, total = 0;
const check = (id, ok, detail) => {
  if (ok) { pass++; console.log("  PASS  " + id); }
  else { fail++; console.log("  FAIL  " + id + (detail !== undefined ? "  -> " + String(detail).slice(0, 240) : "")); }
};
const docs = {};
fs.readdirSync(LOT).filter((f) => /\.md$/.test(f)).forEach((f) => { docs[f] = fs.readFileSync(path.join(LOT, f), "utf8"); });
const allDocs = () => Object.keys(docs).map((f) => docs[f]).join("\n");

/**
 * Un controle documentaire : `detect(texte) === true` signifie « faussete
 * presente ». On exige que la doc livree soit propre ET que le detecteur morde
 * sur un texte corrompu.
 */
function documentaryCheck(id, label, detect, corrupted) {
  total++;
  const live = detect(allDocs());
  const bites = detect(corrupted);
  if (live === false && bites === true) {
    caught++; check(id + ". " + label, true);
  } else {
    check(id + ". " + label, false,
      (live ? "FAUSSETE PRESENTE dans la documentation livree " : "")
      + (bites ? "" : "le detecteur NE MORD PAS sur le temoin negatif"));
  }
}

(function () {
  console.log("MONO-10 v0.12 — controles de verite documentaire\n");

  /* ===== D1 — la promesse d'asymetrie de preparation ===== */
  console.log("  -- 1 a 7 : chaque controle avec son temoin negatif --");
  /**
   * La phrase « il ne peut pas l'ameliorer » n'est pas interdite : elle est
   * interdite SANS qualification de couche. On detecte donc l'affirmation nue,
   * c'est-a-dire non accompagnee, dans son voisinage, d'une mention de couche.
   */
  documentaryCheck("DOC-01", "l'asymetrie de preparation est qualifiee par couche",
    function (t) {
      const re = /ne peut pas l'am[eé]liorer/g;
      let m;
      while ((m = re.exec(t)) !== null) {
        const ctx = t.slice(Math.max(0, m.index - 700), m.index + 700);
        const qualifie = /par couche|assertReadinessPhase|de bout en bout|couche d'assertion/.test(ctx);
        if (!qualifie) return true;      // affirmation nue trouvee
      }
      return false;
    },
    "L'appelant peut degrader une preparation, il ne peut pas l'ameliorer. Fin.");

  /* ===== D2 — les champs non attestes ===== */
  const CHAMPS = ["costUsd", "configurationPresent", "llmBoundaryId", "callerVerifierIgnored",
    "schemaVersion", "probeTimestamp", "capabilities", "authMode", "probeContract",
    "failureReason", "credentialPresenceProblem"];
  documentaryCheck("DOC-02", "les champs non attestes sont tous enumeres",
    function (t) {
      const zone = /Champs non attest[eé]s/.test(t) ? t : "";
      if (!zone) return true;                       // aucune section : faussete par omission
      return CHAMPS.some(function (c) { return zone.indexOf(c) === -1; });
    },
    "Tous les champs de l'artefact de capacite LLM sont attestes par la decision.");

  documentaryCheck("DOC-03", "aucun document ne pretend que tout l'artefact est atteste",
    function (t) {
      return /(tous|l'ensemble) des champs[^.]{0,80}(sont|est) attest/i.test(t)
        || /la certification garantit la v[eé]racit[eé] de tous/i.test(t);
    },
    "La certification garantit la veracite de tous les champs informatifs de l'artefact.");

  documentaryCheck("DOC-04", "callerTransportIgnored n'est pas presente comme une garantie",
    function (t) {
      if (!/callerTransportIgnored/.test(t)) return true;   // silence = faussete par omission
      const i = t.indexOf("callerTransportIgnored");
      const ctx = t.slice(Math.max(0, i - 400), t.lastIndexOf("callerTransportIgnored") + 2500);
      return !/auto-d[eé]faisant|tra[cç]abilit[eé], pas un contr[oô]le|pas une garantie/.test(ctx);
    },
    "callerTransportIgnored : le fait qu'il ait essaye est inscrit dans l'artefact, c'est la garantie.");

  /* ===== D3 — mesures historiques ===== */
  /**
   * Detection LIGNE A LIGNE. Un document de correction DOIT pouvoir citer le
   * chiffre faux pour le corriger : une ligne n'est une faussete que si elle
   * AFFIRME le mauvais chiffre sans porter, sur la meme ligne, le bon chiffre
   * ou un marqueur de correction. Sans cette nuance, le detecteur
   * condamnerait precisement le travail qu'il est cense proteger.
   */
  documentaryCheck("DOC-05", "aucune mesure de sceau fausse n'est AFFIRMEE",
    function (t) {
      const FAUX = [
        { re: /UNVERIFIABLE_HISTORICAL_LOTS[^\n]*?\b9\b/, vrai: /\b0\b/ },
        { re: /SEALED_(REFERENCE_)?DIVERGENCES[^\n]*?\b0\b/, vrai: /\b9\b/ },
        { re: /\b14 lots scell[eé]s\b/i, vrai: /\b24\b|\b25\b/ },
        { re: /\b514 r[eé]f[eé]rences?\b/i, vrai: /\b1\s?577\b|\b1577\b/ },
      ];
      const CORRECTION = /annon[cç]ait|d[eé]clarait|faux|sous-d[eé]clar|corrig|r[eé]alit[eé] mesur[eé]e|au lieu de/i;
      return t.split("\n").some(function (ligne) {
        return FAUX.some(function (f) {
          return f.re.test(ligne) && !f.vrai.test(ligne) && !CORRECTION.test(ligne);
        });
      });
    },
    "| `UNVERIFIABLE_HISTORICAL_LOTS` | **9** |");

  documentaryCheck("DOC-06", "les 9 divergences preexistantes sont documentees et attribuees",
    function (t) {
      const neuf = /9 divergences|\*\*9\*\* divergences|SEALED_DIVERGENCES\s*[=|]\s*\**9\**/.test(t);
      const lots = /MONO-07/.test(t) && /MONO-08\/v0\.6/.test(t);
      const anterieures = /ant[eé]rieures?|pr[eé][eé]xistantes?/i.test(t);
      const nonImputables = /imputables?\s+(ni\s+)?[aà]\s+v0\.1[12]|non imputables/i.test(t);
      return !(neuf && lots && anterieures && nonImputables);
    },
    "Aucune divergence historique. Le paquet est integralement conforme a ses sceaux.");

  /**
   * Le detecteur opere sur le TEXTE QU'ON LUI PASSE, jamais sur une lecture
   * directe du disque : sans cela le temoin negatif ne peut pas mordre, et le
   * controle ne prouve rien. C'est exactement le defaut que la suite
   * adversariale nomme « assertion vacue ».
   */
  documentaryCheck("DOC-07", "la methode de mesure cherche manifest/ et le nom sans extension",
    function (t) {
      const recursif = /r[eé]cursi/i.test(t);
      const manifest = /manifest\//.test(t);
      const sansExt = /sans extension/i.test(t);
      const outil = /seal-inventory\.js/.test(t);
      return !(recursif && manifest && sansExt && outil);
    },
    "NON-REGRESSION : la mesure parcourt la liste des 14 lots et lit leur SHA256SUMS.txt.");

  /* ===== controles de coherence du lot ===== */
  console.log("\n  -- coherence du lot --");
  check("LOT-01. OPEN-FINDINGS-v0.12.md existe et porte R1 a R5",
    !!docs["OPEN-FINDINGS-v0.12.md"]
    && ["R1", "R2", "R3", "R4", "R5"].every((r) => new RegExp("##\\s*" + r + "\\s").test(docs["OPEN-FINDINGS-v0.12.md"])));
  check("LOT-02. aucune reserve n'est presentee comme resolue",
    /Aucune de ces r[eé]serves n'est pr[eé]sent[eé]e comme ferm[eé]e|non r[eé]solues? par v0\.12/i.test(docs["OPEN-FINDINGS-v0.12.md"] || ""));
  check("LOT-03. MIGRATION-v0.11-v0.12.md existe et affirme l'absence de changement d'API",
    !!docs["MIGRATION-v0.11-v0.12.md"] && /Aucune API ne change/.test(docs["MIGRATION-v0.11-v0.12.md"]));
  check("LOT-04. README renvoie aux reserves ouvertes avant les garanties",
    (docs["README.md"] || "").indexOf("NE garantit PAS") < (docs["README.md"] || "").indexOf("qui reste vrai"));
  check("LOT-05. la garantie de liste blanche est comportementale, pas un code de retour",
    /ne peut pas devenir une capacit[eé] utilisable/.test(allDocs())
    && /inatteignable/.test(allDocs()));

  /* ===== identite octet a octet du runtime ===== */
  console.log("\n  -- identite du runtime avec v0.11 --");
  const crypto = require("crypto");
  const prev = path.resolve(LOT, "..", "v0.11");
  const RUNTIME_DIRS = ["core", "adapters", "validators", "schemas", "contracts", "governance"];
  const RUNTIME_FILES = ["test/fixture-chain.js", "test/test-mono10-v0.11.js",
    "test/test-mono10-v0.11-integration.js", "tools/aggregate-hash.js",
    "tools/operator-provisioning.js", "tools/reference-llm-transport.js"];
  if (!fs.existsSync(prev)) {
    console.log("  SKIP  RT-01. identite runtime -> v0.11 non joignable depuis cette extraction ;"
      + " aucun PASS n'est emis a la place");
  } else {
    const digestOf = (base, rel) => {
      const p = path.join(base, rel);
      if (!fs.existsSync(p)) return "ABSENT";
      if (fs.statSync(p).isDirectory()) {
        const acc = [];
        (function w(d) {
          fs.readdirSync(d).sort().forEach((e) => {
            const q = path.join(d, e);
            if (fs.statSync(q).isDirectory()) return w(q);
            acc.push(path.relative(p, q) + ":" + crypto.createHash("sha256").update(fs.readFileSync(q)).digest("hex"));
          });
        })(p);
        return crypto.createHash("sha256").update(acc.join("\n")).digest("hex");
      }
      return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    };
    const diffs = RUNTIME_DIRS.concat(RUNTIME_FILES)
      .filter((rel) => digestOf(LOT, rel) !== digestOf(prev, rel));
    check("RT-01. RUNTIME_BYTE_IDENTICAL_TO_V011 sur " + (RUNTIME_DIRS.length + RUNTIME_FILES.length)
      + " chemins", diffs.length === 0, JSON.stringify(diffs));
    const added = ["tools/seal-inventory.js", "test/test-mono10-v0.12-documentary.js"];
    check("RT-02. les deux seuls ajouts executables sont nommes et absents de v0.11",
      added.every((a) => fs.existsSync(path.join(LOT, a)) && !fs.existsSync(path.join(prev, a))));
    check("RT-03. l'outil de mesure n'ecrit rien (aucune API d'ecriture)",
      !/writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|createWriteStream|renameSync/
        .test(fs.readFileSync(path.join(LOT, "tools", "seal-inventory.js"), "utf8")));
  }

  /* ===== mesure des sceaux, rejouee par l'outil livre ===== */
  console.log("\n  -- mesure des sceaux, rejouee --");
  const SI = require(path.join(LOT, "tools", "seal-inventory.js"));
  if (!fs.existsSync(path.join(BUNDLE, "MONO-10"))) {
    console.log("  SKIP  SEAL-01. inventaire des sceaux -> le paquet n'est pas joignable depuis"
      + " cette extraction ; aucun PASS n'est emis a la place");
  } else {
    /** Cadre v0.11 : ni v0.11 ni v0.12 ne comptent comme historiques. */
    const inv = SI.inventory(BUNDLE, ["MONO-10/v0.11", "MONO-10/v0.12"]);
    check("SEAL-01. cadre v0.11 : 24 lots historiques scelles", inv.sealedHistoricalLots === 24, inv.sealedHistoricalLots);
    check("SEAL-02. cadre v0.11 : 1577 references", inv.sealedReferences === 1577, inv.sealedReferences);
    check("SEAL-03. 9 divergences", inv.sealedDivergences === 9, inv.sealedDivergences);
    check("SEAL-04. 0 lot non scelle", inv.unverifiableHistoricalLots.length === 0,
      JSON.stringify(inv.unverifiableHistoricalLots));
    /** Cadre v0.12 : v0.11 est devenue historique. Les deux chiffres sont vrais. */
    const inv12 = SI.inventory(BUNDLE, "MONO-10/v0.12");
    check("SEAL-04b. cadre v0.12 : 25 lots, 1644 references, memes 9 divergences",
      inv12.sealedHistoricalLots === 25 && inv12.sealedReferences === 1644
      && inv12.sealedDivergences === 9 && inv12.unverifiableHistoricalLots.length === 0,
      inv12.sealedHistoricalLots + "/" + inv12.sealedReferences + "/" + inv12.sealedDivergences);
    const lots = inv.historical.filter((r) => r.divergences.length).map((r) => r.lot).sort();
    check("SEAL-05. les divergences sont bien celles documentees",
      JSON.stringify(lots) === JSON.stringify(["MONO-07", "MONO-08/v0.6"]), JSON.stringify(lots));
    check("SEAL-06. la methode naive de v0.11 sous-declare, demonstration",
      SI.findSeals(BUNDLE).filter((s) => /SHA256SUMS$/.test(s)).length > 0);
  }

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  console.log("DOCUMENTARY_CHECKS_CAUGHT = " + caught + " / DOCUMENTARY_CHECKS_TOTAL = " + total);
  console.log("NETWORK_CALLS = 0 | REAL_LLM_CALLS = 0 | REAL_EF02_RUNS = 0"
    + " | REAL_PROFESSIONAL_RUNS = 0 | REAL_HUMAN_ACTS = 0");
  process.exit(fail === 0 && caught === total ? 0 : 1);
})();
