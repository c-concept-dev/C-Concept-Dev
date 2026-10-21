import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Lecteur } from "../src/pages/Lecteur.js";

/** Un document dont aucune page ne se montre (UX-01, BAS-02)
 *
 *  ## Ce que l'écran faisait, et qui ne se voyait que sur un vrai livre
 *
 *  Les pages de la vue viennent de la chaîne d'images : elle lit les repères sur l'image de
 *  chaque feuille, et `exporterPages` tire ces images des JPEG qu'un document **numérisé**
 *  contient. Un livre composé en texte n'en porte aucun — « une page existe parce qu'elle a été
 *  lue », et il n'y a rien à lire par ce chemin. Sa vue sort donc avec zéro page, et c'est le cas
 *  de la moitié du corpus, pas un cas limite.
 *
 *  Le Lecteur affichait alors sa carcasse : colonne de vignettes vide, centre vide, « Élément 0
 *  sur 0 », « — sur 0 », et un champ de note. Aucune phrase ne disait ce qui se passait, alors
 *  que le texte du document, lui, avait été lu correctement et se retrouvait par la recherche.
 *
 *  **Le défaut n'est pas l'absence de pages, qui est un fait ; c'est le silence.**
 *
 *  ## Ce que l'écran doit dire, et qu'il ne peut pas deviner seul
 *
 *  Il ne sait pas si le texte a été lu : la vue porte les repères, les passages portent le texte,
 *  et les deux arrivent séparément. D'où `texteLu` — sans quoi l'écran promettrait une recherche
 *  qui ne rendrait rien sur un document que la chaîne n'a pas su lire.
 */

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;

/** Les mots ne sont pas ceux d'un livre : s'ils s'affichent, ils viennent bien du schéma (CLA-01). */
const SANS_PAGE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Recueil de procédures",
  mots: {
    element: { un: "clause", plusieurs: "clauses" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [],
  pages: [],
  douteux: [],
});

const montrer = (texteLu: boolean) =>
  render(
    <Lecteur vue={SANS_PAGE} page={1} element="" texteLu={texteLu} onPage={() => undefined} onElement={() => undefined} />,
  );

describe("un document dont aucune page ne se montre le dit (UX-01)", () => {
  it("ne laisse plus une carcasse muette", () => {
    montrer(true);
    const vu = screen.getByRole("main").textContent ?? "";
    // Les deux compteurs vides qui tenaient lieu d'explication.
    expect(vu, "« 0 sur 0 » n’explique rien").not.toContain("0 sur 0");
    expect(vu, "le pied montrait « — sur 0 »").not.toContain("— sur 0");
  });

  it("dit que ce document n’a pas de quoi se montrer, avec les mots de la bibliothèque", () => {
    montrer(true);
    expect(screen.getByRole("heading", { name: /rien à montrer/i })).toBeTruthy();
    const vu = screen.getByRole("main").textContent ?? "";
    expect(vu, "le mot vient du schéma, jamais du code").toContain("feuillet");
    expect(vu).not.toContain("page");
  });

  it("renvoie à la recherche quand le texte a bien été lu", () => {
    montrer(true);
    // C'est tout l'enjeu : le texte est là, il se cherche, et personne ne le devinerait devant
    // un écran vide.
    expect(screen.getByRole("main").textContent ?? "").toMatch(/recherche/i);
  });

  it("ne promet pas une recherche quand rien n’a été lu", () => {
    montrer(false);
    const vu = screen.getByRole("main").textContent ?? "";
    expect(vu, "promettre une recherche qui ne rendra rien est pire que se taire").not.toMatch(/recherche/i);
    expect(vu).toMatch(/pas encore été lu/i);
  });

  it("garde le fil d’Ariane : on doit pouvoir repartir", () => {
    montrer(true);
    // Le dernier maillon est l'endroit où l'on est, et le fil ne le rend pas cliquable : c'est
    // le nom de la bibliothèque qui le devient ici, faute de page à nommer après lui.
    expect(screen.getByRole("link", { name: "Accueil" })).toBeTruthy();
    expect(screen.getByRole("main").textContent ?? "").toContain("Recueil de procédures");
  });
});
