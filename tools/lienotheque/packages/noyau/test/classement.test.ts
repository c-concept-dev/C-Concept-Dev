import { describe, expect, it } from "vitest";
import { SchemaBibliotheque, type ValeursAxe } from "@lienotheque/contrats";
import { GesteRefuse, classerUnDocument } from "../src/index.js";

/** Ranger un document sur les axes de sa bibliothèque (CLA-01, CLA-02, CLA-03).
 *
 *  Écrit avant le code. Deux déclencheurs et deux seulement — l'import d'une base existante, et
 *  un geste manuel — et **jamais une déduction depuis le texte** : un classement deviné qui se
 *  présente comme un classement su est la famille de fautes que ce lot corrige depuis le début.
 *  D'où `origine`, qui voyage avec le classement et ne se perd pas.
 *
 *  Aucun mot de domaine ici : les axes et les valeurs sont nommés par des lettres.
 */

const EMPREINTE = "a".repeat(64);
const AUTRE = "b".repeat(64);

const SCHEMA = SchemaBibliotheque.parse({
  cle: "essai",
  nom: "Essai",
  langue: "fr",
  version: 3,
  axes: [
    {
      cle: "a",
      nom: "A",
      nature: "referentiel",
      cardinalite: "une",
      valeurs: [
        { cle: "v1", nom: "V1", alias: ["v1-ancien"] },
        { cle: "v2", nom: "V2" },
        { cle: "v3", nom: "V3", retiree: true, redirigeVers: "v2" },
      ],
      alias: [],
    },
    {
      cle: "b",
      nom: "B",
      nature: "referentiel",
      cardinalite: "plusieurs",
      valeurs: [{ cle: "w1", nom: "W1" }, { cle: "w2", nom: "W2" }],
      alias: [],
    },
  ],
});

const reference = (...valeurs: string[]): ValeursAxe => ({ type: "reference", valeurs });

describe("le classement d'un document, par l'import", () => {
  it("porte les valeurs apportées, et dit d'où elles viennent", () => {
    const range = classerUnDocument(SCHEMA, EMPREINTE, { a: reference("v1"), b: reference("w1", "w2") }, "import");
    expect(range.empreinte).toBe(EMPREINTE);
    expect(range.schema).toBe("essai");
    expect(range.schemaVersion).toBe(3);
    expect(range.origine).toBe("import");
    expect(range.axes["a"]).toEqual({ type: "reference", valeurs: ["v1"] });
    expect(range.axes["b"]).toEqual({ type: "reference", valeurs: ["w1", "w2"] });
  });

  it("suit l'alias d'une valeur, parce qu'une base ancienne porte les anciens noms", () => {
    const range = classerUnDocument(SCHEMA, EMPREINTE, { a: reference("v1-ancien") }, "import");
    expect(range.axes["a"], "l'alias doit mener à la clé courante").toEqual({ type: "reference", valeurs: ["v1"] });
  });

  it("suit la redirection d'une valeur retirée, au lieu de refuser le document", () => {
    // CLA-03 : une valeur utilisée n'est jamais supprimée, elle est retirée et redirige. Refuser
    // l'import reviendrait à perdre le classement d'un document pour une décision de vocabulaire
    // prise après lui.
    const range = classerUnDocument(SCHEMA, EMPREINTE, { a: reference("v3") }, "import");
    expect(range.axes["a"]).toEqual({ type: "reference", valeurs: ["v2"] });
  });

  it("refuse un axe que la bibliothèque ne connaît pas, en le nommant", () => {
    expect(() => classerUnDocument(SCHEMA, EMPREINTE, { z: reference("v1") }, "import")).toThrow(GesteRefuse);
    expect(() => classerUnDocument(SCHEMA, EMPREINTE, { z: reference("v1") }, "import")).toThrow(/« z »/);
  });

  it("refuse une valeur que l'axe ne porte pas, plutôt que de l'inventer", () => {
    expect(() => classerUnDocument(SCHEMA, EMPREINTE, { a: reference("inconnue") }, "import")).toThrow(/« inconnue »/);
  });

  it("refuse deux valeurs sur un axe qui n'en prend qu'une", () => {
    expect(() => classerUnDocument(SCHEMA, EMPREINTE, { a: reference("v1", "v2") }, "import")).toThrow(GesteRefuse);
  });

  it("un document sans apport ne porte rien, et ce n'est pas une panne", () => {
    const range = classerUnDocument(SCHEMA, AUTRE, {}, "import");
    expect(Object.keys(range.axes), "aucun axe inventé pour un document non apparié").toHaveLength(0);
  });

  it("distingue un classement manuel d'un classement importé", () => {
    expect(classerUnDocument(SCHEMA, EMPREINTE, { a: reference("v1") }, "manuel").origine).toBe("manuel");
  });
});
