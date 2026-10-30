// @vitest-environment node
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChargeTraitement, chargeOuEchec, demandeDeTraitement, executerTravail } from "../src/index.js";

/** Ce que la manière de lire transmet à la lecture, éprouvé **par la porte** (REC-01, JOB-05)
 *
 *  ## Pourquoi ces épreuves existent
 *
 *  Trois fois en deux jours, un mécanisme juste s'est révélé inatteignable depuis la porte que
 *  l'application franchit : le dépôt des passages, le texte des documents sans image, et la
 *  détection de la double page. À chaque fois, des épreuves vertes au-dessus — sur la fonction
 *  elle-même — et rien qui franchisse `executerTravail`.
 *
 *  Le troisième cas est le plus net. `lireLeTexte` décide
 *  `options.doublePage ?? détection`, et la chaîne lui passait toujours
 *  `recette.preparation.double_page`, booléen obligatoire au contrat : le `??` ne tombait jamais.
 *  **Aucune épreuve de la détection ne pouvait le voir**, puisqu'aucune ne passait par la chaîne.
 *
 *  D'où ce fichier, et le garde-fou de `packages/banc` qui exige qu'il reste peuplé : toute option
 *  que la chaîne transmet à la lecture doit être nommée dans une épreuve qui franchit la porte.
 */

const RACINE = join(import.meta.dirname, "../../..");
const NATIF = join(RACINE, "fixtures/fichiers/500-pages.pdf");
const siNatif = existsSync(NATIF) ? it : it.skip;

let dossier = "";

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-transmet-"));
});

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

/** Les lieux d'une bibliothèque d'essai. `langue` est celle que son schéma déclare, et
 *  `doublePage` ce que sa manière de lire dit — ou tait. */
function lieux(options: { langue?: string; doublePage?: boolean } = {}): {
  description: string;
  recette: string;
  medias: string;
} {
  const description = join(dossier, "bibliotheque.json");
  writeFileSync(
    description,
    JSON.stringify({
      id: "essai-de-transmission",
      nom: "Essai",
      mots: {
        element: { un: "élément", plusieurs: "éléments" },
        piste: { un: "piste", plusieurs: "pistes" },
        page: { un: "page", plusieurs: "pages" },
      },
      schema: {
        cle: "essai",
        nom: "Essai",
        langue: options.langue ?? "fr",
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
      preparation: {
        redressement: "aucun",
        ...(options.doublePage === undefined ? {} : { double_page: options.doublePage }),
      },
      lectures: [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", x: 0.05, y: 0.88, l: 0.3, h: 0.1 }, alphabet: "chiffres" }],
      regles: { elements: { ordre: "strictement_croissant", saut_max: 6 }, plusieurs_elements_par_piste: false },
      validation: { seuil_confiance: 0.6 },
    }),
  );

  const medias = join(dossier, "medias");
  mkdirSync(medias);
  return { description, recette, medias };
}

const PAGES_LUES = 20;

async function parLaPorte(options: { langue?: string; doublePage?: boolean } = {}): Promise<{
  passages: number;
  journal: readonly string[];
}> {
  const journal: string[] = [];
  const message = await executerTravail(
    demandeDeTraitement(randomUUID(), randomUUID(), { ...lieux(options), document: NATIF, pages: PAGES_LUES }),
    {
      emettre: (un) => {
        if (un.type === "journal") journal.push(un.texte);
      },
    },
  );
  return { passages: chargeOuEchec(message).passages.length, journal };
}

/** La charge que l'hôte envoie franchit-elle la porte ? (JOB-01, JOB-05, PLT-02)
 *
 *  Quatrième cas de la même famille, et le plus coûteux : le 30 octobre 2026, l'hôte a appris à
 *  partir **sans manière de lire** — c'est la seconde voie, et 248 documents sur 250 de la
 *  bibliothèque réelle l'attendaient. Il a appris le même jour à dire si quelqu'un a vérifié ce
 *  document. Les deux sont écrits, éprouvés côté hôte, et **le contrat de la porte n'a bougé ni
 *  pour l'un ni pour l'autre**. Résultat mesuré sur la vraie application : aucun document ne
 *  passe, avec ou sans manière de lire — « recette » est en cause, et `verifieParUnHumain` est
 *  une clé que le contrat strict ne connaît pas. Les travaux meurent en échec définitif à la
 *  porte, sans qu'une seule page soit lue.
 *
 *  Le contrat se modifie avant le code (règle 2) : il ne l'avait pas été.
 *
 *  `fixtures/charge-de-l-hote.json` tient les deux bouts. L'hôte a son épreuve Rust qui vérifie
 *  que la charge qu'il construit porte **exactement** ces champs ; celle-ci vérifie que la porte
 *  les accepte. Changer l'un sans l'autre rougit l'une des deux.
 */
describe("la charge que l'hôte envoie franchit la porte (JOB-01, PLT-02)", () => {
  const variantes = JSON.parse(readFileSync(join(RACINE, "fixtures/charge-de-l-hote.json"), "utf8")) as Record<
    string,
    unknown
  >;

  for (const [quoi, charge] of Object.entries(variantes)) {
    it(`l'accepte : ${quoi}`, () => {
      const lue = ChargeTraitement.safeParse(charge);
      const refus = lue.success
        ? ""
        : lue.error.issues.map((souci) => `« ${souci.path.join(".") || "la charge entière"} » : ${souci.message}`).join(" · ");
      expect(refus, "la porte refuse ce que l'hôte envoie").toBe("");
    });
  }

  it("prend la seconde voie quand aucune manière de lire n'est annoncée (REC-01)", () => {
    const lue = ChargeTraitement.parse(variantes["sansManiereDeLire"]);
    expect(lue.recette ?? undefined, "sans manière de lire, la chaîne ne doit pas en charger une").toBeUndefined();
  });

  it("jette la vérification humaine à la porte plutôt que de la transmettre (REC-02)", () => {
    const lue = ChargeTraitement.parse(variantes["avecManiereDeLire"]) as Record<string, unknown>;
    expect(
      "verifieParUnHumain" in lue && lue["verifieParUnHumain"] !== undefined,
      "une vérification enregistrée porte sur des liens vus, jamais sur une lecture neuve",
    ).toBe(false);
  });
});

describe("la double page passe par la porte, déclarée ou tue (REC-01)", () => {
  siNatif(
    "une manière de lire qui ne déclare rien laisse le document répondre",
    async () => {
      // La fixture est un livre ordinaire, une page par feuille : le document répond « non », et
      // ses pages ne sont pas coupées. Ce que cela éprouve n'est pas la réponse — elle est
      // connue — mais que **la question soit posée** : la chaîne a cessé de trancher à sa place.
      expect((await parLaPorte()).passages).toBe(PAGES_LUES);
    },
    300_000,
  );

  siNatif(
    "une manière de lire qui déclare la double page l'emporte, et la coupe a lieu",
    async () => {
      // La déclaration fait autorité, y compris contre le document : c'est elle qui permet de
      // forcer la main à une détection qui se tromperait. Chaque feuille devient deux pages.
      expect((await parLaPorte({ doublePage: true })).passages).toBe(PAGES_LUES * 2);
    },
    300_000,
  );

  siNatif(
    "une déclaration contraire est obéie elle aussi : un faux n'est pas un silence",
    async () => {
      expect((await parLaPorte({ doublePage: false })).passages).toBe(PAGES_LUES);
    },
    300_000,
  );
});

describe("la langue de la bibliothèque arrive à la reconnaissance (OUT-05)", () => {
  siNatif(
    "dit au journal qu'une langue lui est inconnue, au lieu de la remplacer en silence",
    async () => {
      // Le défaut du 20 octobre : faute de langue, la reconnaissance partait sur l'anglais et un
      // accent sur six se perdait sur un corpus français. Une langue qu'on ne sait pas servir doit
      // donc **se dire** — et c'est par la porte qu'on vérifie qu'elle se dit.
      const { journal } = await parLaPorte({ langue: "xx" });
      expect(journal.join(" · ")).toMatch(/langue .* inconnue/i);
    },
    300_000,
  );

  siNatif(
    "et ne dit rien quand elle la connaît",
    async () => {
      expect((await parLaPorte({ langue: "fr" })).journal.join(" · ")).not.toMatch(/inconnue/i);
    },
    300_000,
  );
});
