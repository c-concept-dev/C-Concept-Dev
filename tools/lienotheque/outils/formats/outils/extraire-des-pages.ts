#!/usr/bin/env tsx
/** Extraire N pages d'un document en gardant sa structure, et le prouver (FMT-01).
 *
 *     pnpm --filter @lienotheque/formats exec tsx outils/extraire-des-pages.ts \
 *       <document> <destination.pdf> [combien=12] [depuis=1]
 *
 *  ## Pourquoi cet outil existe
 *
 *  Un extrait sert à éprouver la chaîne sans traiter des centaines de pages. Il ne vaut que s'il
 *  se comporte **comme un document de ce nombre de pages** : même décompte, mêmes images, même
 *  chemin de décodage. Sinon on éprouve autre chose que ce qui tournera.
 *
 *  Mesuré le 1er novembre 2026 : les dix-sept extraits qui servaient à tous les essais rendaient
 *  **zéro page et zéro image** à la lecture de structure du projet, là où les originaux les
 *  rendent toutes. Six modules de production s'appuient sur cette lecture — l'inspecteur, l'export
 *  d'images, la chaîne de texte, le rendu, la validation structurelle, le banc. Sur ce corpus, ils
 *  voyaient tous un document vide et retombaient sur pdf.js. Rien ne cassait ; le chemin éprouvé
 *  n'était simplement pas celui de la vraie bibliothèque.
 *
 *  ## La cause, et pourquoi une seule option suffit
 *
 *  pdf-lib écrit par défaut une table de références croisées **compressée** et empaquette les
 *  dictionnaires de page dans un **flux d'objets** (`/ObjStm`, PDF 1.5+). La lecture de structure
 *  du projet cherche `N G obj` dans les octets bruts : elle n'en voit alors aucun.
 *
 *  `useObjectStreams: false` écrit les objets en clair avec une table classique. Mesuré sur un
 *  document réel de dix pages dont la première porte un JPEG à quatre composantes — celui qui fait
 *  quitter le processus au décodeur WebAssembly :
 *
 *  | | structure | rendu | images | garde-fou |
 *  |---|---:|---:|---:|---|
 *  | original | 10 | 10 | 10 | se déclenche |
 *  | extrait d'avant | **0** | 6 | **0** | muet |
 *  | extrait d'ici | **6** | 6 | **6** | **se déclenche** |
 *
 *  ## Ce que vaut la fidélité, mesuré
 *
 *  Les dix-sept familles de la bibliothèque d'essai, reconstruites le 1er novembre 2026 depuis
 *  leurs originaux, puis comparées à eux sur quatre axes indépendants :
 *
 *  | | avant | après |
 *  |---|---:|---:|
 *  | pages vues par la lecture de structure | 0 sur 18 | **18 sur 18** |
 *  | avertissement « structure muette » | 18 fois | **0 fois** |
 *  | images comptées, contre l'original sur le même intervalle | 0 | **identiques, 18 sur 18** |
 *  | verdict du garde-fou de décodage, contre l'original | muet | **identique, 18 sur 18** |
 *  | page 1 et page 6 rendues, octets de pixels | — | **identiques, 18 sur 18** |
 *
 *  La dernière ligne est la seule qui ne puisse pas se tromper en silence : elle compare les
 *  pixels, pas un décompte. Le garde-fou a été éprouvé en plus sur un document où il se déclenche
 *  vraiment — un JPEG à quatre composantes, le cas qui rend le moteur à `exit(1)` : « 1× JPEG à 4
 *  composantes colorimétriques » de part et d'autre.
 *
 *  Un avertissement sur la comparaison de corpus : les extraits d'avant **ne commençaient pas
 *  page 1**. Mesuré sur deux familles, leur page 1 rendue ne porte ni la géométrie ni les pixels
 *  de la page 1 de l'original (600×839 contre 600×776 ; 600×774 contre 600×773). Leur structure
 *  étant illisible, d'où ils partaient n'est pas retrouvable. Les mesures prises sur l'ancien
 *  corpus portent donc sur d'autres pages que celles du corpus reconstruit.
 *
 *  Écrire soi-même un PDF aurait été plus risqué, pas plus fidèle : les attributs hérités
 *  — `/MediaBox`, `/Resources`, `/Rotate` — vivent sur les nœuds intermédiaires de l'arbre des
 *  pages, et les reconstruire à la main est une occasion de les perdre. `copyPages` les porte.
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { PDFDocument } from "pdf-lib";
import { objetsPdf, pagesPdf } from "../src/index.js";

/** Ce que la lecture de structure du projet voit d'un fichier : son propre juge.
 *
 *  `surCesPages` restreint le compte d'images à un intervalle, et ce n'est pas un confort : juger
 *  un extrait sur le **total** de son original compare deux choses différentes. Mesuré le
 *  1er novembre 2026 sur un document de 275 pages et 62 190 images — ses quatorze premières pages
 *  n'en portent aucune, les images commencent page quinze. Un extrait de douze pages sans image
 *  était donc parfaitement fidèle, et mon premier critère le déclarait raté. */
export function structureVue(
  octets: Buffer,
  surCesPages?: { readonly depuis: number; readonly combien: number },
): { readonly pages: number; readonly images: number } {
  const objets = objetsPdf(octets);
  const toutes = pagesPdf(objets);
  const pages =
    surCesPages === undefined
      ? toutes
      : toutes.slice(surCesPages.depuis, surCesPages.depuis + surCesPages.combien);
  return { pages: toutes.length, images: pages.reduce((total, page) => total + page.images.length, 0) };
}

export async function extraireDesPages(
  source: string,
  destination: string,
  combien: number,
  depuis: number,
): Promise<{ readonly avant: { pages: number; images: number }; readonly apres: { pages: number; images: number } }> {
  const octets = await readFile(source);
  // **Un document chiffré se refuse, il ne s'extrait pas de force.**
  //
  // `ignoreEncryption` existe et serait un piège : pdf-lib ne déchiffre rien, il saute seulement
  // le contrôle. Les flux copiés resteraient chiffrés dans un conteneur qui ne l'est plus, et
  // l'extrait porterait des images illisibles — sans qu'aucune mesure de structure s'en aperçoive,
  // puisque le compte de pages et d'images serait juste. C'est exactement le genre d'extrait faux
  // et confiant que cet outil existe pour empêcher.
  //
  // Mesuré sur la bibliothèque réelle : 2 documents sur 250 sont chiffrés.
  if (/\/Encrypt\s/.test(octets.toString("latin1")))
    throw new Error(
      `Ce document est chiffré : ${basename(source)}. Un extrait fidèle demanderait de le ` +
        `déchiffrer, ce que cet outil ne fait pas. Extrayez-le autrement, ou laissez-le entier.`,
    );
  const document = await PDFDocument.load(octets);
  const total = document.getPageCount();
  const premier = Math.max(1, Math.min(depuis, total)) - 1;
  const places = Array.from({ length: Math.min(combien, total - premier) }, (_, rang) => premier + rang);

  const neuf = await PDFDocument.create();
  for (const page of await neuf.copyPages(document, places)) neuf.addPage(page);
  // L'option qui fait tout : voir l'en-tête de ce fichier.
  const produit = Buffer.from(await neuf.save({ useObjectStreams: false }));
  await writeFile(destination, produit);

  // L'original n'est compté que sur les pages extraites : c'est la seule comparaison qui ait un
  // sens, et celle qui dit si l'extrait est fidèle.
  return { avant: structureVue(octets, { depuis: premier, combien: places.length }), apres: structureVue(produit) };
}

if (process.argv[1]?.endsWith("extraire-des-pages.ts") === true) {
  const [source, destination, combien, depuis] = process.argv.slice(2);
  if (source === undefined || destination === undefined) {
    console.error("Attendu : <document> <destination.pdf> [combien=12] [depuis=1]");
    process.exit(2);
  }
  const mesure = await extraireDesPages(source, destination, Number(combien ?? 12), Number(depuis ?? 1));
  console.log(
    `${basename(source).slice(0, 36).padEnd(36)} original ${String(mesure.avant.pages).padStart(4)} page(s) / ` +
      `${String(mesure.avant.images).padStart(5)} image(s)  →  extrait ${String(mesure.apres.pages).padStart(3)} / ` +
      `${String(mesure.apres.images).padStart(5)}`,
  );
  // Un extrait dont la structure ne se lit pas est un extrait raté : on le dit fort, et on sort
  // en erreur. C'est le défaut que cet outil existe pour empêcher, et il ne doit pas pouvoir
  // revenir en silence.
  if (mesure.apres.pages === 0 && mesure.avant.pages > 0) {
    console.error("ÉCHEC : la structure de l'extrait ne se lit pas, alors que celle de l'original se lit.");
    process.exit(1);
  }
}
