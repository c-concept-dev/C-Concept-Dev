import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXCEPTIONS,
  PORTEURS_DU_REFUS,
  REFUS_NOMME,
  type Source,
  effacementsHorsDuBac,
  effacementsRecursifs,
  estDansLePerimetre,
  exceptionsMortes,
  langageDe,
  porteursSansRefus,
  sourcesIgnorees,
  tiennentParLeRefusNomme,
} from "../src/effacements-bornes.js";
import { dossierDuProjet, fichiersSuivis, racineDuDepot } from "../src/racine-sans-github.js";

/** Lot `0z bis` — **un effacement récursif ne sort pas du dossier temporaire** (§ 4.7).
 *
 *  ## Pourquoi un garde-fou mécanique, et non la seule discipline
 *
 *  Le 18 novembre 2026, une mutation a effacé la copie de travail entière : 8 302 chemins suivis
 *  et tout ce que Git ignore. Le crochet `refuser-gestes-destructeurs.sh` n'a rien vu, **et il ne
 *  pouvait rien voir** : il ne lit que des commandes — `rm -rf`, `git reset --hard`, les poussées
 *  forcées. Un `rmSync` dans un contrôle lui est invisible. L'effacement n'est pas passé *malgré*
 *  le garde-fou, il est passé **à côté**.
 *
 *  Ce contrôle lit donc le code : contrôles, exemples et scripts, en TypeScript, JavaScript, Rust
 *  et Python. Il remonte chaque cible à sa liaison dans le même fichier, et exige qu'elle mène au
 *  dossier temporaire du système — ou que le fichier appelle un refus nommé, ou qu'il figure dans
 *  la liste des exceptions, chacune avec sa raison et le chemin exact qu'elle a le droit
 *  d'effacer. **Aucune porte générale.**
 *
 *  ## Ce qu'il a trouvé en naissant
 *
 *  196 effacements récursifs dans le périmètre, et **un seul** qui sortait du bac :
 *  `mesure-du-corps.test.ts`, qui fabriquait son bac sous `packages/banc/` pour hériter de son
 *  `node_modules`. Il a été **corrigé**, pas excepté : son bac vit maintenant dans le dossier
 *  temporaire, avec le `node_modules` du paquet **lié** — la technique du lot `0l`, et `rmSync` ne
 *  suit pas les liens.
 *
 *  Il a aussi trouvé, en chemin, que le masque de `lire-du-code` devenait **aveugle** sur un
 *  littéral d'expression régulière contenant une apostrophe : 21 775 caractères de code cachés
 *  dans 30 fichiers, dont 3 456 dans `garde-tesseract.ts` lui-même. Un garde-fou aveugle ne dit
 *  pas « vert », il ne dit rien. */

const RACINE = racineDuDepot(new URL("../../../", import.meta.url));
const DOSSIER = dossierDuProjet(RACINE, new URL("../../../", import.meta.url));

/** Les sources suivies du projet, **chemins relatifs au projet** : c'est ainsi que les exceptions
 *  et les porteurs les nomment, et deux façons d'écrire un chemin finissent toujours par diverger.
 *
 *  **Lues une fois pour tout le fichier**, et c'est une question de marge : énumérer et masquer
 *  732 fichiers coûte entre 400 et 700 ms, et sept contrôles le refaisaient. Au premier passage, ce
 *  fichier portait la marge la plus courte du dépôt — ×3,89 — sans rien prouver de plus. La règle du
 *  lot `0w` dit de raccourcir le corps, jamais d'allonger le délai ; la voici appliquée avant qu'un
 *  lot soit nécessaire. Rien n'écrit dans ces sources, donc les partager ne mêle aucun état. */
let lues: readonly Source[] | undefined;
const sources = (): readonly Source[] => {
  lues ??= fichiersSuivis(RACINE, DOSSIER)
    .filter((chemin) => !chemin.includes("/dist/"))
    .map((chemin) => ({
      chemin: chemin.slice(DOSSIER.length + 1),
      contenu: readFileSync(join(RACINE, chemin), "utf8"),
    }));
  return lues;
};

/** Le relevé complet, lui aussi fait une fois : trois contrôles le demandent. */
let releve: readonly ReturnType<typeof effacementsRecursifs>[number][] | undefined;
const tousLesEffacements = (): readonly ReturnType<typeof effacementsRecursifs>[number][] => {
  releve ??= effacementsRecursifs(sources());
  return releve;
};

describe("un effacement récursif ne sort pas du dossier temporaire (lot 0z bis)", () => {
  /** L'ancre, celle qui ne se saute jamais : si l'énumération rendait peu de chose, tout ce qui
   *  suit passerait au vert sur du vide. Les planchers disent l'ordre de grandeur mesuré le
   *  20 novembre 2026 — 732 sources lisibles, 196 effacements récursifs dans le périmètre — et non
   *  un chiffre exact, qui se périmerait au premier banc ajouté. */
  it("lit vraiment le dépôt, et y trouve des effacements à juger", () => {
    const lues = sources();
    expect(lues.length, "l'énumération ne rend presque rien : le relevé serait vide").toBeGreaterThan(300);
    expect(
      tousLesEffacements().length,
      "aucun effacement récursif relevé : le garde-fou ne garde plus rien, retirez-le ou dites pourquoi",
    ).toBeGreaterThan(100);
  });

  /** La mesure même. */
  it("aucun effacement récursif ne vise un chemin hors du dossier temporaire", () => {
    const accuses = effacementsHorsDuBac(sources());
    const dit = accuses
      .map(
        (un) =>
          `${un.chemin}:${un.ligne} — ${un.appel}(${un.cible}) ne mène pas au dossier temporaire.\n` +
          `    Remontée : ${un.trace.join(" ; ") || "aucune liaison dans ce fichier"}\n` +
          `    Trois réponses, et trois seulement : fabriquez le bac dans le dossier temporaire, ` +
          `appelez ${REFUS_NOMME}, ou inscrivez une exception nommée avec sa raison.`,
      )
      .join("\n\n");
    expect(dit).toBe("");
  });

  /** Une liste d'exemptions qui survit à ce qu'elle exemptait est pire que pas de liste : c'est la
   *  leçon de `decideeAilleurs` au lot D3. */
  it("aucune exception n'est morte : son site existe et son chemin déclaré paraît dans le fichier", () => {
    const mortes = exceptionsMortes(sources());
    expect(
      mortes.map((une) => `${une.exception.chemin} (${une.exception.cible}) : ${une.pourquoi}`).join("\n"),
    ).toBe("");
    expect(EXCEPTIONS.length, "la liste des exceptions est vide : ce contrôle ne garde plus rien d'elle").toBeGreaterThan(0);
  });

  /** Les deux modules qui portent le refus sont hors du relevé **parce qu'ils le portent**. Le jour
   *  où l'un le perdrait, il devrait rejoindre le relevé plutôt que rester exempté par habitude. */
  it("chaque porteur du refus porte encore une comparaison au dossier temporaire", () => {
    expect(porteursSansRefus(sources())).toEqual([]);
    expect(PORTEURS_DU_REFUS.length).toBeGreaterThan(0);
  });

  /** **Le branchement, mesuré et non supposé.** Les deux exemples qui effacent un chemin venu d'un
   *  argument ne sont bornés que par leur appel au refus : jugés sans lui, ils sont accusés. Retirer
   *  l'appel dans l'un d'eux fait donc rougir le contrôle du dessus — c'est l'exigence du lot, et
   *  elle se lit ici en chiffres plutôt qu'en promesse. */
  it("retirer l'appel au refus dans un exemple le fait entrer au relevé", () => {
    const lues = sources();
    const tenus = tiennentParLeRefusNomme(lues);
    expect(
      tenus,
      "aucun fichier ne tient par le refus nommé : l'exigence « retirer l'appel doit faire rougir » " +
        "ne garde plus rien. Dites pourquoi, ou retirez-la.",
    ).not.toHaveLength(0);
    expect(tenus).toContain("apps/app/src-tauri/examples/parcours-complet.rs");

    // Et la dépendance se mesure fichier par fichier : sans le refus, chacun est accusé.
    for (const chemin of tenus) {
      const source = lues.find((une) => une.chemin === chemin)!;
      expect(
        effacementsHorsDuBac([source], { ignorerLeRefus: true }).length,
        `${chemin} ne serait pas accusé sans son refus : il ne tient donc pas par lui`,
      ).toBeGreaterThan(0);
    }
  });

  /** Les quatre langages sont vraiment dans le filet. Sans ce contrôle, un langage pourrait en
   *  sortir sans bruit — par une extension oubliée, par exemple — et le relevé resterait vert. */
  it("les trois familles de langage sont lues, et aucune n'est sortie du filet en silence", () => {
    const parLangage = new Map<string, number>();
    for (const un of tousLesEffacements()) {
      const langage = langageDe(un.chemin)!;
      parLangage.set(langage, (parLangage.get(langage) ?? 0) + 1);
    }
    expect([...parLangage.keys()].sort()).toEqual(["js", "python", "rust"]);
  });

  /** Ce qu'aucun langage ne couvre est **dit**, jamais tu — et surtout, aucun fichier de code n'y
   *  figure : une source de code dans les ignorées serait un trou muet. */
  it("les sources ignorées sont dites, et aucune n'est du code", () => {
    const ignorees = sourcesIgnorees(sources());
    expect(ignorees.filter((un) => /\.(?:ts|tsx|mts|cts|js|mjs|cjs|rs|py)$/u.test(un))).toEqual([]);
  });
});

/** Le garde-fou éprouvé sur des sources **fabriquées**, où l'on connaît la réponse d'avance.
 *
 *  Le dépôt réel ne peut pas prouver qu'un accusé le soit à bon droit : il est vert, et un vert ne
 *  distingue pas « rien à dire » de « je ne vois rien ». */
describe("ce que le garde-fou voit, et ce qu'il refuse de voir (lot 0z bis)", () => {
  const une = (chemin: string, contenu: string): readonly Source[] => [{ chemin, contenu }];

  it("accuse un effacement récursif qui ne mène pas au dossier temporaire", () => {
    const accuses = effacementsHorsDuBac(
      une("packages/essai/test/faux.test.ts", 'const ou = join(PROJET, "sortie");\nrmSync(ou, { recursive: true });\n'),
    );
    expect(accuses).toHaveLength(1);
    expect(accuses[0]!.cible).toBe("ou");
  });

  it("laisse passer celui qui mène au dossier temporaire, même par un assistant du fichier", () => {
    const contenu =
      'const bacs: string[] = [];\n' +
      'const neuf = () => {\n' +
      '  const chemin = mkdtempSync(join(tmpdir(), "essai-"));\n' +
      "  bacs.push(chemin);\n" +
      "  return chemin;\n" +
      "};\n" +
      "for (const bac of bacs.splice(0)) rmSync(bac, { recursive: true, force: true });\n";
    expect(effacementsHorsDuBac(une("packages/essai/test/vrai.test.ts", contenu))).toEqual([]);
  });

  /** **`mkdtempSync` n'est pas une marque du bac**, et c'est tout le sujet du lot : il fabrique un
   *  dossier temporaire **où on lui dit**, et c'est ainsi que le seul effacement fautif du dépôt
   *  visait l'intérieur de l'arbre réel. */
  it("n'accepte pas `mkdtempSync` ailleurs que dans le dossier temporaire", () => {
    const contenu = 'const bac = mkdtempSync(join(PAQUET, "essai-"));\nrmSync(bac, { recursive: true, force: true });\n';
    expect(effacementsHorsDuBac(une("packages/essai/test/sous-le-paquet.test.ts", contenu))).toHaveLength(1);
  });

  /** Un effacement d'un seul fichier n'est pas récursif, et le dire ferait du garde-fou un
   *  accusateur de masse. */
  it("ne juge pas un effacement qui n'est pas récursif", () => {
    expect(effacementsHorsDuBac(une("packages/essai/scripts/outil.ts", "rmSync(join(PROJET, \"un.json\"));\n"))).toEqual([]);
  });

  /** Il lit à travers le masque : une citation n'est pas du code. Sans cela il s'accuserait
   *  lui-même, comme le garde-fou des promesses le 6 novembre et celui des fichiers non suivis le
   *  7 — deux fois, la leçon déjà écrite au registre. */
  it("ne s'accuse pas d'un effacement cité dans une chaîne ou un commentaire", () => {
    const contenu =
      '// rmSync(PROJET, { recursive: true });\n' +
      'const exemple = "rmSync(PROJET, { recursive: true })";\n' +
      "const motif = /rmSync\\('x'\\)/u;\n" +
      "expect(exemple).toContain(motif.source);\n";
    expect(effacementsHorsDuBac(une("packages/essai/test/citations.test.ts", contenu))).toEqual([]);
  });

  /** Le périmètre, éprouvé des deux côtés sur **le même code** : dans un module de contrôle Rust il
   *  est jugé, dans le corps du produit il ne l'est pas. Le produit efface ce que l'utilisateur lui
   *  demande, et l'écran le confirme. */
  it("juge les contrôles Rust de `src/`, et laisse le produit qui les entoure", () => {
    const corps = "fn retirer(chemin: &Path) {\n    fs::remove_dir_all(chemin).ok();\n}\n";
    const avecControle =
      corps + "\n#[cfg(test)]\nmod essais {\n    fn essai() {\n        let ou = racine.join(\"x\");\n        fs::remove_dir_all(&ou).ok();\n    }\n}\n";
    expect(effacementsHorsDuBac(une("apps/app/src-tauri/src/essai.rs", corps))).toEqual([]);
    expect(effacementsHorsDuBac(une("apps/app/src-tauri/src/essai.rs", avecControle))).toHaveLength(1);
  });

  /** Python a ses commentaires à lui, et le masque doit les connaître : sinon un `rmtree` commenté
   *  deviendrait une accusation. */
  it("ne s'accuse pas d'un `rmtree` commenté en Python", () => {
    expect(
      effacementsHorsDuBac(une("apps/app/src-tauri/outils/essai.py", "# shutil.rmtree(RACINE)\nx = 1\n")),
    ).toEqual([]);
    expect(
      effacementsHorsDuBac(une("apps/app/src-tauri/outils/essai.py", "CIBLE = RACINE / \"x\"\nshutil.rmtree(CIBLE)\n")),
    ).toHaveLength(1);
  });

  /** **Le masque, éprouvé là où il devenait aveugle.** Un littéral d'expression régulière portant
   *  une apostrophe ouvrait une chaîne qui ne se refermait jamais, et tout le fichier d'après était
   *  blanchi — 21 775 caractères dans 30 fichiers, mesurés le 20 novembre 2026. Un garde-fou aveugle
   *  ne dit pas « vert », il ne dit rien : sans ce contrôle, la correction du masque ne serait tenue
   *  par personne. */
  it("voit encore l'effacement qui suit une expression régulière portant une apostrophe", () => {
    const contenu =
      "const motif = /^[\\p{L}'’-]{3,}$/u;\n" +
      'const ou = join(PROJET, "sortie");\n' +
      "rmSync(ou, { recursive: true, force: true });\n" +
      "export const vrai = motif.test(ou);\n";
    expect(
      effacementsHorsDuBac(une("packages/essai/test/apostrophe.test.ts", contenu)),
      "le masque est redevenu aveugle après une expression régulière : la cécité du 20 novembre 2026",
    ).toHaveLength(1);
  });

  /** La détection des exceptions mortes, éprouvée elle aussi. Un contrôle qui exige une liste vide
   *  passe au vert si la fonction rend toujours le vide : il faut donc lui donner une exception
   *  morte connue et exiger qu'elle la voie, dans ses trois formes. */
  it("voit une exception morte, dans ses trois formes", () => {
    const vraies = une(
      "apps/app/src-tauri/outils/essai.py",
      'MOTEURS = RACINE / "moteurs"\nshutil.rmtree(MOTEURS)\n',
    );
    const absent = exceptionsMortes(vraies, [
      { chemin: "apps/app/src-tauri/outils/parti.py", cible: "MOTEURS", efface: "moteurs", pourquoi: "—" },
    ]);
    expect(absent.map((une_) => une_.pourquoi)).toEqual(["le fichier n'est pas là"]);

    const autreCible = exceptionsMortes(vraies, [
      { chemin: "apps/app/src-tauri/outils/essai.py", cible: "AUTRE", efface: "moteurs", pourquoi: "—" },
    ]);
    expect(autreCible.map((une_) => une_.pourquoi)).toEqual(["ce site n'efface plus cette cible"]);

    const cheminAbsent = exceptionsMortes(vraies, [
      { chemin: "apps/app/src-tauri/outils/essai.py", cible: "MOTEURS", efface: "ailleurs/jamais-ecrit", pourquoi: "—" },
    ]);
    expect(cheminAbsent.map((une_) => une_.pourquoi)).toEqual([
      "le chemin déclaré ne paraît pas dans le fichier",
    ]);
  });

  /** Et la détection d'un porteur qui aurait perdu son refus : même raison, même forme. */
  it("voit un porteur qui ne compare plus rien au dossier temporaire", () => {
    const sansRefus = une("packages/essai/src/porteur.ts", "export const effacer = (ou: string) => rmSync(ou);\n");
    expect(porteursSansRefus(sansRefus, ["packages/essai/src/porteur.ts"])).toEqual([
      "packages/essai/src/porteur.ts",
    ]);

    const avecRefus = une(
      "packages/essai/src/porteur.ts",
      'export const effacer = (ou: string) => {\n  if (!ou.startsWith(tmpdir())) throw new Error("hors du bac");\n  rmSync(ou, { recursive: true });\n};\n',
    );
    expect(porteursSansRefus(avecRefus, ["packages/essai/src/porteur.ts"])).toEqual([]);
  });

  /** Hors du périmètre, rien n'est jugé — et il faut le dire, sans quoi personne ne saurait que le
   *  produit en est dehors. */
  it("ne juge pas le code du produit, qui efface ce que l'utilisateur demande", () => {
    expect(estDansLePerimetre("outils/cache/src/index.ts")).toBe(false);
    expect(estDansLePerimetre("packages/banc/test/un-essai.test.ts")).toBe(true);
    expect(estDansLePerimetre("apps/app/src-tauri/examples/parcours-complet.rs")).toBe(true);
    expect(estDansLePerimetre("apps/app/src-tauri/outils/preparer-moteurs.py")).toBe(true);
  });
});
