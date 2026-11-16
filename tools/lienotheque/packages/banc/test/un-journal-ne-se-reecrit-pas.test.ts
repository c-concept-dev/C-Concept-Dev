import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENTETE_DU_JOURNAL,
  PREMIER_NUMERO,
  entreesDuJournal,
  rupturesDeNumerotation,
} from "../src/journal-en-ajout-seul.js";

/** Dette D12, seconde moitié — le registre des poussées est un journal **en ajout seul** :
 *  numéros consécutifs et croissants, et **aucune entrée jamais réécrite** (demandé par
 *  Christophe le 8 novembre 2026, échéance posée le 16 novembre).
 *
 *  ## Pourquoi l'historique Git plutôt qu'un relevé d'empreintes
 *
 *  La ligne du lot prévoyait d'enregistrer l'empreinte de chaque ligne, et avertissait que le
 *  premier relevé **figerait l'état actuel** sans rien prouver du passé. L'historique Git est déjà
 *  ce relevé, il porte le passé entier, et il ne demande aucune donnée à tenir à jour. Mesuré : ses
 *  **35** versions se lisent en **108 ms** en une commande.
 *
 *  ## Pourquoi ce contrôle se saute sur l'intégration continue, et le dit
 *
 *  Même raison qu'au lot 0m : `actions/checkout@v5` ne récupère qu'**un** commit, et
 *  `lienotheque-ci.yml` ne pose aucun `fetch-depth`. Là-bas, l'historique du registre serait vide
 *  et le contrôle dirait « aucune entrée réécrite » sans avoir rien lu — un vert qui ne garde rien.
 *  Il se saute donc en **paraissant dans le compte des sautés**, et dit pourquoi. */

/** `tools/lienotheque/`, et non la racine du dépôt : trois niveaux au-dessus de `test/`. */
const RACINE = new URL("../../../", import.meta.url);
const JOURNAL = "docs/autorisations-de-push.md";

const git = (...args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd: RACINE, encoding: "utf8" }).trim();

const historiqueTronque = (): boolean => git("rev-parse", "--is-shallow-repository") === "true";
const siHistoriqueComplet = historiqueTronque() ? it.skip : it;

/** Le chemin du journal **vu du dépôt**, et non de ce paquet : `git cat-file` ne connaît que
 *  celui-là. Demandé à git plutôt qu'écrit, pour qu'un déplacement du projet ne mente pas. */
const cheminDansLeDepot = (): string => `${git("rev-parse", "--show-prefix")}${JOURNAL}`;

/** Toutes les versions passées du journal, **en une commande**.
 *
 *  `--full-history` et non l'historique simplifié : une version posée d'un seul côté d'une fusion
 *  ne doit pas disparaître du relevé. Mesuré aujourd'hui : l'historique simplifié,
 *  `--full-history` et `--all --full-history` donnent les trois **35** versions, et la lecture
 *  coûte 108 ms dans les trois cas. On garde `--full-history` sur la branche courante : `--all`
 *  rapporterait les versions d'autres branches, c'est-à-dire le travail d'autres sessions. */
function versionsPassees(): readonly { readonly commit: string; readonly texte: string }[] {
  const chemin = cheminDansLeDepot();
  const commits = git("log", "--full-history", "--format=%H", "--", JOURNAL).split("\n").filter((une) => une.length > 0);
  if (commits.length === 0) return [];
  const reponse = execFileSync("git", ["cat-file", "--batch"], {
    cwd: RACINE,
    input: `${commits.map((commit) => `${commit}:${chemin}`).join("\n")}\n`,
    maxBuffer: 64 * 1024 * 1024,
  });

  // Une réponse par demande, dans l'ordre : « <oid> blob <octets>\n<contenu>\n », ou
  // « <demande> missing\n ». La taille est en OCTETS : on découpe donc des octets, et on décode
  // ensuite. Découper des signes ferait glisser le relevé d'autant d'accents que le texte en porte
  // — c'est arrivé pendant la mesure, et la première version lue y perdait sa fin.
  const versions: { readonly commit: string; readonly texte: string }[] = [];
  const manquantes: string[] = [];
  let reste = reponse;
  let rang = 0;
  while (reste.length > 0 && rang < commits.length) {
    const saut = reste.indexOf("\n");
    if (saut === -1) break;
    const entete = reste.subarray(0, saut).toString("utf8").split(" ");
    const commit = commits[rang] ?? "";
    rang += 1;
    if (entete[1] !== "blob") {
      manquantes.push(`${commit.slice(0, 8)} (${entete[1] ?? "réponse illisible"})`);
      reste = reste.subarray(saut + 1);
      continue;
    }
    const octets = Number(entete[2]);
    versions.push({ commit, texte: reste.subarray(saut + 1, saut + 1 + octets).toString("utf8") });
    reste = reste.subarray(saut + 1 + octets + 1);
  }
  expect(
    manquantes,
    `version(s) du journal qu'aucun objet ne porte sous « ${chemin} » : le fichier a-t-il été déplacé ? Si oui, c'est le relevé qu'il faut suivre, pas ce contrôle qu'il faut éteindre`,
  ).toEqual([]);
  return versions;
}

describe("le registre des poussées est un journal en ajout seul (D12)", () => {
  it("porte des numéros consécutifs et croissants, à partir de celui que l'archive gelée laisse libre", () => {
    const entrees = entreesDuJournal(readFileSync(new URL(JOURNAL, RACINE), "utf8"));
    expect(entrees.length, "aucune entrée lue : l'entête de la table a-t-il changé ?").toBeGreaterThan(0);
    expect(rupturesDeNumerotation(entrees), "rupture(s) dans la numérotation du registre").toEqual([]);
  });

  siHistoriqueComplet("n'a jamais vu réécrire une entrée, sur toutes ses versions passées (sauté si l'historique est tronqué)", () => {
    const vues = new Map<number, { readonly ligne: string; readonly ou: string }>();
    const reecrites: string[] = [];
    const juger = (ou: string, texte: string): void => {
      for (const entree of entreesDuJournal(texte)) {
        const connue = vues.get(entree.numero);
        if (connue === undefined) vues.set(entree.numero, { ligne: entree.ligne, ou });
        else if (connue.ligne !== entree.ligne)
          reecrites.push(`entrée ${entree.numero} : écrite dans ${connue.ou}, autre dans ${ou}`);
      }
    };

    // De la plus ancienne version à la plus récente, puis la copie de travail : le rouge nomme
    // ainsi la version qui portait la ligne d'origine, et non l'inverse.
    const versions = versionsPassees();
    expect(versions.length, "aucune version passée lue : le relevé est muet, donc le contrôle ne garde rien").toBeGreaterThan(0);
    for (const version of [...versions].reverse()) juger(version.commit.slice(0, 8), version.texte);
    juger("la copie de travail", readFileSync(new URL(JOURNAL, RACINE), "utf8"));

    expect(reecrites, "entrée(s) de journal réécrite(s) : une correction s'écrit dans une entrée NOUVELLE").toEqual([]);

    // Et l'ajout seul vaut aussi contre l'effacement. Mesuré pendant les mutations de ce lot :
    // effacer l'entrée du MILIEU ouvre un trou que la numérotation voit, mais effacer la
    // DERNIÈRE laisse une numérotation parfaite et des lignes intactes — les deux contrôles
    // passaient au vert. Un journal en ajout seul n'oublie rien : ce qu'une version a porté, la
    // copie de travail le porte encore.
    const aujourd_hui = new Set(entreesDuJournal(readFileSync(new URL(JOURNAL, RACINE), "utf8")).map((une) => une.numero));
    const disparues = [...vues.keys()].filter((numero) => !aujourd_hui.has(numero)).sort((a, b) => a - b);
    expect(disparues, "entrée(s) qu'une version passée portait et que le journal ne porte plus").toEqual([]);
  });

  it("attrape un trou, un doublon et un retour en arrière, et ne lit rien avant l'entête (cas construits)", () => {
    const journal = (...numeros: readonly number[]): string =>
      [ENTETE_DU_JOURNAL, "|---|---|---|---|", ...numeros.map((une) => `| ${une} | x | y | z |`)].join("\n");

    expect(rupturesDeNumerotation(entreesDuJournal(journal(19, 20, 21)))).toEqual([]);
    expect(rupturesDeNumerotation(entreesDuJournal(journal(19, 21)))).toEqual(["après 19 vient 21 : un trou (attendu 20)"]);
    expect(rupturesDeNumerotation(entreesDuJournal(journal(19, 20, 20)))).toEqual([
      "après 20 vient 20 : deux fois le même numéro (attendu 21)",
    ]);
    // Le défaut du 8 novembre 2026, tel qu'il s'est produit : des rangées en ordre décroissant.
    expect(rupturesDeNumerotation(entreesDuJournal(journal(19, 20, 23, 22, 21)))).toEqual([
      "après 20 vient 23 : un trou (attendu 21)",
      "après 23 vient 22 : un retour en arrière (attendu 24)",
      "après 22 vient 21 : un retour en arrière (attendu 23)",
    ]);
    expect(rupturesDeNumerotation(entreesDuJournal(journal(20, 21)))).toEqual([
      `la première entrée porte 20 et non ${PREMIER_NUMERO}`,
    ]);

    // Une table avant l'entête ne compte pas : l'archive gelée en porte 125 rangées de ce genre,
    // et un motif seul les prendrait pour des entrées.
    const avant = `| 7 | une mesure | ailleurs |\n| 8 | une autre | ailleurs |\n${journal(19, 20)}`;
    expect(entreesDuJournal(avant).map((une) => une.numero)).toEqual([19, 20]);
    // Et sans entête, rien n'est lu — dit comme une rupture, non comme un journal en ordre.
    expect(rupturesDeNumerotation(entreesDuJournal("| 19 | x | y | z |"))).toHaveLength(1);
  });
});
