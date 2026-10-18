import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { Lecteur } from "../src/pages/Lecteur.js";

/** Le rang et le numéro imprimé ne se confondent pas, et les fixtures doivent les distinguer.
 *
 *  Quand `PageAffichee` a reçu son rang, j'ai mis à jour une dizaine de fixtures en écrivant
 *  partout `index: numero`. Les deux valeurs devenant identiques, **aucun test ne pouvait plus
 *  voir laquelle le code employait** — et quatre recherches comparaient encore le numéro
 *  imprimé là où les écrans passent désormais le rang.
 *
 *  La pire était silencieuse : deux pages sans numéro imprimé le portent toutes deux à
 *  `undefined`, et `undefined === undefined` est vrai. L'image d'une page se serait recopiée
 *  sur toutes les autres, sans erreur ni avertissement.
 *
 *  Cette fixture-ci les sépare — rang 1 et 2, numéros imprimés 100 et 200 — pour qu'une
 *  confusion se voie au lieu de passer.
 */

const ID = (n: number): string => `6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a${String(n).padStart(2, "0")}`;

const VUE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Recueil",
  mots: {
    element: { un: "clause", plusieurs: "clauses" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [],
  pages: [
    { index: 1, numero: 100, elements: [{ ancreId: ID(21), numero: "A", page: 100 }], texte: [], traduction: [] },
    { index: 2, numero: 200, elements: [{ ancreId: ID(22), numero: "B", page: 200 }], texte: [], traduction: [] },
  ],
});

describe("les écrans désignent une page par son rang, jamais par son numéro imprimé", () => {
  it("ouvre la page de rang 2, et non celle qui porte le numéro 2", () => {
    render(<Lecteur vue={VUE} page={2} element={ID(22)} onPage={() => undefined} onElement={() => undefined} />);
    // La page de rang 2 porte l'élément « B ». Si la recherche se faisait par numéro imprimé,
    // aucune page ne répondrait à « 2 » et le Lecteur retomberait sur la première.
    expect(screen.getByText(/B/), "le rang 2 doit mener à la seconde page").toBeTruthy();
  });

  it("cite le numéro imprimé, qui n'est pas le rang", () => {
    render(<Lecteur vue={VUE} page={2} element={ID(22)} onPage={() => undefined} onElement={() => undefined} />);
    // Ce qu'on montre reste le numéro du livre : désigner par le rang ne veut pas dire
    // l'afficher.
    expect(screen.getAllByText(/feuillet 200/i).length, "le feuillet imprimé 200 doit se lire").toBeGreaterThan(0);
  });
});
