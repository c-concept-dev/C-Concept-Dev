import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeleBibliotheque, type ModeleBibliotheque as Modele } from "@lienotheque/contrats";
import {
  DEBUT,
  INTITULE,
  MOTS_PROPOSES,
  TEMPS,
  assembler,
  cleDepuisNom,
  cleLibre,
  complet,
  manque,
  precedent,
  suivant,
  type Reponses,
} from "../src/index.js";

/** Créer une bibliothèque en quatre temps (CLA-01, CLA-09, PLT-02). */

const MODELES: readonly Modele[] = readdirSync(join(import.meta.dirname, "../../../fixtures/modeles"))
  .filter((fichier) => fichier.endsWith(".json"))
  .map((fichier) => {
    const lu: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/modeles", fichier), "utf8"));
    return ModeleBibliotheque.parse((lu as { modele: unknown }).modele);
  });

const PREMIER = MODELES[0]!;

/** Des réponses complètes, dites une fois ; chaque test en retire ou en change une. */
const COMPLETES: Reponses = {
  ...DEBUT,
  nom: "Ma bibliothèque",
  contenus: ["documents", "audio"],
  rangement: { type: "modele", cle: PREMIER.cle },
  dossier: "/un/dossier",
};

describe("les quatre temps (maquette 1)", () => {
  it("vont de l'un à l'autre, et reviennent", () => {
    expect(TEMPS).toEqual(["nom", "contenu", "rangement", "acces"]);
    expect(suivant("nom")).toBe("contenu");
    expect(precedent("contenu")).toBe("nom");
  });

  it("le premier n'a pas de précédent et le dernier pas de suivant : l'écran n'a rien à deviner", () => {
    expect(precedent("nom")).toBeUndefined();
    expect(suivant("acces")).toBeUndefined();
  });

  it("portent chacun un intitulé en français, sans jargon", () => {
    for (const temps of TEMPS) {
      expect(INTITULE[temps], temps).toMatch(/^[A-ZÀ-Ý]/);
      expect(INTITULE[temps], temps).not.toMatch(/schéma|axe|slug|modèle de données/i);
    }
  });
});

describe("ce qui manque se dit, il ne se devine pas (UX-09)", () => {
  it("rien ne manque quand tout est répondu", () => {
    for (const temps of TEMPS) expect(manque(temps, COMPLETES), temps).toBeUndefined();
    expect(complet(COMPLETES)).toBe(true);
  });

  it("un nom vide, ou fait d'espaces, arrête le premier temps", () => {
    for (const nom of ["", "   "]) expect(manque("nom", { ...COMPLETES, nom })).toBeDefined();
  });

  it("un nom sans lettre ni chiffre arrête le premier temps : il ne donnerait aucune clé", () => {
    expect(manque("nom", { ...COMPLETES, nom: "—— ··· ——" })).toBeDefined();
  });

  it("aucun type de contenu arrête le deuxième temps", () => {
    expect(manque("contenu", { ...COMPLETES, contenus: [] })).toBeDefined();
  });

  it("aucune façon de ranger arrête le troisième temps : sans elle rien ne se retrouve", () => {
    const { rangement: _sans, ...reste } = COMPLETES;
    expect(manque("rangement", reste)).toBeDefined();
  });

  it("une façon de ranger à soi, sans nom, arrête le troisième temps", () => {
    expect(manque("rangement", { ...COMPLETES, rangement: { type: "libre", nom: "  " } })).toBeDefined();
  });

  it("un mot sans pluriel arrête le troisième temps : « 1 éléments » n'a pas été écrit pour des gens", () => {
    const mots = { ...MOTS_PROPOSES, element: { un: "pièce", plusieurs: "" } };
    expect(manque("rangement", { ...COMPLETES, mots })).toBeDefined();
  });

  it("aucun dossier arrête le dernier temps", () => {
    expect(manque("acces", { ...COMPLETES, dossier: "" })).toBeDefined();
  });

  it("chaque manque est une phrase qu'on peut lire à l'écran", () => {
    const vides: Reponses = { ...DEBUT, nom: "" };
    for (const temps of TEMPS) {
      const raison = manque(temps, vides);
      if (raison === undefined) continue;
      expect(raison, temps).toMatch(/[.!?]$/);
      expect(raison, temps).not.toMatch(/undefined|null|Error|[A-Za-z]+\.[a-z]+\(/);
    }
  });
});

describe("la clé tirée du nom", () => {
  it("déplie les accents et joint les mots, pour rester lisible", () => {
    expect(cleDepuisNom("Été 1977")).toBe("ete-1977");
  });

  it("ne garde ni tiret de tête ni tiret de queue", () => {
    expect(cleDepuisNom("  — Un nom —  ")).toBe("un-nom");
  });

  it("n'existe pas quand le nom n'offre ni lettre ni chiffre", () => {
    expect(cleDepuisNom("——")).toBeUndefined();
  });

  it("s'écarte de celles déjà prises : deux bibliothèques peuvent porter le même nom", () => {
    expect(cleLibre("Ma bibliothèque", [])).toBe("ma-bibliotheque");
    expect(cleLibre("Ma bibliothèque", ["ma-bibliotheque"])).toBe("ma-bibliotheque-2");
    expect(cleLibre("Ma bibliothèque", ["ma-bibliotheque", "ma-bibliotheque-2"])).toBe("ma-bibliotheque-3");
  });
});

describe("les réponses deviennent une description (CLA-09)", () => {
  it("reprend le modèle choisi, sans en recopier une ligne dans le code", () => {
    const faite = assembler(COMPLETES, MODELES);
    expect(faite.schema.axes.map((axe) => axe.cle)).toEqual(PREMIER.axes.map((axe) => axe.cle));
    expect(faite.id).toBe("ma-bibliotheque");
    expect(faite.contenus).toEqual(["documents", "audio"]);
  });

  it("parcourt tous les modèles du dépôt, sans branche par domaine (CLA-12)", () => {
    expect(MODELES.length).toBeGreaterThan(1);
    for (const modele of MODELES) {
      const faite = assembler({ ...COMPLETES, rangement: { type: "modele", cle: modele.cle } }, MODELES);
      expect(faite.schema.axes.length, modele.cle).toBe(modele.axes.length);
    }
  });

  it("une façon de ranger à soi devient des étiquettes libres : on emplit en chemin faisant", () => {
    const faite = assembler({ ...COMPLETES, rangement: { type: "libre", nom: "Par lieu" } }, MODELES);
    expect(faite.schema.axes).toHaveLength(1);
    expect(faite.schema.axes[0]?.nom).toBe("Par lieu");
    expect(faite.schema.axes[0]?.nature).toBe("etiquettes");
  });

  it("garde la description quand il y en a une, et n'en invente pas quand il n'y en a pas", () => {
    expect(assembler({ ...COMPLETES, description: "  Deux mots  " }, MODELES).description).toBe("Deux mots");
    expect(assembler({ ...COMPLETES, description: "   " }, MODELES).description).toBeUndefined();
  });

  it("refuse d'assembler des réponses incomplètes, en disant laquelle manque", () => {
    expect(() => assembler({ ...COMPLETES, contenus: [] }, MODELES)).toThrow(/type de contenu/i);
  });

  it("refuse une façon de ranger qui n'existe pas, plutôt que d'en créer une vide", () => {
    expect(() => assembler({ ...COMPLETES, rangement: { type: "modele", cle: "introuvable" } }, MODELES)).toThrow();
  });
});
