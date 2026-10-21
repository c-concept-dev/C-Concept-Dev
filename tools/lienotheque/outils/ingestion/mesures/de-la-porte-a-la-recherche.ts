/** De la porte à la recherche, sur un vrai document — le critère du troisième bloquant (BAS-02)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx \
 *        mesures/de-la-porte-a-la-recherche.ts <document> [langue] [pages]
 *
 *  ## En quoi il diffère de `du-depot-a-la-recherche.ts`
 *
 *  Celui-là appelait `enregistrerLeTraitement` lui-même, et prouvait donc le mécanisme. Celui-ci
 *  **n'appelle que ce que l'application appelle** :
 *
 *  | | |
 *  |---|---|
 *  | 1 | `executerTravail` — la porte du processus annexe, qui n'écrit rien (JOB-06) |
 *  | 2 | l'aller-retour JSON que l'hôte fait subir au résultat qu'il écrit, puis relit |
 *  | 3 | `chercher`, la fonction même que l'écran de recherche appelle |
 *
 *  C'est la seule façon de savoir si la porte est ouverte, et non si le mécanisme derrière elle
 *  fonctionne. Et c'est ce chemin-là, non le dépôt SQLite, que le produit emprunte : le dépôt et
 *  son index plein texte ne sont lus par rien dans l'application (relevé le 20 octobre 2026).
 *
 *  ## Comment la vérification évite de tourner en rond
 *
 *  La phrase retrouvée est cherchée **une seconde fois dans le document d'origine**, par
 *  `lireCoucheTexte` seul : sans coupe de feuille, sans arbitrage entre couche et reconnaissance,
 *  sans vote de décalage. Si les deux chemins s'accordent sur le rang de la page, la citation est
 *  vérifiable. Sur un document dont le texte vient de la reconnaissance, cette vérification-ci ne
 *  s'applique pas — il faut un œil sur l'image, et `citations-a-verifier.ts` le prépare.
 *
 *  ## Ce qu'il ne fait pas
 *
 *  Aucune œuvre n'entre au dépôt (règle 5) : le document est un argument, la bibliothèque est
 *  temporaire et effacée à la fin. Rien n'est publié, aucune ressource d'hébergement n'est touchée.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Passage, VueBibliotheque } from "@lienotheque/contrats";
import { ouvrirCache } from "@lienotheque/cache";
import { chercher } from "@lienotheque/noyau";
import { lireCoucheTexte } from "@lienotheque/lecteur-texte";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "../src/index.js";

const [chemin, langue = "fr", limite] = process.argv.slice(2);
if (chemin === undefined) {
  console.error("Attendu : <document> [langue de la bibliothèque] [nombre de pages]");
  process.exit(2);
}
if (!existsSync(chemin)) {
  console.error(`Introuvable : ${chemin}`);
  process.exit(2);
}

const dossier = mkdtempSync(join(tmpdir(), "lienotheque-porte-"));
const medias = join(dossier, "medias");
mkdirSync(medias);
// Les images de pages, parce que **l'hôte en demande toujours** (`charge_de`). Les omettre
// faisait diverger ce banc de l'application sur le point précis qu'il prétend éprouver.
const images = join(dossier, "images");
mkdirSync(images);

const description = join(dossier, "bibliotheque.json");
writeFileSync(
  description,
  JSON.stringify({
    id: "essai-de-la-porte",
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

// Une manière de lire sans zone d'élément : un livre ordinaire n'a que son numéro de page à lire.
const recette = join(dossier, "maniere.json");
writeFileSync(
  recette,
  JSON.stringify({
    id: "livre-ordinaire",
    version: 1,
    derivee_de: null,
    // Rien sur la double page : c'est au document de répondre, comme pour une manière de lire
    // qu'un administrateur n'a pas réglée. La déclarer ici ferait diverger le banc de l'application.
    preparation: { redressement: "aucun" },
    lectures: [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", x: 0.05, y: 0.86, l: 0.9, h: 0.12 }, alphabet: "chiffres" }],
    regles: { elements: { ordre: "strictement_croissant", saut_max: 12 }, plusieurs_elements_par_piste: false },
    validation: { seuil_confiance: 0.6 },
  }),
);

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });

try {
  // 1. Le traitement, par la porte, et rien qu'elle.
  const depart = Date.now();
  const message = await executerTravail(
    demandeDeTraitement(randomUUID(), randomUUID(), {
      document: chemin,
      medias,
      recette,
      description,
      images,
      cache: cache.dossier,
      ...(limite === undefined ? {} : { pages: Number(limite) }),
    }),
    { emettre: (m) => (m.type === "journal" ? console.log(`  journal · ${m.texte}`) : undefined) },
  );
  const charge = chargeOuEchec(message);
  console.log(`\n  traité en ${((Date.now() - depart) / 1000).toFixed(0)} s`);

  // 2. L'aller-retour que l'hôte fait subir au résultat : il écrit ce qu'il a reçu, le relit, et
  //    sert ses passages. Les contrats sont appliqués à la relecture, comme le pont les applique.
  const relu = JSON.parse(JSON.stringify(charge)) as { vue: unknown; passages: unknown[] };
  const vue = VueBibliotheque.parse(relu.vue);
  const passages = relu.passages.map((un) => Passage.parse(un));
  console.log(`  l'hôte rendrait : ${vue.pages.length} pages dans la vue, ${passages.length} passages`);
  if (passages.length === 0) throw new Error("Aucun passage : il n'y a rien à chercher.");

  // 3. Une phrase que ce livre est seul à porter, prise au milieu et **contiguë** : des mots qui
  //    ne se suivent pas ne forment pas une phrase, et la chercher ne prouverait rien.
  const auMilieu = passages[Math.floor(passages.length / 2)]!;
  const tous = auMilieu.texte.split(/\s+/).filter((mot) => mot !== "");
  const debut = tous.findIndex((mot, rang) => rang > tous.length / 3 && /^[\p{L}]{6,}$/u.test(mot));
  const phrase = debut < 0 ? "" : tous.slice(debut, debut + 5).join(" ");
  if (phrase === "") throw new Error("Ce document ne porte pas assez de mots pour une recherche.");

  // 4. La recherche de l'écran, sur ce que l'hôte lui sert.
  const groupes = chercher(vue, phrase, { passages });
  const pages = groupes.find((groupe) => groupe.genre === "page");
  console.log(`\n  recherche « ${phrase} »`);
  if (pages === undefined || pages.resultats.length === 0) throw new Error("La recherche ne retrouve pas un texte qu'elle vient de recevoir.");
  const premier = pages.resultats[0]!;
  console.log(`  la recherche dit : ${premier.cote}`);
  console.log(`  son extrait : …${premier.extrait ?? ""}…`);

  // 5. **La vérification** : la même phrase, cherchée dans le document par un autre chemin.
  const rangsReels = (await lireCoucheTexte(chemin)).pages
    .map((page, rang) => ({ rang: rang + 1, texte: page.mots.map((mot) => mot.texte).join(" ") }))
    .filter((page) => page.texte.includes(phrase))
    .map((page) => page.rang);
  const porteur = passages.find((passage) => passage.texte.includes(phrase));
  console.log(
    `  le document la porte : page(s) ${rangsReels.join(", ") || "aucune"} en rang ; ` +
      `le passage déposé dit rang ${porteur?.page ?? "?"}` +
      `${porteur?.pageImprimee === undefined ? ", sans numéro imprimé" : `, numéro imprimé ${porteur.pageImprimee}`}`,
  );

  const juste = porteur !== undefined && rangsReels.includes(porteur.page);
  console.log(
    `\n  ${juste ? "La citation pointe sur la page où le texte est imprimé." : "ÉCART : la citation ne pointe pas sur la bonne page."}`,
  );
  if (!juste) process.exitCode = 1;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
