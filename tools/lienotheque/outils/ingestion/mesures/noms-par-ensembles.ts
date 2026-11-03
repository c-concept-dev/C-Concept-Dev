/** Ce qu'un nom désigne : un enregistrement, ou **l'ensemble** de ceux qui portent le même mot ?
 *
 *  ## La question, et pourquoi elle n'est pas une question de seuil
 *
 *  La règle en place exige qu'un mot n'appartienne qu'à **un seul** nom du vivier. Elle a été
 *  écrite contre les pages de sommaire, qui portent tous les noms et n'en désignent aucun, et
 *  elle a raison sur ce point. Mais elle juge la distinction **au niveau du nom**, alors que ce
 *  qu'une page désigne n'est pas toujours un enregistrement : un même morceau peut en avoir deux,
 *  une démonstration et un accompagnement, qui partagent exactement le même titre. La règle les
 *  élimine l'un par l'autre, et le titre imprimé en gros sur la page — la seule chose qui relie
 *  ce document à son audio — ne sert à rien.
 *
 *  La règle éprouvée ici ne change pas de seuil : elle change d'**unité**. Un mot désigne
 *  l'ensemble des noms qui le portent. Cet ensemble est ce que la page retrouve.
 *
 *  | ensemble désigné | ce qu'on en fait |
 *  |---|---|
 *  | un seul nom | un lien candidat, comme aujourd'hui |
 *  | quelques noms | autant de liens candidats, et l'ambiguïté est **dite**, pas cachée |
 *  | **tout le vivier** | rien : désigner tout, c'est ne désigner personne |
 *
 *  Et une page ne tranche que si les ensembles qu'elle porte sont **emboîtés** — le plus petit
 *  inclus dans tous les autres. Deux ensembles disjoints sur une même page, c'est un sommaire, et
 *  la page ne désigne rien : exactement ce que la règle actuelle obtient, par un autre chemin.
 *
 *  Ce banc ne modifie rien. Il lit le texte une fois, le garde, et compte des deux façons.
 *
 *  Usage : noms-par-ensembles.ts <dossier des enregistrements> <document.pdf> <cache.json>
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accordsNomContenu, designationsDesNoms } from "@lienotheque/noyau";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

const MOTEURS = realpathSync(
  "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-main-fusion-wt/tools/lienotheque/apps/app/src-tauri/moteurs",
);
const LARGEUR_DE_RENDU = 1800;
const CARACTERES_DU_JETON = 4;

const dossier = process.argv[2]!;
const pdf = process.argv[3]!;
const cache = process.argv[4]!;

const noms = readdirSync(dossier)
  .filter((nom) => /\.mp3$/iu.test(nom))
  .sort();
console.log(`document : ${pdf.split("/").pop()}`);
console.log(`vivier   : ${noms.length} enregistrement(s)\n`);

// ── Le texte, lu une fois et gardé ──────────────────────────────────────────────────────
type ContenuDePage = { page: number; texte: string };
let contenus: ContenuDePage[];
if (existsSync(cache)) {
  contenus = JSON.parse(readFileSync(cache, "utf8")) as ContenuDePage[];
  console.log(`texte : ${contenus.length} page(s), relues depuis ${cache.split("/").pop()}`);
} else {
  const couche = await lireCoucheTexte(pdf);
  const rendu = await ouvrirRenduPdf(pdf);
  const parRang = new Map(couche.pages.map((page) => [page.index, page]));
  const bac = mkdtempSync(join(tmpdir(), "lienotheque-ensembles-"));
  contenus = [];
  let ocerisees = 0;
  try {
    for (let rang = 1; rang <= rendu.nombreDePages; rang += 1) {
      const deLaCouche = parRang.get(rang);
      let page = deLaCouche !== undefined && coucheSuffisante(deLaCouche) ? deLaCouche : undefined;
      if (page === undefined) {
        page = ocrDUnePageGrise(enGris(await rendu.page(rang, LARGEUR_DE_RENDU)), rang, bac, {
          binaire: join(MOTEURS, "bin/tesseract"),
          tessdata: join(MOTEURS, "tessdata"),
        });
        ocerisees += 1;
      }
      contenus.push({ page: rang, texte: page.mots.map((mot) => mot.texte).join(" ") });
    }
  } finally {
    rmSync(bac, { recursive: true, force: true });
    await rendu.fermer();
  }
  writeFileSync(cache, JSON.stringify(contenus));
  console.log(`texte : ${contenus.length} page(s), dont ${ocerisees} par reconnaissance — gardé`);
}

// ── Ce que la règle en place trouve ─────────────────────────────────────────────────────
const marques = designationsDesNoms(noms);
const accordsActuels = accordsNomContenu(marques, contenus);
const sansJeton = marques.filter(({ jetons }) => jetons.length === 0).length;
const parRangActuel = new Map<number, number[]>();
for (const accord of accordsActuels)
  for (const rang of accord.rangs) parRangActuel.set(rang, [...(parRangActuel.get(rang) ?? []), accord.page]);
console.log(`\n══ règle en place ══`);
console.log(`  ${sansJeton} nom(s) sans aucun jeton distinctif sur ${noms.length}`);
console.log(`  ${accordsActuels.length} accord(s), ${parRangActuel.size} enregistrement(s) situé(s)`);

// ── Ce que la règle par ensembles trouverait ────────────────────────────────────────────
const normaliser = (texte: string): string =>
  texte
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();
const NOMBRE_COMPOSE = /\b\d{1,3}[.-]\d{1,3}\b/gu;
const corpsDuNom = (nom: string): string => nom.replace(/\.[^.]+$/u, "");
const apresLAdresse = (corps: string): string => {
  const lettre = corps.search(/\p{L}/u);
  return lettre === -1 ? "" : corps.slice(lettre);
};

/** Au plus combien de mots dans une suite. Assez pour « two part invention 4 », pas assez pour
 *  qu'un nom de quarante mots en engendre mille. */
const MOTS_DE_LA_SUITE = 6;

/** Ce qu'un nom dit, en **suites de mots** et non en mots isolés.
 *
 *  Un mot isolé garde la règle d'aujourd'hui — au moins quatre caractères et une lettre : seul,
 *  un nombre ne désigne rien, et un mot de trois lettres tombe par hasard. Une **suite** de deux
 *  mots ou plus est reçue telle quelle, quels que soient ses mots : « invention 4 » n'est pas le
 *  nombre quatre, c'est le nom de la pièce, et c'est imprimé ainsi sur la page. */
const jetonsDuNom = (nom: string): readonly string[] => {
  const corps = apresLAdresse(corpsDuNom(nom));
  const composes = (corps.match(NOMBRE_COMPOSE) ?? []).map((brut) => brut.replace("-", "."));
  const mots = normaliser(corps).split(" ").filter((mot) => mot !== "");
  const suites: string[] = mots.filter((mot) => mot.length >= CARACTERES_DU_JETON && /[a-z]/u.test(mot));
  for (let depart = 0; depart < mots.length; depart += 1)
    for (let combien = 2; combien <= MOTS_DE_LA_SUITE && depart + combien <= mots.length; combien += 1)
      suites.push(mots.slice(depart, depart + combien).join(" "));
  return [...new Set([...composes, ...suites])];
};

/** Quel ensemble de noms chaque jeton désigne. */
const porteurs = new Map<string, number[]>();
noms.forEach((nom, rang) => {
  for (const jeton of jetonsDuNom(nom)) porteurs.set(jeton, [...(porteurs.get(jeton) ?? []), rang]);
});
/** Désigner tout le vivier, c'est ne désigner personne. */
const informatifs = new Map([...porteurs].filter(([, ensemble]) => ensemble.length < noms.length));

const cle = (ensemble: readonly number[]): string => [...ensemble].sort((un, autre) => un - autre).join(",");
const inclus = (petit: readonly number[], grand: readonly number[]): boolean => {
  const dedans = new Set(grand);
  return petit.every((rang) => dedans.has(rang));
};

type Designation = { page: number; ensemble: readonly number[]; jetons: readonly string[] };
const designations: Designation[] = [];
let contradictions = 0;
for (const { page, texte } of contenus) {
  const normalise = ` ${normaliser(texte)} `;
  const composes = new Set((texte.match(NOMBRE_COMPOSE) ?? []).map((brut) => brut.replace("-", ".")));
  const vus = [...informatifs].filter(([jeton]) => (composes.has(jeton) ? true : normalise.includes(` ${jeton} `)));
  if (vus.length === 0) continue;
  const ensembles = vus.map(([, ensemble]) => ensemble).sort((un, autre) => un.length - autre.length);
  const plusPetit = ensembles[0]!;
  // Emboîtés : le plus petit est inclus dans tous les autres. Sinon la page porte deux choses
  // sans rapport — un sommaire — et elle ne désigne rien.
  if (!ensembles.every((ensemble) => inclus(plusPetit, ensemble))) {
    contradictions += 1;
    continue;
  }
  designations.push({
    page,
    ensemble: plusPetit,
    jetons: vus.filter(([, ensemble]) => cle(ensemble) === cle(plusPetit)).map(([jeton]) => jeton),
  });
}

// ── Une désignation large est dominée par une désignation étroite ───────────────────────
//
// Faute relevée sur un document où deux fichiers servent un même morceau : une page portant le
// mot « play » désignait les neuf accompagnements à la fois. Désignation vraie, mais large — et
// elle entrait dans le test d'ordre au même titre qu'une désignation d'un seul fichier, qu'elle
// faisait échouer.
//
// Le critère n'est pas un seuil sur la taille : c'est **l'inclusion**. Un ensemble qui en
// contient strictement un autre, désigné ailleurs dans le même document, ne dit rien de plus que
// lui ; il est dominé et sort. Rien à régler, rien à choisir : le document décide.
const tousLesEnsembles = [...new Map(designations.map(({ ensemble }) => [cle(ensemble), ensemble])).values()];
const domine = (ensemble: readonly number[]): boolean =>
  tousLesEnsembles.some((autre) => autre.length < ensemble.length && inclus(autre, ensemble));
const retenues = designations.filter(({ ensemble }) => !domine(ensemble));
const dominees = designations.length - retenues.length;

const pagesParEnsemble = new Map<string, { ensemble: readonly number[]; pages: number[] }>();
for (const { page, ensemble } of retenues) {
  const clef = cle(ensemble);
  const deja = pagesParEnsemble.get(clef);
  if (deja === undefined) pagesParEnsemble.set(clef, { ensemble, pages: [page] });
  else deja.pages.push(page);
}
const situes = new Set<number>();
for (const { ensemble } of pagesParEnsemble.values()) for (const rang of ensemble) situes.add(rang);
const uneSeulePage = [...pagesParEnsemble.values()].filter(({ pages }) => pages.length === 1);
const candidats = uneSeulePage.reduce((somme, { ensemble }) => somme + ensemble.length, 0);

console.log(`\n══ règle par ensembles ══`);
console.log(`  ${informatifs.size} jeton(s) informatif(s) sur ${porteurs.size}`);
console.log(`  ${designations.length} page(s) qui désignent, ${contradictions} page(s) à ensembles disjoints (sommaires)`);
console.log(`  ${dominees} désignation(s) large(s) dominée(s) par une plus étroite`);
console.log(`  ${situes.size} enregistrement(s) situé(s) sur ${noms.length}`);
console.log(`  ${uneSeulePage.length} ensemble(s) retrouvé(s) sur une seule page → ${candidats} lien(s) candidat(s)`);
for (const { page, ensemble, jetons } of retenues.slice(0, 40))
  console.log(
    `  page ${String(page).padStart(3)} → {${ensemble.map((rang) => noms[rang]!.slice(0, 34)).join(" | ")}}  (${jetons.join(", ")})`,
  );
if (designations.length > 40) console.log(`  … ${designations.length - 40} autre(s)`);

// ── L'ordre, jugé par la plus longue montée et non par tout ou rien ─────────────────────
//
// « Les pages suivent-elles le rang des enregistrements, oui ou non ? » s'éteint dès la première
// anomalie, et ne dit jamais laquelle. La plus longue montée dit les deux : ce qui tient, et ce
// qui en sort. C'est le même signe que celui qui nomme une cellule aberrante dans une table —
// il ne suppose rien, il lit ce que la suite dit d'elle-même.
const placesDeLaPlusLongueMontee = (valeurs: readonly number[]): ReadonlySet<number> => {
  const longueur = valeurs.map(() => 1);
  const precedente = valeurs.map(() => -1);
  for (const [place, valeur] of valeurs.entries())
    for (let avant = 0; avant < place; avant += 1)
      if (valeurs[avant]! <= valeur && longueur[avant]! + 1 > longueur[place]!) {
        longueur[place] = longueur[avant]! + 1;
        precedente[place] = avant;
      }
  if (valeurs.length === 0) return new Set();
  let fin = 0;
  for (const [place, combien] of longueur.entries()) if (combien > longueur[fin]!) fin = place;
  const gardees = new Set<number>();
  for (let place = fin; place !== -1; place = precedente[place]!) gardees.add(place);
  return gardees;
};

const ordonnees = [...pagesParEnsemble.values()]
  .map(({ ensemble, pages }) => ({ ensemble, premier: Math.min(...ensemble), page: Math.min(...pages) }))
  .sort((un, autre) => un.premier - autre.premier);
const dansLaMontee = placesDeLaPlusLongueMontee(ordonnees.map(({ page }) => page));
const hors = ordonnees.filter((_, place) => !dansLaMontee.has(place));
console.log(
  `  ordre : ${dansLaMontee.size} désignation(s) sur ${ordonnees.length} tiennent dans la plus longue montée`,
);
for (const { ensemble, page } of hors)
  console.log(`    hors montée : page ${page} → {${ensemble.map((rang) => noms[rang]!.slice(0, 34)).join(" | ")}}`);
