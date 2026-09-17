#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.4 — tools/aggregate-hash.js
 *
 * Empreinte agregee d'un repertoire, INDEPENDANTE DU CHEMIN ABSOLU : chaque
 * fichier contribue par son contenu et par son chemin RELATIF a la racine
 * donnee. `shasum` seul ne convient pas : il inclut le chemin tel qu'il est
 * ecrit, donc une meme arborescence lue depuis deux endroits produit deux
 * empreintes differentes — piege deja rencontre en PART E.
 *
 * Cet outil est LIVRE dans le lot precisement pour que toute baseline publiee
 * reste rejouable, meme si un repertoire temporaire disparait.
 *
 * Usage : node tools/aggregate-hash.js <racine> [<racine> ...]
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, e);
    const s = fs.statSync(p);
    if (s.isDirectory()) walk(p, base, out);
    else out.push([path.relative(base, p), crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")]);
  }
}

function aggregate(root) {
  const out = [];
  walk(root, root, out);
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  // Forme canonique : "<sha256>  <chemin relatif>", lignes jointes par "\n".
  return { hash: crypto.createHash("sha256").update(out.map((x) => x[1] + "  " + x[0]).join("\n")).digest("hex"), files: out.length };
}

if (require.main === module) {
  const roots = process.argv.slice(2);
  if (!roots.length) { console.error("Usage: node tools/aggregate-hash.js <racine> [...]"); process.exit(2); }
  roots.forEach(function (r) { const a = aggregate(r); console.log(a.hash + "  " + r + "  (" + a.files + " fichiers)"); });
}
module.exports = { aggregate };
