/** Banc du 4 novembre 2026 — fidélité des extraits d'`extracteur-pages.html` (§-1 quinquies).
 *
 *  L'outil charge pdf-lib **depuis un CDN** : l'ouvrir ferait des appels en ligne, que la règle
 *  interdit. On reproduit donc sa logique **hors ligne**, avec la **version identique**
 *  (`pdf-lib@1.17.1`, déjà dans le projet) et **les mêmes options**, recopiées de l'outil
 *  (L1200-1215) : `copyPages` puis `save({ useObjectStreams: false })`.
 *
 *  On éprouve la **logique d'extraction**, pas l'interface — c'est elle qui détermine la
 *  structure du PDF produit, et c'est elle que les quatre axes mesurent.
 *
 *  Quatre axes : flux de page · couche texte · compte d'images · OCTETS des images. */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
// `pdf-lib` n'est déclaré par aucun paquet de l'espace de travail : on va le chercher là où
// pnpm l'a rangé, en VERSION 1.17.1 — exactement celle que l'outil charge depuis son CDN.
import { PDFDocument } from "../../../node_modules/.pnpm/pdf-lib@1.17.1/node_modules/pdf-lib/es/index.js";
import { objetsPdf, pagesPdf, octetsImage } from "@lienotheque/formats";

const SORTIE = process.argv[2] ?? mkdtempSync(join(tmpdir(), "banc-extracteur-"));

/** Exactement `extraireSelection()` de l'outil. */
async function extraire(source: string, pages: readonly number[]): Promise<Uint8Array> {
  const original = await PDFDocument.load(readFileSync(source));
  const nouveau = await PDFDocument.create();
  const copiees = await nouveau.copyPages(original, pages.map((p) => p - 1));
  copiees.forEach((page) => nouveau.addPage(page));
  return nouveau.save({ useObjectStreams: false });
}

const empreinte = (o: Buffer): string => createHash("sha256").update(o).digest("hex").slice(0, 16);

function lire(chemin: string) {
  const objets = objetsPdf(readFileSync(chemin));
  return { objets, pages: pagesPdf(objets) };
}

async function mesurer(nom: string, source: string, pages: readonly number[]): Promise<void> {
  console.log(`\n══ ${nom} — pages demandées : ${pages.join(", ")}`);
  const octets = await extraire(source, pages);
  const chemin = join(SORTIE, `${nom.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`);
  writeFileSync(chemin, octets);

  const o = lire(source);
  const e = lire(chemin);
  console.log(`   original : ${o.pages.length} page(s)   extrait : ${(octets.length / 1024).toFixed(0)} Kio, ${e.pages.length} page(s)`);

  // ── axe 1 : flux de page
  const fluxOk = e.pages.length === pages.length;
  console.log(`   [1 flux de page]   ${e.pages.length} / ${pages.length}  ${fluxOk ? "✓" : "✗"}`);
  if (e.pages.length === 0) { console.log("   → extrait illisible : les axes suivants n'ont pas de sens"); return; }

  // ── axes 2 à 4, page par page
  let coucheOk = 0, compteOk = 0, octetsOk = 0, imagesVues = 0;
  pages.forEach((numeroDemande, rang) => {
    const po = o.pages[numeroDemande - 1];
    const pe = e.pages[rang];
    if (po === undefined || pe === undefined) return;
    if (po.couchTexte === pe.couchTexte) coucheOk += 1;
    else console.log(`      page ${numeroDemande} : couche texte ${po.couchTexte} → ${pe.couchTexte}`);
    if (po.images.length === pe.images.length) compteOk += 1;
    else console.log(`      page ${numeroDemande} : ${po.images.length} image(s) → ${pe.images.length}`);
    po.images.forEach((img, i) => {
      const a = octetsImage(o.objets, (img as { numero: number }).numero);
      const autre = pe.images[i] as { numero: number } | undefined;
      const b = autre === undefined ? undefined : octetsImage(e.objets, autre.numero);
      imagesVues += 1;
      // Les deux condensés sont pris AVANT la condition : le garde-fou des promesses tient la
      // liste des noms asynchrones du dépôt entier, et deux « empreinte » y rendent une promesse.
      // Celui-ci est synchrone, mais un appel de ce nom dans une condition lui ressemble.
      const condenseA = a === undefined ? undefined : empreinte(a.octets);
      const condenseB = b === undefined ? undefined : empreinte(b.octets);
      if (condenseA !== undefined && condenseB !== undefined && condenseA === condenseB) octetsOk += 1;
      else console.log(`      page ${numeroDemande}, image ${i} : ${a ? empreinte(a.octets) : "—"} → ${b ? empreinte(b.octets) : "—"}`);
    });
  });
  console.log(`   [2 couche texte]   ${coucheOk} / ${pages.length}  ${coucheOk === pages.length ? "✓" : "✗"}`);
  console.log(`   [3 compte images]  ${compteOk} / ${pages.length}  ${compteOk === pages.length ? "✓" : "✗"}`);
  console.log(`   [4 OCTETS images]  ${octetsOk} / ${imagesVues}  ${octetsOk === imagesVues ? "✓" : "✗"}`);
}

const RACINE = join(import.meta.dirname, "..", "..", "..");
await mesurer("F3", join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf"), [3, 4, 29]);

// Bass Aerobics : 115 pages, 210 Mo. Lecture seule de la vraie bibliothèque.
const AEROBICS = "/Volumes/Macbook Pro/Bibliotheque Musique/sources/ca/ca36cf9859691679fcc7c0065461275a18d32d318e82ccb89fb2404a786be90a.pdf";
await mesurer("Bass-Aerobics", AEROBICS, [1, 10, 48]);
console.log(`\n   sorties : ${SORTIE}`);
