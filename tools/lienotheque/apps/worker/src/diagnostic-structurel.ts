import {
  ReponseValidationCibles,
  validationCiblesRepondA,
  type DemandeValidationCibles,
  type ReponseValidationCibles as ReponseCibles,
  ModeleStructurelPropose,
  ReponseDiagnosticStructurel,
  diagnosticRepondA,
  type DemandeDiagnosticStructurel,
  type ReponseDiagnosticStructurel as Reponse,
} from "@lienotheque/contrats";
import { MODELE, VisionRefusee } from "./vision.js";

const API = "https://api.anthropic.com/v1/messages";
const VERSION_API = "2023-06-01";
const NOM_OUTIL = "rendre_la_structure";
export const OUTIL_DIAGNOSTIC = { nom: "diagnostic-structurel", version: "0.1.0" } as const;

/** Une autre mission que la relecture ciblée : comprendre un gabarit depuis quelques pages. Le
 * formulaire ne rend que des hypothèses grossières ; aucun de ses rectangles n'est directement
 * exécutable. */
const CONSIGNE = [
  "Compare les pages d'un même document et décris uniquement leur structure visuelle répétée.",
  "Repère la zone du numéro de page, les identifiants répétés, les marques visuelles qui leur sont liées et les zones à exclure.",
  "Examine avec soin les petits symboles sombres immédiatement adjacents aux identifiants : même si leur fonction est inconnue, décris leur forme et leur relation spatiale au lieu de les omettre.",
  "Pour un symbole compact, sa forme et son contenu forment un seul repère : ne sépare pas le contour et les chiffres qu'il contient.",
  "Donne deux à quatre observations représentatives par lecture, réparties sur plusieurs pages ; n'énumère pas toutes les occurrences.",
  "Dans une relation, position décrit toujours la position de « de » par rapport à « vers ».",
  "Les coordonnées sont relatives à la page, entre 0 et 1. Elles sont grossières : un calibrateur local les mesurera ensuite.",
  "Une observation est un exemple réellement visible. N'invente jamais une observation, cite son numéro de page et sa valeur seulement si elle est lisible.",
  "Si une fonction ou une relation reste douteuse, inscris-la dans inconnues au lieu de la deviner.",
  "N'emploie aucun vocabulaire propre au sujet du document : décris seulement formes, positions, répétitions et formats.",
].join("\n");

const zone = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" }, l: { type: "number" }, h: { type: "number" } },
  required: ["x", "y", "l", "h"],
  additionalProperties: false,
} as const;

const schema = {
  type: "object",
  properties: {
    geometrie: {
      type: "object",
      properties: { orientation: { type: "string", enum: ["portrait", "paysage"] }, doublePage: { type: "boolean" } },
      required: ["orientation", "doublePage"],
      additionalProperties: false,
    },
    lectures: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          nature: { type: "string", enum: ["page_imprimee", "element", "repere", "exclusion"] },
          zone,
          repetition: { type: "string", enum: ["fixe", "verticale"] },
          forme: { type: "string", enum: ["texte", "rectangle", "losange", "cercle", "ligne", "autre"] },
          alphabet: { type: "string", enum: ["chiffres", "latin", "tous"] },
          exemple: { type: "string" },
          confiance: { type: "number" },
          observations: {
            type: "array",
            items: {
              type: "object",
              properties: { page: { type: "integer" }, zone, valeur: { type: "string" } },
              required: ["page", "zone"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "nature", "zone", "repetition", "forme", "alphabet", "confiance", "observations"],
        additionalProperties: false,
      },
    },
    relations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          de: { type: "string" },
          vers: { type: "string" },
          position: { type: "string", enum: ["dessous", "dessus", "gauche", "droite", "dans"] },
        },
        required: ["de", "vers", "position"],
        additionalProperties: false,
      },
    },
    inconnues: { type: "array", items: { type: "string" } },
  },
  required: ["geometrie", "lectures", "relations", "inconnues"],
  additionalProperties: false,
} as const;

export function corpsDiagnosticStructurel(demande: DemandeDiagnosticStructurel): Record<string, unknown> {
  const contenu: Record<string, unknown>[] = [{ type: "text", text: CONSIGNE, cache_control: { type: "ephemeral" } }];
  for (const page of demande.pages) {
    contenu.push({ type: "text", text: `Page ${page.numero}` });
    contenu.push({ type: "image", source: { type: "base64", media_type: page.typeMime, data: page.image } });
  }
  return {
    model: MODELE,
    max_tokens: 8192,
    tools: [{ name: NOM_OUTIL, description: "Rends le modèle structurel observé.", input_schema: schema, strict: true }],
    tool_choice: { type: "tool", name: NOM_OUTIL },
    messages: [{ role: "user", content: contenu }],
  };
}

export type Diagnostiqueur = (demande: DemandeDiagnosticStructurel) => Promise<Reponse>;
export type ValideurCibles = (demande: DemandeValidationCibles) => Promise<ReponseCibles>;

const identifiant = (valeur: unknown, rang: number): string => {
  if (typeof valeur !== "string") return `lecture-${rang + 1}`;
  const propre = valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return propre.length === 0 ? `lecture-${rang + 1}` : propre;
};

const zoneMesurable = (zone: unknown, aireMaximale = 0.6): boolean => {
  if (typeof zone !== "object" || zone === null) return false;
  const dimensions = zone as Record<string, unknown>;
  const { x, y, l, h } = dimensions;
  return (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof l === "number" &&
    typeof h === "number" &&
    x >= 0 &&
    y >= 0 &&
    l > 0 &&
    h > 0 &&
    x + l <= 1 &&
    y + h <= 1 &&
    l * h <= aireMaximale
  );
};

/** Les identifiants sont des clefs internes, pas une compétence du modèle. Les normaliser ici
 * évite de repayer une lecture juste parce qu'un libellé contient une espace ou un accent. */
function normaliserIdentifiants(brut: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(brut["lectures"])) return brut;
  const correspondances = new Map<string, string>();
  const ecartees: string[] = [];
  const lectures = brut["lectures"].flatMap((lecture, rang) => {
    if (typeof lecture !== "object" || lecture === null) return [lecture];
    const objet = lecture as Record<string, unknown>;
    const id = identifiant(objet["id"], rang);
    if (typeof objet["id"] === "string") correspondances.set(objet["id"], id);
    if (!zoneMesurable(objet["zone"])) {
      ecartees.push(typeof objet["id"] === "string" ? objet["id"].slice(0, 120) : id);
      return [];
    }
    const observations = Array.isArray(objet["observations"])
      ? objet["observations"].filter((observation) => {
          if (typeof observation !== "object" || observation === null) return false;
          // Une observation est un exemple ponctuel, jamais la colonne de recherche entière.
          return zoneMesurable((observation as Record<string, unknown>)["zone"], 0.08);
        }).slice(0, 24).map((observation) => {
          const propre = { ...(observation as Record<string, unknown>) };
          if (typeof propre["valeur"] === "string" && propre["valeur"].trim().length === 0) delete propre["valeur"];
          return propre;
        })
      : [];
    if (observations.length < 2) {
      ecartees.push(typeof objet["id"] === "string" ? objet["id"].slice(0, 120) : id);
      return [];
    }
    return [{ ...objet, id, observations }];
  });
  const idsGardes = new Set(
    lectures.flatMap((lecture) =>
      typeof lecture === "object" && lecture !== null && typeof (lecture as Record<string, unknown>)["id"] === "string"
        ? [(lecture as Record<string, unknown>)["id"] as string]
        : [],
    ),
  );
  const relations = Array.isArray(brut["relations"])
    ? brut["relations"].flatMap((relation) => {
        if (typeof relation !== "object" || relation === null) return [relation];
        const objet = relation as Record<string, unknown>;
        const candidate = {
          ...objet,
          de: typeof objet["de"] === "string" ? (correspondances.get(objet["de"]) ?? identifiant(objet["de"], 0)) : objet["de"],
          vers: typeof objet["vers"] === "string" ? (correspondances.get(objet["vers"]) ?? identifiant(objet["vers"], 0)) : objet["vers"],
        };
        return typeof candidate.de === "string" && typeof candidate.vers === "string" && idsGardes.has(candidate.de) && idsGardes.has(candidate.vers)
          ? [candidate]
          : [];
      })
    : [];
  const inconnues = [
    ...(Array.isArray(brut["inconnues"]) ? brut["inconnues"] : []),
    ...ecartees.map((id) => `Hypothèse « ${id} » écartée : moins de deux observations mesurables.`),
  ];
  return { ...brut, lectures, relations, inconnues };
}

export function diagnostiquerParModele(cle: string, appeler: typeof fetch = fetch): Diagnostiqueur {
  return async (demande) => {
    const reponse = await appeler(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": VERSION_API },
      body: JSON.stringify(corpsDiagnosticStructurel(demande)),
    });
    if (!reponse.ok) throw new VisionRefusee(502, `Le modèle a refusé le diagnostic (statut ${reponse.status})`);
    const corps = (await reponse.json()) as {
      content?: { type?: string; name?: string; input?: unknown }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const bloc = corps.content?.find((entree) => entree.type === "tool_use" && entree.name === NOM_OUTIL);
    if (bloc?.input === undefined) throw new VisionRefusee(502, "Le modèle n'a pas rempli le formulaire demandé");

    const contenu = normaliserIdentifiants(bloc.input as Record<string, unknown>);
    const proposition = ModeleStructurelPropose.safeParse({
      etat: "propose",
      document: demande.document,
      pagesObservees: demande.pages.map((page) => page.numero),
      ...contenu,
    });
    if (!proposition.success) {
      const ecarts = proposition.error.issues.slice(0, 4).map((souci) => `${souci.path.join(".")} : ${souci.message}`);
      throw new VisionRefusee(502, `Le diagnostic n'est pas conforme au contrat — ${ecarts.join(" ; ")}`);
    }
    const candidate = ReponseDiagnosticStructurel.parse({
      modele: proposition.data,
      jetons: { entree: corps.usage?.input_tokens ?? 0, sortie: corps.usage?.output_tokens ?? 0 },
      outil: OUTIL_DIAGNOSTIC,
    });
    const ecarts = diagnosticRepondA(demande, candidate);
    if (ecarts.length > 0) throw new VisionRefusee(502, `Le diagnostic ne répond pas à la demande : ${ecarts.join(", ")}`);
    return candidate;
  };
}

const NOM_OUTIL_CIBLES = "rendre_les_cibles";
export const OUTIL_VALIDATION_CIBLES = { nom: "validation-cibles-structurelles", version: "0.1.0" } as const;

const schemaCibles = {
  type: "object",
  properties: {
    resultats: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cible: { type: "string" },
          etat: { type: "string", enum: ["trouve", "absent", "incertain"] },
          page: { anyOf: [{ type: "integer" }, { type: "null" }] },
          zone: { anyOf: [zone, { type: "null" }] },
          confiance: { type: "number" },
        },
        required: ["cible", "etat", "page", "zone", "confiance"],
        additionalProperties: false,
      },
    },
  },
  required: ["resultats"],
  additionalProperties: false,
} as const;

export function corpsValidationCibles(demande: DemandeValidationCibles): Record<string, unknown> {
  const cibles = demande.cibles.join(", ");
  const contenu: Record<string, unknown>[] = [
    {
      type: "text",
      text: [
        `Cherche uniquement ces identifiants : ${cibles}.`,
        "Une cible est trouvée seulement si elle est exactement visible dans un petit encadré imprimé ; les chiffres de tablature, de mesure ou de page ne comptent pas.",
        "Rends exactement un résultat par cible. Si un chiffre ou le séparateur reste douteux, réponds incertain. N'infère jamais une cible depuis l'ordre des pages.",
        "Pour trouve, indique la page et la boîte exacte en coordonnées relatives. Pour absent ou incertain, omets page et zone.",
      ].join("\n"),
      cache_control: { type: "ephemeral" },
    },
  ];
  for (const page of demande.pages) {
    contenu.push({ type: "text", text: `Page ${page.numero}` });
    contenu.push({ type: "image", source: { type: "base64", media_type: page.typeMime, data: page.image } });
  }
  return {
    model: MODELE,
    max_tokens: 4096,
    tools: [{ name: NOM_OUTIL_CIBLES, description: "Localise ou refuse chaque cible exacte.", input_schema: schemaCibles, strict: true }],
    tool_choice: { type: "tool", name: NOM_OUTIL_CIBLES },
    messages: [{ role: "user", content: contenu }],
  };
}

export function validerCiblesParModele(cle: string, appeler: typeof fetch = fetch): ValideurCibles {
  return async (demande) => {
    const reponse = await appeler(API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": VERSION_API },
      body: JSON.stringify(corpsValidationCibles(demande)),
    });
    if (!reponse.ok) throw new VisionRefusee(502, `Le modèle a refusé la validation ciblée (statut ${reponse.status})`);
    const corps = (await reponse.json()) as {
      content?: { type?: string; name?: string; input?: unknown }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const bloc = corps.content?.find((entree) => entree.type === "tool_use" && entree.name === NOM_OUTIL_CIBLES);
    if (bloc?.input === undefined) throw new VisionRefusee(502, "Le modèle n'a pas rempli le formulaire ciblé");
    const brut = bloc.input as { resultats?: unknown[] };
    const resultats = Array.isArray(brut.resultats)
      ? brut.resultats.map((resultat) => {
          if (typeof resultat !== "object" || resultat === null) return resultat;
          const propre = { ...(resultat as Record<string, unknown>) };
          const numeroPage = typeof propre["page"] === "number" ? propre["page"] : undefined;
          const dimensions = demande.pages.find((page) => page.numero === numeroPage);
          if (dimensions !== undefined && typeof propre["zone"] === "object" && propre["zone"] !== null) {
            const brute = propre["zone"] as Record<string, unknown>;
            const valeurs = [brute["x"], brute["y"], brute["l"], brute["h"]];
            if (valeurs.every((valeur) => typeof valeur === "number") && valeurs.some((valeur) => (valeur as number) > 1))
              propre["zone"] = {
                x: (brute["x"] as number) / dimensions.largeur,
                y: (brute["y"] as number) / dimensions.hauteur,
                l: (brute["l"] as number) / dimensions.largeur,
                h: (brute["h"] as number) / dimensions.hauteur,
              };
          }
          if (propre["page"] === null) delete propre["page"];
          if (propre["zone"] === null) delete propre["zone"];
          if (propre["etat"] !== "trouve") {
            delete propre["page"];
            delete propre["zone"];
          }
          return propre;
        })
      : brut.resultats;
    const candidate = ReponseValidationCibles.safeParse({
      document: demande.document,
      resultats,
      jetons: { entree: corps.usage?.input_tokens ?? 0, sortie: corps.usage?.output_tokens ?? 0 },
      outil: OUTIL_VALIDATION_CIBLES,
    });
    if (!candidate.success) {
      const ecarts = candidate.error.issues.slice(0, 4).map((souci) => `${souci.path.join(".")} : ${souci.message}`);
      throw new VisionRefusee(502, `La validation ciblée n'est pas conforme au contrat — ${ecarts.join(" ; ")}`);
    }
    const ecarts = validationCiblesRepondA(demande, candidate.data);
    if (ecarts.length > 0) throw new VisionRefusee(502, `La validation ciblée ne répond pas à la demande : ${ecarts.join(", ")}`);
    return candidate.data;
  };
}
