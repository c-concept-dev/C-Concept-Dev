// @vitest-environment node
import { Ancre, Document, Travail } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { ANCRES, BIBLIOTHEQUES, DOCUMENTS, REPRISES, TRAVAIL_EN_COURS, decrireCompteur } from "../src/donnees/accueil.js";
import { decrireParcours, decrirePosition, minutage } from "../src/donnees/positions.js";

describe("données factices de l'accueil : validées par les contrats", () => {
  it("chaque document respecte le contrat Document (ID-02)", () => {
    for (const document of DOCUMENTS) {
      const resultat = Document.safeParse(document);
      expect(resultat.success, `${document.titre} : ${resultat.error?.message ?? ""}`).toBe(true);
    }
  });

  it("chaque ancre respecte le contrat Ancre et ses sélecteurs (ANC-01)", () => {
    for (const ancre of ANCRES) {
      const resultat = Ancre.safeParse(ancre);
      expect(resultat.success, `${ancre.id} : ${resultat.error?.message ?? ""}`).toBe(true);
    }
  });

  it("le travail affiché respecte le contrat Travail (JOB-01, JOB-03)", () => {
    const resultat = Travail.safeParse(TRAVAIL_EN_COURS);
    expect(resultat.success, resultat.error?.message).toBe(true);
    expect(TRAVAIL_EN_COURS.pointReprise.unite).toBe("lot");
  });

  it("les reprises citent des documents et des ancres existants (ANC-02)", () => {
    const documents = new Set(DOCUMENTS.map((d) => d.id));
    const selecteurs = new Set(ANCRES.map((a) => JSON.stringify(a.selecteur)));
    for (const reprise of REPRISES) {
      expect(documents.has(reprise.documentId), reprise.titre).toBe(true);
      for (const position of reprise.origine) {
        expect(selecteurs.has(JSON.stringify(position.selecteur)), reprise.titre).toBe(true);
      }
    }
  });
});

describe("rendu des positions (conventions ANC)", () => {
  it("lit une page, un minutage et un élément numéroté", () => {
    expect(decrirePosition({ selecteur: { type: "page", index: 127 } })).toBe("Page 127");
    expect(decrirePosition({ selecteur: { type: "temps", debut: 760, fin: 820 } })).toBe("12:40");
    expect(decrirePosition({ selecteur: { type: "element", page: 15, valeur: "15" }, mot: "diapositive" })).toBe(
      "diapositive 15",
    );
  });

  it("préfère le numéro imprimé au rang de la page quand il a été lu", () => {
    expect(
      decrirePosition({ selecteur: { type: "page", index: 3, pageImprimee: { valeur: "127", statut: "lu" } } }),
    ).toBe("Page 127");
  });

  it("emploie le mot du schéma de la bibliothèque, jamais un mot écrit en dur (règle 1)", () => {
    const selecteur = { type: "chapitre", ref: "41" } as const;
    expect(decrirePosition({ selecteur, mot: "piste" })).toBe("piste 41");
    expect(decrirePosition({ selecteur, mot: "séance" })).toBe("séance 41");
  });

  it("enchaîne un parcours sans répéter la majuscule", () => {
    expect(
      decrireParcours([{ selecteur: { type: "chapitre", ref: "4" } }, { selecteur: { type: "page", index: 88 } }]),
    ).toBe("Chapitre 4, page 88");
  });

  it("compte les heures au-delà de soixante minutes", () => {
    expect(minutage(0)).toBe("0:00");
    expect(minutage(59)).toBe("0:59");
    expect(minutage(3661)).toBe("1:01:01");
  });
});

describe("compteurs des bibliothèques", () => {
  it("emploie la séparation française des milliers", () => {
    expect(decrireCompteur({ nombre: 1204, mot: "images" })).toMatch(/^1\s204 images$/u);
    expect(decrireCompteur({ nombre: 412, mot: "éléments" })).toBe("412 éléments");
  });

  it("décrit les quatre bibliothèques des maquettes", () => {
    expect(BIBLIOTHEQUES).toHaveLength(4);
    expect(BIBLIOTHEQUES.map((b) => b.collection)).toEqual(["method", "research", "video", "photos"]);
  });
});
