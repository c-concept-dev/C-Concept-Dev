import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { jetonDacces, relectureCiblee, transportVersWorker } from "@lienotheque/vision";
import { instantaneDeLot } from "./lot.js";

/** Traite un lot réel et écrit l'instantané que liront les écrans (correction 8).
 *
 *     node outils/ingestion/src/traiter.ts --pdf <doc> --medias <dossier> \
 *          --recette <recette.json> --description <bibliotheque.json> [--sortie <fichier>] \
 *          [--relecture <adresse du service>]
 *
 *  `--relecture` branche la relecture ciblée des repères difficiles (OUT-08) : le jeton d'accès
 *  est lu au moment de l'appel, dans l'environnement puis dans le trousseau, et n'apparaît nulle
 *  part. Sans cette option, la chaîne est exactement la même, elle ne relit simplement rien.
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

const adresseRelecture = lire("relecture");
const jeton = adresseRelecture === undefined ? undefined : jetonDacces();
if (adresseRelecture !== undefined && jeton === undefined) {
  console.error("Relecture demandée mais aucun jeton : ni dans l'environnement, ni dans le trousseau.");
  process.exit(2);
}

const vue = await instantaneDeLot({
  pdf: resolve(exige("pdf")),
  medias: resolve(exige("medias")),
  recette: resolve(exige("recette")),
  description: resolve(exige("description")),
  cache: coin(cache, "lectures"),
  images,
  adresseImages: "/donnees/pages",
  adresseMedias: "/donnees/medias",
  ...(adresseRelecture === undefined || jeton === undefined
    ? {}
    : {
        relecture: relectureCiblee(transportVersWorker(adresseRelecture, jeton), {
          cacheDuLot: coin(cache, "vision-reponses"),
          compter: (passe, bilan) =>
            console.log(
              `  relecture, passe ${passe} : ${bilan.zones} zones, ${bilan.appels} appel(s), ` +
                `${bilan.depuisLeCache} depuis le cache, ${bilan.cout.toFixed(4)} €`,
            ),
        }),
      }),
});

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, JSON.stringify(vue));
console.log(
  `Instantané écrit : ${sortie}\n` +
    `  ${vue.pages.length} pages, ${vue.compteurs.map((c) => `${c.nombre} ${c.mot}`).join(", ")}, ${vue.aVerifier} à vérifier\n` +
    `  images de page : ${images} (${vue.pages.filter((p) => p.image !== undefined).length} servies)`,
);
