// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  contenuDeLIndex,
  contenusDeLIndex,
  importsFantomes,
  taillesDeLIndex,
  TOLERES_FANTOMES,
} from "../src/rien-de-fantome.js";

/** Aucun fichier suivi par Git n'importe un fichier qui ne l'est pas.
 *
 *  ## Le défaut que ce garde-fou existe pour empêcher
 *
 *  Le 7 novembre 2026, la CI est restée rouge **quatre lots durant** : `outils/ingestion/src/
 *  index.ts` était commité et exportait `./relire-sur-place.js`, que personne n'avait commité.
 *  L'arbre de travail portait le module, un clone non.
 *
 *  Le coût n'était pas quatre voyants : un typage qui s'arrête à un paquet **n'exécute pas ses
 *  tests**. Les contrôles du paquet le plus lourd du projet n'ont tourné que sur un seul disque
 *  pendant quatre lots.
 *
 *  ## Pourquoi un contrôle local, puisque la CI l'a trouvé
 *
 *  Parce qu'elle l'a trouvé **après le push**, et quatre fois. Ce garde-fou rougit **avant**, sur
 *  le disque, au moment où le fichier manque encore à l'index — là où la correction coûte un
 *  `git add` au lieu d'une branche cassée.
 *
 *  Il est posé juste avant un lot qui ajoute trois fichiers neufs, dont un déjà importé par un
 *  fichier suivi. Le même accident était à une minute de se reproduire. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const suivis = (): readonly string[] =>
  execFileSync("git", ["ls-files"], { cwd: RACINE, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 })
    .split("\n")
    .filter((chemin) => chemin !== "");

/** Ce qui sera COMMITÉ, et non ce qui traîne sur le disque. Voir le contrôle dédié plus bas. */
const lire = contenuDeLIndex(RACINE);

describe("aucun fichier suivi n'importe un fichier non suivi", () => {
  it("n'en trouve aucun dans le dépôt", () => {
    expect(importsFantomes(suivis(), lire)).toEqual([]);
  });

  /** Le lecteur charge-t-il TOUS les fichiers, ou seulement le premier ?
   *
   *  Trouvé par contre-épreuve, 7 novembre 2026 : en cassant l'avance par taille annoncée, le
   *  lecteur ne chargeait plus que la première entrée et rendait une chaîne vide pour toutes les
   *  autres. Aucun import n'était alors trouvé nulle part, et le garde-fou passait **vert**.
   *
   *  C'est la pire panne possible pour un garde-fou : aveugle et silencieux, indiscernable du
   *  succès. Ce contrôle est le seul qui la voie. */
  /** Chaque contenu chargé a **la taille que Git annonce pour ce fichier**.
   *
   *  Correction de Christophe, 7 novembre 2026. Deux formes ont été écartées avant celle-ci :
   *
   *  - « plus de cent sources » — une **constante calibrée**, qui aurait vieilli sans rien dire le
   *    jour où le dépôt en porte mille, et qu'un chargement d'une entrée sur deux passait sans
   *    difficulté ;
   *  - « aucun fichier suivi n'est vide » — une **hypothèse sur le dépôt**, et non sur le lecteur.
   *    Un `.gitkeep` parfaitement légitime la ferait échouer à tort, et un garde-fou qui accuse à
   *    tort finit par être désarmé.
   *
   *  La taille annoncée, elle, ne suppose rien : elle compare ce que le lecteur a rendu à ce que
   *  Git dit du même objet. Un fichier vide a une taille de zéro des deux côtés. */
  it("charge chaque fichier à la taille que Git annonce", () => {
    const contenus = contenusDeLIndex(RACINE);
    const annoncees = taillesDeLIndex(RACINE);

    expect(contenus.size, "autant de fichiers lus que l'index en annonce").toBe(annoncees.size);
    const ecarts = [...annoncees].flatMap(([chemin, taille]) => {
      const charge = contenus.get(chemin);
      const lue = charge === undefined ? undefined : charge.byteLength;
      return lue === taille ? [] : [{ chemin, annoncee: taille, lue }];
    });
    expect(ecarts, "aucun écart entre la taille lue et la taille annoncée").toEqual([]);
  });

  it("attrape un module importé mais non suivi", () => {
    const sources = ["paquet/src/index.ts"];
    const contenus = new Map([["paquet/src/index.ts", 'export * from "./absent.js";\n']]);
    expect(importsFantomes(sources, (c) => contenus.get(c) ?? "")).toEqual([
      { chemin: "paquet/src/index.ts", importe: "./absent.js" },
    ]);
  });

  it("laisse passer un module suivi", () => {
    const sources = ["paquet/src/index.ts", "paquet/src/present.ts"];
    const contenus = new Map([["paquet/src/index.ts", 'export * from "./present.js";\n']]);
    expect(importsFantomes(sources, (c) => contenus.get(c) ?? "")).toEqual([]);
  });

  it("accepte qu'un .tsx réponde pour un import en .js", () => {
    const sources = ["app/src/page.ts", "app/src/Bouton.tsx"];
    const contenus = new Map([["app/src/page.ts", 'import { Bouton } from "./Bouton.js";\n']]);
    expect(importsFantomes(sources, (c) => contenus.get(c) ?? "")).toEqual([]);
  });

  /** Le nom disait « un dossier répond par son index » ; il n'en vérifiait rien — l'import nomme
   *  son index explicitement, et c'est le premier candidat qui répond. Renommé pour dire ce qu'il
   *  tient réellement, après qu'une mutation a montré que la règle du dossier ne servait pas. */
  it("accepte un index nommé explicitement", () => {
    const sources = ["app/src/page.ts", "app/src/composants/index.ts"];
    const contenus = new Map([["app/src/page.ts", 'import { X } from "./composants/index.js";\n']]);
    expect(importsFantomes(sources, (c) => contenus.get(c) ?? "")).toEqual([]);
  });

  it("ne touche pas aux imports de paquets, qui ne sont pas des chemins", () => {
    const sources = ["paquet/src/index.ts"];
    const contenus = new Map([["paquet/src/index.ts", 'import { z } from "zod";\nimport { join } from "node:path";\n']]);
    expect(importsFantomes(sources, (c) => contenus.get(c) ?? "")).toEqual([]);
  });

  it("ne confond pas une donnée avec un module : un .json suivi répond pour lui-même", () => {
    const sources = ["paquet/src/index.ts", "paquet/src/tokens.json"];
    const contenus = new Map([["paquet/src/index.ts", 'import jetons from "./tokens.json";\n']]);
    expect(importsFantomes(sources, (c) => contenus.get(c) ?? "")).toEqual([]);
  });

  /** Le garde-fou juge **l'index**, pas l'arbre de travail.
   *
   *  Correction de Christophe, 7 novembre 2026. Première version : il lisait les fichiers sur le
   *  disque. Un lot en cours modifie des fichiers suivis sans les indexer — ses modifications
   *  faussaient donc le verdict dans les deux sens : un fantôme annoncé pour un import qui ne
   *  partira pas, et un vrai fantôme masqué par un fichier présent mais non indexé.
   *
   *  Ce qui compte est ce que le prochain commit contiendra. C'est l'index qui le dit. */
  it("lit le contenu de l'index, pas celui du disque (7 novembre 2026)", () => {
    const bac = mkdtempSync(join(tmpdir(), "index-vs-disque-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: bac });
      writeFileSync(join(bac, "a.ts"), 'export const valeur = "indexée";\n');
      execFileSync("git", ["add", "a.ts"], { cwd: bac });
      // Modifié sur le disque APRÈS l'indexation, et jamais réindexé.
      writeFileSync(join(bac, "a.ts"), 'export const valeur = "sur le disque";\n');

      expect(contenuDeLIndex(bac)("a.ts")).toContain("indexée");
      expect(contenuDeLIndex(bac)("a.ts")).not.toContain("sur le disque");
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  });

  it("ne compte pas un import ajouté sur le disque mais pas indexé", () => {
    const bac = mkdtempSync(join(tmpdir(), "fantome-non-indexe-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: bac });
      writeFileSync(join(bac, "index.ts"), "export const rien = 1;\n");
      execFileSync("git", ["add", "index.ts"], { cwd: bac });
      // Le disque importe un module absent ; l'index, lui, ne l'importe pas.
      writeFileSync(join(bac, "index.ts"), 'export * from "./absent.js";\n');

      const suivis = execFileSync("git", ["ls-files"], { cwd: bac, encoding: "utf8" })
        .split("\n")
        .filter((c) => c !== "");
      expect(importsFantomes(suivis, contenuDeLIndex(bac))).toEqual([]);
    } finally {
      rmSync(bac, { recursive: true, force: true });
    }
  });

  it("justifie chacune de ses tolérances", () => {
    for (const tolere of TOLERES_FANTOMES) expect(tolere.raison.length, tolere.motif).toBeGreaterThan(40);
  });
});
