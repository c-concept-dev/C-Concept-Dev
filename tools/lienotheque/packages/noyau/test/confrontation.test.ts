import { describe, expect, it } from "vitest";
import { Oracle } from "@lienotheque/contrats";
import {
  confronter,
  epreuveReussie,
  etatDeLOracle,
  retirerLesLiens,
  sourcesDUnOracle,
  verdictDuMoteur,
  type EpreuveSurTemoins,
  type OracleEnregistre,
} from "../src/index.js";

/** Confronter des oracles, et en tirer un verdict (OUT-10).
 *
 *  Les trois voies de publication, telles qu'elles ont été arrêtées le 29 octobre 2026 :
 *  deux façons de lire indépendantes qui s'accordent ; une seule façon et un œil qui l'a
 *  confirmée sur ce conteneur ; sinon l'abstention, et elle dit laquelle des deux manquait.
 */

const CONTENEUR = "a".repeat(64);
const UNE = "1".repeat(64);
const AUTRE = "2".repeat(64);

const observation = (source: "nom" | "contenu" | "arborescence" | "croisement", detecteur: string): unknown => ({
  detecteur,
  source,
  constat: "un repère a été vu",
  ou: "rang 3",
  confiance: 1,
});

const oracleDe = (
  id: string,
  source: "nom" | "contenu" | "arborescence" | "croisement",
  liens: readonly (readonly [number, string])[],
) =>
  Oracle.parse({
    id,
    conteneur: CONTENEUR,
    detecteurs: [id],
    echantillon: [1, 2],
    temoins: [9],
    propositions: liens.map(([rang, piece]) => ({
      repere: { rang },
      piece,
      observations: [observation(source, id)],
    })),
    sansProposition: [],
    desaccords: [],
    etabliLe: 1_793_000_000,
  });

const epreuveTenue: EpreuveSurTemoins = { tenus: [9], manques: [], nonJugeables: [] };
const toutesTenues = (...ids: string[]) => new Map(ids.map((id) => [id, epreuveTenue]));

describe("confronter met les oracles face à face sans en préférer aucun (OUT-10)", () => {
  it("relève les sources de chaque oracle", () => {
    expect([...sourcesDUnOracle(oracleDe("par-le-nom", "nom", [[3, UNE]]))]).toEqual(["nom"]);
  });

  it("compte un accord quand deux oracles proposent la même pièce", () => {
    const face = confronter([oracleDe("par-le-nom", "nom", [[3, UNE]]), oracleDe("par-la-page", "contenu", [[3, UNE]])]);
    expect(face.accords).toEqual([3]);
    expect(face.desaccords).toEqual([]);
    expect(face.independants, "deux sources différentes").toBe(true);
  });

  it("relève un désaccord, et dit qui a dit quoi", () => {
    const face = confronter([
      oracleDe("par-le-nom", "nom", [[3, UNE]]),
      oracleDe("par-la-page", "contenu", [[3, AUTRE]]),
    ]);
    expect(face.accords).toEqual([]);
    expect(face.desaccords).toHaveLength(1);
    expect(face.desaccords[0]?.avis.map((avis) => avis.oracle)).toEqual(["par-le-nom", "par-la-page"]);
  });

  it("ne confond pas un silence avec un désaccord", () => {
    const face = confronter([
      oracleDe("par-le-nom", "nom", [[3, UNE], [4, UNE]]),
      oracleDe("par-la-page", "contenu", [[3, UNE]]),
    ]);
    expect(face.accords).toEqual([3]);
    expect(face.couvertsParUnSeul, "le repère 4 n’est pas contesté, il n’est vu que d’un côté").toEqual([4]);
    expect(face.desaccords).toEqual([]);
  });

  it("deux lectures de la même source ne font pas deux témoins", () => {
    const face = confronter([
      oracleDe("par-le-nom", "nom", [[3, UNE]]),
      oracleDe("par-le-nom-autrement", "nom", [[3, UNE]]),
    ]);
    expect(face.accords).toEqual([3]);
    expect(face.independants, "elles se tromperont ensemble le jour où le nom ment").toBe(false);
  });

  it("deux sources présentes ne se corroborent pas : il faut qu’elles se recoupent", () => {
    // Le cas qui a motivé cette règle. Un recueil n'a qu'un témoin pour son lien — une marque
    // lue sur la page. Le nom de ses fichiers dit seulement quel fichier est quel rang : il
    // identifie la pièce, il ne dit rien du repère auquel elle va. Les deux composés donnent le
    // lien, mais c'est une chaîne, pas deux témoins qui se recoupent.
    const parLaPage = oracleDe("par-la-page", "contenu", [[3, UNE], [4, UNE]]);
    const parLeNom = oracleDe("par-le-nom", "nom", [[7, AUTRE]]); // d'autres repères, aucun commun
    const face = confronter([parLaPage, parLeNom]);
    expect(face.sources, "les deux sources sont bien présentes").toEqual(["contenu", "nom"]);
    expect(face.accords, "mais elles n’ont jamais parlé du même repère").toEqual([]);
    expect(face.independants, "la coexistence a été prise pour une corroboration").toBe(false);
  });

  it("refuse de confronter des oracles faits sur deux conteneurs différents", () => {
    const ailleurs = Oracle.parse({ ...oracleDe("ailleurs", "nom", [[3, UNE]]), conteneur: "b".repeat(64) });
    expect(() => confronter([oracleDe("ici", "nom", [[3, UNE]]), ailleurs])).toThrow(/deux conteneurs/);
  });
});

describe("une épreuve sur témoins ne réussit pas par son silence (OUT-10)", () => {
  it("réussit quand elle a jugé et n’a rien manqué", () => {
    expect(epreuveReussie({ tenus: [9, 10], manques: [], nonJugeables: [] })).toBe(true);
  });

  it("échoue dès qu’elle a manqué quelque chose", () => {
    expect(epreuveReussie({ tenus: [9], manques: [10], nonJugeables: [] })).toBe(false);
  });

  it("ne réussit pas quand rien n’était jugeable", () => {
    expect(
      epreuveReussie({ tenus: [], manques: [], nonJugeables: [9, 10] }),
      "compter un silence pour une preuve est exactement la faute d’un score de 98 sur 98",
    ).toBe(false);
  });
});

describe("le verdict nomme ce qui manquait (OUT-10)", () => {
  it("publie quand deux sources indépendantes s’accordent, sans déranger personne", () => {
    const face = confronter([oracleDe("par-le-nom", "nom", [[3, UNE]]), oracleDe("par-la-page", "contenu", [[3, UNE]])]);
    const verdict = verdictDuMoteur(face, {
      epreuves: toutesTenues("par-le-nom", "par-la-page"),
      verifieParUnHumain: false,
    });
    expect(verdict.etat).toBe("publie");
  });

  it("publie sur une seule source quand un œil l’a confirmée — la deuxième voie", () => {
    const face = confronter([oracleDe("par-la-page", "contenu", [[3, UNE]])]);
    const verdict = verdictDuMoteur(face, { epreuves: toutesTenues("par-la-page"), verifieParUnHumain: true });
    expect(verdict.etat).toBe("publie");
    if (verdict.etat === "publie") expect(verdict.verifieParUnHumain).toBe(true);
  });

  it("s’abstient sur une seule source sans personne pour regarder", () => {
    const face = confronter([oracleDe("par-la-page", "contenu", [[3, UNE]])]);
    const verdict = verdictDuMoteur(face, { epreuves: toutesTenues("par-la-page"), verifieParUnHumain: false });
    expect(verdict.etat).toBe("abstention");
    if (verdict.etat === "abstention") expect(verdict.motif).toBe("oracle_unique_sans_verification");
  });

  it("s’abstient quand rien n’a été trouvé", () => {
    const verdict = verdictDuMoteur(confronter([]), { epreuves: new Map(), verifieParUnHumain: true });
    expect(verdict.etat).toBe("abstention");
    if (verdict.etat === "abstention") expect(verdict.motif).toBe("aucun_oracle");
  });

  it("un désaccord passe avant tout le reste, même avec un œil", () => {
    const face = confronter([
      oracleDe("par-le-nom", "nom", [[3, UNE]]),
      oracleDe("par-la-page", "contenu", [[3, AUTRE]]),
    ]);
    const verdict = verdictDuMoteur(face, {
      epreuves: toutesTenues("par-le-nom", "par-la-page"),
      verifieParUnHumain: true,
    });
    expect(verdict.etat).toBe("abstention");
    if (verdict.etat === "abstention") {
      expect(verdict.motif).toBe("oracles_en_desaccord");
      expect(verdict.pourLever).toContain("3");
    }
  });

  it("une hypothèse réfutée sur témoins ne publie pas, même à deux sources", () => {
    const face = confronter([oracleDe("par-le-nom", "nom", [[3, UNE]]), oracleDe("par-la-page", "contenu", [[3, UNE]])]);
    const verdict = verdictDuMoteur(face, {
      epreuves: new Map([
        ["par-le-nom", epreuveTenue],
        ["par-la-page", { tenus: [9], manques: [10], nonJugeables: [] }],
      ]),
      verifieParUnHumain: true,
    });
    expect(verdict.etat).toBe("abstention");
    if (verdict.etat === "abstention") expect(verdict.motif).toBe("temoins_en_echec");
  });

  it("une hypothèse jamais éprouvée ne publie pas non plus", () => {
    const face = confronter([oracleDe("par-le-nom", "nom", [[3, UNE]]), oracleDe("par-la-page", "contenu", [[3, UNE]])]);
    const verdict = verdictDuMoteur(face, { epreuves: new Map(), verifieParUnHumain: true });
    expect(verdict.etat).toBe("abstention");
    if (verdict.etat === "abstention") {
      expect(verdict.motif).toBe("temoins_non_eprouves");
      expect(verdict.pourLever, "c’est réparable sans déranger personne").toMatch(/ne demande personne/);
    }
  });
});

describe("un oracle meurt quand ce qu’il a vu a changé (OUT-10, ID-01)", () => {
  const enregistre: OracleEnregistre = {
    oracle: oracleDe("par-le-nom", "nom", [[3, UNE]]),
    verdict: { etat: "publie", oracles: ["par-le-nom"], verifieParUnHumain: true, pourquoi: "—" },
    empreinteDuVivier: "c".repeat(64),
    ecritLe: 1_793_000_000,
  };

  it("reste valable tant que le document et les pièces n’ont pas bougé", () => {
    expect(etatDeLOracle(enregistre, { conteneur: CONTENEUR, empreinteDuVivier: "c".repeat(64) }).valable).toBe(true);
  });

  it("tombe quand le document a changé", () => {
    const etat = etatDeLOracle(enregistre, { conteneur: "d".repeat(64), empreinteDuVivier: "c".repeat(64) });
    expect(etat.valable).toBe(false);
    if (!etat.valable) expect(etat.raison).toBe("conteneur_change");
  });

  it("tombe aussi quand les pièces ont changé, ce qui ne se voit pas autrement", () => {
    const etat = etatDeLOracle(enregistre, { conteneur: CONTENEUR, empreinteDuVivier: "e".repeat(64) });
    expect(etat.valable).toBe(false);
    if (!etat.valable) expect(etat.raison).toBe("vivier_change");
  });

  it("nomme la cause la plus profonde quand les deux ont changé", () => {
    const etat = etatDeLOracle(enregistre, { conteneur: "d".repeat(64), empreinteDuVivier: "e".repeat(64) });
    if (!etat.valable) expect(etat.raison).toBe("conteneur_change");
  });

  it("retire les liens sans effacer ce qui avait été vu", () => {
    const retire = retirerLesLiens(enregistre, "Les pièces ont changé.");
    expect(retire.oracle.propositions).toEqual([]);
    expect(retire.oracle.sansProposition, "les repères concernés sont nommés, pas oubliés").toEqual([3]);
    expect(retire.verdict.etat).toBe("abstention");
    // Ce que l'oracle avait vu reste consultable : ses détecteurs, son échantillon, ses témoins.
    expect(retire.oracle.detecteurs).toEqual(["par-le-nom"]);
    expect(retire.oracle.echantillon).toEqual([1, 2]);
    expect(() => Oracle.parse(retire.oracle)).not.toThrow();
  });
});
