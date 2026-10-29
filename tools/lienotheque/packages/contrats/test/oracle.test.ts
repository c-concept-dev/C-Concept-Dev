import { describe, expect, it } from "vitest";
import { Observation, Oracle, Proposition, Repere, Verdict } from "../src/index.js";

/** Les contrats du moteur oracle (OUT-10).
 *
 *  Ce que ces contrôles tiennent n'est pas la forme des données — Zod s'en charge — mais les
 *  quatre interdits que la journée du 29 octobre 2026 a payés comptant :
 *
 *  1. une adresse ne se calcule pas, elle se lit ;
 *  2. une proposition sans observation n'existe pas ;
 *  3. un témoin ne peut pas venir de l'échantillon ;
 *  4. une abstention dit pourquoi.
 */

const CONTENEUR = "a".repeat(64);
const PIECE = "b".repeat(64);

const observation = (detecteur = "nom-structure"): unknown => ({
  detecteur,
  source: "nom",
  constat: "Le nom porte un rang en deux chiffres suivi d’un identifiant",
  ou: "01 - element #1.mp3",
  confiance: 1,
});

const proposition = (rang: number, detecteur?: string): unknown => ({
  repere: { rang },
  piece: PIECE,
  observations: [observation(detecteur)],
});

const oracle = (modifications: Record<string, unknown> = {}): unknown => ({
  id: "nom-structure",
  conteneur: CONTENEUR,
  detecteurs: ["nom-structure"],
  echantillon: [1, 2],
  temoins: [8],
  propositions: [proposition(1)],
  sansProposition: [],
  desaccords: [],
  etabliLe: 1_793_000_000,
  ...modifications,
});

describe("un repère porte son rang, et son adresse seulement si le contenu la porte (OUT-10)", () => {
  it("accepte un repère sans adresse : la plupart n’en ont pas", () => {
    expect(Repere.safeParse({ rang: 7 }).success).toBe(true);
  });

  it("refuse un rang qui part de zéro : les deux conventions du projet se sont déjà décalées d’une unité", () => {
    expect(Repere.safeParse({ rang: 0 }).success).toBe(false);
  });

  it("garde l’adresse telle qu’elle est écrite, sans la ramener à un nombre", () => {
    // Un minutage, un numéro de section, un folio en chiffres romains : tout cela est une
    // adresse, et rien de cela n’est un entier.
    expect(Repere.parse({ rang: 7, adresse: "xii" }).adresse).toBe("xii");
    expect(Repere.parse({ rang: 7, adresse: "00:04:12" }).adresse).toBe("00:04:12");
  });
});

describe("une proposition ne tient que par ce qui l’appuie (OUT-10)", () => {
  it("refuse une proposition sans aucune observation", () => {
    const sansRien = { repere: { rang: 1 }, piece: PIECE, observations: [] };
    expect(Proposition.safeParse(sansRien).success, "un lien sans la moindre observation a été accepté").toBe(false);
  });

  it("exige de chaque observation qu’elle dise où la revérifier", () => {
    const { ou: _sansOu, ...aveugle } = observation() as Record<string, unknown>;
    expect(Observation.safeParse(aveugle).success).toBe(false);
  });

  it("nomme le détecteur en minuscules, pour qu’on sache quoi rejouer", () => {
    expect(Observation.safeParse({ ...(observation("Nom Structuré") as object) }).success).toBe(false);
  });
});

describe("un oracle porte de quoi le réfuter (OUT-10)", () => {
  it("accepte un oracle complet", () => {
    expect(Oracle.safeParse(oracle()).success).toBe(true);
  });

  it("refuse un témoin pris dans l’échantillon", () => {
    const lu = Oracle.safeParse(oracle({ echantillon: [1, 2, 8], temoins: [8] }));
    expect(lu.success, "une hypothèse a pu s’éprouver sur ce qui l’a formée").toBe(false);
    expect(JSON.stringify(lu.error?.issues)).toMatch(/hors de l.échantillon/);
  });

  it("refuse deux propositions sur le même repère", () => {
    const lu = Oracle.safeParse(oracle({ propositions: [proposition(3), proposition(3)] }));
    expect(lu.success).toBe(false);
  });

  it("refuse de déclarer sans proposition un rang qui en porte une", () => {
    const lu = Oracle.safeParse(oracle({ propositions: [proposition(4)], sansProposition: [4] }));
    expect(lu.success).toBe(false);
  });

  it("accepte un oracle qui ne propose rien, pourvu qu’il dise ce qu’il laisse", () => {
    // C’est le cas le plus fréquent et le plus utile : un conteneur sur lequel aucun détecteur
    // n’a rien vu doit pouvoir exister, et le dire.
    const vide = oracle({ propositions: [], sansProposition: [1, 2, 3], temoins: [] });
    expect(Oracle.safeParse(vide).success).toBe(true);
  });

  it("exige un identifiant, pour qu’on sache lequel a dit quoi", () => {
    const { id: _sans, ...anonyme } = oracle() as Record<string, unknown>;
    expect(Oracle.safeParse(anonyme).success, "un oracle sans nom a été accepté").toBe(false);
    expect(Oracle.safeParse(oracle({ id: "Nom Structuré" })).success).toBe(false);
  });

  it("exige au moins un détecteur nommé", () => {
    expect(Oracle.safeParse(oracle({ detecteurs: [] })).success).toBe(false);
  });
});

describe("un verdict dit ce qu’il fait, et pourquoi (OUT-10)", () => {
  it("une publication nomme les oracles qui l’autorisent", () => {
    const publie = {
      etat: "publie",
      oracles: ["nom-structure", "table-imprimee"],
      verifieParUnHumain: false,
      pourquoi: "Deux façons de lire indépendantes s’accordent sur les 52 repères.",
    };
    expect(Verdict.safeParse(publie).success).toBe(true);
  });

  it("refuse une publication qui ne nomme aucun oracle", () => {
    const creux = { etat: "publie", oracles: [], verifieParUnHumain: true, pourquoi: "parce que." };
    expect(Verdict.safeParse(creux).success).toBe(false);
  });

  it("une abstention porte toujours son motif et sa phrase", () => {
    const abstention = {
      etat: "abstention",
      motif: "oracles_en_desaccord",
      pourquoi: "Deux façons de lire se contredisent sur 8 repères.",
      pourLever: "Regarder les 8 repères en désaccord et trancher.",
    };
    expect(Verdict.safeParse(abstention).success).toBe(true);
  });

  it("refuse un motif d’abstention inventé en route", () => {
    const flou = { etat: "abstention", motif: "pas_sur", pourquoi: "on ne sait pas trop." };
    expect(Verdict.safeParse(flou).success).toBe(false);
  });

  it("distingue les cinq motifs, parce qu’ils n’appellent pas le même geste", () => {
    const motifs = [
      "aucun_oracle",
      "oracle_unique_sans_verification",
      "oracles_en_desaccord",
      "temoins_non_eprouves",
      "temoins_en_echec",
    ];
    for (const motif of motifs)
      expect(Verdict.safeParse({ etat: "abstention", motif, pourquoi: "—" }).success, motif).toBe(true);
  });
});
