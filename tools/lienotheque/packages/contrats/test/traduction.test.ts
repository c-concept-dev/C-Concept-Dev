import { describe, expect, it } from "vitest";
import { DemandeTraductionPage, TraductionDePage } from "../src/traduction.js";

const VERSION = "01932f4e-7a1b-7c3d-8e5f-00000000c001";

describe("traduction d'une page à la demande (OUT-11)", () => {
  it("borne la demande à une version et une page, sans accepter de texte fourni par le navigateur", () => {
    expect(DemandeTraductionPage.parse({ version: VERSION, page: 7 })).toEqual({ version: VERSION, page: 7 });
    expect(() => DemandeTraductionPage.parse({ version: VERSION, page: 7, texte: "texte substitué" })).toThrow();
    expect(() => DemandeTraductionPage.parse({ version: VERSION, page: 0 })).toThrow();
  });

  it("distingue une traduction automatique d'une page déjà française", () => {
    expect(
      TraductionDePage.parse({
        etat: "traduite",
        page: 7,
        langueSource: "en",
        langueCible: "fr",
        traduction: ["Un texte traduit."],
        automatique: true,
        cache: "cree",
        modele: "@cf/meta/m2m100-1.2b",
      }),
    ).toMatchObject({ etat: "traduite", automatique: true });
    expect(
      TraductionDePage.parse({
        etat: "deja_en_francais",
        page: 7,
        langueSource: "fr",
        langueCible: "fr",
        traduction: [],
        automatique: false,
        cache: "inutile",
      }),
    ).toMatchObject({ etat: "deja_en_francais", automatique: false });
  });
});
