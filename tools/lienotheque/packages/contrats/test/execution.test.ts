import { describe, expect, it } from "vitest";
import {
  Arret,
  DELAI_ARRET_PROPRE_S,
  Demande,
  Echec,
  MEMOIRE_MAX_MO,
  MessageVersHote,
  MessageVersProcessus,
  Progression,
  Salutation,
  TRAVAUX_LOURDS_SIMULTANES,
  VERSION_PROTOCOLE,
  desaccordDeProtocole,
} from "../src/index.js";

/** L'échange entre l'hôte et le processus de traitement (JOB-01 à JOB-09, PLT-02). */

const ID = "01890a5d-ac96-774b-bcce-b302099a8057";
const AUTRE = "01890a5d-ac96-774b-bcce-b302099a8058";

describe("enveloppe des messages (PLT-02)", () => {
  it("une demande porte sa version, son travail et son outil", () => {
    const demande = {
      type: "demande",
      protocole: VERSION_PROTOCOLE,
      travailId: ID,
      outil: { nom: "lecture", version: "1.0.0" },
      versionCible: AUTRE,
      charge: { quelconque: true },
    };
    expect(Demande.safeParse(demande).success).toBe(true);
    expect(MessageVersProcessus.safeParse(demande).success).toBe(true);
  });

  it("refuse un message sans version d'échange", () => {
    const sansVersion = { type: "arret", travailId: ID, raison: "pause" };
    expect(Arret.safeParse(sansVersion).success).toBe(false);
  });

  it("refuse un champ qu'on n'attendait pas, plutôt que de l'ignorer", () => {
    const enTrop = { type: "arret", protocole: VERSION_PROTOCOLE, travailId: ID, raison: "pause", urgent: true };
    expect(Arret.safeParse(enTrop).success).toBe(false);
  });

  it("refuse un identifiant de travail qui n'en est pas un", () => {
    expect(Arret.safeParse({ type: "arret", protocole: VERSION_PROTOCOLE, travailId: "travail-3", raison: "pause" }).success).toBe(false);
  });
});

describe("un désaccord de version est refusé explicitement (PLT-02)", () => {
  it("ne dit rien quand les deux versions s'accordent", () => {
    expect(desaccordDeProtocole(VERSION_PROTOCOLE)).toBeUndefined();
  });

  it("nomme les deux versions, pour qu'on sache lequel des deux côtés est en retard", () => {
    const ecart = desaccordDeProtocole(VERSION_PROTOCOLE + 1);
    expect(ecart?.recu).toBe(VERSION_PROTOCOLE + 1);
    expect(ecart?.attendu).toBe(VERSION_PROTOCOLE);
    expect(ecart?.message).toContain(String(VERSION_PROTOCOLE + 1));
    expect(ecart?.message).toContain(String(VERSION_PROTOCOLE));
  });

  it("refuse aussi une version plus ancienne : on ne devine pas une forme passée", () => {
    expect(desaccordDeProtocole(VERSION_PROTOCOLE - 1)).toBeDefined();
  });

  it("parle français, sans jargon : c'est une panne que l'utilisateur peut lire", () => {
    const ecart = desaccordDeProtocole(99);
    expect(ecart?.message).toMatch(/version/i);
    expect(ecart?.message, "aucun terme technique nu").not.toMatch(/protocol|handshake|mismatch|version mismatch/i);
  });
});

describe("ce que le processus renvoie (JOB-03, JOB-05)", () => {
  it("se présente avec son moteur et sa version — l'écart doit se constater, pas se deviner", () => {
    const salut = { type: "salutation", protocole: VERSION_PROTOCOLE, moteur: { nom: "node", version: "24.11.1" } };
    expect(Salutation.safeParse(salut).success).toBe(true);
    expect(MessageVersHote.safeParse(salut).success).toBe(true);
  });

  it("une progression porte son point de reprise, sans quoi une reprise repart de zéro", () => {
    const pas = {
      type: "progression",
      protocole: VERSION_PROTOCOLE,
      travailId: ID,
      progression: 0.42,
      pointReprise: { unite: "page", valeur: 120 },
    };
    expect(Progression.safeParse(pas).success).toBe(true);
  });

  it("refuse une progression hors de zéro à un", () => {
    const hors = { type: "progression", protocole: VERSION_PROTOCOLE, travailId: ID, progression: 1.5 };
    expect(Progression.safeParse(hors).success).toBe(false);
  });

  it("un échec dit sa cause et s'il est reprenable (JOB-05)", () => {
    const echec = { type: "echec", protocole: VERSION_PROTOCOLE, travailId: ID, cause: "Moteur introuvable", reprisePossible: true };
    const lu = Echec.safeParse(echec);
    expect(lu.success).toBe(true);
    expect(lu.success && lu.data.elements, "la liste des éléments est vide, jamais absente").toEqual([]);
  });

  it("refuse un échec sans cause : aucune erreur n'est avalée (JOB-05)", () => {
    expect(Echec.safeParse({ type: "echec", protocole: VERSION_PROTOCOLE, travailId: ID, cause: "", reprisePossible: false }).success).toBe(false);
  });

  it("un message d'un type inconnu n'entre pas", () => {
    expect(MessageVersHote.safeParse({ type: "coucou", protocole: VERSION_PROTOCOLE, travailId: ID }).success).toBe(false);
  });
});

describe("limites d'exécution, déclarées à un seul endroit", () => {
  it("deux travaux lourds au plus à la fois", () => {
    expect(TRAVAUX_LOURDS_SIMULTANES).toBe(2);
  });

  it("le plafond mémoire laisse de l'air au-dessus de la marque haute observée", () => {
    // 1,1 Go relevé sur F3, jeu de travail réel d'une page. Le plafond est un garde-fou contre
    // une boucle qui s'emballe, pas un budget : il doit rester nettement au-dessus du constaté.
    expect(MEMOIRE_MAX_MO).toBeGreaterThan(1100);
  });

  it("l'arrêt propre laisse un délai, et ce délai n'est pas nul", () => {
    expect(DELAI_ARRET_PROPRE_S).toBeGreaterThan(0);
  });
});
