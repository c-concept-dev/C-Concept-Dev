import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(fileURLToPath(new URL("../sql/recherche-bureau.sql", import.meta.url)), "utf8");

describe("le schéma partagé de l'index bureau (C10)", () => {
  it("retrouve sans accents dans plusieurs documents et suit les suppressions", () => {
    const base = new DatabaseSync(":memory:");
    base.exec("PRAGMA foreign_keys = ON");
    base.exec(SQL);
    const document = base.prepare("INSERT INTO document_recherche VALUES (?, ?, ?, ?)");
    const passage = base.prepare(
      "INSERT INTO passage_recherche(empreinte, rang, page, texte, source, lisible) VALUES (?, ?, ?, ?, ?, 1)",
    );
    document.run("a".repeat(64), "v1", "Premier", 1);
    document.run("b".repeat(64), "v2", "Second", 2);
    passage.run("a".repeat(64), 0, 3, "Une mémoire fidèle", "couche_texte");
    passage.run("b".repeat(64), 0, 9, "La memoire commune", "ocr");

    const trouves = base.prepare(
      "SELECT p.empreinte, p.page FROM passage_recherche_texte t JOIN passage_recherche p ON p.id=t.rowid WHERE passage_recherche_texte MATCH ? ORDER BY bm25(passage_recherche_texte)",
    ).all('"memoire"');
    expect(trouves).toHaveLength(2);

    base.prepare("DELETE FROM document_recherche WHERE empreinte = ?").run("a".repeat(64));
    expect(base.prepare("SELECT count(*) AS n FROM passage_recherche").get()).toEqual({ n: 1 });
    base.close();
  });
});
