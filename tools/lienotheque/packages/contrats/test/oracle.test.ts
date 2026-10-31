import { describe, expect, it } from "vitest";
import { AcquisDeLecture, Observation, Oracle, Proposition, Repere, Verdict } from "../src/index.js";

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

describe("ce que la lecture générique a appris d'un document (OUT-10, REC-02)", () => {
  const commun = {
    conteneur: "a".repeat(64),
    voie: { id: "voie-sans-maniere-de-lire", version: 1 },
    pagesRegardees: 12,
    etabliLe: 1793500000,
  };
  const trouve = {
    etat: "endroit_trouve" as const,
    ...commun,
    endroit: { x: 0.167, y: 0.031, l: 0.043, h: 0.031 },
    motif: "bloc_sombre_chiffres_clairs",
    part: 0.833,
    echantillon: [
      { rang: 1, y: 0.03, valeur: 5 },
      { rang: 2, y: 0.03 },
      { rang: 3, y: 0.03, valeur: 15 },
    ],
    temoins: [{ rang: 4, y: 0.03, valeur: 23 }],
    temoinsEprouves: 28,
    temoinsDAccord: 28,
  };

  it("accepte un acquis qui porte de quoi le réfuter", () => {
    expect(AcquisDeLecture.safeParse(trouve).success).toBe(true);
  });

  it("refuse un endroit retenu dont pas une apparition n'a rien rendu (REC-02)", () => {
    // Douze apparitions regardées, aucune lue : rien n'a été établi. Garder cela reviendrait à se
    // souvenir d'une absence de preuve comme d'une preuve.
    const muet = { ...trouve, echantillon: [{ rang: 1, y: 0.03 }, { rang: 2, y: 0.03 }] };
    expect(AcquisDeLecture.safeParse(muet).success).toBe(false);
  });

  it("refuse un témoin pris dans l'échantillon (REC-02)", () => {
    // La règle de `Oracle`, et pour la même raison : s'éprouver sur ce qui a formé l'hypothèse
    // mesure la mémoire, pas la justesse.
    const complaisant = { ...trouve, temoins: [{ rang: 1, y: 0.03, valeur: 5 }] };
    const lu = AcquisDeLecture.safeParse(complaisant);
    expect(lu.success).toBe(false);
    expect(JSON.stringify(lu.error?.issues)).toMatch(/hors de l'échantillon/);
  });

  it("refuse une note nulle pour un endroit qu'il dit retenu (REC-02)", () => {
    expect(AcquisDeLecture.safeParse({ ...trouve, part: 0 }).success).toBe(false);
  });

  it("refuse une façon de lire qui ne se nomme pas (OUT-10)", () => {
    expect(AcquisDeLecture.safeParse({ ...trouve, motif: "Bloc Sombre" }).success).toBe(false);
  });

  it("refuse de conclure qu'il n'y a rien sans avoir éprouvé un seul essai (REC-02)", () => {
    // C'est le garde-fou contre une exploration arrêtée par son budget : se souvenir de « je n'ai
    // pas fini » autoriserait plus tard à conclure de ce qu'on n'a pas vu.
    const premature = {
      etat: "aucun_endroit" as const,
      ...commun,
      endroitsProposes: 56,
      essaisEprouves: 0,
      borneLaPlusHaute: 0,
    };
    const lu = AcquisDeLecture.safeParse(premature);
    expect(lu.success).toBe(false);
    expect(JSON.stringify(lu.error?.issues)).toMatch(/ce qu'on n'a pas vu/);
  });

  it("accepte qu'aucune forme ne revienne : rien à proposer, rien à éprouver (OUT-10)", () => {
    // Le seul cas où zéro essai est une conclusion honnête, et non un abandon.
    const rienNeRevient = {
      etat: "aucun_endroit" as const,
      ...commun,
      endroitsProposes: 0,
      essaisEprouves: 0,
      borneLaPlusHaute: 0,
    };
    expect(AcquisDeLecture.safeParse(rienNeRevient).success).toBe(true);
  });

  it("garde l'acquis d'une exploration exhaustive avec son plafond démontré (REC-02)", () => {
    const rien = {
      etat: "aucun_endroit" as const,
      ...commun,
      endroitsProposes: 56,
      essaisEprouves: 112,
      borneLaPlusHaute: 0.486,
    };
    expect(AcquisDeLecture.safeParse(rien).success).toBe(true);
  });

  it("refuse une empreinte de vivier glissée dedans (CLA-01, REC-02)", () => {
    // Le vivier n'a rien à faire ici : un acquis ne dépend que du document. L'y laisser entrer
    // ferait tomber la partie chère chaque fois qu'un enregistrement est ajouté.
    expect(AcquisDeLecture.safeParse({ ...trouve, vivier: "b".repeat(64) }).success).toBe(false);
  });

  it("ne vaut que pour le nombre de pages sur lequel il a été formé (OUT-10)", () => {
    // Le champ est obligatoire, et il doit être positif : un acquis sans lui serait réutilisable
    // partout, y compris sur un document dont on n'a lu qu'un extrait.
    const { pagesRegardees: _, ...sansPages } = trouve;
    expect(AcquisDeLecture.safeParse(sansPages).success).toBe(false);
    expect(AcquisDeLecture.safeParse({ ...trouve, pagesRegardees: 0 }).success).toBe(false);
  });
});

describe("une apparition s'identifie par son rang et sa hauteur (OUT-10, REC-02)", () => {
  const commun = {
    conteneur: "a".repeat(64),
    voie: { id: "voie-sans-maniere-de-lire", version: 1 },
    pagesRegardees: 12,
    etabliLe: 1793500000,
  };

  it("accepte un témoin sur une page de l'échantillon, à une autre hauteur (REC-02)", () => {
    // Le cas réel : quarante apparitions sur douze pages, donc plusieurs par page. Celle qui a
    // formé l'hypothèse est en haut, celle qui l'éprouve est au milieu — et ce sont bien deux
    // apparitions distinctes. Comparer les rangs seuls les confondrait et rejetterait la seconde.
    const deuxParPage = {
      etat: "endroit_trouve" as const,
      ...commun,
      endroit: { x: 0.167, y: 0.031, l: 0.043, h: 0.031 },
      motif: "bloc_sombre_chiffres_clairs",
      part: 0.833,
      echantillon: [{ rang: 1, y: 0.031, valeur: 5 }],
      temoins: [{ rang: 1, y: 0.42, valeur: 6 }],
      temoinsEprouves: 39,
      temoinsDAccord: 39,
    };
    expect(AcquisDeLecture.safeParse(deuxParPage).success).toBe(true);
  });
});

describe("les décomptes de témoins ne peuvent pas mentir (REC-02)", () => {
  const base = {
    etat: "endroit_trouve" as const,
    conteneur: "a".repeat(64),
    voie: { id: "voie-sans-maniere-de-lire", version: 1 },
    pagesRegardees: 12,
    etabliLe: 1793500000,
    endroit: { x: 0.167, y: 0.031, l: 0.043, h: 0.031 },
    motif: "bloc_sombre_chiffres_clairs",
    part: 0.833,
    echantillon: [{ rang: 1, y: 0.031, valeur: 5 }],
    temoins: [{ rang: 2, y: 0.031, valeur: 6 }],
    temoinsEprouves: 28,
    temoinsDAccord: 28,
  };

  it("refuse plus de témoins d'accord que de témoins éprouvés", () => {
    expect(AcquisDeLecture.safeParse({ ...base, temoinsDAccord: 29 }).success).toBe(false);
  });

  it("refuse un échantillon de témoins plus grand que ce dont il est tiré", () => {
    // Garder trois témoins d'une épreuve qui n'en a mené qu'un : l'acquis se vanterait.
    const vantard = {
      ...base,
      temoins: [
        { rang: 2, y: 0.031, valeur: 6 },
        { rang: 3, y: 0.031, valeur: 7 },
        { rang: 4, y: 0.031, valeur: 8 },
      ],
      temoinsEprouves: 1,
      temoinsDAccord: 1,
    };
    expect(AcquisDeLecture.safeParse(vantard).success).toBe(false);
  });

  it("accepte qu'aucune apparition n'ait pu être éprouvée hors de l'échantillon", () => {
    // Un document dont l'endroit n'a que douze apparitions : l'échantillon les prend toutes, et
    // il n'y a pas de témoin. Ce n'est pas une faute, c'est un fait — et il doit se dire.
    expect(
      AcquisDeLecture.safeParse({ ...base, temoins: [], temoinsEprouves: 0, temoinsDAccord: 0 }).success,
    ).toBe(true);
  });
});
