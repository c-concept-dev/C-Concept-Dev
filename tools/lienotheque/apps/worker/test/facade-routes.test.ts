import { MIGRATIONS, MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../src/index.js";
import { inscrire, publier } from "../src/registre.js";

const JETON = "jeton d'essai";
const app = creerApp();

const enMemoire = baseEnMemoire;

const CORRESPONDANCE = {
  book_id: { colonne: "document.id" },
  book_title: { colonne: "document.titre" },
  content: { colonne: "passage.texte" },
  page_number: { colonne: "ancre.page" },
  rayon: { axe: "axe_un" },
};

let registre: ReturnType<typeof enMemoire>;
let bibliotheque: ReturnType<typeof enMemoire>;
let liaisons: Record<string, unknown>;

beforeEach(async () => {
  registre = enMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
  bibliotheque = enMemoire(MIGRATIONS);

  bibliotheque.executer(`INSERT INTO document (id, bibliotheque_id, titre, cree_le) VALUES ('d1', 'essai', 'Un titre', '2026-10-10')`);
  bibliotheque.executer(
    `INSERT INTO version (id, document_id, numero, etat, active, recette_id, recette_ver, cree_le) VALUES ('v1', 'd1', 1, 'active', 1, 'r', 1, '2026-10-10')`,
  );
  bibliotheque.executer(`INSERT INTO classement (document_id, schema_cle, schema_version, axes) VALUES ('d1', 's', 1, '{"axe_un":"Une valeur"}')`);
  bibliotheque.executer(`INSERT INTO ancre (id, version_id, fichier, selecteur) VALUES ('a1', 'v1', '${"f".repeat(64)}', '{"page":42}')`);
  bibliotheque.executer(`INSERT INTO passage (id, version_id, ancre_id, rang, texte) VALUES ('p1', 'v1', 'a1', 0, 'un passage sur la mesure')`);
  await bibliotheque
    .prepare(`INSERT INTO schema_bibliotheque (cle, version, contenu) VALUES ('facade', 1, ?)`)
    .bind(JSON.stringify(CORRESPONDANCE))
    .run();

  await inscrire(registre, { cle: "essai", nom: "Essai", region: "weur", schemaVersion: 4 }, "2026-10-10T09:00:00.000Z");
  await publier(registre, "essai", ["BIB_1"], "moi", "2026-10-10T09:00:00.000Z");

  liaisons = { JETON_ACCES: JETON, REGISTRE: registre, BIBLIOTHEQUE_FACADE: "essai", BIB_1: bibliotheque };
});

const appeler = (route: string, corps: unknown, entetes: Record<string, string> = { "x-api-key": JETON }) =>
  app.request(route, { method: "POST", headers: { "content-type": "application/json", ...entetes }, body: JSON.stringify(corps) }, liaisons);

describe("la façade, de bout en bout (INT-04, RCH-12)", () => {
  it("rend des résultats à la forme attendue sur /search-library", async () => {
    const reponse = await appeler("/search-library", { query: "mesure", topK: 5 });
    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as { results: Record<string, unknown>[] };
    expect(corps.results).toHaveLength(1);
    expect(corps.results[0]).toMatchObject({ book_id: "d1", book_title: "Un titre", page_number: 42, rayon: "Une valeur" });
  });

  it("rend « chunks » sur /rag-search et « results » sur /d1-query", async () => {
    // L'application a deux habitudes ; nous n'avons pas deux réponses.
    const rag = (await (await appeler("/rag-search", { query: "mesure" })).json()) as { chunks: unknown[] };
    const d1 = (await (await appeler("/d1-query", { terms: ["mesure"] })).json()) as { results: unknown[] };
    expect(rag.chunks).toHaveLength(1);
    expect(d1.results).toHaveLength(1);
  });

  it("rend des comptes sur /library-facets, pour les seuls champs tirés d'un axe", async () => {
    const corps = (await (await appeler("/library-facets", { query: "mesure" })).json()) as {
      facets: Record<string, Record<string, number>>;
    };
    expect(corps.facets).toEqual({ rayon: { "Une valeur": 1 } });
  });

  it("refuse sans jeton, et avec un mauvais jeton", async () => {
    for (const entetes of [{}, { "x-api-key": "pas le bon" }]) {
      expect((await appeler("/search-library", { query: "mesure" }, entetes)).status).toBe(401);
    }
  });

  it("n'ouvre pas du tout si la façade n'est pas configurée", async () => {
    liaisons = { JETON_ACCES: JETON };
    expect((await appeler("/search-library", { query: "mesure" })).status).toBe(503);
  });

  it("refuse sans jeton avant même de regarder sa configuration", async () => {
    // Sinon un appelant anonyme apprend si la façade est configurée, et sur quelle bibliothèque
    // elle bute. Le défaut s'était glissé là et ne s'est vu qu'en appelant le service déployé :
    // chaque test regardait une question à la fois, et aucun ne regardait leur ordre.
    liaisons = { JETON_ACCES: JETON };
    const sansJeton = await appeler("/search-library", { query: "mesure" }, {});
    expect(sansJeton.status).toBe(401);
    expect(await sansJeton.json()).toEqual({ erreur: "Jeton refusé" });
  });

  it("dit « jeton refusé » même quand c'est le jeton du service qui manque", async () => {
    // « Le jeton n'est pas configuré » renseignerait sur l'état du service sans y avoir droit.
    liaisons = {};
    expect((await appeler("/search-library", { query: "mesure" })).status).toBe(401);
  });

  it("répond « indisponible » plutôt que n'importe quoi si la bibliothèque n'est pas servie", async () => {
    liaisons = { ...liaisons, BIBLIOTHEQUE_FACADE: "jamais-inscrite" };
    expect((await appeler("/search-library", { query: "mesure" })).status).toBe(503);
  });

  it("répond « indisponible » plutôt que des champs vides si la correspondance est illisible", async () => {
    // Rendre des champs vides sans le dire serait pire qu'une panne : l'application croirait
    // que la bibliothèque ne contient rien.
      await bibliotheque.prepare(`UPDATE schema_bibliotheque SET contenu = ? WHERE cle = 'facade'`).bind('{"x":{"colonne":"inventée"}}').run();
    expect((await appeler("/search-library", { query: "mesure" })).status).toBe(503);
  });

  it("ne laisse pas l'appelant choisir la bibliothèque", async () => {
    // Le corps peut dire ce qu'il veut : la bibliothèque vient de la configuration.
    const corps = (await (await appeler("/search-library", { query: "mesure", library: "autre" })).json()) as {
      results: Record<string, unknown>[];
    };
    expect(corps.results[0]).toMatchObject({ book_id: "d1" });
  });

  it("annonce « recherche » dans ses capacités", async () => {
    const corps = (await (await app.request("/sante")).json()) as { capacites: string[] };
    expect(corps.capacites).toContain("recherche");
  });
});
