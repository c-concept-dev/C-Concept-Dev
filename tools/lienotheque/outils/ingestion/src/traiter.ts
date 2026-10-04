import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { instantaneDeLot } from "./lot.js";

/** Traite un lot réel et écrit l'instantané que liront les écrans (correction 8).
 *
 *     node outils/ingestion/src/traiter.ts --pdf <doc> --medias <dossier> \
 *          --recette <recette.json> --description <bibliotheque.json> [--sortie <fichier>]
 *
 *  Par défaut l'instantané va au cache de travail, hors du dépôt et hors de `public/` : il est
 *  produit depuis des fichiers sous droits, il n'a rien à faire dans un dossier publiable. */

const lire = (nom: string): string | undefined => {
  const rang = process.argv.indexOf(`--${nom}`);
  return rang === -1 ? undefined : process.argv[rang + 1];
};

const exige = (nom: string): string => {
  const valeur = lire(nom);
  if (valeur === undefined) {
    console.error(`Argument manquant : --${nom}`);
    process.exit(2);
  }
  return valeur;
};

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const sortie = resolve(lire("sortie") ?? join(coin(cache, "instantane"), "bibliotheque.json"));

// Les images de page vont à côté de l'instantané : le greffon de Vite sert les deux de là.
const images = resolve(lire("images") ?? join(dirname(sortie), "pages"));

const vue = await instantaneDeLot({
  pdf: resolve(exige("pdf")),
  medias: resolve(exige("medias")),
  recette: resolve(exige("recette")),
  description: resolve(exige("description")),
  cache: coin(cache, "lectures"),
  images,
  adresseImages: "/donnees/pages",
});

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, JSON.stringify(vue));
console.log(
  `Instantané écrit : ${sortie}\n` +
    `  ${vue.pages.length} pages, ${vue.compteurs.map((c) => `${c.nombre} ${c.mot}`).join(", ")}, ${vue.aVerifier} à vérifier\n` +
    `  images de page : ${images} (${vue.pages.filter((p) => p.image !== undefined).length} servies)`,
);
