// @vitest-environment node
import { describe, expect, it } from "vitest";
import { TAILLE_FEUILLET, enFeuillets, langueDeLOpf, ordreDeLecture, texteDuXhtml } from "../src/epub.js";

/** Lire un EPUB : des chapitres, pas des pages (RCH-07, RCH-09, étape 7).
 *
 *  ## Ce qu'un EPUB offre, mesuré sur le corpus
 *
 *  Quatre EPUB sondés le 20 octobre 2026 : **aucun** ne porte de pagination d'édition imprimée —
 *  ni `page-list`, ni repère `pagebreak`. « Toujours sur la vraie page » n'a donc pas de sens
 *  littéral ici, et prétendre le contraire fabriquerait des numéros que personne ne pourrait
 *  vérifier.
 *
 *  Et le découpage de l'auteur ne vaut pas mesure : un même corpus donne **3 fichiers de
 *  contenu** pour un livre et **69** pour un autre. « Chapitre 1 sur 3 » ne situe rien.
 *
 *  ## Ce qui a été décidé, et pourquoi
 *
 *  | | |
 *  |---|---|
 *  | le **rang** | un découpage régulier en feuillets, figé avec la version |
 *  | la **vérifiabilité** | le texte exact du feuillet, qui est son propre repère |
 *  | le **contexte** | le chapitre d'où il vient, montré à l'écran |
 *
 *  Un feuillet n'est pas une page et ne s'appelle pas ainsi. Il donne une granularité comparable
 *  d'un livre à l'autre, ce que le chapitre ne donne pas, et un rang stable tant que la version
 *  ne change pas — une version est immuable, donc le découpage l'est aussi.
 *
 *  ## La langue vient de l'EPUB, pas de la bibliothèque
 *
 *  Chaque EPUB sondé déclare la sienne, et **l'un des quatre est en anglais dans une bibliothèque
 *  française**. Une bibliothèque dit la langue de sa collection ; un livre dit la sienne, et c'est
 *  elle qui compte pour le lire.
 */

describe("le texte d'un chapitre se tire de son balisage", () => {
  it("garde les mots et jette les balises", () => {
    expect(texteDuXhtml("<p>Le premier <em>paragraphe</em> du livre.</p>")).toBe("Le premier paragraphe du livre.");
  });

  it("sépare ce que deux blocs séparent, pour ne pas coller deux phrases", () => {
    // Sans cela, « …la fin.Le début… » : deux phrases soudées, et une recherche de phrase qui
    // ne retrouve ni l'une ni l'autre.
    expect(texteDuXhtml("<p>La fin.</p><p>Le début.</p>")).toBe("La fin. Le début.");
  });

  it("jette ce qui n'est pas du texte à lire", () => {
    // Un style ou un script sont du balisage qui se lit comme du texte si on les laisse : la
    // recherche retrouverait des accolades.
    expect(texteDuXhtml("<style>p{color:red}</style><p>Le texte.</p><script>var x=1</script>")).toBe("Le texte.");
  });

  it("rend les caractères échappés tels qu'ils se lisent", () => {
    expect(texteDuXhtml("<p>l&#8217;esprit &amp; la lettre &lt;ici&gt;</p>")).toBe("l’esprit & la lettre <ici>");
  });

  it("ne rend rien d'un chapitre vide plutôt qu'une suite d'espaces", () => {
    expect(texteDuXhtml("<div>  <span> </span>\n</div>")).toBe("");
  });
});

describe("l'ordre de lecture vient de la colonne vertébrale, jamais de l'ordre des fichiers", () => {
  const OPF = `<?xml version="1.0"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata><dc:language xmlns:dc="http://purl.org/dc/elements/1.1/">fr</dc:language></metadata>
      <manifest>
        <item id="c2" href="Text/ch02.xhtml" media-type="application/xhtml+xml"/>
        <item id="c1" href="Text/ch01.xhtml" media-type="application/xhtml+xml"/>
        <item id="css" href="style.css" media-type="text/css"/>
      </manifest>
      <spine><itemref idref="c1"/><itemref idref="c2"/></spine>
    </package>`;

  it("suit la colonne vertébrale, et résout les chemins depuis le dossier de l'OPF", () => {
    // Le manifeste range `ch02` avant `ch01` ; c'est la colonne vertébrale qui dit l'ordre de
    // lecture, et la confondre avec l'ordre du manifeste mettrait le livre à l'envers.
    expect(ordreDeLecture(OPF, "OEBPS/content.opf")).toEqual(["OEBPS/Text/ch01.xhtml", "OEBPS/Text/ch02.xhtml"]);
  });

  it("laisse dehors ce que la colonne vertébrale ne cite pas", () => {
    expect(ordreDeLecture(OPF, "OEBPS/content.opf")).not.toContain("OEBPS/style.css");
  });

  it("lit la langue que le livre déclare", () => {
    expect(langueDeLOpf(OPF)).toBe("fr");
  });

  it("ne devine pas une langue absente", () => {
    expect(langueDeLOpf("<package><metadata/></package>")).toBeUndefined();
  });
});

describe("le texte se coupe en feuillets réguliers", () => {
  const motsDe = (combien: number): string => Array.from({ length: combien }, (_, rang) => `mot${rang}`).join(" ");

  it("rend des feuillets d'une taille comparable, quel que soit le découpage de l'auteur", () => {
    const feuillets = enFeuillets([{ nom: "ch01", texte: motsDe(TAILLE_FEUILLET * 3) }]);
    expect(feuillets.length).toBeGreaterThanOrEqual(3);
    for (const feuillet of feuillets.slice(0, -1)) {
      const combien = feuillet.texte.split(/\s+/).length;
      expect(combien).toBeLessThanOrEqual(TAILLE_FEUILLET);
      expect(combien, "un feuillet trop court casse la comparabilité").toBeGreaterThan(TAILLE_FEUILLET / 2);
    }
  });

  it("numérote les feuillets dans l'ordre de lecture, à partir de un", () => {
    const feuillets = enFeuillets([{ nom: "ch01", texte: motsDe(TAILLE_FEUILLET * 2) }]);
    expect(feuillets.map((feuillet) => feuillet.rang)).toEqual(feuillets.map((_, index) => index + 1));
  });

  it("ne fait jamais chevaucher deux chapitres dans un même feuillet", () => {
    // Un feuillet à cheval appartiendrait à deux chapitres, et le contexte affiché mentirait sur
    // l'un des deux. Un chapitre court donne un feuillet court, et c'est le bon compromis.
    const feuillets = enFeuillets([
      { nom: "ch01", texte: motsDe(10) },
      { nom: "ch02", texte: motsDe(10) },
    ]);
    expect(feuillets).toHaveLength(2);
    expect(feuillets[0]?.chapitre).toBe("ch01");
    expect(feuillets[1]?.chapitre).toBe("ch02");
  });

  it("dit de quel chapitre chaque feuillet vient", () => {
    const feuillets = enFeuillets([{ nom: "Text/ch07.xhtml", texte: motsDe(TAILLE_FEUILLET + 10) }]);
    expect(feuillets.every((feuillet) => feuillet.chapitre === "Text/ch07.xhtml")).toBe(true);
  });

  it("coupe entre les mots, jamais au milieu de l'un d'eux", () => {
    // Un feuillet qui commence par « ésie » ne se cite pas, et la recherche de phrase le rate.
    const feuillets = enFeuillets([{ nom: "ch01", texte: motsDe(TAILLE_FEUILLET * 2) }]);
    for (const feuillet of feuillets) {
      expect(feuillet.texte).toMatch(/^mot\d/);
      expect(feuillet.texte).toMatch(/mot\d+$/);
    }
  });

  it("ignore un chapitre sans texte plutôt que d'en faire un feuillet vide", () => {
    expect(enFeuillets([{ nom: "vide", texte: "   " }, { nom: "ch01", texte: motsDe(5) }])).toHaveLength(1);
  });
});
