import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { feuilleCss } from "../src/index.js";

/** La feuille générée doit définir toutes les variables qu'utilisent les composants du kit UI v1.1. */
describe("compatibilité avec le kit UI v1.1", () => {
  const kit = readFileSync(fileURLToPath(new URL("../../../docs/ui-kit/components.css", import.meta.url)), "utf8");
  const genere = feuilleCss();
  const utilisees = new Set([...kit.matchAll(/var\((--ln-[a-z0-9-]+)/g)].map((m) => m[1]!));
  const definies = new Set([...genere.matchAll(/(--ln-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
  const definiesParKit = new Set([...kit.matchAll(/(--ln-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
  it.each([...utilisees].sort())("%s est définie", (v) => {
    expect(definies.has(v) || definiesParKit.has(v)).toBe(true);
  });
  it("components.css ne contient aucune couleur en dur", () => {
    expect(kit.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });
});
