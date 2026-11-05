// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ErreurDelaiOcr, lireParOcr } from "../src/ocr.js";

/** A2 — un outil externe qui ne rend pas la main doit être coupé, et le dire (JOB-03, OUT-05).
 *
 *  **Tests rouges du 5 novembre 2026.**
 *
 *  `lireParOcr` appelait l'outil sans aucun délai : s'il se bloque, la chaîne attend sans fin et
 *  sans rien dire. Une journée a déjà été perdue à deviner où un moteur devenu muet était mort.
 *
 *  Ce qu'on éprouve ici ne demande pas Tesseract : l'appelant choisit le binaire, donc un faux
 *  binaire qui dort suffit — et c'est **le blocage** qu'on veut éprouver, pas la reconnaissance.
 *
 *  Deux choses, et la seconde compte autant que la première : que l'appel soit coupé, et que ce
 *  qu'il lève **dise que c'est un délai**. Une erreur quelconque serait prise pour un échec de
 *  lecture, et la page passerait pour « sans texte » au lieu de « non lue » — le repli silencieux
 *  que la règle du 5 novembre interdit. */

let bac: string;
let dormeur: string;
let muet: string;

beforeAll(() => {
  bac = mkdtempSync(join(tmpdir(), "lienotheque-delai-"));
  dormeur = join(bac, "outil-qui-dort");
  writeFileSync(dormeur, "#!/bin/sh\nsleep 30\n");
  chmodSync(dormeur, 0o755);
  muet = join(bac, "outil-qui-echoue");
  writeFileSync(muet, "#!/bin/sh\nexit 3\n");
  chmodSync(muet, 0o755);
});
afterAll(() => rmSync(bac, { recursive: true, force: true }));

describe("un outil de reconnaissance qui ne rend pas la main (A2, OUT-05)", () => {
  it("est coupé au bout du délai, au lieu d'attendre sans fin", () => {
    const debut = Date.now();
    expect(() => lireParOcr("/inexistant.pgm", 100, 100, 1, { binaire: dormeur, delaiMs: 300 })).toThrow();
    // Le dormeur dort trente secondes : si on sort en moins de cinq, c'est qu'on l'a coupé.
    expect(Date.now() - debut, "l'appel a été coupé, pas attendu").toBeLessThan(5000);
  });

  it("dit que c'est un délai, et non un échec de lecture", () => {
    let attrapee: unknown;
    try {
      lireParOcr("/inexistant.pgm", 100, 100, 1, { binaire: dormeur, delaiMs: 300 });
    } catch (souci) {
      attrapee = souci;
    }
    expect(attrapee, "une erreur nommée, pour que l'appelant sache quoi faire").toBeInstanceOf(ErreurDelaiOcr);
    expect((attrapee as ErreurDelaiOcr).delaiMs).toBe(300);
    expect(String((attrapee as Error).message), "elle se lit sans connaître le code").toContain("300");
  });

  it("ne confond pas un échec de l'outil avec un délai", () => {
    // Un outil qui sort en erreur tout de suite n'a pas dépassé son délai : le dire autrement
    // ferait relire par Vision une page qui n'a jamais été lente.
    let attrapee: unknown;
    try {
      lireParOcr("/inexistant.pgm", 100, 100, 1, { binaire: muet, delaiMs: 5000 });
    } catch (souci) {
      attrapee = souci;
    }
    expect(attrapee).toBeDefined();
    expect(attrapee, "un échec n'est pas un délai").not.toBeInstanceOf(ErreurDelaiOcr);
  });

  it("n'impose aucun délai quand l'appelant n'en donne pas", () => {
    // La valeur par défaut ne se décide pas ici : elle se mesure dans le document, et le
    // plafond vient de la chaîne. Ce module ne connaît pas les durées d'un corpus.
    const debut = Date.now();
    expect(() => lireParOcr("/inexistant.pgm", 100, 100, 1, { binaire: muet })).toThrow();
    expect(Date.now() - debut).toBeLessThan(5000);
  });
});
