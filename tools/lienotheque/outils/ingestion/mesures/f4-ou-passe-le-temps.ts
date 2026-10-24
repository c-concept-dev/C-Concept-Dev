/** Pourquoi F4 décroche à la soixantième page — l'instrument qui manquait (réserve 9.1)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/f4-ou-passe-le-temps.ts [pages] [depuis]
 *
 *  ## Ce que la mesure du 17 octobre a établi, et ce qu'elle n'a pas regardé
 *
 *  Trois hypothèses éliminées : ce n'est pas le poids des images (r = +0,104 sur 286 pages), ce
 *  n'est pas le contenu (les mêmes feuilles lues seules mettent 2,08 s contre 10,44 s dans la
 *  lecture longue), et « ce n'est pas une pression mémoire » — conclu parce que la mémoire du
 *  processus **baisse** quand le traitement ralentit, 999 Mo dans la zone rapide contre 260 Mo
 *  dans la zone lente.
 *
 *  **C'est cette dernière conclusion que ce banc rouvre.** Une mémoire qui baisse pendant qu'on
 *  ralentit n'écarte pas la pression : c'en est la signature. Un ramasse-miettes majeur rend de
 *  la mémoire au système et coûte du temps ; le compresseur de macOS fait de même, et le travail
 *  de décompression se paie à chaque page touchée. Dans les deux cas on voit exactement ce qui a
 *  été relevé : moins de mémoire, plus de secondes.
 *
 *  L'instrument d'alors ne lisait que `rss`, qui ne sait pas distinguer les deux. Celui-ci lit
 *  ce qui les sépare :
 *
 *  | relevé | ce qu'il départage |
 *  |---|---|
 *  | durée et nombre des ramasse-miettes, par espèce | si le temps part dans le tas de V8 |
 *  | `heapUsed`, `heapTotal`, `external`, `arrayBuffers` | **où** la mémoire s'accumule, si elle s'accumule |
 *  | `rss` | la seule chose qu'on regardait |
 *  | temps **processeur** contre temps d'horloge | si la page calcule ou si elle attend |
 *  | minute écoulée depuis le début | si le décrochage suit le **rang** de la page ou la **durée** |
 *
 *  Les deux dernières colonnes séparent les deux dernières explications possibles. Une page qui
 *  met quarante secondes en n'en calculant que deux attend quelque chose — un disque, un verrou.
 *  Une page qui en calcule quarante travaille vraiment, et si les mêmes pages travaillaient deux
 *  secondes en début de lecture, c'est la **machine** qui a ralenti, pas le programme : un
 *  processeur qui s'échauffe sous une heure de charge soutenue baisse sa fréquence, et aucune
 *  mesure interne au processus ne peut le voir.
 *
 *  D'où le relevé de la minute écoulée : si le décrochage se produit toujours autour de la même
 *  **minute** quel que soit le rang de la première page lue, il n'appartient pas au document.
 *
 *  Si le temps de ramasse-miettes explose à la soixantième page, la cause est dans le processus
 *  et c'est une rétention. S'il reste plat pendant que les secondes montent, elle est dehors, et
 *  c'est le système qui comprime ou qui échange.
 *
 *  **Il ne corrige rien et ne décide rien.** Il mesure, et la découpe décidée en 9.1 ter reste
 *  le contournement en place tant que la cause n'est pas établie.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { PerformanceObserver, type PerformanceEntry } from "node:perf_hooks";
import { chargerRecette, lireLot } from "@lienotheque/recettes";

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const RECETTE = join(RACINE, "fixtures/recettes/methode-pastilles-cd.v4.json");
const COMBIEN = Number(process.argv[2] ?? 80);
const DEPUIS = Number(process.argv[3] ?? 0);
const SORTIE = process.argv[4];

if (!existsSync(F4)) {
  console.log("Clichés absents : rien à mesurer.");
  process.exit(0);
}

/** Les espèces de ramasse-miettes de V8, par le code que `perf_hooks` rend.
 *
 *  La distinction est le cœur de la mesure : un mineur est court et fréquent, et dit seulement
 *  qu'on alloue ; un **majeur** parcourt tout le tas, rend de la mémoire au système et coûte
 *  cher. Une bascule de l'un vers l'autre est exactement ce qu'on cherche. */
const ESPECES: Record<number, string> = { 1: "mineur", 2: "majeur", 4: "incrémental", 8: "pause faible", 16: "tous" };

type Lot = { espece: string; ms: number };
let depuisLaPage: Lot[] = [];

const guetteur = new PerformanceObserver((liste) => {
  for (const entree of liste.getEntries()) {
    const detail = (entree as PerformanceEntry & { detail?: { kind?: number } }).detail;
    depuisLaPage.push({ espece: ESPECES[detail?.kind ?? 0] ?? `code ${detail?.kind}`, ms: entree.duration });
  }
});
guetteur.observe({ entryTypes: ["gc"] });

const recette = chargerRecette(JSON.parse(await readFile(RECETTE, "utf8")));

type Releve = {
  page: number;
  secondes: number;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  gcMs: number;
  gcMajeurMs: number;
  gcNombre: number;
  /** Temps processeur réellement consommé pendant cette page, utilisateur et système réunis. */
  cpu: number;
  /** Minutes écoulées depuis la première page : l'axe qui départage le rang et la durée. */
  minute: number;
};

const releves: Releve[] = [];
const mo = (octets: number) => Math.round(octets / 1048576);
let precedent = Date.now();
let cpuPrecedent = process.cpuUsage();
const depart = Date.now();
let premierePage = Date.now();

const lues = await lireLot(F4, recette, {
  depuis: DEPUIS,
  pages: COMBIEN,
  surTotal: (combien) => {
    console.log(`  ouverture : ${((Date.now() - depart) / 1000).toFixed(1)} s · ${combien} pages`);
    depuisLaPage = [];
    precedent = Date.now();
    premierePage = precedent;
    cpuPrecedent = process.cpuUsage();
  },
  avancement: (faits) => {
    const maintenant = Date.now();
    const memoire = process.memoryUsage();
    const gc = depuisLaPage;
    depuisLaPage = [];
    const cpu = process.cpuUsage(cpuPrecedent);
    cpuPrecedent = process.cpuUsage();
    const releve: Releve = {
      page: faits,
      secondes: (maintenant - precedent) / 1000,
      rss: mo(memoire.rss),
      heapUsed: mo(memoire.heapUsed),
      heapTotal: mo(memoire.heapTotal),
      external: mo(memoire.external),
      arrayBuffers: mo(memoire.arrayBuffers),
      gcMs: Math.round(gc.reduce((somme, un) => somme + un.ms, 0)),
      gcMajeurMs: Math.round(gc.filter((un) => un.espece === "majeur").reduce((somme, un) => somme + un.ms, 0)),
      gcNombre: gc.length,
      cpu: (cpu.user + cpu.system) / 1e6,
      minute: (maintenant - premierePage) / 60000,
    };
    releves.push(releve);
    precedent = maintenant;
    console.log(
      `  ${String(faits).padStart(3)} │ ${releve.secondes.toFixed(2).padStart(6)} s │ ` +
        `rss ${String(releve.rss).padStart(4)} · tas ${String(releve.heapUsed).padStart(4)}/${String(releve.heapTotal).padStart(4)} · ` +
        `hors tas ${String(releve.external).padStart(4)} │ ` +
        `cpu ${releve.cpu.toFixed(2).padStart(6)} s (${((releve.cpu / Math.max(0.001, releve.secondes)) * 100).toFixed(0).padStart(3)} %) │ ` +
        `min ${releve.minute.toFixed(1).padStart(5)} │ gc ${String(releve.gcMs).padStart(4)} ms`,
    );
  },
});

guetteur.disconnect();

/** Une tranche de pages, résumée. Les moyennes seules cachent le décrochage ; les tranches le
 *  montrent, et c'est ainsi qu'il a été vu la première fois. */
function tranche(nom: string, dedans: readonly Releve[]): void {
  if (dedans.length === 0) return;
  const somme = (quoi: (un: Releve) => number) => dedans.reduce((total, un) => total + quoi(un), 0);
  const moyenne = (quoi: (un: Releve) => number) => somme(quoi) / dedans.length;
  console.log(
    `  ${nom.padEnd(12)} │ ${moyenne((un) => un.secondes).toFixed(2).padStart(6)} s │ ` +
      `rss ${String(Math.round(moyenne((un) => un.rss))).padStart(4)} · tas ${String(Math.round(moyenne((un) => un.heapUsed))).padStart(4)} · ` +
      `hors tas ${String(Math.round(moyenne((un) => un.external))).padStart(4)} │ ` +
      `cpu ${moyenne((un) => un.cpu).toFixed(2).padStart(6)} s │ ` +
      `part du temps à calculer : ${((somme((un) => un.cpu) / Math.max(0.001, somme((un) => un.secondes))) * 100).toFixed(0).padStart(3)} % │ ` +
      `minutes ${moyenne((un) => un.minute).toFixed(1)}`,
  );
}

console.log(`\n  ${lues.length} page(s) lue(s).\n`);
console.log("  tranche      │  durée  │ mémoire (Mo)                       │ processeur");
for (let debut = 0; debut < releves.length; debut += 20)
  tranche(`${debut + 1}–${Math.min(debut + 20, releves.length)}`, releves.slice(debut, debut + 20));

if (SORTIE !== undefined) {
  await writeFile(SORTIE, JSON.stringify({ mesureLe: new Date().toISOString(), depuis: DEPUIS, releves }, null, 2), "utf8");
  console.log(`\n  Relevé écrit dans ${SORTIE}`);
}
