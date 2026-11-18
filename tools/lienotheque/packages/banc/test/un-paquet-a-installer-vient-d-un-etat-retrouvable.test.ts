// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/** Le paquet qu'on installe vient d'un état retrouvable (lot `0u quater`, CDC § 3.6 et OUT-01).
 *
 *  ## D'où vient ce garde-fou
 *
 *  De Christophe, le 17 novembre 2026 : « la fabrication du paquet à installer refuse une copie
 *  modifiée, pour qu'aucune licence ne décrive un état introuvable. » Le lot `0u ter` avait rendu
 *  la chose visible — l'inventaire des licences porte désormais le commit de la chaîne, et il a
 *  écrit « copie modifiée au moment de la collecte ». C'était honnête, et insuffisant pour un
 *  paquet qu'on distribue.
 *
 *  ## Pourquoi le refus tombe dans la finalisation, et nulle part ailleurs
 *
 *  **Mesuré le 18 novembre 2026** sur les deux workflows : aucun n'appelle
 *  `finaliser-paquet-macos.py` — seul `tauri build` y figure. Les trois premiers maillons de la
 *  chaîne (construction web, deux préparations de moteurs) servent aux **mesures**, où une copie
 *  modifiée est la règle de travail. La finalisation, elle, ne sert qu'au paquet qu'on installe :
 *  le refus y tombe sans gêner aucune mesure.
 *
 *  ## Ce que ces contrôles prouvent, et ce qu'ils ne prouvent pas
 *
 *  Ils prouvent le **jugement** : ce qui refuse, ce qui passe, et ce que `--essai` laisse faire.
 *  Ils ne signent rien et ne vérifient aucune signature — `codesign` demande un vrai paquet. Le
 *  contrôle du cas accepté le dit autrement : le jugement est **franchi** quand l'échec suivant
 *  n'est plus un refus, mais `codesign`. */

const OUTIL = fileURLToPath(
  new URL("../../../apps/app/src-tauri/outils/finaliser-paquet-macos.py", import.meta.url),
);
const DELAI = 30_000;
const bacs: string[] = [];
afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

interface Jetable {
  readonly outil: string;
  readonly paquet: string;
  readonly projet: string;
  readonly commit: string;
}

/** Un dépôt jetable, l'outil **copié** dedans — il calcule ses chemins depuis `__file__`, donc il
 *  interroge ce dépôt-ci et jamais le vrai —, et un faux paquet à côté. Tout est commité : sans
 *  cela la copie serait modifiée d'entrée, et chaque contrôle refuserait pour la mauvaise raison
 *  (constaté à la main avant d'écrire ces lignes). */
function jetable(): Jetable {
  const bac = mkdtempSync(join(tmpdir(), "paquet-a-installer-"));
  bacs.push(bac);
  const projet = join(bac, "projet");
  const outils = join(projet, "apps", "app", "src-tauri", "outils");
  mkdirSync(outils, { recursive: true });
  const outil = join(outils, "finaliser-paquet-macos.py");
  copyFileSync(OUTIL, outil);
  writeFileSync(join(projet, "apps", "app", "src-tauri", "moteur.entitlements"), "<!-- faux -->\n");

  const git = (...arguments_: string[]): string =>
    execFileSync("git", arguments_, { cwd: projet, encoding: "utf8", stdio: "pipe" });
  git("init");
  git("config", "user.email", "banc@exemple.test");
  git("config", "user.name", "banc");
  git("add", "apps");
  git("commit", "-m", "le faux dépôt, propre");

  const paquet = join(bac, "paquet.app");
  mkdirSync(join(paquet, "Contents", "MacOS"), { recursive: true });
  mkdirSync(join(paquet, "Contents", "Resources", "moteurs", "licences"), { recursive: true });
  writeFileSync(join(paquet, "Contents", "MacOS", "node"), "pas un vrai moteur\n");
  return { outil, paquet, projet, commit: git("rev-parse", "HEAD").trim() };
}

const inventaire = (jeu: Jetable, commit: unknown): void => {
  writeFileSync(
    join(jeu.paquet, "Contents", "Resources", "moteurs", "licences", "INVENTAIRE.json"),
    JSON.stringify({ composants: { chaine: commit === undefined ? {} : { commit } } }),
  );
};

/** Lance la finalisation sur le faux paquet. `-I` : l'outil ne doit rien charger d'à côté. */
function finaliser(jeu: Jetable, ...arguments_: string[]): { code: number; dit: string } {
  const vu = spawnSync("python3", ["-I", jeu.outil, jeu.paquet, ...arguments_], {
    encoding: "utf8",
    timeout: DELAI,
  });
  return { code: vu.status ?? -1, dit: `${vu.stdout ?? ""}${vu.stderr ?? ""}` };
}

describe("le paquet qu'on installe vient d'un état retrouvable (lot 0u quater, CDC § 3.6)", () => {
  it(
    "refuse un paquet dont l'inventaire dit « copie modifiée au moment de la collecte »",
    () => {
      const jeu = jetable();
      inventaire(jeu, `${jeu.commit} (copie modifiée au moment de la collecte)`);
      const { code, dit } = finaliser(jeu);
      expect(code, dit).toBe(1);
      expect(dit).toContain("ce paquet ne peut pas être un paquet à installer");
      expect(dit).toContain("ne répondent d'aucun état retrouvable");
      expect(dit).toContain("copie modifiée au moment de la collecte");
    },
    DELAI,
  );

  it(
    "refuse un paquet fabriqué avant que la collecte n'inscrive le commit, et le dit ainsi",
    () => {
      const jeu = jetable();
      inventaire(jeu, undefined);
      const { code, dit } = finaliser(jeu);
      expect(code, dit).toBe(1);
      expect(dit).toContain("ne nomme aucun commit pour la chaîne");
          expect(dit).toContain("ce paquet ne peut pas être un paquet à installer");
      expect(dit, "il refuse AVANT de signer quoi que ce soit").not.toContain("codesign");
    },
    DELAI,
  );

  it(
    "refuse un paquet sans inventaire du tout — il ne dit rien de ses licences",
    () => {
      const jeu = jetable();
      const { code, dit } = finaliser(jeu);
      expect(code, dit).toBe(1);
      expect(dit).toContain("aucun inventaire de licences dans le paquet");
          expect(dit).toContain("ce paquet ne peut pas être un paquet à installer");
      expect(dit, "il refuse AVANT de signer quoi que ce soit").not.toContain("codesign");
    },
    DELAI,
  );

  it(
    "refuse une empreinte que le dépôt ne connaît pas : elle rassure sans rien désigner",
    () => {
      const jeu = jetable();
      inventaire(jeu, "0123456789abcdef0123456789abcdef01234567");
      const { code, dit } = finaliser(jeu);
      expect(code, dit).toBe(1);
      expect(dit).toContain("que ce dépôt ne connaît pas");
          expect(dit).toContain("ce paquet ne peut pas être un paquet à installer");
      expect(dit, "il refuse AVANT de signer quoi que ce soit").not.toContain("codesign");
    },
    DELAI,
  );

  it(
    "refuse une copie modifiée MAINTENANT, même quand l'inventaire est propre",
    () => {
      const jeu = jetable();
      inventaire(jeu, jeu.commit);
      // Le trou que ce contrôle garde : les licences sont collectées au troisième maillon de la
      // chaîne, `tauri build` compile au quatrième. Entre les deux, du code peut être écrit.
      writeFileSync(join(jeu.projet, "ecrit-entre-les-deux.txt"), "après la collecte\n");
      const { code, dit } = finaliser(jeu);
      expect(code, dit).toBe(1);
      expect(dit).toContain("la copie de travail est modifiée");
      expect(dit).toContain("ecrit-entre-les-deux.txt");
          expect(dit).toContain("ce paquet ne peut pas être un paquet à installer");
      expect(dit, "il refuse AVANT de signer quoi que ce soit").not.toContain("codesign");
    },
    DELAI,
  );

  it(
    "laisse passer le jugement quand la copie est propre et le commit connu",
    () => {
      const jeu = jetable();
      inventaire(jeu, jeu.commit);
      const { code, dit } = finaliser(jeu);
      // Il échoue — mais plus loin, sur la signature, et c'est la preuve que le jugement est
      // franchi. Signer pour de bon demanderait un vrai paquet.
      expect(code, dit).not.toBe(0);
      expect(dit, "aucun refus de jugement ne doit apparaître").not.toContain(
        "ne peut pas être un paquet à installer",
      );
      expect(dit).toContain("codesign");
    },
    DELAI,
  );

  it(
    "« --essai » lève le refus, le dit, et laisse la raison écrite DANS le paquet",
    () => {
      const jeu = jetable();
      inventaire(jeu, `${jeu.commit} (copie modifiée au moment de la collecte)`);
      const { dit } = finaliser(jeu, "--essai");
      expect(dit).toContain("PAQUET D'ESSAI");
      expect(dit, "le refus est levé, pas contourné en silence").toContain(
        "copie modifiée au moment de la collecte",
      );
      const marque = readFileSync(
        join(jeu.paquet, "Contents", "Resources", "PAQUET-D-ESSAI.txt"),
        "utf8",
      );
      expect(marque).toContain("PAQUET D'ESSAI, PAS UN PAQUET À INSTALLER");
      expect(marque).toContain("copie modifiée au moment de la collecte");
      expect(marque, "et il dit de ne pas le distribuer").toContain("Ne distribuez pas celui-ci");
    },
    DELAI,
  );

  it(
    "« --essai » sur une copie propre ne marque rien : le paquet est le même",
    () => {
      const jeu = jetable();
      inventaire(jeu, jeu.commit);
      const { dit } = finaliser(jeu, "--essai");
      expect(dit, "rien à lever, donc rien à annoncer").not.toContain("PAQUET D'ESSAI");
      expect(() =>
        readFileSync(join(jeu.paquet, "Contents", "Resources", "PAQUET-D-ESSAI.txt")),
      ).toThrow();
    },
    DELAI,
  );

  it(
    "jette le « -- » que pnpm passe avec les arguments, au lieu d'en faire un chemin de paquet",
    () => {
      // **Mesuré le 18 novembre 2026** : `pnpm run x -- --essai` ne retire pas le séparateur, il
      // le passe. La ligne lancée était « finaliser-paquet-macos.py -- --essai », et le paquet
      // cherché devenait « apps/app/-- ». C'est la consigne même du README.
      const jeu = jetable();
      inventaire(jeu, jeu.commit);
      const vu = spawnSync("python3", ["-I", jeu.outil, "--", "--essai", jeu.paquet], {
        encoding: "utf8",
        timeout: DELAI,
      });
      const dit = `${vu.stdout ?? ""}${vu.stderr ?? ""}`;
      expect(dit, "le séparateur ne doit jamais devenir un chemin").not.toContain(
        "paquet macOS introuvable",
      );
      expect(dit).toContain("codesign");
    },
    DELAI,
  );

  it("aucune course de l'intégration continue n'appelle la finalisation, et c'est mesuré", () => {
    const sous = (nom: string): string =>
      readFileSync(new URL(`../../../../../.github/workflows/${nom}`, import.meta.url), "utf8");
    for (const nom of ["lienotheque-tauri.yml", "lienotheque-ci.yml"]) {
      expect(sous(nom), `${nom} ne doit pas appeler la finalisation`).not.toContain("finaliser");
    }
  });
});
