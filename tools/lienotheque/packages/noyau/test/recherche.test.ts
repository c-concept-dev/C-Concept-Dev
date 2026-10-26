import { describe, expect, it } from "vitest";
import { Passage, VueBibliotheque } from "@lienotheque/contrats";
import { PAR_GROUPE, aLaFile, chercher, morceler } from "../src/index.js";

/** Chercher dans une bibliothèque, sur la machine et nulle part ailleurs (RCH, UX-02, CLA-01).
 *
 *  Les mots de cette bibliothèque-ci sont inventés pour le test : l'écran dit « repère », « plage »
 *  et « feuillet » parce qu'elle le dit, et le code n'en connaît aucun. */

const ID = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const EMPREINTE = "a".repeat(64);

const VUE = VueBibliotheque.parse({
  id: ID(1),
  nom: "Une bibliothèque",
  mots: {
    element: { un: "repère", plusieurs: "repères" },
    piste: { un: "plage", plusieurs: "plages" },
    page: { un: "feuillet", plusieurs: "feuillets" },
  },
  compteurs: [],
  pages: [
    {
      index: 127,
      numero: 127,
      elements: [
        {
          ancreId: ID(10),
          numero: "400",
          titre: "travail d’articulation",
          page: 127,
          media: {
            empreinte: EMPREINTE,
            nom: "Plage 40.mp3",
            piste: 40,
            position: { segment: "inconnu" },
          },
          pourquoi: { preuve: "lu", confiance: 0.98, phrase: "Repère lu sur la page" },
        },
      ],
      texte: ["Travailler l’articulation détachée au métronome, tempo lent.", "Puis accélérer."],
    },
    {
      index: 158,
      numero: 158,
      titre: "Introduction du quatrième ensemble",
      elements: [{ ancreId: ID(11), numero: "512", page: 158 }],
      texte: ["Avant d’aborder l’articulation détachée, assurez-vous que la main reste souple."],
    },
    {
      index: 200,
      numero: 200,
      elements: [{ ancreId: ID(12), numero: "844", page: 200 }],
      texte: ["Rien à voir avec ce qu’on cherche ici."],
    },
  ],
});

const genre = (groupes: ReturnType<typeof chercher>, quel: string): ReturnType<typeof chercher>[number] | undefined =>
  groupes.find((groupe) => groupe.genre === quel);

describe("ce qu'une requête vide donne", () => {
  it("rien : une liste de tout n'est pas une réponse", () => {
    expect(chercher(VUE, "")).toEqual([]);
    expect(chercher(VUE, "   ")).toEqual([]);
  });
});

describe("trouver malgré les accents et la casse", () => {
  it("« detachee » trouve « détachée »", () => {
    const groupes = chercher(VUE, "detachee");
    expect(genre(groupes, "element")?.resultats).toHaveLength(2);
  });

  it("« ARTICULATION » trouve « articulation »", () => {
    expect(chercher(VUE, "ARTICULATION").length).toBeGreaterThan(0);
  });

  it("ne trouve pas ce qui n'y est pas", () => {
    expect(chercher(VUE, "clavecin")).toEqual([]);
  });
});

describe("montrer où ça correspond, dans le texte d'origine", () => {
  it("surligne « détachée » et non « detachee » : les positions sont celles de l'original", () => {
    const premier = genre(chercher(VUE, "detachee"), "element")!.resultats[0]!;
    const portion = premier.surlignesExtrait![0]!;
    expect(premier.extrait!.slice(portion.debut, portion.fin)).toBe("détachée");
  });

  it("surligne la suite entière d'un seul tenant quand on la cherche entière", () => {
    const premier = genre(chercher(VUE, "articulation detachee"), "element")!.resultats[0]!;
    const portion = premier.surlignesExtrait![0]!;
    expect(premier.extrait!.slice(portion.debut, portion.fin)).toBe("articulation détachée");
  });

  it("surligne le titre là où il correspond, et seulement là", () => {
    const premier = genre(chercher(VUE, "articulation"), "element")!.resultats[0]!;
    const [portion] = premier.surlignesTitre;
    expect(premier.titre.slice(portion!.debut, portion!.fin)).toBe("articulation");
  });

  it("fond deux correspondances qui se touchent, au lieu d'en marquer deux emboîtées", () => {
    const premier = genre(chercher(VUE, "art articulation"), "element")!.resultats[0]!;
    expect(premier.surlignesTitre).toHaveLength(1);
    expect(premier.titre.slice(premier.surlignesTitre[0]!.debut, premier.surlignesTitre[0]!.fin)).toBe("articulation");
  });

  it("coupe l'extrait autour de la correspondance, et le dit par des points de suite", () => {
    const resultat = genre(chercher(VUE, "souple"), "page")!.resultats[0]!;
    expect(resultat.extrait!.startsWith("…")).toBe(true);
    const portion = resultat.surlignesExtrait![0]!;
    expect(resultat.extrait!.slice(portion.debut, portion.fin)).toBe("souple");
  });

  it("découpe le texte en morceaux marqués et non marqués, pour que l'écran n'ait rien à calculer", () => {
    const morceaux = morceler("Travail d’articulation", [{ debut: 10, fin: 22 }]);
    expect(morceaux.map((m) => m.texte).join("")).toBe("Travail d’articulation");
    expect(morceaux.filter((m) => m.marque).map((m) => m.texte)).toEqual(["articulation"]);
  });
});

describe("les groupes, nommés avec les mots de la bibliothèque (CLA-01)", () => {
  const groupes = chercher(VUE, "articulation");

  it("portent les mots de cette bibliothèque, pas les nôtres", () => {
    expect(groupes.map((groupe) => groupe.libelle)).toEqual(
      expect.arrayContaining(["Repères", "Feuillets", "Plages"]),
    );
  });

  it("n'affichent pas un groupe vide", () => {
    for (const groupe of groupes) expect(groupe.resultats.length, groupe.libelle).toBeGreaterThan(0);
  });

  it("montrent la piste reliée : c'est le même lien, vu de l'autre bout (ANC-02)", () => {
    const piste = genre(groupes, "piste")!.resultats[0]!;
    expect(piste.titre).toContain("Plage 40");
    expect(piste.piste).toBe(40);
  });

  it("disent où aller : une page, et l'élément quand il y en a un", () => {
    const element = genre(groupes, "element")!.resultats[0]!;
    expect(element.page).toBe(127);
    expect(element.element).toBe(ID(10));
  });

  it("écrivent la source avec les mots de la bibliothèque", () => {
    expect(genre(groupes, "element")!.resultats[0]!.source).toBe("Une bibliothèque · feuillet 127");
  });
});

describe("les actions viennent de l'écran, jamais du noyau", () => {
  const actions = [
    { cle: "filtrer", titre: "Filtrer sur « Articulation »", source: "Technique · 46 repères" },
    { cle: "relire", titre: "Revoir la manière de lire", source: "Une bibliothèque", aussi: ["recette"] },
  ];

  it("ne retient que celles que la requête touche", () => {
    const groupes = chercher(VUE, "articulation", { actions });
    expect(genre(groupes, "action")!.resultats.map((r) => r.cle)).toEqual(["action:filtrer"]);
  });

  it("se trouvent aussi par un mot qui n'est pas dans leur titre", () => {
    const groupes = chercher(VUE, "recette", { actions });
    expect(genre(groupes, "action")!.resultats.map((r) => r.cle)).toEqual(["action:relire"]);
  });

  it("n'existent pas quand l'écran n'en donne aucune", () => {
    expect(genre(chercher(VUE, "articulation"), "action")).toBeUndefined();
  });
});

describe("ce que le clavier parcourt", () => {
  it("une seule suite, d'un groupe à l'autre, dans l'ordre affiché", () => {
    const groupes = chercher(VUE, "articulation");
    const file = aLaFile(groupes);
    expect(file).toHaveLength(groupes.reduce((somme, groupe) => somme + groupe.resultats.length, 0));
    expect(file[0]!.genre).toBe("element");
  });

  it("chaque résultat a une clé qui lui est propre : le clavier doit pouvoir s'y tenir", () => {
    const cles = aLaFile(chercher(VUE, "articulation")).map((resultat) => resultat.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });
});

describe("une liste qu'on ne parcourt plus d'un coup d'œil n'est plus une aide", () => {
  it("borne chaque groupe", () => {
    const beaucoup = VueBibliotheque.parse({
      ...VUE,
      pages: Array.from({ length: PAR_GROUPE + 4 }, (_, rang) => ({
        index: rang + 1,
        numero: rang + 1,
        elements: [],
        texte: ["articulation détachée"],
      })),
    });
    expect(genre(chercher(beaucoup, "articulation"), "page")!.resultats).toHaveLength(PAR_GROUPE);
  });
});

describe("la recherche lit les passages du document, non une copie dans la vue (RCH-07, RCH-09)", () => {
  /** Une vue sans une ligne de texte : c'est l'état réel après un traitement.
   *
   *  `PageAffichee.texte` existe au contrat, et rien ne le remplit — la chaîne range son texte
   *  dans les passages de la version. Tant que la recherche ne lisait que ce champ, elle ne
   *  trouvait rien dans l'application, alors que la ligne de commande trouvait tout. */
  const SANS_TEXTE = VueBibliotheque.parse({
    id: ID(2),
    nom: "La mini-bibliothèque",
    mots: {
      element: { un: "repère", plusieurs: "repères" },
      piste: { un: "plage", plusieurs: "plages" },
      page: { un: "feuillet", plusieurs: "feuillets" },
    },
    compteurs: [],
    pages: [{ index: 42, numero: 42, elements: [] }],
  });

  const passage = (rang: number, page: number, texte: string, imprimee?: number): unknown => ({
    rang,
    page,
    texte,
    source: "couche_texte",
    lisible: true,
    ...(imprimee === undefined ? {} : { pageImprimee: imprimee }),
  });

  const PASSAGES = [
    passage(0, 1, "Avant-propos de l’ouvrage.", 1),
    passage(1, 57, "La mémoire traumatique ne se raconte pas comme un souvenir ordinaire.", 42),
    passage(2, 58, "Elle revient par fragments, sans date ni ordre."),
  ].map((brut) => Passage.parse(brut));

  it("trouve une suite de mots qui n’existe que dans les passages", () => {
    expect(chercher(SANS_TEXTE, "mémoire traumatique")).toEqual([]);

    const groupes = chercher(SANS_TEXTE, "mémoire traumatique", { passages: PASSAGES });
    const pages = groupes.find((groupe) => groupe.genre === "page");
    expect(pages, "la recherche ne rend rien alors que le passage porte les deux mots").toBeDefined();
    expect(pages?.resultats).toHaveLength(1);
    expect(pages?.resultats[0]?.extrait).toContain("mémoire traumatique");
    expect(pages?.resultats[0]?.surlignesExtrait?.length ?? 0).toBeGreaterThan(0);
  });

  it("cite le feuillet imprimé quand il est connu, et le rang du document sinon", () => {
    // La jointure qui semblait évidente est fausse : `PageAffichee.numero` est le numéro
    // **imprimé** (instantane.ts le range par `ligne.pageImprimee`), tandis que `Passage.page`
    // est le rang dans le document. Les confondre citerait le feuillet 57 pour un texte
    // imprimé 42. Et le numéro imprimé n'est pas toujours connu : mesuré sur un livre de
    // quatre-vingt-seize pages, sept numéros pour vingt-sept passages.
    const imprime = chercher(SANS_TEXTE, "traumatique", { passages: PASSAGES });
    const resultatImprime = imprime.find((g) => g.genre === "page")?.resultats[0];
    expect(resultatImprime?.cote).toBe("feuillet 42");
    expect(resultatImprime?.page, "la navigation emploie le rang réel, pas le numéro imprimé").toBe(57);
    expect(resultatImprime?.cibleRecherche).toEqual({
      passage: 1,
      requete: "traumatique",
      debut: "La mémoire ".length,
    });

    const sansNumero = chercher(SANS_TEXTE, "fragments", { passages: PASSAGES });
    expect(sansNumero.find((g) => g.genre === "page")?.resultats[0]?.cote).toBe("feuillet 58 du document");
  });

  it("ne rend jamais deux fois la même page, quel que soit le nombre de passages qui répondent", () => {
    const serres = [
      passage(0, 7, "La honte revient par vagues.", 12),
      passage(1, 7, "La honte, encore, au détour d’une phrase.", 12),
    ].map((brut) => Passage.parse(brut));
    const groupes = chercher(SANS_TEXTE, "honte", { passages: serres });
    expect(groupes.find((g) => g.genre === "page")?.resultats).toHaveLength(1);
  });
});

describe("la suite entière avant le mot isolé, et rien d'exclu (RCH-07, FMT-04)", () => {
  /** Mesuré sur la mini-bibliothèque, sept vrais documents : « mémoire traumatique » rendait
   *  462 résultats, dont **cinq** portaient la suite entière. Les 457 autres ne portaient que
   *  « mémoire » ou que « traumatique ». La recherche composait déjà ses morceaux comme
   *  `[phrase, ...mots]` pour surligner la suite d'un seul tenant, mais ne s'en servait pas
   *  pour ordonner : la personne devait parcourir des centaines de lignes avant la bonne.
   *
   *  On n'exclut rien pour autant : un mot isolé reste une réponse, simplement moins sûre. */
  const VIDE = VueBibliotheque.parse({
    id: ID(3),
    nom: "Corpus",
    mots: {
      element: { un: "repère", plusieurs: "repères" },
      piste: { un: "plage", plusieurs: "plages" },
      page: { un: "feuillet", plusieurs: "feuillets" },
    },
    compteurs: [],
    pages: [],
  });

  const passage = (rang: number, page: number, texte: string): Passage =>
    Passage.parse({ rang, page, texte, source: "couche_texte", lisible: true });

  const CORPUS = [
    passage(0, 1, "Un mot isolé : la mémoire des lieux, et rien de plus."),
    passage(1, 2, "La mémoire traumatique ne se raconte pas comme un souvenir ordinaire."),
    passage(2, 3, "Un autre mot isolé : un événement traumatique parmi d’autres."),
  ];

  it("met en tête les passages qui portent la suite entière", () => {
    const groupes = chercher(VIDE, "mémoire traumatique", { passages: CORPUS });
    const pages = groupes.find((groupe) => groupe.genre === "page");
    expect(pages?.resultats[0]?.extrait, "la suite entière doit venir en premier").toContain(
      "mémoire traumatique",
    );
  });

  it("n’exclut aucun des mots isolés : ils suivent, ils ne disparaissent pas", () => {
    const groupes = chercher(VIDE, "mémoire traumatique", { passages: CORPUS });
    const pages = groupes.find((groupe) => groupe.genre === "page");
    expect(pages?.resultats, "les trois passages répondent, un seul porte la suite").toHaveLength(3);
    const extraits = (pages?.resultats ?? []).map((resultat) => resultat.extrait ?? "").join(" | ");
    expect(extraits).toContain("mémoire des lieux");
    expect(extraits).toContain("événement traumatique");
  });

  /** Une page entière, où un mot de la requête traîne bien avant la suite qu'on cherche.
   *
   *  C'est le cas ordinaire d'un vrai livre, et il échappait aux épreuves ci-dessus parce
   *  qu'elles tenaient en une ligne : la suite y était toujours à portée de la fenêtre. Relevé
   *  le 20 octobre 2026 en faisant passer un document du corpus par la porte de l'application —
   *  la recherche citait la première page du livre pour une phrase imprimée page 87. */
  const AU_LOIN = passage(
    3,
    87,
    "La mémoire des familles occupe ces pages, longuement, et l’on y revient sans jamais " +
      "la nommer tout à fait ; puis vient la mémoire traumatique, qui ne se raconte pas.",
  );

  it("centre l’extrait sur la suite entière, même si un mot de la requête apparaît bien avant", () => {
    const groupes = chercher(VIDE, "mémoire traumatique", { passages: [AU_LOIN] });
    const premier = groupes.find((groupe) => groupe.genre === "page")?.resultats[0];
    // La fenêtre se prenait autour de la **première** correspondance, quelle qu'elle soit : sur
    // une page de deux mille signes, elle montrait un mot isolé du début et jamais la suite.
    expect(premier?.extrait, "l’extrait montre un mot isolé au lieu de ce qu’on a cherché").toContain(
      "mémoire traumatique",
    );
  });

  it("met en tête la page qui porte la suite, même quand son premier mot trouvé est isolé", () => {
    // Et c'est la conséquence qui compte : la sûreté se juge sur l'extrait. Un extrait qui
    // manquait la suite faisait passer la bonne page pour du bruit, et la citation tombait sur
    // une autre page — le critère de BAS-02 pris à l'envers.
    const groupes = chercher(VIDE, "mémoire traumatique", { passages: [CORPUS[0]!, AU_LOIN] });
    const pages = groupes.find((groupe) => groupe.genre === "page");
    expect(pages?.resultats).toHaveLength(2);
    expect(pages?.resultats[0]?.cote).toBe("feuillet 87 du document");
  });

  it("ne change rien à l’ordre quand la requête n’a qu’un mot", () => {
    const groupes = chercher(VIDE, "traumatique", { passages: CORPUS });
    const pages = groupes.find((groupe) => groupe.genre === "page");
    expect(pages?.resultats).toHaveLength(2);
    // L'ordre reste celui des passages : sans suite à privilégier, il n'y a rien à remonter.
    expect(pages?.resultats[0]?.cote).toBe("feuillet 2 du document");
  });
});
