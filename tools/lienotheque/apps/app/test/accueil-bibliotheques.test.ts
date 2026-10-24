import { describe, expect, it } from "vitest";
import { DescriptionBibliotheque, VueBibliotheque } from "@lienotheque/contrats";
import { bandeauDe, compteursDeBibliotheque, pourLAccueil } from "../src/donnees/accueil.js";

/** Ce que l'accueil montre d'une bibliothèque ouverte (B1, CLA-01).
 *
 *  Une bibliothèque créée n'apparaissait nulle part : on retombait sur le premier lancement
 *  alors qu'on venait de la créer. */

const DESCRIPTION = DescriptionBibliotheque.parse({
  id: "une-bibliotheque",
  nom: "Une bibliothèque",
  contenus: ["documents", "audio"],
  mots: {
    element: { un: "repère", plusieurs: "repères" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  schema: {
    cle: "un-schema",
    nom: "Un schéma",
    langue: "fr",
    version: 1,
    axes: [{ cle: "un-axe", nom: "Un axe", nature: "etiquettes", cardinalite: "plusieurs" }],
  },
});

const VUE = VueBibliotheque.parse({
  id: "0190f0a0-0000-7000-8000-000000000001",
  nom: "Une bibliothèque",
  mots: DESCRIPTION.mots,
  compteurs: [{ nombre: 95, mot: "repères" }],
  aVerifier: 2,
  pages: [],
});

describe("une bibliothèque ouverte se montre, traitée ou non", () => {
  it("existe avant d'avoir rien traité, et le dit", () => {
    const sans = pourLAccueil(DESCRIPTION, undefined, "Sur cet ordinateur");
    expect(sans.nom).toBe("Une bibliothèque");
    expect(sans.etat.libelle).toMatch(/Rien de traité/);
    expect(sans.compteurs).toEqual([]);
  });

  it("porte les compteurs de sa version active, avec ses mots (CLA-01)", () => {
    const avec = pourLAccueil(DESCRIPTION, VUE, "Sur cet ordinateur");
    expect(avec.compteurs).toEqual([{ nombre: 95, mot: "repères" }]);
    expect(avec.aVerifier).toBe(2);
    expect(avec.etat.libelle).toBe("Prêt");
  });

  it("ne montre pas un compte de doutes quand il n'y en a aucun", () => {
    const sansDoute = pourLAccueil(DESCRIPTION, VueBibliotheque.parse({ ...VUE, aVerifier: 0 }), "Ici");
    expect(sansDoute.aVerifier).toBeUndefined();
  });

  it("mène au traitement : c'est de là qu'on agit sur elle", () => {
    expect(pourLAccueil(DESCRIPTION, undefined, "Ici").href).toBe("#depot");
  });
});

describe("le bandeau dit ce qu'elle contient, jamais ce que ses éléments sont", () => {
  it("suit les types de contenu annoncés", () => {
    expect(bandeauDe(["videos", "documents"])).toBe("video");
    expect(bandeauDe(["documents", "audio"])).toBe("method");
    expect(bandeauDe(["images"])).toBe("photos");
  });

  it("retombe sur un bandeau neutre quand rien n'est annoncé", () => {
    expect(bandeauDe([])).toBe("research");
  });
});

describe("les compteurs portent sur la bibliothèque entière", () => {
  it("additionne les projections et retire les zéros qui ne disent rien", () => {
    const documents = [
      { empreinte: "a".repeat(64), version: VUE.id, activeeLe: 1, nom: "Un", compteurs: [{ nombre: 5, mot: "passages lus" }, { nombre: 0, mot: "liens" }], aVerifier: 0 },
      { empreinte: "b".repeat(64), version: VUE.id, activeeLe: 1, nom: "Deux", compteurs: [{ nombre: 7, mot: "passages lus" }, { nombre: 0, mot: "liens" }], aVerifier: 0 },
    ];
    expect(compteursDeBibliotheque(documents)).toEqual([
      { nombre: 2, mot: "documents" },
      { nombre: 12, mot: "passages lus" },
    ]);
    expect(pourLAccueil(DESCRIPTION, VUE, "Ici", compteursDeBibliotheque(documents)).compteurs).toEqual([
      { nombre: 2, mot: "documents" },
      { nombre: 12, mot: "passages lus" },
    ]);
  });
});
