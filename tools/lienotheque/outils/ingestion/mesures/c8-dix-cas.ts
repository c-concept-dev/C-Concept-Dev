/** Épreuve reproductible C8 : recherche réelle → route → surlignage exact.
 *
 * pnpm --filter @lienotheque/ingestion exec tsx mesures/c8-dix-cas.ts \
 *   <bibliothèque> <manifest.json> <graine>
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Passage, VueBibliotheque } from "@lienotheque/contrats";
import { chercher, surlignagesDe } from "@lienotheque/noyau";
import { ecrireRoute, lireRoute, type Route } from "../../../apps/app/src/navigation.js";

type Entree = { readonly nom: string; readonly source: string };
type Version = { readonly vue: VueBibliotheque; readonly passages: readonly Passage[] };

const [racine, manifeste, graine] = process.argv.slice(2);
if (racine === undefined || manifeste === undefined || graine === undefined)
  throw new Error("Attendu : <bibliothèque> <manifest.json> <graine>");

const lireJson = <T>(chemin: string): T => JSON.parse(readFileSync(chemin, "utf8")) as T;
const actives = lireJson<Record<string, { readonly version: string }>>(join(racine, "base/actives.json"));
const entrees = lireJson<readonly Entree[]>(manifeste)
  .map((entree) => ({ ...entree, empreinte: basename(entree.source).split(".")[0]! }))
  .filter((entree) => actives[entree.empreinte] !== undefined);

const alea = (cle: string): number => createHash("sha256").update(`${graine}\0${cle}`).digest().readUInt32BE(0);
const documents = [...entrees].sort((a, b) => alea(a.empreinte) - alea(b.empreinte) || a.empreinte.localeCompare(b.empreinte));
const preuves: unknown[] = [];

for (const document of documents) {
  if (preuves.length === 10) break;
  const version = actives[document.empreinte]!.version;
  const charge = lireJson<Version>(join(racine, "base/versions", `${version}.json`));
  const passages = [...charge.passages]
    .filter((passage) => passage.texte.length >= 40)
    .sort((a, b) => alea(`${document.empreinte}:${a.rang}`) - alea(`${document.empreinte}:${b.rang}`));

  let preuve: unknown | undefined;
  for (const passage of passages) {
    const suites = [...passage.texte.matchAll(/\p{L}{4,}(?: \p{L}{4,}){2}/gu)]
      .filter((trouve): trouve is RegExpMatchArray & { index: number } => trouve.index !== undefined)
      .sort((a, b) => alea(`${document.empreinte}:${passage.rang}:${a.index}`) - alea(`${document.empreinte}:${passage.rang}:${b.index}`));
    for (const suite of suites) {
      const requete = suite[0];
      const resultat = chercher(charge.vue, requete, { passages: charge.passages, parGroupe: Number.MAX_SAFE_INTEGER })
        .flatMap((groupe) => groupe.resultats)
        .find((un) => un.cibleRecherche?.passage === passage.rang && un.cibleRecherche.debut === suite.index);
      if (resultat?.page === undefined || resultat.cibleRecherche === undefined) continue;
      if (!charge.vue.pages.some((page) => page.index === resultat.page)) continue;

      const route: Route = { ecran: "lecteur", page: resultat.page, cibleRecherche: resultat.cibleRecherche };
      const fragment = ecrireRoute(route);
      const relue = lireRoute(fragment);
      const marques = surlignagesDe(passage.texte, requete);
      const exacte = marques.some((marque) => marque.debut === suite.index && marque.fin === suite.index + requete.length);
      if (!exacte || JSON.stringify(relue) !== JSON.stringify(route)) continue;

      preuve = {
        rang: preuves.length + 1,
        document: document.nom,
        page: resultat.page,
        passage: passage.rang,
        requete,
        cible: resultat.cibleRecherche,
        route: fragment,
        surlignage: marques.find((marque) => marque.debut === suite.index && marque.fin === suite.index + requete.length),
        exacte,
      };
      break;
    }
    if (preuve !== undefined) break;
  }
  if (preuve !== undefined) preuves.push(preuve);
}

if (preuves.length !== 10) throw new Error(`Seulement ${preuves.length}/10 preuves complètes`);
console.log(JSON.stringify({ graine, cas: preuves }, null, 2));
