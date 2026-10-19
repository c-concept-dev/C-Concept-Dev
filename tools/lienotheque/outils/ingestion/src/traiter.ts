import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { jetonDacces } from "@lienotheque/vision";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "./executant.js";
import { publierLaVue } from "./publier.js";

/** Traite un lot réel et écrit l'instantané que liront les écrans (correction 8).
 *
 *     node outils/ingestion/src/traiter.ts --pdf <doc> --medias <dossier> \
 *          --recette <recette.json> --description <bibliotheque.json> [--sortie <fichier>] \
 *          [--relecture <adresse du service>] [--publier <adresse du service>]
 *
 *  Ce script ne traite rien lui-même : il monte une demande et franchit la même porte que
 *  l'application — `executerTravail`. Un script qui prendrait un raccourci cesserait de prouver
 *  ce que l'application fait.
 *
 *  `--relecture` branche la relecture ciblée des repères difficiles (OUT-08) : le jeton d'accès
 *  est lu dans le processus au moment de l'appel, et n'apparaît nulle part. Sans cette option, la
 *  chaîne est exactement la même, elle ne relit simplement rien.
 *
 *  Par défaut l'instantané va au cache de travail, hors du dépôt et hors de `public/` : il est
 *  produit depuis des fichiers sous droits, il n'a rien à faire dans un dossier publiable.
 *
 *  `--publier` pousse la vue vers le service **à ce moment-là, et à aucun autre** : une version
 *  vient de s'activer, et c'est l'instant où ce qui est en ligne doit changer. Sans cette option,
 *  rien ne part sur le réseau — un traitement qui publierait de lui-même ferait partir des pages
 *  d'un document sous droits sans qu'on l'ait demandé.
 *
 *  La publication vient **après** l'écriture locale, et son échec ne la défait pas : l'instantané
 *  du cache est le résultat du traitement, et il reste bon même si le réseau refuse. */

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
const adressePublication = lire("publier");

const message = await executerTravail(
  demandeDeTraitement(randomUUID(), randomUUID(), {
    document: resolve(exige("pdf")),
    medias: resolve(exige("medias")),
    recette: resolve(exige("recette")),
    description: resolve(exige("description")),
    cache: cache.dossier,
    images,
    adresseImages: "/donnees/pages",
    adresseMedias: "/donnees/medias",
    ...(adresseRelecture === undefined ? {} : { relecture: adresseRelecture }),
  }),
  {
    emettre: (envoi) => {
      if (envoi.type === "journal") console.log(`  ${envoi.texte}`);
      // Une barre de progression n'a pas sa place dans un journal de sortie : on dit les dizaines.
      if (envoi.type === "progression" && envoi.pointReprise !== undefined && envoi.pointReprise.valeur % 25 === 0)
        console.log(`  ${Math.round(envoi.progression * 100)} % — ${envoi.pointReprise.valeur} pages lues`);
    },
  },
);

const { vue, passages } = chargeOuEchec(message);

mkdirSync(dirname(sortie), { recursive: true });
writeFileSync(sortie, JSON.stringify(vue));
console.log(
  `Instantané écrit : ${sortie}\n` +
    `  ${vue.pages.length} pages, ${vue.compteurs.map((c) => `${c.nombre} ${c.mot}`).join(", ")}, ${vue.aVerifier} à vérifier\n` +
    `  images de page : ${images} (${vue.pages.filter((p) => p.image !== undefined).length} servies)`,
);

// La publication, et seulement si on l'a demandée. Après l'écriture locale : l'instantané du
// cache est le résultat du traitement, et il reste bon même si le réseau refuse.
if (adressePublication !== undefined) {
  const jeton = jetonDacces();
  if (jeton === undefined) {
    console.error("Publication impossible : aucun jeton de service n'est posé dans l'environnement.");
    process.exit(1);
  }
  const faite = await publierLaVue(adressePublication, jeton, { vue, passages });
  if (!faite.faite) {
    console.error(`Publication refusée : ${faite.raison}`);
    process.exit(1);
  }
  console.log(`Vue publiée : ${faite.pages} pages, ${faite.passages} passages.`);
}
