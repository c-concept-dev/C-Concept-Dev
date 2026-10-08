import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MessageVersHote, VERSION_PROTOCOLE } from "@lienotheque/contrats";
import { boucleDeMessages, salutation } from "../src/processus.js";

/** La boucle de messages du processus annexe (PLT-02, JOB-05, JOB-09). */

const ID = () => randomUUID();

/** Rend les messages écrits sur la sortie, relus par le contrat : ce qui sort doit entrer
 *  ailleurs, et ce contrôle le vérifie à chaque ligne. */
async function echanger(entrees: readonly unknown[], signaux: string[] = []): Promise<MessageVersHote[]> {
  const sortie: string[] = [];
  const lignes = async function* (): AsyncGenerator<string> {
    for (const entree of entrees) yield typeof entree === "string" ? entree : JSON.stringify(entree);
  };
  await boucleDeMessages(lignes(), (ligne) => sortie.push(ligne), { signaler: (texte) => signaux.push(texte) });
  return sortie.map((ligne) => {
    expect(ligne.endsWith("\n"), "une ligne par message, terminée par un saut").toBe(true);
    return MessageVersHote.parse(JSON.parse(ligne));
  });
}

const demande = (charge: unknown, protocole = VERSION_PROTOCOLE) => ({
  type: "demande",
  protocole,
  travailId: ID(),
  outil: { nom: "traitement-de-lot", version: "1.0.0" },
  versionCible: ID(),
  charge,
});

describe("le processus se présente avant tout", () => {
  it("dit son protocole et son moteur, pour qu'un écart se constate", async () => {
    const salut = salutation();
    expect(salut.protocole).toBe(VERSION_PROTOCOLE);
    expect(salut.moteur.nom).toBe("node");
    expect(salut.moteur.version).toBe(process.versions.node);
  });

  it("salue même quand on ne lui demande rien", async () => {
    const messages = await echanger([]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.type).toBe("salutation");
  });
});

describe("ce que la boucle refuse", () => {
  it("ne meurt pas sur une ligne qui n'est pas du JSON, et le signale", async () => {
    const signaux: string[] = [];
    const messages = await echanger(["{ceci n'est pas du JSON"], signaux);
    expect(messages.map((m) => m.type)).toEqual(["salutation"]);
    expect(signaux[0]).toMatch(/illisible/i);
  });

  it("refuse un message d'une autre version, sans rien lancer (PLT-02)", async () => {
    const messages = await echanger([demande({}, VERSION_PROTOCOLE + 1)]);
    const dernier = messages.at(-1);
    expect(dernier?.type).toBe("echec");
    expect(dernier?.type === "echec" && dernier.cause).toMatch(/version/i);
  });

  it("rattache l'échec au travail quand la ligne en nomme un, même mal formée", async () => {
    const travailId = ID();
    const messages = await echanger([{ type: "coucou", travailId }]);
    const dernier = messages.at(-1);
    expect(dernier?.type).toBe("echec");
    expect(dernier?.type === "echec" && dernier.travailId).toBe(travailId);
  });

  it("ne meurt pas quand le travail nommé n'est pas un identifiant valide", async () => {
    // Le piège : vouloir rattacher l'échec à « travail-73991 » fait refuser l'échec lui-même, et
    // le processus meurt dans le code écrit pour ne pas mourir. Rencontré en vrai, sur le paquet.
    const signaux: string[] = [];
    const messages = await echanger([{ type: "demande", protocole: VERSION_PROTOCOLE, travailId: "travail-73991" }], signaux);
    expect(messages.map((m) => m.type), "le processus a survécu").toEqual(["salutation"]);
    expect(signaux).toHaveLength(1);
  });

  it("se rabat sur la sortie d'erreur quand il n'y a personne à qui dire l'échec", async () => {
    const signaux: string[] = [];
    const messages = await echanger([{ type: "coucou" }], signaux);
    expect(messages.map((m) => m.type)).toEqual(["salutation"]);
    expect(signaux).toHaveLength(1);
  });

  it("ignore les lignes vides, qu'un tuyau produit tout seul", async () => {
    const messages = await echanger(["", "   ", ""]);
    expect(messages).toHaveLength(1);
  });
});

describe("l'arrêt demandé ferme la boucle (JOB-08)", () => {
  it("rend la main, et ne traite rien de ce qui suivait", async () => {
    const apres = demande({});
    const messages = await echanger([
      { type: "arret", protocole: VERSION_PROTOCOLE, travailId: ID(), raison: "fermeture" },
      apres,
    ]);
    expect(messages.map((m) => m.type), "rien après l'arrêt").toEqual(["salutation"]);
  });
});

describe("une demande qu'on sait lire mais pas satisfaire", () => {
  it("rend un échec qui dit sa cause, jamais une exception (JOB-05)", async () => {
    const messages = await echanger([demande({ document: "/absent" })]);
    const dernier = messages.at(-1);
    expect(dernier?.type).toBe("echec");
    expect(dernier?.type === "echec" && dernier.cause.length).toBeGreaterThan(0);
  });

  it("continue après un échec : un travail raté n'arrête pas le processus", async () => {
    const messages = await echanger([demande({ document: "/absent" }), demande({ document: "/absent-aussi" })]);
    expect(messages.filter((m) => m.type === "echec")).toHaveLength(2);
  });
});
