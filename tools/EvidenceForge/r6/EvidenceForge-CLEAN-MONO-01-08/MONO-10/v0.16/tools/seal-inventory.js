#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.12 — tools/seal-inventory.js
 *
 * OUTIL DOCUMENTAIRE, STRICTEMENT EN LECTURE SEULE.
 *
 * Il n'ecrit aucun fichier, ne modifie aucun lot, et ne participe a aucune
 * decision de securite. Il existe pour une seule raison : la methode de mesure
 * des sceaux historiques employee jusqu'a v0.11 etait fausse, et une mesure
 * fausse inscrite dans un lot candidat au gel est une affirmation fausse.
 *
 * Ce que la methode de v0.11 faisait, et pourquoi elle se trompait :
 *
 *   - elle parcourait une LISTE CODEE EN DUR de 14 chemins de lots ;
 *   - elle ne cherchait que le nom de fichier `SHA256SUMS.txt` ;
 *   - elle ne descendait pas dans les sous-repertoires `manifest/` ;
 *   - elle ignorait donc les sceaux nommes `SHA256SUMS`, sans extension.
 *
 * Consequence mesuree : MONO-00 a MONO-08/v0.6 portent leur sceau dans
 * `manifest/`, le plus souvent SANS extension. v0.11 les a declares
 * « non verifiables » alors qu'ils sont scelles, et a annonce zero divergence
 * alors que le paquet en contient neuf, toutes anterieures a v0.11.
 *
 * Cet outil ne code en dur aucun chemin et aucun chiffre : il cherche
 * recursivement `SHA256SUMS` et `SHA256SUMS.txt`, verifie chaque reference, et
 * distingue trois populations qu'il ne faut jamais additionner en silence :
 *
 *   1. les LOTS HISTORIQUES distincts ;
 *   2. les COPIES IMBRIQUEES sous `dependencies/` (un meme lot recompte) ;
 *   3. le LOT CANDIDAT lui-meme.
 *
 * NOTE DE CADRE. Un inventaire n'a de sens qu'en nommant le lot candidat, qui
 * est exclu de l'historique. « 24 lots » est vrai dans le cadre de v0.11 ;
 * « 25 lots » est vrai dans le cadre de v0.12, ou v0.11 est devenue historique.
 * Les deux sont exacts et ne repondent pas a la meme question : c'est pourquoi
 * `candidate` accepte aussi une LISTE de lots a exclure.
 *
 * Usage :  node tools/seal-inventory.js <racineDuPaquet> [lotCandidat[,lotCandidat...]]
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SEAL_NAMES = ["SHA256SUMS", "SHA256SUMS.txt"];
const sha256OfFile = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

/** Descente recursive ; aucun chemin n'est presuppose. */
function findSeals(root) {
  const out = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entries.forEach(function (e) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === ".git" || e.name === "node_modules") return;
        return walk(p);
      }
      if (SEAL_NAMES.indexOf(e.name) !== -1) out.push(path.relative(root, p));
    });
  })(root);
  return out.sort();
}

/** Le lot d'un sceau : son repertoire, en remontant d'un cran si `manifest/`. */
function lotOf(sealRelPath) {
  let d = path.dirname(sealRelPath);
  if (path.basename(d) === "manifest") d = path.dirname(d);
  return d === "" ? "." : d;
}

/**
 * Verification d'un sceau. Une reference est cherchee d'abord relativement a la
 * racine du lot, puis relativement au repertoire du sceau : les deux
 * conventions existent dans l'historique du paquet, et n'en supporter qu'une
 * produirait de fausses divergences.
 */
function verifySeal(root, sealRel) {
  const lot = lotOf(sealRel);
  const sealDir = path.dirname(path.join(root, sealRel));
  let references = 0;
  const divergences = [];
  fs.readFileSync(path.join(root, sealRel), "utf8").split("\n").forEach(function (line) {
    const m = line.match(/^([0-9a-f]{64})\s+\*?(.+?)\s*$/);
    if (!m) return;
    references++;
    const rel = m[2];
    const candidates = [path.join(root, lot, rel), path.join(sealDir, rel)];
    const target = candidates.filter(function (p) {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    })[0];
    if (!target || sha256OfFile(target) !== m[1]) divergences.push(rel);
  });
  return { seal: sealRel, lot: lot, references: references, divergences: divergences,
    nested: /(^|\/)dependencies\//.test(sealRel) };
}

/** Lots qui existent mais ne portent aucun sceau : la seule reponse honnete. */
function unsealedLots(root, sealedLots, excluded) {
  const out = [];
  fs.readdirSync(root, { withFileTypes: true })
    .filter(function (e) { return e.isDirectory() && /^MONO-\d\d$/.test(e.name); })
    .forEach(function (e) {
      const versions = fs.readdirSync(path.join(root, e.name), { withFileTypes: true })
        .filter(function (x) { return x.isDirectory() && /^v\d/.test(x.name); })
        .map(function (x) { return e.name + "/" + x.name; });
      if (versions.length) versions.forEach(function (v) { if (sealedLots.indexOf(v) === -1) out.push(v); });
      else if (sealedLots.indexOf(e.name) === -1) out.push(e.name);
    });
  return out.filter(function (l) { return excluded.indexOf(l) === -1; });
}

function inventory(root, candidate) {
  const excluded = candidate === null || candidate === undefined ? []
    : (Array.isArray(candidate) ? candidate.slice() : [candidate]);
  const isExcluded = function (lot) { return excluded.indexOf(lot) !== -1; };
  const rows = findSeals(root).map(function (s) { return verifySeal(root, s); });
  const historical = rows.filter(function (r) { return !r.nested && !isExcluded(r.lot); });
  const nested = rows.filter(function (r) { return r.nested; });
  const cand = rows.filter(function (r) { return isExcluded(r.lot); });
  const refs = function (a) { return a.reduce(function (n, r) { return n + r.references; }, 0); };
  const divs = function (a) { return a.reduce(function (n, r) { return n + r.divergences.length; }, 0); };
  return {
    sealFiles: rows.length,
    sealedHistoricalLots: historical.length,
    sealedReferences: refs(historical),
    sealedDivergences: divs(historical),
    excludedLots: excluded,
    unverifiableHistoricalLots: unsealedLots(root, historical.map(function (r) { return r.lot; }), excluded),
    candidate: { seals: cand.length, references: refs(cand), divergences: divs(cand) },
    nestedCopies: { seals: nested.length, references: refs(nested), divergences: divs(nested) },
    allSeals: { references: refs(rows), divergences: divs(rows) },
    historical: historical,
  };
}

module.exports = { inventory, findSeals, verifySeal, lotOf, SEAL_NAMES };

if (require.main === module) {
  const root = process.argv[2] || process.cwd();
  const candidate = process.argv[3] ? process.argv[3].split(",") : null;
  const inv = inventory(root, candidate);
  console.log("racine                            : " + root);
  console.log("lot(s) exclu(s) de l'historique     : " + (inv.excludedLots.length ? inv.excludedLots.join(", ") : "(aucun)"));
  console.log("");
  console.log("fichiers de sceau trouves          : " + inv.sealFiles);
  console.log("SEALED_HISTORICAL_LOTS_COUNT       = " + inv.sealedHistoricalLots);
  console.log("SEALED_REFERENCES_COUNT            = " + inv.sealedReferences);
  console.log("SEALED_DIVERGENCES                 = " + inv.sealedDivergences);
  console.log("UNVERIFIABLE_HISTORICAL_LOTS       = " + inv.unverifiableHistoricalLots.length
    + (inv.unverifiableHistoricalLots.length ? " -> " + inv.unverifiableHistoricalLots.join(", ") : ""));
  console.log("");
  console.log("populations distinctes, jamais additionnees en silence :");
  console.log("  lot(s) exclu(s)   : " + inv.candidate.seals + " sceau(x), "
    + inv.candidate.references + " refs, " + inv.candidate.divergences + " divergence(s)");
  console.log("  copies imbriquees : " + inv.nestedCopies.seals + " sceau(x), "
    + inv.nestedCopies.references + " refs, " + inv.nestedCopies.divergences + " divergence(s)");
  console.log("  tous sceaux       : " + inv.allSeals.references + " refs, "
    + inv.allSeals.divergences + " divergence(s)");
  console.log("");
  console.log("lots historiques scelles :");
  inv.historical.forEach(function (r) {
    console.log("  " + r.lot.padEnd(46) + path.basename(r.seal).padEnd(16)
      + "refs=" + String(r.references).padStart(4) + "  div=" + r.divergences.length
      + (r.divergences.length ? "  -> " + r.divergences.join(", ") : ""));
  });
}
