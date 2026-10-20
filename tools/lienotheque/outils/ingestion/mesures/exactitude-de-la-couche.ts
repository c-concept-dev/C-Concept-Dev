/** La couche texte dit-elle **juste** ? (BAS-02, le bloquant de la couche texte)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/exactitude-de-la-couche.ts \
 *       <inventaire.json> <familles.json> <dossier de sortie> [docs/famille] [pages/doc]
 *
 *  ## Le trou que ce banc comble
 *
 *  Trois choses ont été confondues jusqu'ici sous le mot « qualité » :
 *
 *  | | mesurée ? | par quoi |
 *  |---|---|---|
 *  | **couverture** — combien de pages portent une couche | oui | `cout-du-texte.ts` : 83 % |
 *  | **lisibilité** — la couche est-elle du langage ou du charabia | oui | `couche-saine.ts`, et l'arbitrage de `passages.ts` |
 *  | **exactitude** — la couche dit-elle les bons mots | **non** | ce banc |
 *
 *  L'arbitrage en place est aveugle à la troisième **par construction**. Il juge sur la part de
 *  mots outils (seuil 0,08) et de mots bien formés (seuil 0,6). Une couche qui lit « tbérapie »
 *  pour « thérapie » garde ses mots outils — *le*, *la*, *de* sont courts et passent presque
 *  toujours — et ses mots restent bien formés. Elle franchit les deux seuils, et elle est fausse.
 *
 *  Le CDC le relève sur F2 : **305 titres retrouvés sur 437** dans une couche existante.
 *
 *  ## Ce que l'accord avec l'OCR vaut, et ce qu'il ne vaut pas
 *
 *  **Ce banc ne mesure pas l'exactitude. Il mesure un désaccord.** La distinction n'est pas une
 *  précaution de langage : le gros du corpus vient d'un dossier nommé d'après un logiciel de
 *  reconnaissance de texte, donc **sa couche est elle-même un OCR**. Deux reconnaissances sur la
 *  même image abîmée se trompent souvent ensemble, et leur accord ne prouve alors rien.
 *
 *  Le banc prépare donc deux lots à relire à l'œil, et c'est l'œil qui tranche :
 *
 *  | lot | ce qu'il attrape |
 *  |---|---|
 *  | les pages où les deux **divergent** le plus | laquelle des deux a tort |
 *  | des pages où les deux **s'accordent**, tirées au hasard | le cas où elles ont tort **ensemble** |
 *
 *  Sans le second lot, le chiffre serait biaisé dans le sens rassurant — le seul sens dans lequel
 *  il ne faut pas se tromper avant d'indexer 21 515 pages.
 *
 *  ## Ce qu'il ne fait pas
 *
 *  **Les documents natifs n'entrent pas dans l'échantillon**, et ce n'est pas un oubli. Une page
 *  native ne porte aucune image : il n'y a rien à océriser, donc rien à comparer. Mesuré le
 *  20 octobre — l'OCR forcé y rend zéro page lue et cinq sans texte. Leur couche n'est d'ailleurs
 *  pas une lecture mais le texte d'origine, et douter d'elle n'aurait pas de sens.
 *
 *  **Il ne touche à rien.** Il lit le dossier des ouvrages et n'écrit que dans le dossier de
 *  sortie qu'on lui donne, lequel vit hors du dépôt : il contient des pages d'œuvres sous droits
 *  (règle 5).
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { PageLue } from "@lienotheque/contrats";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { decoderJpeg, enGris, versPgm } from "@lienotheque/images";
import { lireCoucheTexte, lireParOcr, metadonneesDuPdf } from "@lienotheque/lecteur-texte";

const [cheminInventaire, cheminFamilles, sortie, parFamille = "8", parDocument = "10"] = process.argv.slice(2);
if (cheminInventaire === undefined || cheminFamilles === undefined || sortie === undefined) {
  console.error("Attendu : <inventaire.json> <familles.json> <dossier de sortie> [docs/famille] [pages/doc]");
  process.exit(2);
}
const DOCS = Number.parseInt(parFamille, 10);
const PAGES = Number.parseInt(parDocument, 10);

/** Les trois familles photographiées, et elles seules : ce sont celles dont la couche est une
 *  lecture, donc les seules dont on puisse douter. */
const FAMILLES = [
  "livre photographié, une page par feuille",
  "livre photographié, deux pages par feuille",
  "feuillet photographié",
] as const;

type Trait = { chemin: string; empreinte: string; pages: number; famille: string; motsParPage: number };
type Releve = { chemin: string; empreinte: string; octets: number; pages: number };

/** Un tirage **reproductible**. Un échantillon qu'on ne peut pas refaire à l'identique ne se
 *  discute pas : on ne saurait pas si un chiffre a changé parce que le code a changé ou parce
 *  que le tirage a changé. La graine est l'empreinte, donc le même document tire les mêmes
 *  pages, aujourd'hui et dans six mois. */
function suiteDepuis(graine: string): () => number {
  let etat = 0;
  for (const caractere of graine) etat = (etat * 31 + caractere.charCodeAt(0)) >>> 0;
  return () => {
    etat = (etat * 1_664_525 + 1_013_904_223) >>> 0;
    return etat / 0x1_0000_0000;
  };
}

/** Les pages tirées d'un document : réparties sur la longueur, et jamais aux bords.
 *
 *  Une page de titre, une page de garde, une table des matières n'apprennent rien sur la qualité
 *  d'une lecture de texte courant — et ce sont justement celles que « les N premières pages »
 *  donnerait. On écarte donc un dixième à chaque bout, et l'on répartit le reste. */
function pagesTirees(total: number, combien: number, tirer: () => number): readonly number[] {
  const debut = Math.max(1, Math.floor(total * 0.1));
  const fin = Math.max(debut + 1, Math.ceil(total * 0.9));
  const largeur = (fin - debut) / combien;
  const rangs = new Set<number>();
  for (let i = 0; i < combien; i += 1) {
    const rang = Math.min(fin, Math.max(debut, Math.round(debut + largeur * (i + tirer()))));
    rangs.add(rang);
  }
  return [...rangs].sort((a, b) => a - b);
}

/** Les mots d'une page, normalisés pour la comparaison.
 *
 *  Les accents sont **gardés** : « thérapie » lu « therapie » est une erreur de lecture, et la
 *  recherche la paiera. Les effacer ferait disparaître la moitié de ce qu'on cherche à mesurer.
 *  La ponctuation de bord part, la casse part : ce sont des différences de transcription, pas de
 *  lecture. */
function motsDe(page: PageLue | undefined): string[] {
  if (page === undefined) return [];
  return page.mots
    .map((mot) => mot.texte.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((mot) => mot.length > 1);
}

/** L'accord entre deux lectures : la part de mots qu'elles ont en commun, **sac à sac**.
 *
 *  En multiensemble et non en ensemble : un mot répété cinq fois d'un côté et une fois de
 *  l'autre est un désaccord, et le compter comme un accord masquerait une lecture qui saute des
 *  lignes entières. Rapporté au plus fourni des deux, pour qu'une lecture presque vide ne
 *  s'affiche pas en accord parfait avec ses trois mots justes. */
function accord(gauche: readonly string[], droite: readonly string[]): number {
  if (gauche.length === 0 && droite.length === 0) return 1;
  const reste = new Map<string, number>();
  for (const mot of gauche) reste.set(mot, (reste.get(mot) ?? 0) + 1);
  let communs = 0;
  for (const mot of droite) {
    const combien = reste.get(mot) ?? 0;
    if (combien > 0) {
      communs += 1;
      reste.set(mot, combien - 1);
    }
  }
  return communs / Math.max(gauche.length, droite.length);
}

/** Un document dont l'image de page **ne porte pas** le texte n'entre pas dans l'échantillon.
 *
 *  Mesuré le 20 octobre, et c'est le piège de ce banc : onze documents classés « photographié »
 *  rendaient un accord de **zéro pour cent**, et j'ai d'abord cru la couche fautive. La cause
 *  était l'inverse. Ce sont des diaporamas, des thèses, des supports de cours — du texte
 *  d'origine, posé sur une image **décorative**. L'OCR lit le décor et n'y trouve rien ; la
 *  couche, elle, a parfaitement raison.
 *
 *  Le classement en familles ne pouvait pas le voir : il répond à « comment lire cette page »,
 *  pas à « ce texte est-il une photographie ». Un document à fond coloré porte une image par
 *  page comme un livre numérisé.
 *
 *  Le départage est net et ne demande aucun réglage fin : là où la comparaison a un sens, les
 *  deux lectures rendent un nombre de mots voisin — 516 contre 517, 744 contre 735 ; là où elle
 *  n'en a pas, l'OCR rend zéro ou deux mots contre quelques centaines. Deux ordres de grandeur
 *  séparent les deux cas, et le seuil tombe au milieu. */
const PART_MINIMALE = 0.25;
/** Sous ce nombre de mots, aucune des deux lectures ne dit rien d'exploitable sur une page de
 *  texte courant, et les comparer reviendrait à comparer deux silences. */
const MOTS_MINIMUM_PAGE = 30;

type Jugement = { readonly compare: boolean; readonly raison: string };

function comparable(pages: readonly { motsCouche: number; motsOcr: number }[]): Jugement {
  if (pages.length === 0) return { compare: false, raison: "aucune page lue" };
  const median = (valeurs: readonly number[]): number =>
    [...valeurs].sort((a, b) => a - b)[Math.floor(valeurs.length / 2)] ?? 0;
  const couche = median(pages.map((une) => une.motsCouche));
  const ocr = median(pages.map((une) => une.motsOcr));
  if (couche < MOTS_MINIMUM_PAGE) return { compare: false, raison: `couche presque vide (${couche} mots médians)` };
  if (ocr < MOTS_MINIMUM_PAGE || ocr / couche < PART_MINIMALE)
    return { compare: false, raison: `image sans texte : ${ocr} mots océrisés pour ${couche} en couche` };
  return { compare: true, raison: "" };
}

const inventaire = JSON.parse(await readFile(cheminInventaire, "utf8")) as { dossier: string; releves: Releve[] };
const familles = (JSON.parse(await readFile(cheminFamilles, "utf8")) as { traits: Trait[] }).traits;
const parEmpreinte = new Map(inventaire.releves.map((un) => [un.empreinte, un.chemin]));

mkdirSync(join(sortie, "pages"), { recursive: true });

type Couple = {
  readonly document: string;
  readonly empreinte: string;
  readonly famille: string;
  readonly producteur?: string;
  readonly rang: number;
  readonly image: string;
  readonly accord: number;
  readonly couche: string;
  readonly ocr: string;
  readonly motsCouche: number;
  readonly motsOcr: number;
};

const couples: Couple[] = [];
type Verdict = {
  document: string;
  famille: string;
  producteur?: string;
  metadonneesLues: boolean;
  accord: number;
  pages: number;
  compare: boolean;
  raison: string;
};
const parDoc: Verdict[] = [];

/** Lit un document, compare page à page, et rend ce qu'il a trouvé. N'écrit les images que si
 *  la comparaison a un sens — inutile de couvrir le disque de décors de diapositives. */
async function examiner(trait: Trait, chemin: string, famille: string): Promise<Verdict> {
  const nom = basename(chemin);
  const metadonnees = await metadonneesDuPdf(chemin).catch(() => ({ connu: false }) as const);
  const donnees = Buffer.from(await readFile(chemin));
  const objets = objetsPdf(donnees);
  const imagesParRang = new Map<number, number>();
  pagesPdf(objets).forEach((page, index) => {
    const premiere = page.images[0];
    if (premiere !== undefined) imagesParRang.set(index + 1, premiere.numero);
  });

  const couche = (await lireCoucheTexte(chemin)).pages;
  const rangs = pagesTirees(Math.min(trait.pages, couche.length), PAGES, suiteDepuis(trait.empreinte));
  const dossierOcr = mkdtempSync(join(tmpdir(), "exactitude-"));
  const lues: { rang: number; motsCouche: string[]; motsOcr: string[]; octets: Buffer }[] = [];

  try {
    for (const rang of rangs) {
      const numero = imagesParRang.get(rang);
      if (numero === undefined) continue;
      const octets = octetsImage(objets, numero);
      if (octets === undefined || octets.extension !== "jpg") continue;

      const image = enGris(await decoderJpeg(octets.octets));
      const pgm = join(dossierOcr, `page-${rang}.pgm`);
      writeFileSync(pgm, versPgm(image));
      let lueParOcr: PageLue | undefined;
      try {
        lueParOcr = lireParOcr(pgm, image.largeur, image.hauteur, rang, { segmentation: 3, langue: "fra" });
      } catch {
        lueParOcr = undefined;
      } finally {
        rmSync(pgm, { force: true });
      }

      const motsCouche = motsDe(couche[rang - 1]);
      const motsOcr = motsDe(lueParOcr);
      // Une page sans aucun mot des deux côtés n'est ni un accord ni un désaccord : c'est une
      // page blanche, et la faire entrer dans l'échantillon volerait une place à une vraie.
      if (motsCouche.length === 0 && motsOcr.length === 0) continue;
      lues.push({ rang, motsCouche, motsOcr, octets: octets.octets });
    }
  } finally {
    rmSync(dossierOcr, { recursive: true, force: true });
  }

  const jugement = comparable(lues.map((une) => ({ motsCouche: une.motsCouche.length, motsOcr: une.motsOcr.length })));
  const accords: number[] = [];

  if (jugement.compare)
    for (const lue of lues) {
      const nomImage = `${trait.empreinte.slice(0, 12)}-${lue.rang}.jpg`;
      writeFileSync(join(sortie, "pages", nomImage), lue.octets);
      const valeur = accord(lue.motsCouche, lue.motsOcr);
      accords.push(valeur);
      couples.push({
        document: nom,
        empreinte: trait.empreinte,
        famille,
        ...(metadonnees.producteur === undefined ? {} : { producteur: metadonnees.producteur }),
        rang: lue.rang,
        image: `pages/${nomImage}`,
        accord: valeur,
        couche: lue.motsCouche.join(" "),
        ocr: lue.motsOcr.join(" "),
        motsCouche: lue.motsCouche.length,
        motsOcr: lue.motsOcr.length,
      });
    }

  return {
    document: nom,
    famille,
    ...(metadonnees.producteur === undefined ? {} : { producteur: metadonnees.producteur }),
    metadonneesLues: metadonnees.connu,
    accord: accords.length === 0 ? 0 : accords.reduce((somme, un) => somme + un, 0) / accords.length,
    pages: accords.length,
    compare: jugement.compare,
    raison: jugement.raison,
  };
}

for (const famille of FAMILLES) {
  const candidats = familles
    .filter((un) => un.famille === famille && un.pages >= PAGES * 2)
    .sort((a, b) => a.empreinte.localeCompare(b.empreinte));

  // On tire **jusqu'à** trouver le compte voulu de documents comparables, au lieu d'en tirer un
  // nombre fixe. Le premier tirage en rendait treize sur vingt-quatre : la moitié de
  // l'échantillon partait en documents dont l'image ne porte pas le texte, et la mesure se
  // retrouvait deux fois moins fournie que ce qui avait été décidé.
  const tirerDoc = suiteDepuis(famille);
  const ordre: number[] = [];
  const pris = new Set<number>();
  while (ordre.length < candidats.length) {
    const index = Math.floor(tirerDoc() * candidats.length);
    if (pris.has(index)) continue;
    pris.add(index);
    ordre.push(index);
  }

  let retenus = 0;
  for (const index of ordre) {
    if (retenus >= DOCS) break;
    const trait = candidats[index]!;
    const chemin = parEmpreinte.get(trait.empreinte);
    if (chemin === undefined) continue;
    process.stderr.write(`${famille} — ${basename(chemin)}\n`);
    const verdict = await examiner(trait, chemin, famille);
    parDoc.push(verdict);
    if (verdict.compare) {
      retenus += 1;
      process.stderr.write(`   retenu : ${verdict.pages} pages, accord moyen ${(verdict.accord * 100).toFixed(1)} %\n`);
    } else {
      process.stderr.write(`   écarté : ${verdict.raison}\n`);
    }
  }
}

await writeFile(join(sortie, "couples.json"), JSON.stringify({ mesureLe: new Date().toISOString(), couples, parDoc }, null, 2), "utf8");

const ecartes = parDoc.filter((un) => !un.compare);
console.log(`\n${couples.length} pages comparées sur ${parDoc.filter((un) => un.compare).length} documents.`);
console.log(`${ecartes.length} document(s) écartés : leur image de page ne porte pas le texte.\n`);
console.log(`Métadonnées lues sur ${parDoc.filter((un) => un.metadonneesLues).length} documents, `
  + `producteur déclaré par ${parDoc.filter((un) => un.producteur !== undefined).length}.\n`);
console.log("| Famille | Documents | Pages | Accord moyen |");
console.log("|---|---:|---:|---:|");
for (const famille of FAMILLES) {
  const siens = parDoc.filter((un) => un.famille === famille && un.compare);
  const pages = siens.reduce((somme, un) => somme + un.pages, 0);
  const moyen = siens.length === 0 ? 0 : siens.reduce((somme, un) => somme + un.accord, 0) / siens.length;
  console.log(`| ${famille} | ${siens.length} | ${pages} | ${(moyen * 100).toFixed(1)} % |`);
}
console.log(`\nRelevé écrit dans ${join(sortie, "couples.json")}`);
