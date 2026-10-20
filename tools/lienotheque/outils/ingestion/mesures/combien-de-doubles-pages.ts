/** Combien de documents portent **deux pages par feuille** sans que le classement le dise ?
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx \
 *        mesures/combien-de-doubles-pages.ts <inventaire.json> <familles.json> [feuilles]
 *
 *  ## Pourquoi ce relevé existe
 *
 *  *Théorie ACT* est rangé par `familles.ts` dans « livre photographié, **une** page par
 *  feuille ». Il est à **deux**. Lu selon son classement, il mêle les textes de deux pages dans
 *  un même passage et perd les trois quarts de ses numéros imprimés — **sans rien signaler**.
 *  Une citation issue d'un tel passage renvoie à l'une des deux pages, au hasard, et personne ne
 *  peut la vérifier (RCH-09).
 *
 *  La question n'est donc pas « faut-il corriger le classement » mais « sur combien de
 *  documents ». Deux, et c'est une anomalie ; soixante, et c'est un chantier qui passe devant
 *  tout le reste.
 *
 *  ## Le signe, et pourquoi il ne coûte presque rien
 *
 *  Une feuille qui porte deux pages porte **deux folios**. On les cherche dans les bandes de
 *  marge, exactement là où `numeroImprime` les cherche, et l'on ne tranche pas autrement que lui :
 *  deux nombres plausibles **consécutifs** dans la même bande sont la signature d'une double
 *  page ; un seul est la signature d'une page simple.
 *
 *  Et c'est gratuit : on lit la **couche texte**, jamais la reconnaissance. Deux feuilles par
 *  document, et la lecture d'une couche coûte cinq millisecondes la page. Sur les documents dont
 *  la couche est muette — il y en a —, le relevé le dit au lieu de conclure.
 *
 *  **Il ne fait que lire.** Rien n'est écrit, et aucune œuvre n'entre au dépôt (règle 5).
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { lireCoucheTexte } from "@lienotheque/lecteur-texte";

const [cheminInventaire, cheminFamilles, combien = "3"] = process.argv.slice(2);
if (cheminInventaire === undefined || cheminFamilles === undefined) {
  console.error("Attendu : <inventaire.json> <familles.json> [feuilles par document]");
  process.exit(2);
}
const FEUILLES = Number.parseInt(combien, 10);

/** Les familles photographiées : les seules dont la feuille puisse porter deux pages. Un
 *  document natif n'est pas une photographie de feuille, et la question ne s'y pose pas. */
const PHOTOGRAPHIEES = new Set([
  "livre photographié, une page par feuille",
  "livre photographié, deux pages par feuille",
  "feuillet photographié",
]);

/** La bande de marge où un folio se cherche — la même que `numeroImprime`, et pour la même
 *  raison : un nombre au milieu du texte est une date, un prix ou une référence. */
const BANDE = 0.12;
const PAGE_MAXIMUM = 9_999;

type Trait = { chemin: string; empreinte: string; pages: number; famille: string };
type Releve = { chemin: string; empreinte: string };

const inventaire = JSON.parse(await readFile(cheminInventaire, "utf8")) as { releves: Releve[] };
const familles = (JSON.parse(await readFile(cheminFamilles, "utf8")) as { traits: Trait[] }).traits;
const parEmpreinte = new Map(inventaire.releves.map((un) => [un.empreinte, un.chemin]));

type Verdict = "double" | "simple" | "muette";

/** Ce qu'une poignée de feuilles dit de ce document.
 *
 *  On ne conclut « double » que si **une feuille au moins** montre deux folios consécutifs : un
 *  document à deux pages par feuille en montre sur presque toutes, tandis qu'une page simple n'en
 *  montre jamais deux qui se suivent. L'asymétrie est volontaire — on cherche une preuve de
 *  double page, pas une preuve de page simple, parce que c'est la double page non détectée qui
 *  abîme les citations. */
async function examiner(chemin: string, pages: number): Promise<{ verdict: Verdict; vus: string[] }> {
  const couche = (await lireCoucheTexte(chemin)).pages;
  // Au milieu du document : les pages liminaires ne portent pas de folio imprimé, et les lire
  // ferait conclure « muette » sur un ouvrage parfaitement numéroté.
  const debut = Math.max(0, Math.floor(Math.min(pages, couche.length) * 0.4));
  const vus: string[] = [];
  let double = false;
  let vuUnFolio = false;

  for (const page of couche.slice(debut, debut + FEUILLES)) {
    const haut = page.hauteur * BANDE;
    const bas = page.hauteur * (1 - BANDE);
    const nombres = new Set<number>();
    for (const mot of page.mots) {
      if (mot.y > haut && mot.y < bas) continue;
      if (!/^\d+$/.test(mot.texte)) continue;
      const valeur = Number.parseInt(mot.texte, 10);
      if (valeur >= 1 && valeur <= PAGE_MAXIMUM) nombres.add(valeur);
    }
    const tries = [...nombres].sort((a, b) => a - b);
    if (tries.length > 0) vuUnFolio = true;
    vus.push(tries.join("+") || "—");
    // Deux folios **qui se suivent** : c'est la signature. Deux nombres quelconques ne le sont
    // pas — un numéro de chapitre et un folio cohabitent sans que la feuille porte deux pages.
    for (let i = 0; i + 1 < tries.length; i += 1) if (tries[i + 1]! - tries[i]! === 1) double = true;
  }

  return { verdict: double ? "double" : vuUnFolio ? "simple" : "muette", vus };
}

const parFamille = new Map<string, { double: number; simple: number; muette: number }>();
const malRanges: { nom: string; famille: string; vus: string[] }[] = [];

for (const trait of familles) {
  if (!PHOTOGRAPHIEES.has(trait.famille) || trait.pages < 8) continue;
  const chemin = parEmpreinte.get(trait.empreinte);
  if (chemin === undefined) continue;

  let examen: { verdict: Verdict; vus: string[] };
  try {
    examen = await examiner(chemin, trait.pages);
  } catch {
    // Un document qu'on ne sait pas ouvrir n'est pas un document à deux pages : on ne le compte
    // ni d'un côté ni de l'autre plutôt que de le ranger au hasard.
    continue;
  }

  const compte = parFamille.get(trait.famille) ?? { double: 0, simple: 0, muette: 0 };
  compte[examen.verdict] += 1;
  parFamille.set(trait.famille, compte);

  // Le cas qui coûte : le classement dit « une page » et la feuille en porte deux.
  if (examen.verdict === "double" && trait.famille !== "livre photographié, deux pages par feuille")
    malRanges.push({ nom: basename(chemin), famille: trait.famille, vus: examen.vus });

  process.stderr.write(`  ${examen.verdict.padEnd(7)} ${basename(chemin).slice(0, 48)}\n`);
}

console.log(`\n  ${FEUILLES} feuille(s) lue(s) par document, couche texte seule.\n`);
console.log("| famille | deux pages | une page | couche muette |");
console.log("|---|---:|---:|---:|");
for (const [famille, compte] of parFamille)
  console.log(`| ${famille} | ${compte.double} | ${compte.simple} | ${compte.muette} |`);

console.log(`\n  **${malRanges.length} document(s) mal rangés** : la feuille porte deux pages, le classement dit une.\n`);
for (const un of malRanges) console.log(`  - ${un.nom} — folios vus : ${un.vus.join(" / ")}`);
