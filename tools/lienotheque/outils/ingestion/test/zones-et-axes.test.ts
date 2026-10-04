import { describe, expect, it } from "vitest";
import { VueBibliotheque, type LigneInterpretee } from "@lienotheque/contrats";
import { construireVue, valeursDePage } from "../src/index.js";
import { SCHEMA, entreeMinimale, ligne, media } from "./aide-instantane.js";

/** Les deux réserves du lot C, levées (B1, CLA-10).
 *
 *  La lecture connaissait la position de chaque repère et le schéma ses axes ; ni l'une ni les
 *  autres n'arrivaient aux écrans. Le Lecteur montrait la vraie page sans ses zones, et le
 *  catalogue des cases sans rien sur quoi comparer. */

const ZONE = { x: 0.08, y: 0.42, l: 0.06, h: 0.03 };

describe("la zone d'un élément va de l'interprétation à l'écran", () => {
  it("se recopie telle quelle sur l'élément affiché", () => {
    const vue = construireVue(entreeMinimale({ lignes: [ligne(1, { zone: ZONE }), ligne(2)] }));
    const elements = vue.pages.flatMap((page) => page.elements);
    expect(elements.find((e) => e.numero === "1")?.zone).toEqual(ZONE);
    expect(elements.find((e) => e.numero === "2")?.zone, "sans lecture de position, pas de zone").toBeUndefined();
  });

  it("suit le contrat de vue avec ses zones", () => {
    const vue = construireVue(entreeMinimale({ lignes: [ligne(1, { zone: ZONE })] }));
    expect(VueBibliotheque.safeParse(vue).success).toBe(true);
  });
});

describe("les valeurs d'axe d'une page (CLA-10)", () => {
  const avecMedia = { ancreId: "a", numero: "1", page: 1, aVerifier: false, media: { empreinte: "0".repeat(64), nom: "x", piste: 1, position: { segment: "inconnu" as const } }, pourquoi: { preuve: "lu" as const, confiance: 1, phrase: "x" } };
  const sansMedia = { ancreId: "b", numero: "2", page: 1, aVerifier: false };

  it("remplit l'axe dont le schéma dit le rôle, et lui seul", () => {
    expect(valeursDePage(SCHEMA, [avecMedia])).toEqual({ ecoute: ["oui"] });
    expect(valeursDePage(SCHEMA, [sansMedia])).toEqual({ ecoute: ["non"] });
  });

  it("ne touche pas aux axes dont elle ignore le sens", () => {
    // « niveau » n'a pas de rôle : l'application ne sait pas ce qu'il désigne, et n'invente rien.
    expect(valeursDePage(SCHEMA, [avecMedia])["niveau"]).toBeUndefined();
  });

  it("suffit d'un élément relié : une page en porte, ou n'en porte pas", () => {
    expect(valeursDePage(SCHEMA, [sansMedia, avecMedia])).toEqual({ ecoute: ["oui"] });
  });

  it("ne remplit rien quand le schéma ne dit pas quelle valeur désigne quoi", () => {
    const muet = { ...SCHEMA, axes: SCHEMA.axes.map((axe) => ({ ...axe, valeurs: axe.valeurs.map(({ roleValeur: _ignore, ...reste }) => reste) })) };
    expect(valeursDePage(muet, [avecMedia])).toEqual({});
  });
});

describe("les filtres comptent ce que les pages portent vraiment", () => {
  const vue = (): VueBibliotheque => {
    const { piste: _sans, sourcePiste: _ni, ...sansPiste } = ligne(2, { pageImprimee: 200 });
    return construireVue(
      entreeMinimale({
        lignes: [ligne(1, { pageImprimee: 100 }), sansPiste as LigneInterpretee],
        medias: [media(1)],
      }),
    );
  };

  it("déclare filtrable l'axe qu'il a pu compter", () => {
    const ecoute = vue().filtres.find((filtre) => filtre.cle === "ecoute");
    expect(ecoute?.filtrable).toBe(true);
    expect(ecoute?.valeurs).toEqual([
      { cle: "oui", nom: "Oui", nombre: 1 },
      { cle: "non", nom: "Non", nombre: 1 },
    ]);
  });

  it("laisse l'autre masqué, et sans comptes inventés", () => {
    const niveau = vue().filtres.find((filtre) => filtre.cle === "niveau");
    expect(niveau?.filtrable).toBe(false);
    expect(niveau?.valeurs.every((valeur) => valeur.nombre === 0)).toBe(true);
  });

  it("ne compte jamais une valeur retirée", () => {
    expect(vue().filtres.find((filtre) => filtre.cle === "niveau")?.valeurs.map((v) => v.cle)).toEqual(["debutant"]);
  });
});
