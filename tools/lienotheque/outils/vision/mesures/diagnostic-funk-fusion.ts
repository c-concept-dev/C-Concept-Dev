/** Épreuve réelle et adaptative du diagnostic structurel sur Funk Fusion Bass.
 *
 * Vision commence avec trois pages. Une page témoin qui invalide le modèle peut rejoindre
 * l'échantillon, mais elle est alors remplacée par une nouvelle page cachée. Le nombre de pages
 * vues reste borné : Vision comprend le gabarit, elle ne traite jamais le livre page par page. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DemandeDiagnosticStructurel,
  MAX_PAGES_DIAGNOSTIC_STRUCTUREL,
  ReponseDiagnosticStructurel,
  type ModeleStructurelPropose,
} from "@lienotheque/contrats";
import { coin, ouvrirCache } from "@lienotheque/cache";
import type { ImageGrise } from "@lienotheque/images";
import { chargerRecette } from "@lienotheque/recettes";
import { calibrerStructure, confronterPagesTemoins, detecterLecturesLocales, jetonDacces } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const PDF =
  process.env["LIENOTHEQUE_FUNK_FUSION_PDF"] ??
  "/Volumes/Macbook Pro/Basse/Basse/Funk Fusion Bass (Hal Leonard - Bass Builders) [Book+CD]/Funk Fusion Bass.pdf";
const BASE = process.env["LIENOTHEQUE_DIAGNOSTIC_URL"];
if (BASE === undefined) throw new Error("LIENOTHEQUE_DIAGNOSTIC_URL manque");
const jeton = jetonDacces();
if (jeton === undefined) throw new Error("Jeton Liénothèque absent du trousseau et de l'environnement");

const sha = (octets: Uint8Array): string => createHash("sha256").update(octets).digest("hex");
const nombrePages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [PDF], { encoding: "utf8" }))?.[1]);
if (!Number.isInteger(nombrePages) || nombrePages < 20) throw new Error("Nombre de pages du PDF illisible");

const pageA = (part: number): number => Math.max(1, Math.min(nombrePages, Math.round(nombrePages * part)));
const uniques = (fractions: readonly number[]): number[] => [...new Set(fractions.map(pageA))];
/** Ordre fixé avant lecture du contenu : diversité dans le livre, reproductible sur tout PDF. */
const pagesCandidates = uniques([1 / 3, 3 / 5, 4 / 5, 9 / 10, 1 / 2, 7 / 10, 5 / 12, 1 / 4, 1 / 6, 5 / 6]);
const reserveTemoins = uniques([7 / 15, 2 / 3, 3 / 8, 3 / 4, 5 / 8, 7 / 8, 2 / 9, 8 / 9, 1 / 8, 11 / 16]);
const observees = pagesCandidates.slice(0, 3);
if (observees.length !== 3) throw new Error("L'échantillonnage initial n'a pas produit trois pages distinctes");

const temporaire = mkdtempSync(join(tmpdir(), "lienotheque-diagnostic-"));
const images = new Map<number, ImageGrise>();
const pngs = new Map<number, Buffer>();
const RESOLUTION = 220;

function lirePgm(octets: Buffer): ImageGrise {
  const entete = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(octets.toString("latin1", 0, Math.min(octets.length, 128)));
  if (entete === null) throw new Error("Rendu PGM illisible");
  const debut = Buffer.byteLength(entete[0], "latin1");
  const largeur = Number(entete[1]);
  const hauteur = Number(entete[2]);
  const pixels = octets.subarray(debut, debut + largeur * hauteur);
  if (pixels.length !== largeur * hauteur) throw new Error("Rendu PGM tronqué");
  return { largeur, hauteur, pixels: Uint8Array.from(pixels) };
}

function rendre(numero: number): void {
  if (images.has(numero)) return;
  const prefixe = join(temporaire, `page-${numero}`);
  execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", String(RESOLUTION), "-png", PDF, prefixe]);
  execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", String(RESOLUTION), "-gray", PDF, `${prefixe}-gris`]);
  pngs.set(numero, readFileSync(`${prefixe}.png`));
  images.set(numero, lirePgm(readFileSync(`${prefixe}-gris.pgm`)));
}

function choisirTemoins(): number[] {
  const interdits = new Set(observees);
  const temoins = [...reserveTemoins, ...pagesCandidates].filter((page) => !interdits.has(page)).slice(0, 2);
  if (temoins.length !== 2) throw new Error("Deux pages témoins distinctes sont introuvables");
  return temoins;
}

function comparerManuelle(modele: ModeleStructurelPropose) {
  const manuelle = chargerRecette(
    JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-numero-compose-piste.v2.json"), "utf8")),
  );
  const elementManuel = manuelle.lectures.find((lecture) => lecture.ancre === "element");
  const pisteManuelle = manuelle.lectures.find((lecture) => lecture.ancre === "piste");
  const elementTrouve =
    modele.lectures.find(
      (lecture) =>
        lecture.nature === "element" &&
        lecture.observations.filter((observation) => /^\d+\.\d+$/.test(observation.valeur?.trim() ?? "")).length >= 2,
    ) ?? modele.lectures.find((lecture) => lecture.nature === "element");
  const relationTrouvee =
    elementTrouve === undefined
      ? undefined
      : modele.relations.find((relation) => {
          if (relation.de !== elementTrouve.id && relation.vers !== elementTrouve.id) return false;
          const autre = relation.de === elementTrouve.id ? relation.vers : relation.de;
          const lecture = modele.lectures.find((candidate) => candidate.id === autre);
          return lecture !== undefined && (lecture.nature === "repere" || lecture.forme === "losange" || lecture.forme === "cercle");
        });
  const idRepere =
    relationTrouvee === undefined || elementTrouve === undefined
      ? undefined
      : relationTrouvee.de === elementTrouve.id
        ? relationTrouvee.vers
        : relationTrouvee.de;
  const repereTrouve = modele.lectures.find(
    (lecture) => lecture.id === idRepere && (lecture.nature === "repere" || lecture.forme === "losange" || lecture.forme === "cercle"),
  );
  const valeursElements = elementTrouve?.observations.flatMap((observation) =>
    observation.valeur === undefined ? [] : [observation.valeur.trim()],
  ) ?? [];
  return {
    numeroCompose:
      valeursElements.length >= 2 &&
      valeursElements.every((valeur) => /^\d+\.\d+$/.test(valeur)),
    encadrement: elementTrouve?.forme === elementManuel?.numero?.encadrement,
    positionRepere:
      relationTrouvee === undefined || elementTrouve === undefined || pisteManuelle?.position === undefined
        ? false
        : relationTrouvee.de === elementTrouve.id
          ? (relationTrouvee.position === "gauche" && pisteManuelle.position === "droite") ||
            (relationTrouvee.position === "droite" && pisteManuelle.position === "gauche")
          : relationTrouvee.position === pisteManuelle.position,
    formeRepere:
      (repereTrouve?.forme === "losange" ? "losange_sombre_chiffres_clairs" : "bloc_sombre_chiffres_clairs") ===
      pisteManuelle?.motif,
  };
}

type Tour = {
  numero: number;
  observees: number[];
  temoins: number[];
  jetons?: { entree: number; sortie: number };
  controle?: ReturnType<typeof confronterPagesTemoins>;
  comparaison?: ReturnType<typeof comparerManuelle>;
  proposition?: ModeleStructurelPropose;
  calibre?: ModeleStructurelPropose;
  erreur?: string;
  pageAjoutee?: number;
};

const document = sha(readFileSync(PDF));
const tours: Tour[] = [];
let reussite = false;

async function diagnostiquer(pages: readonly number[]) {
  for (const numero of pages) rendre(numero);
  const demande = DemandeDiagnosticStructurel.parse({
    document,
    pages: pages.map((numero) => {
      const image = images.get(numero)!;
      const png = pngs.get(numero)!;
      return {
        numero,
        empreinte: sha(png),
        image: png.toString("base64"),
        typeMime: "image/png",
        largeur: image.largeur,
        hauteur: image.hauteur,
      };
    }),
  });
  const vue = await fetch(`${BASE.replace(/\/$/, "")}/vision/structure`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${jeton}` },
    body: JSON.stringify(demande),
  });
  if (!vue.ok) throw new Error(`Diagnostic refusé (${vue.status}) : ${await vue.text()}`);
  return ReponseDiagnosticStructurel.parse(await vue.json());
}

try {
  while (observees.length <= MAX_PAGES_DIAGNOSTIC_STRUCTUREL) {
    const temoins = choisirTemoins();
    for (const numero of temoins) rendre(numero);
    const tour: Tour = { numero: tours.length + 1, observees: [...observees], temoins: [...temoins] };
    try {
      const reponse = await diagnostiquer(observees);
      const calibre = calibrerStructure(reponse.modele, images);
      const lecturesTemoins = temoins.map((page) => ({ page, lectures: detecterLecturesLocales(calibre, images.get(page)!) }));
      const controle = confronterPagesTemoins(calibre, lecturesTemoins);
      const comparaison = comparerManuelle(calibre);
      Object.assign(tour, { jetons: reponse.jetons, proposition: reponse.modele, calibre, controle, comparaison });
      reussite = controle.ecarts.length === 0 && Object.values(comparaison).every(Boolean);
    } catch (erreur) {
      tour.erreur = erreur instanceof Error ? erreur.message : String(erreur);
    }
    tours.push(tour);
    if (reussite || observees.length === MAX_PAGES_DIAGNOSTIC_STRUCTUREL) break;

    /** Une page qui contredit le gabarit est la plus informative. Sinon on élargit selon
     * l'ordre fixé, sans choisir une page à partir de la recette manuelle. */
    const pageEnEchec = tour.controle?.ecarts
      .map((ecart) => Number(/^page (\d+)/.exec(ecart)?.[1]))
      .find((page) => Number.isInteger(page) && !observees.includes(page));
    // Le premier élargissement couvre obligatoirement la fin du livre ; ensuite une rupture
    // observée sur une page témoin est plus informative qu'une page arbitraire.
    const finDuLivre = pagesCandidates[3];
    const candidateStructurelle = finDuLivre !== undefined && !observees.includes(finDuLivre) ? finDuLivre : undefined;
    const suivante =
      candidateStructurelle ??
      pageEnEchec ??
      pagesCandidates.find((page) => !observees.includes(page)) ??
      reserveTemoins.find((page) => !observees.includes(page));
    if (suivante === undefined) break;
    observees.push(suivante);
    tour.pageAjoutee = suivante;
  }

  const cache = coin(ouvrirCache(), "diagnostic-structurel");
  const sortie = join(cache, `funk-fusion-${new Date().toISOString().replaceAll(":", "-")}.json`);
  const rapport = { pdf: PDF, pages: nombrePages, resolution: RESOLUTION, limite: MAX_PAGES_DIAGNOSTIC_STRUCTUREL, reussite, tours };
  writeFileSync(sortie, JSON.stringify(rapport, null, 2));
  console.log(
    JSON.stringify(
      {
        sortie,
        pages: nombrePages,
        reussite,
        tours: tours.map(({ numero, observees, temoins, jetons, controle, comparaison, erreur, pageAjoutee }) => ({
          numero,
          observees,
          temoins,
          jetons,
          controle,
          comparaison,
          erreur,
          pageAjoutee,
        })),
      },
      null,
      2,
    ),
  );
  if (!reussite) process.exitCode = 2;
} finally {
  rmSync(temporaire, { recursive: true, force: true });
}
