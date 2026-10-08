import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Travail } from "../src/index.js";

/** La file de l'hôte et le contrat que lit la page décrivent le même travail (JOB-01, PLT-02).
 *
 *  L'hôte tient sa file dans sa propre forme — des secondes, des chaînes courtes, ce qui se relit
 *  vite au démarrage. La page, elle, lit un contrat. Sans preuve croisée, les deux dérivent en
 *  silence, et l'écran de traitement cesse d'afficher quoi que ce soit sans qu'un seul test s'en
 *  plaigne.
 *
 *  `fixtures/travaux-vus.json` est écrit par le test Rust « ecrit_les_travaux_vus_pour_le
 *  contrat », jamais à la main. Ici, on le relit et on le passe au contrat. */

const VUS = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../fixtures/travaux-vus.json"), "utf8"),
) as { travaux: unknown[] };

describe("ce que l'hôte montre de sa file", () => {
  it("n'est pas vide : un fichier de preuve sans cas ne prouve rien", () => {
    expect(VUS.travaux.length).toBeGreaterThan(3);
  });

  for (const [rang, brut] of VUS.travaux.entries())
    it(`le travail ${rang} tient le contrat`, () => {
      const lu = Travail.safeParse(brut);
      expect(lu.success ? "" : lu.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ")).toBe("");
    });
});

describe("les cas que la file doit savoir montrer", () => {
  // Lus à l'appel et non au chargement : un fichier devenu invalide doit faire échouer les tests
  // qui le valident, pas empêcher toute la suite de se collecter.
  const lire = (): readonly Travail[] => VUS.travaux.map((brut) => Travail.parse(brut));

  it("un travail en file, dont on ne sait pas encore le total, n'est pas à cent pour cent", () => {
    const attente = lire().find((travail) => travail.etat === "en_file");
    expect(attente, "aucun travail en attente parmi les cas").toBeDefined();
    expect(attente?.sujet?.total, "le total s'apprend en ouvrant le fichier").toBeUndefined();
    expect(attente?.progression).toBe(0);
  });

  it("un travail en cours porte son total, son point de reprise et son bail", () => {
    const encours = lire().find((travail) => travail.etat === "en_cours");
    expect(encours?.sujet?.total).toBeGreaterThan(0);
    expect(encours?.pointReprise?.valeur).toBeGreaterThan(0);
    expect(encours?.verrou, "un travail qui tourne tient son bail (JOB-02)").toBeDefined();
  });

  it("un travail terminé est à cent pour cent et ne garde pas son bail", () => {
    const fini = lire().find((travail) => travail.etat === "termine");
    expect(fini?.progression).toBe(1);
    expect(fini?.verrou).toBeUndefined();
  });

  it("un travail qui ne porte sur aucun fichier n'a pas de sujet, et cela se lit", () => {
    const sans = lire().find((travail) => travail.sujet === undefined);
    expect(sans, "aucun travail sans sujet parmi les cas").toBeDefined();
    expect(sans?.poids).toBe("leger");
  });

  it("les unités comptées sont celles que l'écran sait nommer", () => {
    const unites = lire().flatMap((travail) => (travail.pointReprise === undefined ? [] : [travail.pointReprise.unite]));
    expect(unites).toContain("page");
    expect(unites).toContain("piste");
  });
});
