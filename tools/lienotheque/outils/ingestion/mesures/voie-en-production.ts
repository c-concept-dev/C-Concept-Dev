/** La chaîne réelle sur un dossier : le même appel que la file de traitement, et rien d'autre.
 *
 *  Pourquoi passer par `instantaneDeLot` et non par la voie seule : c'est le point d'entrée que
 *  l'exécutant appelle. Une mesure qui appellerait la voie directement sauterait la lecture du
 *  texte, les folios établis et le texte déjà lu qu'elle reçoit — c'est-à-dire la moitié de ce qui
 *  lui permet de conclure. On veut savoir ce que le produit trouve, pas ce qu'une fonction trouve.
 *
 *  Usage : voie-en-production.ts <document.pdf> <dossier des enregistrements> <description.json>
 *
 *  Le document est donné à part du vivier, parce que le document qui fait preuve est l'entier et
 *  que le vivier, lui, est rangé ailleurs.
 */
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { instantaneDeLot } from "@lienotheque/ingestion";

const pdf = process.argv[2]!;
const dossier = process.argv[3]!;
const description = process.argv[4]!;

/** Les enregistrements du dossier, pris récursivement comme la chaîne les prend. */
const enregistrements = (racine: string): string[] =>
  readdirSync(racine, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(racine, entree.name);
    if (entree.isDirectory()) return enregistrements(chemin);
    return /\.(mp3|m4a|wav)$/iu.test(entree.name) ? [chemin] : [];
  });
const sources = enregistrements(dossier);

console.log(`document : ${pdf.split("/").pop()}`);
console.log(`vivier   : ${sources.length} enregistrement(s)\n`);

const debut = Date.now();
// Le groupe de dépôt, sans lequel rien ne peut être publié : un vivier qui n'est pas borné par
// la provenance du document ne vaut rien, aussi régulière que soit sa numérotation. Sans lui, ce
// banc s'arrêtait sur « ce document ne dit pas d'où il vient » — et mesurait donc l'oracle sans
// jamais atteindre l'association, ce qu'il prétendait pourtant montrer.
//
// Il faut les deux bouts : le document doit dire d'où il vient, et chaque enregistrement doit
// dire la même chose. Un hôte range ses médias par empreinte et tient cet inventaire ; ici on le
// refait, pour que la mesure passe par le même chemin que la vraie chaîne.
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

const traite = await instantaneDeLot({
  pdf,
  medias: dossier,
  description,
  provenancesMedias: [GROUPE],
  inventaireMedias,
  surPhase: (phase) => console.log(`  · ${phase}`),
});
console.log(`\n══ en ${Math.round((Date.now() - debut) / 1000)} s ══`);

const { resultat, association, medias, lecture } = traite;
console.log(`texte : ${lecture.parLaCouche} page(s) par la couche, ${lecture.parOcr} par reconnaissance, ${lecture.sansTexte} sans texte`);
console.log(`repères : ${resultat.pages.length} page(s) relevée(s), ${resultat.lignes.length} élément(s)`);
for (const ligne of resultat.lignes.slice(0, 60))
  console.log(
    `  élément ${String(ligne.numero).padStart(3)}  page imprimée ${String(ligne.pageImprimee).padStart(3)}` +
      `  piste lue ${String(ligne.piste ?? "—").padStart(3)}  confiance ${ligne.confiance.toFixed(2)}` +
      `  accordPiste ${(ligne.accordPiste ?? 0).toFixed(2)}`,
  );
if (resultat.lignes.length > 60) console.log(`  … ${resultat.lignes.length - 60} autre(s)`);

console.log(`\nassociation : ${association.appariements.length} lien(s) proposé(s)`);
if (association.abstention !== undefined)
  console.log(`  abstention : ${association.abstention.raison} — ${association.abstention.pourquoi ?? "sans détail"}`);
for (const lien of association.appariements.slice(0, 60))
  console.log(
    `  ${JSON.stringify(lien).slice(0, 200)}`,
  );
console.log(`\nmédias vus : ${medias.length}`);
