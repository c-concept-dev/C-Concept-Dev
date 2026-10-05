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
describe("ce que le Worker a le droit d'appeler, et ce qu'il n'écrit jamais (SEC-01, règle 6)", () => {
  const fichiers = (dossier: string): string[] =>
    readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
      if (entree.name === "node_modules") return [];
      const chemin = join(dossier, entree.name);
      return entree.isDirectory() ? fichiers(chemin) : [chemin];
    });

  /** Ce test interdisait toute adresse distante : c'était la règle du lot 0, où le Worker ne
   *  faisait rien. Il en appelle une maintenant, et une seule. La garde n'est pas levée, elle est
   *  resserrée — une adresse de plus dans ce dossier fera échouer ce test. */
  it("n'appelle qu'une seule adresse distante, celle du modèle", () => {
    const origines = new Set<string>();
    for (const chemin of fichiers(join(RACINE, "src")))
      for (const trouvee of readFileSync(chemin, "utf8").matchAll(/https?:\/\/[\w.-]+/g)) origines.add(trouvee[0]);
    expect([...origines].filter((origine) => origine !== "https://hono.dev")).toEqual(["https://api.anthropic.com"]);
  });

  it("n'écrit aucun secret : la clé et le jeton viennent de l'hébergeur, jamais du dépôt", () => {
    for (const chemin of fichiers(join(RACINE, "src"))) {
      const contenu = readFileSync(chemin, "utf8");
      // Une clé d'API a une forme reconnaissable, et aucun fichier d'ici n'a à la porter.
      expect(contenu, chemin).not.toMatch(/sk-[A-Za-z0-9_-]{8,}/);
      // Les secrets ne sont que lus depuis les liaisons, jamais affectés à une constante.
      expect(contenu, chemin).not.toMatch(/(ANTHROPIC_API_KEY|JETON_ACCES)\s*[:=]\s*["'`]/);
    }
  });

  it("ne déploie rien de lui-même : aucun script ne lance wrangler sans qu'on le demande", () => {
    const manifeste = JSON.parse(readFileSync(join(RACINE, "package.json"), "utf8")) as { scripts?: Record<string, string> };
    const automatiques = ["postinstall", "prepare", "prepublish", "build", "test", "typecheck"];
    for (const nom of automatiques) expect(manifeste.scripts?.[nom] ?? "", nom).not.toMatch(/wrangler|deploy/i);
  });
});
