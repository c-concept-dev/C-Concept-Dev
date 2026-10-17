import { describe, expect, it } from "vitest";
import { SchemaBibliotheque } from "@lienotheque/contrats";
import { GesteRefuse, ajouterAxe, aplatir, deplacerValeur, enfantsDe, racinesDe, rendreHierarchique, retirerValeur } from "../src/index.js";

/** Les gestes de la hiérarchie : catégories et sous-catégories (CLA-02).
 *
 *  Écrits avant le code (CLAUDE.md, règle 2). Le contrat portait la hiérarchie depuis le début —
 *  `StructureAxe`, `ValeurReferentiel.parent` — et la défendait sévèrement, mais `ajouterAxe`
 *  écrivait `structure: "plat"` en dur et aucun geste ne savait donner un parent. Une capacité
 *  décrite au contrat que rien ne remplit : le même défaut que les passages qui n'existaient pas
 *  et que le plafond de tentatives qui ne se déclenchait jamais.
 *
 *  Aucun mot de domaine ici : les axes et valeurs d'épreuve sont nommés par des lettres.
 */

const schema = (valeurs: readonly { cle: string; nom: string; parent?: string }[], structure = "plat" as const) =>
  SchemaBibliotheque.parse({
    cle: "essai",
    nom: "Essai",
    langue: "fr",
    version: 1,
    axes: [
      {
        cle: "a",
        nom: "A",
        nature: "referentiel",
        cardinalite: "une",
        structure,
        valeurs: valeurs.map((v) => ({ ...v, alias: [] })),
        alias: [],
      },
    ],
  });

const TROIS = [
  { cle: "v1", nom: "V1" },
  { cle: "v2", nom: "V2" },
  { cle: "v3", nom: "V3" },
];

const axe = (s: SchemaBibliotheque) => s.axes[0]!;
const valeur = (s: SchemaBibliotheque, cle: string) => axe(s).valeurs.find((v) => v.cle === cle);

describe("rendre une façon de ranger hiérarchique (CLA-02)", () => {
  it("la rend hiérarchique sans toucher à ses valeurs, et compte une version", () => {
    const avant = schema(TROIS);
    const apres = rendreHierarchique(avant, "a");
    expect(axe(apres).structure).toBe("hierarchique");
    expect(axe(apres).valeurs.map((v) => v.cle)).toEqual(["v1", "v2", "v3"]);
    expect(apres.version, "une modification est une version (REC-03)").toBe(avant.version + 1);
  });

  it("refuse de la rendre hiérarchique deux fois : le geste dirait avoir fait quelque chose", () => {
    const deja = rendreHierarchique(schema(TROIS), "a");
    expect(() => rendreHierarchique(deja, "a")).toThrow(GesteRefuse);
  });

  it("refuse sur une façon de ranger qui n'a pas de référentiel : il n'y a rien à ranger en arbre", () => {
    const etiquettes = SchemaBibliotheque.parse({
      cle: "essai",
      nom: "Essai",
      langue: "fr",
      version: 1,
      axes: [{ cle: "a", nom: "A", nature: "etiquettes", cardinalite: "plusieurs", structure: "plat", valeurs: [], alias: [] }],
    });
    expect(() => rendreHierarchique(etiquettes, "a")).toThrow(GesteRefuse);
  });

  it("refuse sur une façon de ranger qui n'existe pas, plutôt que de la deviner", () => {
    expect(() => rendreHierarchique(schema(TROIS), "absente")).toThrow(GesteRefuse);
  });
});

describe("revenir à plat ne perd rien en silence (CLA-03)", () => {
  it("refuse tant qu'une valeur a un parent, et dit lesquelles", () => {
    // Le piège : repasser à plat effacerait les parents, et l'arbre que vous avez construit
    // disparaîtrait sans un mot. On refuse, et on nomme ce qui retient.
    const arbre = deplacerValeur(rendreHierarchique(schema(TROIS), "a"), "a", "v2", "v1");
    expect(() => aplatir(arbre, "a")).toThrow(/V2/);
  });

  it("accepte quand plus aucune valeur n'a de parent", () => {
    const arbre = deplacerValeur(rendreHierarchique(schema(TROIS), "a"), "a", "v2", "v1");
    const detache = deplacerValeur(arbre, "a", "v2", undefined);
    const plat = aplatir(detache, "a");
    expect(axe(plat).structure).toBe("plat");
    expect(axe(plat).valeurs.map((v) => v.cle)).toEqual(["v1", "v2", "v3"]);
  });

  it("refuse sur une façon de ranger déjà à plat", () => {
    expect(() => aplatir(schema(TROIS), "a")).toThrow(GesteRefuse);
  });
});

describe("donner un parent à une valeur (CLA-02)", () => {
  const arbre = rendreHierarchique(schema(TROIS), "a");

  it("la range sous sa catégorie, et compte une version", () => {
    const apres = deplacerValeur(arbre, "a", "v2", "v1");
    expect(valeur(apres, "v2")?.parent).toBe("v1");
    expect(apres.version).toBe(arbre.version + 1);
  });

  it("la détache quand on ne donne aucun parent", () => {
    const sous = deplacerValeur(arbre, "a", "v2", "v1");
    expect(valeur(deplacerValeur(sous, "a", "v2", undefined), "v2")?.parent).toBeUndefined();
  });

  it("refuse sur une façon de ranger à plat : c'est l'autre geste qu'on voulait", () => {
    expect(() => deplacerValeur(schema(TROIS), "a", "v2", "v1")).toThrow(GesteRefuse);
  });

  it("refuse qu'une valeur soit son propre parent", () => {
    expect(() => deplacerValeur(arbre, "a", "v1", "v1")).toThrow(GesteRefuse);
  });

  it("refuse un parent inconnu plutôt que de l'inventer", () => {
    expect(() => deplacerValeur(arbre, "a", "v2", "absente")).toThrow(GesteRefuse);
  });

  it("refuse une ronde, même indirecte", () => {
    // v2 sous v1, v3 sous v2 : mettre v1 sous v3 ferait tourner la parenté en rond. Le contrat
    // le refuserait à l'écriture ; le geste doit le refuser avant, avec un mot qu'on comprend.
    const chaine = deplacerValeur(deplacerValeur(arbre, "a", "v2", "v1"), "a", "v3", "v2");
    expect(() => deplacerValeur(chaine, "a", "v1", "v3")).toThrow(/rond/i);
  });

  it("refuse de ranger sous une valeur retirée : on ne classe pas sous ce qui n'est plus", () => {
    const avecRetiree = retirerValeur(arbre, "a", "v3", "v1");
    expect(() => deplacerValeur(avecRetiree, "a", "v2", "v3")).toThrow(GesteRefuse);
  });
});

describe("lire l'arbre, pour l'afficher (CLA-02)", () => {
  const arbre = deplacerValeur(deplacerValeur(rendreHierarchique(schema(TROIS), "a"), "a", "v2", "v1"), "a", "v3", "v1");

  it("les racines sont les valeurs sans parent", () => {
    expect(racinesDe(axe(arbre)).map((v) => v.cle)).toEqual(["v1"]);
  });

  it("les enfants d'une valeur, dans l'ordre où elles sont déclarées", () => {
    expect(enfantsDe(axe(arbre), "v1").map((v) => v.cle)).toEqual(["v2", "v3"]);
    expect(enfantsDe(axe(arbre), "v2")).toEqual([]);
  });

  it("sur une façon de ranger à plat, tout est racine et personne n'a d'enfant", () => {
    const plat = axe(schema(TROIS));
    expect(racinesDe(plat)).toHaveLength(3);
    expect(enfantsDe(plat, "v1")).toEqual([]);
  });

  it("ne rend pas les valeurs retirées parmi les racines : elles ne se montrent plus (CLA-03)", () => {
    const sansV3 = retirerValeur(rendreHierarchique(schema(TROIS), "a"), "a", "v3", "v1");
    expect(racinesDe(axe(sansV3)).map((v) => v.cle)).toEqual(["v1", "v2"]);
  });
});

describe("une façon de ranger neuve peut naître hiérarchique", () => {
  it("ajouterAxe accepte une structure, au lieu de l'écrire en dur", () => {
    // `ajouterAxe` posait `structure: "plat"` sans paramètre : une façon de ranger ne pouvait
    // donc jamais naître en arbre, et rien ne pouvait la rendre telle ensuite.
    const avec = ajouterAxe(schema(TROIS), "B", "etiquettes", "plusieurs", "hierarchique");
    expect(avec.axes.find((a) => a.nom === "B")?.structure).toBe("hierarchique");
  });

  it("reste à plat quand on ne dit rien : le défaut ne change pas", () => {
    const avec = ajouterAxe(schema(TROIS), "B");
    expect(avec.axes.find((a) => a.nom === "B")?.structure).toBe("plat");
  });
});
