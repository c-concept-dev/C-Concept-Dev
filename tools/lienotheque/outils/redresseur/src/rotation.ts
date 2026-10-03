import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rotation, SourceRotation } from "@lienotheque/contrats";
import { versPgm, type ImageGrise } from "@lienotheque/images";

/** Trouver dans quel sens une photo de page a été prise (OUT-03).
 *
 *  Tesseract sait reconnaître l'orientation d'un texte : on le lui demande. S'il ne sait pas —
 *  une page de musique porte peu de texte, et parfois pas du tout — on déduit de la forme : une
 *  double page est plus large que haute, donc une image plus haute que large est couchée. */

export type OptionsRotation = {
  readonly binaire?: string;
  readonly tessdata?: string | undefined;
  readonly dossier?: string;
};

export type RotationTrouvee = { readonly rotation: Rotation; readonly source: SourceRotation };

const QUARTS = new Set([0, 90, 180, 270]);

/** Lit la réponse de Tesseract en mode orientation. `undefined` s'il ne se prononce pas. */
export function rotationDansOsd(sortie: string): Rotation | undefined {
  const trouve = /^Rotate:\s*(\d+)/m.exec(sortie);
  if (trouve === null) return undefined;
  const degres = Number(trouve[1]);
  return QUARTS.has(degres) ? (degres as Rotation) : undefined;
}

/** Déduction de dernier recours : une double page est plus large que haute. */
export const rotationDeForme = (image: ImageGrise): Rotation => (image.hauteur > image.largeur ? 90 : 0);

let compteur = 0;

export function detecterRotation(image: ImageGrise, options: OptionsRotation = {}): RotationTrouvee {
  const dossier = options.dossier ?? mkdtempSync(join(tmpdir(), "lienotheque-rotation-"));
  const chemin = join(dossier, `orientation-${(compteur += 1)}.pgm`);
  writeFileSync(chemin, versPgm(image));

  try {
    const arguments_ = [realpathSync(chemin), "stdout", "--psm", "0"];
    if (options.tessdata !== undefined) arguments_.push("--tessdata-dir", options.tessdata);
    const sortie = execFileSync(options.binaire ?? "tesseract", arguments_, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const rotation = rotationDansOsd(sortie);
    if (rotation !== undefined) return { rotation, source: "reconnue" };
  } catch {
    // Tesseract refuse volontiers une page qui porte trop peu de texte : ce n'est pas une erreur.
  }
  return { rotation: rotationDeForme(image), source: "deduite" };
}
