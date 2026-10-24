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

/** La langue sur laquelle `tesseract` part quand on ne lui dit rien.
 *
 *  **Nommée pour pouvoir en parler.** Elle était écrite en clair dans l'appel, et la chaîne du
 *  texte ne lui passait jamais rien : un corpus français était lu avec le modèle anglais, et
 *  **un accent sur six s'y perdait** — 284 contre 337, mesuré le 20 octobre 2026 sur six
 *  feuilles. Un défaut à l'anglais dans un outil générique est une hypothèse de domaine
 *  déguisée (CLA-01).
 *
 *  Elle reste, parce que la lecture d'un repère chiffré n'a pas de langue — elle emploie une
 *  liste de caractères autorisés — et qu'il faut bien une valeur. **Le chemin du texte, lui, ne
 *  doit jamais s'y fier** : sa langue vient de la bibliothèque. */
export const LANGUE_PAR_DEFAUT = "eng";

/** De la langue d'une bibliothèque au modèle de reconnaissance qui la lit.
 *
 *  `SchemaBibliotheque.langue` est **obligatoire** au contrat : une bibliothèque sait toujours
 *  dans quelle langue elle est. Elle le dit à deux lettres — « fr » —, là où la reconnaissance
 *  veut trois — « fra ». Il n'y avait donc rien à ajouter aux contrats, seulement à traduire.
 *
 *  La table est une **donnée** : on l'allonge en ajoutant une ligne, jamais une branche. Une
 *  langue qu'elle ne connaît pas rend `undefined`, et c'est volontaire — rendre l'anglais serait
 *  refaire le défaut. L'appelant décide alors, et l'annonce.
 *
 *  Les variantes régionales se ramènent à leur langue : « fr-CA » et « fr_FR » se lisent avec le
 *  même modèle, et prétendre le contraire demanderait des modèles qui n'existent pas. */
const LANGUES: Readonly<Record<string, string>> = {
  fr: "fra",
  en: "eng",
  es: "spa",
  de: "deu",
  it: "ita",
  pt: "por",
  nl: "nld",
};

export function langueOcr(langue: string): string | undefined {
  const propre = langue.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  if (propre === "") return undefined;
  if (Object.values(LANGUES).includes(propre)) return propre;
  return LANGUES[propre];
}

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
  const arguments_ = [cheminReel(image), "stdout", "-l", options.langue ?? LANGUE_PAR_DEFAUT, "--psm", String(options.segmentation ?? 3), "tsv"];
  if (options.alphabet !== undefined) arguments_.push("-c", `tessedit_char_whitelist=${options.alphabet}`);

  const tsv = execFileSync(options.binaire ?? "tesseract", arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
    ...(options.tessdata === undefined ? {} : { env: { ...process.env, TESSDATA_PREFIX: options.tessdata } }),
  });

  return PageLue.parse({ index, source: "ocr", unite: "pixel", largeur, hauteur, mots: analyserTsv(tsv) });
}
