/** Ce que le redressement coûte sur un livre qui n'en a pas besoin (OUT-03).
 *
 *  Demandé par Christophe le 6 novembre 2026, et c'est la bonne question : une règle qui ne
 *  coûte rien sur le cas qu'elle vise peut coûter cher sur tous les autres. Un livre de
 *  tablature n'a aucune page retournée — combien de pages déclenchent pourtant un essai, combien
 *  en retiennent une (attendu : aucune), et quel temps cela ajoute.
 *
 *  La qualité d'une page est la part de ses mots qui sont des mots : des lettres, trois au
 *  moins. Une grandeur du document, pas un réglage.
 *
 *  Lecture seule, aucun appel en ligne.
 *
 *  Usage : ce-que-le-redressement-coute.ts <document.pdf> [première] [dernière]
 */
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  orientationDuDocument,
  pagesQuiLisentMal,
  qualiteDeLecture,
  rotationQuiVaut,
} from "@lienotheque/noyau";
import { enGris, tournerRvba } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const documents = process.argv.slice(2);
if (documents.length === 0) {
  console.error("usage : ce-que-le-redressement-coute.ts <document.pdf> [<document.pdf>…]");
  process.exit(2);
}
const premiere = 1;

/** La mesure du produit, et pas une autre : mesurer avec autre chose que ce qui décide ne
 *  mesure pas ce qui décide. La première version de ce banc comptait les lettres — elle ne
 *  distinguait pas la page retournée de ses voisines, et sa preuve ne valait rien. */
const qualite = qualiteDeLecture;

for (const pdf of documents) {
// La couche AVANT le rendu : l'ordre inverse laisse le lecteur dans un état où le rendu ne
// répond plus sur certains documents — constaté le 6 novembre 2026, le programme mourait en
// silence sur un « await » qui ne se résolvait jamais. Les autres bancs du dépôt lisent la
// couche d'abord ; celui-ci s'y aligne.
const couche = await lireCoucheTexte(pdf);
const parRang = new Map(couche.pages.map((page) => [page.index, page]));
const rendu = await ouvrirRenduPdf(pdf);
const derniere = rendu.nombreDePages;
const bac = mkdtempSync(join(tmpdir(), "lienotheque-redress-"));
try {
  // ── La lecture ordinaire, telle qu'elle se fait aujourd'hui ────────────────────────────────
  const debutLecture = Date.now();
  const pages: { rang: number; qualite: number; rendue: Awaited<ReturnType<typeof rendu.page>> | undefined }[] = [];
  const motsTelleQuelle = new Map<number, number>();
  for (let rang = premiere; rang <= derniere; rang += 1) {
    const deLaCouche = parRang.get(rang);
    if (deLaCouche !== undefined && coucheSuffisante(deLaCouche)) {
      motsTelleQuelle.set(rang, deLaCouche.mots.length);
      pages.push({ rang, qualite: qualite(deLaCouche.mots), rendue: undefined });
      continue;
    }
    const rendue = await rendu.page(rang, 1800);
    const lue = ocrDUnePageGrise(enGris(rendue), rang, bac, OCR);
    motsTelleQuelle.set(rang, lue.mots.length);
    pages.push({ rang, qualite: qualite(lue.mots), rendue });
  }
  const secondesLecture = (Date.now() - debutLecture) / 1000;
  console.log(
    `
══ ${pdf.split("/").pop()} — ${pages.length} page(s) lue(s) en ${secondesLecture.toFixed(0)} s ══`,
  );

  // ── Ce que la règle déclenche ──────────────────────────────────────────────────────────────
  const qualites = pages.map((page) => page.qualite);
  const places = pagesQuiLisentMal(qualites);
  console.log(`\n  pages qui lisent nettement moins bien que leurs voisines : ${places.length}`);
  if (places.length > 0)
    console.log(`     ${places.map((place) => `p${pages[place]!.rang} (${(qualites[place]! * 100).toFixed(0)} %)`).join(" · ")}`);

  const voisines = qualites.filter((_, rang) => !places.includes(rang));
  let appels = 0;
  let retenues = 0;
  const debutRotations = Date.now();
  for (const place of places) {
    const page = pages[place]!;
    if (page.rendue === undefined) continue;
    const essais = ([90, 180, 270] as const).map((rotation, rang) => {
      const tournee = enGris(tournerRvba(page.rendue!, rotation));
      appels += 1;
      const lue = ocrDUnePageGrise(tournee, 90_000 + place * 10 + rang, bac, OCR);
      return { rotation, qualite: qualite(lue.mots), mots: lue.mots.length };
    });
    const retenue = rotationQuiVaut({ qualite: page.qualite, mots: motsTelleQuelle.get(page.rang) ?? 0 }, essais, voisines);
    // La trace que Christophe a demandée : ce qui a été tourné, de combien, et sur quelle
    // preuve. Visible, et réversible — rien n'est écrit, la rotation ne vaut que pour la lecture.
    console.log(
      `     p${page.rang} : telle quelle ${page.qualite.toFixed(3)} (${motsTelleQuelle.get(page.rang) ?? "?"} mots) · ` +
        `${essais.map((essai) => `${essai.rotation}° ${essai.qualite.toFixed(3)} (${essai.mots} mots)`).join(" · ")}` +
        ` → ${retenue === undefined ? "aucune retenue" : `ROTATION RETENUE ${retenue}° (gain ${(Math.max(...essais.map((e) => e.qualite)) - page.qualite).toFixed(3)}, les pages droites varient de ${(Math.max(...voisines) - Math.min(...voisines)).toFixed(3)})`}`,
    );
    if (retenue !== undefined) retenues += 1;
  }
  const secondesRotations = (Date.now() - debutRotations) / 1000;

  // ── Et le recours pour le document entier ──────────────────────────────────────────────────
  const bavardes = [...pages]
    .filter((page) => page.rendue !== undefined)
    .sort((un, autre) => autre.qualite - un.qualite)
    .slice(0, 3);
  const debutDocument = Date.now();
  const essaisDuDocument = bavardes.map((page, rang) => {
    const parSens: Record<number, number> = { 0: page.qualite };
    for (const [place, rotation] of ([90, 180, 270] as const).entries()) {
      const tournee = enGris(tournerRvba(page.rendue!, rotation));
      appels += 1;
      parSens[rotation] = qualite(ocrDUnePageGrise(tournee, 95_000 + rang * 10 + place, bac, OCR).mots);
    }
    return parSens;
  });
  const sens = orientationDuDocument(essaisDuDocument);
  const secondesDocument = (Date.now() - debutDocument) / 1000;

  console.log(`\n  recours document entier, sur ${bavardes.length} page(s) : ${sens === undefined ? "aucune orientation retenue" : `${sens}° RETENU`}`);
  console.log(`\n  ── coût ──`);
  console.log(`     lecture ordinaire          : ${secondesLecture.toFixed(0)} s`);
  console.log(`     essais de rotation         : ${secondesRotations.toFixed(1)} s · ${places.length} page(s) déclenchée(s) · ${retenues} retenue(s)`);
  console.log(`     recours document entier    : ${secondesDocument.toFixed(1)} s`);
  console.log(
    `     ajouté : ${(secondesRotations + secondesDocument).toFixed(1)} s, soit ${(((secondesRotations + secondesDocument) / secondesLecture) * 100).toFixed(1)} % de la lecture · ${appels} reconnaissance(s) de plus`,
  );
} finally {
  await rendu.fermer();
  rmSync(bac, { recursive: true, force: true });
}
}
