/** Diagnostic A1 : la fenêtre de pastille déborde-t-elle sur l'élément suivant ? (OUT-07)
 *
 *  Sur les clichés de référence, pour chaque élément lu, on compare la piste lue à celle que
 *  l'oracle lui donne. Les cas où la piste lue vaut celle de l'oracle **plus un** sont ceux qui
 *  nous intéressent : c'est la signature d'un repère emprunté au voisin du dessous.
 *
 *  Et on mesure, plutôt que de regarder : la fenêtre explorée recouvre-t-elle le numéro de
 *  l'élément suivant, ou la fenêtre de ce suivant ? Les images sont écrites pour vérifier à
 *  l'œil ce que les chiffres disent.
 *
 *     pnpm --filter @lienotheque/recettes exec tsx mesures/fenetre-pastille-f4.ts [premier] [dernier]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { encoderWebp, type Boite, type ImageGrise } from "@lienotheque/images";
import { chargerRecette, preparerLot, reperer, zonePastille } from "../src/index.js";

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

/** L'oracle, par élément : quelle piste il porte. */
const pisteDeLElement = new Map<number, number>();
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const [exercice, , piste] = ligne.split(",");
  const numero = Number(exercice);
  const valeur = Number(piste);
  if (Number.isFinite(numero) && Number.isFinite(valeur) && valeur > 0) pisteDeLElement.set(numero, valeur);
}

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const lectures = coin(cache, "lectures");
const sortie = coin(cache, "diagnostic-pastille");

/** Position de la recette : c'est elle qui dit où chercher, pas le code. */
const lecturePiste = RECETTE.lectures.find((entree) => entree.ancre === "piste");
const position = lecturePiste?.ancre === "piste" ? lecturePiste.position : "dessous";

const recouvre = (a: Boite, b: Boite): boolean =>
  a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.h && b.y < a.y + a.h;

/** Teinte une boîte, sans l'effacer : on doit voir ce qu'il y a dessous. */
function cadrer(data: Uint8ClampedArray, largeur: number, hauteur: number, boite: Boite, couleur: [number, number, number], pleine = false): void {
  const x0 = Math.max(0, Math.round(boite.x));
  const y0 = Math.max(0, Math.round(boite.y));
  const x1 = Math.min(largeur - 1, Math.round(boite.x + boite.l));
  const y1 = Math.min(hauteur - 1, Math.round(boite.y + boite.h));
  for (let y = y0; y <= y1; y += 1)
    for (let x = x0; x <= x1; x += 1) {
      const bord = x <= x0 + 2 || x >= x1 - 2 || y <= y0 + 2 || y >= y1 - 2;
      if (!bord && !pleine) continue;
      const base = (y * largeur + x) * 4;
      const part = bord ? 1 : 0.18;
      for (const [rang, ton] of couleur.entries()) data[base + rang] = Math.round(data[base + rang]! * (1 - part) + ton * part);
    }
}

const enCouleur = (image: ImageGrise): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(image.largeur * image.hauteur * 4);
  for (let rang = 0; rang < image.pixels.length; rang += 1) {
    const ton = image.pixels[rang]!;
    data[rang * 4] = ton;
    data[rang * 4 + 1] = ton;
    data[rang * 4 + 2] = ton;
    data[rang * 4 + 3] = 255;
  }
  return data;
};

type Cas = {
  cliche: number;
  cote: string;
  numero: number;
  pisteLue: number | undefined;
  pisteOracle: number | undefined;
  derive: number | undefined;
  recouvreNumeroSuivant: boolean;
  recouvreFenetreSuivante: boolean;
  image?: string;
};

const cas: Cas[] = [];
let ecrits = 0;

for await (const page of preparerLot(F4, RECETTE, { pages: dernier + 1, cache: lectures })) {
  if (page.index < premier) continue;
  if (page.index > dernier) break;

  const [lue] = reperer([page], RECETTE, { cache: lectures });
  if (lue === undefined) continue;

  const places = lue.elements
    .filter((element) => element.zone !== undefined)
    .map((element) => ({
      numero: element.numero,
      pisteLue: element.pisteLue,
      boite: {
        x: element.zone!.x * page.image.largeur,
        y: element.zone!.y * page.image.hauteur,
        l: element.zone!.l * page.image.largeur,
        h: element.zone!.h * page.image.hauteur,
      },
    }))
    .sort((a, b) => a.boite.y - b.boite.y);

  for (const [rang, place] of places.entries()) {
    const fenetre = zonePastille(place.boite, position, 0);
    const suivant = places[rang + 1];
    const pisteOracle = pisteDeLElement.get(place.numero);
    const derive = place.pisteLue === undefined || pisteOracle === undefined ? undefined : place.pisteLue - pisteOracle;

    const entree: Cas = {
      cliche: page.index,
      cote: page.cote ?? "—",
      numero: place.numero,
      pisteLue: place.pisteLue,
      pisteOracle,
      derive,
      recouvreNumeroSuivant: suivant !== undefined && recouvre(fenetre, suivant.boite),
      recouvreFenetreSuivante: suivant !== undefined && recouvre(fenetre, zonePastille(suivant.boite, position, 0)),
    };

    // On dessine les cas qui dérivent, et quelques cas justes pour comparer.
    const interessant = derive === 1 || entree.recouvreNumeroSuivant || entree.recouvreFenetreSuivante;
    if ((interessant || (derive === 0 && ecrits < 3)) && ecrits < 24) {
      const data = enCouleur(page.image);
      cadrer(data, page.image.largeur, page.image.hauteur, place.boite, [0, 90, 200]); // le numéro, en bleu
      cadrer(data, page.image.largeur, page.image.hauteur, fenetre, [220, 40, 40], true); // la fenêtre, en rouge
      if (suivant !== undefined) cadrer(data, page.image.largeur, page.image.hauteur, suivant.boite, [0, 150, 60]); // le suivant, en vert

      const nom = `c${page.index}-${page.cote ?? "x"}-n${place.numero}-d${derive ?? "?"}.webp`;
      writeFileSync(
        join(sortie, nom),
        await encoderWebp({ data, width: page.image.largeur, height: page.image.hauteur, colorSpace: "srgb" }, { quality: 70 }),
      );
      entree.image = nom;
      ecrits += 1;
    }
    cas.push(entree);
  }
}

const avecOracle = cas.filter((entree) => entree.derive !== undefined);
const parDerive = new Map<number, number>();
for (const entree of avecOracle) parDerive.set(entree.derive!, (parDerive.get(entree.derive!) ?? 0) + 1);

console.log(`\nÉléments lus sur les clichés ${premier} à ${dernier} : ${cas.length}`);
console.log(`Dont l'oracle connaît la piste : ${avecOracle.length}`);
console.log(`\nDérive de la piste lue (lue − oracle) :`);
for (const [derive, nombre] of [...parDerive].sort((a, b) => a[0] - b[0])) console.log(`  ${derive >= 0 ? "+" : ""}${derive} : ${nombre}`);

console.log(`\nRecouvrement de la fenêtre explorée :`);
console.log(`  recouvre le numéro de l'élément suivant  : ${cas.filter((e) => e.recouvreNumeroSuivant).length}`);
console.log(`  recouvre la fenêtre de l'élément suivant : ${cas.filter((e) => e.recouvreFenetreSuivante).length}`);

const derivants = avecOracle.filter((entree) => entree.derive === 1);
console.log(`\nCas à dérive de +1 : ${derivants.length}`);
console.log(`  dont la fenêtre recouvre le suivant : ${derivants.filter((e) => e.recouvreNumeroSuivant || e.recouvreFenetreSuivante).length}`);
for (const entree of derivants.slice(0, 12))
  console.log(
    `  cliché ${entree.cliche} ${entree.cote} élément ${entree.numero} : lu ${entree.pisteLue}, oracle ${entree.pisteOracle}` +
      `${entree.recouvreNumeroSuivant ? " — recouvre le numéro suivant" : ""}${entree.recouvreFenetreSuivante ? " — recouvre la fenêtre suivante" : ""}`,
  );

writeFileSync(join(sortie, "fenetre-pastille.json"), JSON.stringify({ premier, dernier, cas }, null, 1));
console.log(`\n${ecrits} images écrites dans ${sortie}`);
