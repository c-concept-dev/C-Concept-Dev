import { describe, expect, it } from "vitest";
import { FileDeTravaux } from "../src/execution.js";

/** Lot 0t — **la file que l'écran reçoit porte ses refus à côté de ses travaux** (JOB-05 : « aucune
 *  erreur avalée silencieusement ; toute erreur visible dans Traitement »).
 *
 *  Avant ce lot, la commande de l'hôte rendait une **liste de travaux**, et elle seule. Les
 *  fichiers qu'elle n'avait pas su relire étaient récoltés dans un vecteur qu'elle jetait ensuite :
 *  rien ne manquait au compilateur, rien n'arrivait à l'écran. Le contrat portait ce silence —
 *  une liste n'a pas de place pour dire ce qui n'y est pas.
 *
 *  Mesuré le 16 novembre 2026 sur **3 968** travaux de **19** dossiers : **un seul** fichier est
 *  refusé dans toutes les bibliothèques et sauvegardes réunies. Le contrat doit donc rendre la
 *  liste des refus **toujours présente et presque toujours vide** — c'est le cas rare qui compte,
 *  et un champ facultatif l'aurait rendu oubliable. */
describe("la file dit ce qu'elle refuse (lot 0t, JOB-05)", () => {
  const travail = {
    id: "0190f0a0-0000-7000-8000-00000000ff01",
    outil: { nom: "traitement-de-lot", version: "1.0.0" },
    versionCible: "0190f0a0-0000-7000-8000-00000000ff02",
    etat: "en_cours",
    tentative: 1,
    progression: 0.5,
    creeLe: "2026-11-16T10:00:00Z",
    majLe: "2026-11-16T10:00:00Z",
  };

  it("porte les deux listes, et la liste des refus même quand rien n'est refusé", () => {
    const lue = FileDeTravaux.parse({ travaux: [travail], refuses: [] });
    expect(lue.travaux).toHaveLength(1);
    expect(lue.refuses).toEqual([]);
  });

  it("garde le nom du fichier et la cause, sans les fondre en une phrase", () => {
    const lue = FileDeTravaux.parse({
      travaux: [],
      refuses: [{ nom: "914c0ae2.json", raison: "missing field `nom` at line 10 column 2" }],
    });
    expect(lue.refuses[0]?.nom).toBe("914c0ae2.json");
    expect(lue.refuses[0]?.raison).toContain("missing field");
  });

  it("refuse un refus sans cause : ce serait une erreur avalée avec plus d'étapes", () => {
    // `safeParse` et non `toThrow` : un contrat **absent** ferait aussi passer un `toThrow`, et un
    // contrôle qui passe quand la chose n'existe pas ne peut pas rougir pour la bonne raison.
    expect(FileDeTravaux.safeParse({ travaux: [], refuses: [{ nom: "a.json", raison: "" }] }).success).toBe(false);
    expect(FileDeTravaux.safeParse({ travaux: [], refuses: [{ nom: "", raison: "abîmé" }] }).success).toBe(false);
  });

  it("refuse une file sans liste de refus : l'oubli du champ est le défaut que ce lot répare", () => {
    expect(FileDeTravaux.safeParse({ travaux: [] }).success).toBe(false);
    // Et une liste nue n'est plus une file : c'est la forme d'avant, celle qui taisait les refus.
    expect(FileDeTravaux.safeParse([travail]).success).toBe(false);
  });
});
