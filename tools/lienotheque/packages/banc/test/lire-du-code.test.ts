// @vitest-environment node
import { describe, expect, it } from "vitest";
import { estDuCode, masqueDeCode } from "../src/lire-du-code.js";

/** Le masque situe un motif sans le lire — et il doit tenir sur les deux bords à la fois.
 *
 *  ## Le défaut trouvé le 7 novembre 2026
 *
 *  Le masque était construit en DEUX passes : les commentaires blanchis d'abord, les littéraux
 *  ensuite. Or la première passe ne sait rien des chaînes. Une chaîne qui porte `//` — et un
 *  contrôle de ce dépôt en portait une, `"// une approche…"` — lui fait blanchir jusqu'au bout de
 *  la ligne, **guillemet fermant compris**. La seconde passe voit alors une chaîne ouverte qui ne
 *  se referme jamais : à partir de là tout s'inverse, le code est masqué et les chaînes sont lues
 *  comme du code.
 *
 *  C'est le défaut même que ce module existe pour empêcher, un étage plus bas : j'avais appris à
 *  la seconde passe à ne pas lire les chaînes comme du code, et laissé la première le faire.
 *
 *  Il ne s'est vu qu'à retardement, **le jour où un fichier suivi a porté `//` dans une chaîne** —
 *  la même forme de piège que les deux fois précédentes, et pour la même raison.
 *
 *  ## L'autre bord, que l'ordre des passes protégeait
 *
 *  Une apostrophe dans un commentaire — « n'oublie pas » — ouvrirait un littéral qui blanchirait le
 *  code suivant, et un garde-fou **aveugle** reste vert là où un garde-fou qui accuse se fait
 *  remarquer. Ce bord-là tenait, et pour une raison qui n'était pas un choix : les commentaires
 *  étant blanchis d'abord, leurs apostrophes avaient disparu avant la seconde passe.
 *
 *  Corriger l'un ne doit donc pas découvrir l'autre. Une seule passe les tient tous les deux, et
 *  ces contrôles la tiennent à cela : un commentaire n'est pas une chaîne, une chaîne n'est pas un
 *  commentaire, et celui des deux qui commence gagne. */

/** Le code reste lisible dans le masque, les chaînes et commentaires non. */
const lisible = (source: string, motif: string): boolean =>
  estDuCode(masqueDeCode(source), source.indexOf(motif), motif);

describe("le masque sait qu'une chaîne n'est pas un commentaire", () => {
  it("ne se perd pas sur une chaîne qui porte deux barres obliques", () => {
    const source = 'const a = "// une approche brève\\n";\nconst apres = 1;\n';
    expect(lisible(source, "const apres"), "le code d'après était masqué").toBe(true);
    expect(lisible(source, "une approche"), "le contenu de la chaîne était lu comme du code").toBe(false);
  });

  it("ne se perd pas sur une chaîne qui porte une ouverture de bloc", () => {
    const source = 'const a = "/* pas un commentaire";\nconst apres = 1;\n';
    expect(lisible(source, "const apres")).toBe(true);
  });

  it("garde la longueur et les lignes, pour que les relevés désignent la bonne ligne", () => {
    const source = 'const a = "// x";\n// n\'oublie pas\nconst b = 2;\n';
    const masque = masqueDeCode(source);
    expect(masque).toHaveLength(source.length);
    expect(masque.split("\n")).toHaveLength(source.split("\n").length);
  });
});

describe("le masque sait qu'un commentaire n'est pas une chaîne", () => {
  it("ne laisse pas une apostrophe de commentaire masquer le code qui suit", () => {
    const source = "// n'oublie pas\nconst apres = 1;\n";
    expect(lisible(source, "const apres"), "le code suivant était aveuglé").toBe(true);
  });

  it("ne laisse pas une apostrophe de commentaire de bloc masquer le code qui suit", () => {
    const source = "/** l'index du commit */\nconst apres = 1;\n";
    expect(lisible(source, "const apres")).toBe(true);
  });

  it("blanchit bien ce qu'un commentaire cite", () => {
    const source = '// export * from "./absent.js";\nconst apres = 1;\n';
    expect(lisible(source, "./absent.js")).toBe(false);
    expect(lisible(source, "const apres")).toBe(true);
  });
});

describe("ce que le masque savait déjà faire", () => {
  it("blanchit le contenu des trois sortes de littéraux, et les REFERME toutes les trois", () => {
    // Le code d'APRÈS est ce qui prouve la fermeture : sans lui, un littéral qui ne se referme
    // jamais est indiscernable d'un littéral bien lu — une mutation l'a montré.
    for (const delimiteur of ['"', "'", "`"]) {
      const source = `const a = ${delimiteur}x${delimiteur};\nconst apres = 1;\n`;
      expect(lisible(source, "const a"), delimiteur).toBe(true);
      expect(lisible(source, "x"), delimiteur).toBe(false);
      expect(lisible(source, "const apres"), `littéral ${delimiteur} jamais refermé`).toBe(true);
      expect(masqueDeCode(source)).toContain(delimiteur);
    }
  });

  it("laisse l'échappement emporter le caractère suivant sans sortir du littéral", () => {
    const source = 'const a = "x\\"y";\nconst apres = 1;\n';
    expect(lisible(source, "const apres")).toBe(true);
  });

  it("tient sur un échappement en dernier caractère, sans perdre de place", () => {
    const source = 'const a = "x\\';
    expect(masqueDeCode(source)).toHaveLength(source.length);
  });
});
