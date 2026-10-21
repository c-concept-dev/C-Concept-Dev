/** Le moteur empaqueté lit-il comme la chaîne ? (PLT-02, BAS-02)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx \
 *        mesures/moteur-empaquete.ts <document> [langue]
 *
 *  ## Pourquoi cette question se pose
 *
 *  Tout ce qui a été éprouvé aujourd'hui l'a été **depuis les sources**. Ce que le paquet exécute
 *  est autre chose : `moteur.js`, la chaîne rassemblée en un fichier par esbuild, lancée par un
 *  Node embarqué, sans `node_modules` autour. L'essai de la file l'a montré en écrivant au
 *  journal un avertissement qui n'apparaît jamais depuis les sources :
 *
 *      Cannot load "@napi-rs/canvas" package
 *      Cannot polyfill `ImageData`, rendering may be broken.
 *
 *  « Rendering may be broken » n'est pas une phrase qu'on laisse passer sans regarder. La chaîne
 *  ne rastérise pas avec pdf.js — elle extrait les images que le PDF porte déjà — mais le
 *  raisonnement ne vaut pas mesure.
 *
 *  ## Ce que ce banc compare
 *
 *  Le même document, par les deux chemins, et **passage par passage** :
 *
 *  | | |
 *  |---|---|
 *  | la chaîne | `executerTravail` dans ce processus, depuis les sources |
 *  | le paquet | `moteur.js` lancé comme l'hôte le lance, un message par ligne |
 *
 *  Le second parle le protocole de l'hôte : une demande entre par l'entrée standard, les messages
 *  sortent par la sortie standard. C'est le dialogue réel, pas une imitation.
 *
 *  Il ne compare pas des nombres mais **le texte**. Deux chaînes qui rendent le même compte de
 *  passages et des textes différents seraient le pire des cas : un écart qu'aucun total ne montre.
 */

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Passage } from "@lienotheque/contrats";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const MOTEUR = join(RACINE, "apps/app/src-tauri/moteurs/chaine/moteur.js");

const [chemin, langue = "fr"] = process.argv.slice(2);
if (chemin === undefined || !existsSync(chemin)) {
  console.error("Attendu : <document> [langue]");
  process.exit(2);
}
if (!existsSync(MOTEUR)) {
  console.error(`Moteur empaqueté introuvable : ${MOTEUR}\nLancez d'abord preparer-moteur-node.py.`);
  process.exit(2);
}

const dossier = mkdtempSync(join(tmpdir(), "lienotheque-empaquete-"));
const medias = join(dossier, "medias");
const images = join(dossier, "images");
for (const un of [medias, images]) mkdirSync(un);

const description = join(dossier, "bibliotheque.json");
writeFileSync(
  description,
  JSON.stringify({
    id: "essai-du-paquet",
    nom: "Essai",
    mots: {
      element: { un: "élément", plusieurs: "éléments" },
      piste: { un: "piste", plusieurs: "pistes" },
      page: { un: "page", plusieurs: "pages" },
    },
    schema: {
      cle: "essai",
      nom: "Essai",
      langue,
      version: 1,
      axes: [
        {
          cle: "un-axe",
          nom: "Un axe",
          nature: "referentiel",
          cardinalite: "une",
          structure: "plat",
          obligatoire: false,
          alias: [],
          valeurs: [{ cle: "une", nom: "Une valeur", alias: [], synonymes: [], retiree: false }],
        },
      ],
    },
  }),
);

const recette = join(dossier, "maniere.json");
writeFileSync(
  recette,
  JSON.stringify({
    id: "livre-ordinaire",
    version: 1,
    derivee_de: null,
    preparation: { redressement: "aucun" },
    lectures: [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", x: 0.05, y: 0.86, l: 0.9, h: 0.12 }, alphabet: "chiffres" }],
    regles: { elements: { ordre: "strictement_croissant", saut_max: 12 }, plusieurs_elements_par_piste: false },
    validation: { seuil_confiance: 0.6 },
  }),
);

const charge = { document: chemin, medias, recette, description, images } as const;

/** Le moteur empaqueté, lancé comme l'hôte le lance : un message JSON par ligne. */
async function parLePaquet(): Promise<readonly Passage[]> {
  const demande = demandeDeTraitement(randomUUID(), randomUUID(), { ...charge });
  return await new Promise((resoudre, rejeter) => {
    const enfant = spawn(process.execPath, [MOTEUR], { stdio: ["pipe", "pipe", "inherit"] });
    const lignes = createInterface({ input: enfant.stdout });
    let rendu = false;

    lignes.on("line", (ligne) => {
      if (ligne.trim() === "") return;
      const message = JSON.parse(ligne) as { type: string; charge?: { passages?: Passage[] }; cause?: string };
      if (message.type === "salutation") {
        enfant.stdin.write(`${JSON.stringify(demande)}\n`);
        return;
      }
      if (message.type === "resultat") {
        rendu = true;
        resoudre(message.charge?.passages ?? []);
        enfant.stdin.end();
        enfant.kill();
      }
      if (message.type === "echec") {
        rendu = true;
        rejeter(new Error(`le moteur empaqueté a refusé : ${message.cause ?? "sans cause"}`));
        enfant.kill();
      }
    });

    enfant.on("exit", (code) => {
      if (!rendu) rejeter(new Error(`le moteur empaqueté s'est arrêté sans rien rendre (code ${code ?? "?"})`));
    });
  });
}

try {
  console.log("  par le paquet…");
  const depuisLePaquet = await parLePaquet();
  console.log("  par les sources…");
  const depuisLesSources = chargeOuEchec(await executerTravail(demandeDeTraitement(randomUUID(), randomUUID(), { ...charge }))).passages;

  console.log(`\n  paquet  : ${depuisLePaquet.length} passages`);
  console.log(`  sources : ${depuisLesSources.length} passages`);

  if (depuisLePaquet.length !== depuisLesSources.length) {
    console.log("\n  ÉCART : les deux chemins ne rendent pas le même nombre de passages.");
    process.exitCode = 1;
  } else {
    // Le texte, pas seulement le compte : deux chaînes qui rendraient autant de passages et des
    // textes différents seraient le pire des cas.
    const ecarts = depuisLePaquet
      .map((un, rang) => ({ rang, un, autre: depuisLesSources[rang]! }))
      .filter(({ un, autre }) => un.texte !== autre.texte || un.page !== autre.page || un.pageImprimee !== autre.pageImprimee);
    if (ecarts.length === 0) console.log("\n  Le moteur empaqueté lit exactement comme la chaîne : même texte, même page, même numéro imprimé.");
    else {
      console.log(`\n  ÉCART : ${ecarts.length} passage(s) diffèrent. Le premier :`);
      const premier = ecarts[0]!;
      console.log(`    rang ${premier.rang} · paquet  : page ${premier.un.page} « ${premier.un.texte.slice(0, 90)} »`);
      console.log(`    rang ${premier.rang} · sources : page ${premier.autre.page} « ${premier.autre.texte.slice(0, 90)} »`);
      process.exitCode = 1;
    }
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
