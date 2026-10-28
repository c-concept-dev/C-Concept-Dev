/** Diagnostic structurel borné d'Aebersold 026, sans écriture en bibliothèque.
 *
 * Ce livre très court est un cas multi-CD trompeur : les fichiers audio recommencent à 01 au
 * second disque, tandis que le PDF peut présenter une numérotation éditoriale continue. Le test
 * exige donc une structure disque+piste répétée sur au moins deux pages distinctes. Une table
 * globale isolée ne suffit jamais à produire une recette activable. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DemandeDiagnosticStructurel,
  ReponseDiagnosticStructurel,
  type ModeleStructurelPropose,
} from "@lienotheque/contrats";
import { coin, ouvrirCache } from "@lienotheque/cache";
import type { ImageGrise } from "@lienotheque/images";
import { calibrerStructure, jetonDacces } from "../src/index.js";

const PDF =
  process.env["LIENOTHEQUE_AEBERSOLD_026_PDF"] ??
  "/Volumes/Macbook Pro/Basse/AEBERSOLDS/Aebersold - 026 - [Scale Syllabus]/CD1/Aebersold 026 - [Scale Syllabus].pdf";
const BASE = process.env["LIENOTHEQUE_DIAGNOSTIC_URL"] ?? "https://lienotheque-api.11drumboy11.workers.dev";
const jeton = jetonDacces();
if (jeton === undefined) throw new Error("Jeton Liénothèque absent du trousseau et de l'environnement");

const temporaire = mkdtempSync(join(tmpdir(), "lienotheque-aebersold-026-"));
const images = new Map<number, ImageGrise>();
const imagesVision = new Map<number, Buffer>();
const sha = (octets: Uint8Array): string => createHash("sha256").update(octets).digest("hex");
const document = sha(readFileSync(PDF));
const echantillons = [
  [2, 4, 5],
  [2, 3, 4, 5],
  [2, 3, 4, 5, 6],
] as const;

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
  execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", "120", "-png", PDF, prefixe]);
  execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", "120", "-gray", PDF, `${prefixe}-gris`]);
  imagesVision.set(numero, readFileSync(`${prefixe}.png`));
  images.set(numero, lirePgm(readFileSync(`${prefixe}-gris.pgm`)));
}

async function appeler(pages: readonly number[]): Promise<ReponseDiagnosticStructurel> {
  for (const numero of pages) rendre(numero);
  const demande = DemandeDiagnosticStructurel.parse({
    document,
    pages: pages.map((numero) => {
      const image = images.get(numero)!;
      const vision = imagesVision.get(numero)!;
      return {
        numero,
        empreinte: sha(vision),
        image: vision.toString("base64"),
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

const contient = (valeur: string | undefined, motif: RegExp): boolean => valeur !== undefined && motif.test(valeur);

function evaluer(modele: ModeleStructurelPropose) {
  const observations = modele.lectures.flatMap((lecture) =>
    lecture.observations.map((observation) => ({
      lecture: lecture.id,
      nature: lecture.nature,
      page: observation.page,
      valeur: observation.valeur,
    })),
  );
  const disques = observations.filter((observation) => contient(observation.valeur, /\b(?:cd|disc|side)\s*\d+\b/i));
  const pistes = observations.filter((observation) =>
    contient(observation.valeur, /\b(?:track|piste)\s*#?\s*\d+\b/i),
  );
  const pagesDisque = new Set(disques.map((observation) => observation.page));
  const pagesPiste = new Set(pistes.map((observation) => observation.page));
  const pagesCompletes = [...pagesDisque].filter((page) => pagesPiste.has(page));
  return {
    disques,
    pistes,
    pagesCompletes,
    // Une table isolée ne constitue pas un gabarit applicable au reste du livre.
    reussite: pagesCompletes.length >= 2,
    inconnues: modele.inconnues,
  };
}

const tours: unknown[] = [];
try {
  for (const pages of echantillons) {
    try {
      const reponse = await appeler(pages);
      const calibre = calibrerStructure(reponse.modele, images);
      const bilan = evaluer(calibre);
      tours.push({ pages, jetons: reponse.jetons, modele: calibre, bilan });
      if (bilan.reussite) break;
    } catch (erreur) {
      tours.push({ pages, erreur: erreur instanceof Error ? erreur.message : String(erreur) });
    }
  }
  const sortie = join(
    coin(ouvrirCache(), "diagnostic-structurel"),
    `aebersold-026-${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
  writeFileSync(sortie, JSON.stringify({ pdf: PDF, document, tours }, null, 2));
  console.log(
    JSON.stringify(
      {
        sortie,
        tours: tours.map((tour) => {
          const mesure = tour as { pages: readonly number[]; jetons?: unknown; bilan?: ReturnType<typeof evaluer>; erreur?: string };
          return { pages: mesure.pages, jetons: mesure.jetons, bilan: mesure.bilan, erreur: mesure.erreur };
        }),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporaire, { recursive: true, force: true });
}
