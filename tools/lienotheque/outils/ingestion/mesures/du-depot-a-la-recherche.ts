/** Du dépôt à la recherche, sur un document réel — le critère du troisième bloquant (BAS-02)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx \
 *        mesures/du-depot-a-la-recherche.ts <document.pdf> [langue]
 *
 *  ## Ce qu'il prouve, et pourquoi aucun test unitaire ne le peut
 *
 *  Les épreuves d'`enregistrerLeTraitement` montrent que le chaînon écrit et que la recherche
 *  retrouve. Elles le montrent sur des passages fabriqués. **Ce banc le montre sur un vrai livre**,
 *  et il vérifie la seule chose qui compte vraiment : **la citation retrouvée pointe sur la page
 *  où le texte est réellement imprimé.**
 *
 *  ## Comment la vérification évite de tourner en rond
 *
 *  Le danger serait de vérifier la chaîne avec elle-même. Ici, la phrase retrouvée est cherchée
 *  **une seconde fois, dans le PDF d'origine**, par un chemin qui ne partage rien avec celui qui
 *  l'a indexée : `lireCoucheTexte` seul, sans coupe de feuille, sans arbitrage entre couche et
 *  reconnaissance, sans vote de décalage. Si les deux chemins s'accordent sur le rang de la page,
 *  la citation est vérifiable.
 *
 *  Ce que cela ne prouve pas, et qu'il faut dire : les deux chemins lisent la même couche texte.
 *  Sur un document numérisé, dont le texte vient de la reconnaissance, cette vérification-ci ne
 *  s'applique pas — il faudrait un œil sur l'image. Elle vaut pour un document natif, où la
 *  couche **est** le texte imprimé.
 *
 *  ## Ce qu'il ne fait pas
 *
 *  Aucune œuvre n'entre au dépôt (règle 5) : le document est un argument, la base est temporaire
 *  et effacée à la fin. Rien n'est publié, aucune ressource d'hébergement n'est touchée.
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { VersionDocument, type Passage, type SchemaBibliotheque } from "@lienotheque/contrats";
import { ouvrirDepot } from "@lienotheque/depot-sqlite";
import { enPassages, langueOcr, lireCoucheTexte } from "@lienotheque/lecteur-texte";
import { enregistrerLeTraitement } from "../src/index.js";
import { lireLeTexte } from "../src/texte.js";

const [chemin, langue = "fr"] = process.argv.slice(2);
if (chemin === undefined) {
  console.error("Attendu : <document.pdf> [langue de la bibliothèque]");
  process.exit(2);
}
if (!existsSync(chemin)) {
  console.error(`Introuvable : ${chemin}`);
  process.exit(2);
}

const id = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const sha = (c: string): string => c.repeat(64).slice(0, 64);
const LE = new Date().toISOString();

const SCHEMA: SchemaBibliotheque = {
  cle: "essai",
  nom: "Essai",
  langue,
  version: 1,
  axes: [
    {
      cle: "axe_un",
      nom: "Un axe",
      nature: "referentiel",
      cardinalite: "une",
      structure: "plat",
      obligatoire: false,
      alias: [],
      valeurs: [{ cle: "une", nom: "Une valeur", alias: [], synonymes: [], retiree: false }],
    },
  ],
};

const dossier = mkdtempSync(join(tmpdir(), "lienotheque-bout-en-bout-"));

try {
  // 1. Lire, comme la chaîne le fait.
  const depart = Date.now();
  const modele = langueOcr(langue);
  const lu = await lireLeTexte(chemin, { ...(modele === undefined ? {} : { langue: modele }) });
  const passages = enPassages(lu.pages);
  console.log(`  lu : ${lu.pages.length} pages, ${passages.length} passages, ${((Date.now() - depart) / 1000).toFixed(0)} s`);

  // 2. Déposer, ce que personne ne faisait avant le 20 octobre 2026.
  const depot = await ouvrirDepot(dossier);
  const bilan = await enregistrerLeTraitement(
    depot,
    {
      document: { id: id(10), bibliothequeId: id(1), titre: basename(chemin), alias: [], creeLe: LE },
      version: VersionDocument.parse({
        id: id(20),
        documentId: id(10),
        numero: 1,
        etat: "pret_a_lire",
        active: false,
        fichiers: [sha("a")],
        recette: { id: "livre-natif", version: 1 },
        outils: [{ nom: "lecteur-texte", version: "1.0.0" }],
        manques: [],
        creeLe: LE,
      }),
      schema: SCHEMA,
      fichiers: [
        { empreinte: sha("a"), taille: 1, typeMime: "application/pdf", nomOrigine: basename(chemin), ajouteLe: LE, appareilId: id(99) },
      ],
      lignes: [],
      association: { appariements: [], orphelins: [], manquants: [] },
      medias: [],
    },
    passages,
  );
  const active = await depot.versionActive(id(10));
  console.log(`  déposé : ${bilan.passages} passages, version active ${active === undefined ? "AUCUNE" : "oui"}`);

  // 3. Chercher une phrase que ce livre est seul à porter.
  //
  //    Tirée d'une page du milieu, assez longue pour être singulière et assez courte pour que
  //    l'index la retrouve d'un bloc. On ne la choisit pas à la main : un banc qui demanderait
  //    qu'on lui souffle sa question ne prouverait rien d'un corpus de deux cent cinquante.
  const auMilieu = passages[Math.floor(passages.length / 2)];
  if (auMilieu === undefined) throw new Error("Aucun passage : rien à chercher.");
  //    Des mots **contigus**, et c'est tout l'enjeu : un premier jet prenait les quatre premiers
  //    mots longs de la page, qui ne se suivent pas dans le texte. La phrase n'existait nulle
  //    part, et la recherche ne la trouvait évidemment pas. C'est le banc qui avait tort.
  const tous = auMilieu.texte.split(/\s+/).filter((mot) => mot !== "");
  const depuis = tous.findIndex((mot, rang) => rang > tous.length / 3 && /^[\p{L}]{6,}$/u.test(mot));
  const phrase = depuis < 0 ? "" : tous.slice(depuis, depuis + 5).join(" ");
  if (phrase === "") throw new Error("Ce document ne porte pas assez de mots pour une recherche.");

  const trouves = await depot.chercherPassages(`"${phrase}"`);
  console.log(`\n  recherche « ${phrase} » : ${trouves.length} résultat(s)`);
  const premier = trouves[0];
  if (premier === undefined) throw new Error("La recherche ne retrouve pas un texte qu'elle vient d'indexer.");

  // 4. **La vérification** : la même phrase, cherchée dans le PDF d'origine par un autre chemin.
  const brut = (await lireCoucheTexte(chemin)).pages;
  const rangsReels = brut
    .map((page, rang) => ({ rang: rang + 1, texte: page.mots.map((mot) => mot.texte).join(" ") }))
    .filter((page) => page.texte.includes(phrase))
    .map((page) => page.rang);

  console.log(`  la recherche dit : page ${premier.passage.page}` +
    `${premier.passage.pageImprimee === undefined ? ", sans numéro imprimé" : `, numéro imprimé ${premier.passage.pageImprimee}`}`);
  console.log(`  le PDF la porte  : page(s) ${rangsReels.join(", ") || "aucune"}`);

  const juste = rangsReels.includes(premier.passage.page);
  console.log(
    `\n  ${juste ? "La citation pointe sur la page où le texte est imprimé." : "ÉCART : la citation ne pointe pas sur la bonne page."}`,
  );
  if (!juste) process.exitCode = 1;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
