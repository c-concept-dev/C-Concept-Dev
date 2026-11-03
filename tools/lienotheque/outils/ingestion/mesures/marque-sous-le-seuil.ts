/** Une marque qui désigne des **éléments** peut-elle revenir sur moins de la moitié des pages ?
 *
 *  ## Ce que la mesure cherche
 *
 *  Un endroit n'est proposé que s'il revient sur au moins la moitié des pages regardées. Ce
 *  plancher a été posé pour un repère de **page** — un folio, un cartouche d'en-tête : ceux-là
 *  sont partout. Une marque qui désigne un **enregistrement** ne l'est pas : elle paraît une fois
 *  par élément, et un ouvrage a plus de pages que d'éléments. Sur les quatre documents mesurés le
 *  2 novembre 2026, la chaîne s'est arrêtée quatre fois entre 47 et 49 % d'un seuil à 50 %.
 *
 *  Ce banc refait les trois premiers pas de la voie — formes sombres, endroits récurrents,
 *  lecture d'un échantillon — avec **le plancher en argument**, et il écrit pour chaque endroit
 *  ses trois facteurs. Il ne décide rien : il dit si la marque existe sous le plancher, et avec
 *  quelle allure. Le plancher du produit n'est pas touché.
 *
 *  Usage : marque-sous-le-seuil.ts <document.pdf> <dossier du vivier> [plancher] [pages]
 */
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { enGris, formesSombres, type Boite, type ImageGrise } from "@lienotheque/images";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import {
  COTE_MAXIMAL,
  COTE_MINIMAL,
  NUMEROTATION_PROBABLE,
  allureDeLaSuite,
  partDeNumerotation,
  type FormeObservee,
} from "@lienotheque/noyau";
import { lireDansLaFenetre, vote } from "@lienotheque/recettes";

const MOTEURS = realpathSync(
  "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-main-fusion-wt/tools/lienotheque/apps/app/src-tauri/moteurs",
);
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const LARGEUR_DE_RENDU = 1800;
const APPARITIONS_POUR_JUGER = 12;
const MOTIFS = ["losange_sombre_chiffres_clairs", "bloc_sombre_chiffres_clairs"] as const;

const pdf = process.argv[2]!;
const dossier = process.argv[3]!;
const plancher = Number.parseFloat(process.argv[4] ?? "0.1");
const combienDePages = Number.parseInt(process.argv[5] ?? "0", 10);
const vivier = readdirSync(dossier).filter((nom) => /\.(mp3|m4a|wav)$/iu.test(nom)).length;

// ── Les formes sombres de chaque page ───────────────────────────────────────────────────
const rendu = await ouvrirRenduPdf(pdf);
const pages = combienDePages > 0 ? Math.min(combienDePages, rendu.nombreDePages) : rendu.nombreDePages;
console.log(`document : ${pdf.split("/").pop()}`);
console.log(`vivier   : ${vivier} enregistrement(s) ; ${pages} page(s) regardée(s) ; plancher ${plancher}\n`);

const grises = new Map<number, ImageGrise>();
const formes: FormeObservee[] = [];
for (let numero = 1; numero <= pages; numero += 1) {
  const image = enGris(await rendu.page(numero, LARGEUR_DE_RENDU));
  grises.set(numero, image);
  for (const { boite } of formesSombres(image))
    formes.push({
      page: numero,
      x: boite.x / image.largeur,
      y: boite.y / image.hauteur,
      l: boite.l / image.largeur,
      h: boite.h / image.hauteur,
    });
}
await rendu.fermer();
console.log(`${formes.length} forme(s) en tout`);

// ── Les endroits récurrents, avec le plancher en argument ───────────────────────────────
const RAPPORT_DE_TAILLE = 1.5;
const MEME_ABSCISSE = 0.03;
const memeSigne = (un: FormeObservee, autre: FormeObservee): boolean =>
  Math.max(un.l, autre.l) <= Math.min(un.l, autre.l) * RAPPORT_DE_TAILLE &&
  Math.max(un.h, autre.h) <= Math.min(un.h, autre.h) * RAPPORT_DE_TAILLE &&
  Math.abs(un.x - autre.x) <= MEME_ABSCISSE;

let restantes = formes.filter(
  (forme) => forme.l >= COTE_MINIMAL && forme.h >= COTE_MINIMAL && forme.l <= COTE_MAXIMAL && forme.h <= COTE_MAXIMAL,
);
const minimum = Math.max(2, Math.ceil(pages * plancher));
const zones: { apparitions: FormeObservee[]; pages: number[]; taille: { l: number; h: number }; x: number }[] = [];
while (restantes.length >= minimum) {
  let graine: FormeObservee | undefined;
  let meilleur: FormeObservee[] = [];
  for (const candidate of restantes) {
    const semblables = restantes.filter((forme) => memeSigne(candidate, forme));
    if (semblables.length > meilleur.length) [graine, meilleur] = [candidate, semblables];
  }
  if (graine === undefined || meilleur.length < minimum) break;
  const retire = new Set(meilleur);
  restantes = restantes.filter((forme) => !retire.has(forme));
  const sesPages = [...new Set(meilleur.map((forme) => forme.page))].sort((un, autre) => un - autre);
  if (sesPages.length < minimum) continue;
  const triees = (choisir: (forme: FormeObservee) => number): number =>
    [...meilleur].map(choisir).sort((un, autre) => un - autre)[Math.floor(meilleur.length / 2)]!;
  zones.push({
    apparitions: meilleur,
    pages: sesPages,
    taille: { l: triees((forme) => forme.l), h: triees((forme) => forme.h) },
    x: Math.min(...meilleur.map((forme) => forme.x)),
  });
}
console.log(`${zones.length} endroit(s) au plancher ${plancher} (minimum ${minimum} page(s))\n`);

// ── Ce que chaque endroit lit ───────────────────────────────────────────────────────────
const fenetre = (apparition: FormeObservee, image: ImageGrise): Boite => {
  const l = apparition.l * image.largeur;
  const h = apparition.h * image.hauteur;
  return {
    x: Math.round(apparition.x * image.largeur - l * 0.1),
    y: Math.round(apparition.y * image.hauteur - h * 0.1),
    l: Math.round(l * 1.2),
    h: Math.round(h * 1.2),
  };
};
const echantillon = (apparitions: readonly FormeObservee[]): readonly FormeObservee[] => {
  const triees = [...apparitions].sort((un, autre) => un.page - autre.page || un.y - autre.y);
  if (triees.length <= APPARITIONS_POUR_JUGER) return triees;
  const pas = triees.length / APPARITIONS_POUR_JUGER;
  return Array.from({ length: APPARITIONS_POUR_JUGER }, (_, place) => triees[Math.floor(place * pas)]!);
};

/** Ce que le vivier permet, et ce que la suite montre.
 *
 *  Les trois facteurs en place jugent une suite de lectures sans savoir **ce qu'elle pourrait
 *  désigner**. Or le vivier le dit : dans un lot de vingt-deux enregistrements, une lecture « 40 »
 *  ne désigne rien, et la compter comme une valeur distincte de plus flatte un endroit au lieu de
 *  le juger. Une fois les impossibles écartées, ce qui reste doit **monter** dans l'ordre des
 *  pages — et la plus longue montée dit d'un trait ce qui tient et ce qui n'y tient pas, sans
 *  comparer une valeur à ses voisines, donc sans se mordre la queue. */
/** `stricte` : une suite constante ne monte pas.
 *
 *  Première version écrite avec les égalités comptées comme des montées, par imitation du signe
 *  des tables — où un même numéro d'élément court légitimement sur deux pages. Ici c'est faux :
 *  une forme lue « 7 » partout rendait alors une montée de six sur douze, et venait talonner la
 *  vraie pastille. C'est exactement ce que les trois facteurs existants rejettent par la variété.
 *  Mesuré le 2 novembre 2026, sur deux documents. */
const plusLongueMontee = (valeurs: readonly number[], stricte: boolean): number => {
  if (valeurs.length === 0) return 0;
  const longueur = valeurs.map(() => 1);
  for (const [place, valeur] of valeurs.entries())
    for (let avant = 0; avant < place; avant += 1) {
      const monte = stricte ? valeurs[avant]! < valeur : valeurs[avant]! <= valeur;
      if (monte && longueur[avant]! + 1 > longueur[place]!) longueur[place] = longueur[avant]! + 1;
    }
  return Math.max(...longueur);
};

type Releve = {
  motif: string;
  part: number;
  dansLeVivier: number;
  montee: number;
  partMontee: number;
  monteeLarge: number;
  lues: number;
  regardees: number;
  variete: number;
  avance: number;
  valeurs: (number | undefined)[];
  taille: { l: number; h: number };
  x: number;
  apparitions: number;
  pagesTouchees: number;
};
const releves: Releve[] = [];
for (const zone of zones) {
  const pris = echantillon(zone.apparitions);
  for (const motif of MOTIFS) {
    const valeurs = pris.map((apparition) => {
      const image = grises.get(apparition.page)!;
      const bloc = lireDansLaFenetre(
        image,
        fenetre(apparition, image),
        Math.round(zone.taille.h * image.hauteur),
        motif,
        false,
        OCR,
      );
      return vote(bloc.votes)?.valeur;
    });
    const allure = allureDeLaSuite(valeurs);
    const possibles = valeurs.filter((valeur): valeur is number => valeur !== undefined && valeur >= 1 && valeur <= vivier);
    const montee = plusLongueMontee(possibles, true);
    releves.push({
      motif: motif.startsWith("losange") ? "losange" : "bloc",
      part: partDeNumerotation(allure, pris.length),
      dansLeVivier: possibles.length,
      montee,
      partMontee: montee / pris.length,
      monteeLarge: plusLongueMontee(possibles, false) / pris.length,
      lues: allure.lues,
      regardees: pris.length,
      variete: allure.variete,
      avance: allure.avance,
      valeurs,
      taille: zone.taille,
      x: zone.x,
      apparitions: zone.apparitions.length,
      pagesTouchees: zone.pages.length,
    });
  }
}

releves.sort((un, autre) => autre.partMontee - un.partMontee || autre.part - un.part);
console.log(`seuil du produit : ${NUMEROTATION_PROBABLE} ; vivier : ${vivier}\n`);
for (const releve of releves.slice(0, 14))
  console.log(
    `  stricte ${releve.partMontee.toFixed(3)} (${releve.montee}/${releve.regardees})  large ${releve.monteeLarge.toFixed(3)}  part ${releve.part.toFixed(3)}  ` +
      `${releve.motif.padEnd(7)}  lues ${releve.lues}/${releve.regardees}  dans le vivier ${releve.dansLeVivier}  ` +
      `variété ${releve.variete.toFixed(2)}  avance ${releve.avance.toFixed(2)}  ` +
      `${(releve.taille.l * 100).toFixed(1)}×${(releve.taille.h * 100).toFixed(1)} % vers ${(releve.x * 100).toFixed(0)} %  ` +
      `${releve.apparitions} apparition(s) sur ${releve.pagesTouchees} page(s)\n` +
      `        lu : [${releve.valeurs.map((valeur) => valeur ?? "—").join(", ")}]`,
  );
const auSeuil = releves.filter((releve) => releve.part >= NUMEROTATION_PROBABLE).length;
console.log(`\n${auSeuil} endroit(s) atteignent ${NUMEROTATION_PROBABLE} par les trois facteurs en place`);
const parLaMontee = releves.filter((releve) => releve.partMontee >= NUMEROTATION_PROBABLE).length;
console.log(`${parLaMontee} endroit(s) atteignent ${NUMEROTATION_PROBABLE} par la montée stricte bornée au vivier`);
