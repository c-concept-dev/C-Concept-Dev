/** Compter les chiffres d'un repère, puis essayer de reconnaître celui qui manque (OUT-07).
 *
 *  Deux mesures en une, parce qu'elles se répondent.
 *
 *  **Partie 1, le comptage.** Pour chaque repère que l'oracle connaît, on confronte trois choses :
 *  le nombre de chiffres que l'oracle lui donne, le nombre de formes de la taille d'un chiffre que
 *  l'image montre, et ce que l'OCR a voté. Le comptage est retenu dans la bibliothèque.
 *
 *  **Partie 2, la reconnaissance — réfutée, gardée ici.** Les repères à un seul chiffre se lisent
 *  bien et fournissent chacun un exemple sûr de son chiffre dans la fonte du document ; l'idée
 *  était de découper le chiffre perdu et de le rapprocher de ces exemples, chaque document
 *  constituant ses propres modèles. La mesure dit non : sur les treize clichés éprouvés, avec cent
 *  exemples tirés du reste du document, aucun couple de seuils ne rend plus de repères qu'il n'en
 *  abîme. Le code de cette reconnaissance vit donc ici, dans la mesure qui l'a réfutée, et non
 *  dans la bibliothèque — pour qu'on puisse refaire le calcul sans le porter à nouveau.
 *
 *  Les repères découpés sont gardés sur disque : l'OCR coûte un quart d'heure pour les clichés
 *  éprouvés et près d'une heure pour le document entier, l'analyse ne coûte rien.
 *
 *     pnpm --filter @lienotheque/recettes exec tsx mesures/comptage-chiffres-f4.ts --lot
 *     pnpm --filter @lienotheque/recettes exec tsx mesures/comptage-chiffres-f4.ts [--relire] [--planches]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import type { Boite, ImageGrise } from "@lienotheque/images";
import { chargerRecette, chiffresDuMorceau, preparerLot, reperer, type DepotDeChiffres } from "../src/index.js";

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

const relireFichier = (fichier: string): Repere[] =>
  (JSON.parse(readFileSync(fichier, "utf8")) as Garde[]).map(({ largeur, hauteur, pixels, ...reste }) => ({
    ...reste,
    morceau: { largeur, hauteur, pixels: new Uint8Array(Buffer.from(pixels, "base64")) },
  }));

/** Les repères découpés des clichés demandés, lus ou relus. */
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
      trouves.push({ cliche: page.index, cote: page.cote ?? "—", numero: element.numero, lu: element.pisteLue, morceau: depot.morceau });
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

const taille = (valeur: number | undefined): number => (valeur === undefined ? 0 : String(valeur).length);
type Cas = Repere & { oracle: number | undefined; chiffres: Boite[] };
const decrire = (repere: Repere): Cas => ({ ...repere, oracle: pisteDeLElement.get(repere.numero), chiffres: chiffresDuMorceau(repere.morceau) });

const cas = (await reperes(premier, dernier, releve)).map(decrire);
const connus = cas.filter((entree) => entree.oracle !== undefined && entree.chiffres.length > 0);

// --- Partie 1 : le comptage.
console.log(`\n=== Partie 1 : compter les chiffres ===`);
console.log(`\nRepères découpés dont l'oracle connaît la piste : ${connus.length} / ${cas.length}`);

console.log(`\nFormes comptées contre chiffres de l'oracle :`);
const table = new Map<string, number>();
for (const entree of connus) {
  const clef = `${taille(entree.oracle)} → ${entree.chiffres.length}`;
  table.set(clef, (table.get(clef) ?? 0) + 1);
}
for (const [clef, nombre] of [...table].sort()) console.log(`  ${clef} forme(s) : ${nombre}`);

const justes = connus.filter((e) => e.lu === e.oracle);
const perdus = connus.filter((e) => e.lu !== undefined && taille(e.lu) < taille(e.oracle));
const fauxSignaux = justes.filter((e) => e.chiffres.length > taille(e.lu));

console.log(`\nComptage juste (formes = chiffres de l'oracle) : ${connus.filter((e) => e.chiffres.length === taille(e.oracle)).length} / ${connus.length}`);
console.log(`Lectures justes : ${justes.length} / ${connus.length}`);
console.log(`Lectures à un chiffre perdu : ${perdus.length}, dont le comptage signale ${perdus.filter((e) => e.chiffres.length > taille(e.lu)).length}`);
console.log(`Lectures justes que le comptage croirait incomplètes : ${fauxSignaux.length} / ${justes.length}`);
for (const entree of perdus)
  console.log(`  cliché ${entree.cliche} ${entree.cote} élément ${entree.numero} : lu ${entree.lu}, oracle ${entree.oracle}, ${entree.chiffres.length} forme(s)`);

// --- Partie 2 : la reconnaissance, réfutée.
//
// Normalisation à proportions gardées — l'échelle est prise sur la hauteur seule et la forme est
// centrée dans la largeur, pour qu'un « 1 » reste étroit et un « 0 » large. Distance : moyenne des
// écarts de part d'encre, éventuellement au meilleur de petits décalages.
type Glyphe = { parts: Float64Array; l: number; h: number };

function normaliser(binaire: ImageGrise, boite: Boite, gl: number, gh: number): Glyphe {
  const parts = new Float64Array(gl * gh);
  if (boite.l <= 0 || boite.h <= 0) return { parts, l: gl, h: gh };
  const large = Math.min(gl, Math.max(1, Math.round((boite.l * gh) / boite.h)));
  const marge = Math.floor((gl - large) / 2);
  for (let ligne = 0; ligne < gh; ligne += 1) {
    const y0 = boite.y + (ligne * boite.h) / gh;
    const y1 = boite.y + ((ligne + 1) * boite.h) / gh;
    for (let colonne = 0; colonne < large; colonne += 1) {
      const x0 = boite.x + (colonne * boite.l) / large;
      const x1 = boite.x + ((colonne + 1) * boite.l) / large;
      let encre = 0;
      let vus = 0;
      for (let y = Math.floor(y0); y < Math.max(Math.floor(y0) + 1, Math.ceil(y1)); y += 1)
        for (let x = Math.floor(x0); x < Math.max(Math.floor(x0) + 1, Math.ceil(x1)); x += 1) {
          if (y < 0 || y >= binaire.hauteur || x < 0 || x >= binaire.largeur) continue;
          vus += 1;
          if (binaire.pixels[y * binaire.largeur + x]! < 128) encre += 1;
        }
      if (vus > 0) parts[ligne * gl + marge + colonne] = encre / vus;
    }
  }
  return { parts, l: gl, h: gh };
}

const ecart = (a: Glyphe, b: Glyphe, decalage: number): number => {
  let meilleur = Number.POSITIVE_INFINITY;
  for (let dy = -decalage; dy <= decalage; dy += 1)
    for (let dx = -decalage; dx <= decalage; dx += 1) {
      let somme = 0;
      let vus = 0;
      for (let y = 0; y < a.h; y += 1)
        for (let x = 0; x < a.l; x += 1) {
          const by = y + dy;
          const bx = x + dx;
          if (by < 0 || by >= a.h || bx < 0 || bx >= a.l) continue;
          vus += 1;
          somme += Math.abs(a.parts[y * a.l + x]! - b.parts[by * a.l + bx]!);
        }
      if (vus > 0) meilleur = Math.min(meilleur, somme / vus);
    }
  return meilleur;
};

console.log(`\n=== Partie 2 : reconnaître le chiffre perdu (réfutée) ===`);

if (!existsSync(releveDuLot)) {
  console.log(`\nLes repères du document entier manquent : lancez d'abord --lot.`);
} else {
  const casDuLot = relireFichier(releveDuLot).map(decrire);
  const eprouves = new Set(cas.map((entree) => entree.cliche));
  // Les modèles viennent du document MOINS les clichés éprouvés : aucune fuite. Et la règle qui
  // fait d'une lecture un exemple sûr est celle qu'on aurait en production — autant de formes
  // comptées que de chiffres lus —, sans l'oracle, que seule la notation s'autorise.
  const exemples = casDuLot.filter((e) => !eprouves.has(e.cliche) && e.lu !== undefined && e.chiffres.length === taille(e.lu));
  const incomplets = connus.filter((e) => e.chiffres.length > taille(e.lu));
  console.log(`\nRepères du document : ${casDuLot.length}, dont ${exemples.length} exemples sûrs hors clichés éprouvés`);
  console.log(`Repères dits incomplets sur les clichés éprouvés : ${incomplets.length}`);

  for (const [gl, gh] of [[8, 12], [10, 15], [16, 24]] as const)
    for (const decalage of [0, 1]) {
      const modeles = new Map<number, Glyphe[]>();
      for (const exemple of exemples)
        for (const [rang, chiffre] of String(exemple.lu).split("").map(Number).entries())
          modeles.set(chiffre, [...(modeles.get(chiffre) ?? []), normaliser(exemple.morceau, exemple.chiffres[rang]!, gl, gh)]);

      const reconnus = incomplets.map((entree) =>
        entree.chiffres.map((boite) => {
          const glyphe = normaliser(entree.morceau, boite, gl, gh);
          const classe = [...modeles]
            .map(([chiffre, exs]) => ({ chiffre, ecart: Math.min(...exs.map((modele) => ecart(glyphe, modele, decalage))) }))
            .sort((a, b) => a.ecart - b.ecart || a.chiffre - b.chiffre);
          return { chiffre: classe[0]!.chiffre, ecart: classe[0]!.ecart, avance: (classe[1]?.ecart ?? 1) - classe[0]!.ecart };
        }),
      );

      console.log(`\ngrille ${gl}×${gh}, décalage ±${decalage} — modèles : ${[...modeles].sort((a, b) => a[0] - b[0]).map(([c, e]) => `${c}×${e.length}`).join(" ")}`);
      for (const ecartMax of [0.06, 0.08, 0.1, 0.12, 0.15])
        for (const avanceMin of [0, 0.02, 0.04]) {
          let gain = 0;
          let cout = 0;
          for (const [rang, trouves] of reconnus.entries()) {
            if (Math.max(...trouves.map((t) => t.ecart)) > ecartMax) continue;
            if (Math.min(...trouves.map((t) => t.avance)) < avanceMin) continue;
            const compose = Number(trouves.map((t) => t.chiffre).join(""));
            if (compose === incomplets[rang]!.oracle) gain += 1;
            else cout += 1;
          }
          console.log(`  écart ≤ ${ecartMax.toFixed(2)}  avance ≥ ${avanceMin.toFixed(2)} : gain ${gain}, coût ${cout}`);
        }
    }
  console.log(`\nAucun couple de seuils ne rend plus de repères qu'il n'en abîme : la reconnaissance`);
  console.log(`par modèles du document est écartée. La raison tient à la composition du document —`);
  console.log(`il abonde en exemples du chiffre des unités et manque de ceux des dizaines, qui sont`);
  console.log(`justement ceux que l'OCR perd.`);
}

// --- Les planches : la seule façon de voir, dans un journal, ce qui a été compté.
if (process.argv.includes("--planches")) {
  const tons = " .:-=+*#%@";
  const planche = (titre: string, entree: Cas): void => {
    console.log(`  ${titre} — boîtes ${entree.chiffres.map((b) => `${b.l}×${b.h}@${b.x}`).join(" ")} dans ${entree.morceau.largeur}×${entree.morceau.hauteur}`);
    const dessins = entree.chiffres.map((boite) => {
      const glyphe = normaliser(entree.morceau, boite, 8, 12);
      return Array.from({ length: 12 }, (_, ligne) =>
        Array.from({ length: 8 }, (_, colonne) => tons[Math.min(9, Math.floor(glyphe.parts[ligne * 8 + colonne]! * 10))]).join(""),
      );
    });
    for (let ligne = 0; ligne < 12; ligne += 1) console.log(`    ${dessins.map((d) => d[ligne]).join("  |  ")}`);
  };

  console.log(`\n=== Lectures à un chiffre perdu ===`);
  for (const entree of perdus) planche(`élément ${entree.numero} : lu ${entree.lu}, oracle ${entree.oracle}`, entree);
  console.log(`\n=== Lectures justes à une forme de trop ===`);
  for (const entree of fauxSignaux) planche(`élément ${entree.numero} : lu ${entree.lu} juste`, entree);
}
