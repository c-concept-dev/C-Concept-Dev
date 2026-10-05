import { describe, expect, it } from "vitest";
import { attribuerPistes, type LecturePiste, type ReglesPistes } from "../src/index.js";

/** D'où vient la dérive d'attribution de F4 (A3, REC-02).
 *
 *  Après la correction d'orientation, F4 rend 52 premiers éléments justes sur 92. Des quarante
 *  écarts restants, vingt-sept portent la même signature : l'élément attribué à la piste N
 *  appartient en réalité à la piste N−1 — autrement dit la piste rendue vaut la vraie **plus un**.
 *
 *  Ces contrôles cherchent où cette dérive peut naître, sur des lots construits : un lot comme
 *  F4, deux éléments par piste, chacun portant son repère, et une part de lectures dégradées.
 *  Rien ici ne lit un document : ils tournent partout, et ils disent ce que l'attribution fait
 *  d'un bruit donné.
 *
 *  Ce qu'ils établissent : l'attribution n'est pas fragile. Elle encaisse une lecture fausse sur
 *  quatre sans broncher. Ce qu'elle ne peut pas faire, c'est contredire un biais *systématique* —
 *  et c'est là qu'il faut chercher, en amont, plutôt que dans la règle de pas. */

const regles = (nombreDePistes: number): ReglesPistes => ({
  pasAutorises: [0, 1],
  penalitePas2: 1.5,
  egaleNumeroElement: false,
  nombreDePistes,
});

const net = (piste: number): LecturePiste => ({ pisteLue: piste, accordPiste: 1, presencePiste: 1 });

/** Un lot à la manière de F4 : chaque piste porte deux éléments, et chacun son repère. */
function lotCommeF4(
  pistes: number,
  degrader: (rang: number, piste: number) => LecturePiste,
  parPiste = 2,
): { verite: number[]; rendu: number[] } {
  const verite: number[] = [];
  const lectures: LecturePiste[] = [];
  let rang = 0;
  for (let piste = 1; piste <= pistes; piste += 1)
    for (let n = 0; n < parPiste; n += 1) {
      verite.push(piste);
      lectures.push(degrader(rang, piste));
      rang += 1;
    }
  return { verite, rendu: attribuerPistes(lectures, regles(pistes)) };
}

/** Combien d'éléments tombent sur chaque écart, du rendu à la vérité. */
const derive = ({ verite, rendu }: { verite: number[]; rendu: number[] }): Map<number, number> => {
  const par = new Map<number, number>();
  rendu.forEach((piste, rang) => par.set(piste - verite[rang]!, (par.get(piste - verite[rang]!) ?? 0) + 1));
  return par;
};

const justes = (resultat: { verite: number[]; rendu: number[] }): number =>
  resultat.rendu.filter((piste, rang) => piste === resultat.verite[rang]).length;

describe("l'attribution encaisse le bruit isolé", () => {
  it("rend la vérité sur des lectures franches", () => {
    const resultat = lotCommeF4(92, (_rang, piste) => net(piste));
    expect(justes(resultat)).toBe(184);
    expect(derive(resultat)).toEqual(new Map([[0, 184]]));
  });

  it("ne bronche pas quand une lecture sur quatre est faible", () => {
    const resultat = lotCommeF4(92, (rang, piste) =>
      rang % 4 === 0 ? { pisteLue: piste, accordPiste: 0.25, presencePiste: 1 } : net(piste),
    );
    expect(justes(resultat)).toBe(184);
  });

  it("ne bronche pas quand une lecture sur quatre perd un chiffre", () => {
    // « 13 » lu « 3 » : l'appui partiel et la suite alentour suffisent à la redresser.
    const resultat = lotCommeF4(92, (rang, piste) =>
      rang % 4 === 0 ? net(Number(String(piste).slice(-1)) || piste) : net(piste),
    );
    expect(justes(resultat)).toBe(184);
  });

  it("ne bronche pas quand une lecture sur quatre désigne la piste suivante", () => {
    const resultat = lotCommeF4(92, (rang, piste) => (rang % 4 === 0 ? net(piste + 1) : net(piste)));
    expect(justes(resultat), "trois lectures justes sur quatre l'emportent").toBe(184);
  });
});

describe("mais elle suit un biais systématique, et c'est là qu'il faut chercher", () => {
  it("dérive dès qu'une lecture sur trois désigne la piste suivante", () => {
    const resultat = lotCommeF4(92, (rang, piste) => (rang % 3 === 0 ? net(piste + 1) : net(piste)));
    expect(justes(resultat)).toBeLessThan(184);
    // Et la dérive va dans un seul sens : vers le haut, jamais vers le bas.
    for (const ecart of derive(resultat).keys()) expect(ecart).toBeGreaterThanOrEqual(0);
  });

  it("dérive de +1 sur la moitié du lot quand le second élément de chaque piste lit une piste trop haut", () => {
    const resultat = lotCommeF4(92, (rang, piste) => (rang % 2 === 1 ? net(piste + 1) : net(piste)));
    const ecarts = derive(resultat);
    expect(ecarts.get(1), "la moitié des éléments rendus une piste trop haut").toBeGreaterThan(80);
    expect([...ecarts.keys()].filter((ecart) => ecart < 0), "jamais vers le bas").toEqual([]);
  });

  it("ne dérive jamais vers le bas, quel que soit le bruit : la suite préfère avancer", () => {
    // `PENALITE_REPETITION` fait coûter un pas de 0 là où un pas de 1 est gratuit. À appui égal,
    // l'attribution avance donc — ce qui est voulu, et qui explique que la dérive soit à sens
    // unique. Aucun réglage de cette pénalité ne ferait reculer une suite que les lectures
    // poussent en avant.
    for (const sur of [2, 3, 4, 5]) {
      const resultat = lotCommeF4(60, (rang, piste) => (rang % sur === 0 ? net(piste + 1) : net(piste)));
      for (const ecart of derive(resultat).keys()) expect(ecart, `une lecture sur ${sur}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ce que ces lots ne disent pas encore", () => {
  it("un repère juste mais attribué au mauvais élément produit la même signature", () => {
    // Deuxième mécanisme possible, et indiscernable du premier sans les images : si la fenêtre
    // de recherche d'un repère déborde sur l'élément suivant, l'élément lit le repère du suivant
    // — soit, exactement, « une piste trop haut ». Les deux hypothèses rendent la même dérive à
    // sens unique ; seules les images de F4 les sépareront.
    const resultat = lotCommeF4(40, (rang, piste) => (rang % 2 === 1 ? net(piste + 1) : net(piste)));
    expect(derive(resultat).get(1)).toBeGreaterThan(0);
  });
});
