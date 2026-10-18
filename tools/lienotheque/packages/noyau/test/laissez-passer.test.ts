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

  it("refuse au lieu de lever quand la clé de signature est inutilisable", async () => {
    // Un secret vide fait lever l'import de la clé — mesuré : « Zero-length key is not
    // supported ». Sans garde, une vérification rendrait une exception là où tout le reste du
    // module rend un verdict, et la route répondrait 500 au lieu de refuser.
    //
    // La route refuse déjà un secret vide avant d'arriver là ; ce test tient la promesse du
    // module lui-même — « jamais une exception » — pour tout appelant qui n'aurait pas la même
    // vigilance.
    const jeton = await signer(SECRET, laissez());

    const verdict = await verifier("", jeton, MAINTENANT);
    expect(verdict.ouvert).toBe(false);
    if (!verdict.ouvert) expect(verdict.raison).toBe("Signature invérifiable");
  });

  it("ne confond pas une signature invérifiable avec une signature refusée", async () => {
    // La distinction est la même que dans `signature.ts` : l'une est une tentative qui échoue,
    // l'autre est un défaut. Les deux refusent, et elles ne se nomment pas pareil.
    const jeton = await signer(SECRET, laissez());
    const falsifie = `${jeton.slice(0, jeton.lastIndexOf("."))}.${"A".repeat(43)}`;

    const refusee = await verifier(SECRET, falsifie, MAINTENANT);
    expect(refusee.ouvert).toBe(false);
    if (!refusee.ouvert) expect(refusee.raison).toBe("Signature refusée");

    const inverifiable = await verifier("", jeton, MAINTENANT);
    expect(inverifiable.ouvert).toBe(false);
    if (!inverifiable.ouvert) expect(inverifiable.raison).not.toBe("Signature refusée");
  });

  it("rend faux plutôt que de lever sur une signature de longueur absurde", async () => {
    // Mesuré sur HMAC : zéro, un, sept et soixante-quatre **octets** rendent tous faux, jamais
    // une exception. C'est pourquoi la garde ajoutée ne couvre pas « verify » mais l'import de la
    // clé — consigné ici pour qu'on n'aille pas chercher ailleurs plus tard.
    const charge = (await signer(SECRET, laissez())).split(".")[0]!;
    for (const octets of [0, 1, 7, 64]) {
      // En base64url, et non en répétant un caractère : « A » tout seul ne se décode pas, et le
      // refus serait alors « illisible » — ce qui est juste, mais ne mesure pas ce qu'on veut.
      const signature = Buffer.from(new Uint8Array(octets)).toString("base64url");
      const verdict = await verifier(SECRET, `${charge}.${signature}`, MAINTENANT);
      expect(verdict.ouvert, `${octets} octets`).toBe(false);
      if (!verdict.ouvert) expect(verdict.raison, `${octets} octets`).toBe("Signature refusée");
    }
  });

  it("dit « illisible » quand la signature n'est même pas de la base64", async () => {
    // Le cas que le test précédent a d'abord confondu avec le sien. Les deux refusent, et ils ne
    // se nomment pas pareil — c'est exactement l'intérêt de la distinction.
    const charge = (await signer(SECRET, laissez())).split(".")[0]!;
    const verdict = await verifier(SECRET, `${charge}.A`, MAINTENANT);
    expect(verdict.ouvert).toBe(false);
    if (!verdict.ouvert) expect(verdict.raison).toBe("Signature illisible");
  });
});
