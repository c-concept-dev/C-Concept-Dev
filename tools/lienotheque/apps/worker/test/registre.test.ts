import { MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { depublier, inscrire, journaliser, laBibliotheque, publier, toutesLesBibliotheques } from "../src/registre.js";

/** Une vraie base, au vrai schéma — pas un faux objet.
 *
 *  Un faux dirait ce qu'on lui a appris à dire. Le schéma, lui, refuse ce qu'il refuse : deux
 *  bibliothèques sur la même place, un préfixe en double. C'est tout l'intérêt d'avoir mis ces
 *  contraintes dans la base plutôt que dans le code, et un test contre un faux les manquerait.
 *
 *  L'aide vit dans l'adaptateur, seul autorisé à connaître le moteur de base (lot 0). */
const registreEnMemoire = () => baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);

const QUAND = "2026-10-10T09:00:00.000Z";
const PLUS_TARD = "2026-10-10T10:00:00.000Z";
const RESERVE = ["BIB_1", "BIB_2"];
const neuve = { cle: "alpha", nom: "Alpha", region: "weur", schemaVersion: 3 };

let registre: ReturnType<typeof registreEnMemoire>;
beforeEach(() => {
  registre?.fermer();
  registre = registreEnMemoire();
});

describe("inscrire une bibliothèque", () => {
  it("entre d'abord comme locale, même si on va la publier aussitôt", async () => {
    // « Publiée » dit que quelque chose est servi. Tant que rien ne l'est, l'état ment.
    const faite = await inscrire(registre, neuve, QUAND);
    expect(faite).toMatchObject({ fait: true });
    expect((await laBibliotheque(registre, "alpha"))?.etat).toBe("locale");
  });

  it("refuse deux bibliothèques du même nom court", async () => {
    await inscrire(registre, neuve, QUAND);
    expect(await inscrire(registre, neuve, QUAND)).toMatchObject({ fait: false });
  });

  it("dérive le préfixe de la clé, et ne le reçoit de personne", async () => {
    await inscrire(registre, neuve, QUAND);
    expect((await laBibliotheque(registre, "alpha"))?.prefixe).toBe("alpha/");
  });
});

describe("publier et dépublier (PLT-06, HEB-03)", () => {
  it("prend une place libre et la note", async () => {
    await inscrire(registre, neuve, QUAND);
    const faite = await publier(registre, "alpha", RESERVE, "moi", PLUS_TARD);
    expect(faite).toMatchObject({ fait: true });
    const lue = await laBibliotheque(registre, "alpha");
    expect(lue).toMatchObject({ etat: "publiee", liaison: "BIB_1", publieeLe: PLUS_TARD });
  });

  it("ne donne jamais la même place à deux bibliothèques", async () => {
    await inscrire(registre, neuve, QUAND);
    await inscrire(registre, { ...neuve, cle: "beta", nom: "Bêta" }, QUAND);
    await publier(registre, "alpha", RESERVE, "moi", PLUS_TARD);
    await publier(registre, "beta", RESERVE, "moi", PLUS_TARD);
    const places = (await toutesLesBibliotheques(registre)).map((b) => b.liaison);
    expect(new Set(places).size).toBe(places.length);
  });

  it("dit qu'il faut redéployer quand la réserve est pleine, plutôt que d'échouer plus loin", async () => {
    await inscrire(registre, neuve, QUAND);
    await inscrire(registre, { ...neuve, cle: "beta", nom: "Bêta" }, QUAND);
    await publier(registre, "alpha", ["BIB_1"], "moi", PLUS_TARD);
    expect(await publier(registre, "beta", ["BIB_1"], "moi", PLUS_TARD)).toMatchObject({ fait: false });
    const refus = await publier(registre, "beta", ["BIB_1"], "moi", PLUS_TARD);
    if (!refus.fait) expect(refus.raison).toMatch(/redéployer/);
  });

  it("dépublier libère la place et ne supprime rien", async () => {
    await inscrire(registre, neuve, QUAND);
    await publier(registre, "alpha", RESERVE, "moi", PLUS_TARD);
    expect(await depublier(registre, "alpha", "moi", PLUS_TARD)).toMatchObject({ fait: true });

    const lue = await laBibliotheque(registre, "alpha");
    expect(lue).toMatchObject({ etat: "locale" });
    expect(lue?.liaison).toBeUndefined();
    // La ligne est toujours là : c'est ce qui rend le retour arrière sans perte.
    expect((await toutesLesBibliotheques(registre)).length).toBe(1);
  });

  it("on peut publier, dépublier, republier — et reprendre une place", async () => {
    await inscrire(registre, neuve, QUAND);
    await publier(registre, "alpha", RESERVE, "moi", PLUS_TARD);
    await depublier(registre, "alpha", "moi", PLUS_TARD);
    expect(await publier(registre, "alpha", RESERVE, "moi", PLUS_TARD)).toMatchObject({ fait: true });
  });

  it("refuse de dépublier ce qui n'est pas servi", async () => {
    await inscrire(registre, neuve, QUAND);
    expect(await depublier(registre, "alpha", "moi", PLUS_TARD)).toMatchObject({ fait: false });
  });

  it("refuse une bibliothèque inconnue, sans rien apprendre de plus", async () => {
    expect(await publier(registre, "jamais-vue", RESERVE, "moi", PLUS_TARD)).toMatchObject({ fait: false });
  });
});

describe("le journal d'audit (SEC-07)", () => {
  it("inscrit la publication et la dépublication, avec leur auteur", async () => {
    await inscrire(registre, neuve, QUAND);
    await publier(registre, "alpha", RESERVE, "christophe", PLUS_TARD);
    await depublier(registre, "alpha", "christophe", PLUS_TARD);

    const { results } = await registre.prepare("SELECT operation, auteur, detail FROM journal_audit ORDER BY fait_le, operation").bind().all<{
      operation: string;
      auteur: string;
      detail: string | null;
    }>();
    expect(results.map((l) => l.operation)).toEqual(["depublication", "publication"]);
    expect(new Set(results.map((l) => l.auteur))).toEqual(new Set(["christophe"]));
    expect(results.find((l) => l.operation === "depublication")?.detail).toMatch(/rien n'est supprimé/);
  });

  it("s'écrit dans le même geste que l'opération, pas après coup", async () => {
    // Si l'écriture du journal était un second appel qu'on peut oublier, une publication sans
    // trace serait possible. Ici elle ne l'est pas : le compte suit.
    await inscrire(registre, neuve, QUAND);
    await publier(registre, "alpha", RESERVE, "moi", PLUS_TARD);
    const compte = await registre.prepare("SELECT COUNT(*) AS n FROM journal_audit").bind().first<{ n: number }>();
    expect(compte?.n).toBe(1);
  });

  it("accepte un détail absent", async () => {
    await journaliser(registre, { objet: "alpha", operation: "revocation", auteur: "moi" });
    const ligne = await registre.prepare("SELECT detail FROM journal_audit").bind().first<{ detail: string | null }>();
    expect(ligne?.detail).toBeNull();
  });
});
