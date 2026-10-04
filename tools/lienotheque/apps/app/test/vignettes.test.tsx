import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Catalogue } from "../src/pages/Catalogue.js";
import { Lecteur } from "../src/pages/Lecteur.js";

/** Vignettes réelles aux écrans (OUT-04).
 *
 *  Le Lecteur et le catalogue montrent la vignette que l'ingestion a produite. Un lot qui n'en
 *  porte pas garde des cibles cliquables : c'est le repli, et c'est lui qu'on vérifie d'abord,
 *  parce que c'est l'état d'une bibliothèque qu'on vient d'importer. */

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;

const vue = (vignettes: boolean): VueBibliotheque =>
  VueBibliotheque.parse({
    id: ID(1),
    nom: "Recueil de procédures",
    mots: {
      element: { un: "clause", plusieurs: "clauses" },
      piste: { un: "plage", plusieurs: "plages" },
      page: { un: "feuillet", plusieurs: "feuillets" },
    },
    compteurs: [{ nombre: 2, mot: "clauses" }],
    aVerifier: 0,
    filtres: [],
    pages: [126, 127].map((numero, rang) => ({
      numero,
      elements: [{ ancreId: ID(20 + rang), numero: String(400 + rang), page: numero, aVerifier: false }],
      texte: [],
      traduction: [],
      image: `/donnees/pages/page-000${rang}.webp`,
      largeur: 1240,
      hauteur: 1754,
      ...(vignettes ? { vignette: `/donnees/pages/vignette-000${rang}.webp` } : {}),
    })),
    douteux: [],
  });

describe("OUT-04 : le Lecteur montre les vignettes des pages", () => {
  it("met l'image de chaque page dans la bande, décorative — le nom est sur le bouton", () => {
    render(<Lecteur vue={vue(true)} page={126} element={ID(20)} onPage={vi.fn()} onElement={vi.fn()} />);

    const bande = screen.getByRole("navigation", { name: /feuillets du document/i });
    const images = bande.querySelectorAll("img");
    expect(images, "une vignette par page").toHaveLength(2);
    expect(images[0]?.getAttribute("src")).toBe("/donnees/pages/vignette-0000.webp");
    expect(images[0]?.getAttribute("alt"), "décorative : le bouton porte déjà le nom").toBe("");
    expect(images[0]?.getAttribute("loading"), "une bande de vingt-huit pages ne se charge pas d'un coup").toBe("lazy");
  });

  it("garde une bande cliquable quand le lot n'a produit aucune vignette", () => {
    render(<Lecteur vue={vue(false)} page={126} element={ID(20)} onPage={vi.fn()} onElement={vi.fn()} />);

    const bande = screen.getByRole("navigation", { name: /feuillets du document/i });
    expect(bande.querySelectorAll("img"), "aucune image").toHaveLength(0);
    expect(bande.querySelectorAll("button"), "mais les pages restent atteignables").toHaveLength(2);
  });
});

describe("OUT-04 : le catalogue montre les vignettes des pages", () => {
  it("remplace l'aperçu au numéro par la vignette, sur la carte comme au détail", () => {
    render(<Catalogue vue={vue(true)} page={126} onPage={vi.fn()} onLecteur={vi.fn()} onAjouter={vi.fn()} />);

    const cartes = document.querySelectorAll("img.ln-pages__apercu");
    expect(cartes, "une vignette par carte").toHaveLength(2);
    expect(cartes[0]?.getAttribute("src")).toBe("/donnees/pages/vignette-0000.webp");

    const detail = screen.getByRole("img", { name: /feuillet 126/i });
    expect(detail.tagName, "le détail montre la vignette, pas un numéro").toBe("IMG");
  });

  it("retombe sur le numéro de la page quand la vignette manque", () => {
    render(<Catalogue vue={vue(false)} page={126} onPage={vi.fn()} onLecteur={vi.fn()} onAjouter={vi.fn()} />);

    expect(document.querySelectorAll("img.ln-pages__apercu"), "aucune image").toHaveLength(0);
    expect(document.querySelectorAll(".ln-pages__apercu"), "mais un aperçu quand même").toHaveLength(2);
    expect(screen.getByRole("img", { name: /feuillet 126/i }).tagName).toBe("DIV");
  });
});
