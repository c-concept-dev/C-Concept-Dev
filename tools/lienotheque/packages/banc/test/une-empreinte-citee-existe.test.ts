import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LONGUEURS_DE_CITATION, citationsDeCommit } from "../src/empreintes-citees.js";

/** Dette D12, lot 0m — **toute empreinte de commit citée dans les documents existe dans
 *  l'historique Git** (demandé par Christophe le 11 novembre 2026).
 *
 *  Née d'une faute à moi, le jour même : une empreinte **pariée avant que le commit existe**.
 *  L'intention de ce garde-fou est donc étroite et nette — un numéro de commit s'écrit après le
 *  commit, jamais avant, et personne ne doit pouvoir l'oublier sans qu'une course le dise.
 *
 *  Ce que chaque citation doit être, l'une de ces trois choses et rien d'autre :
 *
 *  1. un **commit qui existe** ;
 *  2. une citation **nommée** dans `fixtures/references/citations-qui-ne-sont-pas-des-commits.json`
 *     comme n'étant pas un commit — avec ce qu'elle est réellement ;
 *  3. une **empreinte fantôme** déclarée, avec le vrai commit qui la remplace — et ce vrai commit
 *     doit exister, sans quoi la déclaration ne vaudrait rien.
 *
 *  ## Pourquoi ce garde-fou se saute sur l'intégration continue, et le dit
 *
 *  `actions/checkout@v5` récupère par défaut **un seul commit** : vérifié dans
 *  `lienotheque-ci.yml`, qui ne pose aucun `fetch-depth`. Là-bas, `git cat-file` ignorerait
 *  presque toutes les empreintes et le garde-fou serait faux. Lui donner l'historique entier
 *  coûterait 4 798 commits sur trois machines, pour garder une porte qui est **locale** : le
 *  registre s'écrit ici, avant la poussée. Il se saute donc, en **disant pourquoi** — un saut
 *  muet serait pire que pas de garde-fou. */

/** `tools/lienotheque/`, et non la racine du dépôt : trois niveaux au-dessus de `test/`.
 *  Les chemins ci-dessous lui sont donc relatifs, et les commandes git tournent là. */
const RACINE = new URL("../../../", import.meta.url);
/** Les documents relus. La file des lots s'y est ajoutée après mesure : la ligne du lot ne la
 *  nommait pas, elle cite quinze empreintes, et l'y inclure a révélé une **sixième nature**
 *  d'identifiant — une version de déploiement du Worker. Élargir un périmètre coûte une épingle
 *  et rapporte un trou de moins. */
const DOCUMENTS = ["docs/autorisations-de-push.md", "docs/decisions.md", "docs/file-des-lots.md"];

const git = (...args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd: RACINE, encoding: "utf8" }).trim();

/** L'historique est-il tronqué ? **Mesuré sur un vrai clone tronqué** plutôt que supposé : un
 *  `git clone --depth 1` de ce dépôt se déclare `true`, ne porte qu'**un** commit, et son
 *  `git cat-file` ignore une empreinte d'hier. Le garde-fou y serait donc faux. */
const historiqueTronque = (): boolean => git("rev-parse", "--is-shallow-repository") === "true";

/** Le saut, à l'idiome du dépôt — `siTesseract`, `siNatif` —, pour qu'il **se voie** dans le
 *  rapport au lieu de passer pour un contrôle vert. Un saut muet serait pire que pas de
 *  garde-fou : il laisserait croire que la porte est gardée là où elle ne l'est pas. */
const siHistoriqueComplet = historiqueTronque() ? it.skip : it;

/** Lesquelles de ces empreintes sont des commits, **en un seul appel**.
 *
 *  Mesuré : un `git cat-file -e` par citation coûtait **4,3 s** pour 142 citations, soit une marge
 *  de ×1,16 contre le délai par défaut — **sous la barre de ×3**, donc un contrôle complet refusé.
 *  Un garde-fou qui fait échouer la course qu'il garde ne garde rien. `--batch-check` lit toutes
 *  les empreintes sur son entrée et répond en une fois. */
const commitsParmi = (empreintes: readonly string[]): ReadonlySet<string> => {
  if (empreintes.length === 0) return new Set();
  const demandes = [...new Set(empreintes)];
  const reponse = execFileSync("git", ["cat-file", "--batch-check"], {
    cwd: RACINE,
    encoding: "utf8",
    input: `${demandes.map((une) => `${une}^{commit}`).join("\n")}\n`,
  });
  // Une ligne par demande, dans l'ordre : « <empreinte entière> commit <taille> » ou
  // « <ce qui a été demandé> missing ». On se fie à l'ordre, pas au texte de la réponse, qui
  // réécrit l'abréviation en empreinte entière quand l'objet existe.
  const lignes = reponse.split("\n").filter((ligne) => ligne.length > 0);
  const connus = new Set<string>();
  lignes.forEach((ligne, rang) => {
    const demande = demandes[rang];
    if (demande !== undefined && / commit \d+$/u.test(ligne)) connus.add(demande);
  });
  return connus;
};

/** Les documents à relire : les deux journaux, plus chaque décision. Lus par leur nom et non par
 *  une liste figée, pour qu'une décision nouvelle entre dans le périmètre sans qu'on y pense. */
function documentsDuProjet(): readonly { readonly nom: string; readonly texte: string }[] {
  const decisions = git("ls-files", "docs/decisions")
    .split("\n")
    .filter((chemin) => chemin.endsWith(".md"));
  return [...DOCUMENTS, ...decisions].map((chemin) => ({
    nom: chemin,
    texte: readFileSync(new URL(chemin, RACINE), "utf8"),
  }));
}

type Reponses = {
  readonly pas_des_commits: readonly { readonly citation: string; readonly ce_que_c_est: string }[];
  readonly empreintes_fantomes: readonly { readonly citation: string; readonly vrai_commit: string }[];
};

const reponses = (): Reponses =>
  JSON.parse(
    readFileSync(new URL("fixtures/references/citations-qui-ne-sont-pas-des-commits.json", RACINE), "utf8"),
  ) as Reponses;

describe("une empreinte citée existe dans l'historique (D12, lot 0m)", () => {
  siHistoriqueComplet("ne laisse aucune citation de commit sans réponse (sauté si l'historique est tronqué)", () => {
    const lues = reponses();
    const nommees = new Set(lues.pas_des_commits.map((une) => une.citation));
    const fantomes = new Set(lues.empreintes_fantomes.map((une) => une.citation));

    const vues = documentsDuProjet().flatMap((document) =>
      citationsDeCommit(document.texte).map((citation) => ({ citation, ou: document.nom })),
    );
    const connus = commitsParmi(vues.map((une) => une.citation));

    const sansReponse = vues
      .filter((une) => !connus.has(une.citation) && !nommees.has(une.citation) && !fantomes.has(une.citation))
      .map((une) => `${une.citation} dans ${une.ou}`);

    expect([...new Set(sansReponse)], "citation(s) qu'aucun commit ne porte et qu'aucune réponse ne nomme").toEqual([]);
  });

  siHistoriqueComplet("exige que le vrai commit d'une empreinte fantôme existe, lui (sauté si l'historique est tronqué)", () => {
    const fantomes = reponses().empreintes_fantomes;
    const connus = commitsParmi(fantomes.flatMap((une) => [une.citation, une.vrai_commit]));
    for (const fantome of fantomes) {
      expect(connus.has(fantome.citation), `${fantome.citation} serait donc un vrai commit : retirez-la des fantômes`).toBe(false);
      expect(connus.has(fantome.vrai_commit), `le vrai commit de ${fantome.citation} doit exister`).toBe(true);
    }
  });

  siHistoriqueComplet("dit quand une citation nommée « pas un commit » en est devenue un (sauté si l'historique est tronqué)", () => {
    const nommees = reponses().pas_des_commits.map((une) => une.citation);
    const connus = commitsParmi(nommees);
    const perimees = nommees.filter((une) => connus.has(une));

    expect(perimees, "citation(s) nommée(s) « pas un commit » que l'historique porte pourtant").toEqual([]);
  });

  it("ignore ce qui n'a pas la forme d'une citation de commit, et le prouve sur des cas construits", () => {
    // Mesurés dans les documents : une course d'intégration continue fait 11 signes, une empreinte
    // de fichier 16, une empreinte d'archive 64. Aucune n'est une citation de commit.
    const faux = "course `43644780123`, fichier `546b60e0da07090c`, archive `373005d51aa85b3a25ab6330debea9ff3ae95e24e86cc0a32a384a9989a3a231`";
    expect(citationsDeCommit(faux)).toEqual([]);

    // Et ce qui a la forme est bien relevé, doublons compris — y compris entièrement décimal,
    // puisque quatre citations réelles le sont.
    expect(citationsDeCommit("`29d4ed06` puis `29d4ed06`, et `18039497`")).toEqual([
      "29d4ed06",
      "29d4ed06",
      "18039497",
    ]);

    // Sans accents graves, ce n'est pas une citation : la prose n'est pas une référence.
    expect(citationsDeCommit("le commit 29d4ed06 du jour")).toEqual([]);

    // La liste des longueurs est une donnée, et le motif s'y tient.
    expect([...LONGUEURS_DE_CITATION]).toEqual([7, 8, 9, 40]);
  });
});
