import { MIGRATIONS, MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { creerApp } from "../src/app.js";
import { inscrire, publier } from "../src/registre.js";
import { SESSIONS_EXIGEES, estUneBibliothequeDEssai, laFacadePeutServir } from "../src/portes.js";

/** Qui ouvre quoi, et ce que la façade refuse de servir tant que personne n'est identifié.
 *
 *  Depuis le 20 octobre 2026 le Worker a **une personne**, et la bascule est posée : la façade
 *  s'ouvre à une session, plus jamais au jeton de service.
 *
 *  La garde d'essai n'en disparaît pas pour autant, et ces épreuves la tiennent **dans sa
 *  position fausse**. Une garde qu'on ne peut plus exécuter n'est pas une garde, c'est une
 *  phrase. Le jour où quelqu'un ramènerait la bascule en arrière — une cérémonie en panne, une
 *  restauration — elle redeviendrait la seule chose qui empêche qu'une vraie bibliothèque soit
 *  servie derrière un jeton partagé, et il faut savoir aujourd'hui ce qu'elle fera ce jour-là.
 */

const JETON = "jeton d'essai";
/** L'application **d'avant la bascule**, celle que la garde d'essai concerne. */
const app = creerApp({ sessionsExigees: false });

let registre: ReturnType<typeof baseEnMemoire>;
let bibliotheque: ReturnType<typeof baseEnMemoire>;

const monter = async (cle: string): Promise<Record<string, unknown>> => {
  registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
  bibliotheque = baseEnMemoire(MIGRATIONS);
  await bibliotheque
    .prepare(`INSERT INTO schema_bibliotheque (cle, version, contenu) VALUES ('facade', 1, ?)`)
    .bind(JSON.stringify({ book_title: { colonne: "document.titre" } }))
    .run();
  await inscrire(registre, { cle, nom: "Une bibliothèque", region: "weur", schemaVersion: 4 }, "2026-10-18T09:00:00.000Z");
  await publier(registre, cle, ["BIB_1"], "moi", "2026-10-18T09:00:00.000Z");
  return { JETON_ACCES: JETON, REGISTRE: registre, BIBLIOTHEQUE_FACADE: cle, BIB_1: bibliotheque };
};

const appeler = (liaisons: Record<string, unknown>, entetes: Record<string, string> = { "x-api-key": JETON }) =>
  app.request("/search-library", { method: "POST", headers: { "content-type": "application/json", ...entetes }, body: "{}" }, liaisons);

describe("la bibliothèque d'essai se reconnaît à son nom", () => {
  it("accepte la clé courte du registre et le nom long de la base", () => {
    // Les deux noms diffèrent : la base D1 s'appelle « lienotheque-essai », la clé au registre
    // s'appelle « essai ». Le Worker ne connaît que la seconde.
    expect(estUneBibliothequeDEssai("essai")).toBe(true);
    expect(estUneBibliothequeDEssai("lienotheque-essai")).toBe(true);
    expect(estUneBibliothequeDEssai("lienotheque-restauration-essai")).toBe(true);
  });

  it("refuse tout le reste, y compris ce qui commence par le mot", () => {
    expect(estUneBibliothequeDEssai("therapie")).toBe(false);
    expect(estUneBibliothequeDEssai("essai-reel")).toBe(false);
    expect(estUneBibliothequeDEssai("mon-essai-a-moi")).toBe(false);
    expect(estUneBibliothequeDEssai("")).toBe(false);
  });

  it("dit ouvertement que les sessions sont désormais exigées", () => {
    // Posée le 20 octobre 2026 sur une mesure et non sur une intention : une clé enrôlée, puis
    // deux sessions ouvertes par signature vérifiée en production. Le jeton de service n'ouvre
    // plus la façade.
    expect(SESSIONS_EXIGEES).toBe(true);
  });

  it("laisse la garde d'essai mordre quand la bascule est fausse, et s'effacer quand elle est vraie", () => {
    // Les deux positions, explicitement. La constante du jour n'en dit qu'une, et c'est
    // précisément ce qu'une garde devenue inexécutable cesse de pouvoir prouver.
    expect(laFacadePeutServir("therapie", false)).toBe(false);
    expect(laFacadePeutServir("essai", false)).toBe(true);
    expect(laFacadePeutServir("therapie", true)).toBe(true);
  });
});

describe("la façade ne sert qu'une bibliothèque d'essai tant que personne n'est identifié", () => {
  beforeEach(() => {
    registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
  });

  it("sert la bibliothèque d'essai", async () => {
    const reponse = await appeler(await monter("essai"));
    expect(reponse.status).toBe(200);
  });

  it("refuse une bibliothèque qui n'est pas d'essai, sans dire laquelle", async () => {
    const reponse = await appeler(await monter("therapie"));
    expect(reponse.status).toBe(503);
    // Le même mot que pour toute autre indisponibilité : un appelant n'apprend ni qu'elle
    // existe, ni pourquoi elle est refusée.
    expect(await reponse.json()).toEqual({ erreur: "Bibliothèque indisponible" });
  });

  it("vérifie le jeton **avant** la nature de la bibliothèque", async () => {
    // L'ordre inverse apprendrait à un appelant anonyme sur quoi la façade bute. C'est le
    // défaut qu'E1 a corrigé le 10 octobre, et qu'aucun test ne voyait alors.
    const reponse = await appeler(await monter("therapie"), { "x-api-key": "mauvais jeton" });
    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({ erreur: "Jeton refusé" });
  });
});
