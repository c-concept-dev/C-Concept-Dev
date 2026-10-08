import { describe, expect, it } from "vitest";
import { VueBibliotheque } from "@lienotheque/contrats";
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
      numero: 158,
      titre: "Introduction du quatrième ensemble",
      elements: [{ ancreId: ID(11), numero: "512", page: 158 }],
      texte: ["Avant d’aborder l’articulation détachée, assurez-vous que la main reste souple."],
    },
    {
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
        numero: rang + 1,
        elements: [],
        texte: ["articulation détachée"],
      })),
    });
    expect(genre(chercher(beaucoup, "articulation"), "page")!.resultats).toHaveLength(PAR_GROUPE);
  });
});
