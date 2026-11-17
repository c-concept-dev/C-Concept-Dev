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

  /** **Un ordre à trois temps, et chacun a coûté quelque chose.**
   *
   *  1. l'**archive** : elle apporte les programmes qui lisent ;
   *  2. la **chaîne**, reconstruite depuis le commit sous essai : l'archive en porte une du
   *     9 novembre, et déployée après elle recouvrirait le code sous essai — une course verte sur
   *     du code d'avant ;
   *  3. le **PATH** des moteurs, en dernier.
   *
   *  Le troisième temps est né d'une faute à moi, trouvée par la course du 16 novembre 2026 :
   *  j'avais posé le PATH juste après l'archive. `preparer-moteur-node.py` prend le node du PATH
   *  (`shutil.which`) et l'écrit dans `moteurs/bin/node` ; avec `moteurs/bin` en tête, il trouvait
   *  **sa propre cible**, l'effaçait — le script efface avant de copier, pour ne pas écrire par
   *  dessus un binaire signé —, puis échouait sur `FileNotFoundError`. Il doit embarquer le node
   *  **du coureur**, pas celui de l'archive. */
  siLesWorkflowsSontLa("tient l'ordre archive → chaîne → PATH, et chacun pour sa raison (sauté si `.github/` n'est pas du lot)", () => {
    const lignes = lire(TAURI).split("\n");
    const rangDe = (quoi: string): number => lignes.findIndex((ligne) => ligne.includes(quoi));
    const archive = rangDe("tar -xzf");
    const chaine = rangDe("preparer-moteur-node.py");
    // `$moteurs/bin` et non `GITHUB_PATH` seul : l'étape Windows, gardée plus haut pour le jour
    // où la question se reposera, écrit elle aussi dans `GITHUB_PATH` — et le premier repère
    // trouvé était le sien. Le contrôle l'a dit en rougissant pour la mauvaise raison, ce qui
    // est encore une bonne raison de l'écrire.
    const chemin = rangDe('echo "$moteurs/bin" >> "$GITHUB_PATH"');
    expect(archive, "le déploiement de l'archive est introuvable").toBeGreaterThan(-1);
    expect(chaine, "la reconstruction de la chaîne est introuvable").toBeGreaterThan(-1);
    expect(chemin, "la mise du paquet en tête du PATH est introuvable").toBeGreaterThan(-1);
    expect(
      chaine,
      "l'archive porte une chaîne du 9 novembre : déployée après la reconstruction, elle recouvrirait le code sous essai",
    ).toBeGreaterThan(archive);
    expect(
      chemin,
      "le PATH des moteurs avant la reconstruction fait que le script trouve sa propre cible et l'efface",
    ).toBeGreaterThan(chaine);
  });

  /** Lot **0u sexies** — **l'étape qui annonce la liste doit la produire**.
   *
   *  La course **44125534966** a passé cette étape en vert, et pourtant sa liste était ceci :
   *
   *  ```
   *  tesseract joignables, dans l'ordre du PATH :
   *  command: -a: invalid option
   *  ```
   *
   *  `command -v` **ne prend aucune option** : `-a` est une forme de zsh, le shell de l'étape est
   *  bash, et le `|| true` avalait le refus. La comparaison qui suit — celle qui refuse vraiment —
   *  marchait ; mais l'étape **annonçait une liste qu'elle ne produisait pas**, et c'est la faute
   *  que ce dépôt nomme depuis le lot 0c ter : un garde-fou qui applique une règle et en annonce
   *  une autre trompe exactement qui le lit. Ici, il aurait tu une seconde installation de
   *  Tesseract — le défaut même que l'étape existe pour montrer.
   *
   *  **Et le garde-fou d'avant acceptait la forme cassée** : son motif `command -v tesseract`
   *  était satisfait par la ligne de comparaison, et la ligne de listage n'était vérifiée par
   *  personne. Un motif qui se contente d'un mot ne mesure rien.
   *
   *  ## Pourquoi ce contrôle **lance** la forme au lieu de la reconnaître
   *
   *  Un motif aurait accepté n'importe quelle autre invention refusée par bash. Ce contrôle
   *  extrait donc la ligne de listage de l'étape et **la lance**, en remplaçant le nom du
   *  programme par `sh` — qui existe partout. Il ne cherche pas Tesseract, il éprouve la **forme**
   *  : bash l'accepte-t-il, et rend-elle au moins un chemin ? Le verdict ne dépend donc ni de
   *  Tesseract, ni de cette machine. */
  siLesWorkflowsSontLa("ne laisse pas deux Tesseract joignables sans dire lequel répond, et la liste annoncée est vraiment produite (lot 0u sexies ; sauté si `.github/` n'est pas du lot)", () => {
    const tauri = lire(TAURI);
    const etape = tauri.slice(tauri.indexOf("- name: Dire quel Tesseract répond"));
    // Les **ordres** de l'étape, commentaires retirés : la règle porte sur ce que le shell
    // exécute. Mon premier jet jugeait le texte entier et se refusait sur mon propre commentaire,
    // qui cite la forme cassée pour l'expliquer — un garde-fou qui ne distingue pas un ordre
    // d'une explication interdit d'expliquer.
    const corps = etape
      .slice(0, etape.indexOf("\n      - name:"))
      .split("\n")
      .filter((ligne) => !ligne.trim().startsWith("#"))
      .join("\n");

    expect(corps, "l'étape doit comparer le tesseract qui répond au chemin attendu").toContain("command -v tesseract");
    expect(
      /command\s+-\w*v\w*\s+-/u.test(corps),
      "`command -v` ne prend aucune option : toute option lui fait rendre « invalid option » au lieu d'une liste",
    ).toBe(false);

    const listage = corps
      .split("\n")
      .map((ligne) => ligne.trim())
      .find((ligne) => /tesseract/u.test(ligne) && /^(type|which|command|whence|where)\b/u.test(ligne));
    expect(listage, "aucune ligne ne cherche les tesseract joignables : l'étape annoncerait une liste vide").toBeTruthy();

    // La forme, et non l'environnement : `sh` existe partout, Tesseract non. Ce contrôle
    // n'appelle aucune reconnaissance — il ne fait que demander à bash s'il comprend l'ordre.
    const surUnProgrammeQuiExiste = (listage ?? "").replace(/tesseract/gu, "sh").replace(/\s*\|\|\s*true$/u, "");
    const lance = ((): { readonly code: number; readonly sortie: string; readonly erreur: string } => {
      try {
        return { code: 0, sortie: execFileSync("bash", ["-c", surUnProgrammeQuiExiste], { encoding: "utf8", stdio: "pipe" }), erreur: "" };
      } catch (souci) {
        const echec = souci as { status?: number; stdout?: string; stderr?: string };
        return { code: echec.status ?? -1, sortie: echec.stdout ?? "", erreur: echec.stderr ?? "" };
      }
    })();

    expect(
      lance.code,
      `bash refuse « ${surUnProgrammeQuiExiste} » : ${lance.erreur.trim() || "sans rien dire"} — l'étape annoncerait une liste qu'elle ne produit pas`,
    ).toBe(0);
    expect(lance.erreur, "une forme que bash n'accepte pas s'en plaint sur la sortie d'erreur, et le journal de la course la montre").not.toMatch(
      /invalid option|usage:/u,
    );
    expect(
      lance.sortie.split("\n").filter((ligne) => ligne.includes("/")),
      "la forme doit rendre au moins un chemin : une liste vide ne dit pas lequel répond",
    ).not.toHaveLength(0);
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

  siLesWorkflowsSontLa(
    "le cache ne peut pas livrer un paquet sans les licences de l'archive (lot 0u ter ; sauté si `.github/` n'est pas du lot)",
    () => {
      // Depuis le lot 0u ter, les licences des moteurs viennent de l'archive. Un `moteurs/` repris
      // du cache sans son `licences/INVENTAIRE.json` ferait donc refuser la collecte en accusant
      // l'archive d'un défaut du cache — et l'état n'est pas théorique : une course qui échouait
      // après l'effacement des licences le laissait derrière elle.
      const texte = lire(TAURI);
      const etape = texte.slice(texte.indexOf("- name: Déployer les moteurs de l'application"));
      expect(
        etape,
        "l'étape de déploiement doit lire l'inventaire des licences avant de se croire dispensée",
      ).toContain("licences/INVENTAIRE.json");
      expect(
        /if: runner\.os == 'macOS' && steps\.cache-moteurs-lecture\.outputs\.cache-hit != 'true'/u.test(texte),
        "la dispense ne doit plus tenir au seul cache-hit : c'est la présence des licences qui décide",
      ).toBe(false);
    },
  );
  /** Lot **0s bis** — **la version de Node des deux courses est épinglée au correctif près**, comme
   *  celle de Rust l'est depuis le lot 0s.
   *
   *  ## Ce qui l'a provoquée, et c'est le nouveau garde-fou du lot 0u ter qui l'a dit
   *
   *  La course **44077859840** a refusé d'embarquer la chaîne, avec ce message :
   *
   *  ```
   *  node : le paquet ANNONCE 24.22.2, l'épingle dit 24.11.1
   *  ```
   *
   *  `preparer-moteur-node.py` embarque le node **du coureur** (`shutil.which("node")`) — il le
   *  doit, le PATH des moteurs arriverait sinon devant sa propre cible —, et les deux courses
   *  écrivaient `node-version: 24`, c'est-à-dire **le dernier 24.x du jour**. Le paquet partait
   *  donc avec un node 24.22.2 accompagné du texte de licence de 24.11.1 : un fichier redistribué
   *  dont la licence embarquée décrit une **autre** version. Le défaut était là depuis le premier
   *  jour ; seul le juge des versions, né la veille, pouvait le nommer.
   *
   *  **Ici, rien ne le voyait, et pour la plus mauvaise des raisons** : cette machine installe
   *  justement 24.11.1. La collecte était verte par coïncidence de versions, pas par épingle.
   *
   *  C'est la troisième fois que la même forme coûte un rouge — un outil installé « à la dernière
   *  version » : Rust (lot 0s, `rust-toolchain.toml` à `1.100.0`), le tesseract de Homebrew
   *  (dette D1, lot 0u), et Node aujourd'hui. Décision de Christophe du 13 novembre 2026, qui
   *  vaut mot pour mot ici : « on en change volontairement, jamais par surprise. »
   *
   *  ## Pourquoi l'épingle se lit dans la donnée, et pourquoi l'amont du collecteur est lu aussi
   *
   *  Le nombre `24.11.1` n'est écrit **dans aucun contrôle** : il se lit dans
   *  `fixtures/licences-des-moteurs.json`, qui est la donnée que la collecte juge. Un contrôle qui
   *  porterait sa propre copie de l'épingle resterait vert le jour où la donnée changerait — et
   *  c'est exactement la faute dont ce fichier garde déjà les empreintes d'archive.
   *
   *  Le collecteur, lui, décide de la version **attendue** depuis son `AMONT`. Si la donnée et
   *  `AMONT` divergeaient, ce contrôle garderait une épingle que personne ne juge : les courses
   *  installeraient la version de la donnée et la collecte refuserait au nom d'une autre. La
   *  dernière vérification ci-dessous ferme ce trou, et elle seule rend les précédentes vraies. */
  siLesWorkflowsSontLa(
    "les deux courses épinglent Node au correctif près, et au numéro que la donnée porte (lot 0s bis ; sauté si `.github/` n'est pas du lot)",
    () => {
      // `amont.node` est nommé, et non lu par index : sous `noUncheckedIndexedAccess`, un
      // `Record<string, …>` rendrait `undefined` possible et il faudrait l'écarter — alors que la
      // donnée doit porter cette clé, et son absence est déjà un refus du lot 0d.
      const epingle = (
        JSON.parse(readFileSync(new URL("fixtures/licences-des-moteurs.json", PROJET), "utf8")) as {
          readonly amont: { readonly node: { readonly version: string } };
        }
      ).amont.node.version;
      expect(epingle, "l'épingle de node doit nommer un correctif, pas une famille").toMatch(/^\d+\.\d+\.\d+$/u);

      for (const [nom, ou] of [
        ["lienotheque-ci.yml", CI],
        ["lienotheque-tauri.yml", TAURI],
      ] as const) {
        const demandees = [...lire(ou).matchAll(/^\s*node-version:\s*['"]?([^'"\s#]+)/gmu)].flatMap((trouve) =>
          trouve[1] === undefined ? [] : [trouve[1]],
        );
        expect(demandees.length, `${nom} : aucune version de Node demandée, ce contrôle ne garderait rien`).toBeGreaterThan(0);
        for (const demandee of demandees)
          expect(
            demandee,
            `${nom} demande Node « ${demandee} » : une famille sans correctif installe le dernier du jour, et le paquet partirait avec un binaire que sa licence embarquée ne décrit pas`,
          ).toBe(epingle);
      }

      const amont = readFileSync(new URL("apps/app/src-tauri/outils/collecter-licences.py", PROJET), "utf8");
      const versionDuCollecteur = /"node":\s*\{[^}]*?"version":\s*"([^"]+)"/su.exec(amont)?.[1];
      expect(
        versionDuCollecteur,
        "le collecteur doit attendre la version que la donnée épingle, sans quoi les courses installeraient l'une et la collecte refuserait au nom de l'autre",
      ).toBe(epingle);
    },
  );
});
