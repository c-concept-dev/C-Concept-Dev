/** F4 relu par la vision ciblée : le critère, le coût, et ce qui reste (OUT-08, A5).
 *
 *  Le banc complet. Les lectures viennent du cache — elles ne changent pas —, les pages sont
 *  rendues à nouveau pour leurs pixels en gris, les pavés douteux partent au Worker, et
 *  l'interprétation reçoit ce qui en revient. On compare ensuite à l'oracle, exactement comme
 *  « f4-complet.ts », pour que les deux chiffres soient comparables.
 *
 *  Rien ne part sans jeton. Il est lu au moment de l'appel — environnement d'abord, trousseau du
 *  système ensuite — et sans lui la mesure s'arrête en le disant plutôt que d'appeler quoi que ce
 *  soit.
 *
 *     pnpm --filter @lienotheque/vision exec tsx mesures/f4-vision.ts <url> [premier] [dernier]
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
import { cacheDansDossier, candidatsDePage, entreesGardees, jetonDacces, relire, transportVersWorker, type Candidat } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_CD1_pistes.csv");
/** L'autre oracle : par élément, la piste qu'il porte. Il sert à juger chaque numéro rendu. */
const ORACLE_ELEMENTS = join(RACINE, "docs/prototypes/Westwood_Vol1_exercices.csv");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v5.json"), "utf8")));

const base = process.argv[2];
const nombres = process.argv.slice(3).map(Number);
const premier = nombres[0] ?? 0;
const dernier = nombres[1] ?? Number.MAX_SAFE_INTEGER;

if (base === undefined) {
  console.log("Adresse du Worker attendue en premier argument.");
  process.exit(1);
}
const jeton = jetonDacces();
if (jeton === undefined) {
  console.log("Aucun jeton : ni dans l'environnement, ni dans le trousseau. Rien n'a été appelé.");
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
console.log(`Coût réel, compté sur les jetons rapportés : ${relecture.cout.toFixed(4)} € (plafond ${RECETTE.vision?.cout_max_eur ?? "aucun"})`);
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

// --- Ce que les numéros rendus valent, élément par élément.
const pisteDeLElement = new Map<number, number>();
for (const ligne of readFileSync(ORACLE_ELEMENTS, "utf8").split("\n").slice(1)) {
  const [element, , piste] = ligne.split(",");
  if (Number.isFinite(Number(element)) && Number(piste) > 0) pisteDeLElement.set(Number(element), Number(piste));
}

let jugesJustes = 0;
let jugesFaux = 0;
let jugesInconnus = 0;
const fauxRendus: { numero: number; lu: number; oracle: number; motif: string }[] = [];
const nulsJuges = { connus: 0, inconnus: 0 };
for (const relue of relecture.relues) {
  const oracle = pisteDeLElement.get(relue.candidat.numero);
  if (relue.zone.numero === null) {
    if (oracle === undefined) nulsJuges.inconnus += 1;
    else nulsJuges.connus += 1;
    continue;
  }
  if (oracle === undefined) jugesInconnus += 1;
  else if (relue.zone.numero === oracle) jugesJustes += 1;
  else {
    jugesFaux += 1;
    fauxRendus.push({ numero: relue.candidat.numero, lu: relue.zone.numero, oracle, motif: relue.candidat.motif });
  }
}
console.log(`\nCe que l'oracle dit des numéros rendus : ${jugesJustes} justes, ${jugesFaux} faux, ${jugesInconnus} sur des éléments qu'il ignore`);
console.log(`Illisibles déclarés : ${nulsJuges.connus} sur des éléments que l'oracle connaît, ${nulsJuges.inconnus} sur des éléments qu'il ignore`);
for (const faux of fauxRendus.slice(0, 20)) console.log(`  élément ${faux.numero} (${faux.motif}) : lu ${faux.lu}, oracle ${faux.oracle}`);
if (fauxRendus.length > 20) console.log(`  … et ${fauxRendus.length - 20} autres`);

// Le détail par élément, pour qu'un diagnostic puisse repartir de là sans rien redépenser.
writeFileSync(
  join(coin(cache, "vision"), "f4-vision-map.json"),
  JSON.stringify(
    relecture.relues.map((relue) => ({
      cliche: relue.candidat.page,
      cote: relue.candidat.cote ?? "—",
      numero: relue.candidat.numero,
      motif: relue.candidat.motif,
      lu: relue.zone.numero,
      confiance: relue.zone.confiance,
    })),
  ),
);

const resultat = interpreter(lues, RECETTE, { nombreDePistes });
const avecVision = interpreter(lues, RECETTE, { nombreDePistes, vision });

/** Le critère porte sur le premier support : l'oracle est celui de CD1, et une piste 50 du
 *  deuxième disque n'est pas la piste 50 de l'oracle.
 *
 *  Ce filtre manquait, ici et dans `f4-complet.ts`, et son absence rendait les chiffres de F4
 *  dépendants de l'endroit où la coupure de support tombait — une coupure qui déplaçait des
 *  éléments d'un disque à l'autre changeait le score sans que rien ne le dise. Les mesures
 *  antérieures de F4 confondaient donc les deux disques. */
const score = (lignes: typeof resultat.lignes) => {
  const parPiste = new Map<number, { numero: number; page: number }>();
  for (const ligne of lignes)
    if (ligne.piste !== undefined && ligne.disque === 1 && !parPiste.has(ligne.piste))
      parPiste.set(ligne.piste, { numero: ligne.numero, page: ligne.pageImprimee });
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

// --- Et ce que la relecture a changé, ligne par ligne : ce qu'elle redresse et ce qu'elle abîme.
const pisteAvant = new Map(resultat.lignes.map((ligne) => [ligne.numero, ligne.piste]));
let redressees = 0;
let abimees = 0;
const degats: { numero: number; avant: number | undefined; apres: number | undefined; oracle: number }[] = [];
for (const ligne of avecVision.lignes) {
  const oracle = pisteDeLElement.get(ligne.numero);
  if (oracle === undefined) continue;
  const avantPiste = pisteAvant.get(ligne.numero);
  if (avantPiste === ligne.piste) continue;
  if (ligne.piste === oracle) redressees += 1;
  else if (avantPiste === oracle) {
    abimees += 1;
    degats.push({ numero: ligne.numero, avant: avantPiste, apres: ligne.piste, oracle });
  }
}
console.log(`\nÉléments que la relecture déplace : ${redressees} redressés, ${abimees} abîmés`);
for (const degat of degats.slice(0, 20)) console.log(`  élément ${degat.numero} : ${degat.avant} → ${degat.apres}, oracle ${degat.oracle}`);
if (degats.length > 20) console.log(`  … et ${degats.length - 20} autres`);

writeFileSync(
  join(coin(cache, "vision"), "f4-vision.json"),
  JSON.stringify({ avant, apres, jetons: relecture.jetons, cout: relecture.cout, candidats: candidats.length, rendus: vision.size, appliquees: sourcesVision }, null, 1),
);
