/** Critère F4, mesuré à la porte de l'application (OUT-08, lot D).
 *
 *  Ce banc n'orchestre rien : il franchit deux fois la même porte que l'application —
 *  `executerTravail` —, une fois sans relecture pour le témoin, une fois avec. Un seul chemin de
 *  code, sans quoi le critère mesuré ne serait pas celui de l'application.
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/f4-vision.ts <url>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import type { LigneInterpretee } from "@lienotheque/contrats";
import { jetonDacces } from "@lienotheque/vision";
import { chargeOuEchec, demandeDeTraitement, executerTravail, type ChargeTraitement } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const MEDIAS = join(RACINE, "fixtures/fichiers/F4");
const RECETTE = join(RACINE, "fixtures/recettes/methode-pastilles-cd.v5.json");
const DESCRIPTION = join(RACINE, "fixtures/bibliotheques/F4.json");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_CD1_pistes.csv");

const base = process.argv[2];
if (base === undefined) {
  console.log("Adresse du service de relecture attendue en premier argument.");
  process.exit(1);
}
if (jetonDacces() === undefined) {
  console.log("Aucun jeton : ni dans l'environnement, ni dans le trousseau. Rien n'a été appelé.");
  process.exit(1);
}
if (!existsSync(F4) || !existsSync(ORACLE)) {
  console.log("Clichés ou oracle absents : rien à mesurer ici.");
  process.exit(0);
}

const attendus: { piste: number; premier: number; page: number }[] = [];
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const champs = ligne.split(",");
  if (champs.length >= 7 && Number(champs[0]) > 0)
    attendus.push({ piste: Number(champs[0]), premier: Number(champs[4]), page: Number(champs[6]) });
}
console.log(`Oracle : ${attendus.length} pistes`);

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });

const charge = (avecRelecture: boolean): ChargeTraitement => ({
  document: F4,
  medias: MEDIAS,
  recette: RECETTE,
  description: DESCRIPTION,
  cache: cache.dossier,
  ...(avecRelecture ? { relecture: base } : {}),
});

const franchir = async (avecRelecture: boolean, dire: boolean) => {
  const debut = Date.now();
  const message = await executerTravail(demandeDeTraitement(randomUUID(), randomUUID(), charge(avecRelecture)), {
    emettre: (envoi) => {
      if (dire && envoi.type === "journal" && envoi.texte.startsWith("Relecture")) console.log(`  ${envoi.texte}`);
    },
  });
  const traite = chargeOuEchec(message);
  console.log(`${avecRelecture ? "Chaîne complète" : "Témoin"} : ${Math.round((Date.now() - debut) / 1000)} s`);
  return traite;
};

/** Le critère porte sur le premier support : l'oracle est celui du premier disque. */
const score = (lignes: readonly LigneInterpretee[]) => {
  const parPiste = new Map<number, { numero: number; page: number }>();
  for (const ligne of lignes)
    if (ligne.piste !== undefined && ligne.disque === 1 && !parPiste.has(ligne.piste))
      parPiste.set(ligne.piste, { numero: ligne.numero, page: ligne.pageImprimee });
  let elements = 0;
  let pages = 0;
  for (const attendu of attendus) {
    const obtenu = parPiste.get(attendu.piste);
    if (obtenu === undefined) continue;
    if (obtenu.numero === attendu.premier) elements += 1;
    if (obtenu.page === attendu.page) pages += 1;
  }
  return { elements, pages };
};

const causeDe = (lignes: readonly LigneInterpretee[]): Map<number, string> => {
  const premiers = new Map<number, number>();
  for (const ligne of lignes)
    if (ligne.piste !== undefined && ligne.disque === 1 && !premiers.has(ligne.piste)) premiers.set(ligne.piste, ligne.numero);
  const parNumero = new Map(lignes.map((ligne) => [ligne.numero, ligne]));
  const causes = new Map<number, string>();
  for (const attendu of attendus) {
    if (premiers.get(attendu.piste) === attendu.premier) continue;
    const ligne = parNumero.get(attendu.premier);
    causes.set(
      attendu.piste,
      ligne === undefined
        ? "non lu"
        : ligne.piste === undefined
          ? "sans piste"
          : ligne.disque !== 1
            ? "hors support 1"
            : ligne.piste === attendu.piste
              ? "dispute"
              : "piste fausse",
    );
  }
  return causes;
};

const temoin = await franchir(false, false);
const avec = await franchir(true, true);

const parRelecture = new Map<string, number>();
for (const ligne of avec.resultat.lignes)
  if (ligne.relecture !== undefined) parRelecture.set(ligne.relecture, (parRelecture.get(ligne.relecture) ?? 0) + 1);
console.log(`Ce que la relecture a fait : ${[...parRelecture].sort().map(([quoi, nombre]) => `${nombre} ${quoi}`).join(", ") || "rien"}`);

const avant = score(temoin.resultat.lignes);
const apres = score(avec.resultat.lignes);
console.log(`\n${"".padEnd(26)}${"témoin".padStart(9)}${"chaîne".padStart(10)}${"critère".padStart(9)}`);
console.log(`${"Premiers éléments justes".padEnd(26)}${`${avant.elements}/92`.padStart(9)}${`${apres.elements}/92`.padStart(10)}${"83".padStart(9)}`);
console.log(`${"Pages justes".padEnd(26)}${`${avant.pages}/92`.padStart(9)}${`${apres.pages}/92`.padStart(10)}${"89".padStart(9)}`);
console.log(`\nCritère normatif (83 premiers éléments) : ${apres.elements >= 83 ? "TENU" : "NON TENU"}`);

const causesAvant = causeDe(temoin.resultat.lignes);
const causesApres = causeDe(avec.resultat.lignes);
console.log(`\nEffet par cause :`);
for (const cause of ["dispute", "piste fausse", "non lu", "sans piste", "hors support 1"]) {
  const a = [...causesAvant.values()].filter((valeur) => valeur === cause).length;
  const b = [...causesApres.values()].filter((valeur) => valeur === cause).length;
  if (a === 0 && b === 0) continue;
  console.log(`  ${cause.padEnd(16)} ${String(a).padStart(3)} → ${String(b).padStart(3)}`);
}

writeFileSync(
  join(coin(cache, "vision"), "f4-vision.json"),
  JSON.stringify(
    {
      avant,
      apres,
      relecture: [...parRelecture],
      orphelins: avec.association.orphelins.length,
      pagesAbsentes: avec.resultat.pagesAbsentes.length,
      causes: { avant: [...causesAvant], apres: [...causesApres] },
    },
    null,
    1,
  ),
);
console.log(`\nPages absentes : ${avec.resultat.pagesAbsentes.length} ; médias orphelins : ${avec.association.orphelins.length}`);
