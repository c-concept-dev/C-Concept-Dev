#!/usr/bin/env node
"use strict";
/** Scelle le lot : SHA256SUMS.txt de tous les fichiers sauf lui-meme et MANIFEST.json. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const LOT = path.resolve(__dirname, "..");
function walk(d, out) { fs.readdirSync(d).forEach((n) => { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p); }); return out; }
const files = walk(LOT, []).map((p) => path.relative(LOT, p)).filter((r) => r !== "SHA256SUMS.txt" && r !== "MANIFEST.json" && !r.startsWith(".")).sort();
const lines = files.map((r) => crypto.createHash("sha256").update(fs.readFileSync(path.join(LOT, r))).digest("hex") + "  " + r);
fs.writeFileSync(path.join(LOT, "SHA256SUMS.txt"), lines.join("\n") + "\n");
console.log("sealed " + files.length + " files");
