/** Un document à blanc, et tout ce qu'il faut pour le comparer à la version publiée.
 *  Rien n'est écrit dans la bibliothèque : ni images, ni cache, ni médias. */
import { createHash } from "node:crypto";
import { readdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { instantaneDeLot } from "@lienotheque/ingestion";

const [pdf, dossier, description, sortie] = process.argv.slice(2) as [string, string, string, string];
const enregistrements = (racine: string): string[] =>
  readdirSync(racine, { withFileTypes: true }).flatMap((e) => {
    const c = join(racine, e.name);
    return e.isDirectory() ? enregistrements(c) : /\.(mp3|m4a|wav)$/iu.test(e.name) ? [c] : [];
  });
const sources = enregistrements(dossier);
const GROUPE = "lot:mesure";
const inventaireMedias = (
  await Promise.all(
    sources.map(async (chemin) => ({
      nom: relative(dossier, chemin),
      empreinte: createHash("sha256").update(await readFile(chemin)).digest("hex"),
      provenances: [GROUPE],
    })),
  )
).sort((un, autre) => un.nom.localeCompare(autre.nom, "fr"));

const journal: string[] = [];
const traite = await instantaneDeLot({
  pdf,
  medias: dossier,
  description,
  provenancesMedias: [GROUPE],
  inventaireMedias,
  surPhase: (phase) => { journal.push(phase); console.log(`  · ${phase}`); },
});

writeFileSync(
  sortie,
  JSON.stringify(
    {
      pages: traite.resultat.pages,
      lignes: traite.resultat.lignes,
      appariements: traite.association.appariements,
      orphelins: traite.association.orphelins,
      manquants: traite.association.manquants,
      abstention: traite.association.abstention ?? null,
      lecture: traite.lecture,
      journal,
    },
    null,
    2,
  ),
);
console.log(`\nécrit : ${sortie}`);
console.log(`liens : ${traite.association.appariements.length} · orphelins : ${JSON.stringify(traite.association.orphelins)}`);
