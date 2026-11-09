// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** Le crochet `PreToolUse` mord où il doit, et se tait où il doit.
 *
 *  ## Pourquoi ce contrôle existe
 *
 *  Le crochet refuse les gestes qui détruisent du travail sans le dire. Jusqu'au 9 novembre 2026,
 *  rien ne vérifiait son comportement : on le relisait. Or il s'est trompé — son motif pour le
 *  geste qui emporte tout un dossier attrapait **n'importe quel chemin commençant par un point**,
 *  et refusait donc de versionner `.claude/` lui-même, ou même un `.gitignore`. Le crochet
 *  interdisait le geste qui l'aurait mis dans le dépôt.
 *
 *  Un garde-fou qui accuse à tort finit désarmé : c'est la remarque de Christophe du 7 novembre, et
 *  elle vaut dans les deux sens. Un faux positif coûte la confiance qu'on met dans le vrai.
 *
 *  ## Ce qu'il éprouve
 *
 *  Les deux moitiés, toujours ensemble : **ce qui doit être refusé** et **ce qui doit passer**. Un
 *  contrôle qui n'éprouverait que les refus resterait vert sur un crochet qui refuse tout.
 *
 *  Les cas sont écrits en morceaux assemblés, jamais comme une ligne de commande entière : le
 *  crochet lit les appels d'outil de la session, et une chaîne de ce fichier ressemblant à un geste
 *  refusé ferait refuser la commande qui lance les contrôles. C'est arrivé le 9 novembre, trois
 *  fois dans la journée, à trois garde-fous qui lisaient leurs propres exemples. */

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const CROCHET = join(RACINE, ".claude/crochets/refuser-gestes-destructeurs.sh");

/** Le crochet, appelé comme la session l'appelle : l'appel d'outil sur l'entrée standard. */
function juger(commande: string): "refuse" | "laisse" {
  try {
    execFileSync("sh", [CROCHET], {
      input: JSON.stringify({ tool_input: { command: commande } }),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return "laisse";
  } catch (fautif) {
    const code = (fautif as { status?: number }).status;
    if (code === 2) return "refuse";
    throw fautif;
  }
}

// Assemblés, et non écrits d'un trait : voir l'en-tête.
const AJOUTER = `git ${"add"}`;
const OTER = "r" + "m";
const POINT = ".";

const A_REFUSER: readonly string[] = [
  `${AJOUTER} -A`,
  `${AJOUTER} --all`,
  `${AJOUTER} ${POINT}`,
  `${AJOUTER} ${POINT} && echo bonjour`,
  `cd ailleurs && ${AJOUTER} ${POINT}`,
  `git re${"set"} --hard`,
  `git ${"stash"}`,
  `git ${"clean"} -fd`,
  `git push --${"force"}`,
  `git commit --no-${"verify"} -m x`,
  `git re${"store"} src/x.ts`,
  `${OTER} -rf /tmp/x`,
  `${OTER} -fr /tmp/x`,
];

const A_LAISSER: readonly string[] = [
  `${AJOUTER} ${POINT}claude/settings.json`,
  `${AJOUTER} ${POINT}gitignore`,
  `${AJOUTER} ${POINT}claude/crochets/un.sh deux.ts`,
  `${AJOUTER} docs/un.md`,
  `git ${"stash"} list`,
  `git ${"stash"} show`,
  `git re${"store"} --staged src/x.ts`,
  `${OTER} -r /tmp/x`,
  `git status`,
  `git commit -m x`,
  `git log --oneline`,
];

describe("le crochet des gestes destructeurs (dette D19)", () => {
  it("existe là où les réglages le désignent", () => {
    expect(existsSync(CROCHET), CROCHET).toBe(true);
  });

  for (const commande of A_REFUSER)
    it(`refuse : ${commande}`, () => {
      expect(juger(commande)).toBe("refuse");
    });

  for (const commande of A_LAISSER)
    it(`laisse passer : ${commande}`, () => {
      expect(juger(commande)).toBe("laisse");
    });

  it("se tait sur un appel qui ne porte aucune commande", () => {
    // Un appel d'outil sans commande n'est pas un geste : le crochet ne doit pas bloquer la session.
    expect(juger("")).toBe("laisse");
  });

  it("éprouve les deux moitiés, et pas seulement les refus", () => {
    // Un contrôle qui n'éprouverait que les refus resterait vert sur un crochet qui refuse tout.
    expect(A_REFUSER.length).toBeGreaterThan(5);
    expect(A_LAISSER.length).toBeGreaterThan(5);
  });
});
