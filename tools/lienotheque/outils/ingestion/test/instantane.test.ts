import { describe, expect, it } from "vitest";
import { VueBibliotheque, type LigneInterpretee, type MotsBibliotheque, type SchemaBibliotheque } from "@lienotheque/contrats";
import type { Association } from "@lienotheque/recettes";
import { construireVue, phraseDuLien, type Entree, type MediaIngere } from "../src/index.js";

const MOTS: MotsBibliotheque = {
  element: { un: "clause", plusieurs: "clauses" },
  piste: { un: "plage", plusieurs: "plages" },
  page: { un: "feuillet", plusieurs: "feuillets" },
};

const SCHEMA: SchemaBibliotheque = {
  cle: "recueil",
  nom: "Recueil",
  langue: "fr",
  version: 1,
  axes: [
    {
      cle: "niveau",
      nom: "Niveau",
      nature: "referentiel",
      cardinalite: "une",
      structure: "plat",
      obligatoire: false,
      alias: [],
      valeurs: [
        { cle: "debutant", nom: "Débutant", alias: [], synonymes: [], retiree: false },
        { cle: "ancien", nom: "Ancien", alias: [], synonymes: [], retiree: true },
      ],
    },
  ],
};

const ligne = (numero: number, sur: Partial<LigneInterpretee> = {}): LigneInterpretee => ({
  numero,
  pageImprimee: 100 + Math.floor(numero / 3),
  piste: numero,
  disque: 1,
  sourcePiste: "pastille",
  confiance: 1,
  ...sur,
});

const media = (piste: number): MediaIngere => ({ empreinte: String(piste).padStart(64, "0"), piste, disque: 1, nom: `Plage ${piste}.mp3` });

const entree = (sur: Partial<Entree> = {}): Entree => ({
  id: "recueil",
  nom: "Recueil de procédures",
  schema: SCHEMA,
  mots: MOTS,
  lignes: [ligne(1), ligne(2), ligne(3)],
  association: { appariements: [], orphelins: [], manquants: [] } satisfies Association,
  medias: [media(1), media(2), media(3)],
  seuil: 0.6,
  ...sur,
});

describe("phrase d'un lien (ANC-02)", () => {
  it("dit en français d'où vient la piste, avec les mots de la bibliothèque", () => {
    expect(phraseDuLien(ligne(41), MOTS)).toBe("Repère « plage 41 » lu à côté du numéro");
    expect(phraseDuLien(ligne(41, { sourcePiste: "sequence" }), MOTS)).toMatch(/déduit de la suite/i);
    expect(phraseDuLien(ligne(41, { sourcePiste: "suite" }), MOTS)).toMatch(/reprend la plage/i);
    expect(phraseDuLien(ligne(41, { sourcePiste: "numero_element" }), MOTS)).toMatch(/^Plage et numéro coïncident/);
  });
});

describe("instantané pour les écrans (B5)", () => {
  it("suit le contrat de vue", () => {
    expect(VueBibliotheque.safeParse(construireVue(entree())).success).toBe(true);
  });

  it("groupe les éléments par page, dans l'ordre", () => {
    const vue = construireVue(entree({ lignes: [ligne(5), ligne(1), ligne(9)] }));
    expect(vue.pages.map((page) => page.numero)).toEqual([...vue.pages.map((page) => page.numero)].sort((a, b) => a - b));
    expect(vue.pages.flatMap((page) => page.elements).length).toBe(3);
  });

  it("relie chaque élément à son média, et dit pourquoi", () => {
    const vue = construireVue(entree());
    const element = vue.pages.flatMap((page) => page.elements)[0]!;
    expect(element.media?.nom).toMatch(/^Plage/);
    expect(element.pourquoi?.preuve).toBe("lu");
    expect(element.pourquoi?.phrase).toContain("plage");
  });

  it("laisse sans média ce qui n'a pas de piste, et sans « pourquoi »", () => {
    const { piste: _sans, sourcePiste: _ni, ...sansPiste } = ligne(1);
    const vue = construireVue(entree({ lignes: [sansPiste as LigneInterpretee] }));
    const element = vue.pages[0]!.elements[0]!;
    expect(element.media).toBeUndefined();
    expect(element.pourquoi).toBeUndefined();
  });

  it("met à vérifier ce qui passe sous le seuil de la recette", () => {
    const vue = construireVue(entree({ lignes: [ligne(1, { confiance: 0.4 }), ligne(2)] }));
    expect(vue.aVerifier).toBe(1);
    expect(vue.douteux[0]?.proposition).toBe("clause 1 → plage 1");
    expect(vue.douteux[0]?.element.aVerifier).toBe(true);
  });

  it("tire ses filtres de la nomenclature, sans les valeurs retirées", () => {
    const vue = construireVue(entree());
    expect(vue.filtres).toHaveLength(1);
    expect(vue.filtres[0]?.valeurs.map((valeur) => valeur.cle)).toEqual(["debutant"]);
  });

  it("compte ce qu'il y a, avec les mots de la bibliothèque", () => {
    const vue = construireVue(entree());
    expect(vue.compteurs[0]).toEqual({ nombre: 3, mot: "clauses" });
    expect(vue.compteurs.some((compteur) => compteur.mot === "feuillets")).toBe(true);
  });

  it("ne pose aucune position dans un média : sans segment vérifié, c'est inconnu (ANC-03)", () => {
    const vue = construireVue(entree());
    for (const element of vue.pages.flatMap((page) => page.elements))
      if (element.media !== undefined) expect(element.media.position).toEqual({ segment: "inconnu" });
  });

  it("rejoué, rend exactement le même instantané", () => {
    expect(JSON.stringify(construireVue(entree()))).toBe(JSON.stringify(construireVue(entree())));
  });
});
