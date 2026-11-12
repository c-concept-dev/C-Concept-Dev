import { describe, expect, it } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
import { construireVue } from "../src/index.js";
import type { ReleveDeRelectureDesCases } from "../src/voie-oracle.js";
import { entreeMinimale as entree, ligne } from "./aide-instantane.js";

/** A2 — ce que la relecture des cases a coûté et rendu arrive à l'écran (A2, OUT-10, UX-03).
 *
 *  ## Le défaut que ces contrôles existent pour empêcher
 *
 *  Le relevé existait dans la voie — demandes, rendus, pannes, cases non relues — et **s'arrêtait
 *  là**. Un relevé que personne ne voit ne protège de rien : une case qu'on n'a pas su lire
 *  disparaissait de l'écran exactement comme une case qui n'existait pas. C'est le trou qui
 *  ressemble au succès, et il tenait jusqu'à Vérifier.
 *
 *  ## Ce que ces contrôles tiennent
 *
 *  Que les cases non relues deviennent **un** fait à connaître, pas trente fiches à cocher ;
 *  qu'on puisse déplier lesquelles ; que les trois comptes — demandé, rendu, en panne — soient
 *  dits en clair ; qu'une panne ne se confonde pas avec une abstention ; et que rien ne
 *  s'affiche quand il n'y avait rien à relire. */

const caseNonRelue = (page: number, rangee: number, colonne: number, pourquoi: string) => ({
  page,
  rangee,
  colonne,
  etat: "relecture_non_faite" as const,
  pourquoi,
});

const vueAvec = (releve: ReleveDeRelectureDesCases | undefined) =>
  construireVue(entree({ lignes: [ligne(1)], ...(releve === undefined ? {} : { relectureDesCases: releve }) }));

const SANS_ACCORD = "aucune lecture n'a rendu de valeur pour cette case";

describe("A2 : le relevé de la relecture des cases arrive à Vérifier", () => {
  const releve = {
    demandes: 30,
    rendus: 8,
    pannes: 2,
    nonRelues: [
      caseNonRelue(5, 2, 1, SANS_ACCORD),
      caseNonRelue(5, 3, 1, SANS_ACCORD),
      caseNonRelue(68, 4, 0, "la valeur relue n'était pas un nombre de cellule acceptable"),
    ],
  };

  it("regroupe les cases non relues en un seul fait à connaître (A2, UX-03)", () => {
    const cas = vueAvec(releve).douteux.filter((doute) => doute.etat === "relecture_non_faite");
    expect(cas, "trois fiches identiques à cocher au lieu d'un fait").toHaveLength(1);
    expect(cas[0]!.nature, "il n'y a rien à arbitrer : c'est un fait, pas une décision").toBe("information");
  });

  it("laisse déplier lesquelles, chacune avec sa raison (A2, OUT-10)", () => {
    const cas = vueAvec(releve).douteux.find((doute) => doute.etat === "relecture_non_faite")!;
    expect(cas.details).toHaveLength(3);
    expect(cas.details.join(" · ")).toContain("5");
    expect(cas.details.join(" · "), "une case sans raison ne dit pas ce qui a manqué").toContain(SANS_ACCORD);
  });

  it("dit les trois comptes en clair : demandé, rendu, en panne (A2)", () => {
    const cas = vueAvec(releve).douteux.find((doute) => doute.etat === "relecture_non_faite")!;
    const dit = `${cas.proposition} ${cas.motif}`;
    expect(dit, "le nombre de demandes n'est pas dit").toContain("30");
    expect(dit, "ce que la relecture a rendu n'est pas dit").toContain("8");
    expect(dit, "une panne tue est une panne qui ressemble à un succès").toContain("2");
  });

  it("ne dit rien du tout quand aucune case n'était en défaut (A2)", () => {
    expect(vueAvec(undefined).douteux.filter((doute) => doute.etat === "relecture_non_faite")).toHaveLength(0);
  });

  it("ne dit aucune case non relue quand toutes ont été rendues (A2)", () => {
    const toutRendu = { demandes: 4, rendus: 4, pannes: 0, nonRelues: [] };
    expect(vueAvec(toutRendu).douteux.filter((doute) => doute.etat === "relecture_non_faite")).toHaveLength(0);
  });

  it("rend une vue que le contrat accepte (A2)", () => {
    expect(() => VueBibliotheque.parse(vueAvec(releve))).not.toThrow();
  });

  /** Règle 8 : aucun jargon visible. « Case » reste, c'est le mot de l'écran depuis le libellé
   *  « Case non relue » ; « cellule », « OCR », « vision » et « modèle » n'ont rien à y faire —
   *  on dit ce qui s'est passé, pas comment. */
  it("parle sans jargon (règle 8)", () => {
    const cas = vueAvec(releve).douteux.find((doute) => doute.etat === "relecture_non_faite")!;
    expect(`${cas.libelle ?? ""} ${cas.proposition} ${cas.motif}`).not.toMatch(/OCR|vision|modèle|IA\b|cellule/i);
  });
});
