import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EtatService } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { CAPACITES, SERVICE, VERSION, creerApp } from "../src/index.js";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const FIGE = new Date("2026-10-03T09:00:00.000Z");
const app = creerApp({ maintenant: () => FIGE });

describe("route de santé (HEB-01 : les capacités réelles, avant toute confirmation)", () => {
  it("répond 200 et un corps conforme au contrat EtatService", async () => {
    const reponse = await app.request("/sante");
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-type")).toMatch(/application\/json/);

    const resultat = EtatService.safeParse(await reponse.json());
    expect(resultat.success, resultat.error?.message).toBe(true);
    expect(resultat.data?.service).toBe(SERVICE);
    expect(resultat.data?.version).toBe(VERSION);
    expect(resultat.data?.etat).toBe("pret");
  });

  it("n'annonce que les capacités réellement offertes", async () => {
    const corps = EtatService.parse(await (await app.request("/sante")).json());
    expect(corps.capacites).toEqual([...CAPACITES]);
    expect(corps.capacites).toContain("sante");
  });

  it("horodate sa réponse au format du contrat", async () => {
    const corps = EtatService.parse(await (await app.request("/sante")).json());
    expect(new Date(corps.horodatage).toISOString()).toBe(FIGE.toISOString());
  });

  it("ne laisse filtrer aucun secret ni chemin local (SEC-01)", async () => {
    const texte = await (await app.request("/sante")).text();
    expect(texte).not.toMatch(/key|token|secret|password|\/Users\/|account/i);
  });
});

describe("routes inconnues", () => {
  it("répond 404 en JSON plutôt qu'une page d'erreur", async () => {
    const reponse = await app.request("/inconnue");
    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toEqual({ erreur: "Route inconnue" });
  });

  it("n'expose la santé qu'en lecture", async () => {
    expect((await app.request("/sante", { method: "POST" })).status).toBe(404);
  });
});

/** CLAUDE.md, règle 7 : aucun déploiement ni appel Cloudflare au lot 0. */
describe("aucun déploiement au lot 0", () => {
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
      if (entree.name === "node_modules") return [];
      const chemin = join(dossier, entree.name);
      return entree.isDirectory() ? fichiers(chemin) : [chemin];
    });

  it("n'embarque ni Wrangler ni configuration Cloudflare", () => {
    const manifeste = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const paquets = Object.keys({ ...manifeste.dependencies, ...manifeste.devDependencies });
    expect(paquets.filter((nom) => /wrangler|cloudflare/i.test(nom))).toEqual([]);
    expect(Object.values(manifeste.scripts ?? {}).filter((s) => /wrangler|deploy/i.test(s))).toEqual([]);
    expect(fichiers(RACINE).filter((f) => /wrangler\.(toml|json|jsonc)$/.test(f))).toEqual([]);
  });

  it("n'appelle aucune adresse distante depuis le code", () => {
    for (const chemin of fichiers(join(RACINE, "src"))) {
      const contenu = readFileSync(chemin, "utf8");
      expect(contenu, chemin).not.toMatch(/https?:\/\/(?!hono\.dev)/);
      expect(contenu, chemin).not.toMatch(/\bfetch\s*\(/);
    }
  });
});
