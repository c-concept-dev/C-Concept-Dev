/** Le témoin de F4, sans relecture : rien n'est appelé, rien n'est dépensé.
 *
 *  Il ne mesure pas le critère — celui-ci vaut 84 / 92 **avec** la relecture ciblée, qui passe
 *  par un service payant. Il répond à la seule question qu'on se pose après avoir touché au
 *  lecteur : **sa lecture a-t-elle bougé ?**
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/f4-temoin.ts
 *
 *  Relevé de référence, à comparer : **66 / 92 premiers éléments, 77 / 92 pages**. Un écart
 *  signifie que quelque chose a changé dans la lecture, et il faut alors savoir quoi avant de
 *  relancer la mesure complète.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ouvrirCache } from "@lienotheque/cache";
import type { LigneInterpretee } from "@lienotheque/contrats";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "@lienotheque/ingestion";

const RACINE = fileURLToPath(new URL("../../..", import.meta.url));
const F4 = join(RACINE, "fixtures/fichiers/F4/Paul westwood.pdf");
const ORACLE = join(RACINE, "docs/prototypes/Westwood_Vol1_CD1_pistes.csv");

const attendus: { piste: number; premier: number; page: number }[] = [];
for (const ligne of readFileSync(ORACLE, "utf8").split("\n").slice(1)) {
  const champs = ligne.split(",");
  if (champs.length >= 7 && Number(champs[0]) > 0)
    attendus.push({ piste: Number(champs[0]), premier: Number(champs[4]), page: Number(champs[6]) });
}
if (!existsSync(F4)) {
  console.log("Clichés absents : rien à mesurer.");
  process.exit(0);
}

const cache = ouvrirCache({ avertir: (m) => console.warn(m) });
const message = await executerTravail(
  demandeDeTraitement(randomUUID(), randomUUID(), {
    document: F4,
    medias: join(RACINE, "fixtures/fichiers/F4"),
    recette: join(RACINE, "fixtures/recettes/methode-pastilles-cd.v5.json"),
    description: join(RACINE, "fixtures/bibliotheques/F4.json"),
    cache: cache.dossier,
  }),
);
const traite = chargeOuEchec(message);
const lignes = traite.resultat.lignes as readonly LigneInterpretee[];

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
console.log(`témoin F4 : ${elements} / ${attendus.length} premiers éléments, ${pages} / ${attendus.length} pages`);
