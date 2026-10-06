import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EtatTravail, Travail } from "@lienotheque/contrats";
import { placesLibres, prochain, reprenable } from "../src/index.js";

/** Les décisions de la file, éprouvées contre la table partagée (JOB-01 à JOB-08, PLT-02).
 *
 *  La même table est lue par les tests de l'hôte Rust. Les règles sont écrites deux fois — un
 *  moteur d'exécution par langage, on n'y coupe pas — mais elles se mesurent à une seule vérité :
 *  une divergence entre les deux devient un test rouge, jamais un écart qu'on découvre en
 *  production. */

const TABLE = JSON.parse(readFileSync(fileURLToPath(new URL("../../../fixtures/travaux-cas.json", import.meta.url)), "utf8")) as {
  reprenable: { nom: string; exigence: string; etat: string; bailExpireLe: number | null; maintenant: number; attendu: boolean }[];
  ordre: {
    nom: string;
    exigence: string;
    maintenant: number;
    travaux: { id: string; etat: string; creeLe: number; reprise: number; bailExpireLe: number | null }[];
    attendu: string | null;
  }[];
  places: { nom: string; exigence: string; enCours: number; attendu: number }[];
};

const instant = (secondes: number): string => new Date(secondes * 1000).toISOString();
const identifiant = (rang: number): string => `01890a5d-ac96-774b-bcce-b3020${String(rang).padStart(2, "0")}a8057`;

/** Monte un travail conforme au contrat à partir d'un cas de la table.
 *
 *  La table ne décrit que ce qui pèse sur la décision — l'état, le bail, l'avancement. Tout le
 *  reste est du remplissage valide : un cas qui dépendrait d'autre chose serait un cas mal écrit. */
function travailDuCas(cas: { etat: string; bailExpireLe: number | null; creeLe?: number; reprise?: number }, rang: number): Travail {
  const bail =
    cas.bailExpireLe === null
      ? {}
      : {
          verrou: {
            appareilId: identifiant(99),
            battuLe: instant(cas.bailExpireLe - 15),
            expireLe: instant(cas.bailExpireLe),
          },
        };
  return {
    id: identifiant(rang),
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: identifiant(98),
    etat: cas.etat as EtatTravail,
    lieu: "application",
    tentative: 1,
    progression: 0,
    creeLe: instant(cas.creeLe ?? 0),
    majLe: instant(cas.creeLe ?? 0),
    ...bail,
    ...(cas.reprise === undefined || cas.reprise === 0 ? {} : { pointReprise: { unite: "page" as const, valeur: cas.reprise } }),
  };
}

describe("ce qui est reprenable", () => {
  it("la table en décrit assez pour que les deux côtés soient contraints", () => {
    expect(TABLE.reprenable.length).toBeGreaterThanOrEqual(8);
  });

  for (const cas of TABLE.reprenable)
    it(`${cas.nom} (${cas.exigence})`, () => {
      expect(reprenable(travailDuCas(cas, 1), new Date(cas.maintenant * 1000))).toBe(cas.attendu);
    });
});

describe("l'ordre de service", () => {
  for (const cas of TABLE.ordre)
    it(`${cas.nom} (${cas.exigence})`, () => {
      const travaux = cas.travaux.map((t, rang) => travailDuCas(t, rang + 1));
      const retenu = prochain(travaux, new Date(cas.maintenant * 1000));
      const attendu = cas.attendu === null ? undefined : travaux[cas.travaux.findIndex((t) => t.id === cas.attendu)];
      expect(retenu?.id).toBe(attendu?.id);
    });
});

describe("les places disponibles", () => {
  for (const cas of TABLE.places)
    it(`${cas.nom} (${cas.exigence})`, () => {
      expect(placesLibres(cas.enCours)).toBe(cas.attendu);
    });
});
