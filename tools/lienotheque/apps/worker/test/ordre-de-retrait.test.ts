import { describe, expect, it } from "vitest";
import { ordreDeRetrait } from "../src/ordre-de-retrait.js";

/** L'ordre de retrait s'est trompé deux fois avant d'être juste, et chaque fois l'erreur n'est
 *  apparue qu'après quatre-vingts secondes d'envoi vers l'hébergeur. Ces contrôles-ci répondent
 *  en six millisecondes. */

const table = (nom: string, ...references: string[]) => ({
  nom,
  sql: `CREATE TABLE ${nom} (id TEXT${references.map((cible) => `, ref TEXT REFERENCES ${cible}(id)`).join("")})`,
});

const avant = (ordre: readonly string[], fille: string, parent: string) =>
  ordre.indexOf(fille) < ordre.indexOf(parent);

describe("l'ordre de retrait des tables", () => {
  it("retire une fille avant son parent", () => {
    const ordre = ordreDeRetrait([table("document"), table("version", "document")]);
    expect(avant(ordre, "version", "document")).toBe(true);
  });

  it("tient sur une chaîne de trois, là où l'ordre alphabétique échoue", () => {
    // Le cas qui a vraiment cassé : ancre → version → document. L'ordre alphabétique pose
    // document en deuxième, sa cascade cherche ancre, et ancre n'est plus là.
    const ordre = ordreDeRetrait([table("ancre", "version"), table("document"), table("version", "document")]);
    expect(avant(ordre, "ancre", "version")).toBe(true);
    expect(avant(ordre, "version", "document")).toBe(true);
  });

  it("n'oublie aucune table, et n'en invente aucune", () => {
    const tables = [table("a"), table("b", "a"), table("c", "b"), table("seule")];
    expect([...ordreDeRetrait(tables)].sort()).toEqual(["a", "b", "c", "seule"]);
  });

  it("ne boucle pas sur un cycle de références", () => {
    // Le schéma n'en a pas, mais un schéma futur pourrait. Mieux vaut un ordre imparfait qu'un
    // banc qui ne rend jamais la main.
    const ordre = ordreDeRetrait([table("poule", "oeuf"), table("oeuf", "poule")]);
    expect([...ordre].sort()).toEqual(["oeuf", "poule"]);
  });

  it("ignore une référence vers une table qui n'est pas du lot", () => {
    const ordre = ordreDeRetrait([table("seule", "ailleurs")]);
    expect(ordre).toEqual(["seule"]);
  });

  it("ignore une table qui se référence elle-même", () => {
    const ordre = ordreDeRetrait([table("version", "version")]);
    expect(ordre).toEqual(["version"]);
  });
});
