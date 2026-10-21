import { describe, expect, it } from "vitest";
import { causeLisible } from "../src/index.js";

/** Ce qu'une panne dit d'elle-même quand elle n'est pas une `Error` (JOB-05)
 *
 *  ## Le défaut que ces épreuves ferment
 *
 *  Le réimport des deux cent cinquante, le 21 octobre 2026, a enregistré trois échecs dont la
 *  cause est, en toutes lettres dans le travail :
 *
 *      [object Object]
 *
 *  La ligne du journal qui précède disait ce que la cause aurait dû porter : « Unsupported color
 *  conversion request ». Le décodeur JPEG refuse un espace de couleur — probablement du CMJN — et
 *  **lève un objet qui n'est pas une `Error`**. Le code faisait alors `String(cause)`, ce qui d'un
 *  objet ne rend que sa nature, jamais son contenu.
 *
 *  Trois documents sur deux cent quarante-neuf, et personne ne pouvait savoir pourquoi. **C'est
 *  une erreur avalée**, ce que JOB-05 interdit — avalée non pas en se taisant, mais en parlant
 *  pour ne rien dire, ce qui revient au même pour qui la lit.
 *
 *  ## Ce qu'on attend d'elle
 *
 *  Rendre quelque chose d'utile de **tout** ce qu'un `throw` peut porter — une bibliothèque tierce
 *  lève ce qu'elle veut —, et ne jamais lever elle-même : une fonction qui sert à dire une panne
 *  et qui tombe dedans emporte la seule trace qui restait.
 */

describe("une cause qui n'est pas une Error dit quand même ce qu'elle est", () => {
  it("rend le message d'une Error, comme avant", () => {
    expect(causeLisible(new Error("le fichier a disparu"))).toBe("le fichier a disparu");
  });

  it("garde le nom d'une Error dont le message est vide : il reste la seule indication", () => {
    expect(causeLisible(new TypeError(""))).toContain("TypeError");
  });

  it("trouve le message d'un objet qui en porte un", () => {
    // Le cas rencontré : une bibliothèque qui lève un objet plutôt qu'une Error.
    expect(causeLisible({ message: "Unsupported color conversion request" })).toBe("Unsupported color conversion request");
  });

  it("rend le contenu d'un objet qui n'a pas de message, plutôt que sa nature", () => {
    const dit = causeLisible({ code: "ESPACE_COULEUR", composantes: 4 });
    expect(dit, "« [object Object] » ne dit rien à personne").not.toContain("[object Object]");
    expect(dit).toContain("ESPACE_COULEUR");
  });

  it("rend une chaîne telle quelle", () => {
    expect(causeLisible("Unsupported color conversion request")).toBe("Unsupported color conversion request");
  });

  it("dit quelque chose de ce qui ne porte rien du tout", () => {
    for (const rien of [undefined, null]) {
      const dit = causeLisible(rien);
      expect(dit.length, "une panne sans cause doit tout de même se nommer").toBeGreaterThan(0);
    }
  });

  it("ne lève jamais, même sur ce qui ne se convertit pas", () => {
    // Un objet circulaire fait tomber `JSON.stringify`. Une fonction qui sert à dire une panne et
    // qui tombe dedans emporte la seule trace qui restait.
    const boucle: Record<string, unknown> = { quoi: "une boucle" };
    boucle["lui-meme"] = boucle;
    expect(() => causeLisible(boucle)).not.toThrow();
    expect(causeLisible(boucle).length).toBeGreaterThan(0);

    const recalcitrant = {
      toString() {
        throw new Error("même sa conversion échoue");
      },
    };
    expect(() => causeLisible(recalcitrant)).not.toThrow();
  });

  it("borne ce qu'elle rend : une cause est une phrase, pas un fichier", () => {
    // Elle traverse un tuyau entre deux processus et finit dans un travail sur le disque.
    const enorme = { texte: "x".repeat(10_000) };
    expect(causeLisible(enorme).length).toBeLessThanOrEqual(600);
  });
});
