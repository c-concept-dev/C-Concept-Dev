/** Étapes 1 et 2 : compter les chiffres d'un repère, puis reconnaître celui que l'OCR a perdu.
 *
 *  Sur les clichés de référence, pour chaque repère que l'oracle connaît, on confronte trois
 *  choses : le nombre de chiffres que l'oracle lui donne, le nombre de formes de la taille d'un
 *  chiffre que l'image montre, et ce que l'OCR a voté. Puis on tire les modèles du document de
 *  ses lectures sûres et on s'en sert sur les lectures incomplètes.
 *
 *  Les repères découpés sont gardés sur disque : l'OCR coûte un quart d'heure, l'analyse rien.
 *  `--relire` repart des repères gardés, ce qui permet d'éprouver une règle de comptage ou un
 *  seuil de reconnaissance sans relire les clichés.
 *
 *     pnpm --filter @lienotheque/recettes exec tsx mesures/comptage-chiffres-f4.ts [--relire] [premier] [dernier]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import type { Boite, ImageGrise } from "@lienotheque/images";
import { chargerRecette, chiffresDuMorceau, normaliser, preparerLot, rassembler, reconnaitre, reperer, type DepotDeChiffres, type Glyphe, type Modeles } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_exercices.csv");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v4.json"), "utf8")));

const nombres = process.argv.slice(2).filter((arg) => !arg.startsWith("--")).map(Number);
const premier = nombres[0] ?? 33;
const dernier = nombres[1] ?? 46;
const relire = process.argv.includes("--relire");

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const lectures = coin(cache, "lectures");
const sortie = coin(cache, "comptage-chiffres");
const releve = join(sortie, `reperes-${premier}-${dernier}.json`);
/** Les repères du document entier, quand on les a : c'est de là que viennent les modèles. */
const releveDuLot = join(sortie, "reperes-du-lot.json");

const pisteDeLElement = new Map<number, number>();
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const [element, , piste] = ligne.split(",");
  const numero = Number(element);
  const valeur = Number(piste);
  if (Number.isFinite(numero) && Number.isFinite(valeur) && valeur > 0) pisteDeLElement.set(numero, valeur);
}

type Repere = { cliche: number; cote: string; numero: number; lu: number | undefined; morceau: ImageGrise };
type Garde = Omit<Repere, "morceau"> & { largeur: number; hauteur: number; pixels: string };

/** Les repères découpés des clichés, lus ou relus. */
const relireFichier = (fichier: string): Repere[] =>
  (JSON.parse(readFileSync(fichier, "utf8")) as Garde[]).map(({ largeur, hauteur, pixels, ...reste }) => ({
    ...reste,
    morceau: { largeur, hauteur, pixels: new Uint8Array(Buffer.from(pixels, "base64")) },
  }));

async function reperes(premier: number, dernier: number, fichier: string): Promise<Repere[]> {
  if (relire && existsSync(fichier)) {
    const gardes = relireFichier(fichier);
    console.log(`Repères relus : ${gardes.length}, sans refaire l'OCR.`);
    return gardes;
  }

  if (!existsSync(F4) || !existsSync(ORACLE)) {
    console.log("Clichés ou oracle absents : rien à mesurer ici.");
    process.exit(0);
  }

  const trouves: Repere[] = [];
  for await (const page of preparerLot(F4, RECETTE, { pages: dernier + 1, cache: lectures })) {
    if (page.index < premier) continue;
    if (page.index > dernier) break;

    // Un dépôt par passe et par élément : on garde celui qui a isolé le plus de formes.
    const depots = new Map<number, DepotDeChiffres>();
    const [lue] = reperer([page], RECETTE, {
      cache: lectures,
      recueillir: (depot) => {
        const vu = depots.get(depot.numero);
        if (vu === undefined || depot.chiffres.length > vu.chiffres.length) depots.set(depot.numero, depot);
      },
    });
    if (lue === undefined) continue;

    for (const element of lue.elements) {
      const depot = depots.get(element.numero);
      if (depot === undefined) continue;
      trouves.push({
        cliche: page.index,
        cote: page.cote ?? "—",
        numero: element.numero,
        lu: element.pisteLue,
        morceau: depot.morceau,
      });
    }
  }

  writeFileSync(
    fichier,
    JSON.stringify(
      trouves.map(({ morceau, ...reste }) => ({
        ...reste,
        largeur: morceau.largeur,
        hauteur: morceau.hauteur,
        pixels: Buffer.from(morceau.pixels).toString("base64"),
      })),
    ),
  );
  console.log(`Repères découpés : ${trouves.length}, gardés dans ${fichier}`);
  return trouves;
}

// `--lot` parcourt le document entier pour en tirer les modèles : les lectures sûres d'un seul
// cliché ne font pas une fonte, celles de trois cents pages si.
if (process.argv.includes("--lot")) {
  await reperes(0, Number.MAX_SAFE_INTEGER, releveDuLot);
  process.exit(0);
}

const trouves = await reperes(premier, dernier, releve);

type Cas = Repere & { oracle: number | undefined; chiffres: Boite[]; glyphes: Glyphe[] };
const cas: Cas[] = trouves.map((repere) => {
  const chiffres = chiffresDuMorceau(repere.morceau);
  return {
    ...repere,
    oracle: pisteDeLElement.get(repere.numero),
    chiffres,
    glyphes: chiffres.map((boite) => normaliser(repere.morceau, boite)),
  };
});

const connus = cas.filter((entree) => entree.oracle !== undefined && entree.chiffres.length > 0);
const taille = (valeur: number | undefined): number => (valeur === undefined ? 0 : String(valeur).length);

console.log(`\nRepères découpés dont l'oracle connaît la piste : ${connus.length} / ${cas.length}`);

console.log(`\nFormes comptées contre chiffres de l'oracle :`);
const table = new Map<string, number>();
for (const entree of connus) table.set(`${taille(entree.oracle)} → ${entree.chiffres.length}`, (table.get(`${taille(entree.oracle)} → ${entree.chiffres.length}`) ?? 0) + 1);
for (const [clef, nombre] of [...table].sort()) console.log(`  ${clef} forme(s) : ${nombre}`);

const justes = connus.filter((e) => e.lu === e.oracle);
const perdus = connus.filter((e) => e.lu !== undefined && taille(e.lu) < taille(e.oracle));
const bienComptes = connus.filter((e) => e.chiffres.length === taille(e.oracle));

console.log(`\nComptage juste (formes = chiffres de l'oracle) : ${bienComptes.length} / ${connus.length}`);
console.log(`Lectures justes : ${justes.length} / ${connus.length}`);
console.log(`Lectures à un chiffre perdu : ${perdus.length}`);
console.log(`  que le comptage signale : ${perdus.filter((e) => e.chiffres.length > taille(e.lu)).length}`);
const fauxSignaux = justes.filter((e) => e.chiffres.length > taille(e.lu));
console.log(`Lectures justes que le comptage croirait incomplètes : ${fauxSignaux.length} / ${justes.length}`);

// --- Les modèles du document, éprouvés un contre tous.
//
// Un exemple est sûr quand l'OCR a lu juste et que le comptage le confirme. Hors mesure, l'oracle
// n'existe pas : c'est pourquoi la règle retenue dans la bibliothèque ne demande que l'accord du
// comptage et du vote. Ici on s'autorise l'oracle pour savoir ce que cette règle coûte.
const exemplesDe = (entrees: readonly Cas[]) =>
  entrees
    .filter((entree) => entree.lu !== undefined && entree.chiffres.length === taille(entree.lu))
    .map((entree) => ({ lu: entree.lu!, glyphes: entree.glyphes, numero: entree.numero }));

const casDuLot: Cas[] = existsSync(releveDuLot)
  ? relireFichier(releveDuLot).map((repere) => {
      const chiffres = chiffresDuMorceau(repere.morceau);
      return { ...repere, oracle: pisteDeLElement.get(repere.numero), chiffres, glyphes: chiffres.map((boite) => normaliser(repere.morceau, boite)) };
    })
  : [];
if (casDuLot.length > 0) console.log(`\nRepères du document entier, pour les modèles : ${casDuLot.length}`);

const surs = casDuLot.length > 0 ? exemplesDe(casDuLot) : exemplesDe(connus.filter((e) => e.lu === e.oracle));

console.log(`\nExemples sûrs du document : ${surs.length}`);
const parChiffre = new Map<number, number>();
for (const sur of surs) for (const chiffre of String(sur.lu).split("").map(Number)) parChiffre.set(chiffre, (parChiffre.get(chiffre) ?? 0) + 1);
console.log(`  par chiffre : ${[...parChiffre].sort((a, b) => a[0] - b[0]).map(([c, n]) => `${c}×${n}`).join(" ")}`);

const mesures: { juste: boolean; ecart: number; avance: number }[] = [];
for (const [rang, sur] of surs.entries()) {
  const autres = rassembler(surs.filter((_, place) => place !== rang));
  for (const [place, chiffre] of String(sur.lu).split("").map(Number).entries()) {
    const trouve = reconnaitre(sur.glyphes[place]!, autres);
    if (trouve !== undefined) mesures.push({ juste: trouve.chiffre === chiffre, ...trouve });
  }
}
const quantile = (valeurs: number[], part: number): number =>
  valeurs.length === 0 ? Number.NaN : [...valeurs].sort((a, b) => a - b)[Math.min(valeurs.length - 1, Math.floor(valeurs.length * part))]!;
const bons = mesures.filter((m) => m.juste);
const mauvais = mesures.filter((m) => !m.juste);
console.log(`\nReconnaissance un contre tous : ${bons.length} justes, ${mauvais.length} faux`);
console.log(`  écart  justes : médian ${quantile(bons.map((m) => m.ecart), 0.5).toFixed(3)}  90e ${quantile(bons.map((m) => m.ecart), 0.9).toFixed(3)}`);
console.log(`  écart  faux   : médian ${quantile(mauvais.map((m) => m.ecart), 0.5).toFixed(3)}  10e ${quantile(mauvais.map((m) => m.ecart), 0.1).toFixed(3)}`);
console.log(`  avance justes : médiane ${quantile(bons.map((m) => m.avance), 0.5).toFixed(3)}  10e ${quantile(bons.map((m) => m.avance), 0.1).toFixed(3)}`);
console.log(`  avance faux   : médiane ${quantile(mauvais.map((m) => m.avance), 0.5).toFixed(3)}  90e ${quantile(mauvais.map((m) => m.avance), 0.9).toFixed(3)}`);

// --- La composition : tous les glyphes reconnus, et non le seul qu'on croit manquant.
//
// La première version de cette mesure supposait que l'OCR perd le chiffre de tête. Elle s'est
// trompée : sur les cinq échecs, quatre avaient perdu celui de queue. On ne devine donc plus
// quelle place manque — on reconnaît toutes les formes et on compose, la lecture de l'OCR ne
// servant qu'à corroborer.
const modeles: Modeles = rassembler(surs);

type Essai = { entree: Cas; compose: number | undefined; pire: number; moindre: number };

const composer = (entree: Cas, modeles: Modeles): Essai => {
  const trouves = entree.glyphes.map((glyphe) => reconnaitre(glyphe, modeles));
  if (trouves.some((trouve) => trouve === undefined)) return { entree, compose: undefined, pire: 1, moindre: 0 };
  const chiffres = trouves.map((trouve) => trouve!.chiffre).join("");
  return {
    entree,
    compose: Number(chiffres),
    pire: Math.max(...trouves.map((trouve) => trouve!.ecart)),
    moindre: Math.min(...trouves.map((trouve) => trouve!.avance)),
  };
};

// Un contre tous, là aussi : on ne reconnaît jamais un repère avec lui-même pour modèle.
const essais = connus.map((entree) => {
  const autres = rassembler(surs.filter((sur) => sur.numero !== entree.numero));
  return composer(entree, autres);
});

console.log(`\nComposition de tous les glyphes, un contre tous :`);
const incomplets = essais.filter((essai) => essai.entree.chiffres.length > taille(essai.entree.lu));
console.log(`  repères que le comptage dit incomplets : ${incomplets.length}`);
console.log(`  dont la composition rend la piste de l'oracle : ${incomplets.filter((e) => e.compose === e.entree.oracle).length}`);
for (const essai of incomplets)
  console.log(
    `    élément ${essai.entree.numero} : lu ${essai.entree.lu}, oracle ${essai.entree.oracle} → composé ${essai.compose ?? "?"}` +
      ` (pire écart ${essai.pire.toFixed(3)}, moindre avance ${essai.moindre.toFixed(3)})${essai.compose === essai.entree.oracle ? " ✓" : " ✗"}`,
  );

// --- Les seuils, par balayage. On ne les suppose pas : on regarde ce que chacun gagne et coûte.
//
// Gain  : un repère incomplet que la composition redresse.
// Coût  : un repère que la composition abîme — elle contredit une lecture juste, ou elle en
//         propose une fausse là où l'OCR n'avait rien ou avait raison.
console.log(`\nBalayage des seuils (gain = repères redressés, coût = repères abîmés) :`);
console.log(`  écart max  avance min  corrobore  gain  coût`);
for (const corrobore of [false, true])
  for (const ecartMax of [0.08, 0.1, 0.12, 0.15])
    for (const avanceMin of [0, 0.02, 0.04, 0.06]) {
      let gain = 0;
      let cout = 0;
      for (const essai of essais) {
        const { entree } = essai;
        const incomplet = entree.chiffres.length > taille(entree.lu);
        if (!incomplet || essai.compose === undefined) continue;
        if (essai.pire > ecartMax || essai.moindre < avanceMin) continue;
        // Corroborer : la composition doit contenir ce que l'OCR a lu, sans quoi elle le contredit.
        if (corrobore && entree.lu !== undefined && !String(essai.compose).includes(String(entree.lu))) continue;
        if (essai.compose === entree.oracle) gain += 1;
        else cout += 1;
      }
      console.log(
        `  ${ecartMax.toFixed(2).padStart(9)}  ${avanceMin.toFixed(2).padStart(10)}  ${String(corrobore).padStart(9)}  ${String(gain).padStart(4)}  ${String(cout).padStart(4)}`,
      );
    }

// --- Les planches : la seule façon de voir, dans un journal, ce qui a été compté.
const tons = " .:-=+*#%@";
const dessiner = (glyphe: Glyphe): string[] =>
  Array.from({ length: 12 }, (_, ligne) =>
    Array.from({ length: 8 }, (_, colonne) => tons[Math.min(9, Math.floor((glyphe.parts[ligne * 8 + colonne]! / 256) * 10))]).join(""),
  );
const planche = (titre: string, entree: Cas): void => {
  console.log(`  ${titre} — boîtes ${entree.chiffres.map((b) => `${b.l}×${b.h}@${b.x}`).join(" ")} dans ${entree.morceau.largeur}×${entree.morceau.hauteur}`);
  const dessins = entree.glyphes.map(dessiner);
  for (let ligne = 0; ligne < 12; ligne += 1) console.log(`    ${dessins.map((d) => d[ligne]).join("  |  ")}`);
};

if (process.argv.includes("--planches")) {
  console.log(`\n=== Lectures à un chiffre perdu ===`);
  for (const entree of perdus) planche(`élément ${entree.numero} : lu ${entree.lu}, oracle ${entree.oracle}`, entree);
  console.log(`\n=== Lectures justes à une forme de trop ===`);
  for (const entree of fauxSignaux) planche(`élément ${entree.numero} : lu ${entree.lu} juste`, entree);
  console.log(`\n=== Lectures justes et bien comptées ===`);
  for (const entree of justes.filter((e) => e.chiffres.length === taille(e.lu))) planche(`élément ${entree.numero} : lu ${entree.lu}`, entree);
}
