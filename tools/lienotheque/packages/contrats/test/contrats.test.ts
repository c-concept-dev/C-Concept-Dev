import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  Ancre, CarteSynchro, Empreinte, Identifiant, Lien, Operation, Recette, ResultatOutil, Travail, VersionDocument,
  arbitrer, transitionVersionAutorisee, versFragment,
} from "../src/index.js";

const lire = (nom: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../fixtures/recettes/${nom}`, import.meta.url)), "utf8"));

const id = (n: number) => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;
const sha = "a".repeat(64);
const now = "2026-10-03T10:00:00+02:00";

describe("identités (ID-01, ID-07)", () => {
  it("accepte un UUID v7 et une empreinte SHA-256", () => {
    expect(Identifiant.safeParse(id(1)).success).toBe(true);
    expect(Empreinte.safeParse(sha).success).toBe(true);
  });
  it("refuse un nom de fichier comme identité", () => {
    expect(Empreinte.safeParse("Realbook_Bass_F.pdf").success).toBe(false);
    expect(Identifiant.safeParse("aebersold-french").success).toBe(false);
  });
});

describe("versions (ID-04, ID-05)", () => {
  const base = { id: id(1), documentId: id(2), numero: 1, fichiers: [sha], recette: { id: "livre-natif", version: 1 }, outils: [], manques: [], creeLe: now };
  it("n'active qu'une version consultable", () => {
    expect(VersionDocument.safeParse({ ...base, etat: "pret_a_lire", active: true }).success).toBe(true);
    expect(VersionDocument.safeParse({ ...base, etat: "lu", active: true }).success).toBe(false);
  });
  it("exige la liste des manques d'une version partielle", () => {
    expect(VersionDocument.safeParse({ ...base, etat: "partiel", active: false }).success).toBe(false);
    expect(VersionDocument.safeParse({ ...base, etat: "partiel", active: false, manques: ["pages 30-31"] }).success).toBe(true);
  });
  it("encadre les transitions", () => {
    expect(transitionVersionAutorisee("lu", "pret_a_lire")).toBe(true);
    expect(transitionVersionAutorisee("recu", "indexe")).toBe(false);
    expect(transitionVersionAutorisee("remplacee", "recu")).toBe(false);
  });
});

describe("ancres et liens (ANC-01 à ANC-05)", () => {
  it("valide une zone et produit son fragment Media Fragments", () => {
    const a = Ancre.parse({ id: id(3), versionId: id(1), fichier: sha, selecteur: { type: "zone", page: 127, x: 2404, y: 656, l: 78, h: 33 } });
    expect(versFragment(a.selecteur)).toBe("xywh=2404,656,78,33");
    expect(versFragment({ type: "temps", debut: 12, fin: 31.5 })).toBe("t=12,31.5");
  });
  it("refuse un intervalle de temps inversé", () => {
    expect(Ancre.safeParse({ id: id(3), versionId: id(1), fichier: sha, selecteur: { type: "temps", debut: 30, fin: 12 } }).success).toBe(false);
  });
  it("exige une personne pour une preuve manuelle", () => {
    const l = { id: id(4), de: id(3), vers: id(5), nature: "piste_de", preuve: "manuel", confiance: 1 };
    expect(Lien.safeParse({ ...l, auteur: { type: "outil", outil: { nom: "pastilles", version: "1.0.0" } } }).success).toBe(false);
    expect(Lien.safeParse({ ...l, auteur: { type: "personne", personneId: id(9) } }).success).toBe(true);
  });
  it("accepte un segment inconnu sans position inventée (ANC-03)", () => {
    const carte = { id: id(6), versionId: id(1), media: sha, paires: [{ segment: "inconnu", ancre: id(3) }] };
    expect(CarteSynchro.safeParse(carte).success).toBe(true);
    const inventee = { ...carte, paires: [{ segment: "inconnu", ancre: id(3), debut: 0 }] };
    expect(CarteSynchro.safeParse(inventee).success).toBe(false);
  });
});

describe("recettes (REC-01, REC-06)", () => {
  it("valide les deux recettes prouvées", () => {
    expect(Recette.safeParse(lire("methode-pastilles-cd.v4.json")).success).toBe(true);
    expect(Recette.safeParse(lire("methode-pastille-piste.v1.json")).success).toBe(true);
  });
  it("refuse un paramètre inconnu ou une règle en texte libre", () => {
    const r = lire("methode-pastilles-cd.v4.json");
    expect(Recette.safeParse({ ...r, inconnu: true }).success).toBe(false);
    expect(Recette.safeParse({ ...r, regles: { ...r.regles, elements: "croissants, saut max 12" } }).success).toBe(false);
  });
  it("n'utilise les noms de fichiers que comme indices (REC-05)", () => {
    const r = lire("methode-pastilles-cd.v4.json");
    expect(Recette.safeParse({ ...r, audio: { ...r.audio, usage: "verite" } }).success).toBe(false);
  });
});

describe("travaux (JOB-02, JOB-05)", () => {
  const base = { id: id(7), outil: { nom: "ocr", version: "1.0.0" }, versionCible: id(1), tentative: 1, progression: 0.4, creeLe: now, majLe: now };
  it("exige la cause d'un échec", () => {
    expect(Travail.safeParse({ ...base, etat: "en_echec_recuperable" }).success).toBe(false);
    expect(Travail.safeParse({ ...base, etat: "en_echec_recuperable", erreur: { cause: "PDF illisible", elements: ["p. 12"], reprisePossible: true } }).success).toBe(true);
  });
  it("exige un verrou pour un travail verrouillé", () => {
    expect(Travail.safeParse({ ...base, etat: "verrouille" }).success).toBe(false);
  });
});

describe("synchronisation (SYN-02 à SYN-05)", () => {
  const humain = { type: "personne" as const, personneId: id(9) };
  const auto = { type: "travail" as const, travailId: id(7) };
  const etat = { revisionActuelle: 3, operationsAppliquees: new Set([id(10)]), derniereDecisionHumaine: true };
  it("n'applique jamais deux fois la même opération", () => {
    expect(arbitrer({ operationId: id(10), revisionAttendue: 3, auteur: humain }, etat)).toBe("deja_applique");
  });
  it("garde la décision humaine face à un recalcul", () => {
    expect(arbitrer({ operationId: id(11), revisionAttendue: 2, auteur: auto }, etat)).toBe("proposition");
  });
  it("présente un conflit entre deux décisions humaines", () => {
    expect(arbitrer({ operationId: id(12), revisionAttendue: 2, auteur: humain }, etat)).toBe("conflit_a_presenter");
  });
  it("valide une opération complète", () => {
    const op = { operationId: id(13), deviceId: id(14), objet: { type: "lien", id: id(4) }, action: "modifier", revisionAttendue: 3, auteur: humain, contenu: { confiance: 1 }, horodatage: now };
    expect(Operation.safeParse(op).success).toBe(true);
  });
});

describe("résultat d'outil", () => {
  it("refuse un lien qui part d'une ancre non proposée", () => {
    const r = { outil: { nom: "pastilles", version: "1.0.0" }, source: sha, ancres: [{ cle: "e400", selecteur: { type: "element", page: 127, valeur: "400" }, confiance: 0.95 }], liens: [{ de: "e401", vers: "piste-41", nature: "piste_de", preuve: "lu", confiance: 0.9 }], textes: [] };
    expect(ResultatOutil.safeParse(r).success).toBe(false);
    expect(ResultatOutil.safeParse({ ...r, liens: [{ ...r.liens[0], de: "e400" }] }).success).toBe(true);
  });
});
