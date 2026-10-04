// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DecoupeMedia } from "@lienotheque/contrats";
import { decouper, energieParTranche, niveauDeReference, silences } from "../src/index.js";

const FREQUENCE = 8000;

/** Un signal fait de passages sonores et de silences, décrits en secondes. */
function signal(parties: readonly { duree: number; niveau: number }[]): Float32Array {
  const total = parties.reduce((somme, partie) => somme + Math.round(partie.duree * FREQUENCE), 0);
  const echantillons = new Float32Array(total);
  let position = 0;
  for (const partie of parties) {
    const longueur = Math.round(partie.duree * FREQUENCE);
    for (let rang = 0; rang < longueur; rang += 1)
      echantillons[position + rang] = partie.niveau * Math.sin((2 * Math.PI * 220 * rang) / FREQUENCE);
    position += longueur;
  }
  return echantillons;
}

describe("énergie par tranche (A4)", () => {
  it("rend une valeur par tranche, et suit le niveau", () => {
    const energies = energieParTranche(signal([{ duree: 1, niveau: 0.5 }]), FREQUENCE, 0.1);
    expect(energies).toHaveLength(10);
    for (const energie of energies) expect(energie).toBeGreaterThan(0.3);
  });

  it("tombe à zéro sur du silence absolu", () => {
    const energies = energieParTranche(new Float32Array(FREQUENCE), FREQUENCE, 0.1);
    expect([...energies].every((energie) => energie === 0)).toBe(true);
  });
});

describe("niveau de référence (A4)", () => {
  it("ne se laisse pas déplacer par un passage très fort", () => {
    const calme = energieParTranche(signal([{ duree: 5, niveau: 0.3 }, { duree: 0.2, niveau: 1 }]), FREQUENCE);
    expect(niveauDeReference(calme)).toBeLessThan(0.3);
    expect(niveauDeReference(calme)).toBeGreaterThan(0.15);
  });

  it("ignore les tranches muettes", () => {
    const avecSilence = energieParTranche(signal([{ duree: 3, niveau: 0.4 }, { duree: 3, niveau: 0 }]), FREQUENCE);
    expect(niveauDeReference(avecSilence)).toBeGreaterThan(0.2);
  });

  it("rend zéro sur un média entièrement muet", () => {
    expect(niveauDeReference(energieParTranche(new Float32Array(FREQUENCE), FREQUENCE))).toBe(0);
  });
});

describe("silences (A4)", () => {
  it("trouve un creux franc qui dure", () => {
    const trouves = silences(signal([{ duree: 4, niveau: 0.5 }, { duree: 2, niveau: 0 }, { duree: 4, niveau: 0.5 }]), FREQUENCE);
    expect(trouves).toHaveLength(1);
    expect(trouves[0]!.debut).toBeCloseTo(4, 1);
    expect(trouves[0]!.fin).toBeCloseTo(6, 1);
  });

  it("ne retient pas une respiration trop courte", () => {
    const trouves = silences(signal([{ duree: 4, niveau: 0.5 }, { duree: 0.2, niveau: 0 }, { duree: 4, niveau: 0.5 }]), FREQUENCE);
    expect(trouves).toEqual([]);
  });

  it("mesure le silence par rapport au morceau, pas dans l'absolu", () => {
    // Même forme, gravée dix fois moins fort : les silences sont les mêmes.
    const fort = silences(signal([{ duree: 4, niveau: 0.8 }, { duree: 2, niveau: 0 }, { duree: 4, niveau: 0.8 }]), FREQUENCE);
    const bas = silences(signal([{ duree: 4, niveau: 0.08 }, { duree: 2, niveau: 0 }, { duree: 4, niveau: 0.08 }]), FREQUENCE);
    expect(bas).toEqual(fort);
  });

  it("rend un seul silence sur un média entièrement muet", () => {
    expect(silences(new Float32Array(FREQUENCE * 5), FREQUENCE)).toHaveLength(1);
  });
});

describe("découpe d'un média (A4, ANC-03)", () => {
  const troisElements = signal([
    { duree: 10, niveau: 0.6 },
    { duree: 1.5, niveau: 0 },
    { duree: 8, niveau: 0.6 },
    { duree: 1.5, niveau: 0 },
    { duree: 6, niveau: 0.6 },
  ]);

  it("rend un segment par élément, séparés aux silences", () => {
    const decoupe = decouper(troisElements, FREQUENCE);
    expect(DecoupeMedia.safeParse(decoupe).success).toBe(true);
    expect(decoupe.segments).toHaveLength(3);
    expect(decoupe.segments[0]!.fin).toBeCloseTo(10, 0);
    expect(decoupe.segments[1]!.debut).toBeCloseTo(11.5, 0);
    expect(decoupe.segments[2]!.fin).toBeCloseTo(decoupe.dureeS, 1);
  });

  it("accorde plus de confiance à une coupure que borde un long silence", () => {
    const courte = decouper(signal([{ duree: 10, niveau: 0.6 }, { duree: 0.7, niveau: 0 }, { duree: 8, niveau: 0.6 }]), FREQUENCE);
    const longue = decouper(signal([{ duree: 10, niveau: 0.6 }, { duree: 3, niveau: 0 }, { duree: 8, niveau: 0.6 }]), FREQUENCE);
    expect(longue.segments[0]!.confiance).toBeGreaterThan(courte.segments[0]!.confiance);
  });

  it("rattache un fragment trop court à ce qui le suit : un décompte annonce son élément", () => {
    const avecDecompte = decouper(
      signal([
        { duree: 10, niveau: 0.6 },
        { duree: 1, niveau: 0 },
        { duree: 1, niveau: 0.6 },
        { duree: 1, niveau: 0 },
        { duree: 8, niveau: 0.6 },
      ]),
      FREQUENCE,
    );
    expect(avecDecompte.segments).toHaveLength(2);
    // Le fragment de la onzième seconde ouvre le second segment, il ne clôt pas le premier.
    expect(avecDecompte.segments[0]!.fin).toBeCloseTo(10, 0);
    expect(avecDecompte.segments[1]!.debut).toBeCloseTo(11, 0);
  });

  it("un décompte en tête de média ouvre le premier élément", () => {
    const decoupe = decouper(
      signal([
        { duree: 0.8, niveau: 0.6 },
        { duree: 1, niveau: 0 },
        { duree: 12, niveau: 0.6 },
      ]),
      FREQUENCE,
    );
    expect(decoupe.segments).toHaveLength(1);
    expect(decoupe.segments[0]!.debut).toBe(0);
  });

  it("un fragment resté sans suite rejoint ce qui le précède", () => {
    const decoupe = decouper(
      signal([
        { duree: 12, niveau: 0.6 },
        { duree: 1, niveau: 0 },
        { duree: 1, niveau: 0.6 },
      ]),
      FREQUENCE,
    );
    expect(decoupe.segments).toHaveLength(1);
    expect(decoupe.segments[0]!.fin).toBeCloseTo(14, 0);
  });

  it("rend un seul segment quand rien ne sépare", () => {
    expect(decouper(signal([{ duree: 20, niveau: 0.6 }]), FREQUENCE).segments).toHaveLength(1);
  });

  it("ne rend aucun segment d'un média entièrement muet : il n'y a rien à situer", () => {
    expect(decouper(new Float32Array(FREQUENCE * 10), FREQUENCE).segments).toEqual([]);
  });

  it("aucun segment ne dépasse la durée du média", () => {
    const decoupe = decouper(troisElements, FREQUENCE);
    for (const segment of decoupe.segments) expect(segment.fin).toBeLessThanOrEqual(decoupe.dureeS);
  });
});
