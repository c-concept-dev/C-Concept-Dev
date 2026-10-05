/** Quels pavés la relecture ciblée enverrait, et ce qu'ils pèsent (OUT-08).
 *
 *  Rien ne part sur le réseau ici : on sélectionne, on recadre, on encode, on mesure. C'est la
 *  preuve demandée avant d'ouvrir la route — que les pavés retenus soient bien les repères que
 *  l'oracle sait à deux chiffres et que nous lisons court, et pas une moisson de tout ce qui
 *  traîne.
 *
 *  Les recadrages sont écrits sur le disque de travail : on doit pouvoir regarder ce qu'on
 *  s'apprête à envoyer.
 *
 *     pnpm --filter @lienotheque/vision exec tsx mesures/candidats-f4.ts [premier] [dernier]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { chargerRecette, preparerLot, reperer } from "@lienotheque/recettes";
import { recadrer } from "@lienotheque/images";
import { candidatsDePage, recadrerPour, type Candidat, type ElementAsonder } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_exercices.csv");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v5.json"), "utf8")));

if (!existsSync(F4) || !existsSync(ORACLE)) {
  console.log("Clichés ou oracle absents : rien à mesurer ici.");
  process.exit(0);
}

const premier = Number(process.argv[2] ?? 33);
const dernier = Number(process.argv[3] ?? 46);

const pisteDeLElement = new Map<number, number>();
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const [element, , piste] = ligne.split(",");
  const numero = Number(element);
  const valeur = Number(piste);
  if (Number.isFinite(numero) && Number.isFinite(valeur) && valeur > 0) pisteDeLElement.set(numero, valeur);
}

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const lectures = coin(cache, "lectures");
const sortie = coin(cache, "vision-candidats");

/** Ce que l'oracle dit d'un élément, confronté à ce que la lecture en a fait. */
type Jugement = "a_relire" | "deja_juste" | "inconnu_de_loracle";

const jugements = new Map<number, Jugement>();
const taille = (valeur: number | undefined): number => (valeur === undefined ? 0 : String(valeur).length);

const retenus: (Candidat & { octets: number; jugement: Jugement })[] = [];
/** Les pavés en gris, gardés tels quels : la mesure des jetons les reprendra sans relire les
 *  clichés, et pourra les agrandir pour éprouver plusieurs échelles. */
const paves: { numero: number; cliche: number; cote: string; motif: string; largeur: number; hauteur: number; pixels: string }[] = [];
const manques: { numero: number; lu: number | undefined; oracle: number }[] = [];
let elementsVus = 0;
let pagesSansGris = 0;

for await (const page of preparerLot(F4, RECETTE, { pages: dernier + 1, cache: lectures })) {
  if (page.index < premier) continue;
  if (page.index > dernier) break;

  const [lue] = reperer([page], RECETTE, { cache: lectures });
  if (lue === undefined) continue;
  if (page.grise === undefined) pagesSansGris += 1;

  const elements: ElementAsonder[] = lue.elements.map((element) => ({
    numero: element.numero,
    y: element.y,
    ...(element.zoneRepere === undefined ? {} : { zoneRepere: element.zoneRepere }),
    ...(element.pisteLue === undefined ? {} : { pisteLue: element.pisteLue }),
    ...(element.chiffresComptes === undefined ? {} : { chiffresComptes: element.chiffresComptes }),
  }));
  elementsVus += elements.length;

  for (const element of lue.elements) {
    const oracle = pisteDeLElement.get(element.numero);
    const jugement: Jugement =
      oracle === undefined ? "inconnu_de_loracle" : element.pisteLue === oracle ? "deja_juste" : "a_relire";
    jugements.set(element.numero, jugement);
    // Ce que la sélection devrait attraper et n'attrape pas : une lecture fausse qu'aucun des
    // deux motifs ne désigne. C'est le vrai angle mort, et il doit être nommé.
    if (jugement === "a_relire" && element.zoneRepere !== undefined) {
      const designe = element.pisteLue === undefined || (element.chiffresComptes ?? 0) > taille(element.pisteLue);
      if (!designe) manques.push({ numero: element.numero, lu: element.pisteLue, oracle: oracle! });
    }
  }

  // Le recadrage part du gris, jamais de la page binarisée : le seuil qui aide l'OCR mange
  // précisément le chiffre qu'on vient faire relire.
  const source = page.grise ?? page.image;
  for (const candidat of candidatsDePage({ index: page.index, image: source, ...(page.cote === undefined ? {} : { cote: page.cote }), elements }, RECETTE)) {
    const produit = await recadrerPour(source, candidat, { min: 1, max: 92 });
    if (produit === undefined) {
      console.log(`  cliché ${candidat.page} élément ${candidat.numero} : recadrage refusé`);
      continue;
    }
    writeFileSync(join(sortie, `c${candidat.page}-${candidat.cote ?? "x"}-n${candidat.numero}-${candidat.motif}.webp`), produit.octets);
    retenus.push({ ...candidat, octets: produit.octets.length, jugement: jugements.get(candidat.numero) ?? "inconnu_de_loracle" });

    const gris = recadrer(source, candidat.recadrage);
    paves.push({
      numero: candidat.numero,
      cliche: candidat.page,
      cote: candidat.cote ?? "—",
      motif: candidat.motif,
      largeur: gris.largeur,
      hauteur: gris.hauteur,
      pixels: Buffer.from(gris.pixels).toString("base64"),
    });
  }
}

console.log(`\nClichés ${premier} à ${dernier} : ${elementsVus} éléments lus, ${retenus.length} pavés retenus`);
if (pagesSansGris > 0) console.log(`  ATTENTION : ${pagesSansGris} pages sans gris — le recadrage partirait du noir et blanc`);

const parMotif = new Map<string, number>();
for (const candidat of retenus) parMotif.set(candidat.motif, (parMotif.get(candidat.motif) ?? 0) + 1);
console.log(`\nPar motif :`);
for (const [motif, nombre] of [...parMotif].sort()) console.log(`  ${motif} : ${nombre}`);

const parJugement = new Map<string, number>();
for (const candidat of retenus) parJugement.set(candidat.jugement, (parJugement.get(candidat.jugement) ?? 0) + 1);
console.log(`\nCe que l'oracle dit des pavés retenus :`);
for (const [jugement, nombre] of [...parJugement].sort()) console.log(`  ${jugement} : ${nombre}`);
console.log(`\nLectures fausses que la sélection ne désigne pas (angle mort) : ${manques.length}`);
for (const manque of manques) console.log(`  élément ${manque.numero} : lu ${manque.lu}, oracle ${manque.oracle}`);

const cotes = retenus.flatMap((candidat) => [candidat.recadrage.l, candidat.recadrage.h]);
const poids = retenus.map((candidat) => candidat.octets);
const somme = (valeurs: number[]): number => valeurs.reduce((a, b) => a + b, 0);
if (retenus.length > 0) {
  console.log(`\nTaille des recadrages :`);
  console.log(`  côtés   : de ${Math.min(...cotes)} à ${Math.max(...cotes)} px`);
  console.log(`  poids   : de ${Math.min(...poids)} à ${Math.max(...poids)} octets, ${Math.round(somme(poids) / poids.length)} en moyenne`);
  console.log(`  total   : ${(somme(poids) / 1024).toFixed(1)} Kio pour ${retenus.length} pavés`);
  const parCliche = (dernier - premier + 1) === 0 ? 0 : retenus.length / (dernier - premier + 1);
  console.log(`\nÀ ce rythme, pour les 143 clichés du lot : environ ${Math.round(parCliche * 143)} pavés`);
  console.log(`  plafond déclaré par la recette : ${RECETTE.vision?.zones_max_par_lot} par lot, ${RECETTE.vision?.zones_max_par_page} par page`);
}

writeFileSync(
  join(sortie, "candidats.json"),
  JSON.stringify({ premier, dernier, elementsVus, retenus: retenus.map(({ octets, ...reste }) => ({ ...reste, octets })), manques }, null, 1),
);
writeFileSync(join(sortie, "paves.json"), JSON.stringify(paves));
console.log(`\nRecadrages, pavés en gris et relevé écrits dans ${sortie}`);
