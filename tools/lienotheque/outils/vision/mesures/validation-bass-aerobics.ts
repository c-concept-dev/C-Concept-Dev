/** Validation cachée puis rejeu intégral de Bass Aerobics depuis le modèle diagnostiqué.
 *
 * Les pages 10, 50 et 100 ne faisaient pas partie de l'échantillon adaptatif. Elles valident la
 * présence locale du cartouche avant compilation. Le livre et ses médias sont ensuite rejoués par
 * la chaîne réelle ; aucune bibliothèque n'est modifiée. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { ModeleStructurelPropose } from "@lienotheque/contrats";
import { coin, ouvrirCache } from "@lienotheque/cache";
import type { ImageGrise } from "@lienotheque/images";
import { bilanAssociationCorpus, comparer, mediasDuDossier, rejouer } from "@lienotheque/recettes";
import {
  compilerRecetteStructurelle,
  confronterPagesTemoins,
  detecterLecturesLocales,
  validerStructure,
} from "../src/index.js";

const PDF =
  process.env["LIENOTHEQUE_BASS_AEROBICS_PDF"] ??
  "/Volumes/Macbook Pro/Basse/Basse/Methode Basse - Bass Aerobics/Bass Aerobics (mp3)/Jon Liebman - Bass Aerobics.pdf";
const MEDIAS = process.env["LIENOTHEQUE_BASS_AEROBICS_MEDIAS"] ?? join(PDF, "..");
const RAPPORT =
  process.env["LIENOTHEQUE_BASS_AEROBICS_DIAGNOSTIC"] ??
  "/Volumes/Macbook Pro/lienotheque-cache/diagnostic-structurel/bass-aerobics-2026-10-28T08-45-30.040Z.json";
const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const temporaire = mkdtempSync(join(tmpdir(), "lienotheque-bass-aerobics-temoins-"));

function lirePgm(octets: Buffer): ImageGrise {
  const entete = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(octets.toString("latin1", 0, Math.min(octets.length, 128)));
  if (entete === null) throw new Error("Rendu PGM illisible");
  const debut = Buffer.byteLength(entete[0], "latin1");
  const largeur = Number(entete[1]);
  const hauteur = Number(entete[2]);
  return { largeur, hauteur, pixels: Uint8Array.from(octets.subarray(debut, debut + largeur * hauteur)) };
}

function rendre(numero: number): ImageGrise {
  const prefixe = join(temporaire, `page-${numero}`);
  execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", "180", "-gray", PDF, prefixe]);
  return lirePgm(readFileSync(`${prefixe}.pgm`));
}

try {
  const brut = JSON.parse(readFileSync(RAPPORT, "utf8")) as {
    tours: { calibre?: unknown; bilan?: { reussite?: boolean } }[];
  };
  const dernier = [...brut.tours].reverse().find((tour) => tour.bilan?.reussite === true && tour.calibre !== undefined);
  if (dernier?.calibre === undefined) throw new Error("Le rapport ne contient aucun modèle Bass Aerobics réussi");
  const complet = ModeleStructurelPropose.parse(dernier.calibre);
  const cartouche = complet.lectures.find((lecture) =>
    lecture.observations.some((observation) => /[\p{L}]\s*#?\s*\d+.*[\p{L}]\s*#?\s*\d+/iu.test(observation.valeur ?? "")),
  );
  if (cartouche === undefined) throw new Error("Le diagnostic n'a rendu aucun cartouche à deux identifiants");
  const modele = ModeleStructurelPropose.parse({ ...complet, lectures: [cartouche], relations: [] });

  const numerosTemoins = [10, 50, 100] as const;
  const pagesTemoins = numerosTemoins.map((page) => ({ page, lectures: detecterLecturesLocales(modele, rendre(page)) }));
  const controle = confronterPagesTemoins(modele, pagesTemoins);
  if (controle.ecarts.length > 0) throw new Error(`Pages témoins refusées : ${controle.ecarts.join(" ; ")}`);
  // Les superpositions de ces trois pages ont été inspectées visuellement dans la mesure : le
  // cartouche englobe Workout et TRACK, en haut de page, sans empiéter sur un autre identifiant.
  const valide = validerStructure(modele, controle, true);
  const recette = compilerRecetteStructurelle(valide, { id: "methode-cartouche-double-identifiant", version: 1 });

  const medias = await mediasDuDossier(MEDIAS);
  const joue = await rejouer(PDF, MEDIAS, recette, { cache: coin(cache, "lectures-c9-3") });
  const oracle = Array.from({ length: 52 }, (_, rang) => ({ numero: rang + 1, piste: rang + 1 }));
  const score = comparer(joue.resultat.lignes, oracle);
  const bilan = bilanAssociationCorpus(joue.association);
  const mesure = {
    diagnostic: RAPPORT,
    pdf: basename(PDF),
    pagesTemoins: numerosTemoins,
    controle,
    recette,
    medias: medias.length,
    lignes: joue.resultat.lignes.length,
    automatiques: bilan.automatiques,
    aVerifier: bilan.aVerifier,
    fauxAutomatiques: bilan.fauxAutomatiques.length,
    pistesManquantes: bilan.pistesManquantes,
    mediasOrphelins: bilan.mediasOrphelins,
    oracle: score,
  };
  const sortie = join(coin(cache, "rapports-c9-3"), `bass-aerobics-${new Date().toISOString().replaceAll(":", "-")}.json`);
  writeFileSync(sortie, JSON.stringify(mesure, null, 2));
  console.log(JSON.stringify({ sortie, ...mesure }, null, 2));
  if (
    score.justes !== score.attendus ||
    score.manquants.length > 0 ||
    score.fautifs.length > 0 ||
    bilan.fauxAutomatiques.length > 0
  )
    process.exitCode = 2;
} finally {
  rmSync(temporaire, { recursive: true, force: true });
}
