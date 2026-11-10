// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LigneDeReleve } from "../src/marges.js";

/** L'instrument du garde-fou des marges, éprouvé **par l'exécution** (dette D7).
 *
 *  Un chronomètre ne se prouve pas en lisant son code : il se prouve en lui donnant des durées
 *  connues et en regardant ce qu'il en rapporte. Ce contrôle écrit donc de vrais contrôles dont le
 *  découpage est décidé d'avance — tant de crochet, tant de corps —, les fait tourner par un
 *  vrai passage vitest sous l'instrument, et compare.
 *
 *  Il tient trois choses, et chacune a été fausse dans une version antérieure de ce lot :
 *
 *  1. le corps est chronométré **sans** les crochets, là où la durée affichée par le rapporteur
 *     les compte ;
 *  2. le délai rapporté est celui que vitest a **résolu**, et non celui qu'on déduirait d'un
 *     fichier de configuration ;
 *  3. l'instrument ne retire **pas** le délai : un corps qui le dépasse échoue toujours.
 *
 *  Le passage imbriqué vit dans un dossier temporaire créé **sous ce paquet**, pour deux raisons :
 *  les modules de vitest s'y résolvent, et son relevé ne se mêle pas à celui du passage en cours.
 *  Ses fichiers ne portent pas `.test.ts`, afin qu'un reste oublié ne soit jamais ramassé par un
 *  passage ordinaire. */

const PAQUET = join(import.meta.dirname, "..");
const VITEST = join(PAQUET, "node_modules/.bin/vitest");
const COMMUNE = join(PAQUET, "configuration-commune.ts");

const EPREUVE = `
import { afterEach, beforeEach, describe, expect, it } from "vitest";
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

describe("crochet avant coûteux", () => {
  beforeEach(async () => { await dormir(400); });
  it("A, corps de 100 derrière un crochet de 400", async () => { await dormir(100); expect(1).toBe(1); });
});
describe("aucun crochet", () => {
  it("B, corps de 400 et rien d'autre", async () => { await dormir(400); expect(1).toBe(1); });
});
describe("crochets des deux côtés", () => {
  beforeEach(async () => { await dormir(200); });
  afterEach(async () => { await dormir(300); });
  it("C, corps de 100 entre 200 et 300", async () => { await dormir(100); expect(1).toBe(1); });
});
describe("délai écrit sur le contrôle", () => {
  it("D, délai propre de 1234", async () => { await dormir(20); expect(1).toBe(1); }, 1234);
});
describe("délai dépassé", () => {
  it("E, corps de 900 pour un délai de 300", async () => { await dormir(900); expect(1).toBe(1); }, 300);
});
`;

const bac = mkdtempSync(join(PAQUET, "epreuve-des-marges-"));
afterAll(() => rmSync(bac, { recursive: true, force: true }));

type ControleRapporte = { readonly fullName: string; readonly status: string; readonly duration?: number };

let releve: LigneDeReleve[] = [];
let rapportes: ControleRapporte[] = [];

beforeAll(() => {
  writeFileSync(join(bac, "corps-connus.epreuve.mjs"), EPREUVE, "utf8");
  // Le dossier porte sa propre configuration : la commune, plus de quoi ramasser un fichier qui
  // ne s'appelle pas `.test.ts`. Ni `--include` ni `--setupFiles` n'existent en ligne de
  // commande — mesuré, vitest refuse l'option —, et c'est tant mieux : ce qui est écrit dans un
  // fichier se relit.
  writeFileSync(
    join(bac, "vitest.config.ts"),
    'import { defineConfig, mergeConfig } from "vitest/config";\n' +
      `import commune from ${JSON.stringify(COMMUNE)};\n` +
      'export default mergeConfig(commune, defineConfig({ test: { include: ["**/*.epreuve.mjs"] } }));\n',
    "utf8",
  );
  // Le passage imbriqué échoue, et c'est voulu : le contrôle E doit dépasser son délai. On garde
  // donc sa sortie au lieu de la laisser lever.
  const rapportJson = join(bac, "rapport.json");
  try {
    execFileSync(VITEST, ["run", "--root", bac, "--reporter=json", `--outputFile=${rapportJson}`], {
      cwd: bac,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    // Le rapport est écrit quand même : c'est lui qu'on lit, et non la sortie à l'écran. Les
    // couleurs du terminal rendaient une lecture de la sortie fragile — mesuré.
  }
  const rapport = JSON.parse(readFileSync(rapportJson, "utf8")) as {
    testResults: { assertionResults: ControleRapporte[] }[];
  };
  rapportes = rapport.testResults.flatMap((fichier) => fichier.assertionResults);
  releve = readFileSync(join(bac, ".rapport-marges.jsonl"), "utf8")
    .split("\n")
    .filter((ligne) => ligne !== "")
    .map((ligne) => JSON.parse(ligne) as LigneDeReleve);
}, 120_000);

/** La mesure du contrôle dont le nom commence par cette lettre. */
const lu = (lettre: string): LigneDeReleve => {
  const trouve = releve.find((ligne) => ligne.nom.includes(`${lettre}, `));
  expect(trouve, `le contrôle ${lettre} doit figurer au relevé`).toBeDefined();
  return trouve as LigneDeReleve;
};

/** Ce que le RAPPORTEUR a dit du même contrôle — la durée qu'on lisait jusqu'ici. */
const affiche = (lettre: string): ControleRapporte => {
  const trouve = rapportes.find((controle) => controle.fullName.includes(`${lettre}, `));
  expect(trouve, `le contrôle ${lettre} doit figurer au rapport`).toBeDefined();
  return trouve as ControleRapporte;
};

describe("l'instrument chronomètre le corps, et non ce que le rapporteur affiche", () => {
  it("laisse dehors un crochet d'avant qui coûte quatre fois le corps", () => {
    // Crochet 400 + corps 100. Un instrument qui compterait les crochets rendrait ~500.
    expect(lu("A").corps).toBeLessThan(260);
    expect(lu("A").corps).toBeGreaterThan(40);
  });

  it("laisse dehors les crochets des deux côtés", () => {
    // 200 avant, 100 de corps, 300 après. Tout compter rendrait ~600.
    expect(lu("C").corps).toBeLessThan(260);
    expect(lu("C").corps).toBeGreaterThan(40);
  });

  it("rend le corps lui-même quand il n'y a pas de crochet", () => {
    expect(lu("B").corps).toBeGreaterThan(300);
    expect(lu("B").corps).toBeLessThan(900);
  });

  it("et la distinction n'est pas une subtilité : le rapporteur, lui, compte bien les crochets", () => {
    // Sans quoi ce lot n'aurait pas d'objet. La durée affichée pour A est de l'ordre de 500 ms,
    // alors que son corps en coûte 100 — c'est exactement l'écart que les marges publiées
    // jusqu'au 10 novembre 2026 ignoraient.
    expect(affiche("A").duration ?? 0).toBeGreaterThan(300);
    expect(affiche("A").duration ?? 0).toBeGreaterThan(lu("A").corps + 150);
  });
});

describe("l'instrument lit le délai, il ne le suppose pas", () => {
  it("rapporte le délai écrit sur le contrôle lui-même", () => {
    expect(lu("D").delai).toBe(1234);
  });

  it("rapporte le délai par défaut du paquet pour un contrôle qui n'en déclare aucun", () => {
    // 5 000 ms, le défaut de vitest, puisque la configuration commune n'en pose pas. Ce n'est pas
    // un nombre écrit ici : si le paquet changeait de délai, cette mesure changerait avec lui.
    expect(lu("A").delai).toBe(lu("B").delai);
    expect(lu("A").delai).toBeGreaterThan(1234);
  });

  it("nomme le contrôle comme le rapport des épingles le nomme, par une espace et non par « > »", () => {
    expect(lu("D").nom).toBe("délai écrit sur le contrôle D, délai propre de 1234");
  });
});

describe("l'instrument ne retire pas le délai", () => {
  it("un corps qui dépasse son délai échoue toujours, sous l'instrument comme sans lui", () => {
    // Le contrôle le plus important de ce lot. Si `runTask` avait remplacé la fonction du contrôle
    // au lieu de l'entourer, tous les délais du dépôt seraient devenus décoratifs — un garde-fou
    // qui désarme ce qu'il mesure. E dort 900 ms sous un délai de 300.
    expect(affiche("E").status).toBe("failed");
  });

  it("et il est le seul à échouer : l'instrument ne casse pas ce qui passait", () => {
    expect(["A", "B", "C", "D"].map((lettre) => affiche(lettre).status)).toEqual([
      "passed",
      "passed",
      "passed",
      "passed",
    ]);
  });

  it("et son corps est arrêté AU délai, pas au bout de ce qu'il voulait faire", () => {
    // 900 ms demandés, 300 de délai : si le chronomètre rendait 900, c'est que le délai n'avait
    // rien interrompu. Il rend ~300, donc l'interruption a bien eu lieu, et à l'heure.
    expect(lu("E").corps).toBeGreaterThan(250);
    expect(lu("E").corps).toBeLessThan(880);
  });
});
