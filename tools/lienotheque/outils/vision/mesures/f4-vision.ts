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
  appui,
  chargerRecette,
  clefDeVision,
  comparer,
  interpreter,
  lireLot,
  mediasDuDossier,
  preparerLot,
  type LectureParVision,
  type PageLue,
  supportsPresents,
} from "@lienotheque/recettes";
import {
  cacheDansDossier,
  candidatsDePage,
  entreesGardees,
  jetonDacces,
  margesSansLecture,
  relire,
  seContredisent,
  transportVersWorker,
  troisTemoins,
  type Candidat,
} from "../src/index.js";
import type { ElementRepere } from "@lienotheque/contrats";

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

const mediasPourSupports = await mediasDuDossier(join(RACINE, "fixtures/fichiers/F4"), RECETTE);
const supportsDuLot = supportsPresents(mediasPourSupports);

// Premier passage, sans relecture : il révèle les pistes dont plusieurs éléments portent un repère
// localisé. C'est la dispute, et elle ne se connaît pas avant d'avoir attribué une fois.
const dAbord = interpreter(lues, RECETTE, { nombreDePistes: mediasPourSupports.length, supports: supportsDuLot });
const repereLocalise = new Set<number>();
for (const page of lues) for (const element of page.elements) if (element.zoneRepere !== undefined) repereLocalise.add(element.numero);

const parPisteDAbord = new Map<string, number[]>();
for (const ligne of dAbord.lignes) {
  if (ligne.piste === undefined) continue;
  const clef = `${ligne.disque}/${ligne.piste}`;
  parPisteDAbord.set(clef, [...(parPisteDAbord.get(clef) ?? []), ligne.numero]);
}
const enDispute = new Set<number>();
for (const numeros of parPisteDAbord.values()) {
  const avecRepere = numeros.filter((numero) => repereLocalise.has(numero));
  if (avecRepere.length >= 2) for (const numero of avecRepere) enDispute.add(numero);
}
console.log(`Pavés en dispute, vus au premier passage : ${enDispute.size}`);

/** Sonder les marges là où un numéro d'élément manque : sur demande seulement.
 *
 *  Trois mesures, trois fois rien. La première visait tout le manque de F4 et l'a manqué ; la
 *  deuxième, restreinte aux trous de numérotation, a rendu 193 recadrages dont 83 refusés par le
 *  contrat — une bande de marge dépasse 1024 px au double — pour **zéro** élément et zéro page
 *  gagnés, et 18 numéros faux sur 151 jugeables : le modèle y lit des numéros de page.
 *
 *  La voie n'est donc pas fermée, elle est éteinte : `--marges` la rallume pour qui voudra la
 *  reprendre avec un recadrage plus étroit, et les chiffres ci-dessus disent ce qu'il faudra
 *  battre. */
const avecMargesDemandees = process.argv.includes("--marges");

/** Les pages où la numérotation lue montre un trou.
 *
 *  Un élément jamais lu ne se devine pas d'une page : il se devine d'un **saut** entre deux numéros
 *  lus. On ne sonde donc les marges que là, ce qui change tout l'ordre de grandeur — le détecteur
 *  rend 621 zones sur le lot sans ce filtre, et une poignée avec. */
const trouDeNumerotation = new Set<string>();
{
  const enOrdre = lues.map((page) => ({
    clef: `${page.index}/${page.cote ?? "—"}`,
    numeros: page.elements.map((element) => element.numero).sort((a, b) => a - b),
  }));
  let dernier: number | undefined;
  for (const page of enOrdre) {
    const manque =
      page.numeros.some((numero, rang) => rang > 0 && numero > page.numeros[rang - 1]! + 1) ||
      (dernier !== undefined && page.numeros.length > 0 && page.numeros[0]! > dernier + 1);
    if (manque) trouDeNumerotation.add(page.clef);
    if (page.numeros.length > 0) dernier = page.numeros[page.numeros.length - 1];
  }
}
console.log(`Pages où la numérotation montre un trou : ${trouDeNumerotation.size}`);

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
    { enDispute },
  );

  // Et les marges où aucun numéro n'a été lu, mais seulement là où la numérotation montre un
  // trou. Sans ce filtre le détecteur tire partout où une lecture manque — 621 zones sur le lot
  // au lieu d'une poignée —, et les numéros qu'il rendrait, injectés comme éléments, abîmeraient
  // la suite plus qu'ils ne la serviraient. Un trou dans les numéros lus, lui, dit qu'un élément
  // manque **là**.
  const marges = avecMargesDemandees && trouDeNumerotation.has(clef)
    ? margesSansLecture(
        {
          index: page.index,
          image: source,
          ...(page.cote === undefined ? {} : { cote: page.cote }),
          dejaLus: lue.elements.map((element) => ({ y: element.y, numero: element.numero })),
        },
        RECETTE,
        { maxParPage: RECETTE.vision?.zones_max_par_page ?? 6 },
      )
    : [];

  if (trouves.length + marges.length > 0) grises.set(clef, source);
  candidats.push(...trouves, ...marges);
}
const parQuestion = new Map<string, number>();
for (const candidat of candidats) parQuestion.set(candidat.cherche ?? "numero", (parQuestion.get(candidat.cherche ?? "numero") ?? 0) + 1);
console.log(
  `Rendu : ${Math.round((Date.now() - debutRendu) / 1000)} s — ${candidats.length} zones retenues ` +
    `(${[...parQuestion].map(([question, nombre]) => `${nombre} ${question}`).join(", ")})`,
);

const medias = mediasPourSupports;
const nombreDePistes = Math.max(1, medias.length, ...attendus.map((attendu) => attendu.piste));
const supports = supportsDuLot;
console.log(`Supports présents : ${[...supports].map(([support, pistes]) => `${support} (${pistes} pistes)`).join(", ")}`);

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
const verdicts = new Map<string, number>();
let nuls = 0;
/** Les numéros d'élément que les marges ont rendus : ils deviendront des éléments. */
const depuisLesMarges: { cliche: number; cote: string | undefined; y: number; numero: number; confiance: number }[] = [];

for (const relue of relecture.relues) {
  if (relue.candidat.cherche === "numero") {
    if (relue.zone.numero !== null)
      depuisLesMarges.push({
        cliche: relue.candidat.page,
        cote: relue.candidat.cote,
        // Le numéro factice du candidat porte sa place en millièmes : on la reprend.
        y: relue.candidat.numero / 1000,
        numero: relue.zone.numero,
        confiance: relue.zone.confiance,
      });
    else nuls += 1;
    continue;
  }
  const verdict = relue.zone.repere;
  if (verdict !== undefined) verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1);
  if (relue.zone.numero === null && verdict !== "absent") nuls += 1;
  vision.set(clefDeVision(relue.candidat.page, relue.candidat.cote, relue.candidat.numero), {
    ...(relue.zone.numero === null ? {} : { numero: relue.zone.numero }),
    confiance: relue.zone.confiance,
    ...(verdict === undefined ? {} : { repere: verdict }),
    outil: relue.outil,
  });
}
console.log(`Pavés relus : ${vision.size} ; illisibles déclarés : ${nuls}`);

// --- Troisième témoin : quand la lecture locale et la relecture se contredisent, on redemande sur
// un autre recadrage. Deux voix sur trois l'emportent ; sans majorité, rien n'est retenu.
const localeDe = new Map<number, number>();
for (const page of lues) for (const e of page.elements) if (e.pisteLue !== undefined) localeDe.set(e.numero, e.pisteLue);

const contestes = relecture.relues.filter(
  (relue) =>
    relue.candidat.cherche === "repere" &&
    relue.zone.numero !== null &&
    seContredisent(localeDe.get(relue.candidat.numero), relue.zone.numero, appui),
);
console.log(`\nContradictions entre lecture locale et relecture : ${contestes.length}`);

const AUTRE_ECHELLE = (RECETTE.vision?.agrandissement ?? 1) * 2;
let coutSecond = 0;
if (contestes.length > 0 && !process.argv.includes("--sans-troisieme")) {
  const seconde = await relire(
    contestes.map((relue) => relue.candidat),
    (candidat) => grises.get(`${candidat.page}/${candidat.cote ?? "—"}`),
    RECETTE,
    transportVersWorker(base, jeton),
    {
      cache: cacheDansDossier(coin(cache, `vision-reponses-x${AUTRE_ECHELLE}`)),
      attendu: { min: 1, max: nombreDePistes },
      agrandissement: AUTRE_ECHELLE,
    },
  );
  coutSecond = seconde.cout;
  console.log(
    `Second avis à ×${AUTRE_ECHELLE} : ${seconde.relues.length} pavés, ${seconde.appels} appel(s), ` +
      `${seconde.depuisLeCache} depuis le cache, ${seconde.cout.toFixed(4)} €`,
  );

  const second = new Map<number, number | null>();
  for (const relue of seconde.relues) second.set(relue.candidat.numero, relue.zone.numero);

  let tranchees = 0;
  let sansMajorite = 0;
  for (const relue of contestes) {
    const numero = relue.candidat.numero;
    const clef = clefDeVision(relue.candidat.page, relue.candidat.cote, numero);
    const verdict = troisTemoins([localeDe.get(numero), relue.zone.numero ?? undefined, second.get(numero) ?? undefined]);
    const avant = vision.get(clef);
    if (avant === undefined) continue;
    if (verdict.valeur === undefined) {
      // Sans majorité, on ne retient aucune lecture : l'élément n'apporte rien, et c'est à
      // Vérifier de le montrer.
      sansMajorite += 1;
      vision.set(clef, { confiance: avant.confiance, ...(avant.repere === undefined ? {} : { repere: avant.repere }), outil: avant.outil });
      continue;
    }
    tranchees += 1;
    vision.set(clef, { ...avant, numero: verdict.valeur });
  }
  console.log(`  tranchées par deux voix sur trois : ${tranchees} ; sans majorité, portées à Vérifier : ${sansMajorite}`);
}
console.log(`  verdicts : ${[...verdicts].sort().map(([verdict, nombre]) => `${nombre} ${verdict}`).join(", ") || "aucun"}`);
console.log(`Numéros rendus par les marges : ${depuisLesMarges.length}`);

/** Les lectures, augmentées des éléments que les marges ont révélés.
 *
 *  Un numéro d'élément lu dans une marge désigne un élément que la lecture locale n'avait pas vu :
 *  on l'ajoute, sans repère ni piste — c'est la suite qui lui en donnera une, ou pas. Sa confiance
 *  de numéro est celle du modèle, et reste donc sous le seuil tant que la séquence ne l'a pas
 *  corroboré (ANC-02). */
const augmentees: PageLue[] = lues.map((page) => {
  const ajouts = depuisLesMarges.filter(
    (marge) => marge.cliche === page.index && (marge.cote ?? "—") === (page.cote ?? "—"),
  );
  if (ajouts.length === 0) return page;
  const nouveaux: ElementRepere[] = ajouts.map((marge) => ({
    y: Math.round(marge.y * 1000) / 1000,
    numero: marge.numero,
    suite: false,
    presencePiste: 0,
    accordNumero: marge.confiance,
    accordPiste: 0,
  }));
  return { ...page, elements: [...page.elements, ...nouveaux].sort((a, b) => a.y - b.y || a.numero - b.numero) };
});

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

const resultat = interpreter(lues, RECETTE, { nombreDePistes, supports });
const avecVision = interpreter(lues, RECETTE, { nombreDePistes, supports, vision });
const avecMarges = interpreter(augmentees, RECETTE, { nombreDePistes, supports, vision });

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
const complet = score(avecMarges.lignes);
console.log(`\n${"".padEnd(26)}${"témoin".padStart(9)}${"+verdicts".padStart(11)}${"+marges".padStart(10)}${"critère".padStart(9)}`);
console.log(
  `${"Premiers éléments justes".padEnd(26)}${`${avant.elements}/92`.padStart(9)}${`${apres.elements}/92`.padStart(11)}` +
    `${`${complet.elements}/92`.padStart(10)}${"83".padStart(9)}`,
);
console.log(
  `${"Pages justes".padEnd(26)}${`${avant.pages}/92`.padStart(9)}${`${apres.pages}/92`.padStart(11)}` +
    `${`${complet.pages}/92`.padStart(10)}${"89".padStart(9)}`,
);
console.log(`\nCritère normatif (83 premiers éléments) : ${complet.elements >= 83 ? "TENU" : "NON TENU"}`);

// --- L'effet, cause par cause.
const premiersDe = (lignes: typeof resultat.lignes) => {
  const parPiste = new Map<number, number>();
  for (const ligne of lignes)
    if (ligne.piste !== undefined && ligne.disque === 1 && !parPiste.has(ligne.piste)) parPiste.set(ligne.piste, ligne.numero);
  return parPiste;
};
const causeDe = (lignes: typeof resultat.lignes): Map<number, string> => {
  const premiers = premiersDe(lignes);
  const parNumero = new Map(lignes.map((ligne) => [ligne.numero, ligne]));
  const causes = new Map<number, string>();
  for (const attendu of attendus) {
    if (premiers.get(attendu.piste) === attendu.premier) continue;
    const ligne = parNumero.get(attendu.premier);
    causes.set(
      attendu.piste,
      ligne === undefined
        ? "non lu"
        : ligne.piste === undefined
          ? "sans piste"
          : ligne.disque !== 1
            ? "hors support 1"
            : ligne.piste === attendu.piste
              ? "dispute"
              : "piste fausse",
    );
  }
  return causes;
};
const causesAvant = causeDe(resultat.lignes);
const causesApres = causeDe(avecMarges.lignes);
console.log(`\nEffet par cause :`);
for (const cause of ["dispute", "piste fausse", "non lu", "sans piste", "hors support 1"]) {
  const avant = [...causesAvant.values()].filter((valeur) => valeur === cause).length;
  const apres = [...causesApres.values()].filter((valeur) => valeur === cause).length;
  if (avant === 0 && apres === 0) continue;
  console.log(`  ${cause.padEnd(16)} ${String(avant).padStart(3)} → ${String(apres).padStart(3)}`);
}

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
  JSON.stringify(
    {
      avant,
      apres,
      complet,
      jetons: relecture.jetons,
      cout: relecture.cout,
      candidats: candidats.length,
      rendus: vision.size,
      verdicts: [...verdicts],
      marges: depuisLesMarges.length,
      appliquees: sourcesVision,
      causes: { avant: [...causesAvant], apres: [...causesApres] },
    },
    null,
    1,
  ),
);
