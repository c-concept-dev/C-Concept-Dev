import { describe, expect, it } from "vitest";
import { CasDouteux, VueBibliotheque } from "@lienotheque/contrats";
import { construireVue, suites, trous } from "../src/index.js";
import { entreeMinimale, ligne, media } from "./aide-instantane.js";

/** Les informations de Vérifier (OUT-01, OUT-10, UX-03).
 *
 *  Un lot dont tous les liens passent le seuil affichait « Rien à vérifier ». C'est faux dès que
 *  la numérotation saute des pages, ou qu'un média n'est réclamé par personne : ce sont des faits
 *  qu'on veut connaître après un import, même s'il n'y a rien à trancher. */

describe("trous d'une numérotation", () => {
  it("groupe les manquants consécutifs, pour ne pas remplir la file de cartes identiques", () => {
    expect(trous([29, 32])).toEqual([{ debut: 30, fin: 31 }]);
    expect(trous([3, 4, 5])).toEqual([]);
    expect(trous([1, 3, 7])).toEqual([
      { debut: 2, fin: 2 },
      { debut: 4, fin: 6 },
    ]);
  });

  it("ne suppose rien avant le premier ni après le dernier", () => {
    // On ne sait pas où le document commence ni où il finit : seuls les trous intérieurs sont
    // des faits.
    expect(trous([10, 11])).toEqual([]);
    expect(trous([])).toEqual([]);
    expect(trous([5])).toEqual([]);
  });

  it("supporte le désordre et les doublons", () => {
    expect(trous([32, 29, 29])).toEqual([{ debut: 30, fin: 31 }]);
  });
});

describe("une page que la numérotation annonce et dont rien n'a été lu", () => {
  /** Les lignes posent les pages 100 et 103 : 101 et 102 n'ont rien donné. */
  const vue = (): VueBibliotheque =>
    construireVue(entreeMinimale({ lignes: [ligne(1, { pageImprimee: 100 }), ligne(2, { pageImprimee: 103 })] }));

  it("apparaît comme information, jamais comme doute sur un lien", () => {
    const cas = vue().douteux.filter((c) => c.etat === "page_absente");
    expect(cas).toHaveLength(1);
    expect(cas[0]?.nature).toBe("information");
    expect(cas[0]?.element, "une page qui n'a rien porté n'a pas d'élément").toBeUndefined();
  });

  it("lit deux manquants avec « et », et dit qu'ils manquent au document", () => {
    const cas = vue().douteux.find((c) => c.etat === "page_absente");
    expect(cas?.libelle).toBe("Feuillets 101 et 102");
    expect(cas?.proposition).toBe("Feuillets 101 et 102 manquent au document");
    expect(cas?.motif).toBe("la numérotation passe de 100 à 103");
  });

  it("lit trois manquants et plus avec « à »", () => {
    const trois = construireVue(
      entreeMinimale({ lignes: [ligne(1, { pageImprimee: 100 }), ligne(2, { pageImprimee: 104 })] }),
    );
    const cas = trois.douteux.find((c) => c.etat === "page_absente");
    expect(cas?.libelle).toBe("Feuillets 101 à 103");
    expect(cas?.proposition).toBe("Feuillets 101 à 103 manquent au document");
  });

  it("se nomme au singulier quand il n'en manque qu'une, et accorde le verbe", () => {
    const seule = construireVue(
      entreeMinimale({ lignes: [ligne(1, { pageImprimee: 100 }), ligne(2, { pageImprimee: 102 })] }),
    );
    const cas = seule.douteux.find((c) => c.etat === "page_absente");
    expect(cas?.libelle).toBe("Feuillet 101");
    expect(cas?.proposition).toBe("Feuillet 101 manque au document");
  });

  it("ne dit plus « rien de lu » : on ne sait pas si la page manque au scan ou au livre", () => {
    for (const cas of vue().douteux) expect(`${cas.proposition} ${cas.motif}`).not.toMatch(/rien de lu/i);
  });
});

describe("un média qu'aucun élément ne réclame", () => {
  const vue = (): VueBibliotheque =>
    construireVue(
      entreeMinimale({
        lignes: [ligne(1), ligne(2)],
        medias: [media(1), media(2), media(93), media(94)],
        association: { appariements: [], orphelins: [94, 93], manquants: [] },
      }),
    );

  it("regroupe les consécutifs en une seule information", () => {
    const cas = vue().douteux.filter((c) => c.etat === "media_orphelin");
    expect(cas, "93 et 94 se suivent : une fiche, pas deux").toHaveLength(1);
    expect(cas[0]?.libelle).toBe("Plages 93 et 94");
    expect(cas[0]?.proposition).toBe("Plages 93 et 94 : aucun lien");
    expect(cas[0]?.nature).toBe("information");
  });

  it("garde chaque média dans le détail, avec son fichier — le seul moyen de le retrouver", () => {
    const cas = vue().douteux.find((c) => c.etat === "media_orphelin");
    expect(cas?.details).toEqual(["Plage 93 — fichier « Plage 93.mp3 »", "Plage 94 — fichier « Plage 94.mp3 »"]);
  });

  it("sépare deux suites qui ne se touchent pas", () => {
    const separees = construireVue(
      entreeMinimale({
        lignes: [ligne(1), ligne(2)],
        medias: [media(1), media(2), media(10), media(11), media(40)],
        association: { appariements: [], orphelins: [11, 40, 10], manquants: [] },
      }),
    );
    const cas = separees.douteux.filter((c) => c.etat === "media_orphelin");
    expect(cas.map((c) => c.libelle)).toEqual(["Plages 10 et 11", "Plage 40"]);
    expect(cas[1]?.details, "une suite d'un seul n'a rien à déplier de plus").toHaveLength(1);
  });

  it("n'emploie aucune tournure qui demande le genre du mot", () => {
    // Le schéma donne les mots, pas leur genre : « ne la réclame » ne vaut que pour un féminin,
    // « 0 exercice relié » devient « 0 clause relié » en changeant de domaine.
    for (const cas of vue().douteux)
      for (const texte of [cas.proposition, cas.motif, cas.libelle ?? "", ...cas.details])
        expect(texte, texte).not.toMatch(/\b(cette?|ce|la réclame|le réclame|relié|reliée|complète|complet)\b/i);
  });
});

describe("suites de nombres consécutifs", () => {
  it("regroupe ce qui se suit, sépare ce qui ne se suit pas", () => {
    expect(suites([93, 94, 95, 96, 97, 98])).toEqual([{ debut: 93, fin: 98 }]);
    expect(suites([10, 11, 40])).toEqual([
      { debut: 10, fin: 11 },
      { debut: 40, fin: 40 },
    ]);
    expect(suites([])).toEqual([]);
  });

  it("supporte le désordre et les doublons", () => {
    expect(suites([94, 93, 93])).toEqual([{ debut: 93, fin: 94 }]);
  });
});

describe("le compte de ce qui attend", () => {
  it("prend les informations avec les doutes : la file n'est pas vide", () => {
    const vue = construireVue(
      entreeMinimale({
        lignes: [ligne(1, { pageImprimee: 100 }), ligne(2, { pageImprimee: 103 })],
        medias: [media(1), media(2), media(93)],
        association: { appariements: [], orphelins: [93], manquants: [] },
      }),
    );
    // Deux lignes sûres, donc aucun doute sur un lien — et pourtant deux choses à savoir.
    expect(vue.douteux.filter((c) => c.nature === "lien")).toHaveLength(0);
    expect(vue.aVerifier).toBe(2);
    expect(vue.douteux.map((c) => c.etat).sort()).toEqual(["media_orphelin", "page_absente"]);
  });

  it("suit le contrat de vue, informations comprises", () => {
    const vue = construireVue(
      entreeMinimale({
        lignes: [ligne(1, { pageImprimee: 100 }), ligne(2, { pageImprimee: 103 })],
        association: { appariements: [], orphelins: [93], manquants: [] },
        medias: [media(1), media(2), media(93)],
      }),
    );
    expect(VueBibliotheque.safeParse(vue).success).toBe(true);
  });
});

describe("le contrat d'un cas", () => {
  const base = { id: "6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a01", proposition: "x", motif: "y" };

  it("refuse un cas qui ne dit pas de quoi il parle", () => {
    expect(CasDouteux.safeParse({ ...base, nature: "information", etat: "page_absente" }).success).toBe(false);
  });

  it("accepte une information qui porte un libellé", () => {
    expect(CasDouteux.safeParse({ ...base, nature: "information", etat: "page_absente", libelle: "Feuillet 101" }).success).toBe(true);
  });

  it("refuse un doute sur un lien qui ne porte aucun élément", () => {
    expect(CasDouteux.safeParse({ ...base, nature: "lien", etat: "confiance", libelle: "Plage 3" }).success).toBe(false);
  });
});
