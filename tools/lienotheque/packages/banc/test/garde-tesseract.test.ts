// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  controlesQuiPeuventAtteindre,
  controlesSansGarde,
  empreinteDuControle,
  nomsQuiAtteignentTesseract,
  racinesQuiEchouentSansTesseract,
} from "../src/garde-tesseract.js";

/** Un contrôle qui appelle la reconnaissance doit porter sa garde (lot 0q).
 *
 *  ## Le défaut que ce garde-fou existe pour empêcher
 *
 *  Il est **invisible là où on le fabrique**. Cette machine a Tesseract, donc le contrôle complet
 *  local passe ; `lienotheque-ci.yml` ne l'installe que sur macOS, délibérément et avec les octets
 *  exacts du paquet des moteurs. Un contrôle qui appelle la reconnaissance sans garde est donc
 *  vert ici et rouge sur Ubuntu — après la poussée.
 *
 *  Le 12 novembre 2026, la course `43242544864` est tombée pour cette raison : cinq contrôles de
 *  `la-porte-relit-les-cases.test.ts` sur `spawnSync tesseract ENOENT`. L'idiome du remède
 *  existait déjà et était employé à six endroits — `const siTesseract = tesseractDisponible() ? it
 *  : it.skip` —, ce qui manquait est la **mécanique** qui refuse de s'en passer.
 *
 *  ## Pourquoi un graphe et non un `grep`
 *
 *  La condition est **transitive** : « un fichier de contrôle qui appelle Tesseract, ou une
 *  fonction qui l'appelle ». Un contrôle qui franchit la Porte n'écrit jamais le mot
 *  « tesseract » — il appelle `executerTravail`, qui appelle la couche texte, qui appelle l'OCR.
 *  Chercher le mot ne trouverait que les feuilles.
 *
 *  ## Ce qu'il ne prétend pas faire
 *
 *  Lire le code ne dit pas si le chemin est **réellement parcouru** : une Porte franchie avec un
 *  document natif ne touche jamais la reconnaissance. Mesuré le 14 novembre 2026 en rendant
 *  Tesseract indisponible, **treize** des seize fichiers que le graphe désigne passent quand même.
 *  Le garde-fou n'en devine donc rien : il exige que la question ait reçu **une** des trois
 *  réponses — la garde, une épingle pour l'absence de l'outil, ou une survie mesurée et inscrite
 *  avec l'empreinte du fichier mesuré. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const suivis = (): readonly { readonly chemin: string; readonly contenu: string }[] =>
  execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { cwd: RACINE, encoding: "utf8" })
    .split("\n")
    .filter((chemin) => chemin !== "" && !chemin.includes("/dist/"))
    .map((chemin) => ({ chemin, contenu: readFileSync(join(RACINE, chemin), "utf8") }));

/** La correspondance « nom de paquet → point d'entrée », **lue des `package.json`** du dépôt.
 *
 *  Neuf fichiers de contrôle atteignent la reconnaissance par `@lienotheque/lecteur-texte` : sans
 *  cette table, le garde-fou serait aveugle à neuf chemins sur lesquels la course est tombée. Elle
 *  est lue, jamais écrite ici — un nom de paquet ajouté demain n'a pas à passer par ce fichier. */
const paquets = (): ReadonlyMap<string, string> => {
  const table = new Map<string, string>();
  for (const chemin of execFileSync("git", ["ls-files", "*/package.json"], { cwd: RACINE, encoding: "utf8" })
    .split("\n")
    .filter((un) => un !== "" && !un.includes("node_modules/"))) {
    const manifeste = JSON.parse(readFileSync(join(RACINE, chemin), "utf8")) as {
      name?: string;
      exports?: Record<string, string>;
    };
    const point = manifeste.exports?.["."];
    if (manifeste.name === undefined || point === undefined) continue;
    const dossier = chemin.split("/").slice(0, -1).join("/");
    table.set(manifeste.name, `${dossier}/${point.replace(/^\.\//u, "")}`);
  }
  return table;
};

type MesuresInscrites = {
  readonly controles: readonly {
    readonly chemin: string;
    readonly empreinte_sha256: string;
    readonly pourquoi: string;
  }[];
};

/** Les survies mesurées, **lues de leur fichier de données**. Ce fichier porte la méthode, la date
 *  et l'empreinte de chaque contrôle mesuré ; il n'est pas une liste d'exemptions, c'est le relevé
 *  d'une épreuve. */
const mesuresInscrites = (): MesuresInscrites =>
  JSON.parse(readFileSync(join(RACINE, "fixtures/references/controles-sans-tesseract.json"), "utf8")) as MesuresInscrites;

/** Les contrôles épinglés **pour l'absence de l'outil**, ramenés à leur chemin dans le dépôt.
 *
 *  Lus des épingles, jamais écrits ici : un rouge épinglé est une réponse légitime à la question
 *  que ce garde-fou pose, et l'écrire deux fois ferait deux vérités à tenir. */
const epinglesPourLAbsence = (): ReadonlySet<string> => {
  const epingles = JSON.parse(
    readFileSync(join(RACINE, "fixtures/references/echecs-connus.json"), "utf8"),
  ) as { epingles: readonly { paquet?: string; fichier?: string; absenceRequise?: readonly string[] }[] };
  const table = paquets();
  const chemins = new Set<string>();
  for (const epingle of epingles.epingles) {
    if (epingle.absenceRequise?.includes("tesseract") !== true) continue;
    const point = epingle.paquet === undefined ? undefined : table.get(epingle.paquet);
    if (point === undefined || epingle.fichier === undefined) continue;
    chemins.add(`${point.split("/").slice(0, -2).join("/")}/${epingle.fichier}`);
  }
  return chemins;
};

const reponses = () => ({
  paquets: paquets(),
  epingles: epinglesPourLAbsence(),
  mesures: new Map(mesuresInscrites().controles.map((un) => [un.chemin, un.empreinte_sha256] as const)),
});

describe("un contrôle qui appelle la reconnaissance porte sa garde (lot 0q)", () => {
  describe("les racines, lues dans le code et non nommées ici", () => {
    it("trouve la fonction qui lance Tesseract sans rattraper son échec", () => {
      const faux = [
        {
          chemin: "faux/ocr.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "export function lireParOcr(image: string): string {\n" +
            '  return execFileSync(options.binaire ?? "tesseract", [image]);\n' +
            "}\n",
        },
      ];
      expect([...racinesQuiEchouentSansTesseract(faux)]).toEqual(["faux/ocr.ts#lireParOcr"]);
    });

    /** Une fonction qui AVALE l'échec n'a pas besoin d'être gardée : sans l'outil, elle rend une
     *  valeur au lieu de lever. `tesseractDisponible` est exactement cela — la garde elle-même —
     *  et l'exiger d'un contrôle qui l'appelle serait circulaire. */
    it("ne retient pas celle dont le rattrapage ne relève rien", () => {
      const faux = [
        {
          chemin: "faux/ocr.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "export function tesseractDisponible(binaire = `tesseract`): boolean {\n" +
            "  try {\n" +
            '    execFileSync(binaire, ["--version"]);\n' +
            "    return true;\n" +
            "  } catch {\n" +
            "    return false;\n" +
            "  }\n" +
            "}\n",
        },
      ];
      expect([...racinesQuiEchouentSansTesseract(faux)]).toEqual([]);
    });

    it("retient celle dont le rattrapage relève de nouveau", () => {
      const faux = [
        {
          chemin: "faux/ocr.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "export function lireParOcr(image: string): string {\n" +
            "  try {\n" +
            '    return execFileSync("tesseract", [image]);\n' +
            "  } catch (souci) {\n" +
            "    throw souci;\n" +
            "  }\n" +
            "}\n",
        },
      ];
      expect([...racinesQuiEchouentSansTesseract(faux)]).toEqual(["faux/ocr.ts#lireParOcr"]);
    });

    /** Trouvé par la première mesure de ce garde-fou sur le dépôt : il désignait `rotationDansOsd`,
     *  une fonction qui ne lance rien et lit une réponse par expression régulière. `\bexec\s*\(`
     *  attrapait `expression.exec(texte)`. Un garde-fou qui accuse à tort finit désarmé. */
    it("ne prend pas une expression régulière appliquée pour un lancement", () => {
      const faux = [
        {
          chemin: "faux/rotation.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "export function rotationDansOsd(sortie: string): number | undefined {\n" +
            "  const trouve = /^Rotate:\\s*(\\d+)/m.exec(sortie);\n" +
            "  return trouve === null ? undefined : Number(trouve[1]);\n" +
            "}\n" +
            "export function rotationParOsd(chemin: string): string {\n" +
            '  return execFileSync("tesseract", [chemin, "stdout", "--psm", "0"]);\n' +
            "}\n",
        },
      ];
      expect([...racinesQuiEchouentSansTesseract(faux)]).toEqual(["faux/rotation.ts#rotationParOsd"]);
    });

    /** Trouvé par la même mesure : `siegfried-embarque.test.ts` lance `otool` et `sf`, et portait
     *  un `` `tesseract` `` dans un **commentaire**. La prose de ce dépôt cite le code entre
     *  accents graves ; sans distinguer le code de la prose, ce garde-fou accusait un fichier qui
     *  ne lance pas la reconnaissance. */
    it("ne prend pas le nom du binaire cité dans un commentaire", () => {
      const faux = [
        {
          chemin: "faux/autre-outil.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "/** Le paquet ne déclarait que `tesseract` : `sf` manquait. */\n" +
            "export function dependances(binaire: string): string {\n" +
            '  return execFileSync("otool", ["-L", binaire], { encoding: "utf8" });\n' +
            "}\n",
        },
      ];
      expect([...racinesQuiEchouentSansTesseract(faux)]).toEqual([]);
    });

    /** Trouvé par ce garde-fou **sur lui-même**, à l'instant où son fichier est devenu suivi par
     *  Git — le piège que ce dépôt a déjà documenté deux fois. Il lance `git` pour lire l'index, et
     *  porte ailleurs le littéral `"tesseract"`, celui d'une épingle. La première règle appariait
     *  « ce module nomme Tesseract » et « cette fonction lance quelque chose » : deux faits vrais,
     *  une conclusion fausse. La question se pose sur l'**argument**, jamais sur le module. */
    it("ne prend pas le lancement d'un AUTRE programme pour celui de la reconnaissance", () => {
      const faux = [
        {
          chemin: "faux/lecteur-d-index.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "export function suivis(racine: string): readonly string[] {\n" +
            '  return execFileSync("git", ["ls-files"], { cwd: racine, encoding: "utf8" }).split("\\n");\n' +
            "}\n" +
            "export function epinglePourLAbsence(epingle: Epingle): boolean {\n" +
            '  return epingle.absenceRequise?.includes("tesseract") === true;\n' +
            "}\n",
        },
      ];
      expect([...racinesQuiEchouentSansTesseract(faux)]).toEqual([]);
    });

    /** Le programme peut être nommé une ligne plus haut, dans une variable. L'écarter rendrait ce
     *  garde-fou aveugle à la forme la plus courante d'un lanceur configurable. */
    it("suit le nom du programme jusqu'à la variable qui le porte", () => {
      const faux = [
        {
          chemin: "faux/ocr.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "export function lireParOcr(image: string, options: Options = {}): string {\n" +
            '  const binaire = options.binaire ?? "tesseract";\n' +
            "  return execFileSync(binaire, [image]);\n" +
            "}\n",
        },
      ];
      expect([...racinesQuiEchouentSansTesseract(faux)]).toEqual(["faux/ocr.ts#lireParOcr"]);
    });

    it("ne lit pas un lancement cité dans une chaîne", () => {
      const faux = [
        {
          chemin: "faux/documentation.ts",
          contenu:
            "export function expliquer(): string {\n" +
            '  return `on écrit execFileSync("tesseract", [image]) pour lire`;\n' +
            "}\n",
        },
      ];
      expect([...racinesQuiEchouentSansTesseract(faux)]).toEqual([]);
    });
  });

  describe("la transitivité, qui est tout l'objet", () => {
    it("remonte d'un appel à l'autre, sur deux étages", () => {
      const faux = [
        {
          chemin: "faux/ocr.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "export function lireParOcr(image: string): string {\n" +
            '  return execFileSync("tesseract", [image]);\n' +
            "}\n",
        },
        {
          chemin: "faux/texte.ts",
          contenu:
            'import { lireParOcr } from "./ocr.js";\n' +
            "export function lireLeTexte(image: string): string {\n" +
            "  return lireParOcr(image);\n" +
            "}\n",
        },
        {
          chemin: "faux/porte.ts",
          contenu:
            'import { lireLeTexte } from "./texte.js";\n' +
            "export function executerTravail(image: string): string {\n" +
            "  return lireLeTexte(image);\n" +
            "}\n",
        },
      ];
      const atteignent = nomsQuiAtteignentTesseract(faux);
      expect(atteignent.has("faux/porte.ts#executerTravail"), "la Porte atteint la reconnaissance").toBe(true);
      expect(atteignent.has("faux/texte.ts#lireLeTexte")).toBe(true);
    });

    /** Un index qui réexporte ne contamine pas ses voisins. Sans cette règle, tout contrôle qui
     *  passe par un index serait accusé, et le dépôt se couvrirait de sauts inutiles. */
    it("ne contamine pas les autres noms d'un index qui réexporte", () => {
      const faux = [
        {
          chemin: "faux/ocr.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "export function lireParOcr(image: string): string {\n" +
            '  return execFileSync("tesseract", [image]);\n' +
            "}\n",
        },
        {
          chemin: "faux/paisible.ts",
          contenu: "export function compter(combien: number): number {\n  return combien + 1;\n}\n",
        },
        {
          chemin: "faux/index.ts",
          contenu: 'export { lireParOcr } from "./ocr.js";\nexport { compter } from "./paisible.js";\n',
        },
      ];
      const atteignent = nomsQuiAtteignentTesseract(faux);
      expect(atteignent.has("faux/index.ts#lireParOcr"), "le nom réexporté garde sa nature").toBe(true);
      expect(atteignent.has("faux/index.ts#compter"), "son voisin n'a rien à voir").toBe(false);
    });

    it("ne prend pas une méthode de même nom pour la fonction", () => {
      const faux = [
        {
          chemin: "faux/ocr.ts",
          contenu:
            'import { execFileSync } from "node:child_process";\n' +
            "export function lireParOcr(image: string): string {\n" +
            '  return execFileSync("tesseract", [image]);\n' +
            "}\n",
        },
        {
          chemin: "faux/autre.ts",
          contenu:
            'import { lireParOcr } from "./ocr.js";\n' +
            "export function paisible(lecteur: Lecteur): string {\n" +
            "  return lecteur.lireParOcr();\n" +
            "}\n",
        },
      ];
      expect(nomsQuiAtteignentTesseract(faux).has("faux/autre.ts#paisible")).toBe(false);
    });
  });

  describe("l'accusation, et ce qui l'évite", () => {
    const ocr = {
      chemin: "faux/ocr.ts",
      contenu:
        'import { execFileSync } from "node:child_process";\n' +
        "export function lireParOcr(image: string): string {\n" +
        '  return execFileSync("tesseract", [image]);\n' +
        "}\n" +
        "export function tesseractDisponible(): boolean {\n" +
        "  try {\n" +
        '    execFileSync("tesseract", ["--version"]);\n' +
        "    return true;\n" +
        "  } catch {\n" +
        "    return false;\n" +
        "  }\n" +
        "}\n",
    };

    it("accuse un contrôle qui appelle la reconnaissance sans garde", () => {
      const faux = [
        ocr,
        {
          chemin: "faux/test/lecture.test.ts",
          contenu:
            'import { lireParOcr } from "../ocr.js";\n' +
            'it("lit une page", () => {\n' +
            '  expect(lireParOcr("une.png")).toContain("mot");\n' +
            "});\n",
        },
      ];
      expect(controlesSansGarde(faux)).toEqual([
        { chemin: "faux/test/lecture.test.ts", nom: "lireParOcr", pourquoi: "jamais mesuré" },
      ]);
    });

    it("laisse passer le même contrôle muni de sa garde", () => {
      const faux = [
        ocr,
        {
          chemin: "faux/test/lecture.test.ts",
          contenu:
            'import { lireParOcr, tesseractDisponible } from "../ocr.js";\n' +
            "const siTesseract = tesseractDisponible() ? it : it.skip;\n" +
            'siTesseract("lit une page", () => {\n' +
            '  expect(lireParOcr("une.png")).toContain("mot");\n' +
            "});\n",
        },
      ];
      expect(controlesSansGarde(faux)).toEqual([]);
    });

    /** La garde se déclare, elle ne se mentionne pas : un fichier qui appelle
     *  `tesseractDisponible()` sans jamais sauter n'est pas gardé. */
    it("n'accepte pas une garde qui ne fait sauter personne", () => {
      const faux = [
        ocr,
        {
          chemin: "faux/test/lecture.test.ts",
          contenu:
            'import { lireParOcr, tesseractDisponible } from "../ocr.js";\n' +
            'it("lit une page", () => {\n' +
            "  expect(tesseractDisponible()).toBe(true);\n" +
            '  expect(lireParOcr("une.png")).toContain("mot");\n' +
            "});\n",
        },
      ];
      expect(controlesSansGarde(faux)).toEqual([
        { chemin: "faux/test/lecture.test.ts", nom: "lireParOcr", pourquoi: "jamais mesuré" },
      ]);
    });

    it("n'accuse qu'un fichier de contrôle, jamais une source ni une mesure", () => {
      const faux = [
        ocr,
        {
          chemin: "faux/mesures/une-mesure.ts",
          contenu: 'import { lireParOcr } from "../ocr.js";\nlireParOcr("une.png");\n',
        },
        {
          chemin: "faux/src/usage.ts",
          contenu:
            'import { lireParOcr } from "../ocr.js";\n' +
            "export function lire(image: string): string {\n  return lireParOcr(image);\n}\n",
        },
      ];
      expect(controlesSansGarde(faux)).toEqual([]);
    });

    it("ne lit pas un appel cité dans une chaîne de son propre contrôle", () => {
      const faux = [
        ocr,
        {
          chemin: "faux/test/citation.test.ts",
          contenu:
            'import { lireParOcr } from "../ocr.js";\n' +
            "const exemple = `on appelle lireParOcr(\"une.png\") pour lire`;\n" +
            'it("cite du code", () => {\n  expect(exemple).toContain("lireParOcr");\n});\n',
        },
      ];
      expect(controlesSansGarde(faux)).toEqual([]);
    });

    const sansGarde = {
      chemin: "faux/test/lecture.test.ts",
      contenu:
        'import { lireParOcr } from "../ocr.js";\n' +
        'it("lit une page", () => {\n  expect(lireParOcr("une.png")).toContain("mot");\n});\n',
    };

    /** Un rouge épinglé **pour l'absence de l'outil** est une réponse légitime : il est connu,
     *  daté, et sa levée est une étape identifiée. Exiger en plus un saut effacerait le rouge que
     *  l'épingle existe pour garder visible. */
    it("laisse passer un contrôle épinglé pour l'absence de l'outil", () => {
      expect(
        controlesSansGarde([ocr, sansGarde], { epingles: new Set([sansGarde.chemin]) }),
      ).toEqual([]);
    });

    /** La troisième réponse : la survie **mesurée**. C'est elle qui évite de couvrir le dépôt de
     *  sauts inutiles, et elle ne vaut que pour les octets mesurés. */
    it("laisse passer un contrôle dont la survie est mesurée sur ce contenu", () => {
      const mesures = new Map([[sansGarde.chemin, empreinteDuControle(sansGarde.contenu)]]);
      expect(controlesSansGarde([ocr, sansGarde], { mesures })).toEqual([]);
    });

    it("refuse le même contrôle dès qu'il a changé depuis sa mesure", () => {
      const mesures = new Map([[sansGarde.chemin, empreinteDuControle(sansGarde.contenu)]]);
      const modifie = { ...sansGarde, contenu: `${sansGarde.contenu}// une ligne de plus\n` };
      expect(controlesSansGarde([ocr, modifie], { mesures })).toEqual([
        { chemin: sansGarde.chemin, nom: "lireParOcr", pourquoi: "mesure périmée" },
      ]);
    });
  });

  describe("sur le dépôt lui-même", () => {
    it("lit assez de noms pour que la mesure veuille dire quelque chose", () => {
      const sources = suivis();
      const racines = racinesQuiEchouentSansTesseract(sources);
      expect(racines.size, "le dépôt lance Tesseract à des endroits connus").toBeGreaterThanOrEqual(3);
      expect(
        [...racines].some((nom) => nom.endsWith("#lireParOcr")),
        "la lecture par OCR est une racine",
      ).toBe(true);
      expect(
        [...racines].some((nom) => nom.endsWith("#tesseractDisponible")),
        "la garde elle-même n'en est pas une",
      ).toBe(false);

      const atteignent = nomsQuiAtteignentTesseract(sources, paquets());
      expect(
        [...atteignent].some((nom) => nom.endsWith("#executerTravail")),
        "la Porte atteint la reconnaissance, par deux étages d'appels",
      ).toBe(true);
    });

    /** Le graphe sert d'abord à **réduire la question** : de deux cents fichiers de contrôle à la
     *  poignée qui doit répondre. Ce compte est écrit pour qu'un lecteur devenu aveugle se voie. */
    it("réduit le dépôt à la poignée de contrôles qui doivent répondre", () => {
      const fichiers = new Set(controlesQuiPeuventAtteindre(suivis(), paquets()).map((un) => un.chemin));
      expect(fichiers.size, "aucun candidat : le graphe ne lit plus rien").toBeGreaterThanOrEqual(10);
      expect(fichiers.size, "tout le dépôt accusé : le graphe contamine").toBeLessThan(40);
      expect(
        fichiers.has("outils/ingestion/test/la-porte-relit-les-cases.test.ts"),
        "le fichier qui a fait tomber la course du 12 novembre doit être du nombre",
      ).toBe(true);
    });

    it("n'accuse aucun contrôle du dépôt", () => {
      expect(controlesSansGarde(suivis(), reponses())).toEqual([]);
    });

    it("n'inscrit aucune survie sans sa raison ni son empreinte", () => {
      for (const controle of mesuresInscrites().controles) {
        expect(controle.pourquoi.length, controle.chemin).toBeGreaterThan(40);
        expect(controle.empreinte_sha256, controle.chemin).toMatch(/^[0-9a-f]{64}$/u);
      }
    });

    /** Une mesure inscrite pour un fichier qui n'existe plus ne protège rien et laisse croire
     *  qu'elle protège : c'est le même défaut qu'une épingle périmée. */
    it("n'inscrit aucune survie pour un fichier que le dépôt ne porte plus", () => {
      const connus = new Set(suivis().map((source) => source.chemin));
      for (const controle of mesuresInscrites().controles) expect(connus.has(controle.chemin), controle.chemin).toBe(true);
    });
  });
});
