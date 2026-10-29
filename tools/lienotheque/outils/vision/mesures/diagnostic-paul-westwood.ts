/** Diagnostic structurel de Paul Westwood sur les deux volumes réellement déposés séparément.
 *
 * Le moteur ne connaît ni le vocabulaire du livre ni les numéros attendus. Il cherche dans un
 * échantillon adaptatif une lecture numérique répétée, un repère compact associé et leur
 * relation spatiale. Les deux PDF sont diagnostiqués indépendamment : aucun changement de disque
 * n'est simulé entre eux et aucune bibliothèque n'est modifiée. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  DemandeDiagnosticStructurel,
  MAX_PAGES_DIAGNOSTIC_STRUCTUREL,
  ReponseDiagnosticStructurel,
  type ModeleStructurelPropose,
} from "@lienotheque/contrats";
import { coin, ouvrirCache } from "@lienotheque/cache";
import type { ImageGrise } from "@lienotheque/images";
import { calibrerStructure, jetonDacces } from "../src/index.js";

const BASE = process.env["LIENOTHEQUE_DIAGNOSTIC_URL"] ?? "https://lienotheque-api.11drumboy11.workers.dev";
const jeton = jetonDacces();
if (jeton === undefined) throw new Error("Jeton Liénothèque absent du trousseau et de l'environnement");

const VOLUMES = [
  {
    id: "paul-westwood-volume-1",
    pdf:
      process.env["LIENOTHEQUE_PAUL_WESTWOOD_VOLUME_1"] ??
      "/Volumes/Macbook Pro/Basse/Paul westwood pdf et MP3/Paul Westwood 1/Bass Bible Vol 1 - World History Of Styles & Techniques [Disc 1]/Paul westwood 1-2.pdf",
  },
  {
    id: "paul-westwood-volume-2",
    pdf:
      process.env["LIENOTHEQUE_PAUL_WESTWOOD_VOLUME_2"] ??
      "/Volumes/Macbook Pro/Basse/Paul westwood pdf et MP3/Paul Westwood 2/Bass Bible Vol 2 - World History Of Styles (Book)/Paul westwood 2-5.pdf",
  },
] as const;

const sha = (octets: Uint8Array): string => createHash("sha256").update(octets).digest("hex");

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

function evaluer(modele: ModeleStructurelPropose) {
  const elements = modele.lectures.filter(
    (lecture) =>
      lecture.nature === "element" &&
      new Set(lecture.observations.filter((observation) => /\d/.test(observation.valeur ?? "")).map((observation) => observation.page)).size >= 2,
  );
  const reperes = modele.lectures.filter(
    (lecture) =>
      lecture.nature === "repere" &&
      new Set(lecture.observations.map((observation) => observation.page)).size >= 2,
  );
  const relations = modele.relations.filter((relation) =>
    reperes.some((repere) => repere.id === relation.de) && elements.some((element) => element.id === relation.vers),
  );
  return {
    doublePage: modele.geometrie.doublePage,
    elements: elements.map((lecture) => lecture.id),
    reperes: reperes.map((lecture) => lecture.id),
    relations,
    reussite: modele.geometrie.doublePage && elements.length > 0 && reperes.length > 0 && relations.length > 0,
  };
}

async function diagnostiquerVolume(volume: (typeof VOLUMES)[number]) {
  const nombrePages = Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [volume.pdf], { encoding: "utf8" }))?.[1]);
  if (!Number.isInteger(nombrePages) || nombrePages < 20) throw new Error(`Nombre de pages illisible : ${volume.pdf}`);
  const pageA = (part: number): number => Math.max(1, Math.min(nombrePages, Math.round(nombrePages * part)));
  const candidates = [
    ...new Set([1 / 3, 3 / 5, 4 / 5, 9 / 10, 1 / 2, 7 / 10, 5 / 12, 1 / 4, 1 / 6, 5 / 6].map(pageA)),
  ];
  const observees = candidates.slice(0, 3);
  const temporaire = mkdtempSync(join(tmpdir(), `${volume.id}-`));
  const images = new Map<number, ImageGrise>();
  const imagesVision = new Map<number, Buffer>();
  const document = sha(readFileSync(volume.pdf));

  function rendre(numero: number): void {
    if (images.has(numero)) return;
    const prefixe = join(temporaire, `page-${numero}`);
    // Ces scans portent une taille physique PDF très supérieure à leur définition utile. À
    // 180 dpi, leur PNG interpolé dépasse le contrat de 16 Mio sans ajouter d'information. Le
    // WebP borné garde les chiffres lisibles et évite aussi de saturer le Worker quand
    // l'échantillon adaptatif grandit.
    execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", "96", "-png", volume.pdf, prefixe]);
    execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", "96", "-gray", volume.pdf, `${prefixe}-gris`]);
    execFileSync("cwebp", ["-quiet", "-q", "86", `${prefixe}.png`, "-o", `${prefixe}.webp`]);
    imagesVision.set(numero, readFileSync(`${prefixe}.webp`));
    images.set(numero, lirePgm(readFileSync(`${prefixe}-gris.pgm`)));
  }

  async function appeler(pages: readonly number[]) {
    for (const numero of pages) rendre(numero);
    const demande = DemandeDiagnosticStructurel.parse({
      document,
      pages: pages.map((numero) => {
        const image = images.get(numero)!;
        const imageVision = imagesVision.get(numero)!;
        return {
          numero,
          empreinte: sha(imageVision),
          image: imageVision.toString("base64"),
          typeMime: "image/webp",
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

  const tours: unknown[] = [];
  let modeleFinal: ModeleStructurelPropose | undefined;
  try {
    while (observees.length <= MAX_PAGES_DIAGNOSTIC_STRUCTUREL) {
      try {
        const reponse = await appeler(observees);
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
    return {
      id: volume.id,
      pdf: volume.pdf,
      nom: basename(volume.pdf),
      pages: nombrePages,
      limite: MAX_PAGES_DIAGNOSTIC_STRUCTUREL,
      reussite: modeleFinal !== undefined,
      tours,
    };
  } finally {
    rmSync(temporaire, { recursive: true, force: true });
  }
}

const resultats = [];
for (const volume of VOLUMES) resultats.push(await diagnostiquerVolume(volume));
const sortie = join(coin(ouvrirCache(), "diagnostic-structurel"), `paul-westwood-${new Date().toISOString().replaceAll(":", "-")}.json`);
writeFileSync(sortie, JSON.stringify({ sortie, resultats }, null, 2));
console.log(
  JSON.stringify(
    {
      sortie,
      resultats: resultats.map((resultat) => ({
        id: resultat.id,
        pdf: resultat.nom,
        pages: resultat.pages,
        reussite: resultat.reussite,
        tours: resultat.tours.map((tour) => {
          const mesure = tour as { observees: number[]; jetons?: unknown; bilan?: ReturnType<typeof evaluer>; erreur?: string };
          return { observees: mesure.observees, jetons: mesure.jetons, bilan: mesure.bilan, erreur: mesure.erreur };
        }),
      })),
    },
    null,
    2,
  ),
);
if (resultats.some((resultat) => !resultat.reussite)) process.exitCode = 2;
