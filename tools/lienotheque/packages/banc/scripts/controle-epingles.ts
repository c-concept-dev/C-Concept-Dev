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
import {
  accepteLesMarges,
  RELEVE_DES_MARGES,
  jugerLesMarges,
  raconterLesMarges,
  type Barre,
  type LigneDeReleve,
  type Mesure,
} from "../src/marges.js";

const RACINE = join(import.meta.dirname, "../../..");
const RAPPORT = ".rapport-epingles.json";
const LISTE = join(RACINE, "fixtures/references/echecs-connus.json");
const BARRE = join(RACINE, "fixtures/references/marges-de-delai.json");

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
  for (const { chemin } of attendus) {
    rmSync(join(chemin, RAPPORT), { force: true });
    rmSync(join(chemin, RELEVE_DES_MARGES), { force: true });
  }

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
const mesures: Mesure[] = [];
const muets: string[] = [];
/** Paquets qui ont bien éprouvé des contrôles mais n'ont chronométré aucun corps.
 *
 *  Un paquet neuf dont la configuration ne reprend pas `configurationCommune` tombe ici, et le
 *  passage est refusé : sans cela il resterait non mesuré en silence, et le garde-fou dirait
 *  « marges saines » sur ce qu'il n'a pas regardé. C'est la même exigence que pour les rapports. */
const nonChronometres: string[] = [];
for (const { nom, chemin } of attendus) {
  const fichier = join(chemin, RAPPORT);
  if (!existsSync(fichier)) {
    muets.push(nom);
    continue;
  }
  const releve = join(chemin, RELEVE_DES_MARGES);
  if (existsSync(releve))
    for (const ligne of readFileSync(releve, "utf8").split("\n")) {
      if (ligne === "") continue;
      const lue = JSON.parse(ligne) as LigneDeReleve;
      mesures.push({ paquet: nom, fichier: lue.fichier, nom: lue.nom, delai: lue.delai, corps: lue.corps });
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

// Un paquet qui a fait tourner des corps sans en chronométrer aucun n'est pas instrumenté.
// On le juge sur ce qui a VRAIMENT tourné : un paquet dont tous les contrôles sont sautés ne
// rend aucun relevé, et l'en accuser serait une accusation fausse.
for (const { nom } of attendus) {
  const aTourne = controles.some((c) => c.paquet === nom && c.etat !== "saute");
  const aMesure = mesures.some((m) => m.paquet === nom);
  if (aTourne && !aMesure) nonChronometres.push(nom);
}
if (nonChronometres.length > 0) {
  console.error(
    `\n${nonChronometres.length} paquet(s) ont éprouvé des contrôles sans chronométrer aucun corps : ` +
      `${nonChronometres.join(", ")}.\n` +
      "Leur `vitest.config.ts` ne reprend pas `packages/banc/configuration-commune.ts` : " +
      "les marges de délai y sont inconnues, et le contrôle est donc refusé.",
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

// Le fichier de données écrit `barre_proposee` ; le code parle de `proposee`. La traduction
// est ici, en une ligne, plutôt qu'un nom en serpent au milieu du TypeScript.
const barreLue = JSON.parse(readFileSync(BARRE, "utf8")) as { barre: number | null; barre_proposee: number };
const barre: Barre = { barre: barreLue.barre, proposee: barreLue.barre_proposee };
const verdictDesMarges = jugerLesMarges(mesures, barre);
console.log(`\n── garde-fou des marges de délai ──`);
for (const dit of raconterLesMarges(verdictDesMarges)) console.log(`  ${dit}`);

if (!accepte(verdict)) {
  console.error("\nLe contrôle est refusé : voir les lignes RÉGRESSION, AUTRE CAUSE et ÉPINGLE PÉRIMÉE ci-dessus.");
  process.exit(1);
}
if (!accepteLesMarges(verdictDesMarges)) {
  console.error("\nLe contrôle est refusé : voir les lignes MARGE TROP COURTE ci-dessus.");
  process.exit(1);
}
console.log("\nContrôle accepté : aucun rouge hors épingles, aucune épingle périmée, aucune marge sous la barre.");
