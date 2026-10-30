import { describe, expect, it } from "vitest";
import { CasDouteux, VueBibliotheque } from "@lienotheque/contrats";
import { construireVue, suites } from "../src/index.js";
import { entreeMinimale, ligne, media } from "./aide-instantane.js";

/** Les informations de Vérifier (OUT-01, OUT-10, UX-03).
 *
 *  Un lot dont tous les liens passent le seuil affichait « Rien à vérifier ». C'est faux dès que
 *  la numérotation saute des pages, ou qu'un média n'est réclamé par personne : ce sont des faits
 *  qu'on veut connaître après un import, même s'il n'y a rien à trancher. */

describe("une page que la numérotation donne pour sautée", () => {
  /** L'interprète a relevé que le document passe de 100 à 103 : 101 et 102 lui manquent. */
  const vue = (): VueBibliotheque => construireVue(entreeMinimale({ pagesAbsentes: [101, 102] }));

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
    const trois = construireVue(entreeMinimale({ pagesAbsentes: [101, 102, 103] }));
    const cas = trois.douteux.find((c) => c.etat === "page_absente");
    expect(cas?.libelle).toBe("Feuillets 101 à 103");
    expect(cas?.proposition).toBe("Feuillets 101 à 103 manquent au document");
  });

  it("se nomme au singulier quand il n'en manque qu'une, et accorde le verbe", () => {
    const seule = construireVue(entreeMinimale({ pagesAbsentes: [101] }));
    const cas = seule.douteux.find((c) => c.etat === "page_absente");
    expect(cas?.libelle).toBe("Feuillet 101");
    expect(cas?.proposition).toBe("Feuillet 101 manque au document");
  });

  it("ne dit plus « rien de lu » : on ne sait pas si la page manque au scan ou au livre", () => {
    for (const cas of vue().douteux) expect(`${cas.proposition} ${cas.motif}`).not.toMatch(/rien de lu/i);
  });

  // Le reproche que l'écran de F4 a rendu visible : vingt-trois cartes « manque au document »
  // pour des pages bien présentes, qui ne portaient simplement aucun élément numéroté. Une page
  // vide n'est pas une page absente, et c'est l'interprète — qui suit le décalage de la
  // numérotation — qui sait laquelle est laquelle. L'instantané ne le redevine plus.
  it("ne tient pas une page sans élément pour une page manquante (lot D)", () => {
    const creuse = construireVue(
      entreeMinimale({ lignes: [ligne(1, { pageImprimee: 100 }), ligne(2, { pageImprimee: 140 })], pagesAbsentes: [] }),
    );
    expect(creuse.douteux.filter((c) => c.etat === "page_absente")).toEqual([]);
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

describe("une manière de lire qui ne sait interpréter aucun des médias présents", () => {
  it("s'abstient visiblement au lieu d'afficher les nombres isolés comme des éléments acquis", () => {
    const vue = construireVue(
      entreeMinimale({
        lignes: [ligne(10), ligne(11), ligne(12)],
        association: {
          appariements: [],
          orphelins: [],
          manquants: [],
          abstention: { raison: "medias_non_interpretes", combien: 37 },
        },
      }),
    );
    expect(vue.pages.flatMap((page) => page.elements)).toEqual([]);
    expect(vue.douteux).toContainEqual(
      expect.objectContaining({ nature: "information", etat: "maniere_inadaptee", details: expect.arrayContaining([expect.stringMatching(/37/)]) }),
    );
  });
});

describe("une association en abstention", () => {
  it("UX-03 — compte les propositions comme non vérifiées, jamais comme des liens actifs", () => {
    const entree = entreeMinimale();
    const vue = construireVue(
      entreeMinimale({
        association: {
          ...entree.association,
          abstention: {
            raison: "corroboration_insuffisante",
            combien: entree.association.appariements.length,
            pourquoi: "une seule lecture ne suffit pas",
          },
        },
      }),
    );

    expect(vue.compteurs).toContainEqual({ nombre: 0, mot: "liens" });
    expect(vue.compteurs).toContainEqual({
      nombre: entree.association.appariements.length,
      mot: "propositions non vérifiées",
    });
    expect(vue.douteux.flatMap((doute) => doute.details)).toContain(
      `${entree.association.appariements.length} propositions non vérifiées, appuyées par une seule lecture`,
    );
    expect(vue.douteux.flatMap((doute) => doute.details).join(" ")).not.toMatch(/liens? retenus?/i);
  });

  /// Le cas réel, que le précédent ne pouvait pas voir (UX-03).
  ///
  /// L'épreuve ci-dessus posait `combien` **égal** au nombre d'appariements : les deux nombres
  /// disaient forcément la même chose, et leur désaccord restait invisible. Or quand la
  /// corroboration manque, la confrontation ne garde aucun appariement — mesuré le 30 octobre
  /// 2026 sur quatre documents réels de la bibliothèque d'essai : `appariements` vide et
  /// `abstention.combien` à 40, 15, 14 et 10. L'écran annonçait alors « aucune proposition » dans
  /// son compteur et « 40 » dans sa ligne de détail, au même instant, pour la même chose.
  it("UX-03 — dit le même nombre partout quand la confrontation n’a gardé aucun appariement", () => {
    const vue = construireVue(
      entreeMinimale({
        association: {
          appariements: [],
          orphelins: [],
          manquants: [],
          abstention: {
            raison: "corroboration_insuffisante",
            combien: 40,
            pourquoi: "Une seule façon de savoir appuie ces liens (pastille), et personne n’a encore vérifié ce conteneur.",
          },
        },
      }),
    );

    expect(vue.compteurs).toContainEqual({ nombre: 0, mot: "liens" });
    expect(vue.compteurs).toContainEqual({ nombre: 40, mot: "propositions non vérifiées" });
    expect(vue.douteux.flatMap((doute) => doute.details)).toContain("40 propositions non vérifiées, appuyées par une seule lecture");
  });

  /// Ne jamais dire qu'aucune lecture n'appuie des liens qu'une lecture appuie (UX-03, REC-02).
  ///
  /// `corroboration_insuffisante` est émis par la confrontation quand **une** façon de savoir
  /// appuie ces liens et qu'aucun œil ne les a vérifiés. L'écran écrivait pourtant « Rien n'a été
  /// lu sur ces pages pour appuyer ces liens », et proposait « une manière de lire qui lise
  /// vraiment ses pages » — juste au-dessus du motif du moteur, qui disait l'inverse.
  it("UX-03 — n’annonce pas qu’aucune lecture n’appuie des liens qu’une lecture appuie", () => {
    const vue = construireVue(
      entreeMinimale({
        association: {
          appariements: [],
          orphelins: [],
          manquants: [],
          abstention: { raison: "corroboration_insuffisante", combien: 40, pourquoi: "Une seule façon de savoir appuie ces liens." },
        },
      }),
    );

    const dit = vue.douteux
      .flatMap((doute) => [doute.libelle ?? "", doute.proposition ?? "", ...doute.details])
      .join(" ");
    expect(dit).not.toMatch(/rien n’a été lu/i);
    expect(dit).not.toMatch(/aucune lecture/i);
    expect(dit).not.toMatch(/lise vraiment/i);
    expect(dit).toMatch(/un seul appui|une seule lecture/i);
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
        pagesAbsentes: [101, 102],
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
        pagesAbsentes: [101, 102],
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
