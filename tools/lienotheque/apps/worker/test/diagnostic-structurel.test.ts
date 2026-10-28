import {
  DemandeDiagnosticStructurel,
  DemandeValidationCibles,
  ReponseDiagnosticStructurel,
  ReponseValidationCibles,
  type ModeleStructurelPropose,
} from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { creerApp } from "../src/app.js";
import { corpsDiagnosticStructurel, corpsValidationCibles, diagnostiquerParModele, validerCiblesParModele } from "../src/diagnostic-structurel.js";

const CLE = "cle-factice";
const JETON = "jeton-factice";
const DOCUMENT = "a".repeat(64);
const page = (numero: number, lettre: string) => ({
  numero,
  empreinte: lettre.repeat(64),
  image: Buffer.from(`page-${numero}`).toString("base64"),
  typeMime: "image/webp" as const,
  largeur: 1200,
  hauteur: 1800,
});
const demande = DemandeDiagnosticStructurel.parse({ document: DOCUMENT, pages: [page(7, "b"), page(19, "c")] });

const modele = (): ModeleStructurelPropose => ({
  etat: "propose",
  document: DOCUMENT,
  pagesObservees: [7, 19],
  geometrie: { orientation: "portrait", doublePage: false },
  lectures: [
    {
      id: "numero",
      nature: "element",
      zone: { x: 0.02, y: 0.03, l: 0.12, h: 0.9 },
      repetition: "verticale",
      forme: "rectangle",
      alphabet: "chiffres",
      exemple: "5.19",
      confiance: 0.91,
      observations: [
        { page: 7, zone: { x: 0.03, y: 0.2, l: 0.05, h: 0.02 } },
        { page: 19, zone: { x: 0.031, y: 0.6, l: 0.052, h: 0.021 } },
      ],
    },
  ],
  relations: [],
  inconnues: [],
});

const reponse = (): ReponseDiagnosticStructurel => ({
  modele: modele(),
  jetons: { entree: 120, sortie: 45 },
  outil: { nom: "diagnostic-structurel", version: "0.1.0" },
});

describe("route de diagnostic structurel (OUT-08, règle 2)", () => {
  it("reste derrière la même porte et valide les deux côtés", async () => {
    const app = creerApp({ diagnostiqueur: () => async () => reponse() });
    const sansJeton = await app.request("/vision/structure", { method: "POST", body: JSON.stringify(demande) }, { ANTHROPIC_API_KEY: CLE, JETON_ACCES: JETON });
    expect(sansJeton.status).toBe(401);

    const vue = await app.request(
      "/vision/structure",
      { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${JETON}` }, body: JSON.stringify(demande) },
      { ANTHROPIC_API_KEY: CLE, JETON_ACCES: JETON },
    );
    expect(vue.status).toBe(200);
    expect(ReponseDiagnosticStructurel.safeParse(await vue.json()).success).toBe(true);
  });

  it("refuse une réponse portant sur un autre document", async () => {
    const app = creerApp({
      diagnostiqueur: () => async () => ({ ...reponse(), modele: { ...modele(), document: "d".repeat(64) } }),
    });
    const vue = await app.request(
      "/vision/structure",
      { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${JETON}` }, body: JSON.stringify(demande) },
      { ANTHROPIC_API_KEY: CLE, JETON_ACCES: JETON },
    );
    expect(vue.status).toBe(502);
  });
});

describe("appel de diagnostic au modèle", () => {
  it("envoie uniquement les pages choisies et exige un formulaire strict", () => {
    const corps = corpsDiagnosticStructurel(demande) as {
      messages: { content: { type: string; text?: string }[] }[];
      tools: { strict: boolean }[];
      tool_choice: { type: string };
    };
    expect(corps.messages[0]!.content.filter((bloc) => bloc.type === "image")).toHaveLength(2);
    const consigne = corps.messages[0]!.content.find((bloc) => bloc.type === "text")?.text ?? "";
    expect(consigne).toMatch(/forme et son contenu forment un seul repère/i);
    expect(consigne).toMatch(/deux à quatre observations/i);
    expect(consigne).toMatch(/position de .+de.+par rapport à .+vers/i);
    expect(corps.tools[0]!.strict).toBe(true);
    expect(corps.tool_choice.type).toBe("tool");
  });

  it("refuse la prose et ne transforme jamais une réponse incomplète en modèle", async () => {
    const prose: typeof fetch = async () => new Response(JSON.stringify({ content: [{ type: "text", text: "probablement à gauche" }] }));
    await expect(diagnostiquerParModele(CLE, prose)(demande)).rejects.toThrow(/formulaire/);

    const incomplet: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "rendre_la_structure", input: { geometrie: { orientation: "portrait", doublePage: false } } }],
          usage: { input_tokens: 10, output_tokens: 4 },
        }),
      );
    await expect(diagnostiquerParModele(CLE, incomplet)(demande)).rejects.toThrow(/contrat/);
  });

  it("normalise les identifiants descriptifs du modèle sans casser leurs relations", async () => {
    const fausse: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "rendre_la_structure",
              input: {
                geometrie: { orientation: "portrait", doublePage: false },
                lectures: [
                  {
                    id: "Numéro composé",
                    nature: "element",
                    zone: { x: 0.02, y: 0.03, l: 0.12, h: 0.9 },
                    repetition: "verticale",
                    forme: "rectangle",
                    alphabet: "chiffres",
                    exemple: "5.19",
                    confiance: 0.9,
                    observations: [
                      { page: 7, zone: { x: 0.03, y: 0.2, l: 0.05, h: 0.02 } },
                      { page: 19, zone: { x: 0.03, y: 0.6, l: 0.05, h: 0.02 } },
                    ],
                  },
                  {
                    id: "Repère_audio",
                    nature: "repere",
                    zone: { x: 0.12, y: 0.03, l: 0.12, h: 0.9 },
                    repetition: "verticale",
                    forme: "losange",
                    alphabet: "chiffres",
                    confiance: 0.8,
                    observations: [
                      { page: 7, zone: { x: 0.13, y: 0.2, l: 0.03, h: 0.02 } },
                      { page: 19, zone: { x: 0.13, y: 0.6, l: 0.03, h: 0.02 } },
                    ],
                  },
                ],
                relations: [{ de: "Repère_audio", vers: "Numéro composé", position: "droite" }],
                inconnues: [],
              },
            },
          ],
          usage: { input_tokens: 12, output_tokens: 8 },
        }),
      );
    const lue = await diagnostiquerParModele(CLE, fausse)(demande);
    expect(lue.modele.lectures.map((lecture) => lecture.id)).toEqual(["numero-compose", "repere-audio"]);
    expect(lue.modele.relations).toEqual([{ de: "repere-audio", vers: "numero-compose", position: "droite" }]);
  });

  it("écarte une hypothèse qui n'a pas deux observations valides et la conserve comme inconnue", async () => {
    const entree = {
      geometrie: { orientation: "portrait", doublePage: false },
      lectures: [
        {
          id: "valide",
          nature: "element",
          zone: { x: 0.02, y: 0.03, l: 0.12, h: 0.9 },
          repetition: "verticale",
          forme: "rectangle",
          alphabet: "chiffres",
          confiance: 0.9,
          observations: [
            { page: 7, zone: { x: 0.03, y: 0.2, l: 0.05, h: 0.02 } },
            { page: 19, zone: { x: 0.03, y: 0.6, l: 0.05, h: 0.02 } },
          ],
        },
        {
          id: "pas assez prouvée",
          nature: "repere",
          zone: { x: 0.2, y: 0.03, l: 0.12, h: 0.9 },
          repetition: "verticale",
          forme: "autre",
          alphabet: "tous",
          confiance: 0.5,
          observations: [
            { page: 7, zone: { x: 0.2, y: 0.2, l: 0, h: 0 } },
            { page: 19, zone: { x: 0.2, y: 0.6, l: 0.05, h: 0.02 } },
          ],
        },
      ],
      relations: [{ de: "pas assez prouvée", vers: "valide", position: "droite" }],
      inconnues: [],
    };
    const fausse: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "rendre_la_structure", input: entree }],
          usage: { input_tokens: 12, output_tokens: 8 },
        }),
      );
    const lue = await diagnostiquerParModele(CLE, fausse)(demande);
    expect(lue.modele.lectures.map((lecture) => lecture.id)).toEqual(["valide"]);
    expect(lue.modele.relations).toEqual([]);
    expect(lue.modele.inconnues.join(" ")).toMatch(/pas assez prouvée/i);
  });

  it("écarte les zones couvrant la page et borne les observations répétées sans perdre la lecture valide", async () => {
    const valide = {
      id: "numero",
      nature: "element",
      zone: { x: 0.02, y: 0.03, l: 0.12, h: 0.9 },
      repetition: "verticale",
      forme: "rectangle",
      alphabet: "chiffres",
      confiance: 0.9,
      observations: [
        ...Array.from({ length: 30 }, (_, rang) => ({
        page: rang % 2 === 0 ? 7 : 19,
        zone: { x: 0.03, y: 0.1 + (rang % 10) * 0.05, l: 0.05, h: 0.02 },
        })),
        { page: 7, zone: { x: 0.02, y: 0.02, l: 0.4, h: 0.8 } },
      ],
    };
    const exclusionPleinePage = {
      id: "corps de page",
      nature: "exclusion",
      zone: { x: 0, y: 0, l: 1, h: 0.95 },
      repetition: "fixe",
      forme: "autre",
      alphabet: "tous",
      confiance: 0.8,
      observations: [
        { page: 7, zone: { x: 0, y: 0, l: 1, h: 0.95 } },
        { page: 19, zone: { x: 0, y: 0, l: 1, h: 0.95 } },
      ],
    };
    const fausse: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          content: [
            {
              type: "tool_use",
              name: "rendre_la_structure",
              input: {
                geometrie: { orientation: "portrait", doublePage: false },
                lectures: [valide, exclusionPleinePage],
                relations: [],
                inconnues: [],
              },
            },
          ],
          usage: { input_tokens: 12, output_tokens: 8 },
        }),
      );
    const lue = await diagnostiquerParModele(CLE, fausse)(demande);
    expect(lue.modele.lectures.map((lecture) => lecture.id)).toEqual(["numero"]);
    expect(lue.modele.lectures[0]!.observations).toHaveLength(24);
    expect(lue.modele.inconnues.join(" ")).toMatch(/corps de page/i);
  });
});

describe("repli Vision ciblé", () => {
  const demandeCibles = DemandeValidationCibles.parse({ document: DOCUMENT, pages: [page(67, "d")], cibles: ["5.17"] });
  const reponseCibles = ReponseValidationCibles.parse({
    document: DOCUMENT,
    resultats: [{ cible: "5.17", etat: "trouve", page: 67, zone: { x: 0.03, y: 0.72, l: 0.05, h: 0.02 }, confiance: 0.99 }],
    jetons: { entree: 80, sortie: 12 },
    outil: { nom: "validation-cibles-structurelles", version: "0.1.0" },
  });

  it("reste derrière la porte et refuse une réponse sur une autre page", async () => {
    const app = creerApp({ valideurCibles: () => async () => reponseCibles });
    const vue = await app.request(
      "/vision/structure/cibles",
      { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${JETON}` }, body: JSON.stringify(demandeCibles) },
      { ANTHROPIC_API_KEY: CLE, JETON_ACCES: JETON },
    );
    expect(vue.status).toBe(200);

    const refuse = creerApp({
      valideurCibles: () => async () => ({ ...reponseCibles, resultats: [{ ...reponseCibles.resultats[0]!, page: 99 }] }),
    });
    const autre = await refuse.request(
      "/vision/structure/cibles",
      { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${JETON}` }, body: JSON.stringify(demandeCibles) },
      { ANTHROPIC_API_KEY: CLE, JETON_ACCES: JETON },
    );
    expect(autre.status).toBe(502);
  });

  it("demande une preuve exacte et autorise explicitement l'abstention", () => {
    const corps = corpsValidationCibles(demandeCibles) as { messages: { content: { type: string; text?: string }[] }[]; tools: { strict: boolean }[] };
    const consigne = corps.messages[0]!.content.find((bloc) => bloc.type === "text")?.text ?? "";
    expect(consigne).toMatch(/exactement visible/i);
    expect(consigne).toMatch(/incertain/i);
    expect(corps.tools[0]!.strict).toBe(true);
  });

  it("refuse une réponse qui omet une cible", async () => {
    const fausse: typeof fetch = async () =>
      new Response(JSON.stringify({ content: [{ type: "tool_use", name: "rendre_les_cibles", input: { resultats: [] } }] }));
    await expect(validerCiblesParModele(CLE, fausse)(demandeCibles)).rejects.toThrow();
  });
});
