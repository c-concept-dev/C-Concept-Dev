import { describe, expect, it } from "vitest";
import { Observation } from "@lienotheque/contrats";
import {
  apresVision,
  autoriserVision,
  BUDGET_PAR_DEFAUT,
  gabaritAuRepere,
  observationDeLaPolitique,
  type MemoireDeStructure,
} from "../src/index.js";

/** Vision une fois par dépôt (OUT-08, OUT-10).
 *
 *  Ce qui est éprouvé ici n'est pas ce qu'un regard rapporte — cela se joue ailleurs — mais que
 *  le second regard soit **refusé**, et que l'exception soit comptée plutôt que tolérée.
 */

const CONTENEUR = "a".repeat(64);
const VIVIER = "b".repeat(64);
const ici = { conteneur: CONTENEUR, empreinteDuVivier: VIVIER };

type Gabarit = { readonly nom: string };

const gabarit = (nom: string, depuis: number) => ({
  depuis,
  modele: { nom } as Gabarit,
  reperesObserves: [depuis, depuis + 1],
  demandeLe: 1_793_000_000,
});

const apresUnRegard = (): MemoireDeStructure<Gabarit> => apresVision(undefined, ici, gabarit("premier", 1));

describe("le premier regard est accordé (OUT-08)", () => {
  it("accorde quand rien n’a jamais été observé", () => {
    const verdict = autoriserVision<Gabarit>(undefined, { motif: "premiere_decouverte" }, ici);
    expect(verdict.autorise).toBe(true);
  });

  it("compte le regard, même si ce qu’il a rapporté ne sert à rien", () => {
    const memoire = apresUnRegard();
    expect(memoire.regardsDepenses, "un appel qui n’a rien donné a coûté autant qu’un autre").toBe(1);
    expect(memoire.segments).toHaveLength(1);
  });
});

describe("le second regard est refusé (OUT-08)", () => {
  it("refuse une seconde découverte, et dit que ce qui a été appris sert", () => {
    const verdict = autoriserVision(apresUnRegard(), { motif: "premiere_decouverte" }, ici);
    expect(verdict.autorise, "« une fois par dépôt » doit être une règle, pas une intention").toBe(false);
    if (!verdict.autorise) {
      expect(verdict.motifDuRefus).toBe("deja_observe");
      expect(verdict.pourquoi).toMatch(/déjà été observé/);
    }
  });

  it("refuse aussi quand on redemande sans rien déclarer", () => {
    // Pas de rupture nommée : on ne redemande pas « pour voir ».
    const verdict = autoriserVision(apresUnRegard(), { motif: "premiere_decouverte" }, ici);
    expect(verdict.autorise).toBe(false);
  });
});

describe("une rupture déclarée rouvre le droit, dans un budget compté (OUT-08)", () => {
  it("accorde un regard pour une rupture nommée, avec son repère", () => {
    const verdict = autoriserVision(apresUnRegard(), { motif: "rupture_declaree", depuis: 40, raison: "la mise en page change" }, ici);
    expect(verdict.autorise).toBe(true);
    expect(verdict.pourquoi).toMatch(/repère 40/);
  });

  it("refuse une rupture déjà regardée au même repère", () => {
    const deux = apresVision(apresUnRegard(), ici, gabarit("second", 40));
    const verdict = autoriserVision(deux, { motif: "rupture_declaree", depuis: 40, raison: "encore" }, ici);
    expect(verdict.autorise).toBe(false);
    if (!verdict.autorise) expect(verdict.motifDuRefus).toBe("deja_observe");
  });

  it("refuse quand le budget est épuisé, et nomme ce que cela veut dire", () => {
    let memoire = apresUnRegard();
    for (const depuis of [40, 80]) memoire = apresVision(memoire, ici, gabarit(`g${depuis}`, depuis));
    expect(memoire.regardsDepenses).toBe(BUDGET_PAR_DEFAUT.regardsParConteneur);
    const verdict = autoriserVision(memoire, { motif: "rupture_declaree", depuis: 120, raison: "encore une" }, ici);
    expect(verdict.autorise).toBe(false);
    if (!verdict.autorise) {
      expect(verdict.motifDuRefus).toBe("budget_epuise");
      expect(verdict.pourquoi, "un conteneur qui déclare dix ruptures résiste à la lecture").toMatch(/résiste à la lecture/);
    }
  });

  it("un budget d’un seul regard interdit toute rupture", () => {
    const verdict = autoriserVision(apresUnRegard(), { motif: "rupture_declaree", depuis: 40, raison: "x" }, ici, {
      regardsParConteneur: 1,
    });
    expect(verdict.autorise).toBe(false);
  });
});

describe("la mémoire tombe quand ce qu’elle décrivait a changé (OUT-08, ID-01)", () => {
  it("rouvre le droit quand le document a changé", () => {
    const ailleurs = { conteneur: "c".repeat(64), empreinteDuVivier: VIVIER };
    const verdict = autoriserVision(apresUnRegard(), { motif: "premiere_decouverte" }, ailleurs);
    expect(verdict.autorise).toBe(true);
    expect(verdict.pourquoi).toMatch(/ne décrit plus/);
  });

  it("rouvre le droit quand les pièces ont changé", () => {
    const autrePieces = { conteneur: CONTENEUR, empreinteDuVivier: "d".repeat(64) };
    expect(autoriserVision(apresUnRegard(), { motif: "premiere_decouverte" }, autrePieces).autorise).toBe(true);
  });

  it("repart de zéro au lieu d’empiler sur une mémoire périmée", () => {
    const ailleurs = { conteneur: "c".repeat(64), empreinteDuVivier: VIVIER };
    const refaite = apresVision(apresUnRegard(), ailleurs, gabarit("neuf", 1));
    expect(refaite.regardsDepenses, "le compte d’un autre conteneur ne se reporte pas").toBe(1);
    expect(refaite.segments).toHaveLength(1);
  });
});

describe("quel gabarit vaut à quel repère (OUT-08)", () => {
  it("rend le dernier gabarit déclaré avant ce repère", () => {
    let memoire = apresUnRegard();
    memoire = apresVision(memoire, ici, gabarit("second", 40));
    expect(gabaritAuRepere(memoire, 10)?.nom).toBe("premier");
    expect(gabaritAuRepere(memoire, 40)?.nom).toBe("second");
    expect(gabaritAuRepere(memoire, 99)?.nom).toBe("second");
  });

  it("ne rend rien avant le premier gabarit connu", () => {
    const memoire = apresVision(undefined, ici, gabarit("depuis-dix", 10));
    expect(gabaritAuRepere(memoire, 3)).toBeUndefined();
  });
});

describe("la politique se consigne, refus compris (OUT-08)", () => {
  it("un refus est une information utile, pas un incident", () => {
    const verdict = autoriserVision(apresUnRegard(), { motif: "premiere_decouverte" }, ici);
    const observation = observationDeLaPolitique(verdict, CONTENEUR);
    expect(() => Observation.parse(observation)).not.toThrow();
    expect(observation.constat).toMatch(/^Aucun regard structurel demandé/);
  });

  it("une demande accordée se consigne aussi", () => {
    const observation = observationDeLaPolitique(
      autoriserVision<Gabarit>(undefined, { motif: "premiere_decouverte" }, ici),
      CONTENEUR,
    );
    expect(observation.constat).toMatch(/^Un regard structurel est demandé/);
  });
});
