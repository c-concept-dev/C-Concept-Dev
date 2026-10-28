/** Épreuve de généralisation du diagnostic structurel sur Bass Aerobics.
 *
 * L'échantillon initial est choisi par fractions du livre, sans rechercher le mot Workout. Il
 * peut donc mêler pages de cours et pages de workout. Le moteur élargit ensuite l'échantillon,
 * dans un ordre fixé avant toute lecture, jusqu'à retrouver deux exemples corroborés ou atteindre
 * la limite commune de huit pages. Rien n'est écrit dans une bibliothèque. */
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
import { calibrerStructure, jetonDacces } from "../src/index.js";

const PDF =
  process.env["LIENOTHEQUE_BASS_AEROBICS_PDF"] ??
  "/Volumes/Macbook Pro/Basse/Basse/Methode Basse - Bass Aerobics/Bass Aerobics (mp3)/Jon Liebman - Bass Aerobics.pdf";
const BASE = process.env["LIENOTHEQUE_DIAGNOSTIC_URL"] ?? "https://lienotheque-api.11drumboy11.workers.dev";
const jeton = jetonDacces();
if (jeton === undefined) throw new Error("Jeton Liénothèque absent du trousseau et de l'environnement");

const nombrePages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [PDF], { encoding: "utf8" }))?.[1]);
if (!Number.isInteger(nombrePages) || nombrePages < 20) throw new Error("Nombre de pages du PDF illisible");

const pageA = (part: number): number => Math.max(1, Math.min(nombrePages, Math.round(nombrePages * part)));
const candidates = [...new Set([1 / 3, 3 / 5, 4 / 5, 9 / 10, 1 / 2, 7 / 10, 5 / 12, 1 / 4, 1 / 6, 5 / 6].map(pageA))];
const observees = candidates.slice(0, 3);
const temporaire = mkdtempSync(join(tmpdir(), "lienotheque-bass-aerobics-"));
const images = new Map<number, ImageGrise>();
const pngs = new Map<number, Buffer>();
const sha = (octets: Uint8Array): string => createHash("sha256").update(octets).digest("hex");
const document = sha(readFileSync(PDF));

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
  execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", "180", "-png", PDF, prefixe]);
  execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", "180", "-gray", PDF, `${prefixe}-gris`]);
  pngs.set(numero, readFileSync(`${prefixe}.png`));
  images.set(numero, lirePgm(readFileSync(`${prefixe}-gris.pgm`)));
}

async function diagnostiquer(pages: readonly number[]): Promise<ReponseDiagnosticStructurel> {
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

const numeroDe = (valeur: string | undefined, mot: "workout" | "track"): number | undefined => {
  const trouve = valeur?.match(new RegExp(`${mot}\\s*#?\\s*(\\d+)`, "i"));
  return trouve === null || trouve === undefined ? undefined : Number(trouve[1]);
};

function evaluer(modele: ModeleStructurelPropose) {
  const workouts = modele.lectures.flatMap((lecture) =>
    lecture.observations.flatMap((observation) => {
      const numero = numeroDe(observation.valeur, "workout");
      return numero === undefined ? [] : [{ page: observation.page, numero, lecture: lecture.id, zone: observation.zone }];
    }),
  );
  const tracks = modele.lectures.flatMap((lecture) =>
    lecture.observations.flatMap((observation) => {
      const numero = numeroDe(observation.valeur, "track");
      return numero === undefined ? [] : [{ page: observation.page, numero, lecture: lecture.id, zone: observation.zone }];
    }),
  );
  const trackParPage = new Map(tracks.map((lecture) => [lecture.page, lecture.numero]));
  const paires = workouts.filter((lecture) => trackParPage.get(lecture.page) === lecture.numero);
  const zonesWorkouts = workouts.map((lecture) => lecture.zone);
  const zonesTracks = tracks.map((lecture) => lecture.zone);
  const zonesStables =
    zonesWorkouts.length >= 2 &&
    zonesTracks.length >= 2 &&
    [...zonesWorkouts, ...zonesTracks].every((zone) => zone.y < 0.22) &&
    Math.max(...zonesWorkouts.map((zone) => zone.y)) - Math.min(...zonesWorkouts.map((zone) => zone.y)) < 0.05 &&
    Math.max(...zonesTracks.map((zone) => zone.y)) - Math.min(...zonesTracks.map((zone) => zone.y)) < 0.05;
  return {
    workouts,
    tracks,
    paires,
    zonesStables,
    reussite: workouts.length >= 2 && tracks.length >= 2 && paires.length >= 2 && zonesStables,
  };
}

const tours: unknown[] = [];
let modeleFinal: ModeleStructurelPropose | undefined;

try {
  while (observees.length <= MAX_PAGES_DIAGNOSTIC_STRUCTUREL) {
    try {
      const reponse = await diagnostiquer(observees);
      const calibre = calibrerStructure(reponse.modele, images);
      const bilan = evaluer(calibre);
      tours.push({ observees: [...observees], jetons: reponse.jetons, proposition: reponse.modele, calibre, bilan });
      if (bilan.reussite) {
        modeleFinal = calibre;
        break;
      }
    } catch (erreur) {
      tours.push({ observees: [...observees], erreur: erreur instanceof Error ? erreur.message : String(erreur) });
    }
    const suivante = candidates.find((page) => !observees.includes(page));
    if (suivante === undefined || observees.length === MAX_PAGES_DIAGNOSTIC_STRUCTUREL) break;
    observees.push(suivante);
  }

  const cache = coin(ouvrirCache(), "diagnostic-structurel");
  const sortie = join(cache, `bass-aerobics-${new Date().toISOString().replaceAll(":", "-")}.json`);
  const rapport = { pdf: PDF, pages: nombrePages, limite: MAX_PAGES_DIAGNOSTIC_STRUCTUREL, reussite: modeleFinal !== undefined, tours };
  writeFileSync(sortie, JSON.stringify(rapport, null, 2));
  console.log(
    JSON.stringify(
      {
        sortie,
        pages: nombrePages,
        reussite: modeleFinal !== undefined,
        tours: tours.map((tour) => {
          const t = tour as { observees: number[]; jetons?: unknown; bilan?: ReturnType<typeof evaluer>; erreur?: string };
          return {
            observees: t.observees,
            jetons: t.jetons,
            erreur: t.erreur,
            bilan:
              t.bilan === undefined
                ? undefined
                : {
                    workouts: t.bilan.workouts.map(({ page, numero, lecture }) => ({ page, numero, lecture })),
                    tracks: t.bilan.tracks.map(({ page, numero, lecture }) => ({ page, numero, lecture })),
                    paires: t.bilan.paires.map(({ page, numero }) => ({ page, numero })),
                    zonesStables: t.bilan.zonesStables,
                    reussite: t.bilan.reussite,
                  },
          };
        }),
      },
      null,
      2,
    ),
  );
  if (modeleFinal === undefined) process.exitCode = 2;
} finally {
  rmSync(temporaire, { recursive: true, force: true });
}
