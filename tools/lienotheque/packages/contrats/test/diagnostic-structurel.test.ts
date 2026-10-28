import { describe, expect, it } from "vitest";
import {
  DemandeDiagnosticStructurel,
  ModeleStructurelPropose,
  ModeleStructurelValide,
  ReponseDiagnosticStructurel,
  diagnosticRepondA,
  DemandeValidationCibles,
  ReponseValidationCibles,
  validationCiblesRepondA,
} from "../src/index.js";

const DOCUMENT = "a".repeat(64);
const page = (numero: number) => ({
  numero,
  empreinte: String(numero).padStart(64, "b"),
  image: "AAAA",
  typeMime: "image/webp" as const,
  largeur: 1200,
  hauteur: 1800,
});

const lecture = (id: string, nature: "page_imprimee" | "element" | "repere" | "exclusion") => ({
  id,
  nature,
  zone: { x: 0.02, y: 0.05, l: 0.16, h: 0.88 },
  repetition: nature === "page_imprimee" ? ("fixe" as const) : ("verticale" as const),
  forme: nature === "repere" ? ("losange" as const) : ("rectangle" as const),
  alphabet: "chiffres" as const,
  exemple: nature === "element" ? "5.19" : "12",
  confiance: 0.9,
  observations: [
    { page: 7, zone: { x: 0.03, y: 0.2, l: 0.06, h: 0.025 } },
    { page: 19, zone: { x: 0.031, y: 0.62, l: 0.061, h: 0.026 } },
  ],
});

const modele = () => ({
  etat: "propose" as const,
  document: DOCUMENT,
  pagesObservees: [7, 19],
  geometrie: { orientation: "portrait" as const, doublePage: false },
  lectures: [lecture("page", "page_imprimee"), lecture("numero", "element"), lecture("marque", "repere")],
  relations: [{ de: "marque", vers: "numero", position: "droite" as const }],
  inconnues: [],
});

describe("contrat du diagnostic structurel (REC-01, règle 2)", () => {
  it("accepte un échantillon initial de deux ou trois pages et son extension bornée à huit", () => {
    expect(DemandeDiagnosticStructurel.safeParse({ document: DOCUMENT, pages: [page(7), page(19)] }).success).toBe(true);
    expect(DemandeDiagnosticStructurel.safeParse({ document: DOCUMENT, pages: [page(7), page(19), page(31)] }).success).toBe(true);
    expect(
      DemandeDiagnosticStructurel.safeParse({ document: DOCUMENT, pages: [7, 19, 31, 42, 53, 64, 75, 86].map(page) }).success,
    ).toBe(true);
    expect(DemandeDiagnosticStructurel.safeParse({ document: DOCUMENT, pages: [page(7)] }).success).toBe(false);
    expect(
      DemandeDiagnosticStructurel.safeParse({ document: DOCUMENT, pages: [7, 19, 31, 42, 53, 64, 75, 86, 95].map(page) }).success,
    ).toBe(false);
  });

  it("refuse une zone qui sort de la page ou prétend couvrir la page entière", () => {
    const horsPage = modele();
    horsPage.lectures[0]!.zone = { x: 0.8, y: 0.1, l: 0.3, h: 0.2 };
    expect(ModeleStructurelPropose.safeParse(horsPage).success).toBe(false);

    const touteLaPage = modele();
    touteLaPage.lectures[0]!.zone = { x: 0, y: 0, l: 1, h: 1 };
    expect(ModeleStructurelPropose.safeParse(touteLaPage).success).toBe(false);
  });

  it("refuse une forme inconnue, une preuve prise hors échantillon et deux identifiants identiques", () => {
    const forme = structuredClone(modele()) as Record<string, any>;
    forme.lectures[0].forme = "triangle-magique";
    expect(ModeleStructurelPropose.safeParse(forme).success).toBe(false);

    const preuve = modele();
    preuve.lectures[0]!.observations[0]!.page = 99;
    expect(ModeleStructurelPropose.safeParse(preuve).success).toBe(false);

    const double = modele();
    double.lectures[1]!.id = double.lectures[0]!.id;
    expect(ModeleStructurelPropose.safeParse(double).success).toBe(false);
  });

  it("une proposition n'est jamais exécutable sans pages témoins distinctes", () => {
    expect(ModeleStructurelValide.safeParse(modele()).success).toBe(false);
    expect(
      ModeleStructurelValide.safeParse({
        ...modele(),
        etat: "valide",
        validation: { pagesTemoins: [31, 42], ecarts: [], superpositionsApprouvees: true },
      }).success,
    ).toBe(true);
    expect(
      ModeleStructurelValide.safeParse({
        ...modele(),
        etat: "valide",
        validation: { pagesTemoins: [19], ecarts: [], superpositionsApprouvees: true },
      }).success,
    ).toBe(false);
  });

  it("recoupe document et pages avant d'accepter la réponse", () => {
    const demande = DemandeDiagnosticStructurel.parse({ document: DOCUMENT, pages: [page(7), page(19)] });
    const reponse = ReponseDiagnosticStructurel.parse({
      modele: modele(),
      jetons: { entree: 100, sortie: 40 },
      outil: { nom: "diagnostic-structurel", version: "0.1.0" },
    });
    expect(diagnosticRepondA(demande, reponse)).toEqual([]);
    expect(
      diagnosticRepondA(
        demande,
        ReponseDiagnosticStructurel.parse({ ...reponse, modele: { ...modele(), document: "c".repeat(64) } }),
      ),
    ).toContain("le document rendu n'est pas le document demandé");
  });
});

describe("repli ciblé d'un diagnostic structurel", () => {
  it("borne les pages et exige une réponse exacte pour chaque cible", () => {
    const cible = DemandeValidationCibles.parse({
      document: "a".repeat(64),
      pages: [page(7), page(8)],
      cibles: ["5.17", "5.24"],
    });
    const reponse = ReponseValidationCibles.parse({
      document: cible.document,
      resultats: [
        { cible: "5.17", etat: "trouve", page: 7, zone: { x: 0.03, y: 0.7, l: 0.05, h: 0.02 }, confiance: 0.99 },
        { cible: "5.24", etat: "incertain", confiance: 0.4 },
      ],
      jetons: { entree: 10, sortie: 4 },
      outil: { nom: "validation-cibles-structurelles", version: "0.1.0" },
    });
    expect(validationCiblesRepondA(cible, reponse)).toEqual([]);
    expect(validationCiblesRepondA(cible, { ...reponse, resultats: reponse.resultats.slice(0, 1) })).toContain(
      "les cibles rendues ne sont pas les cibles demandées",
    );
  });

  it("refuse une cible trouvée sur une page qui n'a pas été transmise", () => {
    const cible = DemandeValidationCibles.parse({ document: "a".repeat(64), pages: [page(7)], cibles: ["5.17"] });
    const reponse = ReponseValidationCibles.parse({
      document: cible.document,
      resultats: [{ cible: "5.17", etat: "trouve", page: 99, zone: { x: 0.03, y: 0.7, l: 0.05, h: 0.02 }, confiance: 0.99 }],
      jetons: { entree: 10, sortie: 4 },
      outil: { nom: "validation-cibles-structurelles", version: "0.1.0" },
    });
    expect(validationCiblesRepondA(cible, reponse).join(" ")).toMatch(/page non transmise/);
  });
});
