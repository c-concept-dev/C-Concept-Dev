// @vitest-environment node
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const doubles = vi.hoisted(() => ({
  exporterPages: vi.fn(),
  lireLeTexte: vi.fn(),
  rejouer: vi.fn(),
  rejouerParOracle: vi.fn(),
  construireVue: vi.fn(),
}));

vi.mock("../src/pages-images.js", async (importe) => ({
  ...(await importe<typeof import("../src/pages-images.js")>()),
  exporterPages: doubles.exporterPages,
}));
vi.mock("../src/texte.js", () => ({ lireLeTexte: doubles.lireLeTexte }));
vi.mock("../src/instantane.js", () => ({ construireVue: doubles.construireVue }));
vi.mock("@lienotheque/recettes", async (importe) => {
  const vrai = await importe<typeof import("@lienotheque/recettes")>();
  return { ...vrai, rejouer: doubles.rejouer };
});
vi.mock("../src/voie-oracle.js", async (importe) => ({
  ...(await importe<typeof import("../src/voie-oracle.js")>()),
  rejouerParOracle: doubles.rejouerParOracle,
}));

import { demandeDeTraitement, executerTravail } from "../src/executant.js";
import { instantaneDeLot } from "../src/lot.js";
import { ErreurExportPagesVide } from "../src/pages-images.js";

const RACINE = join(import.meta.dirname, "../../..");
const DESCRIPTION = join(RACINE, "fixtures/bibliotheques/F3.json");
const RECETTE = join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json");

describe("un dérivé ne détruit jamais un texte déjà lu", () => {
  beforeEach(() => {
    // Les épreuves changent aussi l'ordre des appels. Une implémentation ponctuelle qui n'est pas
    // consommée parce qu'un appel arrive trop tard ne doit jamais contaminer l'épreuve suivante.
    vi.resetAllMocks();
    doubles.rejouer.mockResolvedValue({
      resultat: { pages: [], lignes: [], pagesAbsentes: [] },
      association: { appariements: [], manquants: [], orphelins: [] },
      medias: [],
    });
    doubles.rejouerParOracle.mockResolvedValue({
      resultat: { pages: [], lignes: [], pagesAbsentes: [] },
      association: { appariements: [], manquants: [], orphelins: [] },
      medias: [],
      journal: [],
    });
    doubles.construireVue.mockReturnValue({ id: "f3", nom: "F3", pages: [], aVerifier: 0 });
    doubles.lireLeTexte.mockImplementation(async (_pdf: string, options: { surAvertissement?: (message: string) => void }) => {
      options.surAvertissement?.("JPEG incomplet ; rendu complet essayé");
      return {
        pages: [{ index: 1, texte: "Un texte intact et cherchable.", source: "couche_texte", mots: [] }],
        doublePage: false,
        foliosEtablis: false,
        parLaCouche: 1,
        parOcr: 0,
        sansTexte: 0,
      };
    });
  });

  it("REC-02 — lit le texte avant l'oracle et lui transmet cette lecture", async () => {
    const ordre: string[] = [];
    doubles.lireLeTexte.mockImplementationOnce(async () => {
      ordre.push("texte");
      return {
        pages: [{ index: 1, pageImprimee: 17, texte: "Un intitulé distinctif.", source: "couche_texte", mots: [] }],
        doublePage: true,
        foliosEtablis: true,
        parLaCouche: 1,
        parOcr: 0,
        sansTexte: 0,
      };
    });
    doubles.rejouerParOracle.mockImplementationOnce(async (_pdf, _medias, options) => {
      ordre.push("oracle");
      expect(options.texteDesPages).toEqual([
        { page: 1, pageImprimee: 17, texte: "Un intitulé distinctif.", mots: [] },
      ]);
      expect(options.doublePage).toBe(true);
      expect(options.foliosEtablis).toBe(true);
      return {
        resultat: { pages: [], lignes: [], pagesAbsentes: [] },
        association: { appariements: [], manquants: [], orphelins: [] },
        medias: [],
        journal: [],
      };
    });

    await instantaneDeLot({
      pdf: join(RACINE, "fixtures/fichiers/inexistant-mais-double.pdf"),
      medias: RACINE,
      description: DESCRIPTION,
    });

    expect(ordre).toEqual(["texte", "oracle"]);
  });

  it("rend les passages même si l'export de la page échoue", async () => {
    expect(existsSync(DESCRIPTION) && existsSync(RECETTE)).toBe(true);
    doubles.exporterPages.mockRejectedValue(new Error("JPEG invalide : fin prématurée du flux"));

    const traite = await instantaneDeLot({
      pdf: join(RACINE, "fixtures/fichiers/inexistant-mais-double.pdf"),
      medias: RACINE,
      recette: RECETTE,
      description: DESCRIPTION,
      images: join(RACINE, ".cache-images-test"),
    });

    expect(traite.passages).toHaveLength(1);
    expect(traite.passages[0]?.texte).toContain("intact");
  });

  it("OUT-04 — ne transforme pas zéro page exportée en traitement réussi", async () => {
    doubles.exporterPages.mockRejectedValue(new ErreurExportPagesVide(12, 0));

    await expect(
      instantaneDeLot({
        pdf: join(RACINE, "fixtures/fichiers/inexistant-mais-double.pdf"),
        medias: RACINE,
        recette: RECETTE,
        description: DESCRIPTION,
        images: join(RACINE, ".cache-images-test"),
      }),
    ).rejects.toThrow(/aucune page exploitable/i);
  });

  it("rend accessibles les pages du PDF ordinaire même sans repère métier", async () => {
    doubles.lireLeTexte.mockResolvedValueOnce({
      pages: [{ index: 1, texte: "Première page logique.", source: "ocr", mots: [] }],
      doublePage: true,
      foliosEtablis: false,
      parLaCouche: 0,
      parOcr: 1,
      sansTexte: 0,
    });
    doubles.exporterPages.mockResolvedValue({
      pages: [{ index: 0, fichier: "page-0000.webp", largeur: 800, hauteur: 1200, vignette: "vignette-0000.webp" }],
      refusees: [],
    });

    await instantaneDeLot({
      pdf: join(RACINE, "fixtures/fichiers/inexistant-mais-double.pdf"),
      medias: RACINE,
      recette: RECETTE,
      description: DESCRIPTION,
      images: join(RACINE, ".cache-images-test"),
    });

    expect(doubles.construireVue).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: [{ index: 1 }],
        imageDePage: expect.any(Function),
      }),
    );
    const entree = doubles.construireVue.mock.calls[0]?.[0] as { imageDePage?: (rang: number) => unknown };
    expect(entree.imageDePage?.(1)).toEqual(
      expect.objectContaining({ image: "/donnees/pages/page-0000.webp", vignette: "/donnees/pages/vignette-0000.webp" }),
    );
    expect(doubles.exporterPages).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ doublePage: true }),
    );
  });

  it("transmet surAvertissement jusqu'au journal par la vraie porte", async () => {
    doubles.exporterPages.mockResolvedValue({ pages: [], refusees: [] });
    const journaux: string[] = [];
    await executerTravail(
      demandeDeTraitement(randomUUID(), randomUUID(), {
        document: join(RACINE, "fixtures/fichiers/inexistant-mais-double.pdf"),
        medias: RACINE,
        recette: RECETTE,
        description: DESCRIPTION,
      }),
      {
        emettre: (message) => {
          if (message.type === "journal") journaux.push(message.texte);
        },
      },
    );

    expect(journaux).toContain("JPEG incomplet ; rendu complet essayé");
  });
});
