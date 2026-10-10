import { cleSource, signer } from "@lienotheque/noyau";
import { describe, expect, it } from "vitest";
import { creerApp } from "../src/index.js";

const SECRET = "secret d'essai";
const EMPREINTE = "c".repeat(64);
const CLE = cleSource("essai", EMPREINTE);
const app = creerApp();

/** Un compartiment qui note ce qu'on lui demande : c'est ce qu'il faut vérifier — qu'on ne le
 *  touche **jamais** avant d'avoir vérifié le laissez-passer. */
function compartiment(contenu: Record<string, string>) {
  const demandes: string[] = [];
  return {
    demandes,
    liaison: {
      get: async (cle: string) => {
        demandes.push(cle);
        const texte = contenu[cle];
        if (texte === undefined) return null;
        return {
          body: new Blob([texte]).stream(),
          size: texte.length,
          httpEtag: '"abc"',
          httpMetadata: { contentType: "image/webp" },
        };
      },
    },
  };
}

const liaisons = (compart: ReturnType<typeof compartiment>) => ({ SECRET_LAISSEZ: SECRET, MEDIAS: compart.liaison });
const dans = (secondes: number) => Math.floor(Date.now() / 1000) + secondes;

describe("servir un fichier (SEC-05)", () => {
  it("sert le fichier sur un laissez-passer valide", async () => {
    const compart = compartiment({ [CLE]: "des octets" });
    const jeton = await signer(SECRET, { bibliotheque: "essai", cle: CLE, jusqua: dans(60) });
    const reponse = await app.request(`/fichier/${jeton}`, {}, liaisons(compart));
    expect(reponse.status).toBe(200);
    expect(await reponse.text()).toBe("des octets");
    expect(reponse.headers.get("content-type")).toBe("image/webp");
  });

  it("ne met jamais un fichier servi dans un cache partagé", async () => {
    // Sans cela, un intermédiaire le resservirait après l'expiration du laissez-passer, et la
    // durée courte ne protégerait plus rien.
    const compart = compartiment({ [CLE]: "x" });
    const jeton = await signer(SECRET, { bibliotheque: "essai", cle: CLE, jusqua: dans(60) });
    const reponse = await app.request(`/fichier/${jeton}`, {}, liaisons(compart));
    expect(reponse.headers.get("cache-control")).toMatch(/private/);
    expect(reponse.headers.get("cache-control")).toMatch(/no-store/);
  });

  it("refuse un laissez-passer signé d'un autre secret, sans toucher au compartiment", async () => {
    const compart = compartiment({ [CLE]: "des octets" });
    const jeton = await signer("un autre secret", { bibliotheque: "essai", cle: CLE, jusqua: dans(60) });
    const reponse = await app.request(`/fichier/${jeton}`, {}, liaisons(compart));
    expect(reponse.status).toBe(403);
    expect(compart.demandes, "le compartiment a été lu avant la vérification").toEqual([]);
  });

  it("refuse un laissez-passer périmé sans toucher au compartiment", async () => {
    const compart = compartiment({ [CLE]: "des octets" });
    const jeton = await signer(SECRET, { bibliotheque: "essai", cle: CLE, jusqua: dans(-1) });
    const reponse = await app.request(`/fichier/${jeton}`, {}, liaisons(compart));
    expect(reponse.status).toBe(403);
    expect(compart.demandes).toEqual([]);
  });

  it("refuse une clé d'une autre bibliothèque, même signée", async () => {
    const compart = compartiment({});
    const jeton = await signer(SECRET, { bibliotheque: "essai", cle: cleSource("autre", EMPREINTE), jusqua: dans(60) });
    expect((await app.request(`/fichier/${jeton}`, {}, liaisons(compart))).status).toBe(403);
    expect(compart.demandes).toEqual([]);
  });

  it("distingue un fichier absent d'un laissez-passer refusé par le code, pas par le message", async () => {
    // 404 dit « pas là », 403 dit « pas vous ». Un message qui expliquerait lequel apprendrait
    // ce qui existe à qui n'a pas le droit de le savoir.
    const compart = compartiment({});
    const jeton = await signer(SECRET, { bibliotheque: "essai", cle: CLE, jusqua: dans(60) });
    const reponse = await app.request(`/fichier/${jeton}`, {}, liaisons(compart));
    expect(reponse.status).toBe(404);
    expect(compart.demandes).toEqual([CLE]);
  });

  it("n'ouvre pas du tout si le service n'est pas configuré", async () => {
    // Une route ouverte sans secret serait pire qu'une route absente : l'oubli d'un secret ne
    // doit pas se solder par un service offert.
    const jeton = await signer(SECRET, { bibliotheque: "essai", cle: CLE, jusqua: dans(60) });
    expect((await app.request(`/fichier/${jeton}`, {}, {})).status).toBe(503);
    expect((await app.request(`/fichier/${jeton}`, {}, { SECRET_LAISSEZ: SECRET })).status).toBe(503);
  });

  it("annonce « fichiers » dans ses capacités", async () => {
    const corps = (await (await app.request("/sante")).json()) as { capacites: string[] };
    expect(corps.capacites).toContain("fichiers");
  });
});
