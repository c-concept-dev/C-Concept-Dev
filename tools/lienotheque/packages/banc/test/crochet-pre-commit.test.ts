// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/** Le crochet refuse-t-il vraiment un commit fautif ?
 *
 *  La décision est éprouvée à part, en pur. Ce contrôle-ci éprouve la **mécanique** : un vrai
 *  dépôt, un vrai index, le vrai programme, un vrai code de sortie. Sans lui, on saurait que la
 *  règle est juste sans savoir qu'elle s'applique — exactement le défaut que ce crochet existe
 *  pour corriger, un étage plus haut. */

const JUGE = fileURLToPath(new URL("../scripts/avant-commit.ts", import.meta.url));

/** L'outil INSTALLÉ du projet. Le lanceur de paquets, lui, résout un nom et, faute de le trouver,
 *  TÉLÉCHARGE : un garde-fou ne doit pas pouvoir chercher son juge sur le réseau, et un contrôle
 *  ne doit pas dépendre d'une résolution. Mesuré : la résolution coûte 0,5 s par commit. */
const OUTIL = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const OUTILS_INSTALLES = fileURLToPath(new URL("../node_modules", import.meta.url));

/** Le délai des contrôles qui lancent un vrai `git commit`.
 *
 *  Le délai par défaut est de 5 000 ms. Sur le coureur macOS, ce contrôle a mis **4 945 ms** dans
 *  une course verte, puis **7 704 ms** dans la suivante : la course verte était passée à 55 ms
 *  près. C'est, mot pour mot, la leçon inscrite le matin même — « un délai égal au coût est un
 *  tirage au sort » — et je l'avais commise en déclarant cette CI verte sans regarder la marge.
 *
 *  180 000 est le nombre que les voisins de `voie-oracle.test.ts` emploient déjà : on ne calibre
 *  pas un nombre neuf sur la mesure du jour, sous peine de refaire le même tirage au sort. */
const DELAI = 180_000;
const bacs: string[] = [];
afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

/** Un dépôt jetable, avec sa liste de termes et les fichiers qu'on veut lui faire porter. */
function depot(fichiers: Record<string, string>): string {
  const bac = mkdtempSync(join(tmpdir(), "crochet-"));
  bacs.push(bac);
  execFileSync("git", ["init", "--quiet"], { cwd: bac });
  mkdirSync(join(bac, "fixtures"), { recursive: true });
  writeFileSync(
    join(bac, "fixtures/termes-de-domaine.json"),
    JSON.stringify({ zones: [{ chemin: "paquet/src" }], termes: ["thérapie"], exceptions: [] }),
  );
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(join(bac, chemin, ".."), { recursive: true });
    writeFileSync(join(bac, chemin), contenu);
  }
  execFileSync("git", ["add", "-A"], { cwd: bac });
  return bac;
}

const juger = (bac: string): { readonly code: number; readonly dit: string } => {
  try {
    const sortie = execFileSync(OUTIL, [JUGE, "--racine", bac], { encoding: "utf8", stdio: "pipe" });
    return { code: 0, dit: sortie };
  } catch (souci) {
    const echec = souci as { status?: number; stdout?: string; stderr?: string };
    return { code: echec.status ?? -1, dit: `${echec.stdout ?? ""}${echec.stderr ?? ""}` };
  }
};

describe("le crochet de pré-commit refuse un commit fautif", () => {
  it("accepte un index propre", () => {
    const verdict = juger(depot({ "paquet/src/index.ts": "export const rien = 1;\n" }));
    expect(verdict.code).toBe(0);
    expect(verdict.dit).toContain("rien à redire");
  });

  it("refuse un fichier fantôme", () => {
    const verdict = juger(depot({ "paquet/src/index.ts": 'export * from "./absent.js";\n' }));
    expect(verdict.code).toBe(1);
    expect(verdict.dit).toContain("fichier fantôme");
    expect(verdict.dit).toContain("./absent.js");
  });

  it("refuse un PDF", () => {
    const verdict = juger(depot({ "docs/recueil.pdf": "%PDF-1.4\n", "paquet/src/index.ts": "export const a = 1;\n" }));
    expect(verdict.code).toBe(1);
    expect(verdict.dit).toContain("recueil.pdf");
  });

  it("refuse un mot de domaine (CLA-01)", () => {
    const verdict = juger(depot({ "paquet/src/lecture.ts": "// une approche de thérapie brève\n" }));
    expect(verdict.code).toBe(1);
    expect(verdict.dit).toContain("thérapie");
  });

  it("dit que --no-verify est interdit, pour que personne ne l'apprenne ailleurs", () => {
    const verdict = juger(depot({ "paquet/src/index.ts": 'export * from "./absent.js";\n' }));
    expect(verdict.dit).toContain("--no-verify est INTERDIT");
  });

  it("nomme toutes les fautes d'un seul coup", () => {
    const verdict = juger(
      depot({ "docs/recueil.pdf": "%PDF-1.4\n", "paquet/src/index.ts": '// thérapie\nexport * from "./absent.js";\n' }),
    );
    expect(verdict.code).toBe(1);
    expect(verdict.dit).toContain("recueil.pdf");
    expect(verdict.dit).toContain("absent.js");
    expect(verdict.dit).toContain("thérapie");
  });
});

/** ## En conditions réelles : un vrai `git commit -- <chemins>`
 *
 *  Les contrôles ci-dessus appellent le juge **directement**, sur un dépôt dont le projet est la
 *  racine. Ils prouvent que la règle s'applique ; ils ne prouvent pas que le crochet la reçoit
 *  dans les conditions où git l'appelle. Or c'est là que le défaut vivait.
 *
 *  Mesuré le 7 novembre 2026 sur un dépôt fabriqué : pendant un `pre-commit`, git **n'exporte pas**
 *  `GIT_DIR` — j'avais écrit le contraire. Il exporte `GIT_INDEX_FILE`, et sur un
 *  `git commit -- <chemins>` celui-ci désigne un index temporaire qui contient **exactement** le
 *  commit : `git diff --cached` n'y voit que les chemins nommés. C'est ce qui permet au crochet de
 *  sortir sans rien lancer quand le commit ne touche pas la Liénothèque.
 *
 *  Le défaut reste atteignable autrement : `GIT_DIR` posé à la main, par une enveloppe ou un alias,
 *  et `ls-files` passe de 852 chemins du projet à 8147 du dépôt. Le dernier contrôle de ce bloc le
 *  tient. */

const CROCHET = fileURLToPath(new URL("../../../crochets/pre-commit", import.meta.url));
const PROJET = "tools/lienotheque";

/** Un dépôt jetable à l'image du nôtre : le projet dans un sous-dossier, un autre projet à côté. */
function depotAvecProjet(fichiers: Record<string, string>): string {
  const bac = mkdtempSync(join(tmpdir(), "crochet-reel-"));
  bacs.push(bac);
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: bac, encoding: "utf8", stdio: "pipe" });
  git("init", "--quiet", "-b", "principale", ".");
  git("config", "user.email", "banc@essai");
  git("config", "user.name", "banc");

  const ecrire = (relatif: string, contenu: string): void => {
    mkdirSync(join(bac, relatif, ".."), { recursive: true });
    writeFileSync(join(bac, relatif), contenu);
  };
  ecrire("autre-projet/fichier.txt", "rien\n");
  ecrire(
    `${PROJET}/fixtures/termes-de-domaine.json`,
    JSON.stringify({ zones: [{ chemin: "paquet/src" }], termes: ["thérapie"], exceptions: [] }),
  );
  for (const [relatif, contenu] of Object.entries(fichiers)) ecrire(`${PROJET}/${relatif}`, contenu);
  git("add", "--", "autre-projet", PROJET);
  // Le commit de départ est fait AVANT d'installer le crochet : rien à contourner.
  git("commit", "--quiet", "-m", "départ");

  // Le crochet est copié TEL QUEL, et le contrôle le vérifie — sinon il éprouverait autre chose.
  mkdirSync(join(bac, PROJET, "crochets"), { recursive: true });
  copyFileSync(CROCHET, join(bac, PROJET, "crochets/pre-commit"));
  chmodSync(join(bac, PROJET, "crochets/pre-commit"), 0o755);
  expect(readFileSync(join(bac, PROJET, "crochets/pre-commit"))).toEqual(readFileSync(CROCHET));

  // Le juge du dépôt fabriqué n'est qu'un relais vers le vrai : le crochet reste intact, et le
  // vrai juge voit le dossier du projet fabriqué comme dossier courant.
  mkdirSync(join(bac, PROJET, "packages/banc/scripts"), { recursive: true });
  writeFileSync(join(bac, PROJET, "packages/banc/scripts/avant-commit.ts"), `import ${JSON.stringify(JUGE)};\n`);
  // Le crochet cherche son juge dans les outils INSTALLÉS du projet : le dépôt fabriqué doit
  // porter ce chemin, sinon le contrôle éprouverait un crochet qui n'a pas de juge.
  mkdirSync(join(bac, PROJET, "packages/banc"), { recursive: true });
  symlinkSync(OUTILS_INSTALLES, join(bac, PROJET, "packages/banc/node_modules"));

  git("config", "core.hooksPath", `${PROJET}/crochets`);
  return bac;
}

/** Les deux sorties, réunies — et c'est le contrôle lui-même qui l'a imposé.
 *
 *  Première version : `execFileSync`, qui ne rend que la sortie standard. Or **git renvoie la
 *  sortie d'un crochet sur l'erreur standard**, même quand le commit réussit. Le contrôle « le juge
 *  n'a pas tourné » passait donc sans rien prouver : il cherchait une phrase là où elle ne pouvait
 *  pas être. Un contrôle vert parce qu'il regarde ailleurs est le défaut que ce lot combat. */
const commiter = (
  bac: string,
  chemins: readonly string[],
  env?: Record<string, string>,
): { readonly code: number; readonly dit: string } => {
  const rendu = spawnSync("git", ["commit", "-m", "essai", "--", ...chemins], {
    cwd: bac,
    encoding: "utf8",
    ...(env === undefined ? {} : { env }),
  });
  return { code: rendu.status ?? -1, dit: `${rendu.stdout ?? ""}${rendu.stderr ?? ""}` };
};

/** Un environnement SANS Node : ce dépôt porte neuf projets, et un commit qui ne touche pas la
 *  Liénothèque ne doit rien leur coûter — pas même d'avoir Node installé. */
const SANS_NODE = { PATH: "/usr/bin:/bin", HOME: process.env["HOME"] ?? "/tmp" };

describe("le crochet, appelé par git lui-même", () => {
  it("refuse un commit fautif nommé par ses chemins", () => {
    const bac = depotAvecProjet({ "paquet/src/index.ts": "export const a = 1;\n" });
    writeFileSync(join(bac, PROJET, "paquet/src/index.ts"), 'export * from "./absent.js";\n');
    const verdict = commiter(bac, [`${PROJET}/paquet/src/index.ts`]);
    expect(verdict.code).not.toBe(0);
    expect(verdict.dit).toContain("fichier fantôme");
    expect(verdict.dit).toContain("--no-verify est INTERDIT");
    // Et le commit n'a pas eu lieu.
    expect(execFileSync("git", ["log", "--oneline"], { cwd: bac, encoding: "utf8" }).trim().split("\n")).toHaveLength(1);
  }, DELAI);

  it("laisse passer un commit qui ne touche pas la Liénothèque, sans rien lancer", () => {
    // La faute est sur le disque ET dans l'index du dépôt, mais pas dans l'index DE CE COMMIT :
    // c'est tout l'intérêt de lire GIT_INDEX_FILE, et non l'index du dépôt.
    const bac = depotAvecProjet({ "paquet/src/index.ts": "export const a = 1;\n" });
    writeFileSync(join(bac, PROJET, "paquet/src/index.ts"), 'export * from "./absent.js";\n');
    execFileSync("git", ["add", "--", `${PROJET}/paquet/src/index.ts`], { cwd: bac });
    writeFileSync(join(bac, "autre-projet/fichier.txt"), "autre chose\n");

    const verdict = commiter(bac, ["autre-projet/fichier.txt"]);
    expect(verdict.code).toBe(0);
    expect(verdict.dit).not.toContain("COMMIT REFUSÉ");
    // Le juge n'a pas tourné : un commit d'un autre projet ne doit rien coûter, même si Node
    // manque. S'il avait tourné, il aurait parlé.
    expect(verdict.dit).not.toContain("avant-commit :");
  }, DELAI);

  it("accepte un index propre, et compte les chemins DU PROJET, non ceux du dépôt", () => {
    const bac = depotAvecProjet({ "paquet/src/index.ts": "export const a = 1;\n" });
    writeFileSync(join(bac, PROJET, "paquet/src/index.ts"), "export const a = 2;\n");
    const verdict = commiter(bac, [`${PROJET}/paquet/src/index.ts`]);
    expect(verdict.code).toBe(0);
    const compte = /(\d+) chemin\(s\) du projet sur (\d+)/u.exec(verdict.dit);
    expect(compte, verdict.dit).not.toBeNull();
    const [, projet, total] = compte as RegExpExecArray;
    expect(Number(projet)).toBeGreaterThan(0);
    expect(Number(projet)).toBeLessThan(Number(total)); // jamais tout le dépôt
    expect(verdict.dit).toContain(`préfixe « ${PROJET} » retiré`);
  }, DELAI);

  it("laisse passer un commit hors Liénothèque même SANS Node, et refuse le nôtre", () => {
    const bac = depotAvecProjet({ "paquet/src/index.ts": "export const a = 1;\n" });
    // La preuve que l'environnement est bien dépourvu : sans Node, le juge ne peut pas démarrer.
    expect(spawnSync(OUTIL, ["--version"], { env: SANS_NODE }).status, "l outil reste utilisable").not.toBe(0);

    writeFileSync(join(bac, "autre-projet/fichier.txt"), "autre chose\n");
    const dehors = commiter(bac, ["autre-projet/fichier.txt"], SANS_NODE);
    expect(dehors.code, dehors.dit).toBe(0);

    // Et pour un chemin de la Liénothèque, le crochet échoue FERMÉ : sans juge, pas de commit.
    writeFileSync(join(bac, PROJET, "paquet/src/index.ts"), "export const a = 2;\n");
    const dedans = commiter(bac, [`${PROJET}/paquet/src/index.ts`], SANS_NODE);
    expect(dedans.code, dedans.dit).not.toBe(0);
  }, DELAI);

  it("refuse tout court si l'index du commit ne porte aucun chemin du projet", () => {
    // Un juge qui ne lit rien est vert pour rien. Le dossier du projet existe, mais aucun de ses
    // fichiers n'est suivi : le juge doit se déclarer EN DÉFAUT, et non « rien à redire ».
    const bac = mkdtempSync(join(tmpdir(), "crochet-vide-"));
    bacs.push(bac);
    execFileSync("git", ["init", "--quiet", "-b", "principale", "."], { cwd: bac });
    mkdirSync(join(bac, PROJET, "fixtures"), { recursive: true });
    writeFileSync(join(bac, "autre-projet.txt"), "rien\n");
    writeFileSync(
      join(bac, PROJET, "fixtures/termes-de-domaine.json"),
      JSON.stringify({ zones: [], termes: [], exceptions: [] }),
    );
    execFileSync("git", ["add", "--", "autre-projet.txt"], { cwd: bac });

    const rendu = spawnSync(OUTIL, [JUGE, "--racine", join(bac, PROJET)], { encoding: "utf8" });
    expect(rendu.status).toBe(2);
    expect(`${rendu.stdout}${rendu.stderr}`).toContain("AUCUN chemin du projet");
  }, DELAI);

  it("lit la même chose avec GIT_DIR dans l'environnement que sans", () => {
    const bac = depotAvecProjet({ "paquet/src/index.ts": "export const a = 1;\n" });
    const compter = (env?: Record<string, string>): string => {
      const sortie = execFileSync(OUTIL, [JUGE, "--racine", join(bac, PROJET)], {
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, ...env },
      });
      return /(\d+) chemin\(s\) du projet sur (\d+)/u.exec(sortie)?.[0] ?? sortie;
    };
    const sans = compter();
    const avec = compter({ GIT_DIR: join(bac, ".git") });
    expect(avec, "GIT_DIR faisait lire tout le dépôt, nommé depuis sa racine").toBe(sans);
    expect(sans).toMatch(/[1-9]\d* chemin\(s\) du projet sur [1-9]\d*/u);
  }, DELAI);
});
