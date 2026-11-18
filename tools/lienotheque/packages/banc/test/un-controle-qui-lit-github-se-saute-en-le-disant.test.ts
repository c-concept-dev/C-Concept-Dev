import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  DOSSIER_GITHUB,
  controlesQuiLisentGithub,
  dossierDuProjet,
  effacerLaRacine,
  fabriquerRacineSansGithub,
  jouerDansCetteRacine,
  modulesQuiLisentGithub,
  racineDuDepot,
} from "../src/racine-sans-github.js";

/** Lot 0l — **un contrôle qui lit `.github/` se saute en le disant quand le dossier est absent**
 *  (OPT-04).
 *
 *  ## La faute, deux fois, et toujours après la poussée
 *
 *  Les deux courses prennent le dépôt en `sparse-checkout: tools/lienotheque` : `.github/` n'y est
 *  pas. Un contrôle qui lit un workflow passe donc au vert en local et **rougit la course**. C'est
 *  arrivé au lot `0u`, puis au lot `0u quater` — course `44265849503`, un `ENOENT` sur
 *  `.github/workflows/lienotheque-tauri.yml`.
 *
 *  Exigence de Christophe du 18 novembre 2026, ses mots : « un garde-fou qui exige que tout test
 *  lisant `.github/` se saute en le disant quand le dossier est absent, avec mutation. C'est la
 *  deuxième fois (lot `0u`, puis `0u quater`) que cette faute n'apparaît qu'après la poussée. »
 *
 *  ## Ce que ce garde-fou mesure, et pourquoi il ne lit pas le code
 *
 *  Il **fabrique la situation de la course** — une racine de dépôt qui porte le projet et pas
 *  `.github/` — et y **joue vraiment** chaque contrôle en cause. Lire dans le texte si l'idiome du
 *  saut est écrit dirait seulement qu'il est écrit, pas qu'il marche. Éprouvé : la version du
 *  contrôle d'avant `ef53e51f` rend ici, dans la racine fabriquée, **exactement** l'`ENOENT` qui a
 *  rougi la course — la faute du 18 novembre se voit donc maintenant **avant** la poussée.
 *
 *  ## Trois exigences, et chacune a sa raison
 *
 *  1. le coureur **accepte** le fichier : aucun rouge quand `.github/` manque ;
 *  2. **au moins un contrôle sauté** : « se saute **en le disant** ». Un fichier qui passerait
 *     entièrement sans rien sauter lirait `.github/` sans s'en soucier, ou ne le lirait plus ;
 *  3. **au moins un contrôle passé** : l'ancre. Un fichier dont tout se saute ne distingue plus
 *     « `.github/` est absent » de « mon chemin ne désigne rien » — et c'est exactement la faute
 *     qui a fait sauter six contrôles en silence (lot `0u`).
 *
 *  ## Pourquoi il ne se saute, lui, jamais
 *
 *  Il n'a besoin de rien qui soit hors du lot récupéré : il fabrique sa racine depuis les fichiers
 *  **suivis** du projet. Il tourne donc aussi sur les deux courses, où il mesure la même chose. Un
 *  garde-fou contre les sauts muets qui se sauterait lui-même serait une plaisanterie. */

const PROJET = new URL("../../../", import.meta.url);
const RACINE = racineDuDepot(PROJET);
const DOSSIER = dossierDuProjet(RACINE, PROJET);

/** Ce fichier-ci s'écarte du relevé, et c'est une **condition d'arrêt**, non une commodité : il
 *  nomme `.github/` puisqu'il en parle, et se jouerait donc dans la racine qu'il vient de
 *  fabriquer, laquelle en fabriquerait une autre, sans fin. Le contrôle ci-dessous éprouve que ce
 *  qui s'écarte est **lui seul**. */
const MOI = dossierDuProjet(RACINE, new URL(".", import.meta.url)) + "/un-controle-qui-lit-github-se-saute-en-le-disant.test.ts";
const releve = (): ReturnType<typeof controlesQuiLisentGithub> =>
  controlesQuiLisentGithub(RACINE, DOSSIER, [MOI]);

/** Le seul module hors d'un dossier `test/` qui ait le droit de nommer `.github/` : celui qui
 *  fabrique la racine sans lui, et doit donc le reconnaître pour l'écarter. Un **seul**, nommé en
 *  entier, et la liste attendue est exacte : voir le contrôle de l'angle mort plus bas. */
const LE_SEUL_MODULE_QUI_LE_NOMME = `${DOSSIER}/packages/banc/src/racine-sans-github.ts`;

const bacs: string[] = [];
const nouveauBac = (quoi: string): string => {
  const bac = mkdtempSync(join(tmpdir(), `lienotheque-sans-github-${quoi}-`));
  bacs.push(bac);
  return bac;
};
afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

describe("un contrôle qui lit `.github/` se saute en le disant (lot 0l)", () => {
  /** L'ancre, celle que ce garde-fou exige des autres : si la racine désignée n'est pas la racine
   *  du dépôt, tout ce qui suit mesurerait du vide. */
  it("désigne vraiment la racine du dépôt, pour qu'aucun saut ne vienne d'un chemin faux", () => {
    expect(existsSync(join(RACINE, ".git")), `${RACINE} n'est pas la racine du dépôt`).toBe(true);
    expect(DOSSIER, "le projet doit être sous la racine du dépôt").toMatch(/^[\w./-]+$/u);
  });

  /** Ce qui s'écarte du relevé, c'est **ce fichier et rien d'autre** : sans cela, `sauf`
   *  deviendrait la porte par laquelle on excuse un contrôle gênant. */
  it("ne s'écarte du relevé que lui-même, et ce chemin existe", () => {
    expect(existsSync(join(RACINE, MOI)), `${MOI} ne désigne pas ce fichier`).toBe(true);
    // Suivi par git, sans quoi il ne partirait pas avec le commit — et le relevé lit l'index.
    expect(
      execFileSync("git", ["ls-files", "--", MOI], { cwd: RACINE, encoding: "utf8" }).trim(),
      `${MOI} n'est pas dans l'index : ajoutez-le, un garde-fou non suivi ne garde rien`,
    ).toBe(MOI);
    const tous = controlesQuiLisentGithub(RACINE, DOSSIER).map((un) => un.chemin);
    const ecartes = tous.filter((un) => !releve().some((autre) => autre.chemin === un));
    expect(ecartes, "un seul contrôle s'écarte du relevé : celui-ci").toEqual([MOI]);
  });

  /** Contre la vacuité : le jour où plus aucun contrôle ne lit `.github/`, ce garde-fou ne garde
   *  plus rien, et il doit le dire plutôt que de passer au vert sur une liste vide. */
  it("relève au moins un contrôle qui lit `.github/`, sans quoi il ne garderait rien", () => {
    const releves = releve();
    expect(
      releves.map((un) => un.chemin),
      "aucun contrôle ne lit `.github/` : ce garde-fou est devenu vide, retirez-le ou dites pourquoi",
    ).not.toHaveLength(0);
  });

  /** L'angle mort, fermé : le relevé lit les fichiers de contrôle. Si la lecture de `.github/`
   *  passait un jour dans un module de `src/`, elle échapperait au relevé — donc une course le
   *  dit, au lieu de laisser l'angle mort s'ouvrir sans bruit.
   *
   *  **Un module le nomme légitimement : le fabricateur lui-même**, qui cherche `.github/` pour ne
   *  pas le recopier. On ne lui ouvre **pas** une porte `sauf` — une porte finit par excuser un
   *  module gênant, c'est la leçon de `decideeAilleurs` au lot D3. On exige la liste **exacte** :
   *  un module de plus, et elle diffère, donc la course le dit. */
  it("aucun module hors des dossiers de contrôle ne lit `.github/`, sauf le fabricateur, nommé", () => {
    // Sans cette ancre, la liste attendue pourrait comparer à un chemin qui ne désigne rien.
    expect(
      existsSync(join(RACINE, LE_SEUL_MODULE_QUI_LE_NOMME)),
      `${LE_SEUL_MODULE_QUI_LE_NOMME} ne désigne pas un fichier : l'attendu serait faux`,
    ).toBe(true);

    expect(
      modulesQuiLisentGithub(RACINE, DOSSIER),
      "ce module lit `.github/` hors d'un dossier `test/` : le relevé ne le voit pas, " +
        "élargissez le relevé avant de garder ce code",
    ).toEqual([LE_SEUL_MODULE_QUI_LE_NOMME]);
  });

  /** La précaution qui protège le vrai dépôt, rejouée à chaque course plutôt que retenue : la
   *  racine fabriquée porte des **liens** vers les `node_modules` du vrai dépôt, et son effacement
   *  ne doit pas suivre ces liens. Un leurre derrière un lien doit survivre. */
  it("effacer la racine fabriquée ne suit pas les liens, donc n'emporte pas le vrai dépôt", () => {
    const bac = nouveauBac("leurre");
    const precieux = join(bac, "precieux");
    mkdirSync(precieux, { recursive: true });
    writeFileSync(join(precieux, "a-garder.txt"), "ce fichier ne doit pas être effacé\n", "utf8");
    const aEffacer = join(bac, "a-effacer");
    mkdirSync(aEffacer, { recursive: true });
    symlinkSync(precieux, join(aEffacer, "lien"), "dir");

    effacerLaRacine({ racine: aEffacer, fichiersCopies: 0, liensVersLesPaquets: 1, millisecondes: 0 });

    expect(existsSync(aEffacer), "la racine fabriquée doit disparaître").toBe(false);
    expect(
      existsSync(join(precieux, "a-garder.txt")),
      "ce que le lien désignait a été effacé : `rmSync` a suivi le lien",
    ).toBe(true);
  });

  /** Et le refus, mesuré lui aussi : un chemin hors du dossier temporaire n'est pas effacé.
   *
   *  **Le chemin visé n'existe pas, et ce n'est pas une politesse** : c'est la règle du 18 novembre
   *  2026, « une mutation qui désarme une sécurité ne se pose jamais sous un contrôle qui la pointe
   *  sur un objet réel » (`docs/decisions/2026-11-18-une-mutation-ne-desarme-pas-une-securite-pointee-sur-un-objet-reel.md`).
   *  La première version de ce contrôle passait `RACINE`, la copie de travail elle-même : retirer le
   *  refus de `effacerLaRacine` a fait de ce contrôle l'effacement, 8 302 chemins suivis et tout
   *  l'ignoré. Pointé sur un chemin qui n'existe pas, le même désarmement ne détruit rien —
   *  `rmSync` avec `force: true` se tait sur l'absent — et le contrôle rougit tout de même, puisque
   *  l'erreur attendue ne vient plus. La sécurité reste donc mesurée, et la mesure ne peut plus
   *  mordre. */
  it("refuse d'effacer une racine qui n'est pas dans le dossier temporaire", () => {
    // Sous la racine du dépôt, donc hors du dossier temporaire, et jamais créé par personne.
    const horsDuBac = join(RACINE, `jamais-cree-${process.pid}-${Date.now()}`);
    expect(
      existsSync(horsDuBac),
      "ce contrôle ne se pointe que sur un chemin inexistant : la règle du 18 novembre 2026",
    ).toBe(false);

    expect(() =>
      effacerLaRacine({ racine: horsDuBac, fichiersCopies: 0, liensVersLesPaquets: 0, millisecondes: 0 }),
    ).toThrow(/hors du dossier temporaire/u);

    // Et rien n'a été fabriqué : il n'y a donc rien à nettoyer après ce contrôle.
    expect(existsSync(horsDuBac)).toBe(false);
  });

  /** La mesure même. Le délai est celui d'un voisin de ce dépôt — 30 000 ms, comme le contrôle
   *  « ne regarde pas une seule page d'un document dont le vivier est vide » — et non un chiffre
   *  neuf : la fabrication coûte 316 ms mesurés, et les contrôles joués moins de deux secondes. */
  it(
    "chaque contrôle qui lit `.github/` se saute en le disant quand le dossier est absent",
    { timeout: 30_000 },
    () => {
      const releves = releve();
      const bac = nouveauBac("racine");
      const rapports = nouveauBac("rapports");
      const fabriquee = fabriquerRacineSansGithub(RACINE, DOSSIER, bac);

      // Sans quoi tout ce qui suit serait vide : la racine fabriquée ne doit pas porter `.github/`.
      expect(
        existsSync(join(fabriquee.racine, DOSSIER_GITHUB)),
        "la racine fabriquée porte `.github/` : la mesure ne prouverait rien",
      ).toBe(false);
      expect(fabriquee.fichiersCopies, "la racine fabriquée est vide").toBeGreaterThan(0);
      expect(fabriquee.liensVersLesPaquets, "aucun `node_modules` lié : le coureur ne démarrerait pas").toBeGreaterThan(0);

      const refus: string[] = [];
      for (const controle of releves) {
        const dit = jouerDansCetteRacine(fabriquee, controle, rapports);
        if (!dit.accepte || dit.echecs > 0)
          refus.push(
            `${controle.chemin} : ${dit.echecs} rouge(s) sans \`.github/\`, là où la course en aurait autant. ` +
              `Donnez-lui l'idiome du saut.\n${dit.sortie.split("\n").slice(-25).join("\n")}`,
          );
        else if (dit.sautes === 0)
          refus.push(
            `${controle.chemin} : il lit \`.github/\` et ne saute rien quand le dossier est absent. ` +
              `Un saut muet n'existe pas : il doit paraître dans le compte des sautés.`,
          );
        else if (dit.passes === 0)
          refus.push(
            `${controle.chemin} : tout s'y saute, rien n'y passe. Rien ne distingue alors ` +
              `« \`.github/\` est absent » de « mon chemin ne désigne rien ». Posez-y une ancre qui ne se saute jamais.`,
          );
      }
      expect(refus.join("\n\n")).toBe("");
    },
  );
});

/** Le relevé de ce qui a été joué, pour que le rapport porte des chiffres et non une promesse. */
describe("ce que le relevé a vu (lot 0l)", () => {
  it("nomme les contrôles relevés et le dossier du projet", () => {
    const releves = releve();
    expect(releves.every((un) => un.chemin.startsWith(`${DOSSIER}/`))).toBe(true);
    expect(releves.every((un) => readFileSync(join(RACINE, un.chemin), "utf8").includes(DOSSIER_GITHUB))).toBe(true);
    expect(
      execFileSync("git", ["ls-files", "--error-unmatch", ...releves.map((un) => un.chemin)], {
        cwd: RACINE,
        encoding: "utf8",
      }).trim().split("\n"),
      "chaque contrôle relevé est bien suivi par git, donc il partira avec le commit",
    ).toHaveLength(releves.length);
  });
});
