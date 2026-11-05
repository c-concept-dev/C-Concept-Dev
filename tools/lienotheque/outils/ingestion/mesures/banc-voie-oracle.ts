/** Ce que la voie oracle donne sur un jeu du banc — et rien d'autre.
 *
 *  **Mesurer séparément**, décision de Christophe du 5 novembre 2026 : la voie oracle cherche les
 *  repères sans manière de lire ; A2 relit ce que la reconnaissance a abîmé. Les confondre ferait
 *  porter à l'une le résultat de l'autre. Ce banc-ci est donc la **référence d'avant A2** : sans
 *  elle, on ne saura pas ce qu'A2 aura rattrapé.
 *
 *  Aucun appel en ligne : ni relecture ciblée, ni validation structurelle, donc aucune clé n'est
 *  nécessaire. Le programme refuse de démarrer si un jeton traîne dans l'environnement.
 *
 *  Rien n'est écrit dans une bibliothèque : le jeu est un dossier du banc, et la sortie va là où
 *  l'appelant le dit.
 *
 *  Usage : banc-voie-oracle.ts <dossier-du-banc> <sortie.json> [combien]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { instantaneDeLot } from "../src/lot.js";

const [dossierBanc, sortie, combienBrut] = process.argv.slice(2);
if (dossierBanc === undefined || sortie === undefined) {
  console.error("usage : banc-voie-oracle.ts <dossier-du-banc> <sortie.json> [combien]");
  process.exit(2);
}
if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const DESCRIPTION = join(import.meta.dirname, "../../../fixtures/bibliotheques/banc-extraits.json");

const jeux = readdirSync(dossierBanc)
  .map((nom) => join(dossierBanc, nom))
  .filter((d) => statSync(d).isDirectory() && existsSync(join(d, "choix.json")))
  .slice(0, Number(combienBrut ?? 1000));

console.log(`${jeux.length} jeu(x) · description : ${basename(DESCRIPTION)}`);
const resultats: unknown[] = [];
for (const jeu of jeux) {
  const nom = basename(jeu);
  const pdf = readdirSync(jeu).find((n) => n.toLowerCase().endsWith(".pdf"));
  const dossierMedias = join(jeu, "medias");
  if (pdf === undefined) {
    console.log(`  ${nom} : aucun PDF`);
    continue;
  }
  const medias = existsSync(dossierMedias)
    ? readdirSync(dossierMedias).filter((n) => /\.(mp3|m4a|wav|flac)$/i.test(n))
    : [];
  const debut = Date.now();
  try {
    const traite = await instantaneDeLot({
      pdf: join(jeu, pdf),
      medias: dossierMedias,
      // La provenance borne le vivier : ici c'est le jeu lui-même, et c'est vrai — ces médias
      // viennent de la même archive que ce PDF. Sans elle, l'association s'abstient AVANT tout
      // calcul, et le banc ne mesurerait que son propre oubli.
      provenancesMedias: [`banc:${nom}`],
      inventaireMedias: medias.map((n) => ({
        nom: n,
        empreinte: n.padEnd(64, "0").slice(0, 64),
        provenances: [`banc:${nom}`],
      })),
      description: DESCRIPTION,
      // Pas de recette : c'est la voie oracle qu'on mesure.
    });
    const vue = traite.vue;
    const elements = vue.pages.reduce((s, p) => s + p.elements.length, 0);
    const porteuses = vue.pages.filter((p) => p.elements.length > 0).length;
    const folios = vue.pages.filter((p) => p.numero !== undefined).length;
    const ab = traite.association.abstention;
    const ligne = {
      jeu: nom,
      pages: vue.pages.length,
      medias: medias.length,
      elements,
      porteuses,
      folios,
      abstention: ab?.raison ?? null,
      douteux: vue.douteux.map((d) => d.etat),
      lecture: traite.lecture,
      secondes: Number(((Date.now() - debut) / 1000).toFixed(1)),
    };
    resultats.push(ligne);
    console.log(
      `  ${nom.slice(0, 44).padEnd(44)} ${String(vue.pages.length).padStart(3)} p · ${String(medias.length).padStart(2)} méd · ` +
        `${String(elements).padStart(3)} éléments · ${String(folios).padStart(3)} folios · ${ab?.raison ?? "publie"}`,
    );
  } catch (souci) {
    resultats.push({ jeu: nom, erreur: String((souci as Error).message).slice(0, 160) });
    console.log(`  ${nom.slice(0, 44).padEnd(44)} ÉCHEC : ${String((souci as Error).message).slice(0, 80)}`);
  }
}
mkdirSync(join(sortie, ".."), { recursive: true });
writeFileSync(sortie, `${JSON.stringify(resultats, null, 1)}\n`);
console.log(`\nécrit : ${sortie}`);
