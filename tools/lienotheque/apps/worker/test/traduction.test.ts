import { MIGRATIONS, MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { creerApp } from "../src/app.js";
import { inscrire, publier } from "../src/registre.js";
import {
  PhraseTropLongue,
  decouperPourTraduction,
  traduireLaPage,
} from "../src/traduction.js";
import type { ModeleDeTraduction } from "../src/traduction.js";

const VERSION = "01932f4e-7a1b-7c3d-8e5f-00000000c001";
const DOCUMENT = "01932f4e-7a1b-7c3d-8e5f-00000000d001";

describe("découpage de traduction sans perte (OUT-11)", () => {
  it("recompose exactement la source et ne coupe qu'après une phrase entière", () => {
    const phrases = [
      "First sentence keeps every space.  ",
      `${"A".repeat(230)}. `,
      `${"B".repeat(230)}!\n`,
      "Last sentence?",
    ];
    const source = phrases.join("");
    const segments = decouperPourTraduction(source);

    expect(segments.join("")).toBe(source);
    expect(segments.every((segment) => segment.length <= 500)).toBe(true);
    expect(segments.slice(0, -1).every((segment) => /[.!?…][”"’')\]]*\s*$/u.test(segment))).toBe(true);
  });

  it("refuse une phrase isolée de plus de 500 caractères au lieu de la couper", () => {
    expect(() => decouperPourTraduction(`${"mot ".repeat(130)}fin.`)).toThrow(PhraseTropLongue);
  });
});

describe("cache atomique d'une traduction de page (OUT-11)", () => {
  let base: ReturnType<typeof baseEnMemoire>;

  beforeEach(() => {
    base = baseEnMemoire(MIGRATIONS);
    base.executer(
      `INSERT INTO document (id, bibliotheque_id, titre, cree_le) VALUES ('${DOCUMENT}', 'essai', 'A title', '2026-10-24')`,
    );
    base.executer(
      `INSERT INTO version (id, document_id, numero, etat, active, recette_id, recette_ver, cree_le)
       VALUES ('${VERSION}', '${DOCUMENT}', 1, 'active', 1, 'r', 1, '2026-10-24')`,
    );
    base.executer(
      `INSERT INTO passage (id, version_id, rang, texte, source, page, lisible)
       VALUES ('p1', '${VERSION}', 0, 'This is the first English sentence. It belongs to the requested page.', 'couche_texte', 7, 1),
              ('p2', '${VERSION}', 1, 'This is another complete sentence.', 'couche_texte', 7, 1)`,
    );
  });

  it("n'écrit absolument rien si un seul segment échoue", async () => {
    let appels = 0;
    const modele: ModeleDeTraduction = {
      traduire: vi.fn(async (texte) => {
        appels += 1;
        if (appels === 2) throw new Error("panne du second segment");
        return `FR:${texte}`;
      }),
    };

    await expect(
      traduireLaPage(base, modele, { version: VERSION, page: 7 }, { maintenant: () => "2026-10-24T12:00:00+02:00" }),
    ).rejects.toThrow(/second segment/i);

    const cache = await base.prepare("SELECT COUNT(*) AS n FROM traduction_page").bind().first<{ n: number }>();
    expect(cache?.n).toBe(0);
  });

  it("relit le cache sans rappeler le modèle après une première réussite", async () => {
    const modele: ModeleDeTraduction = { traduire: vi.fn(async (texte) => `FR:${texte}`) };
    const options = { maintenant: () => "2026-10-24T12:00:00+02:00" };

    const premiere = await traduireLaPage(base, modele, { version: VERSION, page: 7 }, options);
    const appelsApresPremiere = vi.mocked(modele.traduire).mock.calls.length;
    const seconde = await traduireLaPage(base, modele, { version: VERSION, page: 7 }, options);

    expect(premiere).toMatchObject({ etat: "traduite", cache: "cree", modele: "@cf/meta/m2m100-1.2b" });
    expect(seconde).toMatchObject({ etat: "traduite", cache: "present" });
    expect(vi.mocked(modele.traduire)).toHaveBeenCalledTimes(appelsApresPremiere);
  });
});

describe("route de traduction : le navigateur ne fournit jamais le texte", () => {
  it("traduit depuis D1, refuse un texte substitué et ressert ensuite le cache", async () => {
    const registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
    const bibliotheque = baseEnMemoire(MIGRATIONS);
    bibliotheque.executer(
      `INSERT INTO document (id, bibliotheque_id, titre, cree_le) VALUES ('${DOCUMENT}', 'essai', 'A title', '2026-10-24')`,
    );
    bibliotheque.executer(
      `INSERT INTO version (id, document_id, numero, etat, active, recette_id, recette_ver, cree_le)
       VALUES ('${VERSION}', '${DOCUMENT}', 1, 'active', 1, 'r', 1, '2026-10-24')`,
    );
    bibliotheque.executer(
      `INSERT INTO passage (id, version_id, rang, texte, source, page, lisible)
       VALUES ('p1', '${VERSION}', 0, 'This canonical English text comes only from the database.', 'couche_texte', 7, 1)`,
    );
    bibliotheque.executer(
      `INSERT INTO classement (document_id, schema_cle, schema_version, axes)
       VALUES ('${DOCUMENT}', 's', 1, '{"langue":"en"}')`,
    );
    await bibliotheque
      .prepare("INSERT INTO schema_bibliotheque (cle, version, contenu) VALUES ('facade', 1, ?)")
      .bind(JSON.stringify({ language: { axe: "langue" }, content: { colonne: "passage.texte" } }))
      .run();
    await inscrire(registre, { cle: "essai", nom: "Essai", region: "weur", schemaVersion: 8 }, "2026-10-24T12:00:00.000Z");
    await publier(registre, "essai", ["BIB_1"], "moi", "2026-10-24T12:00:00.000Z");

    const run = vi.fn(async (_modele: string, entree: Record<string, unknown>) => ({
      translated_text: `FR:${String(entree["text"])}`,
    }));
    const liaisons = {
      JETON_ACCES: "jeton",
      REGISTRE: registre,
      BIBLIOTHEQUE_FACADE: "essai",
      BIB_1: bibliotheque,
      AI: { run },
    };
    const app = creerApp({ sessionsExigees: false });
    const appeler = (corps: unknown) =>
      app.request(
        "/traduction/page",
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": "jeton" },
          body: JSON.stringify(corps),
        },
        liaisons,
      );

    expect((await appeler({ version: VERSION, page: 7, texte: "texte substitué" })).status).toBe(400);
    expect(run).not.toHaveBeenCalled();

    const premiere = await appeler({ version: VERSION, page: 7 });
    expect(premiere.status).toBe(200);
    expect(await premiere.json()).toMatchObject({
      etat: "traduite",
      cache: "cree",
      traduction: ["FR:This canonical English text comes only from the database."],
    });
    const seconde = await appeler({ version: VERSION, page: 7 });
    expect(await seconde.json()).toMatchObject({ etat: "traduite", cache: "present" });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
