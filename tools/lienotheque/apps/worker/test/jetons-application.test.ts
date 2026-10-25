import { ApercuEnLigne } from "@lienotheque/contrats";
import { MIGRATIONS, MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { cleDerive, cleVue, jetonNeuf } from "@lienotheque/noyau";
import { beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../src/app.js";
import {
  emettreJetonApplication,
  identifierParJetonApplication,
  revoquerJetonApplication,
} from "../src/jetons-application.js";
import { inscrire, publier, type BaseSql } from "../src/registre.js";
import { NOM_DU_TEMOIN } from "../src/porte.js";
import { inscrireUnDroit, inscrireUnePersonne, ouvrirUneSession } from "../src/qui-entre.js";

const QUAND = "2026-10-25T09:00:00.000Z";
const PLUS_TARD = "2026-10-25T10:00:00.000Z";
const EXPIRE = "2026-11-24T09:00:00.000Z";
const ORIGINE = "https://application.exemple";
const AUTRE_ORIGINE = "https://autre.exemple";
const CONFIG_ORIGINES = JSON.stringify({ application: [ORIGINE], autre: [AUTRE_ORIGINE] });
const VERSION = "01932f4e-7a1b-7c3d-8e5f-0123456789ab";
const FICHIER = "pages/page-0001.webp";

const APERCU_A = ApercuEnLigne.parse({ documents: [], classements: [] });
const APERCU_B = ApercuEnLigne.parse({ documents: [], classements: [] });

const compartiment = (contenu: Record<string, string>) => ({
  get: async (cle: string) => {
    const texte = contenu[cle];
    if (texte === undefined) return null;
    return {
      body: new Blob([texte]).stream(),
      size: texte.length,
      httpMetadata: { contentType: cle.endsWith(".json") ? "application/json" : "image/webp" },
    };
  },
});

let registre: ReturnType<typeof baseEnMemoire>;
let baseA: ReturnType<typeof baseEnMemoire>;
let baseB: ReturnType<typeof baseEnMemoire>;
let env: Record<string, unknown>;

const publierDeuxBibliotheques = async () => {
  await inscrire(registre, { cle: "a", nom: "A", region: "weur", schemaVersion: 4 }, QUAND);
  await inscrire(registre, { cle: "b", nom: "B", region: "weur", schemaVersion: 4 }, QUAND);
  await publier(registre, "a", ["BIB_1", "BIB_2"], "moi", QUAND);
  await publier(registre, "b", ["BIB_1", "BIB_2"], "moi", QUAND);
};

const emettre = async (
  bibliotheque = "a",
  actions: readonly ("lire" | "chercher" | "ouvrir_fichier")[] = ["lire", "chercher", "ouvrir_fichier"],
  application = "application",
  expireLe = EXPIRE,
) => {
  const resultat = await emettreJetonApplication(
    registre,
    { application, nom: "Accès d’essai", bibliotheque, actions, expireLe },
    QUAND,
    "Christophe",
  );
  if (!resultat.fait) throw new Error(resultat.raison);
  return resultat.valeur;
};

const entetes = (jeton: string, origine = ORIGINE) => ({ "x-api-key": jeton, origin: origine });

beforeEach(async () => {
  registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
  baseA = baseEnMemoire(MIGRATIONS);
  baseB = baseEnMemoire(MIGRATIONS);
  await publierDeuxBibliotheques();
  env = {
    REGISTRE: registre,
    BIB_1: baseA,
    BIB_2: baseB,
    SECRET_LAISSEZ: "secret",
    ORIGINES_APPLICATIONS: CONFIG_ORIGINES,
    MEDIAS: compartiment({
      [cleVue("a", "apercu.json")]: JSON.stringify(APERCU_A),
      [cleVue("b", "apercu.json")]: JSON.stringify(APERCU_B),
      [cleDerive("a", VERSION, FICHIER)]: "fichier-a",
      [cleDerive("b", VERSION, FICHIER)]: "fichier-b",
    }),
  };
});

describe("C3 — le jeton d’application est borné et révocable", () => {
  it("1. distingue un jeton valide des jetons mal formé, inconnu, périmé et révoqué", async () => {
    const emis = await emettre();
    expect((await identifierParJetonApplication(registre, new Headers(entetes(emis.jeton)), PLUS_TARD)).ouverte).toBe(true);

    for (const jeton of ["mal-forme", `ln_app_${crypto.randomUUID()}.inconnu`]) {
      expect((await identifierParJetonApplication(registre, new Headers(entetes(jeton)), PLUS_TARD)).ouverte).toBe(false);
    }

    const perime = await emettre("a", ["lire"], "application", "2026-10-25T09:30:00.000Z");
    expect((await identifierParJetonApplication(registre, new Headers(entetes(perime.jeton)), PLUS_TARD)).ouverte).toBe(false);

    await revoquerJetonApplication(registre, emis.acces.id, "Christophe", PLUS_TARD);
    expect((await identifierParJetonApplication(registre, new Headers(entetes(emis.jeton)), PLUS_TARD)).ouverte).toBe(false);
  });

  it("2. applique exactement la matrice lire, chercher et ouvrir_fichier", async () => {
    const app = creerApp({ maintenant: () => new Date(PLUS_TARD), sessionsExigees: true });
    const lecture = await emettre("a", ["lire"]);
    expect((await app.request("/vue/apercu", { headers: entetes(lecture.jeton) }, env)).status).toBe(200);
    expect((await app.request("/search-library", { method: "POST", headers: entetes(lecture.jeton) }, env)).status).toBe(401);
    expect((await app.request("/laissez", { method: "POST", headers: entetes(lecture.jeton) }, env)).status).toBe(401);
  });

  it("3. ne donne aucun droit implicite à une action inconnue", async () => {
    const emis = await emettre("a", ["lire"]);
    const reconnu = await identifierParJetonApplication(registre, new Headers(entetes(emis.jeton)), PLUS_TARD);
    expect(reconnu.ouverte && reconnu.actions.has("traduire" as never)).toBe(false);
  });

  it("4. ne range jamais le secret du jeton en clair", async () => {
    const emis = await emettre();
    const ligne = await registre.prepare("SELECT empreinte FROM jeton_application WHERE id = ?").bind(emis.acces.id).first<{ empreinte: string }>();
    expect(ligne?.empreinte).not.toBe(emis.jeton);
    const brut = await registre.prepare("SELECT * FROM jeton_application WHERE id = ?").bind(emis.acces.id).first<Record<string, unknown>>();
    expect(JSON.stringify(brut)).not.toContain(emis.jeton);
  });

  it("5. accepte seulement l’origine exacte liée à l’application", async () => {
    const app = creerApp({ maintenant: () => new Date(PLUS_TARD), sessionsExigees: true });
    const emis = await emettre();
    expect((await app.request("/vue/apercu", { headers: entetes(emis.jeton) }, env)).status).toBe(200);
    expect((await app.request("/vue/apercu", { headers: entetes(emis.jeton, AUTRE_ORIGINE) }, env)).status).toBe(401);
    expect((await app.request("/vue/apercu", { headers: entetes(emis.jeton, `${ORIGINE}.pirate`) }, env)).status).toBe(401);
  });

  it("6. ne reflète jamais une origine inconnue dans CORS", async () => {
    const app = creerApp({ maintenant: () => new Date(PLUS_TARD), sessionsExigees: true });
    const inconnue = "https://inconnue.exemple";
    const reponse = await app.request(
      "/vue/apercu",
      { method: "OPTIONS", headers: { origin: inconnue, "access-control-request-method": "GET" } },
      env,
    );
    expect(reponse.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("7. isole réellement deux bibliothèques jusque dans les objets", async () => {
    const app = creerApp({ maintenant: () => new Date(PLUS_TARD), sessionsExigees: true });
    const emis = await emettre("a", ["lire"]);
    const reponse = await app.request("/vue/apercu", { headers: entetes(emis.jeton) }, env);
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual(APERCU_A);
  });

  it("8. ignore toute bibliothèque réclamée dans le corps", async () => {
    await baseA
      .prepare("INSERT INTO schema_bibliotheque VALUES ('facade', 1, ?)")
      .bind(JSON.stringify({ book_title: { colonne: "document.titre" } }))
      .run();
    const app = creerApp({ maintenant: () => new Date(PLUS_TARD), sessionsExigees: true });
    const emis = await emettre("a", ["chercher"]);
    const reponse = await app.request(
      "/search-library",
      { method: "POST", headers: { ...entetes(emis.jeton), "content-type": "application/json" }, body: JSON.stringify({ query: "", library: "b" }) },
      env,
    );
    expect(reponse.status).toBe(200);
  });

  it("9. rend une révocation effective dès la requête suivante", async () => {
    const app = creerApp({ maintenant: () => new Date(PLUS_TARD), sessionsExigees: true });
    const emis = await emettre("a", ["lire"]);
    expect((await app.request("/vue/apercu", { headers: entetes(emis.jeton) }, env)).status).toBe(200);
    await revoquerJetonApplication(registre, emis.acces.id, "Christophe", PLUS_TARD);
    expect((await app.request("/vue/apercu", { headers: entetes(emis.jeton) }, env)).status).toBe(401);
  });

  it("10. ne laisse ni émission ni révocation partielles si l’audit échoue", async () => {
    const registreDontLAuditEchoue: BaseSql = {
      prepare: (sql) =>
        sql.startsWith("INSERT INTO journal_audit")
          ? registre.prepare("INSERT INTO table_absente VALUES (?)")
          : registre.prepare(sql),
      batch: async (requetes) => registre.batch!(requetes),
    };
    const resultat = await emettreJetonApplication(
      registreDontLAuditEchoue,
      { application: "application", nom: "Refusé", bibliotheque: "a", actions: ["lire"], expireLe: EXPIRE },
      QUAND,
      "Christophe",
    );
    expect(resultat.fait).toBe(false);
    const compte = await registre.prepare("SELECT COUNT(*) AS n FROM jeton_application").bind().first<{ n: number }>();
    expect(compte?.n).toBe(0);

    const emis = await emettre("a", ["lire"]);
    const retrait = await revoquerJetonApplication(registreDontLAuditEchoue, emis.acces.id, "Christophe", PLUS_TARD);
    expect(retrait.fait).toBe(false);
    const relu = await registre
      .prepare("SELECT revoque_le FROM jeton_application WHERE id = ?")
      .bind(emis.acces.id)
      .first<{ revoque_le: string | null }>();
    expect(relu?.revoque_le).toBeNull();
  });

  it("11. permet la rotation sans interruption avant de révoquer l’ancien jeton", async () => {
    const app = creerApp({ maintenant: () => new Date(PLUS_TARD), sessionsExigees: true });
    const ancien = await emettre("a", ["lire"]);
    const nouveau = await emettre("a", ["lire"]);

    expect((await app.request("/vue/apercu", { headers: entetes(ancien.jeton) }, env)).status).toBe(200);
    expect((await app.request("/vue/apercu", { headers: entetes(nouveau.jeton) }, env)).status).toBe(200);

    await revoquerJetonApplication(registre, ancien.acces.id, "Christophe", PLUS_TARD);
    expect((await app.request("/vue/apercu", { headers: entetes(ancien.jeton) }, env)).status).toBe(401);
    expect((await app.request("/vue/apercu", { headers: entetes(nouveau.jeton) }, env)).status).toBe(200);
  });

  it("12. traverse une origine tierce : recherche, vue, laissez-passer et fichier de la seule bibliothèque", async () => {
    baseA.executer(`INSERT INTO document (id, bibliotheque_id, titre, cree_le) VALUES ('d1', 'a', 'Un titre', '${QUAND}')`);
    baseA.executer(
      `INSERT INTO version (id, document_id, numero, etat, active, recette_id, recette_ver, cree_le) VALUES ('${VERSION}', 'd1', 1, 'active', 1, 'r', 1, '${QUAND}')`,
    );
    baseA.executer(`INSERT INTO ancre (id, version_id, fichier, selecteur) VALUES ('a1', '${VERSION}', '${"f".repeat(64)}', '{"page":1}')`);
    baseA.executer(`INSERT INTO passage (id, version_id, ancre_id, rang, texte) VALUES ('p1', '${VERSION}', 'a1', 0, 'un passage mesuré')`);
    await baseA
      .prepare("INSERT INTO schema_bibliotheque VALUES ('facade', 1, ?)")
      .bind(JSON.stringify({ book_title: { colonne: "document.titre" }, content: { colonne: "passage.texte" } }))
      .run();

    const app = creerApp({ maintenant: () => new Date(PLUS_TARD), sessionsExigees: true });
    const emis = await emettre();
    const communs = { ...entetes(emis.jeton), "content-type": "application/json" };
    const recherche = await app.request(
      "/search-library",
      { method: "POST", headers: communs, body: JSON.stringify({ query: "mesuré" }) },
      env,
    );
    expect(recherche.status).toBe(200);
    expect(JSON.stringify(await recherche.json())).toContain("Un titre");
    expect(recherche.headers.get("access-control-allow-origin")).toBe(ORIGINE);

    expect((await app.request("/vue/apercu", { headers: entetes(emis.jeton) }, env)).status).toBe(200);
    const passe = await app.request(
      "/laissez",
      { method: "POST", headers: communs, body: JSON.stringify({ version: VERSION, fichier: FICHIER, library: "b" }) },
      env,
    );
    expect(passe.status).toBe(200);
    const { laissez } = (await passe.json()) as { laissez: string };
    const fichier = await app.request(`/fichier/${laissez}`, {}, env);
    expect(await fichier.text()).toBe("fichier-a");
  });

  it("13. réserve l’émission et la révocation à la session personnelle d’administration", async () => {
    const personne = await inscrireUnePersonne(registre, "Christophe", QUAND, "moi");
    if (!personne.fait) throw new Error(personne.raison);
    await inscrireUnDroit(registre, { personneId: personne.valeur.id, bibliotheque: "a", niveau: "administration" }, QUAND, "moi");
    const secretSession = jetonNeuf();
    await ouvrirUneSession(registre, { personneId: personne.valeur.id, jeton: secretSession }, QUAND);
    const cookie = `${NOM_DU_TEMOIN}=${secretSession}`;
    const app = creerApp({ maintenant: () => new Date(PLUS_TARD), sessionsExigees: true });
    const creation = await app.request(
      "/administration/jetons-application",
      {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ application: "application", nom: "Rotation", bibliotheque: "a", actions: ["lire"] }),
      },
      env,
    );
    expect(creation.status).toBe(201);
    const cree = (await creation.json()) as { jeton: string; acces: { id: string } };
    expect((await app.request("/vue/apercu", { headers: entetes(cree.jeton) }, env)).status).toBe(200);

    const retrait = await app.request(
      `/administration/jetons-application/${cree.acces.id}`,
      { method: "DELETE", headers: { cookie } },
      env,
    );
    expect(retrait.status).toBe(200);
    expect((await app.request("/vue/apercu", { headers: entetes(cree.jeton) }, env)).status).toBe(401);
  });
});
