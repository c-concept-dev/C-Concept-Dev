import { DemandeVision, EstimationVision, ReponseVision, type ZoneAlire } from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";
import { creerApp } from "../src/app.js";
import { corpsDAppel, jetonPorte, lireParModele, memeJeton, OUTIL } from "../src/vision.js";

/** La route de relecture ciblée (OUT-08, SEC-01, règle 6).
 *
 *  Aucun test ne touche au réseau ni à une clé : le lecteur est remplacé. C'est ce qui permet
 *  d'éprouver ce qui compte vraiment — qu'une réponse non conforme soit refusée, et qu'aucune
 *  réponse ne porte un secret. */

const CLE = "cle-de-test-qui-n-existe-nulle-part";
const JETON = "jeton-de-test";
const liaisons = { ANTHROPIC_API_KEY: CLE, JETON_ACCES: JETON };

/** Un recadrage minuscule mais conforme : un pixel encodé, ce qui suffit au contrat. */
const zone = (empreinte: string, cherche: ZoneAlire["cherche"] = "numero"): ZoneAlire => ({
  empreinte,
  image: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  typeMime: "image/webp",
  largeur: 160,
  hauteur: 110,
  cherche,
  attendu: { min: 1, max: 92 },
});

const EMPREINTE = "a".repeat(32);
const AUTRE = "b".repeat(32);
const demande = (...empreintes: string[]): DemandeVision =>
  DemandeVision.parse({ alphabet: "chiffres", zones: (empreintes.length === 0 ? [EMPREINTE] : empreintes).map((empreinte) => zone(empreinte)) });

const reponse = (zones: { empreinte: string; numero: number | null; confiance: number }[]) => ({
  zones,
  jetons: { entree: 120, sortie: 18 },
  outil: { nom: OUTIL.nom, version: OUTIL.version },
});

const appeler = async (
  corps: unknown,
  options: { jeton?: string | undefined; env?: Record<string, string> } = {},
  app = creerApp({ lecteur: () => async () => ReponseVision.parse(reponse([{ empreinte: EMPREINTE, numero: 14, confiance: 0.9 }])) }),
): Promise<Response> =>
  app.request(
    "/vision",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(options.jeton === undefined ? {} : { authorization: `Bearer ${options.jeton}` }) },
      body: JSON.stringify(corps),
    },
    options.env ?? liaisons,
  );

describe("la porte de la relecture ciblée (SEC-01)", () => {
  it("refuse une requête sans jeton", async () => {
    const vue = await appeler(demande());
    expect(vue.status).toBe(401);
  });

  it("refuse un jeton qui n'est pas le bon", async () => {
    expect((await appeler(demande(), { jeton: "autre-chose-de-la-meme-longueur" })).status).toBe(401);
  });

  it("n'ouvre pas quand aucun jeton n'est configuré : un oubli ne doit pas offrir le service", async () => {
    const vue = await appeler(demande(), { jeton: JETON, env: { ANTHROPIC_API_KEY: CLE } });
    expect(vue.status).toBe(503);
  });

  it("le dit sans détour quand la clé n'est pas posée", async () => {
    const vue = await appeler(demande(), { jeton: JETON, env: { JETON_ACCES: JETON } });
    expect(vue.status).toBe(503);
    expect(await vue.text()).toMatch(/clé du modèle/i);
  });

  it("compare le jeton sans dire où il diffère", () => {
    expect(memeJeton("abcd", "abcd")).toBe(true);
    expect(memeJeton("abcd", "abce")).toBe(false);
    expect(memeJeton("abcd", "abcde")).toBe(false);
    expect(memeJeton("", "")).toBe(true);
  });

  it("ne prend un jeton que porté comme il faut", () => {
    const entetes = (valeur: string) => new Headers({ authorization: valeur });
    expect(jetonPorte(entetes("Bearer abc"))).toBe("abc");
    expect(jetonPorte(entetes("bearer abc"))).toBe("abc");
    expect(jetonPorte(entetes("Basic abc"))).toBeUndefined();
    expect(jetonPorte(entetes("Bearer "))).toBeUndefined();
    expect(jetonPorte(new Headers())).toBeUndefined();
  });
});

describe("ce qui entre est validé (règle 2)", () => {
  it("refuse un corps illisible", async () => {
    const app = creerApp({ lecteur: () => async () => ReponseVision.parse(reponse([])) });
    const vue = await app.request(
      "/vision",
      { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${JETON}` }, body: "{pas du json" },
      liaisons,
    );
    expect(vue.status).toBe(400);
  });

  it("refuse une demande hors contrat, et nomme l'écart", async () => {
    const vue = await appeler({ alphabet: "lettres", zones: [] }, { jeton: JETON });
    expect(vue.status).toBe(400);
    const corps = (await vue.json()) as { erreur: string; ecarts: string[] };
    expect(corps.erreur).toBe("Demande refusée");
    expect(corps.ecarts.length).toBeGreaterThan(0);
  });

  it("refuse un recadrage plus grand que ce qu'on accepte d'envoyer", async () => {
    const vue = await appeler({ alphabet: "chiffres", zones: [{ ...zone(EMPREINTE), largeur: 4000 }] }, { jeton: JETON });
    expect(vue.status).toBe(400);
  });
});

describe("ce qui sort est validé, et refusé sinon (règle 2, OUT-08)", () => {
  const avecLecteur = (rendre: () => unknown) =>
    creerApp({
      lecteur: () => async () => rendre() as ReponseVision,
    });

  it("rend la réponse quand elle est conforme et répond à la demande", async () => {
    const vue = await appeler(demande(), { jeton: JETON });
    expect(vue.status).toBe(200);
    const corps = await vue.json();
    expect(ReponseVision.safeParse(corps).success).toBe(true);
  });

  it("refuse une réponse qui parle d'une zone qu'on n'a pas demandée", async () => {
    const app = avecLecteur(() => reponse([{ empreinte: AUTRE, numero: 14, confiance: 0.9 }]));
    const vue = await appeler(demande(), { jeton: JETON }, app);
    expect(vue.status).toBe(502);
  });

  it("refuse une réponse qui oublie une zone", async () => {
    const app = avecLecteur(() => reponse([]));
    expect((await appeler(demande(), { jeton: JETON }, app)).status).toBe(502);
  });

  it("refuse une réponse hors contrat : un numéro négatif, une confiance impossible", async () => {
    for (const zones of [
      [{ empreinte: EMPREINTE, numero: -3, confiance: 0.5 }],
      [{ empreinte: EMPREINTE, numero: 14, confiance: 2 }],
      [{ empreinte: EMPREINTE, numero: null, confiance: 0.8 }],
    ]) {
      const app = avecLecteur(() => reponse(zones));
      expect((await appeler(demande(), { jeton: JETON }, app)).status, JSON.stringify(zones)).toBe(502);
    }
  });

  it("accepte « rien de lisible » : c'est une réponse, pas un échec", async () => {
    const app = avecLecteur(() => reponse([{ empreinte: EMPREINTE, numero: null, confiance: 0 }]));
    const vue = await appeler(demande(), { jeton: JETON }, app);
    expect(vue.status).toBe(200);
    expect(((await vue.json()) as ReponseVision).zones[0]!.numero).toBeNull();
  });
});

describe("aucune réponse ne porte un secret (SEC-01, règle 6)", () => {
  /** Le cœur de ce fichier. On fait échouer l'appel de toutes les façons possibles et on cherche
   *  la clé et le jeton dans ce qui revient — corps, en-têtes, statut. */
  const cherchable = async (vue: Response): Promise<string> =>
    `${vue.status} ${[...vue.headers].map(([nom, valeur]) => `${nom}:${valeur}`).join(" ")} ${await vue.text()}`;

  it("ni dans une réponse réussie, ni dans un refus, ni dans une panne", async () => {
    const cas: Response[] = [
      await appeler(demande(), { jeton: JETON }),
      await appeler(demande()),
      await appeler({ alphabet: "chiffres", zones: [] }, { jeton: JETON }),
      await appeler(demande(), { jeton: JETON }, creerApp({ lecteur: () => async () => reponse([]) as ReponseVision })),
      await appeler(
        demande(),
        { jeton: JETON },
        creerApp({
          lecteur: (cle) => async () => {
            // Une panne qui cite la clé, comme le ferait une bibliothèque bavarde.
            throw new Error(`échec de l'appel avec ${cle} et le jeton ${JETON}`);
          },
        }),
      ),
    ];
    for (const vue of cas) {
      const texte = await cherchable(vue);
      expect(texte, `statut ${vue.status}`).not.toContain(CLE);
      expect(texte, `statut ${vue.status}`).not.toContain(JETON);
    }
  });

  it("la route de santé n'en dit rien non plus", async () => {
    const vue = await creerApp().request("/sante", {}, liaisons);
    const texte = await cherchable(vue);
    expect(texte).not.toContain(CLE);
    expect(texte).not.toContain(JETON);
  });
});

describe("l'appel au modèle (OUT-08)", () => {
  it("met la clé dans l'en-tête et nulle part ailleurs", () => {
    const corps = JSON.stringify(corpsDAppel(demande()));
    expect(corps).not.toContain(CLE);
  });

  it("annonce chaque image par son empreinte, et borne ce qu'on attend", () => {
    const corps = corpsDAppel(demande(EMPREINTE, AUTRE)) as { messages: { content: { type: string; text?: string }[] }[] };
    const textes = corps.messages[0]!.content.filter((bloc) => bloc.type === "text").map((bloc) => bloc.text!);
    expect(textes.some((texte) => texte.includes(EMPREINTE))).toBe(true);
    expect(textes.some((texte) => texte.includes(AUTRE))).toBe(true);
    expect(textes.some((texte) => texte.includes("entre 1 et 92"))).toBe(true);
  });

  it("marque la consigne pour la mise en cache : elle est identique d'un appel à l'autre", () => {
    const corps = corpsDAppel(demande()) as { messages: { content: Record<string, unknown>[] }[] };
    expect(corps.messages[0]!.content[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
  });

  it("exige le formulaire : le modèle ne répond pas en prose", () => {
    const corps = corpsDAppel(demande()) as { tool_choice: { type: string; name: string }; tools: { strict: boolean }[] };
    expect(corps.tool_choice.type).toBe("tool");
    expect(corps.tools[0]!.strict).toBe(true);
  });

  it("refuse ce que l'API rend quand ce n'est pas le formulaire demandé", async () => {
    const fausse: typeof fetch = async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "je pense que c'est 14" }], usage: { input_tokens: 10, output_tokens: 4 } }));
    await expect(lireParModele(CLE, fausse)(demande())).rejects.toThrow(/formulaire/);
  });

  it("ne relaie pas le corps d'erreur de l'API : il pourrait citer la requête", async () => {
    const fausse: typeof fetch = async () => new Response(JSON.stringify({ error: { message: `clé ${CLE} invalide` } }), { status: 401 });
    await expect(lireParModele(CLE, fausse)(demande())).rejects.toThrow(/statut 401/);
    await expect(lireParModele(CLE, fausse)(demande())).rejects.not.toThrow(new RegExp(CLE));
  });

  it("reprend les jetons que l'API a comptés, jamais une estimation", async () => {
    const fausse: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          content: [{ type: "tool_use", name: "rendre_les_nombres", input: { zones: [{ empreinte: EMPREINTE, numero: 14, confiance: 0.9 }] } }],
          usage: { input_tokens: 137, output_tokens: 21 },
        }),
      );
    const lue = await lireParModele(CLE, fausse)(demande());
    expect(lue.jetons).toEqual({ entree: 137, sortie: 21 });
    expect(lue.outil).toEqual({ nom: OUTIL.nom, version: OUTIL.version });
  });
});

describe("estimer avant de dépenser (REC-04)", () => {
  it("rend le nombre de zones et les jetons d'entrée", async () => {
    const app = creerApp({ compteur: () => async (demande) => EstimationVision.parse({ zones: demande.zones.length, jetonsEntree: 240 }) });
    const vue = await app.request(
      "/vision/jetons",
      { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${JETON}` }, body: JSON.stringify(demande(EMPREINTE, AUTRE)) },
      liaisons,
    );
    expect(vue.status).toBe(200);
    expect(await vue.json()).toEqual({ zones: 2, jetonsEntree: 240 });
  });

  it("exige le même jeton que la relecture", async () => {
    const app = creerApp();
    const vue = await app.request("/vision/jetons", { method: "POST", body: "{}" }, liaisons);
    expect(vue.status).toBe(401);
  });
});

describe("une question, un formulaire (OUT-08)", () => {
  const surRepere = (): DemandeVision =>
    DemandeVision.parse({ alphabet: "chiffres", zones: [zone(EMPREINTE, "repere"), zone(AUTRE, "repere")] });

  it("refuse deux questions dans le même appel", () => {
    expect(DemandeVision.safeParse({ alphabet: "chiffres", zones: [zone(EMPREINTE, "repere"), zone(AUTRE, "numero")] }).success).toBe(false);
  });

  it("exige le verdict dans le formulaire quand on demande un repère", () => {
    const corps = corpsDAppel(surRepere()) as { tools: { input_schema: { properties: { zones: { items: { required: string[]; properties: Record<string, unknown> } } } } }[] };
    const item = corps.tools[0]!.input_schema.properties.zones.items;
    expect(item.required).toContain("repere");
    expect(item.properties.repere).toBeDefined();
  });

  it("ne le met pas dans le formulaire quand on demande un nombre", () => {
    const corps = corpsDAppel(demande()) as { tools: { input_schema: { properties: { zones: { items: { required: string[]; properties: Record<string, unknown> } } } } }[] };
    const item = corps.tools[0]!.input_schema.properties.zones.items;
    expect(item.required).not.toContain("repere");
    expect(item.properties.repere).toBeUndefined();
  });

  it("donne une consigne différente selon la question, et la marque pour la mise en cache", () => {
    const texte = (demande: DemandeVision) =>
      ((corpsDAppel(demande) as { messages: { content: { type: string; text?: string; cache_control?: unknown }[] }[] }).messages[0]!.content[0]!);
    expect(texte(surRepere()).text).toMatch(/cartouche/);
    expect(texte(surRepere()).text).toMatch(/incertain/);
    expect(texte(demande()).text).not.toMatch(/cartouche/);
    expect(texte(surRepere()).cache_control).toEqual({ type: "ephemeral" });
  });

  it("refuse une réponse sans verdict là où la question en demandait un", async () => {
    const app = creerApp({
      lecteur: () => async () =>
        ReponseVision.parse({
          zones: [
            { empreinte: EMPREINTE, numero: 14, confiance: 0.9 },
            { empreinte: AUTRE, numero: 15, confiance: 0.9 },
          ],
          jetons: { entree: 1, sortie: 1 },
          outil: { nom: OUTIL.nom, version: OUTIL.version },
        }),
    });
    const vue = await app.request(
      "/vision",
      { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${JETON}` }, body: JSON.stringify(surRepere()) },
      liaisons,
    );
    expect(vue.status).toBe(502);
  });

  it("accepte « absent » avec un nombre nul, et refuse « absent » avec un nombre", async () => {
    const avec = (zones: Record<string, unknown>[]) =>
      creerApp({ lecteur: () => async () => ({ zones, jetons: { entree: 1, sortie: 1 }, outil: OUTIL }) as unknown as ReponseVision }).request(
        "/vision",
        { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${JETON}` }, body: JSON.stringify(surRepere()) },
        liaisons,
      );
    expect(
      (
        await avec([
          { empreinte: EMPREINTE, repere: "absent", numero: null, confiance: 0 },
          { empreinte: AUTRE, repere: "present", numero: 15, confiance: 0.8 },
        ])
      ).status,
    ).toBe(200);
    expect((await avec([{ empreinte: EMPREINTE, repere: "absent", numero: 14, confiance: 0.9 }])).status).toBe(502);
  });
});
