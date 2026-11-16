// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { ecartsDeLaPoussee, type CommitEnAvance } from "../src/poussee-autorisee.js";

/** Lot 0c ter — **une poussée ne porte que ce que l'entrée du registre nomme**.
 *
 *  Né de la faute du 16 novembre 2026 : **cinq** commits sont partis pour **trois** autorisés.
 *  Une autorisation porte sur des commits nommés ; une poussée emporte toute la branche.
 *
 *  **Ce que ces contrôles ne prouvent pas** : l'entrée du registre est écrite par moi. Le
 *  garde-fou vérifie donc que je suis d'accord avec moi-même. Seuls les mots de Christophe, cités
 *  dans l'entrée, prouvent son accord — et aucune mécanique ne peut dire qu'une citation est
 *  vraie. */

const bacs: string[] = [];
afterAll(() => {
  for (const bac of bacs) rmSync(bac, { recursive: true, force: true });
});

const commit = (
  empreinte: string,
  titre: string,
  documentsSeulement = false,
  ajouteLEntreeDeReference = false,
): CommitEnAvance => ({ empreinte, titre, documentsSeulement, ajouteLEntreeDeReference });

/** Le seul commit exempté : il ajoute l'entrée de référence et ne porte que des documents. */
const porteLEntree = (empreinte: string, titre: string): CommitEnAvance =>
  commit(empreinte, titre, true, true);

describe("une poussée ne porte que ce que l'entrée nomme (lot 0c ter)", () => {
  describe("premier sens : un commit part sans être nommé", () => {
    it("refuse, et le nomme — la faute du 16 novembre 2026", () => {
      const ecarts = ecartsDeLaPoussee({
        enAvance: [
          commit("12d6f102aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Eprouver l hote Rust"),
          commit("0c0866bbcccccccccccccccccccccccccccccccc", "Embarquer le node de la machine"),
        ],
        citees: ["0c0866bb"],
        surLaBranche: () => true,
      });
      expect(ecarts).toHaveLength(1);
      expect(ecarts[0]).toContain("12d6f102");
      expect(ecarts[0]).toContain("Eprouver l hote Rust");
      expect(ecarts[0], "le refus doit dire ce qui manque, pas seulement qu'il manque").toContain("sans être nommé");
    });

    it("accepte quand chaque commit de code est nommé, abrégé compris", () => {
      // Le registre cite huit signes ; la branche en porte quarante. La comparaison se fait par
      // le début, et non par l'égalité — sans quoi aucune citation du dépôt ne vaudrait.
      expect(
        ecartsDeLaPoussee({
          enAvance: [commit("974780bdffffffffffffffffffffffffffffffff", "Fonder l epreuve")],
          citees: ["974780bd"],
          surLaBranche: () => true,
        }),
      ).toEqual([]);
    });

    it("exempte le commit qui AJOUTE l'entrée de référence, parce qu'il ne peut pas se nommer", () => {
      // Une entrée ne peut pas citer sa propre empreinte : un numéro de commit s'écrit après le
      // commit (règle du 10 novembre 2026). Le trou est réel, assumé, et large d'une ligne.
      expect(
        ecartsDeLaPoussee({
          enAvance: [porteLEntree("caf43a27eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "l entree 61")],
          citees: [],
          surLaBranche: () => true,
        }),
      ).toEqual([]);
    });

    it("refuse un commit de documents qui n'ajoute AUCUNE entrée — le trou resserré", () => {
      // Le premier jet exemptait tout commit sous docs/. Une décision datée, une ligne de file
      // des lots, une correction de prose partaient donc sans être nommées — et ces documents-là
      // sont lus par des garde-fous depuis le lot 0m. L'exemption porte sur ce qu'un commit fait,
      // pas sur l'endroit où il écrit.
      const ecarts = ecartsDeLaPoussee({
        enAvance: [commit("11111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "Inscrire une decision", true, false)],
        citees: [],
        surLaBranche: () => true,
      });
      expect(ecarts).toHaveLength(1);
      expect(ecarts[0]).toContain("11111111");
      expect(ecarts[0], "le refus doit dire POURQUOI l'exemption ne joue pas").toContain(
        "n'ajoute pas l'entrée de référence",
      );
    });

    it("n'exempte personne quand deux commits ajoutent l'entrée de référence", () => {
      // Une entrée s'ajoute une fois : deux ajouts veulent dire que le registre a été réécrit
      // quelque part. Exempter alors le premier venu couvrirait peut-être le mauvais.
      const ecarts = ecartsDeLaPoussee({
        enAvance: [
          porteLEntree("22222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "l entree 61"),
          porteLEntree("33333333cccccccccccccccccccccccccccccccc", "l entree 61, encore"),
        ],
        citees: [],
        surLaBranche: () => true,
      });
      expect(ecarts.join(" ")).toContain("l'exemption n'en couvre qu'un");
      expect(ecarts.join(" ")).toContain("22222222");
      expect(ecarts.join(" ")).toContain("33333333");
      // Et le refus dit la vraie cause, pas « n'ajoute pas l'entrée » : ils l'ajoutent tous deux.
      expect(ecarts.join(" ")).toContain("il n'est pas seul à le faire");
      expect(ecarts.join(" ")).not.toContain("n'ajoute pas l'entrée");
    });
  });

  it("n'exempte pas un commit qui ajoute l'entrée MAIS mêle du code aux documents", () => {
    // Les deux conditions sont nécessaires. Sans la seconde, l'entrée deviendrait un passage :
    // on l'ajoute, on glisse un fichier de code dans le même commit, et plus rien ne le nomme.
    const ecarts = ecartsDeLaPoussee({
      enAvance: [commit("deadbeef22222222222222222222222222222222", "l entree 61 et du code", false, true)],
      citees: [],
      surLaBranche: () => true,
    });
    expect(ecarts).toHaveLength(1);
    expect(ecarts[0]).toContain("deadbeef");
    expect(ecarts[0]).toContain("sans être nommé");
  });

  describe("second sens : l'entrée nomme ce que la branche ne porte pas", () => {
    it("refuse une empreinte que la branche ignore — une poussée annoncée qui n'aura pas lieu", () => {
      const ecarts = ecartsDeLaPoussee({
        enAvance: [commit("0c0866bbcccccccccccccccccccccccccccccccc", "un lot", false)],
        citees: ["0c0866bb", "0ee45c0e"],
        surLaBranche: (citation) => citation === "0c0866bb",
      });
      expect(ecarts).toHaveLength(1);
      expect(ecarts[0]).toContain("0ee45c0e");
      expect(ecarts[0]).toContain("ne porte pas");
    });

    it("accepte une empreinte déjà poussée : l'entrée peut nommer ce qui est derrière", () => {
      // L'entrée 54 nommait deux commits dont l'un était déjà au dépôt. La branche les porte,
      // ils ne sont pas en avance, et cela n'a rien d'une faute.
      expect(
        ecartsDeLaPoussee({
          enAvance: [porteLEntree("caf43a27eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "les documents")],
          citees: ["9b16e3de"],
          surLaBranche: () => true,
        }),
      ).toEqual([]);
    });
  });

  it("les deux sens se disent d'un seul coup, jamais l'un après l'autre", () => {
    const ecarts = ecartsDeLaPoussee({
      enAvance: [commit("aaaaaaaa11111111111111111111111111111111", "du code non nommé")],
      citees: ["bbbbbbbb"],
      surLaBranche: () => false,
    });
    expect(ecarts).toHaveLength(2);
    expect(ecarts.join(" ")).toContain("aaaaaaaa");
    expect(ecarts.join(" ")).toContain("bbbbbbbb");
  });

  /** En conditions réelles : un vrai dépôt, un vrai `git push` vers un dépôt nu, le vrai crochet.
   *
   *  Les contrôles ci-dessus prouvent la règle. Celui-ci prouve que le crochet la **reçoit** au
   *  moment où git l'appelle, et avec ce que git lui donne sur l'entrée standard — c'est là que
   *  le défaut vivrait. */
  const CROCHET = fileURLToPath(new URL("../../../crochets/pre-push", import.meta.url));

  function depotAvecAmont(): { readonly bac: string; readonly git: (...a: readonly string[]) => string } {
    const bac = mkdtempSync(join(tmpdir(), "pre-push-"));
    bacs.push(bac);
    const projet = join(bac, "copie", "tools", "lienotheque");
    const git = (...a: readonly string[]): string =>
      execFileSync("git", [...a], {
        cwd: join(bac, "copie"),
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "banc",
          GIT_AUTHOR_EMAIL: "banc@essai",
          GIT_COMMITTER_NAME: "banc",
          GIT_COMMITTER_EMAIL: "banc@essai",
        },
      });
    execFileSync("git", ["init", "--bare", join(bac, "amont.git")]);
    mkdirSync(join(projet, "docs"), { recursive: true });
    mkdirSync(join(bac, "copie", ".crochets"), { recursive: true });
    // Les paquets du projet, par lien : le crochet doit juger avec le VRAI juge et ses vraies
    // règles. Une copie se périmerait, et un contrôle qui lit une copie périmée est vert pour rien.
    symlinkSync(fileURLToPath(new URL("../../../packages", import.meta.url)), join(projet, "packages"));
    execFileSync("git", ["init", "-b", "principale", join(bac, "copie")]);
    return { bac, git };
  }

  it("refuse une vraie poussée qui emporte un commit que l'entrée ne nomme pas", () => {
    const { bac, git } = depotAvecAmont();
    const projet = join(bac, "copie", "tools", "lienotheque");
    const registre = join(projet, "docs", "autorisations-de-push.md");
    const entete = "| # | commits poussés | autorisation | origine, conditions, marge |";

    // Le socle, déjà poussé.
    writeFileSync(registre, `${entete}\n|---|---|---|---|\n| 19 | rien | rien | rien |\n`);
    git("add", "-A");
    git("commit", "--no-verify", "-m", "le socle");
    git("remote", "add", "origine", join(bac, "amont.git"));
    git("push", "--quiet", "origine", "principale");
    // Le socle, déjà poussé : c'est LUI que l'entrée nommera, et non le code qui suit. Mon premier
    // jet nommait le commit de code lui-même : il n'y avait alors aucun écart, et le contrôle
    // passait en prouvant le contraire de ce qu'il annonçait.
    const nomme = git("rev-parse", "HEAD").trim().slice(0, 8);

    // Un commit de code que personne ne nomme, puis l'entrée qui nomme le socle.
    writeFileSync(join(projet, "code.ts"), "export const a = 1;\n");
    git("add", "-A");
    git("commit", "--no-verify", "-m", "du code non nomme");
    writeFileSync(
      registre,
      `${entete}\n|---|---|---|---|\n| 19 | rien | rien | rien |\n| 20 | \`${nomme}\` | ses mots | ses conditions |\n`,
    );
    git("add", "-A");
    git("commit", "--no-verify", "-m", "l entree 20");

    git("config", "core.hooksPath", ".crochets");
    execFileSync("cp", [CROCHET, join(bac, "copie", ".crochets", "pre-push")]);

    let refus = "";
    try {
      git("push", "origine", "principale");
    } catch (souci) {
      const echec = souci as { stdout?: string; stderr?: string };
      refus = `${echec.stdout ?? ""}${echec.stderr ?? ""}`;
    }
    expect(refus, "le crochet doit refuser la poussée").toContain("POUSSÉE REFUSÉE");
    expect(refus).toContain("sans être nommé");
    // Et l'amont n'a rien reçu : un refus qui pousse quand même ne refuse rien.
    const amont = execFileSync("git", ["log", "--format=%s", "principale"], {
      cwd: join(bac, "amont.git"),
      encoding: "utf8",
    });
    expect(amont.trim()).toBe("le socle");
  }, 180_000);

  /** Le resserrement en conditions réelles. Les contrôles purs ci-dessus prouvent la règle ; ils
   *  ne prouvent rien de `ajouteLEntreeDeReference`, que le **juge** calcule en lisant le diff du
   *  registre. Un juge qui répondrait « vrai » pour tout commit de documents rendrait l'exemption
   *  aussi large qu'avant, et pas un contrôle pur ne le verrait.
   *
   *  **Un seul commit en avance**, et c'est voulu. Mon premier agencement en laissait deux — la
   *  décision et l'entrée — et la règle d'unicité refusait alors la poussée quoi qu'en dise le
   *  juge : la mutation « tout commit ajoute l'entrée » restait **verte**. Le contrôle mesurait
   *  la règle une seconde fois au lieu de mesurer le juge. L'entrée est donc poussée d'abord. */
  it("refuse une vraie poussée qui emporte un commit de documents n'ajoutant pas l'entrée", () => {
    const { bac, git } = depotAvecAmont();
    const projet = join(bac, "copie", "tools", "lienotheque");
    const registre = join(projet, "docs", "autorisations-de-push.md");
    const entete = "| # | commits poussés | autorisation | origine, conditions, marge |";

    writeFileSync(registre, `${entete}\n|---|---|---|---|\n| 19 | rien | rien | rien |\n`);
    git("add", "-A");
    git("commit", "--no-verify", "-m", "le socle");
    git("remote", "add", "origine", join(bac, "amont.git"));
    git("push", "--quiet", "origine", "principale");
    const nomme = git("rev-parse", "HEAD").trim().slice(0, 8);

    // L'entrée 20 est écrite et poussée : elle est derrière, elle ne sera pas en avance.
    writeFileSync(
      registre,
      `${entete}\n|---|---|---|---|\n| 19 | rien | rien | rien |\n| 20 | \`${nomme}\` | ses mots | ses conditions |\n`,
    );
    git("add", "-A");
    git("commit", "--no-verify", "-m", "l entree 20");
    git("push", "--quiet", "origine", "principale");

    // Reste un commit de DOCUMENTS que personne ne nomme — une décision datée, exactement le cas
    // que le premier jet laissait passer. Il ne touche pas au registre.
    writeFileSync(join(projet, "docs", "une-decision.md"), "# une décision\n");
    git("add", "-A");
    git("commit", "--no-verify", "-m", "inscrire une decision");

    git("config", "core.hooksPath", ".crochets");
    execFileSync("cp", [CROCHET, join(bac, "copie", ".crochets", "pre-push")]);

    let refus = "";
    try {
      git("push", "origine", "principale");
    } catch (souci) {
      const echec = souci as { stdout?: string; stderr?: string };
      refus = `${echec.stdout ?? ""}${echec.stderr ?? ""}`;
    }
    expect(refus, "le crochet doit refuser le commit de documents non nommé").toContain("POUSSÉE REFUSÉE");
    expect(refus).toContain("n'ajoute pas l'entrée de référence");
    expect(refus).toContain("inscrire une decision");
    const amont = execFileSync("git", ["log", "--format=%s", "principale"], {
      cwd: join(bac, "amont.git"),
      encoding: "utf8",
    });
    expect(amont.trim().split("\n")[0], "l'amont ne doit pas avoir reçu la décision").toBe("l entree 20");
  }, 180_000);

  it("laisse passer une vraie poussée dont le seul commit en avance AJOUTE l'entrée", () => {
    // Le revers du contrôle précédent : resserrer ne doit pas fermer. Sans celui-ci, un juge qui
    // refuserait tout serait vert sur les deux refus et interdirait d'écrire le registre.
    const { bac, git } = depotAvecAmont();
    const projet = join(bac, "copie", "tools", "lienotheque");
    const registre = join(projet, "docs", "autorisations-de-push.md");
    const entete = "| # | commits poussés | autorisation | origine, conditions, marge |";

    writeFileSync(registre, `${entete}\n|---|---|---|---|\n| 19 | rien | rien | rien |\n`);
    git("add", "-A");
    git("commit", "--no-verify", "-m", "le socle");
    git("remote", "add", "origine", join(bac, "amont.git"));
    git("push", "--quiet", "origine", "principale");
    const nomme = git("rev-parse", "HEAD").trim().slice(0, 8);

    writeFileSync(
      registre,
      `${entete}\n|---|---|---|---|\n| 19 | rien | rien | rien |\n| 20 | \`${nomme}\` | ses mots | ses conditions |\n`,
    );
    git("add", "-A");
    git("commit", "--no-verify", "-m", "l entree 20");

    git("config", "core.hooksPath", ".crochets");
    execFileSync("cp", [CROCHET, join(bac, "copie", ".crochets", "pre-push")]);

    const dit = git("push", "origine", "principale");
    const amont = execFileSync("git", ["log", "--format=%s", "principale"], {
      cwd: join(bac, "amont.git"),
      encoding: "utf8",
    });
    expect(amont.trim().split("\n")[0]).toBe("l entree 20");
    // Et ce qu'il DIT en acceptant doit décrire la règle qu'il applique. Ce contrôle n'est pas du
    // zèle : la ligne verte a annoncé « ou documents seuls » — l'échappatoire supprimée — pendant
    // tout le resserrement, parce qu'une réécriture sans assertion ne l'avait pas touchée. Un
    // garde-fou qui applique une règle et en annonce une autre trompe exactement qui le lit.
    expect(dit, "le juge doit nommer l'entrée qui l'autorise").toContain("l'entrée 20");
    expect(dit, "il ne doit plus annoncer l'exemption large").not.toContain("documents seuls");
  }, 180_000);
});
