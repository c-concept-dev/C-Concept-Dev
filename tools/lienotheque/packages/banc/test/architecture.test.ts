// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Le port de dépôt aura trois implémentations : `node:sqlite` pour les tests et l'outillage,
 *  l'hôte Rust pour l'application de bureau, SQLite en WebAssembly pour la version en ligne.
 *  Pour que ce soit tenable, un seul adaptateur connaît le moteur — tout le reste ne voit que
 *  le port. Ce garde-fou le vérifie. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));

/** Seul paquet du dépôt autorisé à connaître `node:sqlite` : l'adaptateur et ses propres tests,
 *  qui ouvrent la base pour vérifier ce qu'il y a écrit. */
const ADAPTATEUR = "packages/depot-sqlite/";

/** Et dedans, le code qui doit réellement l'employer. */
const MOTEUR = "packages/depot-sqlite/src";

const ZONES = ["packages", "apps", "outils"];
const IGNORES = new Set(["node_modules", "dist", "target", "moteurs", "gen", "src-tauri"]);

function sources(dossier: string): string[] {
  if (!statSync(dossier, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dossier).flatMap((entree) => {
    if (IGNORES.has(entree) || entree.startsWith(".")) return [];
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return sources(chemin);
    return /\.(ts|tsx)$/.test(entree) ? [chemin] : [];
  });
}

const fichiers = ZONES.flatMap((zone) => sources(join(RACINE, zone))).map((chemin) =>
  relative(RACINE, chemin).replaceAll("\\", "/"),
);

const importe = (chemin: string, module: string): boolean =>
  new RegExp(`from "${module}"|require\\("${module}"\\)|import\\("${module}"\\)`).test(readFileSync(join(RACINE, chemin), "utf8"));

describe("un seul adaptateur connaît le moteur de base", () => {
  it("trouve bien du code à contrôler", () => {
    expect(fichiers.length).toBeGreaterThan(30);
    expect(fichiers.some((c) => c.startsWith(MOTEUR))).toBe(true);
  });

  it("personne n'importe node:sqlite hors de l'adaptateur", () => {
    const fautifs = fichiers.filter((chemin) => !chemin.startsWith(ADAPTATEUR) && importe(chemin, "node:sqlite"));
    expect(fautifs, "node:sqlite ne doit vivre que dans packages/depot-sqlite").toEqual([]);
  });

  it("l'adaptateur, lui, l'emploie bien : sinon ce garde-fou ne garderait rien", () => {
    const dans = fichiers.filter((chemin) => chemin.startsWith(MOTEUR) && importe(chemin, "node:sqlite"));
    expect(dans.length).toBeGreaterThan(0);
  });

  it("le noyau ne dépend d'aucun paquet de stockage", () => {
    const noyau = fichiers.filter((chemin) => chemin.startsWith("packages/noyau/src"));
    for (const chemin of noyau) {
      const contenu = readFileSync(join(RACINE, chemin), "utf8");
      expect(contenu, chemin).not.toMatch(/@lienotheque\/depot-|node:sqlite|better-sqlite3/);
    }
  });
});


/** Ce que la chaîne transmet à la lecture doit être éprouvé **par la porte** (JOB-05)
 *
 *  ## Le défaut que ce garde-fou ferme
 *
 *  Trois fois en deux jours, un mécanisme juste s'est révélé inatteignable depuis la porte que
 *  l'application franchit — `executerTravail`. Le troisième cas dit tout : `lireLeTexte` décide
 *  `options.doublePage ?? détection`, et la chaîne lui passait toujours une valeur définie. Le
 *  `??` ne tombait jamais, la détection ne s'exécutait que dans les bancs, et **aucune épreuve de
 *  la détection ne pouvait le voir** puisqu'aucune ne franchissait la porte.
 *
 *  Le point commun des trois : des épreuves vertes **au-dessus** du défaut, et rien qui passe par
 *  là où l'application passe. Une épreuve qui appelle la fonction prouve la fonction ; seule une
 *  épreuve qui franchit la porte prouve le produit.
 *
 *  ## La règle
 *
 *  Toute option que `lot.ts` transmet à `lireLeTexte` doit être **nommée dans au moins une épreuve
 *  qui appelle `executerTravail`**. Ajouter un réglage à la lecture oblige donc à l'éprouver là où
 *  il sera réellement employé, et non seulement là où il est écrit.
 *
 *  Ce n'est pas une preuve de justesse : une épreuve peut nommer un réglage sans rien en dire de
 *  sérieux. C'est une preuve de **passage** — que quelqu'un soit allé jusqu'à la porte avec. Les
 *  trois défauts de ces deux jours seraient tous tombés là-dessus.
 */
describe("ce que la chaîne transmet à la lecture est éprouvé par la porte", () => {
  const lire = (chemin: string): string => readFileSync(join(RACINE, chemin), "utf8");

  /** Les réglages que la lecture accepte, pris à son contrat et non recopiés ici. */
  const OPTIONS = [...lire("outils/ingestion/src/texte.ts").matchAll(/readonly (\w+)\?:/g)].map((trouve) => trouve[1]!);

  /** Ce que la chaîne lui passe vraiment : le bloc d'options de l'appel, et rien d'autre. */
  const appel = ((): string => {
    const source = lire("outils/ingestion/src/lot.ts");
    const depart = source.indexOf("lireLeTexte(lot.pdf, {");
    const fin = source.indexOf("});", depart);
    return depart < 0 || fin < 0 ? "" : source.slice(depart, fin);
  })();

  const transmises = OPTIONS.filter((option) => new RegExp(`\\b${option}\\b`).test(appel));

  /** Les épreuves qui franchissent la porte, **et seulement elle**.
   *
   *  Un fichier qui appelle aussi `lireLeTexte` ne compte pas : il nommerait le réglage sans que
   *  rien ne dise lequel de ses deux appels l'emploie. C'est exactement ce qui est arrivé —
   *  `aucune-page-lue.test.ts` nomme `doublePage`, franchit la porte ailleurs dans le même
   *  fichier, et le défaut a vécu dessous. Un garde-fou satisfait par un voisinage ne garde
   *  rien. */
  const PAR_LA_PORTE = readdirSync(join(RACINE, "outils/ingestion/test"))
    .filter((fichier) => fichier.endsWith(".ts"))
    .map((fichier) => ({ fichier, texte: lire(`outils/ingestion/test/${fichier}`) }))
    .filter((un) => un.texte.includes("executerTravail") && !un.texte.includes("lireLeTexte("));

  it("trouve bien de quoi contrôler : sinon ce garde-fou ne garderait rien", () => {
    expect(OPTIONS.length, "aucune option lue dans le contrat de la lecture").toBeGreaterThan(3);
    expect(appel, "l'appel de la chaîne à la lecture est introuvable").not.toBe("");
    expect(transmises.length, "la chaîne ne transmettrait aucun réglage ?").toBeGreaterThan(0);
    expect(PAR_LA_PORTE.length, "aucune épreuve ne franchit la porte").toBeGreaterThan(0);
  });

  it("chaque réglage transmis est nommé dans une épreuve qui passe par la porte", () => {
    const orphelins = transmises.filter((option) => !PAR_LA_PORTE.some((un) => new RegExp(`\\b${option}\\b`).test(un.texte)));
    expect(
      orphelins,
      `réglage(s) transmis à la lecture sans aucune épreuve par la porte : ${orphelins.join(", ")}. ` +
        "Une épreuve qui appelle la fonction prouve la fonction ; seule une épreuve qui franchit " +
        "`executerTravail` prouve le produit.",
    ).toEqual([]);
  });
});
