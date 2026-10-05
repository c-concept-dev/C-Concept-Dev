/** Mesure : les candidats tombent-ils sur les lignes que l'oracle connaît ? (OUT-08, étape 2)
 *
 *  Hors de `pnpm check` : elle demande les clichés sous droits, Tesseract, et deux minutes de
 *  lecture. Elle ne juge pas un seuil — elle rapporte, et c'est la comparaison à l'oracle qui
 *  juge.
 *
 *     pnpm --filter @lienotheque/vision exec tsx mesures/candidats-f4.ts [premier] [dernier]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { chargerRecette, preparerLot, reperer } from "@lienotheque/recettes";
import { candidatsDePage, recadrerPour, type DejaLu } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_exercices.csv");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v4.json"), "utf8")));

if (!existsSync(F4) || !existsSync(ORACLE)) {
  console.log("Clichés ou oracle absents : rien à mesurer ici.");
  process.exit(0);
}

const premier = Number(process.argv[2] ?? 33);
const dernier = Number(process.argv[3] ?? 46);

/** L'oracle : quels éléments sur quelle page imprimée, et la table inverse. */
const parPageImprimee = new Map<number, number[]>();
const pageDeLElement = new Map<number, number>();
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const [exercice, page] = ligne.split(",");
  const numero = Number(exercice);
  const imprimee = Number(page);
  if (!Number.isFinite(numero) || !Number.isFinite(imprimee) || numero <= 0) continue;
  parPageImprimee.set(imprimee, [...(parPageImprimee.get(imprimee) ?? []), numero]);
  pageDeLElement.set(numero, imprimee);
}

/** Sur quelle page imprimée on se trouve, d'après les numéros qu'on y a lus.
 *
 *  `reperer` ne le dit pas : le numéro imprimé d'une page est établi par l'interprète, qui vote
 *  le décalage sur le lot entier. Ici on n'a pas besoin de lui — les numéros lus suffisent, et
 *  l'oracle sait sur quelle page chacun tombe. Majorité simple, comme pour les images de page. */
function pageSelonLOracle(lus: readonly number[]): number | undefined {
  const votes = new Map<number, number>();
  for (const numero of lus) {
    const page = pageDeLElement.get(numero);
    if (page !== undefined) votes.set(page, (votes.get(page) ?? 0) + 1);
  }
  let retenue: number | undefined;
  let meilleur = 0;
  for (const [page, nombre] of votes) if (nombre > meilleur) [retenue, meilleur] = [page, nombre];
  return retenue;
}

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const lectures = coin(cache, "lectures");
const sortie = coin(cache, "vision");

type LignePage = {
  cliche: number;
  cote: string;
  rang: number | undefined;
  pageImprimee: number | undefined;
  /** Vrai quand la page votée s'accorde avec le rang attendu : sinon la comparaison à l'oracle
   *  ne dit rien, et il vaut mieux l'écarter que de la compter de travers. */
  sure: boolean;
  lus: number[];
  oracle: number[];
  manquants: number[];
  candidats: number;
  recadrages: { empreinte: string; largeur: number; hauteur: number; octets: number }[];
};

const rapport: LignePage[] = [];
let traites = 0;

/** Les pages telles que la lecture les voit : binarisées. C'est d'elles que viennent les
 *  numéros déjà lus. */
const lectureDePage = new Map<string, DejaLu[]>();
for await (const page of preparerLot(F4, RECETTE, { pages: dernier + 1, cache: lectures })) {
  if (page.index < premier) continue;
  if (page.index > dernier) break;
  const [lue] = reperer([page], RECETTE, { cache: lectures });
  if (lue !== undefined)
    lectureDePage.set(
      `${page.index}/${page.cote ?? "—"}`,
      lue.elements.map((element) => ({ y: element.y, numero: element.numero })),
    );
}

/** Et les mêmes pages sans binarisation : c'est d'elles qu'on recadre. Même géométrie. */
for await (const page of preparerLot(F4, RECETTE, { pages: dernier + 1, cache: lectures, sansBinarisation: true })) {
  if (page.index < premier) continue;
  if (page.index > dernier) break;

  // Ce que la lecture a rendu sur cette page — elle, elle a travaillé sur le noir et blanc.
  const dejaLus = lectureDePage.get(`${page.index}/${page.cote ?? "—"}`) ?? [];
  const candidats = candidatsDePage(
    { index: page.index, image: page.image, ...(page.cote === undefined ? {} : { cote: page.cote }), dejaLus },
    RECETTE,
    { maxParPage: RECETTE.vision?.zones_max_par_page ?? 8 },
  );

  const lus = dejaLus.map((element) => element.numero);
  const pageImprimee = pageSelonLOracle(lus);
  // Le vote peut se tromper : un numéro mal lu renvoie vers une page étrangère. On ne retient la
  // comparaison que si la page votée tient près du rang attendu — le décalage de ce livre vaut 0
  // sur 112 pages, et l'interprète ne l'affine qu'à quatre près.
  const sure = pageImprimee !== undefined && page.rang !== undefined && Math.abs(pageImprimee - page.rang) <= 4;
  const oracle = sure ? (parPageImprimee.get(pageImprimee!) ?? []) : [];
  const manquants = oracle.filter((numero) => !lus.includes(numero));

  const recadrages: LignePage["recadrages"] = [];
  for (const candidat of candidats) {
    const produit = await recadrerPour(page.image, candidat);
    if (produit === undefined) continue;
    recadrages.push({
      empreinte: produit.zone.empreinte,
      largeur: produit.zone.largeur,
      hauteur: produit.zone.hauteur,
      octets: produit.octets.length,
    });
    // Les recadrages vont au disque de travail : ils viennent d'un original sous droits.
    writeFileSync(join(sortie, "recadrages", `${produit.zone.empreinte}.webp`), produit.octets);
  }

  rapport.push({
    cliche: page.index,
    cote: page.cote ?? "—",
    rang: page.rang,
    pageImprimee,
    sure,
    lus,
    oracle,
    manquants,
    candidats: candidats.length,
    recadrages,
  });
  traites += 1;
}

const total = (choisir: (ligne: LignePage) => number): number => rapport.reduce((somme, ligne) => somme + choisir(ligne), 0);
const tailles = rapport.flatMap((ligne) => ligne.recadrages);

console.log(`\nClichés ${premier} à ${dernier} — ${traites} pages sondées\n`);
console.log("cliché  côté     page   lus  oracle  manquants  candidats");
for (const ligne of rapport)
  console.log(
    `${String(ligne.cliche).padStart(6)}  ${ligne.cote.padEnd(7)} ${String(ligne.pageImprimee ?? "—").padStart(4)}  ${String(ligne.lus.length).padStart(4)}  ${String(ligne.oracle.length).padStart(6)}  ${String(ligne.manquants.length).padStart(9)}  ${String(ligne.candidats).padStart(9)}`,
  );

const sures = rapport.filter((ligne) => ligne.sure);
const compter = (lignes: LignePage[], choisir: (ligne: LignePage) => number): number => lignes.reduce((somme, ligne) => somme + choisir(ligne), 0);

console.log(`\nPages dont la comparaison tient : ${sures.length} sur ${rapport.length}`);
console.log(`  Oracle : ${compter(sures, (l) => l.oracle.length)} éléments`);
console.log(`  Lus localement : ${compter(sures, (l) => l.lus.length)}`);
console.log(`  Manquants (ce que la vision doit retrouver) : ${compter(sures, (l) => l.manquants.length)}`);
console.log(`  Candidats proposés : ${compter(sures, (l) => l.candidats)}`);
console.log(`Sur tout l'intervalle : ${total((l) => l.candidats)} candidats, ${total((l) => l.lus.length)} lus localement`);
console.log(`Recadrages produits : ${tailles.length}`);

if (tailles.length > 0) {
  const moyenne = (nombres: number[]): number => Math.round(nombres.reduce((a, b) => a + b, 0) / nombres.length);
  console.log(
    `Taille : ${moyenne(tailles.map((t) => t.largeur))} × ${moyenne(tailles.map((t) => t.hauteur))} px en moyenne, ` +
      `max ${Math.max(...tailles.map((t) => t.largeur))} × ${Math.max(...tailles.map((t) => t.hauteur))}`,
  );
  console.log(
    `Poids : ${moyenne(tailles.map((t) => t.octets))} octets en moyenne, max ${Math.max(...tailles.map((t) => t.octets))}`,
  );
}

writeFileSync(join(sortie, "candidats-f4.json"), JSON.stringify({ premier, dernier, rapport }, null, 1));
console.log(`\nDétail : ${join(sortie, "candidats-f4.json")}`);
