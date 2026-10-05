/** F4 relu par la vision ciblée : le critère, le coût, et ce qui reste (OUT-08, A5).
 *
 *  Le banc complet. Les lectures viennent du cache — elles ne changent pas —, les pages sont
 *  rendues à nouveau pour leurs pixels en gris, les pavés douteux partent au Worker, et
 *  l'interprétation reçoit ce qui en revient. On compare ensuite à l'oracle, exactement comme
 *  « f4-complet.ts », pour que les deux chiffres soient comparables.
 *
 *  Rien ne part sans jeton, et le jeton vient de l'environnement. Sans lui, la mesure s'arrête en
 *  le disant plutôt que d'appeler quoi que ce soit.
 *
 *     LIENOTHEQUE_JETON=… pnpm --filter @lienotheque/vision exec tsx mesures/f4-vision.ts <url> [premier] [dernier]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import type { ImageGrise } from "@lienotheque/images";
import {
  chargerRecette,
  clefDeVision,
  comparer,
  interpreter,
  lireLot,
  mediasDuDossier,
  preparerLot,
  type LectureParVision,
  type PageLue,
} from "@lienotheque/recettes";
import { cacheDansDossier, candidatsDePage, entreesGardees, jetonDeLEnvironnement, relire, transportVersWorker, type Candidat } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_CD1_pistes.csv");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v5.json"), "utf8")));

const base = process.argv[2];
const nombres = process.argv.slice(3).map(Number);
const premier = nombres[0] ?? 0;
const dernier = nombres[1] ?? Number.MAX_SAFE_INTEGER;

if (base === undefined) {
  console.log("Adresse du Worker attendue en premier argument.");
  process.exit(1);
}
const jeton = jetonDeLEnvironnement();
if (jeton === undefined) {
  console.log("Aucun jeton dans l'environnement : posez LIENOTHEQUE_JETON. Rien n'a été appelé.");
  process.exit(0);
}
if (!existsSync(F4) || !existsSync(ORACLE)) {
  console.log("Clichés ou oracle absents : rien à mesurer ici.");
  process.exit(0);
}

type Attendu = { piste: number; premier: number; page: number };
const attendus: Attendu[] = [];
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const champs = ligne.split(",");
  if (champs.length < 7) continue;
  const piste = Number(champs[0]);
  const premierElement = Number(champs[4]);
  const page = Number(champs[6]);
  if (Number.isFinite(piste) && Number.isFinite(premierElement) && piste > 0) attendus.push({ piste, premier: premierElement, page });
}
console.log(`Oracle : ${attendus.length} pistes`);

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const lectures = coin(cache, "lectures");
const cacheVision = coin(cache, "vision-reponses");

// Les lectures, depuis le cache : elles ne dépendent pas de la relecture, et les refaire
// coûterait une heure pour rien.
const debutLecture = Date.now();
const lues = await lireLot(F4, RECETTE, { cache: lectures, ...(dernier === Number.MAX_SAFE_INTEGER ? {} : { pages: dernier + 1 }) });
console.log(`Lecture : ${lues.length} pages en ${Math.round((Date.now() - debutLecture) / 1000)} s`);

const parPage = new Map<string, PageLue>();
for (const page of lues) parPage.set(`${page.index}/${page.cote ?? "—"}`, page);

// Les pages à nouveau, pour leurs pixels en gris. Aucun OCR ici : seulement le rendu et le
// redressement, c'est-à-dire la part la moins chère de la lecture.
const debutRendu = Date.now();
const candidats: Candidat[] = [];
const grises = new Map<string, ImageGrise>();
for await (const page of preparerLot(F4, RECETTE, { ...(dernier === Number.MAX_SAFE_INTEGER ? {} : { pages: dernier + 1 }) })) {
  if (page.index < premier || page.index > dernier) continue;
  const clef = `${page.index}/${page.cote ?? "—"}`;
  const lue = parPage.get(clef);
  if (lue === undefined) continue;

  const source = page.grise ?? page.image;
  const trouves = candidatsDePage(
    {
      index: page.index,
      image: source,
      ...(page.cote === undefined ? {} : { cote: page.cote }),
      elements: lue.elements.map((element) => ({
        numero: element.numero,
        y: element.y,
        ...(element.zoneRepere === undefined ? {} : { zoneRepere: element.zoneRepere }),
        ...(element.pisteLue === undefined ? {} : { pisteLue: element.pisteLue }),
        ...(element.chiffresComptes === undefined ? {} : { chiffresComptes: element.chiffresComptes }),
      })),
    },
    RECETTE,
  );
  if (trouves.length > 0) grises.set(clef, source);
  candidats.push(...trouves);
}
console.log(`Rendu : ${Math.round((Date.now() - debutRendu) / 1000)} s — ${candidats.length} pavés retenus`);

const medias = await mediasDuDossier(join(RACINE, "fixtures/fichiers/F4"), RECETTE);
const nombreDePistes = Math.max(1, medias.length, ...attendus.map((attendu) => attendu.piste));

const gardeesAvant = entreesGardees(cacheVision);
const debutRelecture = Date.now();
const relecture = await relire(
  candidats,
  (candidat) => grises.get(`${candidat.page}/${candidat.cote ?? "—"}`),
  RECETTE,
  transportVersWorker(base, jeton),
  { cache: cacheDansDossier(cacheVision), attendu: { min: 1, max: nombreDePistes } },
);
console.log(
  `Relecture : ${relecture.relues.length} pavés en ${Math.round((Date.now() - debutRelecture) / 1000)} s, ` +
    `${relecture.appels} appel(s), ${relecture.depuisLeCache} depuis le cache (${gardeesAvant} entrées gardées avant)`,
);
console.log(`Jetons : ${relecture.jetons.entree} en entrée, ${relecture.jetons.sortie} en sortie`);
const dollars = (relecture.jetons.entree / 1e6) * 1 + (relecture.jetons.sortie / 1e6) * 5;
console.log(`Coût au tarif affiché de Haiku 4.5 : ${dollars.toFixed(4)} $`);
if (relecture.nonRelus.length > 0) {
  const parRaison = new Map<string, number>();
  for (const reste of relecture.nonRelus) parRaison.set(reste.raison, (parRaison.get(reste.raison) ?? 0) + 1);
  console.log(`Non relus : ${[...parRaison].map(([raison, nombre]) => `${nombre} (${raison})`).join(", ")}`);
}

const vision = new Map<string, LectureParVision>();
let nuls = 0;
for (const relue of relecture.relues) {
  if (relue.zone.numero === null) {
    nuls += 1;
    continue;
  }
  vision.set(clefDeVision(relue.candidat.page, relue.candidat.cote, relue.candidat.numero), {
    numero: relue.zone.numero,
    confiance: relue.zone.confiance,
    outil: relue.outil,
  });
}
console.log(`Numéros rendus : ${vision.size} ; illisibles déclarés : ${nuls}`);

const resultat = interpreter(lues, RECETTE, { nombreDePistes });
const avecVision = interpreter(lues, RECETTE, { nombreDePistes, vision });

const score = (lignes: typeof resultat.lignes) => {
  const parPiste = new Map<number, { numero: number; page: number }>();
  for (const ligne of lignes) if (ligne.piste !== undefined && !parPiste.has(ligne.piste)) parPiste.set(ligne.piste, { numero: ligne.numero, page: ligne.pageImprimee });
  let elements = 0;
  let pages = 0;
  for (const attendu of attendus) {
    const obtenu = parPiste.get(attendu.piste);
    if (obtenu === undefined) continue;
    if (obtenu.numero === attendu.premier) elements += 1;
    if (obtenu.page === attendu.page) pages += 1;
  }
  return { elements, pages };
};

const avant = score(resultat.lignes);
const apres = score(avecVision.lignes);
console.log(`\n${"".padEnd(28)}${"avant".padStart(10)}${"après".padStart(10)}${"critère".padStart(10)}`);
console.log(`${"Premiers éléments justes".padEnd(28)}${`${avant.elements} / 92`.padStart(10)}${`${apres.elements} / 92`.padStart(10)}${"83".padStart(10)}`);
console.log(`${"Pages justes".padEnd(28)}${`${avant.pages} / 92`.padStart(10)}${`${apres.pages} / 92`.padStart(10)}${"89".padStart(10)}`);
console.log(`Critère tenu : ${apres.elements >= 83 && apres.pages >= 89 ? "OUI" : "NON"}`);

const sourcesVision = avecVision.lignes.filter((ligne) => ligne.sourcePiste === "vision").length;
console.log(`\nPistes appliquées par relecture : ${sourcesVision} / ${vision.size} rendues — les autres n'ont pas été corroborées.`);

writeFileSync(
  join(coin(cache, "vision"), "f4-vision.json"),
  JSON.stringify({ avant, apres, jetons: relecture.jetons, dollars, candidats: candidats.length, rendus: vision.size, appliquees: sourcesVision }, null, 1),
);
