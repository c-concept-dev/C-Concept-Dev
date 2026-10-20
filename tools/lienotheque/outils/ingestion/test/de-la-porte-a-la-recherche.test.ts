// @vitest-environment node
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Passage, VueBibliotheque } from "@lienotheque/contrats";
import { chercher } from "@lienotheque/noyau";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "../src/index.js";

/** De la porte à la recherche, par le chemin que l'application emprunte vraiment (RCH-07, BAS-02)
 *
 *  ## Ce que cette épreuve corrige dans ce qu'on croyait
 *
 *  Le 20 octobre 2026, le constat « `enregistrerLeTraitement` n'est appelée par rien dans le
 *  produit » a été tenu pour la preuve que le texte déposé n'arrivait pas à la recherche. Le
 *  constat était juste, **la conclusion était fausse** : le produit a un chemin complet, et il ne
 *  passe pas par le dépôt SQLite.
 *
 *  | | |
 *  |---|---|
 *  | 1 | `executerTravail` rend un instantané, passages compris — la porte, et elle n'écrit rien (JOB-06) |
 *  | 2 | l'hôte écrit cet instantané tel quel et pose le pointeur d'activation (`ecrire_version`, `activer`) |
 *  | 3 | il le relit et sert ses passages (`passages_de_document`) |
 *  | 4 | l'écran cherche dedans avec `chercher`, en mémoire |
 *
 *  Le dépôt SQLite et son index plein texte sont donc un **second magasin, que rien ne lit** — ce
 *  qui est une question ouverte, non un chaînon manquant. Y brancher la porte aurait écrit deux
 *  fois le même texte à deux endroits, et fait écrire le processus annexe, ce que JOB-06 interdit.
 *
 *  ## Pourquoi l'épreuve tient sans l'hôte
 *
 *  Ce que l'hôte fait du résultat est un aller-retour par JSON : il écrit la charge reçue sans la
 *  toucher, la relit, et rend ses passages. On le reproduit ici au caractère près — `JSON.parse`
 *  de ce qui a été rendu, puis les contrats que le pont applique à la relecture
 *  (`VueBibliotheque.parse`, `Passage.parse`). Ce que l'épreuve ne couvre pas, et que couvrent
 *  les épreuves Rust : l'écriture atomique et le pointeur d'activation.
 *
 *  ## Le critère, et ce qui le rend vérifiable
 *
 *  Chaque page de la fixture porte une phrase qu'elle seule porte, et son numéro imprimé. Une
 *  citation retrouvée doit donc tomber sur **la page qui porte réellement ce texte** — et le
 *  document le dit lui-même, sans qu'on ait à le relire par un autre chemin.
 */

const RACINE = join(import.meta.dirname, "../../..");
const NATIF = join(RACINE, "fixtures/fichiers/500-pages.pdf");
const siNatif = existsSync(NATIF) ? it : it.skip;

let dossier = "";

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-porte-"));
});

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

/** Une bibliothèque et une manière de lire, posées sur le disque comme l'hôte les pose.
 *
 *  La manière de lire ne porte **aucune zone d'élément** : un livre ordinaire n'a rien d'autre à
 *  lire que son numéro de page. C'est le cas le plus courant du corpus, et longtemps le seul que
 *  la chaîne ne savait pas servir. */
function lieux(): { description: string; recette: string; medias: string } {
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
        langue: "fr",
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
      preparation: { redressement: "aucun", double_page: false },
      lectures: [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", x: 0.05, y: 0.88, l: 0.3, h: 0.1 }, alphabet: "chiffres" }],
      regles: { elements: { ordre: "strictement_croissant", saut_max: 6 }, plusieurs_elements_par_piste: false },
      validation: { seuil_confiance: 0.6 },
    }),
  );

  const medias = join(dossier, "medias");
  mkdirSync(medias);
  return { description, recette, medias };
}

const PAGES_LUES = 24;

/** Le traitement, puis l'aller-retour que l'hôte fait subir à son résultat. */
async function parLaPorte(): Promise<{ vue: VueBibliotheque; passages: readonly Passage[] }> {
  const charge = chargeOuEchec(
    await executerTravail(demandeDeTraitement(randomUUID(), randomUUID(), { ...lieux(), document: NATIF, pages: PAGES_LUES })),
  );

  const relu = JSON.parse(JSON.stringify(charge)) as { vue: unknown; passages: unknown[] };
  return { vue: VueBibliotheque.parse(relu.vue), passages: relu.passages.map((un) => Passage.parse(un)) };
}

describe("un document traité par la porte se retrouve par la recherche de l'écran", () => {
  siNatif(
    "rend du texte que la recherche retrouve, cité sur la page qui le porte",
    async () => {
      const { vue, passages } = await parLaPorte();
      expect(passages, "la porte n'a rendu aucun texte").not.toHaveLength(0);

      // Une phrase que la dix-septième page est seule à porter, et qu'elle dit elle-même.
      const trouves = chercher(vue, "page 17 sur 500", { passages });
      const pages = trouves.find((groupe) => groupe.genre === "page");
      expect(pages, "la recherche ne rend aucune page").toBeDefined();

      const premier = pages!.resultats[0]!;
      expect(premier.extrait, "l'extrait ne porte pas ce qu'on cherchait").toContain("page 17 sur 500");
      // Le critère : la citation tombe sur la page qui porte réellement ce texte. La fixture
      // imprime son numéro en pied de page, et c'est ce numéro-là qu'une citation annonce.
      expect(premier.page, "la citation ne pointe pas sur la page imprimée qui porte le texte").toBe(17);
      expect(premier.cote).toContain("17");
    },
    300_000,
  );

  siNatif(
    "ne retrouve pas ce que le document ne porte pas",
    async () => {
      // Sans quoi l'épreuve précédente ne prouverait rien : une recherche qui répond toujours
      // répond aussi juste par hasard.
      //
      // Des mots qu'aucune page ne porte, et pas une phrase dont les mots seraient ailleurs : un
      // mot isolé reste une réponse, descendue dans l'ordre mais pas retirée (`chercher`). Une
      // première version demandait l'absence d'une phrase bâtie de mots courants, et prouvait
      // seulement que l'épreuve avait mal lu la recherche.
      const { vue, passages } = await parLaPorte();
      expect(chercher(vue, "zygomatique brouhaha vermiculé", { passages })).toHaveLength(0);
    },
    300_000,
  );
});
