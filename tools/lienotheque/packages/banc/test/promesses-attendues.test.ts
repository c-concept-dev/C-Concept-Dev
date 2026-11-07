// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fonctionsAsynchrones, promessesDansUneCondition } from "../src/promesses-attendues.js";

/** Une promesse est toujours vraie : elle n'a rien à faire dans une condition.
 *
 *  `if (faireQuelqueChose())` sur une fonction asynchrone **passe toujours**, quelle que soit la
 *  valeur rendue, et le compilateur ne le dit pas : le type `Promise<boolean>` est accepté là où
 *  un `boolean` est attendu parce que tout objet est vrai. La branche semble gardée ; elle ne
 *  l'est pas.
 *
 *  Le dépôt n'a aucun outil de vérification — `pnpm check` est un typage et des contrôles. Ce
 *  garde-fou en tient la part qui compte, dans l'idiome des autres : une fonction pure, sa
 *  mesure, et la liste des fonctions asynchrones **lue dans le code** plutôt qu'écrite ici.
 *
 *  Posé le 6 novembre 2026 alors que la mesure en trouvait **zéro** : un garde-fou qui naît vert
 *  attrape le premier, pas le centième. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const suivis = (): readonly { readonly chemin: string; readonly contenu: string }[] =>
  execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { cwd: RACINE, encoding: "utf8" })
    .split("\n")
    .filter((chemin) => chemin !== "" && !chemin.includes("/dist/"))
    .map((chemin) => ({ chemin, contenu: readFileSync(join(RACINE, chemin), "utf8") }));

describe("aucune promesse dans une condition", () => {
  it("lit la liste des fonctions asynchrones dans le code, sans la nommer ici", () => {
    const noms = fonctionsAsynchrones(suivis());
    expect(noms.size).toBeGreaterThan(50);
    expect(noms.has("rejouerParOracle"), "une fonction asynchrone connue doit y être").toBe(true);
    expect(noms.has("lireLaTable"), "une fonction synchrone n'a rien à y faire").toBe(false);
  });

  it("n'en trouve aucune dans le dépôt", () => {
    expect(promessesDansUneCondition(suivis())).toEqual([]);
  });

  it("attrape un appel asynchrone placé dans une condition", () => {
    const faux = [
      { chemin: "faux/async.ts", contenu: "export async function lireQuelqueChose() { return true; }\n" },
      { chemin: "faux/usage.ts", contenu: "if (lireQuelqueChose()) { partir(); }\n" },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([
      { chemin: "faux/usage.ts", ligne: 1, nom: "lireQuelqueChose" },
    ]);
  });

  it("laisse passer le même appel attendu", () => {
    const faux = [
      { chemin: "faux/async.ts", contenu: "export async function lireQuelqueChose() { return true; }\n" },
      { chemin: "faux/usage.ts", contenu: "if (await lireQuelqueChose()) { partir(); }\n" },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([]);
  });

  it("voit une condition écrite sur plusieurs lignes", () => {
    const faux = [
      { chemin: "faux/async.ts", contenu: "const lireAilleurs = async (): Promise<boolean> => true;\n" },
      {
        chemin: "faux/usage.ts",
        contenu: "if (\n  quelqueChose &&\n  lireAilleurs()\n) {\n  partir();\n}\n",
      },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([
      { chemin: "faux/usage.ts", ligne: 3, nom: "lireAilleurs" },
    ]);
  });

  it("donne la bonne ligne dans un while, dont l'en-tête est plus long qu'un if", () => {
    const faux = [
      { chemin: "faux/async.ts", contenu: "export async function encore() { return true; }\n" },
      { chemin: "faux/usage.ts", contenu: "const a = 1;\nwhile (\n  encore()\n) {\n  tourner();\n}\n" },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([{ chemin: "faux/usage.ts", ligne: 3, nom: "encore" }]);
  });

  /** Un port est un champ de type `(…) => Promise<…>`. C'est précisément ce qu'on branche, donc
   *  ce qu'on risque d'appeler sans attendre — et son nom n'apparaît nulle part comme
   *  `async function`. Sans cette forme, le garde-fou serait aveugle à la moitié du risque. */
  it("attrape un PORT asynchrone appelé dans une condition", () => {
    const faux = [
      {
        chemin: "faux/port.ts",
        contenu: "export type Options = {\n  readonly relireLaCase?: (zone: Zone) => Promise<string | undefined>;\n};\n",
      },
      { chemin: "faux/usage.ts", contenu: "if (options.relireLaCase === undefined) return;\nif (relireLaCase(zone)) {\n  garder();\n}\n" },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([{ chemin: "faux/usage.ts", ligne: 2, nom: "relireLaCase" }]);
  });

  /** Une condition porte des appels, donc des parenthèses imbriquées. S'arrêter à la première
   *  fermante couperait la condition en deux et perdrait tout ce qui suit — dont l'appel. */
  it("voit l'appel après une parenthèse imbriquée", () => {
    const faux = [
      { chemin: "faux/async.ts", contenu: "export async function encore() { return true; }\n" },
      { chemin: "faux/usage.ts", contenu: "if (Math.max(1, 2) > 0 && encore()) {\n  tourner();\n}\n" },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([{ chemin: "faux/usage.ts", ligne: 1, nom: "encore" }]);
  });

  /** Un garde-fou qui lit du code ne doit pas lire les **chaînes** comme du code.
   *
   *  Trouvé par le garde-fou sur lui-même, une fois son propre contrôle suivi par Git : les
   *  fixtures de ce fichier portent `if (…)` dans des littéraux, et il les accusait. Ce n'est pas
   *  un cas tordu — tout fichier qui cite du code (contrôle, documentation, message d'erreur) a
   *  la même forme. L'exempter aurait désarmé le garde-fou là où il devait apprendre à lire. */
  it("ne lit pas le code cité dans une chaîne", () => {
    const faux = [
      { chemin: "faux/async.ts", contenu: "export async function lireQuelqueChose() { return true; }\n" },
      {
        chemin: "faux/citation.ts",
        contenu: 'const exemple = "if (lireQuelqueChose()) { partir(); }";\nconst autre = `if (lireQuelqueChose()) {}`;\n',
      },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([]);
  });

  it("garde la bonne ligne quand une chaîne multiligne précède l'appel", () => {
    const faux = [
      { chemin: "faux/async.ts", contenu: "export async function lireQuelqueChose() { return true; }\n" },
      {
        chemin: "faux/melange.ts",
        contenu: "const texte = `\n  une ligne\n  une autre\n`;\nif (lireQuelqueChose()) {\n  partir();\n}\n",
      },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([{ chemin: "faux/melange.ts", ligne: 5, nom: "lireQuelqueChose" }]);
  });

  /** Un guillemet échappé ne ferme pas la chaîne. Sans cette règle, le lecteur croirait la
   *  chaîne terminée au milieu, puis lirait la suite comme du code — et accuserait une citation. */
  it("ne se laisse pas fermer une chaîne par un guillemet échappé", () => {
    const faux = [
      { chemin: "faux/async.ts", contenu: "export async function lireQuelqueChose() { return true; }\n" },
      { chemin: "faux/echappe.ts", contenu: 'const dit = "il a dit \\"if (lireQuelqueChose())\\" hier";\n' },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([]);
  });

  it("ne confond pas une méthode de même nom avec la fonction", () => {
    const faux = [
      { chemin: "faux/async.ts", contenu: "export async function ouvrir() { return true; }\n" },
      { chemin: "faux/usage.ts", contenu: "if (porte.ouvrir()) { partir(); }\n" },
    ];
    expect(promessesDansUneCondition(faux)).toEqual([]);
  });
});
