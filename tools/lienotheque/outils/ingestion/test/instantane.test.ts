import { describe, expect, it } from "vitest";
import { VueBibliotheque, type LigneInterpretee } from "@lienotheque/contrats";
import { construireVue, phraseDuLien } from "../src/index.js";
import { MOTS, entreeMinimale as entree, ligne } from "./aide-instantane.js";

describe("phrase d'un lien (ANC-02)", () => {
  it("dit en français d'où vient la piste, avec les mots de la bibliothèque", () => {
    expect(phraseDuLien(ligne(41), MOTS)).toBe("Repère « plage 41 » lu à côté du numéro");
    expect(phraseDuLien(ligne(41, { sourcePiste: "sequence" }), MOTS)).toMatch(/déduit de la suite/i);
    expect(phraseDuLien(ligne(41, { sourcePiste: "suite" }), MOTS)).toMatch(/reprend la plage/i);
    expect(phraseDuLien(ligne(41, { sourcePiste: "numero_element" }), MOTS)).toMatch(/^Plage et numéro coïncident/);
  });

  it("dit la relecture ciblée, et qu'elle a été confirmée (ANC-02, OUT-08)", () => {
    const phrase = phraseDuLien(ligne(41, { sourcePiste: "vision" }), MOTS);
    expect(phrase).toMatch(/relu sur l'image/i);
    expect(phrase, "la corroboration doit se voir, pas seulement la relecture").toMatch(/confirmé/i);
    // Règle 8 : aucun jargon visible. Ni « vision », ni « modèle », ni « IA ».
    expect(phrase).not.toMatch(/vision|modèle|IA\b|OCR/i);
  });
});

describe("la preuve d'un lien relu (ANC-02)", () => {
  it("porte « vision » dans « Pourquoi ce lien », distincte de « lu » et de « sequence »", () => {
    const preuveDe = (sourcePiste: LigneInterpretee["sourcePiste"]) =>
      // La piste 1, parce qu'un média doit exister pour qu'il y ait un lien à expliquer.
      construireVue(entree({ lignes: [ligne(1, { sourcePiste })] })).pages.flatMap((page) => page.elements)[0]?.pourquoi?.preuve;
    expect(preuveDe("vision")).toBe("vision");
    expect(preuveDe("pastille")).toBe("lu");
    expect(preuveDe("sequence")).toBe("sequence");
  });
});

describe("instantané pour les écrans (B5)", () => {
  it("suit le contrat de vue", () => {
    expect(VueBibliotheque.safeParse(construireVue(entree())).success).toBe(true);
  });

  it("groupe les éléments par page, dans l'ordre", () => {
    const vue = construireVue(entree({ lignes: [ligne(5), ligne(1), ligne(9)] }));
    expect(vue.pages.map((page) => page.numero)).toEqual([...vue.pages.map((page) => page.numero)].sort((a, b) => a - b));
    expect(vue.pages.flatMap((page) => page.elements).length).toBe(3);
  });

  it("relie chaque élément à son média, et dit pourquoi", () => {
    const vue = construireVue(entree());
    const element = vue.pages.flatMap((page) => page.elements)[0]!;
    expect(element.media?.nom).toMatch(/^Plage/);
    expect(element.pourquoi?.preuve).toBe("lu");
    expect(element.pourquoi?.phrase).toContain("plage");
  });

  it("laisse sans média ce qui n'a pas de piste, et sans « pourquoi »", () => {
    const { piste: _sans, sourcePiste: _ni, ...sansPiste } = ligne(1);
    const vue = construireVue(entree({ lignes: [sansPiste as LigneInterpretee] }));
    const element = vue.pages[0]!.elements[0]!;
    expect(element.media).toBeUndefined();
    expect(element.pourquoi).toBeUndefined();
  });

  it("met à vérifier ce qui passe sous le seuil de la recette", () => {
    const vue = construireVue(entree({ lignes: [ligne(1, { confiance: 0.4 }), ligne(2)] }));
    expect(vue.aVerifier).toBe(1);
    expect(vue.douteux[0]?.proposition).toBe("clause 1 → plage 1");
    expect(vue.douteux[0]?.element?.aVerifier).toBe(true);
  });

  it("tire ses filtres de la nomenclature, un par axe, sans les valeurs retirées", () => {
    const vue = construireVue(entree());
    expect(vue.filtres.map((filtre) => filtre.cle)).toEqual(["niveau", "ecoute"]);
    expect(vue.filtres[0]?.valeurs.map((valeur) => valeur.cle), "« ancien » est retirée").toEqual(["debutant"]);
  });

  it("ne déclare filtrable qu'un axe qu'il a su compter (CLA-10)", () => {
    const vue = construireVue(entree());
    // « niveau » : rien ici ne sait quelle valeur une page y porte. L'annoncer avec des comptes
    // à zéro, c'était promettre aux écrans un tri qui n'existe pas.
    const niveau = vue.filtres.find((filtre) => filtre.cle === "niveau");
    expect(niveau?.filtrable).toBe(false);
    expect(niveau?.valeurs.every((valeur) => valeur.nombre === 0)).toBe(true);
    // « ecoute » porte un rôle que l'application sait remplir : lui, il filtre.
    expect(vue.filtres.find((filtre) => filtre.cle === "ecoute")?.filtrable).toBe(true);
  });

  it("compte ce qu'il y a, avec les mots de la bibliothèque", () => {
    const vue = construireVue(entree());
    expect(vue.compteurs[0]).toEqual({ nombre: 3, mot: "clauses" });
    expect(vue.compteurs.some((compteur) => compteur.mot === "feuillets")).toBe(true);
  });

  it("ne pose aucune position dans un média : sans segment vérifié, c'est inconnu (ANC-03)", () => {
    const vue = construireVue(entree());
    for (const element of vue.pages.flatMap((page) => page.elements))
      if (element.media !== undefined) expect(element.media.position).toEqual({ segment: "inconnu" });
  });

  it("rejoué, rend exactement le même instantané", () => {
    expect(JSON.stringify(construireVue(entree()))).toBe(JSON.stringify(construireVue(entree())));
  });
});

describe("une relecture restée sans majorité se montre dans Vérifier (lot D, ANC-02)", () => {
  const vue = (sur: Partial<LigneInterpretee>) => construireVue(entree({ lignes: [ligne(1, sur)] }));

  it("met l'élément en attente, en disant pourquoi plutôt qu'« on n'est pas sûr »", () => {
    const douteux = vue({ relecture: "sans_majorite", confiance: 1 }).douteux;
    expect(douteux).toHaveLength(1);
    expect(douteux[0]!.etat).toBe("relecture_sans_majorite");
  });

  it("le dit en français, sans jargon", () => {
    const phrase = phraseDuLien(ligne(1, { relecture: "sans_majorite" }), MOTS);
    expect(phrase).toMatch(/deux fois/);
    expect(phrase).toMatch(/sans que deux lectures s'accordent/);
    expect(phrase).not.toMatch(/vision|modèle|IA\b|OCR|majorité/i);
  });

  it("distingue le numéro que la suite n'a pas confirmé", () => {
    expect(phraseDuLien(ligne(1, { relecture: "non_corroboree" }), MOTS)).toMatch(/ne le confirme pas/);
    expect(vue({ relecture: "non_corroboree", confiance: 0.1 }).douteux[0]!.etat).toBe("confiance");
  });

  it("porte la preuve « vision » dès qu'une relecture est intervenue", () => {
    const preuveDe = (relecture: LigneInterpretee["relecture"]) =>
      vue({ relecture, confiance: 1 }).pages.flatMap((page) => page.elements)[0]?.pourquoi?.preuve;
    expect(preuveDe("sans_majorite")).toBe("vision");
    expect(preuveDe("non_corroboree")).toBe("vision");
    expect(preuveDe("appliquee")).toBe("vision");
    expect(preuveDe(undefined)).toBe("lu");
  });

  it("ne met rien en attente quand la relecture a abouti et que la suite l'a confirmée", () => {
    expect(vue({ relecture: "appliquee", sourcePiste: "vision", confiance: 0.85 }).douteux).toEqual([]);
  });
});
