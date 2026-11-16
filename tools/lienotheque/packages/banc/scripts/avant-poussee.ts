/** Le juge du crochet de pré-poussée : il lit ce que la poussée emporte, et ce que la dernière
 *  entrée du registre nomme (lot 0c ter).
 *
 *  Il ne contient aucune règle : elles sont dans `ecartsDeLaPoussee`, pure et éprouvée. Ici,
 *  seulement ce qu'une fonction pure ne peut pas faire — lire git, lire le registre, sortir avec
 *  un code.
 *
 *  Git appelle un `pre-push` avec, sur l'entrée standard, une ligne par référence :
 *  « <ref locale> <empreinte locale> <ref distante> <empreinte distante> ». On lit **cette
 *  plage-là** — ce que cette poussée-ci emporte — et non `@{u}..`, qui répondrait à une autre
 *  question.
 *
 *     tsx packages/banc/scripts/avant-poussee.ts [--racine <chemin>] < <les references>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { citationsDeCommit } from "../src/empreintes-citees.js";
import { entreesDuJournal } from "../src/journal-en-ajout-seul.js";
import { ecartsDeLaPoussee, type CommitEnAvance } from "../src/poussee-autorisee.js";

const arguments_ = process.argv.slice(2);
const place = arguments_.indexOf("--racine");
const racine = place === -1 ? process.cwd() : (arguments_[place + 1] ?? process.cwd());
const git = (...args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd: racine, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trimEnd();

const VIDE = "0000000000000000000000000000000000000000";
const REGISTRE = "tools/lienotheque/docs/autorisations-de-push.md";

/** Les plages poussées, lues sur l'entrée standard. Vide : rien à juger. */
const plages = readFileSync(0, "utf8")
  .split("\n")
  .filter((ligne) => ligne.trim().length > 0)
  .map((ligne) => ligne.split(" "))
  .filter((champs) => champs[1] !== undefined && champs[1] !== VIDE)
  .map((champs) => ({ locale: champs[1] as string, distante: champs[3] ?? VIDE }));

if (plages.length === 0) process.exit(0);

/** La **dernière** entrée du registre : celle qui parle de cette poussée-ci. Lue avant les
 *  commits, parce que c'est elle qui dit lequel d'entre eux l'ajoute. */
const entrees = entreesDuJournal(readFileSync(`${racine}/${REGISTRE}`, "utf8"));
const derniere = entrees.at(-1);
if (derniere === undefined) {
  console.error("\nPOUSSÉE REFUSÉE — le registre ne porte aucune entrée lisible.\n");
  process.exit(2);
}
const citees = citationsDeCommit(derniere.ligne);

/** Ce commit ajoute-t-il au registre la ligne de l'entrée de référence ?
 *
 *  On lit les lignes **ajoutées** par son diff du registre, et on cherche celle-là, à l'octet
 *  près hors espaces de fin. Une ligne retouchée ensuite ne compte donc pas : le journal est en
 *  ajout seul (lot 18), une entrée s'écrit une fois. */
const ajouteLEntree = (empreinte: string): boolean =>
  git("show", "--format=", "--unified=0", empreinte, "--", REGISTRE)
    .split("\n")
    .filter((ligne) => ligne.startsWith("+") && !ligne.startsWith("+++"))
    .some((ligne) => ligne.slice(1).trimEnd() === derniere.ligne.trimEnd());

const enAvance: CommitEnAvance[] = [];
for (const plage of plages) {
  const plageGit = plage.distante === VIDE ? plage.locale : `${plage.distante}..${plage.locale}`;
  const lignes = git("log", "--format=%H%x09%s", plageGit).split("\n").filter((ligne) => ligne.length > 0);
  for (const ligne of lignes) {
    const [empreinte, titre] = ligne.split("\t");
    if (empreinte === undefined) continue;
    const touches = git("show", "--name-only", "--format=", empreinte)
      .split("\n")
      .filter((chemin) => chemin.length > 0);
    enAvance.push({
      empreinte,
      titre: titre ?? "",
      documentsSeulement: touches.length > 0 && touches.every((chemin) => chemin.startsWith("tools/lienotheque/docs/")),
      ajouteLEntreeDeReference: ajouteLEntree(empreinte),
    });
  }
}

if (enAvance.length === 0) process.exit(0);

const connues = new Set(git("rev-list", "HEAD").split("\n"));
const surLaBranche = (citation: string): boolean =>
  [...connues].some((empreinte) => empreinte.startsWith(citation));

const ecarts = ecartsDeLaPoussee({ enAvance, citees, surLaBranche });

if (ecarts.length === 0) {
  console.log(
    `avant-poussée : ${enAvance.length} commit(s) emporté(s), tous nommés par l'entrée ${derniere.numero} ` +
      `du registre — hormis, s'il est là, le seul commit qui ajoute cette entrée.`,
  );
  process.exit(0);
}

console.error(`\nPOUSSÉE REFUSÉE — ${ecarts.length} écart(s) entre ce qui partirait et ce que l'entrée ${derniere.numero} nomme :\n`);
for (const ecart of ecarts) console.error(`  · ${ecart}`);
console.error(
  "\nUne autorisation porte sur des commits NOMMÉS ; une poussée emporte toute la branche." +
    "\nDécision du 16 novembre 2026 : l'écart s'arrête et se dit AVANT de pousser." +
    "\n\nCe contrôle ne prouve pas l'accord de Christophe : il compare la branche à une entrée que" +
    "\nj'écris. Seuls ses mots, cités dans l'entrée, le prouvent.\n",
);
process.exit(1);
