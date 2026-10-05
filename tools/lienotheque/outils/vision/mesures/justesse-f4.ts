/** Quelle échelle lit le mieux ? (OUT-08)
 *
 *  La mesure des jetons a dit ce que chaque échelle coûte. Celle-ci dit ce qu'elle vaut, et il n'y
 *  a pas d'autre façon de le savoir que de dépenser : on envoie les mêmes pavés à trois tailles et
 *  on confronte chaque nombre rendu à l'oracle.
 *
 *  Les réponses sont mises en cache par empreinte de recadrage, donc par échelle : relancer cette
 *  mesure ne dépense rien.
 *
 *     pnpm --filter @lienotheque/vision exec tsx mesures/justesse-f4.ts <url>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { agrandir, type ImageGrise } from "@lienotheque/images";
import { chargerRecette } from "@lienotheque/recettes";
import { cacheDansDossier, jetonDacces, relire, transportVersWorker, type Candidat } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_exercices.csv");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v5.json"), "utf8")));

const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (base === "") {
  console.log("Adresse du Worker attendue en premier argument.");
  process.exit(1);
}
const jeton = jetonDacces();
if (jeton === undefined) {
  console.log("Aucun jeton : ni dans l'environnement, ni dans le trousseau. Rien n'a été appelé.");
  process.exit(1);
}

const pisteDeLElement = new Map<number, number>();
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const [element, , piste] = ligne.split(",");
  if (Number.isFinite(Number(element)) && Number(piste) > 0) pisteDeLElement.set(Number(element), Number(piste));
}

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const releve = join(coin(cache, "vision-candidats"), "paves.json");
if (!existsSync(releve)) {
  console.log("Pavés absents : lancez d'abord la sélection (mesures/candidats-f4.ts).");
  process.exit(1);
}

type Pave = { numero: number; cliche: number; cote: string; motif: string; largeur: number; hauteur: number; pixels: string };
const paves = JSON.parse(readFileSync(releve, "utf8")) as Pave[];
const imageDe = (pave: Pave): ImageGrise => ({
  largeur: pave.largeur,
  hauteur: pave.hauteur,
  pixels: new Uint8Array(Buffer.from(pave.pixels, "base64")),
});

console.log(`Pavés : ${paves.length}, tous connus de l'oracle : ${paves.every((pave) => pisteDeLElement.has(pave.numero))}`);
console.log(`Worker : ${base}\n`);

const transport = transportVersWorker(base, jeton);
type Releve = { echelle: number; justes: number; nuls: number; faux: { numero: number; lu: number; oracle: number }[]; cout: number; jetons: { entree: number; sortie: number } };
const releves: Releve[] = [];

for (const echelle of [1, 2, 4] as const) {
  // Un cache par échelle : l'empreinte est celle de l'image, qui diffère d'une taille à l'autre.
  const dossier = coin(cache, `vision-reponses-x${echelle}`);
  const images = new Map<number, ImageGrise>();
  const candidats: Candidat[] = paves.map((pave) => {
    const image = echelle === 1 ? imageDe(pave) : agrandir(imageDe(pave), echelle);
    images.set(pave.numero, image);
    return {
      page: pave.cliche,
      ...(pave.cote === "—" ? {} : { cote: pave.cote as "gauche" | "droite" }),
      numero: pave.numero,
      motif: pave.motif === "sans_lecture" ? "sans_lecture" : "lecture_incomplete",
      repere: { x: 0, y: 0, l: image.largeur, h: image.hauteur },
      recadrage: { x: 0, y: 0, l: image.largeur, h: image.hauteur },
    };
  });

  const vue = await relire(candidats, (candidat) => images.get(candidat.numero), RECETTE, transport, { cache: cacheDansDossier(dossier) });

  let justes = 0;
  let nuls = 0;
  const faux: { numero: number; lu: number; oracle: number }[] = [];
  for (const relue of vue.relues) {
    const oracle = pisteDeLElement.get(relue.candidat.numero)!;
    if (relue.zone.numero === null) {
      nuls += 1;
      continue;
    }
    if (relue.zone.numero === oracle) justes += 1;
    else faux.push({ numero: relue.candidat.numero, lu: relue.zone.numero, oracle });
  }

  releves.push({ echelle, justes, nuls, faux, cout: vue.cout, jetons: vue.jetons });
  console.log(
    `×${echelle} : ${justes} justes / ${paves.length}, ${nuls} déclarés illisibles, ${faux.length} faux — ` +
      `${vue.appels} appel(s), ${vue.depuisLeCache} depuis le cache, ${vue.jetons.entree}+${vue.jetons.sortie} jetons, ${vue.cout.toFixed(4)} €`,
  );
  for (const erreur of faux) console.log(`      élément ${erreur.numero} : lu ${erreur.lu}, oracle ${erreur.oracle}`);
}

const total = releves.reduce((somme, releve) => somme + releve.cout, 0);
const sortieParZone = releves.map((releve) => releve.jetons.sortie / Math.max(1, paves.length));
console.log(`\nCoût réel de cette mesure : ${total.toFixed(4)} €`);
console.log(`Jetons de sortie par pavé, mesurés : ${sortieParZone.map((valeur) => valeur.toFixed(1)).join(", ")} (la projection en majorait 40)`);

const meilleur = [...releves].sort((a, b) => b.justes - a.justes || a.cout - b.cout)[0]!;
console.log(`\nMeilleure justesse : ×${meilleur.echelle} avec ${meilleur.justes} / ${paves.length}.`);
if (releves.filter((releve) => releve.justes === meilleur.justes).length > 1)
  console.log(`  À égalité de justesse, la moins chère l'emporte.`);

writeFileSync(join(coin(cache, "vision"), "justesse-f4.json"), JSON.stringify({ paves: paves.length, releves }, null, 1));
