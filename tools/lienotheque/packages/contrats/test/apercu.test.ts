import { describe, expect, it } from "vitest";
import { ApercuDocument } from "../src/index.js";

/** L'aperçu d'un document dans sa bibliothèque (B5, JOB-06).
 *
 *  Écrit avant le code (CLAUDE.md, règle 2). C'est ce que le Catalogue lit : une **projection**,
 *  jamais une concaténation des versions. Mesuré : 1,10 Mo par version — à deux cent cinquante
 *  documents, les assembler voudrait dire lire deux cent soixante-quinze mégaoctets pour afficher
 *  une liste de titres.
 *
 *  Le contrat est donc volontairement **étroit**, et `.strict()` le tient : c'est lui qui
 *  empêchera qu'on y glisse un jour les passages ou les pages « pendant qu'on y est ».
 */

const APERCU = {
  empreinte: "a".repeat(64),
  version: "0190f0a0-0000-7000-8000-000000000001",
  activeeLe: 1_760_000_000,
  nom: "Un document",
  compteurs: [{ mot: "passages", nombre: 1275 }],
  aVerifier: 0,
};

describe("l'aperçu d'un document reste une projection (B5)", () => {
  it("accepte le cas nominal", () => {
    expect(ApercuDocument.parse(APERCU).nom).toBe("Un document");
  });

  it("refuse ce qu'un catalogue n'a pas à porter : les pages et les passages", () => {
    // Le garde-fou qui compte. Un aperçu qui accepterait un champ de plus deviendrait, de
    // commit en commit, la concaténation qu'on cherche à éviter.
    expect(() => ApercuDocument.parse({ ...APERCU, passages: [] })).toThrow();
    expect(() => ApercuDocument.parse({ ...APERCU, pages: [] })).toThrow();
  });

  it("exige l'empreinte du document : sans elle, on ne sait pas de quoi c'est l'aperçu", () => {
    const { empreinte: _empreinte, ...sans } = APERCU;
    expect(() => ApercuDocument.parse(sans)).toThrow();
    expect(() => ApercuDocument.parse({ ...APERCU, empreinte: "trop court" })).toThrow();
  });

  it("exige la version active : un aperçu désigne un état, pas un document en général (ID-04)", () => {
    const { version: _version, ...sans } = APERCU;
    expect(() => ApercuDocument.parse(sans)).toThrow();
  });

  it("accepte un document sans compteurs, qui n'a encore rien rendu", () => {
    expect(ApercuDocument.parse({ ...APERCU, compteurs: [] }).compteurs).toEqual([]);
  });

  it("compte ce qui reste à vérifier, et jamais un nombre négatif", () => {
    expect(ApercuDocument.parse({ ...APERCU, aVerifier: 19 }).aVerifier).toBe(19);
    expect(() => ApercuDocument.parse({ ...APERCU, aVerifier: -1 })).toThrow();
  });
});
