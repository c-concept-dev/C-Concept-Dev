/** Quels nombres les noms d'un vivier portent, et lesquels pourraient désigner une page.
 *
 *  **Sans aucun motif en dur.** Un nom de fichier porte des nombres ; on ne sait pas d'avance ce
 *  qu'ils désignent, et chercher « Pg. » serait calibrer sur un éditeur. On relève donc, pour
 *  chaque **place** où un nombre apparaît dans les noms d'un même vivier, la suite de ses valeurs
 *  — et on demande à cette suite si elle se comporte comme une pagination.
 *
 *  Trois propriétés, et aucune n'est un seuil choisi :
 *
 *  - **elle monte** avec l'ordre des enregistrements, sans jamais redescendre. C'est la seule
 *    qui ait survécu.
 *
 *  Deux autres avaient été écrites, et **toutes deux sont fausses** :
 *
 *  - « ses valeurs sont distinctes » : deux enregistrements **peuvent** être sur la même page, et
 *    ils le sont. Mesuré sur un vivier réel — deux pistes consécutives y portent le même numéro
 *    imprimé. Cette propriété décrit un **rang de piste**, pas une page ;
 *  Une troisième avait été écrite — « elle tient dans le document : aucune valeur au-delà du
 *  nombre de feuilles » — et elle est **fausse**. Elle compare un numéro **imprimé** à un compte
 *  de **feuilles**, et rejette donc exactement les documents où ce signal sert : un recueil dont
 *  les noms annoncent « page 67 » à « page 196 » sur cinquante-sept feuilles numérisées est le
 *  cas même qu'on cherche, pas un cas à écarter. Mesuré sur un vivier réel le 6 novembre 2026.
 *  Ce qui doit trancher, ce sont les **folios lus**, et rien d'autre.
 *
 *  Une place se compte **depuis le début du nom et depuis sa fin**, et les deux comptent. Mesuré
 *  le 6 novembre 2026 : un vivier dont les titres portent eux-mêmes des nombres n'a pas le même
 *  nombre de nombres d'un nom à l'autre — « 12_8 Blues » en ajoute deux —, et la page, toujours
 *  dernière, change alors de rang depuis le début. Compter depuis la fin ne suppose rien de plus
 *  qu'un nom qui finit par ce qu'il désigne ; ne compter que depuis le début, c'était supposer
 *  que tous les titres se ressemblent.
 *
 *  Une place qui tient les trois est **candidate**, et rien de plus. Ce qui la distingue d'une
 *  autre candidate — le rang de piste monte aussi, et il est distinct aussi — est la confrontation
 *  aux folios réellement lus, qui ne se fait pas ici : ce banc mesure d'abord **combien de
 *  documents portent un tel signal**, parce que bâtir pour un seul document serait le calibrage
 *  que la doctrine interdit.
 *
 *  Usage : nombres-dans-les-noms.ts <dossier du banc>
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const dossierBanc = process.argv[2];
if (dossierBanc === undefined) {
  console.error("usage : nombres-dans-les-noms.ts <dossier du banc>");
  process.exit(2);
}

/** Les nombres d'un nom, dans l'ordre où ils s'y trouvent. */
const nombresDuNom = (nom: string): readonly number[] =>
  [...nom.replace(/\.[a-z0-9]+$/i, "").matchAll(/\d+/gu)].map((trouve) => Number.parseInt(trouve[0], 10));

type Place = {
  readonly place: number;
  /** Depuis la fin du nom plutôt que depuis son début. */
  readonly depuisLaFin: boolean;
  readonly valeurs: readonly number[];
  readonly monte: boolean;
  readonly distinctes: boolean;
};

function placesDuVivier(noms: readonly string[]): readonly Place[] {
  const suites = noms.map((nom) => nombresDuNom(nom));
  const combien = Math.min(...suites.map((suite) => suite.length));
  if (combien === 0) return [];
  const places: Place[] = [];
  for (const depuisLaFin of [false, true])
    for (let place = 0; place < combien; place += 1) {
      const valeurs = suites.map((suite) => (depuisLaFin ? suite[suite.length - 1 - place]! : suite[place]!));
      places.push({
        place,
        depuisLaFin,
        valeurs,
        monte: valeurs.every((valeur, rang) => rang === 0 || valeur >= valeurs[rang - 1]!),
        distinctes: new Set(valeurs).size === valeurs.length,
      });
    }
  // Sur un vivier dont tous les noms portent le même nombre de nombres, les deux comptages
  // désignent les mêmes places : on ne garde alors qu'une fois chacune.
  const vues = new Set<string>();
  return places.filter((place) => {
    const clef = place.valeurs.join("\u0000");
    if (vues.has(clef)) return false;
    vues.add(clef);
    return true;
  });
}

const jeux = readdirSync(dossierBanc)
  .map((nom) => join(dossierBanc, nom))
  .filter((d) => statSync(d).isDirectory() && existsSync(join(d, "choix.json")));

let avecCandidate = 0;
let avecDeuxOuPlus = 0;
let sansAucune = 0;
let sansMedia = 0;
/** Les documents dont une candidate sort du compte des feuilles : ce sont des numéros imprimés,
 *  et c'est le signal recherché — pas une anomalie. */
let auDelaDesFeuilles = 0;
const lignes: string[] = [];

for (const jeu of jeux) {
  const nom = basename(jeu);
  const choix = JSON.parse(readFileSync(join(jeu, "choix.json"), "utf8")) as {
    pages_du_document: number;
    medias_retenus?: { nom: string }[];
    medias_en_trop?: { nom: string }[];
  };
  const dossierMedias = join(jeu, "medias");
  const noms = existsSync(dossierMedias)
    ? readdirSync(dossierMedias).filter((n) => /\.(mp3|m4a|wav|flac)$/i.test(n)).sort()
    : [];
  if (noms.length < 3) {
    sansMedia += 1;
    continue;
  }
  const places = placesDuVivier(noms);
  // Monter, et rien d'autre : c'est tout ce qu'un numéro de page doit faire. Le reste — savoir
  // laquelle de ces places **est** la page — ne se décide pas depuis les noms.
  const candidates = places.filter((place) => place.monte);
  const horsFeuilles = candidates.filter((place) => place.valeurs.some((valeur) => valeur > choix.pages_du_document));
  if (horsFeuilles.length > 0) auDelaDesFeuilles += 1;
  if (candidates.length === 0) sansAucune += 1;
  else {
    avecCandidate += 1;
    if (candidates.length >= 2) avecDeuxOuPlus += 1;
  }
  lignes.push(
    `${nom.slice(0, 40).padEnd(40)} ${String(noms.length).padStart(2)} méd · ` +
      `${String(places.length).padStart(2)} place(s) de nombre · ` +
      `${candidates.length} candidate(s)` +
      `${candidates.length === 0 ? "" : ` : ${candidates.map((c) => `${c.depuisLaFin ? "avant-dernière" : "place"} ${c.place} [${c.valeurs.slice(0, 4).join(" ")}…]`).join(" · ")}`}`,
  );
}

for (const ligne of lignes) console.log(ligne);
console.log(
  `\n${jeux.length} jeu(x) · ${sansMedia} écarté(s) faute de trois enregistrements\n` +
    `  ${avecCandidate} document(s) portent au moins une place candidate\n` +
    `  ${avecDeuxOuPlus} en portent deux ou plus — et c'est le cas ordinaire, pas l'exception\n` +
    `  ${sansAucune} n'en portent aucune\n` +
    `  ${auDelaDesFeuilles} portent une candidate qui dépasse le compte des feuilles — ` +
    `numéro imprimé, et non rang de feuille`,
);
