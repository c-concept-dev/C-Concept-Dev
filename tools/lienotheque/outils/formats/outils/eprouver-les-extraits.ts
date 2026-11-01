#!/usr/bin/env tsx
/** La preuve en volume : un extrait se lit-il comme un document de ce nombre de pages ?
 *
 *     pnpm --filter @lienotheque/formats exec tsx outils/eprouver-les-extraits.ts <racine> [combien]
 *
 *  Compare, pour chaque document, ce que la lecture de structure voit de l'original et de son
 *  extrait. Un extrait réussi rend **exactement** le nombre de pages demandé et les images de ces
 *  pages ; un extrait raté rend zéro, et c'est le défaut mesuré le 1er novembre 2026 sur les
 *  dix-sept extraits qui servaient à tous les essais.
 */
import { mkdtempSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { extraireDesPages } from "./extraire-des-pages.js";

const racine = process.argv[2]!;
const combienVoulu = Number(process.argv[3] ?? 30);
const PAGES = 12;

const tous: string[] = [];
for (const palier of readdirSync(racine)) {
  const dossier = join(racine, palier);
  if (!statSync(dossier).isDirectory()) continue;
  for (const nom of readdirSync(dossier)) if (nom.toLowerCase().endsWith(".pdf")) tous.push(join(dossier, nom));
}
tous.sort();
const pas = Math.max(1, Math.floor(tous.length / combienVoulu));
const choisis = tous.filter((_, place) => place % pas === 0).slice(0, combienVoulu);
const bac = mkdtempSync(join(tmpdir(), "lienotheque-preuve-"));

let justes = 0;
let rates = 0;
let refuses = 0;
for (const chemin of choisis) {
  try {
    const mesure = await extraireDesPages(chemin, join(bac, `${basename(chemin, ".pdf").slice(0, 10)}.pdf`), PAGES, 1);
    const attendu = Math.min(PAGES, mesure.avant.pages);
    // Un original dont la structure ne se lit pas ne prouve rien dans un sens ni dans l'autre.
    if (mesure.avant.pages === 0) {
      console.log(`${basename(chemin).slice(0, 14)}…  original illisible à la structure — écarté`);
      continue;
    }
    // Fidèle : le nombre de pages demandé, et **les images que l'original porte sur ces pages**.
    //
    // Exiger « au moins une image » était faux, et mesuré tel : un document de 275 pages et
    // 62 190 images n'en porte aucune sur ses quatorze premières — elles commencent page quinze.
    // Un extrait de douze pages sans image y était parfaitement fidèle, et ce critère-là le
    // déclarait raté. Comparer un extrait au **total** de son original compare deux choses
    // différentes.
    const juste = mesure.apres.pages === attendu && mesure.apres.images === mesure.avant.images;
    if (juste) justes += 1;
    else rates += 1;
    console.log(
      `${basename(chemin).slice(0, 14)}…  original ${String(mesure.avant.pages).padStart(4)}p/${String(mesure.avant.images).padStart(5)}i  ` +
        `extrait ${String(mesure.apres.pages).padStart(3)}p/${String(mesure.apres.images).padStart(5)}i  ` +
        `attendu ${String(attendu).padStart(3)}p  ${juste ? "juste" : "RATÉ"}`,
    );
  } catch (echec) {
    refuses += 1;
    console.log(`${basename(chemin).slice(0, 14)}…  refusé : ${(echec instanceof Error ? echec.message : "").slice(0, 52)}`);
  }
}
console.log(`\n${justes} juste(s), ${rates} raté(s), ${refuses} refusé(s) sur ${choisis.length} document(s)`);
if (rates > 0) process.exit(1);
