import { readFileSync } from "node:fs";
import { MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { defiNeuf } from "@lienotheque/noyau";
import { beforeEach, describe, expect, it } from "vitest";
import { DUREE_DEFI, consommerLeDefi, enroler, ouvrirUnDefi } from "../src/enrolement.js";
import { inscrireUnePersonne, laCleParIdentifiant, lesClesVivesDe } from "../src/qui-entre.js";

/** L'enrôlement : un défi, une création, une clé publique rangée (SEC-02, étape 4.3).
 *
 *  Ce qui est éprouvé ici n'est pas seulement le chemin qui marche. C'est surtout que **chaque
 *  refus se nomme** : un défi inconnu, un défi déjà servi, un défi périmé, un défi émis pour
 *  autre chose, une origine étrangère, une clé nulle, une clé illisible. « Enrôlement refusé »
 *  tout court ne se répare pas.
 *
 *  Et le cas qui commande l'étape : **`getPublicKey()` nul refuse, et le dit.** Jamais de repli
 *  silencieux sur l'objet d'attestation — ce serait ramener le CBOR par la petite porte. */

const CEREMONIE = JSON.parse(
  readFileSync(new URL("../../../fixtures/ceremonie-webauthn.json", import.meta.url), "utf8"),
) as { spki: string };

const ORIGINE = "https://lienotheque.exemple";
const QUAND = "2026-10-18T09:00:00.000Z";
const MOI = "christophe";

let registre: ReturnType<typeof baseEnMemoire>;

beforeEach(() => {
  registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
});

const unePersonne = async () => {
  const fait = await inscrireUnePersonne(registre, "Christophe", QUAND, MOI);
  if (!fait.fait) throw new Error(fait.raison);
  return fait.valeur;
};

const unDefi = async (personneId: string, quand = QUAND) => {
  const fait = await ouvrirUnDefi(registre, { usage: "enrolement", personneId }, quand);
  if (!fait.fait) throw new Error(fait.raison);
  return fait.valeur;
};

/** Les données du client telles qu'un navigateur les encode : du JSON, en base64url. */
const donneesClient = (dedans: Record<string, unknown>): string =>
  Buffer.from(JSON.stringify(dedans), "utf8").toString("base64url");

const creation = (defi: string, origine = ORIGINE) =>
  donneesClient({ type: "webauthn.create", challenge: defi, origin: origine, crossOrigin: false });

const preuve = (defi: string, retouches: Record<string, unknown> = {}) => ({
  identifiant: "zBh4Vnw",
  clePublique: CEREMONIE.spki,
  algorithme: -7,
  donneesClient: creation(defi),
  appareil: "Portable",
  ...retouches,
});

describe("un défi s'ouvre, et ne sert qu'une fois", () => {
  it("s'ouvre pour cinq minutes, et se consomme", async () => {
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);

    expect(defi.usage).toBe("enrolement");
    expect(defi.personneId).toBe(personne.id);
    expect(defi.expireLe).toBe(new Date(Date.parse(QUAND) + DUREE_DEFI * 1000).toISOString());
    expect(defi.consommeLe).toBeUndefined();

    const vu = await consommerLeDefi(registre, defi.valeur, "enrolement", QUAND);
    expect(vu.fait).toBe(true);
    if (vu.fait) expect(vu.valeur.personneId).toBe(personne.id);
  });

  it("refuse la seconde fois, et le dit autrement qu'un défi inconnu", async () => {
    // Les deux refusent. Mais « déjà servi » et « inconnu » ne décrivent pas la même situation,
    // et c'est à ça qu'un journal sert.
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    expect((await consommerLeDefi(registre, defi.valeur, "enrolement", QUAND)).fait).toBe(true);

    const deuxieme = await consommerLeDefi(registre, defi.valeur, "enrolement", QUAND);
    expect(deuxieme.fait).toBe(false);
    if (!deuxieme.fait) expect(deuxieme.raison).toContain("déjà");

    const jamaisVu = await consommerLeDefi(registre, defiNeuf(), "enrolement", QUAND);
    expect(jamaisVu.fait).toBe(false);
    if (!jamaisVu.fait) expect(jamaisVu.raison).toContain("inconnu");
  });

  it("refuse un défi périmé", async () => {
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    const tropTard = new Date(Date.parse(QUAND) + (DUREE_DEFI + 1) * 1000).toISOString();

    const vu = await consommerLeDefi(registre, defi.valeur, "enrolement", tropTard);
    expect(vu.fait).toBe(false);
    if (!vu.fait) expect(vu.raison).toContain("périmé");
  });

  it("refuse un défi émis pour autre chose", async () => {
    // Un défi d'entrée ne doit pas pouvoir enrôler : ce serait ouvrir une porte avec la clé
    // qu'on venait de faire tailler.
    const fait = await ouvrirUnDefi(registre, { usage: "entree" }, QUAND);
    if (!fait.fait) throw new Error(fait.raison);

    const vu = await consommerLeDefi(registre, fait.valeur.valeur, "enrolement", QUAND);
    expect(vu.fait).toBe(false);
    if (!vu.fait) expect(vu.raison).toContain("usage");
  });

  it("ne consomme pas un défi quand il le refuse", async () => {
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    await consommerLeDefi(registre, defi.valeur, "entree", QUAND); // mauvais usage

    // Le défi doit rester utilisable pour ce à quoi il servait vraiment.
    expect((await consommerLeDefi(registre, defi.valeur, "enrolement", QUAND)).fait).toBe(true);
  });

  it("ne se laisse pas consommer deux fois par deux requêtes simultanées", async () => {
    // Le contrôle « a déjà servi » qui précède la mise à jour ne suffit pas, et un essai de
    // mutation l'a montré : en le retirant, tous les tests restaient verts, parce que la mise à
    // jour sous condition rattrapait. Restait à prouver l'inverse — que la condition est bien
    // ce qui tient, et pas seulement une ceinture de plus.
    //
    // Deux appels lancés sans attendre le premier : chacun lit la ligne vierge avant que l'autre
    // n'écrive. C'est exactement la course qu'un double clic produit, et elle est ici
    // reproductible.
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);

    const [un, autre] = await Promise.all([
      consommerLeDefi(registre, defi.valeur, "enrolement", QUAND),
      consommerLeDefi(registre, defi.valeur, "enrolement", QUAND),
    ]);

    // Un seul l'emporte. Lequel importe peu ; qu'il n'y en ait qu'un est tout l'objet.
    expect([un.fait, autre.fait].filter(Boolean)).toHaveLength(1);
    const perdant = un.fait ? autre : un;
    if (!perdant.fait) expect(perdant.raison).toContain("déjà");
  });

  it("ouvre des défis tous différents", async () => {
    const personne = await unePersonne();
    const valeurs = new Set<string>();
    for (let tour = 0; tour < 50; tour += 1) valeurs.add((await unDefi(personne.id)).valeur);
    expect(valeurs.size).toBe(50);
  });
});

describe("l'enrôlement rangé la clé publique", () => {
  it("enrôle, et la clé se relit", async () => {
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);

    const fait = await enroler(registre, preuve(defi.valeur), { origine: ORIGINE, maintenant: QUAND, auteur: MOI });
    expect(fait.fait).toBe(true);
    if (!fait.fait) return;

    expect(fait.valeur.personneId).toBe(personne.id);
    expect(fait.valeur.clePublique).toBe(CEREMONIE.spki);
    expect(fait.valeur.compteur).toBe(0);
    expect(fait.valeur.appareil).toBe("Portable");

    const relue = await laCleParIdentifiant(registre, "zBh4Vnw");
    expect(relue?.id).toBe(fait.valeur.id);
    expect((await lesClesVivesDe(registre, personne.id)).map((une) => une.id)).toEqual([fait.valeur.id]);
  });

  it("consomme le défi en enrôlant : le même ne peut pas enrôler deux fois", async () => {
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    expect((await enroler(registre, preuve(defi.valeur), { origine: ORIGINE, maintenant: QUAND, auteur: MOI })).fait).toBe(true);

    const encore = await enroler(registre, preuve(defi.valeur, { identifiant: "autreAppareil" }), {
      origine: ORIGINE,
      maintenant: QUAND,
      auteur: MOI,
    });
    expect(encore.fait).toBe(false);
    if (!encore.fait) expect(encore.raison).toContain("déjà");
  });

  it("inscrit l'enrôlement au journal", async () => {
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    await enroler(registre, preuve(defi.valeur), { origine: ORIGINE, maintenant: QUAND, auteur: MOI });

    const { results } = await registre
      .prepare("SELECT operation FROM journal_audit")
      .bind()
      .all<{ operation: string }>();
    expect(results.map((ligne) => ligne.operation)).toContain("enrolement");
  });
});

describe("l'enrôlement refuse, et dit lequel de ses refus", () => {
  const refuse = async (retouches: Record<string, unknown>, attendu: string, origine = ORIGINE) => {
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    const fait = await enroler(registre, preuve(defi.valeur, retouches), {
      origine,
      maintenant: QUAND,
      auteur: MOI,
    });
    expect(fait.fait).toBe(false);
    if (!fait.fait) expect(fait.raison.toLowerCase()).toContain(attendu.toLowerCase());
    return fait;
  };

  it("refuse une clé nulle **en le disant**", async () => {
    // Le cas que la mesure du 18 octobre n'a pas pu trancher sur Safari : la méthode existe, on
    // ne sait pas si elle rend une clé. Si elle rend nul, cela doit s'entendre.
    await refuse({ clePublique: null }, "getPublicKey");
  });

  it("refuse un algorithme nul, et ne le confond pas avec la clé nulle", async () => {
    await refuse({ algorithme: null }, "getPublicKeyAlgorithm");
  });

  it("refuse un algorithme qu'on ne vérifie pas", async () => {
    await refuse({ algorithme: -257 }, "-257");
  });

  it("refuse une clé illisible, autrement qu'une clé nulle", async () => {
    await refuse({ clePublique: "bWF1dmFpc2Uga2xl" }, "importe");
  });

  it("refuse une origine qui n'est pas la nôtre", async () => {
    await refuse({}, "origine", "https://ailleurs.exemple");
  });

  it("refuse une entrée déguisée en création", async () => {
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    const fait = await enroler(
      registre,
      preuve(defi.valeur, {
        donneesClient: Buffer.from(
          JSON.stringify({ type: "webauthn.get", challenge: defi.valeur, origin: ORIGINE, crossOrigin: false }),
          "utf8",
        ).toString("base64url"),
      }),
      { origine: ORIGINE, maintenant: QUAND, auteur: MOI },
    );
    expect(fait.fait).toBe(false);
    if (!fait.fait) expect(fait.raison).toContain("webauthn.get");
  });

  it("refuse un défi que le navigateur n'a pas rendu tel quel", async () => {
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    const fait = await enroler(registre, preuve(defi.valeur, { donneesClient: creation(defiNeuf()) }), {
      origine: ORIGINE,
      maintenant: QUAND,
      auteur: MOI,
    });
    expect(fait.fait).toBe(false);
  });

  it("n'écrit aucune clé quand il refuse", async () => {
    // Un refus qui laisse une trace dans la table des clés serait pire qu'un refus : on
    // chercherait longtemps pourquoi une clé qu'on n'a pas enrôlée existe.
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    await enroler(registre, preuve(defi.valeur, { clePublique: null }), {
      origine: ORIGINE,
      maintenant: QUAND,
      auteur: MOI,
    });

    expect(await lesClesVivesDe(registre, personne.id)).toEqual([]);
    expect(await laCleParIdentifiant(registre, "zBh4Vnw")).toBeUndefined();
  });

  it("ne consomme pas le défi quand la clé est refusée", async () => {
    // Un refus qui vient de la clé n'est pas la faute du défi : la personne doit pouvoir
    // réessayer depuis un autre appareil sans en redemander un.
    const personne = await unePersonne();
    const defi = await unDefi(personne.id);
    await enroler(registre, preuve(defi.valeur, { clePublique: null }), {
      origine: ORIGINE,
      maintenant: QUAND,
      auteur: MOI,
    });

    const fait = await enroler(registre, preuve(defi.valeur), { origine: ORIGINE, maintenant: QUAND, auteur: MOI });
    expect(fait.fait).toBe(true);
  });

  it("refuse d'enrôler sur un défi qui ne désigne personne", async () => {
    const fait = await ouvrirUnDefi(registre, { usage: "enrolement" }, QUAND);
    if (!fait.fait) throw new Error(fait.raison);

    const enrole = await enroler(registre, preuve(fait.valeur.valeur), {
      origine: ORIGINE,
      maintenant: QUAND,
      auteur: MOI,
    });
    expect(enrole.fait).toBe(false);
    if (!enrole.fait) expect(enrole.raison).toContain("personne");
  });
});
