import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  Ancre, Axe, BATTEMENT_VERROU_S, CarteSynchro, Empreinte, EtatService, EXPIRATION_VERROU_S, Identifiant, Lien, Operation,
  Recette, ResultatOutil, SchemaBibliotheque, Travail, ValeurReferentiel, ValeursAxe, Verrou, VersionDocument,
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

describe("état d'un service (HEB-01, SEC-01)", () => {
  const sain = {
    service: "lienotheque-worker",
    version: "0.1.0",
    etat: "pret",
    horodatage: now,
    capacites: ["sante"],
  };

  it("accepte une réponse de santé complète", () => {
    expect(EtatService.safeParse(sain).success).toBe(true);
  });

  it("refuse un champ supplémentaire : aucune clé ne peut se glisser dans la réponse", () => {
    expect(EtatService.safeParse({ ...sain, apiKey: "secret" }).success).toBe(false);
    expect(EtatService.safeParse({ ...sain, chemin: "/Users/…" }).success).toBe(false);
  });

  it("exige une version sémantique et au moins une capacité annoncée", () => {
    expect(EtatService.safeParse({ ...sain, version: "dev" }).success).toBe(false);
    expect(EtatService.safeParse({ ...sain, capacites: [] }).success).toBe(false);
  });

  it("n'annonce que des capacités du vocabulaire fermé", () => {
    expect(EtatService.safeParse({ ...sain, capacites: ["sante", "recherche"] }).success).toBe(true);
    expect(EtatService.safeParse({ ...sain, capacites: ["tout"] }).success).toBe(false);
  });
});

describe("bail des travaux (JOB-02)", () => {
  const bail = (battuLe: string, expireLe: string) => ({ appareilId: id(9), battuLe, expireLe });

  it("bat toutes les 5 s et expire 15 s après le dernier battement", () => {
    expect(BATTEMENT_VERROU_S).toBe(5);
    expect(EXPIRATION_VERROU_S).toBe(15);
    expect(EXPIRATION_VERROU_S).toBeGreaterThan(BATTEMENT_VERROU_S * 2);
  });

  it("accepte un bail dont l'expiration suit le battement", () => {
    expect(Verrou.safeParse(bail("2026-10-03T10:00:00+02:00", "2026-10-03T10:00:15+02:00")).success).toBe(true);
  });

  it("refuse un bail déjà expiré au moment où il est battu", () => {
    expect(Verrou.safeParse(bail("2026-10-03T10:00:15+02:00", "2026-10-03T10:00:00+02:00")).success).toBe(false);
    expect(Verrou.safeParse(bail("2026-10-03T10:00:00+02:00", "2026-10-03T10:00:00+02:00")).success).toBe(false);
  });

  it("exige l'instant du dernier battement : sans lui, rien ne dit quand le bail a été renouvelé", () => {
    expect(Verrou.safeParse({ appareilId: id(9), expireLe: "2026-10-03T10:00:15+02:00" }).success).toBe(false);
  });

  it("un travail verrouillé porte son bail", () => {
    const base = { id: id(1), outil: { nom: "transcripteur", version: "1.0.0" }, versionCible: id(2), tentative: 1, progression: 0.2, creeLe: now, majLe: now };
    expect(Travail.safeParse({ ...base, etat: "verrouille" }).success).toBe(false);
    expect(
      Travail.safeParse({
        ...base,
        etat: "verrouille",
        verrou: bail("2026-10-03T10:00:00+02:00", "2026-10-03T10:00:15+02:00"),
      }).success,
    ).toBe(true);
  });
});

describe("classement universel (CLA-02, CLA-03)", () => {
  const axe = (extra: Record<string, unknown> = {}) => ({
    cle: "axe-a",
    nom: "Axe A",
    nature: "referentiel",
    cardinalite: "une",
    valeurs: [{ cle: "v1", nom: "Valeur 1" }, { cle: "v2", nom: "Valeur 2" }],
    ...extra,
  });

  it("décrit un axe par sa nature, sa cardinalité et sa structure", () => {
    expect(Axe.safeParse(axe()).success).toBe(true);
    expect(Axe.safeParse(axe({ cardinalite: "principale_et_secondaires" })).success).toBe(true);
    expect(Axe.safeParse(axe({ nature: "inventee" })).success).toBe(false);
    expect(Axe.safeParse(axe({ inconnu: 1 })).success).toBe(false);
  });

  it("exige un référentiel là où il en faut un, et pas ailleurs", () => {
    expect(Axe.safeParse(axe({ valeurs: [] })).success).toBe(false);
    expect(Axe.safeParse({ cle: "n", nom: "N", nature: "nombre", cardinalite: "une" }).success).toBe(true);
    expect(Axe.safeParse({ cle: "n", nom: "N", nature: "nombre", cardinalite: "une", valeurs: [{ cle: "x", nom: "X" }] }).success).toBe(false);
  });

  it("refuse une hiérarchie sur un axe à plat et un parent inconnu", () => {
    expect(Axe.safeParse(axe({ valeurs: [{ cle: "v1", nom: "V1" }, { cle: "v2", nom: "V2", parent: "v1" }] })).success).toBe(false);
    expect(
      Axe.safeParse(axe({ structure: "hierarchique", valeurs: [{ cle: "v1", nom: "V1" }, { cle: "v2", nom: "V2", parent: "v1" }] })).success,
    ).toBe(true);
    expect(
      Axe.safeParse(axe({ structure: "hierarchique", valeurs: [{ cle: "v1", nom: "V1", parent: "absent" }] })).success,
    ).toBe(false);
  });

  it("refuse deux fois la même clé, alias compris : une clé identifie une seule valeur", () => {
    expect(Axe.safeParse(axe({ valeurs: [{ cle: "v1", nom: "A" }, { cle: "v1", nom: "B" }] })).success).toBe(false);
    expect(Axe.safeParse(axe({ valeurs: [{ cle: "v1", nom: "A" }, { cle: "v2", nom: "B", alias: ["v1"] }] })).success).toBe(false);
  });

  it("n'efface jamais une valeur : elle se retire en redirigeant (CLA-03)", () => {
    expect(ValeurReferentiel.safeParse({ cle: "v1", nom: "V1", retiree: true }).success).toBe(false);
    expect(ValeurReferentiel.safeParse({ cle: "v1", nom: "V1", retiree: true, redirigeVers: "v2" }).success).toBe(true);
    expect(ValeurReferentiel.safeParse({ cle: "v1", nom: "V1", retiree: true, redirigeVers: "v1" }).success).toBe(false);
  });

  it("encadre ce qu'un document porte sur un axe", () => {
    expect(ValeursAxe.safeParse({ type: "reference", valeurs: ["v1"] }).success).toBe(true);
    expect(ValeursAxe.safeParse({ type: "reference", valeurs: ["v1", "v1"] }).success).toBe(false);
    expect(ValeursAxe.safeParse({ type: "reference", valeurs: ["v1"], principale: "v2" }).success).toBe(false);
    expect(ValeursAxe.safeParse({ type: "reference", valeurs: [] }).success).toBe(false);
    expect(ValeursAxe.safeParse({ type: "etiquettes", valeurs: ["libre"] }).success).toBe(true);
  });

  it("refuse un schéma sans axe, et deux axes de même clé", () => {
    const base = { cle: "b", nom: "B", langue: "fr", version: 1 };
    expect(SchemaBibliotheque.safeParse({ ...base, axes: [] }).success).toBe(false);
    expect(SchemaBibliotheque.safeParse({ ...base, axes: [axe(), axe()] }).success).toBe(false);
    expect(SchemaBibliotheque.safeParse({ ...base, axes: [axe()] }).success).toBe(true);
  });
});
