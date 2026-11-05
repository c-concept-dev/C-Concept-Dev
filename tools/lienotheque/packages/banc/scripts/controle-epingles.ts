/** Lance le contrôle complet, puis le juge contre les épingles (règle du 5 novembre 2026).
 *
 *  En local comme en intégration continue. Il remplace `pnpm test` dans `pnpm check` : lancer les
 *  tests sans juger les épingles laisserait un rouge connu bloquer, et lancer les tests en
 *  ignorant leur code de sortie laisserait passer une régression. Il faut les deux, et dans cet
 *  ordre.
 *
 *  Chaque paquet écrit son rapport chez lui, en plus de l'affichage ordinaire : le `default` reste
 *  pour qu'on lise ce qui se passe, le `json` pour qu'on puisse en juger. Les rapports sont
 *  effacés avant chaque passage — un rapport d'hier ferait juger un passage qui n'a pas eu lieu. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { accepte, juger, raconter, type Controle, type Epingle } from "../src/epingles.js";

const RACINE = join(import.meta.dirname, "../../..");
const RAPPORT = ".rapport-epingles.json";
const LISTE = join(RACINE, "fixtures/references/echecs-connus.json");

/** Les paquets qui ont un contrôle à lancer.
 *
 *  Un paquet sans script `test` n'en doit aucun — et **la racine de l'espace de travail non plus**,
 *  bien qu'elle en porte un : le sien ne fait que relancer tous les autres. La compter faisait
 *  refuser le passage pour un rapport qu'elle n'avait aucune raison de rendre (mesuré le
 *  5 novembre 2026 : « 1 paquet(s) n'ont rendu aucun rapport : lienotheque »). On la reconnaît par
 *  son chemin, non par son nom : un nom codé ici serait un mot de plus à tenir à jour. */
const paquets = (): { nom: string; chemin: string }[] => {
  const liste = spawnSync("pnpm", ["-r", "--depth=-1", "list", "--json"], { cwd: RACINE, encoding: "utf8" });
  if (liste.status !== 0) throw new Error(`pnpm list a échoué : ${liste.stderr}`);
  return (JSON.parse(liste.stdout) as { name: string; path: string }[])
    .map(({ path }) => {
      const manifeste = JSON.parse(readFileSync(join(path, "package.json"), "utf8")) as {
        name: string;
        scripts?: Record<string, string>;
      };
      return { nom: manifeste.name, chemin: path, aDesTests: manifeste.scripts?.["test"] !== undefined };
    })
    .filter((p) => p.aDesTests && p.chemin !== RACINE)
    .map(({ nom, chemin }) => ({ nom, chemin }));
};

const attendus = paquets();
// Les rapports d'un passage antérieur sont retirés avant celui-ci — sauf quand on vient
// précisément les juger.
if (!process.argv.includes("--sans-relancer"))
  for (const { chemin } of attendus) rmSync(join(chemin, RAPPORT), { force: true });

// `--sans-relancer` juge les rapports déjà sur le disque, sans rien relancer. Un passage complet
// coûte vingt minutes et davantage quand le cache vient d'être invalidé : rejuger ce qui a déjà
// tourné doit être possible sans le repayer, sinon on hésite à corriger le juge.
const sansRelancer = process.argv.includes("--sans-relancer");
if (!sansRelancer) console.log(`── contrôle complet : ${attendus.length} paquet(s) à éprouver ──`);
else console.log("── jugement des rapports déjà rendus, sans relancer ──");
// `--no-bail` n'est pas un détail de confort : sans lui, `pnpm -r` s'arrête au PREMIER paquet
// rouge et les suivants ne tournent jamais. Mesuré sur l'exécution du 29 octobre 2026 : six
// paquets sur dix-sept, arrêt sur `@lienotheque/banc`, et `@lienotheque/ingestion` jamais
// atteint. Le registre en avait conclu qu'un échec avait disparu — il était seulement masqué.
// Un garde-fou qui hériterait de cette cécité déclarerait « aucune régression » sur un passage
// dont la moitié n'a pas eu lieu.
const passage = sansRelancer
  ? { status: null }
  : spawnSync(
  "pnpm",
  [
    "-r",
    "--no-bail",
    "--workspace-concurrency=1",
    "test",
    "--reporter=default",
    "--reporter=json",
    `--outputFile=${RAPPORT}`,
  ],
  { cwd: RACINE, stdio: "inherit" },
);

const controles: Controle[] = [];
const muets: string[] = [];
for (const { nom, chemin } of attendus) {
  const fichier = join(chemin, RAPPORT);
  if (!existsSync(fichier)) {
    muets.push(nom);
    continue;
  }
  const paquet = { name: nom };
  const rapport = JSON.parse(readFileSync(fichier, "utf8")) as {
    testResults?: { name: string; assertionResults?: { fullName: string; status: string; failureMessages?: string[] }[] }[];
  };
  for (const suite of rapport.testResults ?? [])
    for (const controle of suite.assertionResults ?? [])
      controles.push({
        paquet: paquet.name,
        fichier: relative(chemin, suite.name).replaceAll("\\", "/"),
        nom: controle.fullName,
        etat: controle.status === "passed" ? "passe" : controle.status === "failed" ? "echoue" : "saute",
        ...(controle.failureMessages === undefined ? {} : { message: controle.failureMessages.join("\n") }),
      });
}

if (controles.length === 0) {
  console.error(
    "\nAucun rapport lu : le garde-fou ne peut rien juger, et ne fait donc pas semblant de le faire.\n" +
      `Code de sortie du passage : ${passage.status ?? "inconnu"}`,
  );
  process.exit(1);
}

// Un paquet sans rapport n'a pas été éprouvé. Le dire et refuser : un garde-fou qui accepte un
// passage incomplet dit « aucune régression » sur ce qu'il n'a pas regardé.
if (muets.length > 0) {
  console.error(
    `\n${muets.length} paquet(s) n'ont rendu aucun rapport : ${muets.join(", ")}.\n` +
      "Le contrôle est incomplet, donc refusé — rien ne permet d'y affirmer l'absence de régression.",
  );
  process.exit(1);
}

const epingles = (JSON.parse(readFileSync(LISTE, "utf8")) as { epingles: Epingle[] }).epingles;
// Un outil est présent si le système sait où il est. `command -v` et non un chemin codé : les
// moteurs ne vivent pas au même endroit selon la machine.
const estPresent = (outil: string): boolean =>
  spawnSync("/bin/sh", ["-c", `command -v ${outil}`], { encoding: "utf8" }).status === 0;
const verdict = juger(controles, epingles, estPresent);

console.log(`\n── garde-fou des épingles ──`);
console.log(
  `  ${controles.length} contrôle(s) lu(s) · ` +
    `${controles.filter((c) => c.etat === "echoue").length} rouge(s) · ` +
    `${controles.filter((c) => c.etat === "saute").length} sauté(s) · ` +
    `${epingles.length} épingle(s) dans la liste`,
);
for (const dit of raconter(verdict)) console.log(`  ${dit}`);

if (!accepte(verdict)) {
  console.error("\nLe contrôle est refusé : voir les lignes RÉGRESSION, AUTRE CAUSE et ÉPINGLE PÉRIMÉE ci-dessus.");
  process.exit(1);
}
console.log("\nContrôle accepté : aucun rouge hors épingles, aucune épingle périmée.");
