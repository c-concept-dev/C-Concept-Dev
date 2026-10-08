import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DELAI_ENTRE_TENTATIVES_S,
  TENTATIVES_MAX,
  TRAVAUX_LOURDS_SIMULTANES,
  type EtatTravail,
  type PoidsTravail,
  type Travail,
} from "@lienotheque/contrats";
import {
  annuler,
  echouer,
  mettreEnPause,
  peutPartir,
  placesLibres,
  prochain,
  reprenable,
  reprendre,
  tentativeRestante,
} from "../src/index.js";

/** Les décisions de la file, éprouvées contre la table partagée (JOB-01 à JOB-09).
 *
 *  La même table est lue par les tests de l'hôte Rust. Les règles sont écrites deux fois — un
 *  moteur d'exécution par langage, on n'y coupe pas — mais elles se mesurent à une seule vérité :
 *  une divergence entre les deux devient un test rouge, jamais un écart qu'on découvre en
 *  production.
 *
 *  Rien de ce qui dépend d'une limite n'est recopié ici. La table nomme « limite », « auDelai »,
 *  « tentativesMax » ; c'est la lecture qui les résout. Changer une limite dans `limites.json`
 *  déplace les deux côtés ensemble, au lieu de rendre la table fausse en silence. */

const TABLE = JSON.parse(readFileSync(fileURLToPath(new URL("../../../fixtures/travaux-cas.json", import.meta.url)), "utf8")) as {
  reprenable: {
    nom: string;
    exigence: string;
    etat: string;
    bailExpireLe: number | null;
    majLe?: number;
    maintenant?: number;
    maintenantRelatif?: string;
    attendu: boolean;
  }[];
  ordre: {
    nom: string;
    exigence: string;
    maintenant: number;
    travaux: { id: string; etat: string; creeLe: number; reprise: number; bailExpireLe: number | null }[];
    attendu: string | null;
  }[];
  places: { nom: string; exigence: string; enCours: string; attendu: string }[];
  depart: { nom: string; exigence: string; poids: string; enCours: string; attendu: boolean }[];
  tentatives: { nom: string; exigence: string; tentative?: number; tentativeRelative?: string; attendu: boolean }[];
  transitions: {
    nom: string;
    exigence: string;
    depuis: string;
    avecBail: boolean;
    tentativeAvantRelative?: string;
    action: string;
    vers: string;
    bailApres: boolean;
    tentativeApres?: number;
    tentativeApresRelative?: string;
  }[];
};

const instant = (secondes: number): string => new Date(secondes * 1000).toISOString();
const identifiant = (graine: string): string => `01890a5d-ac96-774b-bcce-${graine.padEnd(12, "0").slice(0, 12)}`;

/** Résout un compte que la table exprime par rapport à la limite, plutôt que de le recopier. */
function compte(nomme: string): number {
  switch (nomme) {
    case "aucun":
      return 0;
    case "un":
      return 1;
    case "limite":
      return TRAVAUX_LOURDS_SIMULTANES;
    case "limitePlusTrois":
      return TRAVAUX_LOURDS_SIMULTANES + 3;
    default:
      throw new Error(`Compte inconnu dans la table : ${nomme}`);
  }
}

function placesAttendues(nomme: string): number {
  switch (nomme) {
    case "limite":
      return TRAVAUX_LOURDS_SIMULTANES;
    case "limiteMoinsUn":
      return TRAVAUX_LOURDS_SIMULTANES - 1;
    case "aucune":
      return 0;
    default:
      throw new Error(`Attendu inconnu dans la table : ${nomme}`);
  }
}

function tentativeNommee(nomme: string): number {
  switch (nomme) {
    case "tentativesMax":
      return TENTATIVES_MAX;
    case "tentativesMaxPlusUn":
      return TENTATIVES_MAX + 1;
    default:
      throw new Error(`Tentative inconnue dans la table : ${nomme}`);
  }
}

/** Monte un travail conforme au contrat à partir d'un cas de la table.
 *
 *  La table ne décrit que ce qui pèse sur la décision. Tout le reste est du remplissage valide :
 *  un cas qui dépendrait d'autre chose serait un cas mal écrit. */
function travailDuCas(
  cas: { id?: string; etat: string; bailExpireLe: number | null; creeLe?: number; reprise?: number; majLe?: number; poids?: string; tentative?: number },
): Travail {
  const bail =
    cas.bailExpireLe === null
      ? {}
      : {
          verrou: {
            appareilId: identifiant("appareil"),
            battuLe: instant(cas.bailExpireLe - 15),
            expireLe: instant(cas.bailExpireLe),
          },
        };
  return {
    id: identifiant(cas.id ?? "travail"),
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: identifiant("version"),
    etat: cas.etat as EtatTravail,
    lieu: "application",
    poids: (cas.poids ?? "lourd") as PoidsTravail,
    tentative: cas.tentative ?? 1,
    progression: 0,
    creeLe: instant(cas.creeLe ?? 0),
    majLe: instant(cas.majLe ?? cas.creeLe ?? 0),
    ...bail,
    ...(cas.reprise === undefined || cas.reprise === 0 ? {} : { pointReprise: { unite: "page" as const, valeur: cas.reprise } }),
  };
}

describe("ce qui est reprenable", () => {
  it("la table en décrit assez pour que les deux côtés soient contraints", () => {
    expect(TABLE.reprenable.length).toBeGreaterThanOrEqual(10);
  });

  for (const cas of TABLE.reprenable)
    it(`${cas.nom} (${cas.exigence})`, () => {
      const base = cas.majLe ?? 0;
      const maintenant =
        cas.maintenantRelatif === "justeAvantLeDelai"
          ? base + DELAI_ENTRE_TENTATIVES_S - 1
          : cas.maintenantRelatif === "auDelai"
            ? base + DELAI_ENTRE_TENTATIVES_S
            : (cas.maintenant ?? 0);
      expect(reprenable(travailDuCas(cas), new Date(maintenant * 1000))).toBe(cas.attendu);
    });
});

describe("l'ordre de service", () => {
  for (const cas of TABLE.ordre)
    it(`${cas.nom} (${cas.exigence})`, () => {
      const travaux = cas.travaux.map((t) => travailDuCas(t));
      const retenu = prochain(travaux, new Date(cas.maintenant * 1000));
      expect(retenu?.id).toBe(cas.attendu === null ? undefined : identifiant(cas.attendu));
    });

  it("sert le même travail quel que soit l'ordre où la file est présentée (REC-02)", () => {
    const egalite = TABLE.ordre.find((c) => c.nom.startsWith("égalité parfaite"));
    expect(egalite, "la table décrit bien le cas d'égalité").toBeDefined();
    const travaux = egalite!.travaux.map((t) => travailDuCas(t));
    const retourne = prochain([...travaux].reverse(), new Date(egalite!.maintenant * 1000));
    expect(retourne?.id, "l'ordre d'arrivée ne décide de rien").toBe(identifiant(egalite!.attendu!));
  });
});

describe("les places disponibles", () => {
  for (const cas of TABLE.places)
    it(`${cas.nom} (${cas.exigence})`, () => {
      expect(placesLibres(compte(cas.enCours))).toBe(placesAttendues(cas.attendu));
    });
});

describe("qui peut partir", () => {
  for (const cas of TABLE.depart)
    it(`${cas.nom} (${cas.exigence})`, () => {
      const travail = travailDuCas({ etat: "en_file", bailExpireLe: null, poids: cas.poids });
      expect(peutPartir(travail, compte(cas.enCours))).toBe(cas.attendu);
    });
});

describe("les tentatives", () => {
  for (const cas of TABLE.tentatives)
    it(`${cas.nom} (${cas.exigence})`, () => {
      const tentative = cas.tentative ?? tentativeNommee(cas.tentativeRelative!);
      expect(tentativeRestante(tentative)).toBe(cas.attendu);
    });
});

describe("les transitions", () => {
  const T0 = new Date(100_000 * 1000);

  for (const cas of TABLE.transitions)
    it(`${cas.nom} (${cas.exigence})`, () => {
      const tentative = cas.tentativeAvantRelative === undefined ? 1 : tentativeNommee(cas.tentativeAvantRelative);
      const travail = travailDuCas({ etat: cas.depuis, bailExpireLe: cas.avecBail ? 999_999 : null, tentative });

      const apres =
        cas.action === "pause"
          ? mettreEnPause(travail, T0)
          : cas.action === "reprendre"
            ? reprendre(travail, T0)
            : cas.action === "annuler"
              ? annuler(travail, T0)
              : echouer(
                  travail,
                  { cause: "volume démonté", elements: [], reprisePossible: cas.action === "echouerRecuperable" },
                  T0,
                );

      expect(apres.etat).toBe(cas.vers);
      expect(apres.verrou === undefined, "le bail est lâché, ou gardé, comme la table le dit").toBe(!cas.bailApres);
      const attendue = cas.tentativeApres ?? tentativeNommee(cas.tentativeApresRelative!);
      expect(apres.tentative).toBe(attendue);
    });

  it("ni la pause ni l'annulation ne touchent la version visée (JOB-08)", () => {
    const travail = travailDuCas({ etat: "en_cours", bailExpireLe: 999_999 });
    expect(mettreEnPause(travail, T0).versionCible).toBe(travail.versionCible);
    expect(annuler(travail, T0).versionCible).toBe(travail.versionCible);
  });
});
