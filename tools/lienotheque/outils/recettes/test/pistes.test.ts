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

/** La preuve répétée l'emporte sur l'attente de régularité (REC-02).
 *
 *  Mesuré le 29 octobre 2026 sur un recueil réel : trois éléments consécutifs portent la même
 *  marque, lue **99**, avec des accords de 0,89, 1,00 et 0,90 — et l'ajustement de la suite les
 *  écrasait en 93, 94, 95, parce qu'un pas de sept n'est pas dans les pas autorisés : non pas
 *  pénalisé, mais **inatteignable**. Trois lectures justes perdues pour faire tenir une
 *  continuité que rien ne garantit.
 *
 *  La règle ne connaît aucun document : elle ne demande ni fait extérieur ni déclaration, mais
 *  des **observations distinctes qui concordent**. Et elle garde l'alerte intacte là où rien ne
 *  vient la contredire. */
describe("une lecture corroborée contre l’attente de régularité (REC-02)", () => {
  /** Un lot qui commence au début, comme un vrai lot : sur trois éléments partant de 91, le coût
   *  d'un départ lointain pèse plus que les lectures elles-mêmes, et ce comportement-là est
   *  antérieur à cette règle — `[91, 92, 93]` rend déjà `[1, 2, 3]` sans elle. */
  const jusqua = (combien: number): LecturePiste[] =>
    Array.from({ length: combien }, (_, place) => lu(place + 1));

  it("enjambe quand plusieurs éléments voisins lisent la même chose", () => {
    const lectures = [...jusqua(8), lu(15), lu(15), lu(15)];
    expect(attribuerPistes(lectures, regles({ nombreDePistes: 99 }))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 15, 15, 15,
    ]);
  });

  it("enjambe aussi quand les lectures d’après se suivent au lieu de se répéter", () => {
    const lectures = [...jusqua(8), lu(40), lu(41), lu(42)];
    expect(attribuerPistes(lectures, regles({ nombreDePistes: 99 }))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 40, 41, 42,
    ]);
  });

  it("redresse une lecture isolée que personne ne corrobore — la protection essentielle", () => {
    // Un chiffre mal reconnu au milieu de voisins réguliers n'ouvre rien.
    const lectures = [...jusqua(8), lu(73), lu(10), lu(11)];
    expect(attribuerPistes(lectures, regles({ nombreDePistes: 99 }))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  it("n’enjambe pas sur des lectures hésitantes, si concordantes soient-elles", () => {
    const lectures = [...jusqua(8), lu(15, 0.3), lu(15, 0.3), lu(15, 0.3)];
    const pistes = attribuerPistes(lectures, regles({ nombreDePistes: 99 }));
    expect(pistes[8]! - pistes[7]!, "l’hésitation ne vaut pas preuve").toBeLessThanOrEqual(1);
  });

  it("laisse le manque visible quand rien n’est lu là où la suite s’interrompt", () => {
    // Le cas d'une partie réellement absente : aucune lecture ne vient corroborer quoi que ce
    // soit, l'attente de continuité garde la main, et le trou reste un trou.
    const lectures = [...jusqua(8), lu(undefined), lu(undefined), lu(undefined)];
    const pistes = attribuerPistes(lectures, regles({ nombreDePistes: 99 }));
    expect(pistes.slice(8), "la suite continue sagement, sans inventer de saut").toEqual([9, 10, 11]);
  });

  it("ne recule jamais : un saut corroboré va vers l’avant, pas vers l’arrière", () => {
    const lectures = [...jusqua(8), lu(3), lu(3), lu(3)];
    const pistes = attribuerPistes(lectures, regles({ nombreDePistes: 99 }));
    expect(pistes[8]!, "revenir en arrière n’est pas un saut").toBeGreaterThanOrEqual(pistes[7]!);
  });

  it("n’ouvre rien pour une lecture franche que rien ne suit", () => {
    const lectures = [...jusqua(8), lu(40)];
    const pistes = attribuerPistes(lectures, regles({ nombreDePistes: 99 }));
    expect(pistes[8]! - pistes[7]!, "seule, une lecture ne se corrobore pas").toBeLessThanOrEqual(1);
  });
});

describe("une marque mal lue ne réécrit pas ses voisines (REC-02, OUT-10)", () => {
  /** Relevé le 30 octobre 2026 sur le document témoin, dont les 95 liens sont vérifiés à
   *  l'oreille. Ses marques se lisent 37 fois sur 40 ; les trois erreurs sont des confusions d'un
   *  seul chiffre. Avant cette règle, l'une d'elles réécrivait **huit** marques lues correctement
   *  sur les deux pages voisines — parce que le saut autorisé se mesurait entre deux lectures
   *  brutes, et qu'une valeur fausse y fabriquait un pas inexistant dans le document. */
  it("mesure le saut depuis ce que la suite amont annonce, non depuis la dernière valeur brute (REC-02)", () => {
    // Quatre lectures qui s'enchaînent, dont la dernière est mal lue — « 8 » rendu « 3 » —,
    // puis une page qui reprend à 13. La suite amont annonce 8 : le saut vaut donc 5, et non 10.
    const lectures = [lu(5), lu(6), lu(7), lu(3), lu(13), lu(14), lu(15), lu(16)];
    expect(attribuerPistes(lectures, regles({ nombreDePistes: 99 }))).toEqual([
      5, 6, 7, 8, 13, 14, 15, 16,
    ]);
  });

  it("laisse intacte une suite déjà juste (REC-02)", () => {
    const lectures = [lu(5), lu(6), lu(7), lu(8), lu(13), lu(14), lu(15), lu(16)];
    expect(attribuerPistes(lectures, regles({ nombreDePistes: 99 }))).toEqual([
      5, 6, 7, 8, 13, 14, 15, 16,
    ]);
  });

  it("ne fabrique pas de saut depuis une suite amont qui n'en est pas une (REC-02)", () => {
    // Des lectures qui ne s'enchaînent sous aucun pas ordinaire n'annoncent rien : la suite
    // garde la main, et le manque reste visible comme un manque.
    const lectures = [lu(5), lu(40), lu(7), lu(60)];
    const rendu = attribuerPistes(lectures, regles({ nombreDePistes: 99 }));
    expect(rendu.length).toBe(4);
    expect(rendu[3]).not.toBe(60);
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
