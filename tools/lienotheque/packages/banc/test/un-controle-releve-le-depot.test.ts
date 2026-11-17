import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { nomDuBac, PREFIXE_DU_BAC, restesABalayer, variablesDuBac } from "../src/bac-du-controle.js";
import { ceQuiABouge, cheminsNommes, releverLeDepot, type Lancer } from "../src/releve-du-depot.js";

const bacs: string[] = [];
afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

/** Un dépôt neuf, avec un fichier commité : de quoi salir une copie de travail. */
function depot(): string {
  const bac = mkdtempSync(join(tmpdir(), "releve-du-depot-"));
  bacs.push(bac);
  execFileSync("git", ["init"], { cwd: bac, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "banc@exemple.test"], { cwd: bac });
  execFileSync("git", ["config", "user.name", "banc"], { cwd: bac });
  writeFileSync(join(bac, "suivi.txt"), "premier état\n");
  execFileSync("git", ["add", "suivi.txt"], { cwd: bac });
  execFileSync("git", ["commit", "-m", "premier"], { cwd: bac, stdio: "pipe" });
  return bac;
}

const lancerDans =
  (bac: string): Lancer =>
  (programme, arguments_) => {
    const vu = execFileSync(programme, [...arguments_], { cwd: bac, encoding: "utf8" });
    return { code: 0, sortie: vu };
  };

const etats = (bac: string): string => execFileSync("git", ["status", "--porcelain"], { cwd: bac, encoding: "utf8" });

describe("un contrôle complet sait si le dépôt a bougé sous lui (lot 0c quater, CDC § 4.6)", () => {
  it("nomme chaque chemin que git status rend, les deux côtés d'un renommage comprises", () => {
    const sortie = [
      " M un/chemin/modifie.ts",
      "?? un/autre/non-suivi.md",
      "A  indexe.json",
      'R  "ancien nom.txt" -> "nouveau nom.txt"',
      " D supprime.css",
      "",
    ].join("\n");
    expect(cheminsNommes(sortie)).toEqual([
      { code: " M", chemin: "un/chemin/modifie.ts" },
      { code: "??", chemin: "un/autre/non-suivi.md" },
      { code: "A ", chemin: "indexe.json" },
      { code: "R ", chemin: "ancien nom.txt" },
      { code: "R ", chemin: "nouveau nom.txt" },
      { code: " D", chemin: "supprime.css" },
    ]);
  });

  it("voit une SECONDE écriture dans un fichier déjà sale, là où git status seul est aveugle", () => {
    const bac = depot();
    const fichier = join(bac, "suivi.txt");
    writeFileSync(fichier, "premier état\nune première modification\n");
    const avant = releverLeDepot(lancerDans(bac), bac);
    const etatsAvant = etats(bac);

    writeFileSync(fichier, "premier état\nune première modification\nune seconde, pendant la course\n");
    const apres = releverLeDepot(lancerDans(bac), bac);

    // La mesure du 17 novembre 2026, refaite ici : les états seuls ne bougent pas d'un caractère.
    expect(etats(bac), "git status seul rend la même ligne — c'est l'aveuglement de la parade").toBe(etatsAvant);
    // Et le relevé, lui, nomme le fichier et dit ce qu'il a fait.
    const taille = (texte: string): number => Buffer.byteLength(texte, "utf8");
    expect(ceQuiABouge(avant, apres)).toEqual([
      `suivi.txt : réécrit pendant la course (${taille("premier état\nune première modification\n")} → ` +
        `${taille("premier état\nune première modification\nune seconde, pendant la course\n")} octets)`,
    ]);
  });

  it("voit une réécriture À L'IDENTIQUE, qu'aucune empreinte ne distinguerait", () => {
    const bac = depot();
    const fichier = join(bac, "sale.txt");
    writeFileSync(fichier, "le même contenu\n");
    const avant = releverLeDepot(lancerDans(bac), bac);
    // Réécrit avec les mêmes octets, une seconde plus tard : seule la date le dit.
    const plusTard = new Date(statSync(fichier).mtimeMs + 2000);
    writeFileSync(fichier, "le même contenu\n");
    utimesSync(fichier, plusTard, plusTard);
    const apres = releverLeDepot(lancerDans(bac), bac);
    expect(ceQuiABouge(avant, apres)).toEqual([
      "sale.txt : réécrit à l'identique pendant la course (même contenu, autre date)",
    ]);
  });

  it("voit apparaître et disparaître, et se tait quand rien n'a bougé", () => {
    const bac = depot();
    const vide = releverLeDepot(lancerDans(bac), bac);
    expect(ceQuiABouge(vide, releverLeDepot(lancerDans(bac), bac))).toEqual([]);

    writeFileSync(join(bac, "neuf.md"), "arrivé pendant la course\n");
    const avecLeNeuf = releverLeDepot(lancerDans(bac), bac);
    expect(ceQuiABouge(vide, avecLeNeuf)).toEqual(["neuf.md : arrivé pendant la course (fichier non suivi)"]);

    rmSync(join(bac, "neuf.md"));
    expect(ceQuiABouge(avecLeNeuf, releverLeDepot(lancerDans(bac), bac))).toEqual([
      "neuf.md : rendu à son état du commit pendant la course, ou effacé",
    ]);
  });

  it("distingue un fichier qui naît d'un fichier suivi qu'on modifie, et ne confond pas les deux", () => {
    const bac = depot();
    // Au départ, la copie est propre : `git status` ne nomme RIEN, donc le fichier suivi n'est pas
    // dans le relevé d'avant. C'est exactement le cas du 5 novembre 2026, et mon premier libellé
    // l'annonçait « apparu pendant la course » — pour un fichier commité de longue date.
    const propre = releverLeDepot(lancerDans(bac), bac);
    expect(propre.chemins.size, "une copie propre ne nomme aucun chemin").toBe(0);

    writeFileSync(join(bac, "suivi.txt"), "premier état\nmodifié pendant la course\n");
    writeFileSync(join(bac, "nouveau.txt"), "né pendant la course\n");
    const dits = ceQuiABouge(propre, releverLeDepot(lancerDans(bac), bac));
    expect(dits).toContain(
      "suivi.txt : modifié pendant la course, alors qu'il était intact au départ (git status : «  M »)",
    );
    expect(dits).toContain("nouveau.txt : arrivé pendant la course (fichier non suivi)");
  });

  it("relève TOUT le dépôt, et non le seul sous-dossier du projet", () => {
    const bac = depot();
    mkdirSync(join(bac, "ailleurs"), { recursive: true });
    writeFileSync(join(bac, "ailleurs/hors-du-projet.txt"), "le travail d'une autre session\n");
    const releve = releverLeDepot(lancerDans(bac), bac);
    // Et nommément : `--porcelain` nu replierait tout cela en « ailleurs/ », ce qui rendrait le
    // relevé aveugle à une écriture dans un dossier déjà non suivi.
    expect([...releve.chemins.keys()]).toContain("ailleurs/hors-du-projet.txt");
    expect([...releve.chemins.keys()], "aucun dossier replié ne doit tenir lieu de fichier").not.toContain(
      "ailleurs/",
    );
  });
});

describe("un contrôle arrêté ne laisse pas son dossier d'essai derrière lui (lot 0c quater, CDC § 4.6)", () => {
  it("ne balaie que les bacs du projet, jamais le dossier temporaire de quelqu'un d'autre", () => {
    const entrees = [
      nomDuBac(4242),
      nomDuBac(777),
      "com.apple.quelque-chose",
      "tmp.AbCdEf",
      "lienotheque-reperes-9xx0w7",
    ];
    // Le bac de la course qui tourne n'est pas balayé — on ne scie pas sous ses propres pieds.
    expect(restesABalayer(entrees, nomDuBac(4242))).toEqual([nomDuBac(777)]);
    // Et rien d'autre ne part : ni le système, ni un `mktemp`, ni le dossier d'un contrôle en cours
    // d'une AUTRE session, qui ne porte pas ce préfixe.
    expect(restesABalayer(entrees, nomDuBac(0))).toEqual([nomDuBac(4242), nomDuBac(777)]);
    expect(PREFIXE_DU_BAC.startsWith("lienotheque-")).toBe(true);
  });

  it("dit aux enfants d'écrire dans le bac, sur les trois systèmes à la fois", () => {
    expect(variablesDuBac("/un/bac")).toEqual({ TMPDIR: "/un/bac", TEMP: "/un/bac", TMP: "/un/bac" });
  });

  it("et un enfant obéit vraiment : son dossier temporaire devient le bac", () => {
    const bac = mkdtempSync(join(tmpdir(), "bac-du-controle-"));
    bacs.push(bac);
    const dit = execFileSync(
      process.execPath,
      [
        "-e",
        "const os=require('node:os'),fs=require('node:fs');" +
          "process.stdout.write(os.tmpdir()+'\\n'+fs.mkdtempSync(require('node:path').join(os.tmpdir(),'essai-')))",
      ],
      { encoding: "utf8", env: { ...process.env, ...variablesDuBac(bac) } },
    ).split("\n");
    expect(dit[0], "`os.tmpdir()` de l'enfant doit être le bac").toBe(bac);
    expect(dit[1] ?? "", "et ce qu'il fabrique doit y tomber").toContain(bac);
  });

  it("efface un bac entier, contenu compris, sans toucher à ses voisins", () => {
    const voisin = mkdtempSync(join(tmpdir(), "voisin-du-bac-"));
    bacs.push(voisin);
    const reste = join(tmpdir(), nomDuBac(999_999));
    mkdirSync(join(reste, "un/essai/profond"), { recursive: true });
    writeFileSync(join(reste, "un/essai/profond/dedans.txt"), "ce qu'une course arrêtée a laissé\n");
    writeFileSync(join(voisin, "intact.txt"), "ne doit pas bouger\n");

    for (const nom of restesABalayer([nomDuBac(999_999)], nomDuBac(process.pid)))
      rmSync(join(tmpdir(), nom), { recursive: true, force: true });

    expect(() => statSync(reste), "le reste doit avoir disparu, contenu compris").toThrow();
    expect(readFileSync(join(voisin, "intact.txt"), "utf8")).toBe("ne doit pas bouger\n");
  });
});
