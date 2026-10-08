/** Deux candidats se disputent l'ouverture d'une piste : combien, et que coûterait leur relecture ?
 *
 *  Le reste de F4 ne vient plus d'un défaut de lecture. Il vient de ce qu'une lecture seule ne dit
 *  pas si un pavé **est** un repère : deux éléments voisins portent chacun une forme plausible, la
 *  présence vaut à peu près la même chose des deux côtés, et c'est le premier qui ouvre la piste —
 *  à tort une fois sur deux.
 *
 *  Cette mesure ne dépense rien : elle compte, elle ne demande rien. Elle rend les cas des écarts
 *  restants, le nombre de pavés ambigus à l'échelle du lot, et ce qu'il coûterait de les faire
 *  relire.
 *
 *     pnpm --filter @lienotheque/vision exec tsx mesures/ambigus-f4.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { ZONES_MAX_PAR_APPEL } from "@lienotheque/contrats";
import {
  chargerRecette,
  clefDeVision,
  interpreter,
  lireLot,
  mediasDuDossier,
  supportsPresents,
  type LectureParVision,
} from "@lienotheque/recettes";
import { coutProjete } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_CD1_pistes.csv");
const ORACLE_ELEMENTS = join(RACINE, "docs/prototypes/Westwood_Vol1_exercices.csv");
const RECETTE = chargerRecette(JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-pastilles-cd.v5.json"), "utf8")));

if (!existsSync(F4) || !existsSync(ORACLE)) {
  console.log("Clichés ou oracle absents : rien à mesurer ici.");
  process.exit(0);
}

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const lues = await lireLot(F4, RECETTE, { cache: coin(cache, "lectures") });

const carte = join(coin(cache, "vision"), "f4-vision-map.json");
type Relue = { cliche: number; cote: string; numero: number; lu: number | null; confiance: number };
const relues: Relue[] = existsSync(carte) ? (JSON.parse(readFileSync(carte, "utf8")) as Relue[]) : [];
const vision = new Map<string, LectureParVision>(
  relues
    .filter((relue) => relue.lu !== null)
    .map((relue) => [
      clefDeVision(relue.cliche, relue.cote === "—" ? undefined : relue.cote, relue.numero),
      { numero: relue.lu!, confiance: relue.confiance, outil: { nom: "vision-ciblee", version: "0.1.0" } },
    ]),
);
console.log(`Relectures en cache : ${vision.size} numéros rendus`);

const attendus: { piste: number; premier: number; page: number }[] = [];
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const champs = ligne.split(",");
  if (champs.length >= 7 && Number(champs[0]) > 0) attendus.push({ piste: Number(champs[0]), premier: Number(champs[4]), page: Number(champs[6]) });
}
const pisteDeLElement = new Map<number, number>();
for (const ligne of readFileSync(ORACLE_ELEMENTS, "utf8").split("\n").slice(1)) {
  const [element, , piste] = ligne.split(",");
  if (Number.isFinite(Number(element)) && Number(piste) > 0) pisteDeLElement.set(Number(element), Number(piste));
}

const medias = await mediasDuDossier(join(RACINE, "fixtures/fichiers/F4"), RECETTE);
const resultat = interpreter(lues, RECETTE, { nombreDePistes: medias.length, supports: supportsPresents(medias), vision });

/** Ce que la lecture a mis sur chaque élément. C'est là que se juge une ambiguïté. */
type Lu = { presencePiste: number; pisteLue?: number | undefined; aUnRepere: boolean; cliche: number; cote: string };
const lu = new Map<number, Lu>();
for (const page of lues)
  for (const element of page.elements)
    lu.set(element.numero, {
      presencePiste: element.presencePiste,
      ...(element.pisteLue === undefined ? {} : { pisteLue: element.pisteLue }),
      aUnRepere: element.zoneRepere !== undefined,
      cliche: page.index,
      cote: page.cote ?? "—",
    });

const premierDe = new Map<number, number>();
for (const ligne of resultat.lignes)
  if (ligne.piste !== undefined && ligne.disque === 1 && !premierDe.has(ligne.piste)) premierDe.set(ligne.piste, ligne.numero);
const parNumero = new Map(resultat.lignes.map((ligne) => [ligne.numero, ligne]));

// --- Les écarts restants, par cause.
console.log(`\n=== les écarts restants ===`);
const causes = new Map<string, number>();
const disputes: { piste: number; retenu: number; attendu: number }[] = [];
for (const attendu of attendus) {
  const obtenu = premierDe.get(attendu.piste);
  if (obtenu === attendu.premier) continue;
  const ligne = parNumero.get(attendu.premier);
  if (ligne === undefined) causes.set("l'élément attendu n'est pas lu du tout", (causes.get("l'élément attendu n'est pas lu du tout") ?? 0) + 1);
  else if (ligne.piste === undefined) causes.set("l'élément est lu mais sans piste", (causes.get("l'élément est lu mais sans piste") ?? 0) + 1);
  else if (ligne.disque !== 1) causes.set("l'élément est mis hors du premier support", (causes.get("l'élément est mis hors du premier support") ?? 0) + 1);
  else if (ligne.piste === attendu.piste && obtenu !== undefined) {
    causes.set("piste juste, un autre élément la précède", (causes.get("piste juste, un autre élément la précède") ?? 0) + 1);
    disputes.push({ piste: attendu.piste, retenu: obtenu, attendu: attendu.premier });
  } else causes.set("piste fausse sur le premier support", (causes.get("piste fausse sur le premier support") ?? 0) + 1);
}
for (const [cause, nombre] of [...causes].sort((a, b) => b[1] - a[1])) console.log(`  ${String(nombre).padStart(3)}  ${cause}`);

// --- Les disputes : deux candidats pour une même ouverture.
console.log(`\n=== deux candidats se disputent l'ouverture ===`);
const dire = (numero: number): string => {
  const r = lu.get(numero);
  if (r === undefined) return `él.${numero} (non lu)`;
  return (
    `él.${numero} c${r.cliche}/${r.cote} présence ${r.presencePiste.toFixed(2)} ` +
    `pastille ${r.pisteLue ?? "—"}${r.aUnRepere ? " repère localisé" : " sans repère"}`
  );
};
for (const dispute of disputes) {
  console.log(`  piste ${dispute.piste}`);
  console.log(`    retenu  : ${dire(dispute.retenu)}`);
  console.log(`    attendu : ${dire(dispute.attendu)}`);
}

// --- Et à l'échelle du lot : combien de pavés sont dans ce cas ?
//
// Deux éléments consécutifs sur la même piste, portant tous deux un repère localisé : rien dans la
// lecture ne dit lequel l'ouvre. C'est la définition la plus étroite qu'on puisse donner sans
// oracle, donc celle qui vaut en production.
console.log(`\n=== les pavés ambigus du lot ===`);
const parPiste = new Map<string, number[]>();
for (const ligne of resultat.lignes) {
  if (ligne.piste === undefined) continue;
  const clef = `${ligne.disque}/${ligne.piste}`;
  parPiste.set(clef, [...(parPiste.get(clef) ?? []), ligne.numero]);
}

const ambigus = new Set<number>();
let pistesDisputees = 0;
for (const numeros of parPiste.values()) {
  const avecRepere = numeros.filter((numero) => lu.get(numero)?.aUnRepere === true);
  if (avecRepere.length < 2) continue;
  pistesDisputees += 1;
  for (const numero of avecRepere) ambigus.add(numero);
}
console.log(`  pistes dont plusieurs éléments portent un repère localisé : ${pistesDisputees}`);
console.log(`  pavés en jeu : ${ambigus.size}`);

const presences = [...ambigus].map((numero) => lu.get(numero)!.presencePiste);
if (presences.length > 0) {
  const dans = presences.filter((valeur) => valeur >= 0.26 && valeur <= 0.51).length;
  console.log(`  dont la présence tient entre 0,26 et 0,51 : ${dans} (${Math.round((dans / presences.length) * 100)} %)`);
  console.log(`  présence : de ${Math.min(...presences).toFixed(2)} à ${Math.max(...presences).toFixed(2)}`);
}

const appels = Math.ceil(ambigus.size / ZONES_MAX_PAR_APPEL);
const cout = coutProjete(ambigus.size, undefined) + (appels - 1) * coutProjete(0, undefined);
console.log(`\n=== ce que leur relecture coûterait ===`);
console.log(`  ${ambigus.size} pavés, ${appels} appel(s) de ${ZONES_MAX_PAR_APPEL} au plus`);
console.log(`  projection : ${cout.toFixed(4)} € — plafond de la recette ${RECETTE.vision?.cout_max_eur} €`);
console.log(`  déjà en cache : ${[...ambigus].filter((numero) => vision.has(clefDeVision(lu.get(numero)!.cliche, lu.get(numero)!.cote === "—" ? undefined : lu.get(numero)!.cote, numero))).length}`);

writeFileSync(
  join(coin(cache, "vision"), "ambigus-f4.json"),
  JSON.stringify({ causes: [...causes], disputes, ambigus: [...ambigus].sort((a, b) => a - b), cout }, null, 1),
);
