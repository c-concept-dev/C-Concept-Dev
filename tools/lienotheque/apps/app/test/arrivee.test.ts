// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fusionnerAccompagnements } from "../src/donnees/arrivee.js";

describe("les accompagnements montrés après un dépôt", () => {
  it("C9.1 — ignore les métadonnées Apple et ne recompte pas une seconde arrivée identique", () => {
    const vrais = [
      { nom: "méthode/piste-01.mp3", contenu: "audio" as const },
      { nom: "méthode/piste-02.mp3", contenu: "audio" as const },
    ];

    expect(
      fusionnerAccompagnements(vrais, [
        ...vrais,
        { nom: "__MACOSX/méthode/._piste-01.mp3", contenu: "audio" },
        { nom: "méthode/._piste-02.mp3", contenu: "audio" },
      ]),
    ).toEqual(vrais);
  });
});
