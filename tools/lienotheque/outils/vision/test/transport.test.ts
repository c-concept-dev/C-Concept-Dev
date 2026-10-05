// @vitest-environment node
import { DemandeVision, ReponseVision } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { jetonDeLEnvironnement, transportVersWorker } from "../src/index.js";

const JETON = "jeton-de-test";
const EMPREINTE = "a".repeat(32);

const demande = (): DemandeVision =>
  DemandeVision.parse({
    alphabet: "chiffres",
    zones: [{ empreinte: EMPREINTE, image: "AAAA", typeMime: "image/webp", largeur: 80, hauteur: 85 }],
  });

const reponse = () =>
  new Response(
    JSON.stringify({
      zones: [{ empreinte: EMPREINTE, numero: 14, confiance: 0.9 }],
      jetons: { entree: 120, sortie: 18 },
      outil: { nom: "vision-ciblee", version: "0.1.0" },
    }),
  );

describe("le chemin vers le Worker (OUT-08, règle 6)", () => {
  it("porte le jeton dans l'en-tête, et la clé nulle part", async () => {
    let vue: { url: string; init: RequestInit } | undefined;
    const faux: typeof fetch = async (url, init) => {
      vue = { url: String(url), init: init! };
      return reponse();
    };
    await transportVersWorker("https://exemple.invalide/", JETON, faux)(demande());
    expect(vue?.url).toBe("https://exemple.invalide/vision");
    expect(new Headers(vue!.init.headers).get("authorization")).toBe(`Bearer ${JETON}`);
    // L'application n'a aucune clé de modèle à porter : elle n'en connaît pas.
    expect(JSON.stringify(vue!.init.body)).not.toMatch(/x-api-key|sk-/);
  });

  it("rend la réponse validée", async () => {
    const lue = await transportVersWorker("https://exemple.invalide", JETON, async () => reponse())(demande());
    expect(ReponseVision.safeParse(lue).success).toBe(true);
    expect(lue.zones[0]!.numero).toBe(14);
  });

  it("refuse une réponse non conforme au lieu de la rattraper", async () => {
    const faux: typeof fetch = async () => new Response(JSON.stringify({ zones: [{ empreinte: EMPREINTE, numero: -1, confiance: 9 }] }));
    await expect(transportVersWorker("https://exemple.invalide", JETON, faux)(demande())).rejects.toThrow(/non conforme/);
  });

  it("ne dit pas le jeton quand la route refuse", async () => {
    const faux: typeof fetch = async () => new Response("Jeton refusé", { status: 401 });
    await expect(transportVersWorker("https://exemple.invalide", JETON, faux)(demande())).rejects.toThrow(/statut 401/);
    try {
      await transportVersWorker("https://exemple.invalide", JETON, faux)(demande());
    } catch (leve) {
      expect(String(leve)).not.toContain(JETON);
    }
  });

  it("valide ce qu'il envoie, même construit par lui-même", async () => {
    const faux: typeof fetch = async () => reponse();
    const horsContrat = { alphabet: "chiffres", zones: [] } as unknown as DemandeVision;
    await expect(transportVersWorker("https://exemple.invalide", JETON, faux)(horsContrat)).rejects.toThrow();
  });
});

describe("le jeton vient de l'environnement (SEC-01)", () => {
  it("le prend quand il est là", () => {
    expect(jetonDeLEnvironnement({ LIENOTHEQUE_JETON: "abc" })).toBe("abc");
  });

  it("ne rend rien quand il manque ou qu'il est vide : ce n'est pas une panne", () => {
    expect(jetonDeLEnvironnement({})).toBeUndefined();
    expect(jetonDeLEnvironnement({ LIENOTHEQUE_JETON: "" })).toBeUndefined();
  });
});
