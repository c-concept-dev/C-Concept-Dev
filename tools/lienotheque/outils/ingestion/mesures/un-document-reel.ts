/** Un document du vrai corpus, lu par la chaîne actuelle (BAS-02, troisième bloquant)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/un-document-reel.ts <document.pdf> [pages] [double]
 *
 *  ## Pourquoi un document entier, et pas un échantillon de plus
 *
 *  Tout ce qui est su du corpus l'est par échantillons : seize documents pour la couverture,
 *  trente-neuf pour l'exactitude, cinquante pages pour l'adjudication. Les échantillons ont bien
 *  travaillé — ils ont trouvé l'inexactitude de la couche et la bascule du vote d'orientation —
 *  mais **aucun document réel n'a jamais traversé la chaîne en entier.** F4 l'a tenté et s'est
 *  arrêté au garde-fou des quarante minutes.
 *
 *  Ce qu'un document entier peut révéler et qu'un échantillon ne peut pas : ce qui dépend de la
 *  **longueur** — une mémoire qui monte, un vote qui bascule, une sortie qui enfle — et ce qui
 *  dépend de la **variété** des pages, qu'un tirage de dix ne couvre jamais.
 *
 *  ## Ce qu'il relève, et lequel compte le plus
 *
 *  | relevé | ce qu'il décide |
 *  |---|---|
 *  | durée, cadence, pointe mémoire | si l'extrapolation au corpus tient |
 *  | pages servies par la couche contre la reconnaissance | la décision du 20 octobre, sur un vrai volume |
 *  | **numéros de page lus sur le total** | **le chiffre qui compte** |
 *  | passages illisibles | ce qui entrerait dans l'index sans pouvoir être vérifié |
 *
 *  ## La double page, et pourquoi elle est un argument et non une option
 *
 *  Donner `double` coupe chaque feuille en deux. Ce n'est pas un confort : lu d'un bloc, un
 *  cliché qui porte deux pages rend **deux folios**, et `numeroImprime` refuse alors de trancher
 *  — « s'ils se contredisent, on ne tranche pas ». Le premier relevé de ce document annonçait
 *  **20 % de numéros lus** ; le même document coupé en deux en rend **plus des deux tiers**, et
 *  la quasi-totalité une fois les pages liminaires passées. Les 20 % mesuraient mon erreur, pas
 *  la chaîne.
 *
 *  C'est la recette qui le déclare en vrai (`preparation.double_page`). Ici c'est un argument,
 *  parce qu'un banc qui lit un document sans recette doit pouvoir dire ce qu'il suppose.
 *
 *  Le troisième est le plus important, et c'est la leçon de F4 : une lecture rapide y trouvait un
 *  tiers des éléments et **aucun numéro imprimé**. Une page dont le numéro n'est pas lu ne se cite
 *  pas (RCH-09), et « toujours sur la vraie page » est la promesse du produit. Un document qui
 *  rendrait mille passages sans un seul numéro n'aurait rien donné.
 *
 *  ## Mesurer avant d'extrapoler
 *
 *  Le banc **n'extrapole pas de lui-même**. Sur F4, une extrapolation depuis deux échantillons
 *  annonçait onze minutes pour un traitement qui en a pris cinquante-sept. On lance d'abord cinq
 *  pages, on lit la cadence, et on décide ensuite d'aller au bout.
 *
 *  **Il ne fait que lire.** Rien n'est écrit dans le dossier du document ; aucune œuvre n'entre
 *  au dépôt (règle 5).
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";
import { enPassages, partDeMotsOutils, SEUIL_LISIBILITE, tesseractDisponible } from "@lienotheque/lecteur-texte";
import { lireLeTexte } from "../src/texte.js";

const [chemin, combien, double] = process.argv.slice(2);
if (chemin === undefined) {
  console.error("Attendu : <document.pdf> [pages]");
  process.exit(2);
}
if (!existsSync(chemin)) {
  console.error(`Introuvable : ${chemin}`);
  process.exit(2);
}
if (!tesseractDisponible()) {
  console.error("Tesseract absent : la reconnaissance ne pourrait pas tourner, et le relevé serait faux.");
  process.exit(2);
}
const PAGES = combien === undefined || combien === "-" ? undefined : Number.parseInt(combien, 10);
const DOUBLE = double === "double";

const mo = (octets: number) => Math.round(octets / 1048576);
let pointe = 0;
const depart = Date.now();
let precedente = Date.now();
const cadence: number[] = [];

const lu = await lireLeTexte(chemin, {
  ...(PAGES === undefined ? {} : { pages: PAGES }),
  ...(DOUBLE ? { doublePage: true } : {}),
  langue: "fra",
  avancement: (faits, total) => {
    const maintenant = Date.now();
    cadence.push(maintenant - precedente);
    precedente = maintenant;
    pointe = Math.max(pointe, process.memoryUsage().rss);
    if (faits % 10 === 0 || faits === total)
      process.stderr.write(
        `  ${faits}/${total} · ${((maintenant - depart) / 1000).toFixed(0)} s · pointe ${mo(pointe)} Mo\n`,
      );
  },
});

const secondes = (Date.now() - depart) / 1000;
const passages = enPassages(lu.pages);
const avecNumero = lu.pages.filter((page) => page.pageImprimee !== undefined).length;
const illisibles = passages.filter((passage) => partDeMotsOutils(passage.texte) < SEUIL_LISIBILITE).length;
const trie = [...cadence].sort((un, autre) => un - autre);

// Ce que le banc a **demandé**, jamais ce que la chaîne a décidé : depuis le 20 octobre elle
// détecte la double page elle-même, et un banc qui annoncerait « une page par feuille » parce
// qu'il n'a rien demandé mentirait sur un relevé qui dit le contraire.
console.log(`\n  ${basename(chemin)}${DOUBLE ? " — coupe imposée au banc" : " — coupe laissée au document"}\n`);
console.log("| relevé | valeur |");
console.log("|---|---:|");
console.log(`| pages lues | ${lu.pages.length} |`);
console.log(`| durée | ${secondes.toFixed(0)} s |`);
console.log(`| cadence médiane | ${((trie[Math.floor(trie.length / 2)] ?? 0) / 1000).toFixed(2)} s/page |`);
console.log(`| cadence moyenne | ${(secondes / Math.max(1, lu.pages.length)).toFixed(2)} s/page |`);
console.log(`| pointe mémoire | ${mo(pointe)} Mo |`);
console.log(`| servies par la couche | ${lu.parLaCouche} |`);
console.log(`| servies par la reconnaissance | ${lu.parOcr} |`);
console.log(`| sans aucun texte | ${lu.sansTexte} |`);
console.log(`| passages produits | ${passages.length} |`);
console.log(`| passages illisibles | ${illisibles} |`);
console.log(
  `| **numéros de page lus** | **${avecNumero} sur ${lu.pages.length}` +
    `${lu.pages.length > 0 ? ` (${((avecNumero / lu.pages.length) * 100).toFixed(0)} %)` : ""}** |`,
);

// Ce que le relevé dit de lui-même : une cadence tirée de cinq pages n'autorise pas à annoncer
// une durée pour trois cents. Le banc le rappelle plutôt que de laisser le lecteur conclure.
if (PAGES !== undefined)
  console.log(
    `\n  Relevé sur ${PAGES} page(s) seulement : cette cadence ne vaut pas extrapolation.` +
      ` Sur F4, onze minutes annoncées depuis deux échantillons en ont pris cinquante-sept.`,
  );
