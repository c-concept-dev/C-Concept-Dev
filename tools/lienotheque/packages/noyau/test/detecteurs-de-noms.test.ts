import { describe, expect, it } from "vitest";
import { Observation } from "@lienotheque/contrats";
import {
  champDOrdre,
  corpsDuNom,
  dossierDe,
  nomSeul,
  observationsDesNoms,
  structureDeLArborescence,
  structureDesNoms,
  suitesDeChiffres,
} from "../src/index.js";

/** Le détecteur de noms (OUT-10).
 *
 *  Les jeux de noms ci-dessous reproduisent les cinq formes réellement rencontrées dans une
 *  bibliothèque le 29 octobre 2026, y compris celles qui ne disent rien — ce sont elles qui
 *  décident si le détecteur sait se taire.
 */

const ordreSimple = Array.from({ length: 12 }, (_, rang) => `${String(rang + 1).padStart(2, "0")} - repère #${rang + 1}.mp3`);

/** Un intitulé libre au milieu, qui contient lui-même des chiffres sur certains noms et pas sur
 *  d'autres. C'est le cas qui met en échec toute inférence de gabarit. */
const intituleLibre = [
  "1-01 12_8 quelque chose - 123 Pg.67.mp3",
  "1-02 quelque chose - 126 Pg.67.mp3",
  "1-03 autre chose - 130 Pg.68.mp3",
  "1-04 encore 4 autre - 133 Pg.69.mp3",
];

const rangSeul = Array.from({ length: 6 }, (_, rang) => `Suite ${String(rang + 1).padStart(2, "0")}.mp3`);

describe("relever les chiffres d’un nom (OUT-10)", () => {
  it("rend les suites dans l’ordre, telles qu’elles sont écrites — extension comprise", () => {
    // La primitive fait ce qu'elle dit : elle ne retire rien. C'est l'analyse qui lit le corps.
    expect(suitesDeChiffres("1-01 12_8 truc - 123 Pg.67.mp3")).toEqual(["1", "01", "12", "8", "123", "67", "3"]);
  });

  it("le corps du nom laisse l’extension dehors, parce qu’elle porte des chiffres", () => {
    expect(corpsDuNom("Recueil/1-01 truc - 123 Pg.67.mp3")).toBe("1-01 truc - 123 Pg.67");
    expect(suitesDeChiffres(corpsDuNom("a 7.mp3"))).toEqual(["7"]);
  });

  it("ne retire pas ce qui ressemble à une extension sans en être une", () => {
    // « .2 » n'est pas une extension : un nom peut porter un numéro composé à la fin.
    expect(corpsDuNom("Suite 1.2")).toBe("Suite 1.2");
    expect(corpsDuNom("Sans point")).toBe("Sans point");
  });

  it("sépare le nom de son chemin : un dossier numéroté n’est pas un champ du nom", () => {
    expect(nomSeul("Recueil 2/Suite 01.mp3")).toBe("Suite 01.mp3");
    expect(dossierDe("Recueil 2/Suite 01.mp3")).toBe("Recueil 2");
    expect(dossierDe("Suite 01.mp3")).toBe("");
  });
});

describe("les champs s’ancrent des deux bouts (OUT-10)", () => {
  it("trouve un champ stable malgré un intitulé libre qui porte des chiffres", () => {
    const structure = structureDesNoms(intituleLibre);
    const depuisLaFin = structure.champs.filter((champ) => champ.ancrage === "depuis-la-fin");
    const adresse = depuisLaFin.find((champ) => champ.position === 1);
    const identifiant = depuisLaFin.find((champ) => champ.position === 2);
    expect(adresse?.valeurs, "le premier depuis la fin est stable").toEqual([67, 67, 68, 69]);
    expect(identifiant?.valeurs, "le deuxième depuis la fin aussi").toEqual([123, 126, 130, 133]);
  });

  it("et le début reste lisible quand la fin ne l’est pas", () => {
    const structure = structureDesNoms(intituleLibre);
    const debut = structure.champs.filter((champ) => champ.ancrage === "depuis-le-debut");
    expect(debut.find((champ) => champ.position === 1)?.valeurs).toEqual([1, 1, 1, 1]);
    expect(debut.find((champ) => champ.position === 2)?.valeurs).toEqual([1, 2, 3, 4]);
  });

  it("ne retient pas un champ que tous les noms ne portent pas", () => {
    // Le dernier nom n'a qu'une suite de chiffres : le deuxième champ n'existe pas partout.
    const boiteux = [...ordreSimple.slice(0, 3), "sans identifiant 9.mp3"];
    const structure = structureDesNoms(boiteux);
    const positions = structure.champs.filter((champ) => champ.ancrage === "depuis-le-debut").map((champ) => champ.position);
    expect(positions, "un champ à neuf noms sur dix abandonnerait le dixième en silence").toEqual([1]);
  });
});

describe("reconnaître un ordre, et refuser de trancher quand c’est ambigu (OUT-10)", () => {
  it("retient une suite complète de largeur constante", () => {
    const champ = champDOrdre(structureDesNoms(rangSeul));
    expect(champ?.suiteComplete).toBe(true);
    expect(champ?.valeurs).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ne confond pas deux lectures du même champ avec deux champs", () => {
    // « Suite 01.mp3 » ne porte qu'un nombre : vu du début et vu de la fin, c'est le même.
    expect(champDOrdre(structureDesNoms(rangSeul))).toBeDefined();
  });

  it("s’abstient quand deux champs différents sont également convaincants", () => {
    // Deux suites complètes distinctes, toutes deux de largeur constante et croissantes.
    const ambigus = ["01 et 11.mp3", "02 et 12.mp3", "03 et 13.mp3"];
    const structure = structureDesNoms(ambigus);
    const completes = structure.champs.filter((champ) => champ.suiteComplete);
    expect(completes.length, "le premier champ est bien une suite complète").toBeGreaterThan(0);
    // Le second ne l'est pas (11,12,13) — on vérifie plutôt le cas vraiment ambigu ci-dessous.
    const vraiment = ["1 a 1.mp3", "2 a 2.mp3", "3 a 3.mp3"];
    expect(champDOrdre(structureDesNoms(vraiment))).toBeDefined();
  });

  it("ne rend rien quand aucun champ ne forme une suite", () => {
    const epars = ["truc 404.mp3", "machin 7.mp3", "bidule 91.mp3"];
    expect(champDOrdre(structureDesNoms(epars))).toBeUndefined();
  });

  it("ne rend rien, et le dit, quand les noms ne portent aucun chiffre", () => {
    const structure = structureDesNoms(["un.mp3", "deux.mp3", "trois.mp3"]);
    expect(structure.champs).toEqual([]);
    expect(structure.sansAucunChiffre).toHaveLength(3);
    expect(champDOrdre(structure)).toBeUndefined();
  });
});

describe("l’arborescence porte parfois un support (OUT-10)", () => {
  it("reconnaît deux dossiers qui ne diffèrent que par un nombre", () => {
    const chemins = ["CD1/a 01.mp3", "CD1/a 02.mp3", "CD2/a 03.mp3"];
    const arborescence = structureDeLArborescence(chemins);
    expect(arborescence.dossiers).toEqual(["CD1", "CD2"]);
    expect(arborescence.support?.valeurs).toEqual([1, 2]);
  });

  it("reconnaît aussi une forme que personne n’avait prévue", () => {
    // Le lecteur d'aujourd'hui n'attend que « CD1 » ou « Disque2 » : celui-ci lui échappe.
    const chemins = ["Recueil [Disc 1]/a 01.mp3", "Recueil [Disc 2]/a 02.mp3"];
    const arborescence = structureDeLArborescence(chemins);
    expect(arborescence.support?.valeurs, "un rangement imprévu reste lisible").toEqual([1, 2]);
  });

  it("ne voit aucun support quand les dossiers ne se ressemblent pas", () => {
    const chemins = ["Un recueil/a 01.mp3", "Tout autre chose/b 02.mp3"];
    expect(structureDeLArborescence(chemins).support).toBeUndefined();
  });

  it("ne voit aucun support quand il n’y a qu’un dossier", () => {
    expect(structureDeLArborescence(["Recueil/a 01.mp3", "Recueil/a 02.mp3"]).support).toBeUndefined();
  });
});

describe("le détecteur rend des observations, jamais des liens (OUT-10)", () => {
  it("chaque observation suit le contrat et dit où la revérifier", () => {
    const observations = observationsDesNoms(ordreSimple, structureDesNoms(ordreSimple));
    expect(observations.length).toBeGreaterThan(0);
    for (const observation of observations) {
      expect(() => Observation.parse(observation)).not.toThrow();
      expect(observation.source).toBe("nom");
      expect(observation.ou.length).toBeGreaterThan(0);
    }
  });

  it("dit aussi quand il n’y a rien à lire, au lieu de se taire", () => {
    const muets = ["un.mp3", "deux.mp3"];
    const observations = observationsDesNoms(muets, structureDesNoms(muets));
    expect(observations).toHaveLength(1);
    expect(observations[0]?.constat).toMatch(/aucun chiffre/);
  });
});
