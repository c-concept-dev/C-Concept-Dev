import { execFileSync } from "node:child_process";
import { existsSync, openSync, readSync, closeSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

/** Le paquet des moteurs ne charge rien de l'extérieur (CLAUDE.md, plateformes ; lot 0b).
 *
 *  ## Pourquoi ce garde-fou existe
 *
 *  Le 9 novembre 2026, mesure faite : le Tesseract embarqué chargeait six codecs d'image depuis
 *  `/opt/homebrew/Cellar`. Le paquet marchait donc **ici**, où Homebrew est installé, et ne se
 *  serait pas chargé chez un testeur. La préparation prétendait réécrire ces références, et
 *  échouait en silence — `install_name_tool` y tournait avec `check=False`.
 *
 *  Le contrôle qui existait demandait « le moteur démarre-t-il ? ». Il ne pouvait pas voir le
 *  défaut : il démarre très bien sur la machine qui l'a fabriqué. On regarde donc les références
 *  elles-mêmes.
 *
 *  ## Ce qu'une référence a le droit d'être
 *
 *  Une bibliothèque du système (`/usr/lib/`, `/System/`) est présente partout : elle passe. Un nom
 *  relatif au paquet (`@loader_path/…`, `@rpath/…`, `@executable_path/…`) passe **si le fichier
 *  qu'il nomme est vraiment dans le paquet** — un soname court qui ne correspond à aucun fichier
 *  embarqué est une fuite, même sans chemin absolu. Tout chemin absolu hors système est une fuite,
 *  puisqu'il désigne la machine qui a fabriqué le paquet. */

const SYSTEME = ["/usr/lib/", "/System/"] as const;

/** Magies Mach-O, 64 et 32 bits, chaque boutisme, plus les binaires universels. */
const MACHO = new Set(["cffaedfe", "cefaedfe", "feedfacf", "feedface", "cafebabe"]);

export type Reference = {
  /** Le binaire embarqué qui porte la référence, nommé relativement au paquet. */
  readonly binaire: string;
  /** Le nom d'installation cité, tel que le portent les commandes de chargement. */
  readonly nom: string;
};

export type Fuite = Reference & { readonly pourquoi: string };

/** Les références qui sortent du paquet, et la raison de chacune.
 *
 *  `fichiersDuPaquet` donne les noms de fichiers réellement embarqués — pas des chemins : c'est
 *  sur le nom de fichier que le chargeur apparie un `@loader_path/…`. */
export function fuites(references: readonly Reference[], fichiersDuPaquet: readonly string[]): Fuite[] {
  const presents = new Set(fichiersDuPaquet.map((chemin) => basename(chemin)));
  const trouvees: Fuite[] = [];
  for (const reference of references) {
    if (SYSTEME.some((prefixe) => reference.nom.startsWith(prefixe))) continue;
    if (reference.nom.startsWith("@")) {
      const nomDeFichier = basename(reference.nom);
      if (!presents.has(nomDeFichier)) {
        trouvees.push({
          ...reference,
          pourquoi: `« ${nomDeFichier} » n'est pas dans le paquet : le nom cité ne correspond à aucun fichier embarqué`,
        });
      }
      continue;
    }
    trouvees.push({
      ...reference,
      pourquoi: `chemin absolu hors système : il désigne la machine qui a fabriqué le paquet, pas le paquet`,
    });
  }
  return trouvees;
}

/** Vrai si le fichier est un Mach-O, et non une donnée : `otool` refuse le reste. */
export function estMacho(chemin: string): boolean {
  let descripteur: number | undefined;
  try {
    descripteur = openSync(chemin, "r");
    const tampon = Buffer.alloc(4);
    if (readSync(descripteur, tampon, 0, 4, 0) < 4) return false;
    return MACHO.has(tampon.toString("hex"));
  } catch {
    return false;
  } finally {
    if (descripteur !== undefined) closeSync(descripteur);
  }
}

/** Tout Mach-O du paquet, où qu'il soit : `bin/`, `lib/`, et les extensions natives de la chaîne.
 *
 *  Se limiter à `bin/` et `lib/` laisserait un angle mort — le rendu PDF embarque la sienne. */
export function machoDuPaquet(racine: string): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isSymbolicLink()) continue;
      if (entree.isDirectory()) parcourir(chemin);
      else if (entree.isFile() && statSync(chemin).size > 4 && estMacho(chemin)) trouves.push(chemin);
    }
  };
  if (existsSync(racine)) parcourir(racine);
  return trouves.sort();
}

/** Les bibliothèques qu'un Mach-O CHARGE, hors système.
 *
 *  On lit les commandes de chargement, et non `otool -L`, dont la première ligne porte le nom
 *  d'installation du fichier lui-même (`LC_ID_DYLIB`) : personne ne le charge. L'extension Skia du
 *  rendu PDF porte ainsi le chemin de la machine GitHub qui l'a compilée — inoffensif, et pourtant
 *  signalé comme une fuite si on lit `otool -L` naïvement. Mesuré le 9 novembre 2026. */
export function chargees(chemin: string): string[] {
  const dit = execFileSync("otool", ["-l", chemin], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const lignes = dit.split("\n");
  const noms: string[] = [];
  for (const [index, ligne] of lignes.entries()) {
    const commande = ligne.trim();
    if (commande !== "cmd LC_LOAD_DYLIB" && commande !== "cmd LC_LOAD_WEAK_DYLIB") continue;
    for (const suite of lignes.slice(index + 1, index + 5)) {
      const marque = suite.indexOf("name ");
      if (marque === -1) continue;
      noms.push(suite.slice(marque + 5).split(" (offset")[0]?.trim() ?? "");
      break;
    }
  }
  return noms.filter((nom) => nom !== "" && !SYSTEME.some((prefixe) => nom.startsWith(prefixe)));
}

/** Les références du paquet réel, lues sur le disque, prêtes pour `fuites`. */
export function referencesDuPaquet(racine: string): { references: Reference[]; fichiers: string[] } {
  const machos = machoDuPaquet(racine);
  const references = machos.flatMap((chemin) =>
    chargees(chemin).map((nom) => ({ binaire: relative(racine, chemin), nom })),
  );
  return { references, fichiers: machos };
}
