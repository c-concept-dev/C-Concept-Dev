import { describe, expect, it } from "vitest";
import { CasDouteux, ElementAffiche, MotsBibliotheque, PageAffichee, VueBibliotheque, ZoneRelative, accorder } from "../src/index.js";

const MOTS = {
  element: { un: "élément", plusieurs: "éléments" },
  piste: { un: "piste", plusieurs: "pistes" },
  page: { un: "page", plusieurs: "pages" },
};

const EMPREINTE = "a".repeat(64);
const ID = "6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a60";

const element = (sur: Record<string, unknown> = {}): unknown => ({
  ancreId: ID,
  numero: "401",
  page: 127,
  zone: { x: 0.1, y: 0.4, l: 0.8, h: 0.12 },
  media: { empreinte: EMPREINTE, nom: "Track 41.mp3", piste: 41, position: { segment: "inconnu" } },
  pourquoi: { preuve: "lu", confiance: 1, phrase: "Repère « Piste 41 » lu à côté du numéro" },
  aVerifier: false,
  ...sur,
});

describe("mots de la bibliothèque (CLA-01)", () => {
  it("porte singulier et pluriel : une interface ne dit pas « 1 éléments »", () => {
    expect(MotsBibliotheque.safeParse(MOTS).success).toBe(true);
    expect(accorder(1, MOTS.element)).toBe("1 élément");
    expect(accorder(2, MOTS.element)).toBe("2 éléments");
    expect(accorder(0, MOTS.piste)).toBe("0 piste");
  });

  it("refuse un mot manquant : aucun écran ne doit inventer le sien", () => {
    const { piste: _sans, ...incomplet } = MOTS;
    expect(MotsBibliotheque.safeParse(incomplet).success).toBe(false);
  });
});

describe("zone d'un élément sur sa page", () => {
  it("se dit en parts de la page : l'affichage ne dépend pas du zoom", () => {
    expect(ZoneRelative.safeParse({ x: 0, y: 0, l: 1, h: 1 }).success).toBe(true);
    expect(ZoneRelative.safeParse({ x: 0, y: 0, l: 1.2, h: 1 }).success).toBe(false);
    expect(ZoneRelative.safeParse({ x: 0, y: 0, l: 0, h: 1 }), "une zone sans largeur n'en est pas une").toMatchObject({ success: false });
  });
});

describe("élément affiché (ANC-02)", () => {
  it("accepte un élément relié, qui dit pourquoi", () => {
    expect(ElementAffiche.safeParse(element()).success).toBe(true);
  });

  it("accepte un élément sans média : beaucoup n'en ont pas", () => {
    const { media: _sans, pourquoi: _ni, ...seul } = element() as Record<string, unknown>;
    expect(ElementAffiche.safeParse(seul).success).toBe(true);
  });

  it("refuse un lien muet, et un « pourquoi » sans lien", () => {
    const { pourquoi: _sans, ...sansPourquoi } = element() as Record<string, unknown>;
    expect(ElementAffiche.safeParse(sansPourquoi).success).toBe(false);
    const { media: _ni, ...sansMedia } = element() as Record<string, unknown>;
    expect(ElementAffiche.safeParse(sansMedia).success).toBe(false);
  });

  it("porte le segment inconnu tel quel : aucune position inventée (ANC-03)", () => {
    const lu = ElementAffiche.parse(element());
    expect(lu.media?.position).toEqual({ segment: "inconnu" });
    const connu = ElementAffiche.parse(
      element({ media: { empreinte: EMPREINTE, nom: "a.mp3", piste: 1, position: { segment: "connu", debut: 2, fin: 40, confiance: 0.9 } } }),
    );
    expect(connu.media?.position).toMatchObject({ segment: "connu", debut: 2 });
  });
});

describe("cas douteux (UX-03, SYN-04, SYN-05)", () => {
  const cas = {
    id: ID,
    nature: "lien",
    etat: "confiance",
    element: element(),
    proposition: "élément 405 → piste 43",
    motif: "repère partiellement lu, déduit de la séquence",
  };

  it("dit sa nature, son état, ce qu'il propose et pourquoi", () => {
    expect(CasDouteux.safeParse(cas).success).toBe(true);
  });

  it("connaît le conflit entre appareils et le rattachement après recalcul", () => {
    for (const etat of ["conflit_appareils", "a_rattacher", "segment_inconnu"])
      expect(CasDouteux.safeParse({ ...cas, etat }).success, etat).toBe(true);
    expect(CasDouteux.safeParse({ ...cas, etat: "bizarre" }).success).toBe(false);
  });

  it("n'admet que les trois natures des filtres de l'écran", () => {
    for (const nature of ["lien", "page", "information"]) expect(CasDouteux.safeParse({ ...cas, nature }).success, nature).toBe(true);
    expect(CasDouteux.safeParse({ ...cas, nature: "autre" }).success).toBe(false);
  });
});

describe("vue d'une bibliothèque (CLA-10)", () => {
  const vue = {
    id: ID,
    nom: "Méthode d'instrument",
    mots: MOTS,
    compteurs: [{ nombre: 412, mot: "éléments" }],
    aVerifier: 9,
    filtres: [{ cle: "niveau", nom: "Niveau", valeurs: [{ cle: "debutant", nom: "Débutant", nombre: 146 }] }],
    pages: [{ numero: 127, elements: [element()], texte: ["une ligne"], traduction: [] }],
    douteux: [],
  };

  it("porte ses pages, ses filtres et ses mots", () => {
    const lue = VueBibliotheque.parse(vue);
    expect(lue.mots.element.plusieurs).toBe("éléments");
    expect(lue.filtres[0]?.valeurs[0]?.nombre).toBe(146);
  });

  it("une page connaît son texte reconnu et sa traduction", () => {
    const page = PageAffichee.parse({ numero: 1, elements: [] });
    expect(page.texte).toEqual([]);
    expect(page.traduction).toEqual([]);
  });

  it("refuse une vue sans mots : aucun écran ne doit inventer son vocabulaire", () => {
    const { mots: _sans, ...sansMots } = vue;
    expect(VueBibliotheque.safeParse(sansMots).success).toBe(false);
  });
});
