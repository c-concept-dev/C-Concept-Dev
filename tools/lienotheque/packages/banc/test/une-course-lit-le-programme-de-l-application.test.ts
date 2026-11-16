import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** `tools/lienotheque/` : trois niveaux au-dessus de `test/`, comme les autres contrôles du banc. */
const PROJET = new URL("../../../", import.meta.url);

/** Dette **D1**, lot 0u — **une course qui éprouve la lecture lit avec le programme de
 *  l'application**, et non avec celui que le coureur fournit.
 *
 *  ## Pourquoi, et ce que la mesure a trouvé
 *
 *  `lienotheque-ci.yml` a payé cette dette le 9 novembre 2026 : sa voie 3 déploie l'archive des
 *  moteurs épinglée par son empreinte, puis met son `bin` **devant** le PATH. Le cahier a donc
 *  inscrit D1 **levée**. Mais `lienotheque-tauri.yml`, lui, installait encore
 *  `brew install tesseract` et publiait « tesseract **5.5.4** (fra) » comme critère du CDC, là où
 *  l'application embarque **5.5.1** et leptonica **1.86.0**. La moitié de la mesure publiée
 *  décrivait le coureur et non le produit livré — exactement ce que D1 nommait.
 *
 *  Décision de Christophe du 14 novembre 2026 : « l'archive publiée fait foi […] et non une
 *  fabrication du jour ». L'archive fait foi **pour les programmes** ; le commit sous essai fait
 *  foi **pour la chaîne**.
 *
 *  ## Le piège, et c'est lui qui fixe un ordre
 *
 *  L'archive porte un dossier `chaine`, et elle date du **9 novembre** alors que les sources de
 *  la chaîne ont changé le **12** (`5652daee`). La déployer en dernier remplacerait
 *  `moteurs/chaine/moteur.js` par celui d'il y a cinq jours, et l'épreuve « le moteur embarqué
 *  lit vraiment un document » prouverait **du code d'avant** en affichant une course verte.
 *  D'où l'ordre impératif que ce contrôle tient : archive **puis** `preparer-moteur-node.py`.
 *
 *  ## Pourquoi ce contrôle se saute sur l'intégration continue, et le dit
 *
 *  Les deux courses prennent le dépôt en `sparse-checkout: tools/lienotheque` : `.github/` n'y
 *  est pas, et ce contrôle n'a rien à lire là-bas. Il se saute donc en **paraissant dans le
 *  compte des sautés**, avec sa raison. C'est la dette **D0l** en petit : un workflow ne se
 *  vérifie que par la CI, après la poussée — sauf ce que ce contrôle-ci peut dire avant. */

/** La racine du dépôt **demandée à git**, et non comptée en `../`. Mon premier jet en comptait un
 *  de moins : les six contrôles se sont **tous sautés en silence**, et un garde-fou qui ne tourne
 *  jamais ne dit pas « vert » — il ne dit rien, ce qui est plus dangereux. Le saut doit venir d'un
 *  fait (`.github/` absent du lot), jamais d'une faute de chemin. */
const RACINE_DU_DEPOT = new URL(
  `${execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: PROJET, encoding: "utf8" }).trim()}/`,
  "file:///",
);
const TAURI = new URL(".github/workflows/lienotheque-tauri.yml", RACINE_DU_DEPOT);
const CI = new URL(".github/workflows/lienotheque-ci.yml", RACINE_DU_DEPOT);

const siLesWorkflowsSontLa = existsSync(TAURI) && existsSync(CI) ? it : it.skip;
const lire = (ou: URL): string => readFileSync(ou, "utf8");

describe("une course qui éprouve la lecture lit le programme de l'application (D1, lot 0u)", () => {
  /** Ce contrôle-ci ne se saute **jamais**, et il garde les autres de la faute que j'ai faite :
   *  un `../` de moins dans la racine, et les six contrôles se sautaient en silence. Un saut doit
   *  venir d'un fait — `.github/` hors du lot récupéré — jamais d'un chemin qui ne désigne rien. */
  it("désigne vraiment la racine du dépôt, pour qu'un saut ne puisse pas venir d'un chemin faux", () => {
    expect(
      existsSync(new URL(".git", RACINE_DU_DEPOT)),
      `${RACINE_DU_DEPOT.pathname} n'est pas la racine du dépôt : les contrôles ci-dessous se sauteraient sans rien dire`,
    ).toBe(true);
  });

  siLesWorkflowsSontLa("le prototype n'installe plus Tesseract depuis Homebrew (sauté si `.github/` n'est pas du lot)", () => {
    const tauri = lire(TAURI);
    const installations = tauri
      .split("\n")
      .map((ligne, rang) => ({ ligne: ligne.trim(), rang: rang + 1 }))
      .filter((une) => /^run:.*brew install .*tesseract/u.test(une.ligne) || /^- brew install .*tesseract/u.test(une.ligne))
      .map((une) => `ligne ${une.rang} : ${une.ligne}`);
    expect(installations, "le Tesseract de Homebrew n'est pas celui du produit (D1)").toEqual([]);
  });

  siLesWorkflowsSontLa("le prototype ne fabrique plus les moteurs du jour : l'archive publiée fait foi (sauté si `.github/` n'est pas du lot)", () => {
    const tauri = lire(TAURI);
    // `--autotest` n'embarque rien : il éprouve le lecteur de table d'imports PE sans Windows.
    const fabrications = tauri
      .split("\n")
      .map((ligne) => ligne.trim())
      .filter((ligne) => ligne.includes("preparer-moteurs.py") && !ligne.includes("--autotest"));
    expect(fabrications, "décision du 14 novembre 2026 : l'archive publiée fait foi, pas une fabrication du jour").toEqual([]);
  });

  siLesWorkflowsSontLa("le prototype déploie l'archive épinglée et refuse une autre empreinte (sauté si `.github/` n'est pas du lot)", () => {
    const tauri = lire(TAURI);
    expect(tauri, "l'adresse et l'empreinte se lisent dans la donnée, jamais recopiées").toContain(
      "fixtures/moteurs-de-lecture.json",
    );
    expect(tauri, "une archive à l'empreinte inattendue doit faire rougir la course").toContain(
      "empreinte inattendue pour l'archive des moteurs",
    );
    expect(tauri, "le programme de l'application passe devant celui du coureur").toContain("GITHUB_PATH");
  });

  siLesWorkflowsSontLa("reconstruit la chaîne APRÈS avoir déployé l'archive, jamais avant (sauté si `.github/` n'est pas du lot)", () => {
    const lignes = lire(TAURI).split("\n");
    const rangDe = (quoi: string): number => lignes.findIndex((ligne) => ligne.includes(quoi));
    const archive = rangDe("tar -xzf");
    const chaine = rangDe("preparer-moteur-node.py");
    expect(archive, "le déploiement de l'archive est introuvable").toBeGreaterThan(-1);
    expect(chaine, "la reconstruction de la chaîne est introuvable").toBeGreaterThan(-1);
    expect(
      chaine,
      "l'archive porte une chaîne du 9 novembre : déployée après la reconstruction, elle recouvrirait le code sous essai",
    ).toBeGreaterThan(archive);
  });

  siLesWorkflowsSontLa("ne laisse pas deux Tesseract joignables sans dire lequel répond (sauté si `.github/` n'est pas du lot)", () => {
    const tauri = lire(TAURI);
    expect(tauri, "la course doit dire quel tesseract répond, et d'où il vient").toMatch(/command -v tesseract|which -a tesseract/u);
  });

  /** Demandé par Christophe le 16 novembre 2026 : « Vérifie que `lienotheque-tauri.yml` se
   *  déclenche quand son propre fichier change. » Vérifié — il y était déjà, dans `push` comme
   *  dans `pull_request` —, et désormais **tenu** plutôt que vérifié une fois.
   *
   *  La raison est mesurée, et elle a coûté cher le 12 novembre 2026 : le déclencheur de cette
   *  course ne regardait que `main` alors que le travail vit sur `wip/**` depuis deux semaines.
   *  **Aucune poussée de Rust n'avait donc été vérifiée par personne.** Un contrôle qui ne tourne
   *  jamais ne dit pas « vert » : il ne dit rien, et la page des courses, elle, est verte. Une
   *  course qui ne se relance pas quand on la modifie elle-même est la même faute en plus petit —
   *  on corrigerait ses étapes sans jamais les éprouver. */
  siLesWorkflowsSontLa("chaque course se relance quand son propre fichier change (sauté si `.github/` n'est pas du lot)", () => {
    for (const [nom, ou] of [
      ["lienotheque-ci.yml", CI],
      ["lienotheque-tauri.yml", TAURI],
    ] as const) {
      const texte = lire(ou);
      const filtres = [...texte.matchAll(/^ {4}paths:$/gmu)].length;
      expect(filtres, `${nom} : les filtres de chemins de « push » et de « pull_request »`).toBe(2);
      const soi = [...texte.matchAll(new RegExp(`^ {6}- '\\.github/workflows/${nom}'$`, "gmu"))].length;
      expect(
        soi,
        `${nom} doit se nommer dans ses DEUX filtres de chemins, sans quoi on corrigerait ses étapes sans jamais les éprouver`,
      ).toBe(2);
    }
  });

  siLesWorkflowsSontLa("les deux courses lisent la même donnée épinglée, et aucune n'écrit l'empreinte à la main (sauté si `.github/` n'est pas du lot)", () => {
    const epinglee = JSON.parse(readFileSync(new URL("fixtures/moteurs-de-lecture.json", PROJET), "utf8")) as {
      readonly archive: { readonly empreinte_sha256: string; readonly url: string };
    };
    for (const [nom, ou] of [
      ["lienotheque-ci.yml", CI],
      ["lienotheque-tauri.yml", TAURI],
    ] as const) {
      const texte = lire(ou);
      expect(texte, `${nom} doit lire l'archive dans la donnée`).toContain("fixtures/moteurs-de-lecture.json");
      expect(texte, `${nom} : une empreinte écrite à deux endroits se périme à un seul des deux`).not.toContain(
        epinglee.archive.empreinte_sha256,
      );
      expect(texte, `${nom} : une adresse écrite à deux endroits se périme à un seul des deux`).not.toContain(
        epinglee.archive.url,
      );
    }
  });
});
