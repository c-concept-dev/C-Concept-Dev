// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/** Les licences des moteurs viennent de **l'archive**, la chaîne du **commit** (lot 0u ter).
 *
 *  ## D'où vient ce garde-fou
 *
 *  D'un rouge de la course du 16 novembre 2026. `collecter-licences.py` commençait par effacer
 *  `moteurs/licences`, que l'archive venait de déposer, puis cherchait les textes sous le Cellar de
 *  Homebrew. Le lot 0u ayant retiré `brew install tesseract tesseract-lang`, il n'y avait plus rien
 *  à trouver : « tessdata : aucun texte à côté des fichiers de langue ». **Le garde-fou avait
 *  raison de refuser** — il ne pouvait pas prouver les licences d'un paquet qu'on s'apprêtait à
 *  distribuer.
 *
 *  Et recollecter depuis Homebrew aurait été **pire que vérifier** : Homebrew livre tesseract
 *  `5.5.4` sur la CI quand l'archive embarque `5.5.1`, et une licence qui décrit une autre version
 *  que le binaire qu'elle accompagne ne couvre rien.
 *
 *  ## Ce que ces contrôles prouvent, et ce qu'ils ne prouvent pas
 *
 *  Ils prouvent la mécanique : ce que la collecte garde, ce qu'elle recollecte, et ce qu'elle
 *  refuse. Ils ne disent pas que le paquet a le **droit** d'être distribué — lire les conditions
 *  d'une licence appartient à Christophe, comme le dit déjà `licences-embarquees.test.ts`.
 *
 *  ## Pourquoi un faux Cellar, et pourquoi il fallait un point d'entrée pour ça
 *
 *  Le refus de `--fabriquer` se déclenche quand Homebrew livre une autre version que l'épingle.
 *  **Mesuré le 17 novembre 2026** : la machine de Christophe porte `tesseract 5.5.1`, c'est-à-dire
 *  justement la version épinglée. Le refus n'y est donc pas observable avec le vrai Cellar, et
 *  l'attendre d'une mise à jour de Homebrew serait l'éprouver par accident. D'où
 *  `LIENOTHEQUE_CELLAR_DE_CONTROLE`, nommé pour ce qu'il est. */

const OUTIL = fileURLToPath(
  new URL("../../../apps/app/src-tauri/outils/collecter-licences.py", import.meta.url),
);
const DELAI = 120_000;
const bacs: string[] = [];
afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

const EPINGLES = {
  tesseract: "5.5.1",
  leptonica: "1.86.0",
  node: "24.11.1",
  siegfried: "1.11.9",
} as const;

interface Paquet {
  readonly bac: string;
  readonly projet: string;
  readonly outil: string;
  readonly moteurs: string;
  readonly licences: string;
}

const annonceur = (chemin: string, dit: string): void => {
  writeFileSync(chemin, `#!/bin/sh\ncat <<'FIN'\n${dit}\nFIN\n`);
  chmodSync(chemin, 0o755);
};

/** Un `src-tauri` jetable, avec l'outil **copié** : il calcule ses chemins depuis `__file__`, donc
 *  il lit le faux paquet et jamais le vrai. Le dépôt est un vrai dépôt git, parce que la collecte
 *  demande le commit de la chaîne. */
function paquetJetable(options: { readonly tesseractAnnonce?: string } = {}): Paquet {
  const bac = mkdtempSync(join(tmpdir(), "licences-moteurs-"));
  bacs.push(bac);
  const projet = join(bac, "projet");
  const racine = join(projet, "apps", "app", "src-tauri");
  const outils = join(racine, "outils");
  const moteurs = join(racine, "moteurs");
  const licences = join(moteurs, "licences");
  for (const dossier of [outils, join(moteurs, "bin"), join(moteurs, "lib"), join(moteurs, "tessdata"), join(moteurs, "chaine"), join(moteurs, "siegfried"), licences, join(projet, "fixtures")]) {
    mkdirSync(dossier, { recursive: true });
  }
  copyFileSync(OUTIL, join(outils, "collecter-licences.py"));

  // Les épingles, lues par la collecte. Donnée minimale, de la même forme que la vraie.
  writeFileSync(
    join(projet, "fixtures", "moteurs-de-lecture.json"),
    JSON.stringify({
      programme: { version_tesseract: EPINGLES.tesseract, version_leptonica: EPINGLES.leptonica },
    }),
  );

  // Les programmes embarqués, qui annoncent leur version comme les vrais.
  annonceur(
    join(moteurs, "bin", "tesseract"),
    `tesseract ${options.tesseractAnnonce ?? EPINGLES.tesseract}\n leptonica-${EPINGLES.leptonica} (fausse)`,
  );
  annonceur(join(moteurs, "bin", "node"), `v${EPINGLES.node}`);
  annonceur(join(moteurs, "bin", "sf"), `siegfried ${EPINGLES.siegfried}`);
  writeFileSync(join(moteurs, "lib", "libpng16.dylib"), "pas un vrai Mach-O");
  writeFileSync(join(moteurs, "tessdata", "fra.traineddata"), "pas de vraies données");
  writeFileSync(join(moteurs, "siegfried", "default.sig"), "pas une vraie signature");
  writeFileSync(join(moteurs, "chaine", "LICENSE"), "la licence de la chaîne\n");

  // Ce que l'archive aurait déposé : les textes, et l'inventaire qui les annonce.
  const composants: Record<string, unknown> = {};
  for (const [nom, version] of Object.entries(EPINGLES)) {
    const dossier = join(licences, `${nom}-${version}`);
    mkdirSync(dossier, { recursive: true });
    const texte = `licence de ${nom} ${version}\n`;
    writeFileSync(join(dossier, "LICENSE"), texte);
    composants[nom] = {
      version,
      source: `archive publiée (${nom} ${version})`,
      textes: [{ fichier: "LICENSE", empreinte_sha256: condense(texte) }],
      redistribue: [nom],
    };
  }
  const tessdata = join(licences, "tessdata");
  mkdirSync(tessdata, { recursive: true });
  writeFileSync(join(tessdata, "LICENSE"), "licence des données de langue\n");
  composants["tessdata"] = {
    version: "livré avec les formules",
    source: "archive publiée",
    textes: [{ fichier: "LICENSE", empreinte_sha256: condense("licence des données de langue\n") }],
    redistribue: ["fra.traineddata"],
  };
  // L'entrée « chaine » de l'archive : périmée par construction, elle doit être remplacée.
  composants["chaine"] = {
    version: "livrés dans la chaîne elle-même",
    source: "moteurs/chaine",
    textes: [{ fichier: "chaine/DISPARU", empreinte_sha256: condense("ce texte n'existe plus") }],
    redistribue: ["chaine"],
  };
  writeFileSync(
    join(licences, "INVENTAIRE.json"),
    `${JSON.stringify({ description: "faux inventaire de contrôle", composants }, undefined, 1)}\n`,
  );

  const git = (...a: readonly string[]): string =>
    execFileSync("git", [...a], {
      cwd: projet,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "banc",
        GIT_AUTHOR_EMAIL: "banc@essai",
        GIT_COMMITTER_NAME: "banc",
        GIT_COMMITTER_EMAIL: "banc@essai",
      },
    });
  execFileSync("git", ["init", "-b", "principale", projet]);
  git("add", "fixtures/moteurs-de-lecture.json");
  git("commit", "--no-verify", "-m", "le socle du faux depot");

  return { bac, projet, outil: join(outils, "collecter-licences.py"), moteurs, licences };
}

import { createHash } from "node:crypto";
function condense(contenu: string): string {
  return createHash("sha256").update(Buffer.from(contenu, "utf8")).digest("hex");
}

const collecter = (
  paquet: Paquet,
  arguments_: readonly string[] = [],
  env: Readonly<Record<string, string>> = {},
): { readonly code: number; readonly dit: string } => {
  const fait = spawnSync("python3", ["-I", paquet.outil, ...arguments_], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { code: fait.status ?? -1, dit: `${fait.stdout ?? ""}${fait.stderr ?? ""}` };
};

const inventaireDe = (paquet: Paquet): Record<string, { version: string; commit?: string; textes: { fichier: string }[] }> =>
  JSON.parse(readFileSync(join(paquet.licences, "INVENTAIRE.json"), "utf8")).composants;

describe("les licences des moteurs viennent de l'archive, la chaîne du commit (lot 0u ter)", () => {
  it(
    "garde les textes de l'archive et recollecte la seule chaîne",
    () => {
      const paquet = paquetJetable();
      const avant = readFileSync(join(paquet.licences, `tesseract-${EPINGLES.tesseract}`, "LICENSE"), "utf8");

      const verdict = collecter(paquet);
      expect(verdict.dit).not.toContain("Traceback");
      expect(verdict.code, verdict.dit).toBe(0);

      // Les textes de l'archive sont là, octet pour octet : rien n'a été effacé puis refait.
      expect(
        readFileSync(join(paquet.licences, `tesseract-${EPINGLES.tesseract}`, "LICENSE"), "utf8"),
      ).toBe(avant);
      const inventaire = inventaireDe(paquet);
      expect(Object.keys(inventaire).sort()).toEqual(
        ["chaine", "leptonica", "node", "siegfried", "tessdata", "tesseract"].sort(),
      );
      // Et l'entrée « chaine » de l'archive, périmée, a bien été remplacée par celle du paquet.
      expect(inventaire["chaine"]?.textes.map((t) => t.fichier)).toEqual(["chaine/LICENSE"]);
    },
    DELAI,
  );

  it(
    "l'entrée « chaine » dit de quel commit elle vient",
    () => {
      const paquet = paquetJetable();
      expect(collecter(paquet).code).toBe(0);
      const attendu = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: paquet.projet,
        encoding: "utf8",
      }).trim();
      const commit = inventaireDe(paquet)["chaine"]?.commit ?? "";
      expect(commit, "sans commit, l'entrée ne dit pas de quelles sources elle répond").toContain(attendu);
    },
    DELAI,
  );

  it(
    "refuse quand « git rev-parse » ne répond pas, et n'écrit aucun inventaire",
    () => {
      // Exigé par Christophe : jamais d'entrée « chaine » sans commit. On retire le dépôt git
      // plutôt que de simuler une panne : c'est la même absence de réponse, sans mise en scène.
      const paquet = paquetJetable();
      rmSync(join(paquet.projet, ".git"), { recursive: true, force: true });
      const temoin = readFileSync(join(paquet.licences, "INVENTAIRE.json"), "utf8");

      const verdict = collecter(paquet, [], { GIT_CEILING_DIRECTORIES: paquet.bac });
      expect(verdict.code, verdict.dit).not.toBe(0);
      expect(verdict.dit).toContain("rev-parse");
      expect(verdict.dit, "le refus doit dire ce qui manque").toContain("sans dire lequel");
      // Et l'inventaire d'avant est intact : un refus qui écrit quand même n'a rien refusé.
      expect(readFileSync(join(paquet.licences, "INVENTAIRE.json"), "utf8")).toBe(temoin);
    },
    DELAI,
  );

  it(
    "refuse un texte que l'inventaire annonce et que le paquet n'a pas",
    () => {
      const paquet = paquetJetable();
      rmSync(join(paquet.licences, `node-${EPINGLES.node}`, "LICENSE"));
      const verdict = collecter(paquet);
      expect(verdict.code).not.toBe(0);
      expect(verdict.dit).toContain("node");
      expect(verdict.dit).toContain("absent du paquet");
    },
    DELAI,
  );

  it(
    "refuse un texte présent dont l'empreinte n'est pas celle annoncée",
    () => {
      const paquet = paquetJetable();
      writeFileSync(join(paquet.licences, `siegfried-${EPINGLES.siegfried}`, "LICENSE"), "un autre texte\n");
      const verdict = collecter(paquet);
      expect(verdict.code).not.toBe(0);
      expect(verdict.dit).toContain("son empreinte diffère");
    },
    DELAI,
  );

  it(
    "refuse quand le programme embarqué annonce une autre version que l'épingle",
    () => {
      // C'est l'exigence de Christophe prise au mot : « vérifie que chaque texte de l'archive
      // décrit la version embarquée ». L'inventaire dit 5.5.1, le binaire dit 5.5.4.
      const paquet = paquetJetable({ tesseractAnnonce: "5.5.4" });
      const verdict = collecter(paquet);
      expect(verdict.code).not.toBe(0);
      expect(verdict.dit).toContain("le paquet ANNONCE 5.5.4");
      expect(verdict.dit).toContain(`l'épingle dit ${EPINGLES.tesseract}`);
      expect(verdict.dit, "le refus doit renvoyer à la décision à prendre").toContain(
        "DÉCISION À PART",
      );
    },
    DELAI,
  );

  it(
    "refuse --fabriquer quand Homebrew livre une autre version que l'épingle",
    () => {
      const paquet = paquetJetable();
      // Un faux Cellar, parce que celui de la machine porte justement la version épinglée.
      const cellar = join(paquet.bac, "Cellar");
      mkdirSync(join(cellar, "tesseract", "5.5.4", "bin"), { recursive: true });
      writeFileSync(join(cellar, "tesseract", "5.5.4", "bin", "tesseract"), "faux binaire");
      writeFileSync(join(cellar, "tesseract", "5.5.4", "LICENSE"), "licence 5.5.4\n");
      const temoin = readFileSync(join(paquet.licences, `tesseract-${EPINGLES.tesseract}`, "LICENSE"), "utf8");

      const verdict = collecter(paquet, ["--fabriquer"], {
        LIENOTHEQUE_CELLAR_DE_CONTROLE: cellar,
      });
      expect(verdict.code, verdict.dit).not.toBe(0);
      expect(verdict.dit).toContain("Homebrew livre 5.5.4");
      expect(verdict.dit).toContain(`l'épingle dit ${EPINGLES.tesseract}`);
      // Et le refus tombe AVANT tout effacement : les textes de l'archive sont intacts. Sans
      // cela, un refus juste laisserait un paquet mutilé — et ne téléchargerait l'amont pour rien.
      expect(
        readFileSync(join(paquet.licences, `tesseract-${EPINGLES.tesseract}`, "LICENSE"), "utf8"),
      ).toBe(temoin);
    },
    DELAI,
  );

  it(
    "refuse quand l'archive n'a pas été déployée",
    () => {
      const paquet = paquetJetable();
      rmSync(join(paquet.licences, "INVENTAIRE.json"));
      const verdict = collecter(paquet);
      expect(verdict.code).not.toBe(0);
      expect(verdict.dit).toContain("archive");
      expect(verdict.dit, "le refus doit dire quoi faire").toContain("--fabriquer");
    },
    DELAI,
  );

  it("l'outil du dépôt est bien celui que ces contrôles copient", () => {
    // Un contrôle qui ne saute jamais : si le chemin se périme, les sept autres fabriqueraient un
    // paquet sans outil et échoueraient pour une raison qui n'a rien à voir.
    expect(existsSync(OUTIL), `introuvable : ${OUTIL}`).toBe(true);
  });
});
