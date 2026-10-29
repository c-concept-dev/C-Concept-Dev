import { describe, expect, it } from "vitest";
import { DecisionDeLecture, Oracle, type Observation } from "@lienotheque/contrats";
import {
  choisirEchantillonEtTemoins,
  construireOracle,
  eprouverSurTemoins,
  observationsDuCoordinateur,
  sourcesDesDecisions,
} from "../src/index.js";

/** Du coordinateur à l'oracle (OUT-10). */

const CONTENEUR = "a".repeat(64);
const piece = (rang: number): string => String(rang).padStart(2, "0").repeat(32);

const observation = (source: Observation["source"] = "nom"): Observation => ({
  detecteur: "noms",
  source,
  constat: "le nom porte un rang",
  ou: "01 - un.mp3",
  confiance: 1,
});

const retenue = (repere: number, source: Observation["source"] = "nom"): DecisionDeLecture =>
  DecisionDeLecture.parse({
    etat: "retenue",
    repere,
    piece: piece(repere),
    venue: "locale",
    confiance: 1,
    observations: [observation(source)],
  });

const aVerifier = (repere: number, ...raisons: string[]): DecisionDeLecture =>
  DecisionDeLecture.parse({ etat: "a_verifier", repere, raisons });

describe("où regarder, et où vérifier ensuite (OUT-10)", () => {
  const trente = Array.from({ length: 30 }, (_, rang) => rang + 1);

  it("prend le début et la fin, et ne dépasse pas huit repères", () => {
    const { echantillon } = choisirEchantillonEtTemoins(trente);
    expect(echantillon).toHaveLength(8);
    expect(echantillon).toContain(1);
    expect(echantillon).toContain(30);
  });

  it("les témoins ne touchent jamais l’échantillon", () => {
    const { echantillon, temoins } = choisirEchantillonEtTemoins(trente);
    expect(temoins.filter((temoin) => echantillon.includes(temoin))).toEqual([]);
    expect(temoins.length).toBeGreaterThan(0);
  });

  it("regarde d’abord là où une autre source dit déjà quelque chose", () => {
    // Un nom de fichier annonce une adresse pour les repères 13 et 17 : c'est là qu'on apprend
    // à la fois le gabarit et si cette autre source dit vrai.
    const { echantillon } = choisirEchantillonEtTemoins(trente, { designes: [13, 17] });
    expect(echantillon).toContain(13);
    expect(echantillon).toContain(17);
  });

  it("ne retient pas un repère désigné qui n’existe pas", () => {
    const { echantillon } = choisirEchantillonEtTemoins(trente, { designes: [999] });
    expect(echantillon).not.toContain(999);
  });

  it("se contente de ce qu’il y a quand le conteneur est court", () => {
    const { echantillon, temoins } = choisirEchantillonEtTemoins([1, 2, 3]);
    expect(echantillon.length).toBeLessThanOrEqual(3);
    expect(temoins.filter((temoin) => echantillon.includes(temoin))).toEqual([]);
  });

  it("rend deux ensembles vides quand il n’y a aucun repère", () => {
    expect(choisirEchantillonEtTemoins([])).toEqual({ echantillon: [], temoins: [] });
  });
});

describe("des décisions à l’hypothèse (OUT-10)", () => {
  const batir = (decisions: readonly DecisionDeLecture[], tous: readonly number[] = [1, 2, 3, 4, 5]) =>
    construireOracle({
      id: "par-le-nom",
      conteneur: CONTENEUR,
      detecteurs: ["noms"],
      echantillon: [1, 2],
      temoins: [4, 5],
      decisions,
      tousLesReperes: tous,
      etabliLe: 1_793_000_000,
    });

  it("bâtit un oracle que le contrat accepte", () => {
    const oracle = batir([retenue(1), retenue(2), retenue(3)]);
    expect(() => Oracle.parse(oracle)).not.toThrow();
    expect(oracle.propositions).toHaveLength(3);
  });

  it("nomme les repères qu’il laisse, au lieu de les oublier", () => {
    const oracle = batir([retenue(1), retenue(2)]);
    expect(oracle.sansProposition, "les repères non couverts doivent être dits").toEqual([3, 4, 5]);
  });

  it("garde les raisons d’un refus : un refus n’est pas un silence", () => {
    const oracle = batir([retenue(1), aVerifier(3, "la relecture ne corrobore pas", "confiance sous le seuil")]);
    expect(oracle.desaccords).toEqual([
      "repère 3 : la relecture ne corrobore pas",
      "repère 3 : confiance sous le seuil",
    ]);
    expect(oracle.sansProposition).toContain(3);
  });

  it("range les propositions par repère, quel que soit l’ordre des décisions", () => {
    const oracle = batir([retenue(3), retenue(1), retenue(2)]);
    expect(oracle.propositions.map((proposition) => proposition.repere.rang)).toEqual([1, 2, 3]);
  });

  it("relève les sources, pour que la corroboration sache ce qui est indépendant", () => {
    expect([...sourcesDesDecisions([retenue(1, "nom"), retenue(2, "contenu")])].sort()).toEqual(["contenu", "nom"]);
    expect([...sourcesDesDecisions([aVerifier(1, "rien")])]).toEqual([]);
  });
});

describe("éprouver l’hypothèse sur ce qu’elle n’a pas vu (OUT-10)", () => {
  const oracle = construireOracle({
    id: "par-le-nom",
    conteneur: CONTENEUR,
    detecteurs: ["noms"],
    echantillon: [1, 2],
    temoins: [4, 5, 6],
    decisions: [retenue(1), retenue(4), retenue(5)],
    tousLesReperes: [1, 2, 4, 5, 6],
    etabliLe: 1_793_000_000,
  });

  it("tient quand la source indépendante dit la même chose", () => {
    const epreuve = eprouverSurTemoins(oracle, (repere) => piece(repere));
    expect(epreuve.tenus).toEqual([4, 5]);
    expect(epreuve.manques).toEqual([]);
  });

  it("manque quand elle dit autre chose", () => {
    const epreuve = eprouverSurTemoins(oracle, (repere) => (repere === 5 ? piece(99) : piece(repere)));
    expect(epreuve.manques).toEqual([5]);
  });

  it("compte à part un témoin sur lequel personne ne sait rien", () => {
    const epreuve = eprouverSurTemoins(oracle, (repere) => (repere === 4 ? undefined : piece(repere)));
    expect(epreuve.nonJugeables, "un silence n’est ni une réussite ni un échec").toContain(4);
    expect(epreuve.tenus).not.toContain(4);
    expect(epreuve.manques).not.toContain(4);
  });

  it("compte à part un témoin que l’hypothèse ne couvre pas", () => {
    // Le repère 6 est témoin mais l'oracle ne s'est pas prononcé : rien à réfuter.
    const epreuve = eprouverSurTemoins(oracle, (repere) => piece(repere));
    expect(epreuve.nonJugeables).toContain(6);
  });
});

describe("le coordinateur dit ce qu’il a coûté (OUT-10)", () => {
  it("compte les repères retenus, ceux passés par une relecture, et ceux laissés", () => {
    const decisions = [
      retenue(1),
      DecisionDeLecture.parse({ ...retenue(2), venue: "vision_corroboree" }),
      aVerifier(3, "sans corroboration"),
    ];
    const [observation] = observationsDuCoordinateur(decisions, "conteneur d’essai");
    expect(observation?.constat).toMatch(/2 repère\(s\) retenu\(s\) sur 3/);
    expect(observation?.constat).toMatch(/dont 1 après une relecture corroborée/);
    expect(observation?.source).toBe("croisement");
  });
});
