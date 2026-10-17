import { describe, expect, it } from "vitest";
import { DUREE_PAR_DEFAUT, signer, verifier } from "../src/laissez-passer.js";
import { cleSource } from "../src/objets.js";

const SECRET = "un secret qui ne sort jamais de l'hébergeur";
const AUTRE = "un autre secret";
const EMPREINTE = "b".repeat(64);
const MAINTENANT = 1_800_000_000;
const laissez = (bibliotheque = "essai", dans = DUREE_PAR_DEFAUT) => ({
  bibliotheque,
  cle: cleSource(bibliotheque, EMPREINTE),
  jusqua: MAINTENANT + dans,
});

describe("le laissez-passer qui ouvre un fichier (SEC-05)", () => {
  it("s'ouvre avec le bon secret, avant son terme", async () => {
    const jeton = await signer(SECRET, laissez());
    const verdict = await verifier(SECRET, jeton, MAINTENANT);
    expect(verdict.ouvert).toBe(true);
    if (verdict.ouvert) expect(verdict.laissez.bibliotheque).toBe("essai");
  });

  it("refuse un autre secret", async () => {
    const jeton = await signer(SECRET, laissez());
    expect(await verifier(AUTRE, jeton, MAINTENANT)).toMatchObject({ ouvert: false, raison: "Signature refusée" });
  });

  it("refuse une charge modifiée, même d'un caractère", async () => {
    // C'est tout l'objet : la clé de l'objet ne vaut rien, c'est la signature qui autorise.
    const jeton = await signer(SECRET, laissez());
    const [charge, signature] = jeton.split(".");
    const trafique = `${charge!.slice(0, -1)}${charge!.endsWith("A") ? "B" : "A"}.${signature}`;
    expect(await verifier(SECRET, trafique, MAINTENANT)).toMatchObject({ ouvert: false });
  });

  it("refuse après son terme, à la seconde près", async () => {
    const jeton = await signer(SECRET, laissez("essai", 60));
    expect(await verifier(SECRET, jeton, MAINTENANT + 59)).toMatchObject({ ouvert: true });
    expect(await verifier(SECRET, jeton, MAINTENANT + 60)).toMatchObject({ ouvert: false, raison: "Laissez-passer périmé" });
  });

  it("refuse un fichier d'une autre bibliothèque, même signé", async () => {
    // Une signature atteste qu'on a écrit le laissez-passer, pas qu'on avait raison de l'écrire.
    const jeton = await signer(SECRET, { bibliotheque: "essai", cle: cleSource("autre", EMPREINTE), jusqua: MAINTENANT + 60 });
    expect(await verifier(SECRET, jeton, MAINTENANT)).toMatchObject({ ouvert: false });
  });

  it("refuse proprement ce qui n'est pas un laissez-passer", async () => {
    for (const bancal of ["", ".", "sansPoint", "a.b", "....."]) {
      const verdict = await verifier(SECRET, bancal, MAINTENANT);
      expect(verdict.ouvert, `« ${bancal} » a été accepté`).toBe(false);
    }
  });

  it("dit pourquoi il refuse, sans jamais lever", async () => {
    const verdict = await verifier(SECRET, "nawak.nawak", MAINTENANT);
    expect(verdict.ouvert).toBe(false);
    if (!verdict.ouvert) expect(verdict.raison.length).toBeGreaterThan(0);
  });

  it("deux laissez-passer identiques se signent pareil", async () => {
    expect(await signer(SECRET, laissez())).toBe(await signer(SECRET, laissez()));
  });

  it("dure trois minutes par défaut : assez pour charger, trop peu pour partager", () => {
    expect(DUREE_PAR_DEFAUT).toBe(180);
  });
});
