import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appui, attribuerPistes, changementDeSupport, chargerRecette, reglesDePistes, type LecturePiste, type ReglesPistes } from "../src/index.js";

const RECETTES = join(import.meta.dirname, "../../../fixtures/recettes");
const WESTWOOD = chargerRecette(JSON.parse(readFileSync(join(RECETTES, "methode-pastilles-cd.v4.json"), "utf8")));
const FUNK = chargerRecette(JSON.parse(readFileSync(join(RECETTES, "methode-pastille-piste.v2.json"), "utf8")));

const lu = (pisteLue: number | undefined, accordPiste = 1): LecturePiste => ({
  ...(pisteLue === undefined ? {} : { pisteLue }),
  accordPiste: pisteLue === undefined ? 0 : accordPiste,
  presencePiste: 1,
});

const regles = (sur: Partial<ReglesPistes> = {}): ReglesPistes => ({
  pasAutorises: [0, 1],
  penalitePas2: 1.5,
  egaleNumeroElement: false,
  nombreDePistes: 92,
  ...sur,
});

describe("appui d'une lecture (REC-02)", () => {
  it("entier quand la lecture est la piste", () => {
    expect(appui(14, 14)).toBe(1);
  });

  it("partiel quand un chiffre a été perdu", () => {
    expect(appui(4, 14)).toBeGreaterThan(0);
    expect(appui(4, 14)).toBeLessThan(1);
    expect(appui(1, 14)).toBeGreaterThan(0);
  });

  it("plus faible quand la lecture en dit plus que la piste : inventer est pire que manquer", () => {
    expect(appui(14, 4)).toBeLessThan(appui(4, 14));
  });

  it("nul quand rien ne se recoupe", () => {
    expect(appui(7, 23)).toBe(0);
    expect(appui(23, 7)).toBe(0);
  });
});

describe("règles de pistes tirées de la recette (REC-01)", () => {
  it("reprend les pas et la pénalité déclarés", () => {
    const lues = reglesDePistes(WESTWOOD, 92);
    expect(lues.pasAutorises).toEqual([0, 1]);
    expect(lues.penalitePas2).toBe(1.5);
    expect(lues.changementDisque).toEqual({ lecturesSuresConsecutives: 3, valeurMax: 5 });
  });

  it("n'invente pas un changement de disque là où la recette n'en déclare pas", () => {
    expect(reglesDePistes(FUNK, 99).changementDisque).toBeUndefined();
  });

  it("retient que la piste porte le numéro de l'élément quand la recette le dit", () => {
    expect(reglesDePistes(FUNK, 99).egaleNumeroElement).toBe(true);
    expect(reglesDePistes(WESTWOOD, 92).egaleNumeroElement).toBe(false);
  });
});

describe("attribution des pistes (REC-02, A3)", () => {
  it("suit des lectures franches", () => {
    expect(attribuerPistes([lu(1), lu(2), lu(3), lu(4)], regles())).toEqual([1, 2, 3, 4]);
  });

  it("redresse une lecture fautive que la suite contredit", () => {
    // Le « 4 » au milieu de 1, 2, 3, 5 ne tient pas : la suite impose 4.
    expect(attribuerPistes([lu(1), lu(2), lu(93), lu(4)], regles())).toEqual([1, 2, 3, 4]);
  });

  it("répète une piste quand deux éléments la partagent", () => {
    expect(attribuerPistes([lu(1), lu(1), lu(2)], regles())).toEqual([1, 1, 2]);
  });

  it("saute une piste quand la recette le permet, en le payant", () => {
    const sans = attribuerPistes([lu(1), lu(3)], regles({ penalitePas2: undefined }));
    expect(sans, "sans pénalité déclarée, le pas de 2 n'est pas permis").toEqual([1, 2]);
    expect(attribuerPistes([lu(1), lu(3)], regles())).toEqual([1, 3]);
  });

  it("tient compte d'un chiffre perdu : « 4 » lu là où la suite attend 14", () => {
    const lectures = [lu(12), lu(13), lu(4), lu(15)];
    expect(attribuerPistes(lectures, regles())).toEqual([12, 13, 14, 15]);
  });

  it("avance malgré une lecture absente", () => {
    expect(attribuerPistes([lu(1), lu(undefined), lu(3)], regles())).toEqual([1, 2, 3]);
  });

  it("ne rend rien sur un lot vide, et une piste sur un lot d'un", () => {
    expect(attribuerPistes([], regles())).toEqual([]);
    expect(attribuerPistes([lu(1)], regles())).toEqual([1]);
  });

  it("compte le numéro de l'élément quand la recette dit qu'il vaut la piste", () => {
    // Trois lectures égarées : sans la coïncidence déclarée, la suite partirait ailleurs.
    const lectures = [
      { ...lu(4, 0.4), numero: 11 },
      { ...lu(4, 0.4), numero: 12 },
      { ...lu(4, 0.4), numero: 13 },
    ];
    expect(attribuerPistes(lectures, regles({ egaleNumeroElement: true }))).toEqual([11, 12, 13]);
    expect(attribuerPistes(lectures, regles())).not.toEqual([11, 12, 13]);
  });

  it("enjambe les pistes que des éléments absents emportaient avec eux", () => {
    // Les éléments 93 à 98 manquent au lot : les six pistes qu'ils ouvraient manquent aussi.
    // La recette n'autorise qu'un pas de 1, mais elle déclare que piste et numéro coïncident —
    // l'écart entre deux numéros est alors un pas légitime.
    const lectures = [
      { ...lu(91), numero: 91 },
      { ...lu(92), numero: 92 },
      { ...lu(99), numero: 99 },
    ];
    expect(attribuerPistes(lectures, regles({ egaleNumeroElement: true, nombreDePistes: 99 }))).toEqual([91, 92, 99]);
  });

  it("n'enjambe rien quand la recette ne déclare pas la coïncidence", () => {
    const lectures = [
      { ...lu(91), numero: 91 },
      { ...lu(92), numero: 92 },
      { ...lu(99), numero: 99 },
    ];
    const pistes = attribuerPistes(lectures, regles({ nombreDePistes: 99 }));
    expect(pistes[2]! - pistes[1]!).toBeLessThanOrEqual(2);
  });

  it("rend le même résultat à chaque exécution", () => {
    const lectures = [lu(1), lu(undefined), lu(undefined), lu(5)];
    expect(attribuerPistes(lectures, regles())).toEqual(attribuerPistes(lectures, regles()));
  });
});

describe("changement de support (A3)", () => {
  const avecChangement = regles({ changementDisque: { lecturesSuresConsecutives: 3, valeurMax: 5 } });

  it("repère un retour à 1 après une numérotation bien engagée", () => {
    const lectures = [...Array.from({ length: 25 }, (_, rang) => lu(rang + 1)), lu(1), lu(2), lu(3)];
    expect(changementDeSupport(lectures, avecChangement)).toBe(25);
  });

  it("ne se laisse pas prendre par une seule petite lecture", () => {
    const lectures = [...Array.from({ length: 25 }, (_, rang) => lu(rang + 1)), lu(2), lu(27), lu(28)];
    expect(changementDeSupport(lectures, avecChangement)).toBeUndefined();
  });

  it("ne voit pas de changement au début d'un lot : la numérotation n'y est pas engagée", () => {
    expect(changementDeSupport([lu(1), lu(2), lu(3)], avecChangement)).toBeUndefined();
  });

  it("ne cherche rien quand la recette n'en déclare pas", () => {
    const lectures = [...Array.from({ length: 25 }, (_, rang) => lu(rang + 1)), lu(1), lu(2), lu(3)];
    expect(changementDeSupport(lectures, regles({ changementDisque: undefined }))).toBeUndefined();
  });

  it("ignore les lectures peu sûres", () => {
    const lectures = [...Array.from({ length: 25 }, (_, rang) => lu(rang + 1)), lu(1, 0.2), lu(2, 0.2), lu(3, 0.2)];
    expect(changementDeSupport(lectures, avecChangement)).toBeUndefined();
  });
});

describe("une lecture tronquée ne fonde pas un changement de support (A5, OUT-08)", () => {
  const avecChangement = regles({ changementDisque: { lecturesSuresConsecutives: 3, valeurMax: 5 } });
  const engagee = () => Array.from({ length: 25 }, (_, rang) => lu(rang + 1));

  it("ignore trois petites lectures dont le repère montrait deux chiffres", () => {
    // « 2 », « 3 », « 4 » tirés de repères à deux chiffres : ce sont 82, 83, 84, pas un retour au
    // début. C'est le cas mesuré sur F4, qui coupait le premier support en deux.
    const tronquees = [2, 3, 4].map((valeur) => ({ ...lu(valeur), chiffresComptes: 2 }));
    expect(changementDeSupport([...engagee(), ...tronquees], avecChangement)).toBeUndefined();
  });

  it("mais voit toujours un vrai retour au début", () => {
    const vraies = [1, 2, 3].map((valeur) => ({ ...lu(valeur), chiffresComptes: 1 }));
    expect(changementDeSupport([...engagee(), ...vraies], avecChangement)).toBe(25);
  });

  it("ne change rien quand le comptage n'a pas eu lieu", () => {
    expect(changementDeSupport([...engagee(), lu(1), lu(2), lu(3)], avecChangement)).toBe(25);
  });

  it("n'empêche pas une lecture complète de compter, même à deux chiffres", () => {
    // Un support qui reprendrait à 11, 12, 13 avec une valeur maximale de 15.
    const large = regles({ changementDisque: { lecturesSuresConsecutives: 3, valeurMax: 15 } });
    const completes = [11, 12, 13].map((valeur) => ({ ...lu(valeur), chiffresComptes: 2 }));
    expect(changementDeSupport([...Array.from({ length: 70 }, (_, rang) => lu(rang + 1)), ...completes], large)).toBe(70);
  });
});
