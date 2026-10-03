import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { PageLue, type MotLu } from "@lienotheque/contrats";

/** OCR d'une page numérisée, avec la boîte de chaque mot (OUT-05).
 *
 *  Tesseract rend un tableau séparé par des tabulations : une ligne par mot, avec sa boîte en
 *  pixels de l'image donnée. On n'invente rien — les positions sortent telles quelles, dans les
 *  coordonnées de l'image d'origine, origine en haut à gauche (conventions ANC). */

export type OptionsOcr = {
  readonly binaire?: string;
  readonly tessdata?: string | undefined;
  readonly langue?: string;
  /** Mode de segmentation de Tesseract. 3 = page entière, 7 = une ligne, 11 = texte épars. */
  readonly segmentation?: number;
  /** Caractères autorisés, pour les lectures de chiffres. */
  readonly alphabet?: string | undefined;
};

export function tesseractDisponible(binaire = "tesseract"): boolean {
  try {
    execFileSync(binaire, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const COLONNES = ["level", "page_num", "block_num", "par_num", "line_num", "word_num", "left", "top", "width", "height", "conf", "text"];

/** Analyse la sortie tabulée de Tesseract. Exportée pour être éprouvée sans Tesseract. */
export function analyserTsv(tsv: string): readonly MotLu[] {
  const lignes = tsv.split(/\r?\n/).filter((ligne) => ligne.trim() !== "");
  const entete = lignes[0]?.split("\t") ?? [];
  const index = Object.fromEntries(COLONNES.map((nom) => [nom, entete.indexOf(nom)]));
  if (index["text"] === undefined || index["text"] < 0) return [];

  const mots: MotLu[] = [];
  for (const ligne of lignes.slice(1)) {
    const cases = ligne.split("\t");
    const texte = (cases[index["text"]!] ?? "").trim();
    if (texte === "") continue;
    const nombre = (nom: string): number => Number(cases[index[nom]!] ?? 0);
    const confiance = nombre("conf");
    const l = nombre("width");
    const h = nombre("height");
    if (l <= 0 || h <= 0) continue;
    mots.push({
      texte,
      x: Math.max(0, nombre("left")),
      y: Math.max(0, nombre("top")),
      l,
      h,
      ...(confiance >= 0 ? { confiance: Math.min(1, Math.max(0, confiance / 100)) } : {}),
    });
  }
  return mots;
}

/** Les binaires externes reçoivent le chemin réel, liens symboliques résolus : sur macOS `/tmp`
 *  est un lien vers `/private/tmp`, et un processus fils n'a pas forcément le droit de le suivre. */
export function cheminReel(chemin: string): string {
  try {
    return realpathSync(chemin);
  } catch {
    return chemin;
  }
}

export function lireParOcr(image: string, largeur: number, hauteur: number, index: number, options: OptionsOcr = {}): PageLue {
  const arguments_ = [cheminReel(image), "stdout", "-l", options.langue ?? "eng", "--psm", String(options.segmentation ?? 3), "tsv"];
  if (options.alphabet !== undefined) arguments_.push("-c", `tessedit_char_whitelist=${options.alphabet}`);

  const tsv = execFileSync(options.binaire ?? "tesseract", arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
    ...(options.tessdata === undefined ? {} : { env: { ...process.env, TESSDATA_PREFIX: options.tessdata } }),
  });

  return PageLue.parse({ index, source: "ocr", unite: "pixel", largeur, hauteur, mots: analyserTsv(tsv) });
}
