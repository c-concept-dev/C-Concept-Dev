import { MIGRATIONS_REGISTRE_EN_LIGNE, baseEnMemoire } from "@lienotheque/depot-sqlite";
import { DUREE_SESSION, empreinteDuJeton, jetonNeuf } from "@lienotheque/noyau";
import { beforeEach, describe, expect, it } from "vitest";
import {
  avancerLeCompteur,
  enrolerUneCle,
  inscrireUnePersonne,
  laCleParIdentifiant,
  laPersonne,
  laSessionParEmpreinte,
  lesClesVivesDe,
  lesPersonnes,
  ouvrirUneSession,
  repousserLaSession,
  revoquerLaCle,
  revoquerLaSession,
} from "../src/qui-entre.js";

/** Les quatre tables d'identité, enfin lues et écrites (SEC-02, SEC-03).
 *
 *  Elles existent depuis la migration 2 du registre et, jusqu'ici, aucun code ne les touchait :
 *  un jeton de service unique ouvrait la façade pour tout le monde. Cette étape donne au
 *  registre de quoi connaître une personne, une clé et une session — et rien de plus : la
 *  cérémonie qui s'en sert vient ensuite.
 *
 *  Ce qui est éprouvé ici, au-delà du va-et-vient : que le compteur anti-rejeu refuse de
 *  reculer, qu'une session se reconnaisse par son empreinte et jamais par son jeton, et qu'une
 *  ligne trafiquée en base soit refusée bruyamment plutôt que relue au mieux. */

const QUAND = "2026-10-18T09:00:00.000Z";
const MOI = "christophe";

let registre: ReturnType<typeof baseEnMemoire>;

beforeEach(() => {
  registre = baseEnMemoire(MIGRATIONS_REGISTRE_EN_LIGNE);
});

const unePersonne = async (nom = "Christophe") => {
  const fait = await inscrireUnePersonne(registre, nom, QUAND, MOI);
  if (!fait.fait) throw new Error(`l'inscription a échoué : ${fait.raison}`);
  return fait.valeur;
};

/** Une clé publique en SPKI, vraie : celle de la cérémonie mesurée le 18 octobre. */
const CLE_PUBLIQUE =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsx0eZFLu1NJ8Fm0QdbYzZ2S+1kGarRn4K/PqBrkz6YwLMHW9Rnniv+UxNpPLwP/tkzxZiriWCWVIpVlnu73iOA==";

const uneCle = async (personneId: string, identifiant = "zBh4Vnw", compteur = 0) => {
  const fait = await enrolerUneCle(
    registre,
    { personneId, identifiant, clePublique: CLE_PUBLIQUE, compteur, appareil: "Portable" },
    QUAND,
    MOI,
  );
  if (!fait.fait) throw new Error(`l'enrôlement a échoué : ${fait.raison}`);
  return fait.valeur;
};

const auJournal = async (): Promise<readonly { objet: string; operation: string; detail: string | null }[]> => {
  const { results } = await registre
    .prepare("SELECT objet, operation, detail FROM journal_audit ORDER BY fait_le, operation")
    .bind()
    .all<{ objet: string; operation: string; detail: string | null }>();
  return results;
};

describe("une personne s'inscrit et se relit", () => {
  it("lui donne un identifiant, et garde la date", async () => {
    const personne = await unePersonne();
    expect(personne.nom).toBe("Christophe");
    expect(personne.creeLe).toBe(QUAND);

    const relue = await laPersonne(registre, personne.id);
    expect(relue).toEqual(personne);
  });

  it("ne connaît personne d'autre", async () => {
    await unePersonne();
    expect(await laPersonne(registre, "00000000-0000-7000-8000-000000000000")).toBeUndefined();
  });

  it("les rend dans l'ordre des noms, pour qu'une liste soit stable", async () => {
    await unePersonne("Zoé");
    await unePersonne("Alice");
    expect((await lesPersonnes(registre)).map((une) => une.nom)).toEqual(["Alice", "Zoé"]);
  });
});

describe("une clé s'enrôle pour une personne", () => {
  it("se relit par l'identifiant que l'authentificateur présente", async () => {
    const personne = await unePersonne();
    const cle = await uneCle(personne.id);

    // C'est le seul chemin de lecture qui compte à l'entrée : le navigateur présente cet
    // identifiant, et rien d'autre ne permet de retrouver la clé publique.
    const relue = await laCleParIdentifiant(registre, "zBh4Vnw");
    expect(relue?.id).toBe(cle.id);
    expect(relue?.clePublique).toBe(CLE_PUBLIQUE);
    expect(relue?.personneId).toBe(personne.id);
    expect(relue?.appareil).toBe("Portable");
  });

  it("refuse d'enrôler pour une personne inconnue", async () => {
    const fait = await enrolerUneCle(
      registre,
      {
        personneId: "00000000-0000-7000-8000-000000000000",
        identifiant: "zBh4Vnw",
        clePublique: CLE_PUBLIQUE,
        compteur: 0,
      },
      QUAND,
      MOI,
    );
    expect(fait.fait).toBe(false);
  });

  it("refuse deux clés sous le même identifiant", async () => {
    const une = await unePersonne("Christophe");
    const autre = await unePersonne("Quelqu'un");
    await uneCle(une.id, "memeIdentifiant");

    const fait = await enrolerUneCle(
      registre,
      { personneId: autre.id, identifiant: "memeIdentifiant", clePublique: CLE_PUBLIQUE, compteur: 0 },
      QUAND,
      MOI,
    );
    expect(fait.fait).toBe(false);
    if (!fait.fait) expect(fait.raison).toContain("déjà");
  });

  it("refuse une clé publique qui n'est pas de la base64", async () => {
    const personne = await unePersonne();
    const fait = await enrolerUneCle(
      registre,
      { personneId: personne.id, identifiant: "zBh4Vnw", clePublique: "pas une clé !", compteur: 0 },
      QUAND,
      MOI,
    );
    expect(fait.fait).toBe(false);
  });

  it("inscrit l'enrôlement au journal, dans le même geste", async () => {
    const personne = await unePersonne();
    const cle = await uneCle(personne.id);
    const lignes = await auJournal();
    const ligne = lignes.find((une) => une.operation === "enrolement");
    expect(ligne?.objet).toBe(cle.id);
    expect(ligne?.detail).toContain("Portable");
  });
});

describe("une clé révoquée n'ouvre plus", () => {
  it("disparaît des clés vives, sans disparaître de la table", async () => {
    const personne = await unePersonne();
    const cle = await uneCle(personne.id);
    expect((await lesClesVivesDe(registre, personne.id)).map((une) => une.id)).toEqual([cle.id]);

    const fait = await revoquerLaCle(registre, cle.id, MOI, "2026-10-19T09:00:00.000Z");
    expect(fait.fait).toBe(true);
    expect(await lesClesVivesDe(registre, personne.id)).toEqual([]);

    // Rien n'est détruit : la ligne reste, datée, pour qu'un journal reste lisible.
    const relue = await laCleParIdentifiant(registre, "zBh4Vnw");
    expect(relue?.revoqueeLe).toBe("2026-10-19T09:00:00.000Z");
  });

  it("inscrit la révocation au journal", async () => {
    const personne = await unePersonne();
    const cle = await uneCle(personne.id);
    await revoquerLaCle(registre, cle.id, MOI, "2026-10-19T09:00:00.000Z");
    expect((await auJournal()).some((ligne) => ligne.operation === "revocation")).toBe(true);
  });

  it("refuse de révoquer une clé inconnue", async () => {
    const fait = await revoquerLaCle(registre, "00000000-0000-7000-8000-000000000000", MOI, QUAND);
    expect(fait.fait).toBe(false);
  });
});

describe("le compteur anti-rejeu refuse de reculer", () => {
  it("avance quand l'authentificateur a compté", async () => {
    const personne = await unePersonne();
    const cle = await uneCle(personne.id, "zBh4Vnw", 4);

    const fait = await avancerLeCompteur(registre, cle.id, 5);
    expect(fait.fait).toBe(true);
    expect((await laCleParIdentifiant(registre, "zBh4Vnw"))?.compteur).toBe(5);
  });

  it("refuse un compteur qui n'a pas avancé — c'est une signature rejouée", async () => {
    const personne = await unePersonne();
    const cle = await uneCle(personne.id, "zBh4Vnw", 7);

    expect((await avancerLeCompteur(registre, cle.id, 7)).fait).toBe(false);
    expect((await avancerLeCompteur(registre, cle.id, 3)).fait).toBe(false);
    // Et la valeur rangée n'a pas bougé : un refus n'écrit rien.
    expect((await laCleParIdentifiant(registre, "zBh4Vnw"))?.compteur).toBe(7);
  });

  it("tolère un authentificateur qui ne compte pas du tout", async () => {
    // Certains laissent le compteur à zéro. Refuser zéro après zéro leur interdirait d'entrer
    // une seconde fois ; l'exiger croissant pour les autres reste en vigueur.
    const personne = await unePersonne();
    const cle = await uneCle(personne.id, "zBh4Vnw", 0);
    expect((await avancerLeCompteur(registre, cle.id, 0)).fait).toBe(true);
    expect((await laCleParIdentifiant(registre, "zBh4Vnw"))?.compteur).toBe(0);
  });

  it("refuse d'avancer le compteur d'une clé révoquée", async () => {
    const personne = await unePersonne();
    const cle = await uneCle(personne.id, "zBh4Vnw", 1);
    await revoquerLaCle(registre, cle.id, MOI, QUAND);
    expect((await avancerLeCompteur(registre, cle.id, 2)).fait).toBe(false);
  });
});

describe("une session se reconnaît par son empreinte, jamais par son jeton", () => {
  it("s'ouvre pour quatre-vingt-dix jours et se relit", async () => {
    const personne = await unePersonne();
    const jeton = jetonNeuf();
    const fait = await ouvrirUneSession(registre, { personneId: personne.id, jeton, appareil: "Portable" }, QUAND);
    expect(fait.fait).toBe(true);
    if (!fait.fait) return;

    const attendue = new Date(Date.parse(QUAND) + DUREE_SESSION * 1000).toISOString();
    expect(fait.valeur.expireLe).toBe(attendue);
    expect(fait.valeur.ouverteLe).toBe(QUAND);

    const relue = await laSessionParEmpreinte(registre, await empreinteDuJeton(jeton));
    expect(relue?.id).toBe(fait.valeur.id);
    expect(relue?.personneId).toBe(personne.id);
  });

  it("ne garde pas le jeton, et ne se laisse pas trouver par lui", async () => {
    const personne = await unePersonne();
    const jeton = jetonNeuf();
    await ouvrirUneSession(registre, { personneId: personne.id, jeton }, QUAND);

    // Le jeton lui-même ne doit rien ouvrir, et ne doit pas se trouver dans la base.
    expect(await laSessionParEmpreinte(registre, jeton)).toBeUndefined();
    const { results } = await registre.prepare("SELECT empreinte FROM session").bind().all<{ empreinte: string }>();
    expect(results).toHaveLength(1);
    expect(results[0]!.empreinte).not.toBe(jeton);
    expect(results[0]!.empreinte).toBe(await empreinteDuJeton(jeton));
  });

  it("refuse d'ouvrir pour une personne inconnue", async () => {
    const fait = await ouvrirUneSession(
      registre,
      { personneId: "00000000-0000-7000-8000-000000000000", jeton: jetonNeuf() },
      QUAND,
    );
    expect(fait.fait).toBe(false);
  });

  it("se repousse à l'usage : les deux dates avancent", async () => {
    const personne = await unePersonne();
    const jeton = jetonNeuf();
    const ouverte = await ouvrirUneSession(registre, { personneId: personne.id, jeton }, QUAND);
    if (!ouverte.fait) throw new Error("l'ouverture a échoué");

    const plusTard = "2026-11-18T09:00:00.000Z";
    const fait = await repousserLaSession(registre, ouverte.valeur.id, plusTard);
    expect(fait.fait).toBe(true);

    const relue = await laSessionParEmpreinte(registre, await empreinteDuJeton(jeton));
    expect(relue?.vueLe).toBe(plusTard);
    expect(relue?.expireLe).toBe(new Date(Date.parse(plusTard) + DUREE_SESSION * 1000).toISOString());
    // La date d'ouverture, elle, ne bouge jamais : c'est elle qui dit depuis quand on entre.
    expect(relue?.ouverteLe).toBe(QUAND);
  });

  it("se révoque, et la relecture le dit", async () => {
    const personne = await unePersonne();
    const jeton = jetonNeuf();
    const ouverte = await ouvrirUneSession(registre, { personneId: personne.id, jeton }, QUAND);
    if (!ouverte.fait) throw new Error("l'ouverture a échoué");

    const quand = "2026-10-19T09:00:00.000Z";
    expect((await revoquerLaSession(registre, ouverte.valeur.id, MOI, quand)).fait).toBe(true);

    // La session se relit encore — c'est voulu : c'est la lecture qui doit voir la révocation,
    // pas la base qui doit l'effacer.
    const relue = await laSessionParEmpreinte(registre, await empreinteDuJeton(jeton));
    expect(relue?.revoqueeLe).toBe(quand);
    expect((await auJournal()).some((ligne) => ligne.operation === "revocation")).toBe(true);
  });

  it("refuse de repousser une session révoquée", async () => {
    const personne = await unePersonne();
    const ouverte = await ouvrirUneSession(registre, { personneId: personne.id, jeton: jetonNeuf() }, QUAND);
    if (!ouverte.fait) throw new Error("l'ouverture a échoué");
    await revoquerLaSession(registre, ouverte.valeur.id, MOI, QUAND);
    expect((await repousserLaSession(registre, ouverte.valeur.id, "2026-11-18T09:00:00.000Z")).fait).toBe(false);
  });
});

describe("une ligne de base n'est pas une donnée de confiance", () => {
  it("refuse bruyamment une clé dont la base dit n'importe quoi", async () => {
    const personne = await unePersonne();
    await uneCle(personne.id);
    // Une main sur la console, un import, une migration mal pensée : le compteur devient négatif.
    registre.executer("UPDATE cle_acces SET compteur = -1");

    // Mieux vaut une erreur que de laisser un anti-rejeu absurde ouvrir la porte.
    await expect(laCleParIdentifiant(registre, "zBh4Vnw")).rejects.toThrow();
  });

  it("refuse bruyamment une session dont la date est illisible", async () => {
    const personne = await unePersonne();
    const jeton = jetonNeuf();
    await ouvrirUneSession(registre, { personneId: personne.id, jeton }, QUAND);
    registre.executer("UPDATE session SET expire_le = 'jamais'");

    await expect(laSessionParEmpreinte(registre, await empreinteDuJeton(jeton))).rejects.toThrow();
  });
});
