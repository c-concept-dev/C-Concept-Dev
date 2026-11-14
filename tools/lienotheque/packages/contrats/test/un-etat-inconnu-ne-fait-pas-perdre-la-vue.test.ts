import { describe, expect, it } from "vitest";
import { CasDouteux, EtatDoute, VueBibliotheque } from "../src/index.js";

/** Lot 0x — « une application plus ancienne ne devient jamais aveugle en silence devant des
 *  données plus récentes » (Christophe, 14 novembre 2026).
 *
 *  Ce qui l'a provoqué, mesuré : le paquet installé le 10 novembre refusait la vue entière d'un
 *  document dont la version 4, écrite le 12, portait `relecture_non_faite` — un état ajouté au
 *  contrat le 12 à 10:33. Un mot inconnu, et 116 pages disparaissent de l'écran.
 *
 *  La vue d'ici est **synthétique** : aucune œuvre n'entre dans le dépôt (règle 5). Elle n'a pas
 *  besoin d'être la vraie pour éprouver la bonne chose — ce qui compte est qu'un `etat` que ce
 *  contrat ne connaît pas voyage avec elle.
 *
 *  Deux ancres, et elles sont dans les documents du projet avant d'être dans ce fichier :
 *  **HER-06** — « toute valeur existante conservée, même hors liste » ; et le **§ 3.5** du cahier
 *  — « l'abstention dit toujours sa vraie cause », « "je n'ai pas fini de regarder" ne doit
 *  jamais s'afficher comme "rien ne numérote" ». Le défaut du 14 novembre est cette doctrine
 *  retournée contre l'écran : « je ne sais pas lire cette version » s'est affiché comme « cette
 *  bibliothèque est vide ». */

const MOTS = {
  element: { un: "élément", plusieurs: "éléments" },
  piste: { un: "piste", plusieurs: "pistes" },
  page: { un: "page", plusieurs: "pages" },
};

const ID = "6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a60";
const AUTRE_ID = "6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a61";

/** Un état que ce contrat ne connaît pas, et ne doit pas prétendre connaître. C'est la forme
 *  exacte de ce qui est arrivé : un code plus récent a écrit un mot que celui-ci n'a jamais lu. */
const ETAT_PLUS_RECENT = "une_cause_que_ce_contrat_n_a_jamais_lue";

const vue = (etat: string): unknown => ({
  id: ID,
  nom: "Document d'essai",
  mots: MOTS,
  compteurs: [{ nombre: 2, mot: "éléments" }],
  aVerifier: 1,
  filtres: [{ cle: "etat", nom: "État", valeurs: [{ cle: "valide", nom: "Validé", nombre: 3 }] }],
  pages: [
    { index: 1, numero: 1, elements: [], texte: ["une ligne"], traduction: [] },
    { index: 2, numero: 2, elements: [], texte: [], traduction: [] },
    { index: 3, numero: 3, elements: [], texte: [], traduction: [] },
  ],
  douteux: [
    {
      id: ID,
      nature: "information",
      etat: "media_orphelin",
      libelle: "Piste 22",
      proposition: "Rien à faire : aucun élément ne la réclame",
      motif: "Aucun élément ne pointe vers cette piste",
    },
    {
      id: AUTRE_ID,
      nature: "information",
      etat,
      libelle: "Page 4, rangée 10, colonne 1",
      proposition: "Un œil tranche mieux qu'une règle",
      motif: "Écrit par un code plus récent que ce contrat",
    },
  ],
});

describe("un état inconnu ne fait pas perdre la vue (lot 0x, HER-06, § 3.5)", () => {
  it("lit la vue entière, et garde ses pages, quand un cas douteux porte un état inconnu", () => {
    const lue = VueBibliotheque.safeParse(vue(ETAT_PLUS_RECENT));

    expect(
      lue.success,
      `refusée : ${lue.success ? "" : JSON.stringify(lue.error.issues.map((un) => un.path.join(".")))}`,
    ).toBe(true);
    // C'est ce chiffre qui a disparu de l'écran de Christophe : les pages étaient là, le contrat
    // les a jetées avec le reste pour un seul mot.
    expect(lue.success && lue.data.pages).toHaveLength(3);
    expect(lue.success && lue.data.douteux).toHaveLength(2);
  });

  it("conserve l'état inconnu au lieu de l'effacer ou de le remplacer (HER-06)", () => {
    const lue = VueBibliotheque.parse(vue(ETAT_PLUS_RECENT));
    const inconnu = lue.douteux[1]?.etat;

    // Ni jeté, ni rangé d'office parmi les états connus : la valeur reçue reste lisible, et se
    // distingue de celles que ce contrat sait nommer.
    expect(inconnu).toEqual({ inconnu: ETAT_PLUS_RECENT });
    expect(EtatDoute.options).not.toContain(ETAT_PLUS_RECENT);
  });

  it("laisse un état connu exactement comme avant : la tolérance ne relâche pas le reste", () => {
    const lue = VueBibliotheque.parse(vue("relecture_non_faite"));

    expect(lue.douteux[0]?.etat).toBe("media_orphelin");
    expect(lue.douteux[1]?.etat).toBe("relecture_non_faite");
  });

  it("refuse toujours ce qui n'est pas un état du tout : un objet, un nombre, le vide", () => {
    for (const absurde of [{}, 4, "", null, [], { inconnu: "" }]) {
      const lu = CasDouteux.safeParse({
        id: ID,
        nature: "information",
        etat: absurde,
        libelle: "Quelque chose",
        proposition: "Rien",
        motif: "Rien",
      });
      expect(lu.success, `accepté à tort : ${JSON.stringify(absurde)}`).toBe(false);
    }
  });
});
