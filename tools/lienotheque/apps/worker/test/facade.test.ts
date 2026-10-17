import { MIGRATIONS, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { Correspondance, chercher, compter, motsPourIndex, PLAFOND, projeter } from "../src/facade.js";

/** Une vraie bibliothèque en mémoire, avec le vrai schéma et son index plein texte. */
const bibliothequeEnMemoire = () => baseEnMemoire(MIGRATIONS);

const CORRESPONDANCE: Correspondance = Correspondance.parse({
  book_id: { colonne: "document.id" },
  book_title: { colonne: "document.titre" },
  content: { colonne: "passage.texte" },
  chunk_index: { colonne: "passage.rang" },
  page_number: { colonne: "ancre.page" },
  auteur_du_lot: { axe: "axe_un" },
  rayon: { axe: "axe_deux" },
  chapter: null,
});

let bib: ReturnType<typeof bibliothequeEnMemoire>;

const semer = (textes: readonly string[]) => {
    bib.executer(`INSERT INTO document (id, bibliotheque_id, titre, cree_le) VALUES ('d1', 'essai', 'Premier titre', '2026-10-10')`);
  bib.executer(
    `INSERT INTO version (id, document_id, numero, etat, active, recette_id, recette_ver, cree_le) ` +
      `VALUES ('v1', 'd1', 1, 'active', 1, 'r', 1, '2026-10-10')`,
  );
  bib.executer(`INSERT INTO classement (document_id, schema_cle, schema_version, axes) VALUES ('d1', 's', 1, '{"axe_un":"Un nom","axe_deux":["premier","second"]}')`);
  textes.forEach((texte, rang) => {
    bib.executer(`INSERT INTO ancre (id, version_id, fichier, selecteur) VALUES ('a${rang}', 'v1', '${"f".repeat(64)}', '{"page":${rang + 10}}')`);
    void bib.prepare(`INSERT INTO passage (id, version_id, ancre_id, rang, texte) VALUES (?, 'v1', ?, ?, ?)`)
      .bind(`p${rang}`, `a${rang}`, rang, texte)
      .run();
  });
};

beforeEach(() => {
  bib?.fermer();
  bib = bibliothequeEnMemoire();
});

describe("la projection (RCH-12)", () => {
  it("rend les champs que l'application attend, depuis notre schéma", async () => {
    semer(["le premier passage parle de mesure"]);
    const trouves = await chercher(bib, CORRESPONDANCE, { query: "mesure" });
    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toMatchObject({
      book_id: "d1",
      book_title: "Premier titre",
      content: "le premier passage parle de mesure",
      chunk_index: 0,
      page_number: 10,
      auteur_du_lot: "Un nom",
      rayon: "premier",
      chapter: null,
    });
  });

  it("rend un champ vide plutôt que d'échouer quand la source manque", async () => {
    const sansRien = projeter(
      { document_id: "d", document_titre: "t", passage_texte: "x", passage_rang: 0, ancre_selecteur: null, classement_axes: null },
      CORRESPONDANCE,
    );
    expect(sansRien["page_number"]).toBeNull();
    expect(sansRien["auteur_du_lot"]).toBeNull();
  });

  it("survit à un sélecteur et à un classement illisibles", () => {
    const abime = projeter(
      { document_id: "d", document_titre: "t", passage_texte: "x", passage_rang: 0, ancre_selecteur: "{pas du json", classement_axes: "non plus" },
      CORRESPONDANCE,
    );
    expect(abime["page_number"]).toBeNull();
    expect(abime["rayon"]).toBeNull();
  });

  it("refuse une correspondance qui désignerait une colonne hors de la liste close", () => {
    // La correspondance choisit où lire dans un résultat, jamais ce qu'on demande à la base.
    expect(Correspondance.safeParse({ x: { colonne: "passage.texte; DROP TABLE passage" } }).success).toBe(false);
    expect(Correspondance.safeParse({ x: { axe: "axe'; DROP TABLE passage --" } }).success).toBe(false);
  });
});

describe("la recherche plein texte", () => {
  it("trouve par un mot, sans tenir compte des accents", async () => {
    semer(["un passage sur la mesure", "un passage sur la mésure accentuée"]);
    expect(await chercher(bib, CORRESPONDANCE, { query: "mesure" })).toHaveLength(2);
  });

  it("ne rend rien plutôt que d'échouer sur une requête vide ou sans mot", async () => {
    semer(["quelque chose"]);
    for (const query of ["", "   ", "?!", undefined]) expect(await chercher(bib, CORRESPONDANCE, { query })).toEqual([]);
  });

  it("ne se laisse pas casser par la syntaxe de l'index", async () => {
    // Un guillemet ou un opérateur dans la phrase ferait répondre une erreur là où l'on attend
    // zéro résultat. Chaque mot est cité ; la phrase n'est jamais passée telle quelle.
    semer(["un passage ordinaire"]);
    for (const query of ['"', 'passage OR "', "passage AND NOT", "a* b*", "NEAR(x y)"]) {
      await expect(chercher(bib, CORRESPONDANCE, { query })).resolves.toBeInstanceOf(Array);
    }
  });

  it("borne le nombre de résultats, quoi qu'on demande", async () => {
    semer([...Array(80).keys()].map((rang) => `passage numéro ${rang} sur la mesure`));
    expect(await chercher(bib, CORRESPONDANCE, { query: "mesure", topK: 1000 })).toHaveLength(PLAFOND);
    expect(await chercher(bib, CORRESPONDANCE, { query: "mesure", topK: -5 })).toHaveLength(1);
    expect(await chercher(bib, CORRESPONDANCE, { query: "mesure", topK: "beaucoup" })).toHaveLength(5);
  });

  it("l'index suit la table sans qu'on y pense", async () => {
    semer(["avant correction"]);
    expect(await chercher(bib, CORRESPONDANCE, { query: "avant" })).toHaveLength(1);
    bib.executer("UPDATE passage SET texte = 'après correction' WHERE id = 'p0'");
    expect(await chercher(bib, CORRESPONDANCE, { query: "avant" })).toHaveLength(0);
    expect(await chercher(bib, CORRESPONDANCE, { query: "après" })).toHaveLength(1);
    bib.executer("DELETE FROM passage WHERE id = 'p0'");
    expect(await chercher(bib, CORRESPONDANCE, { query: "après" })).toHaveLength(0);
  });

  it("prépare les mots sans jamais rendre une syntaxe ouverte", () => {
    expect(motsPourIndex("un deux")).toBe('"un" OR "deux"');
    // Le guillemet n'est pas retiré du mot : il en est un séparateur, au même titre qu'une
    // espace. Le mot se coupe en deux, et c'est justement ce qui le rend inoffensif.
    expect(motsPourIndex('gui"llemet')).toBe('"gui" OR "llemet"');
    expect(motsPourIndex("a")).toBeUndefined();
  });
});

describe("les comptes par axe", () => {
  it("compte les valeurs d'axe des passages trouvés", async () => {
    semer(["mesure une", "mesure deux"]);
    const comptes = await compter(bib, CORRESPONDANCE, ["rayon", "auteur_du_lot"], { query: "mesure" });
    expect(comptes["rayon"]).toEqual({ premier: 2 });
    expect(comptes["auteur_du_lot"]).toEqual({ "Un nom": 2 });
  });

  it("compte tout quand on ne cherche rien", async () => {
    semer(["un", "deux", "trois"]);
    expect(await compter(bib, CORRESPONDANCE, ["rayon"], {})).toEqual({ rayon: { premier: 3 } });
  });
});
