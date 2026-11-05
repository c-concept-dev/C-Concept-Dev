import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accepte, juger, raconter, type Controle, type Epingle } from "../src/epingles.js";

/** Le garde-fou des échecs épinglés (règle du 5 novembre 2026).
 *
 *  Un garde-fou qu'on n'éprouve pas ne garde rien. Celui-ci doit refuser deux choses, et la
 *  seconde est celle qu'on oublie : une épingle dont le contrôle passe. Une épingle qui survit à
 *  sa cause éteint la valeur du rouge — c'est la dette exacte du job « Rendu », rouge en
 *  permanence depuis le 29 octobre, qu'on a fini par ne plus lire. */

const EPINGLE: Epingle = {
  id: "essai-un",
  paquet: "@essai/paquet",
  fichier: "test/chose.test.ts",
  controles: [
    { nom: "la chose > tient", message: "expected [] to deeply equal [ 1 ]" },
    { nom: "la chose > tient aussi", message: "même cause, second contrôle" },
  ],
};

const controle = (etat: Controle["etat"], message?: string): Controle => ({
  paquet: "@essai/paquet",
  fichier: "/un/chemin/absolu/test/chose.test.ts",
  nom: "la chose > tient",
  etat,
  ...(message === undefined ? {} : { message }),
});

describe("le garde-fou des échecs épinglés", () => {
  it("tolère un échec épinglé, et lui seul", () => {
    const verdict = juger([controle("echoue", "AssertionError: expected [] to deeply equal [ 1 ]")], [EPINGLE]);
    expect(verdict.epinglesTenues.map((e) => e.id)).toEqual(["essai-un"]);
    expect(verdict.regressions).toEqual([]);
    expect(accepte(verdict), "un rouge épinglé ne bloque pas").toBe(true);
  });

  it("refuse un échec qu'aucune épingle ne couvre", () => {
    const autre = { ...controle("echoue", "AssertionError: autre chose"), nom: "la chose > autre contrôle" };
    const verdict = juger([autre], [EPINGLE]);
    expect(verdict.regressions).toHaveLength(1);
    expect(accepte(verdict), "une régression bloque").toBe(false);
    expect(raconter(verdict)[0]).toContain("RÉGRESSION");
  });

  // Celui-là est la raison d'être du garde-fou.
  it("refuse une épingle dont le contrôle passe : elle a survécu à sa cause", () => {
    const verdict = juger([controle("passe")], [EPINGLE]);
    expect(verdict.epinglesPerimees.map((e) => e.id)).toEqual(["essai-un"]);
    expect(accepte(verdict), "une épingle périmée bloque, pour qu'on la retire").toBe(false);
    expect(raconter(verdict).join("\n")).toContain("ÉPINGLE PÉRIMÉE");
  });

  it("refuse le même contrôle tombé pour une autre cause : une épingle couvre une cause, pas un nom", () => {
    const verdict = juger([controle("echoue", "TypeError: undefined n'est pas une fonction")], [EPINGLE]);
    expect(verdict.messagesInattendus).toHaveLength(1);
    expect(verdict.epinglesTenues).toEqual([]);
    expect(accepte(verdict)).toBe(false);
    expect(raconter(verdict).join("\n")).toContain("AUTRE CAUSE");
  });

  it("ne refuse pas une épingle dont le contrôle a été sauté", () => {
    // L'intégration continue saute les contrôles qui demandent des œuvres non versionnées : le
    // critère F3 y rend « 9 tests | 4 skipped ». Un contrôle sauté n'est ni rouge ni vert.
    const verdict = juger([controle("saute")], [EPINGLE]);
    expect(verdict.epinglesNonRencontrees.map((e) => e.id)).toEqual(["essai-un"]);
    expect(accepte(verdict), "un contrôle sauté ne prouve rien, ni dans un sens ni dans l'autre").toBe(true);
  });

  // Une même cause fait souvent tomber plusieurs contrôles du même fichier : l'absence de
  // Tesseract en fait tomber deux. Une épingle à un seul nom aurait laissé le second passer
  // pour une régression.
  it("couvre plusieurs contrôles du même fichier", () => {
    const second = { ...controle("echoue", "AssertionError: même cause, second contrôle"), nom: "la chose > tient aussi" };
    const verdict = juger([controle("echoue", "expected [] to deeply equal [ 1 ]"), second], [EPINGLE]);
    expect(verdict.regressions, "les deux sont couverts").toEqual([]);
    expect(verdict.epinglesTenues.map((e) => e.id)).toEqual(["essai-un"]);
    expect(accepte(verdict)).toBe(true);
  });

  it("dit périmée une épingle dont UN des contrôles repasse", () => {
    const verdict = juger(
      [controle("echoue", "expected [] to deeply equal [ 1 ]"), { ...controle("passe"), nom: "la chose > tient aussi" }],
      [EPINGLE],
    );
    expect(verdict.epinglesPerimees.map((e) => e.id), "la cause ne couvre plus tout : à relire").toEqual(["essai-un"]);
    expect(accepte(verdict)).toBe(false);
  });

  // Une épingle dont la cause est « tel moteur n'est pas installé » ne vaut que là où il manque.
  // Mesuré le 5 novembre 2026 : l'épingle Tesseract est rouge en intégration continue et verte
  // sur la machine de Christophe. La déclarer périmée bloquerait le contrôle local pour un échec
  // qui n'y existe pas, et qui est bien réel ailleurs.
  describe("une épingle dont la cause est l'absence d'un outil", () => {
    const AILLEURS: Epingle = { ...EPINGLE, id: "essai-outil", absenceRequise: ["un-moteur"] };

    it("ne vaut pas là où l'outil est présent : hors contexte, pas périmée", () => {
      const verdict = juger([controle("passe")], [AILLEURS], (outil) => outil === "un-moteur");
      expect(verdict.epinglesHorsContexte.map((e) => e.id)).toEqual(["essai-outil"]);
      expect(verdict.epinglesPerimees, "le contrôle passe ici, et c'est normal").toEqual([]);
      expect(accepte(verdict), "elle ne doit pas bloquer la machine qui a l'outil").toBe(true);
      expect(raconter(verdict).join("\n")).toContain("hors contexte");
    });

    it("vaut, et se tient, là où l'outil manque", () => {
      const verdict = juger(
        [controle("echoue", "expected [] to deeply equal [ 1 ]")],
        [AILLEURS],
        () => false,
      );
      expect(verdict.epinglesTenues.map((e) => e.id)).toEqual(["essai-outil"]);
      expect(accepte(verdict)).toBe(true);
    });

    it("là où l'outil manque, elle reste périmable si le contrôle passe", () => {
      const verdict = juger([controle("passe")], [AILLEURS], () => false);
      expect(verdict.epinglesPerimees.map((e) => e.id)).toEqual(["essai-outil"]);
      expect(accepte(verdict)).toBe(false);
    });
  });

  it("compare le fichier en suffixe : un rapport donne un chemin absolu", () => {
    const ailleurs = { ...controle("echoue", "expected [] to deeply equal [ 1 ]"), fichier: "test/autre.test.ts" };
    expect(juger([ailleurs], [EPINGLE]).regressions, "un autre fichier n'est pas couvert").toHaveLength(1);
  });

  it("la liste du dépôt porte ce que le garde-fou compare", () => {
    const liste = JSON.parse(
      readFileSync(join(import.meta.dirname, "../../..", "fixtures/references/echecs-connus.json"), "utf8"),
    ) as { epingles: Record<string, unknown>[] };
    expect(liste.epingles.length, "au moins une épingle, sinon la liste ne sert à rien").toBeGreaterThan(0);
    for (const epingle of liste.epingles)
      for (const champ of ["id", "paquet", "fichier", "controles", "cause", "ce_qui_le_levera"])
        expect(epingle[champ], `${String(epingle["id"])} porte ${champ}`).toBeDefined();
    for (const epingle of liste.epingles)
      for (const controle of epingle["controles"] as { nom?: string; message?: string }[]) {
        expect(controle.nom, `${String(epingle["id"])} : un contrôle sans nom ne se compare pas`).toBeDefined();
        expect(controle.message, `${String(epingle["id"])} : un contrôle sans message couvrirait toute cause`).toBeDefined();
      }
  });
});
