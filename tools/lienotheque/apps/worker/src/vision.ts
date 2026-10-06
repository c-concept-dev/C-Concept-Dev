import { DemandeVision, EstimationVision, ReponseVision, reponseRepondA, type QuestionVision, type ZoneAlire } from "@lienotheque/contrats";

/** L'appel au modèle, derrière le Worker (OUT-08, règle 6).
 *
 *  **La clé ne sort jamais d'ici.** Elle vit dans le secret du Worker, elle part dans un en-tête
 *  vers l'API du modèle, et rien de ce qui revient à l'application ne la contient — pas même un
 *  message d'erreur. Les erreurs du modèle sont donc reformulées, jamais relayées telles quelles :
 *  un corps d'erreur peut citer ce qu'on lui a envoyé.
 *
 *  Et la réponse est validée avant d'entrer où que ce soit. Un modèle qui rend un numéro pour une
 *  zone qu'on n'a pas demandée, ou qui en oublie une, est refusé — pas rattrapé au jugé. */

export const MODELE = "claude-haiku-4-5";
export const OUTIL = { nom: "vision-ciblee", version: "0.1.0" } as const;
const API = "https://api.anthropic.com/v1";
const VERSION_API = "2023-06-01";

/** Ce que le Worker demande au modèle de faire. Stable d'un appel à l'autre : c'est ce qui permet
 *  de le marquer pour la mise en cache des invites, et de ne le payer qu'une fois.
 *
 *  Aucun mot de domaine : on fait lire un nombre dans un rectangle. Ce que ce nombre désigne ne
 *  regarde pas cette route. */
const COMMUN = [
  "Chaque image est un petit rectangle découpé dans une page numérisée.",
  "Si aucun nombre n'est lisible, rends null : c'est une réponse juste et utile, et il ne faut pas deviner.",
  "Rends ta confiance de 0 à 1 : 1 quand les chiffres sont nets et sans ambiguïté, moins dès qu'il y a un doute.",
  "Reprends l'empreinte de chaque image telle qu'elle t'est donnée, pour qu'on sache à quoi tu réponds.",
];

/** La consigne, selon la question posée. Stable pour une question donnée : c'est ce qui permet de
 *  la marquer pour la mise en cache et de ne la payer qu'une fois par série d'appels. */
export const CONSIGNES: Record<QuestionVision, string> = {
  repere: [
    COMMUN[0]!,
    "On y cherche un cartouche : un pavé sombre portant un nombre en chiffres clairs, parfois accompagné d'une étiquette.",
    "Pour chaque image, dis d'abord si un tel cartouche y est : « present », « absent », ou « incertain » si tu hésites.",
    "« incertain » est une réponse pleine : hésiter et le dire vaut mieux que trancher au hasard.",
    "Réponds « absent » quand l'image ne montre qu'un trait, une portée, une lettre, ou du papier — et rends alors null comme nombre.",
    "Quand le cartouche est là, rends le nombre qu'il porte, et seulement lui — ni l'étiquette, ni ce qui l'entoure.",
    ...COMMUN.slice(1),
  ].join("\n"),
  numero: [
    COMMUN[0]!,
    "Il est découpé dans la marge d'une page, et il peut porter un numéro imprimé en sombre sur fond clair.",
    "Pour chaque image, rends le nombre que tu lis, et seulement lui — ni le texte alentour, ni un numéro de page.",
    ...COMMUN.slice(1),
  ].join("\n"),
};

/** Le schéma que le modèle doit remplir. Strict : aucune propriété en plus, aucune manquante.
 *
 *  Il dépend de la question, et c'est pourquoi un appel n'en pose qu'une : le verdict de repère est
 *  exigé quand on l'a demandé, et interdit sinon. Un formulaire où il serait tantôt l'un tantôt
 *  l'autre laisserait au modèle le soin de devenir ce qu'on attend de lui. */
const schemaOutil = (question: QuestionVision): Record<string, unknown> => ({
  type: "object",
  properties: {
    zones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          empreinte: { type: "string", description: "L'empreinte de l'image, reprise telle quelle" },
          numero: { type: ["integer", "null"], description: "Le nombre lu, ou null si rien n'est lisible" },
          confiance: { type: "number", description: "De 0 à 1. Exactement 0 quand numero vaut null" },
          ...(question === "repere"
            ? {
                repere: {
                  type: "string",
                  enum: ["present", "absent", "incertain"],
                  description: "Le cartouche est-il là ? « absent » impose numero null",
                },
              }
            : {}),
        },
        required: question === "repere" ? ["empreinte", "repere", "numero", "confiance"] : ["empreinte", "numero", "confiance"],
        additionalProperties: false,
      },
    },
  },
  required: ["zones"],
  additionalProperties: false,
});

const NOM_OUTIL = "rendre_les_nombres";

/** Le corps d'un appel au modèle, pour une demande donnée.
 *
 *  La consigne et le schéma forment un préfixe identique d'un appel à l'autre, marqué pour la mise
 *  en cache ; les images suivent. Chacune est annoncée par son empreinte, pour que le modèle ait
 *  de quoi répondre zone par zone. */
export function corpsDAppel(demande: DemandeVision): Record<string, unknown> {
  const question = demande.zones[0]!.cherche;
  const contenu: Record<string, unknown>[] = [{ type: "text", text: CONSIGNES[question], cache_control: { type: "ephemeral" } }];
  for (const zone of demande.zones) {
    const borne = zone.attendu === undefined ? "" : ` Le nombre attendu est entre ${zone.attendu.min} et ${zone.attendu.max}.`;
    contenu.push({ type: "text", text: `Image ${zone.empreinte}.${borne}` });
    contenu.push({ type: "image", source: { type: "base64", media_type: zone.typeMime, data: zone.image } });
  }
  return {
    model: MODELE,
    max_tokens: 1024,
    tools: [{ name: NOM_OUTIL, description: "Rends ce que tu lis, une entrée par image.", input_schema: schemaOutil(question), strict: true }],
    tool_choice: { type: "tool", name: NOM_OUTIL },
    messages: [{ role: "user", content: contenu }],
  };
}

/** Ce qu'une erreur de la route dit, et ce qu'elle ne dit pas. */
export class VisionRefusee extends Error {
  constructor(
    readonly statut: 502 | 504,
    message: string,
  ) {
    super(message);
    this.name = "VisionRefusee";
  }
}

export type LecteurDeZones = (demande: DemandeVision) => Promise<ReponseVision>;
export type CompteurDeJetons = (demande: DemandeVision) => Promise<EstimationVision>;

type Usage = { input_tokens?: number; output_tokens?: number };

/** Appelle l'API et rend ce qu'elle a donné, validé.
 *
 *  Toute sortie de route passe par le contrat. Un corps d'erreur de l'API n'est jamais relayé :
 *  on dit le statut et rien d'autre, parce qu'un message d'erreur peut citer la requête. */
export function lireParModele(cle: string, appeler: typeof fetch = fetch): LecteurDeZones {
  return async (demande) => {
    const reponse = await appeler(`${API}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": VERSION_API },
      body: JSON.stringify(corpsDAppel(demande)),
    });
    if (!reponse.ok) throw new VisionRefusee(502, `Le modèle a refusé l'appel (statut ${reponse.status})`);

    const corps = (await reponse.json()) as { content?: { type?: string; name?: string; input?: unknown }[]; usage?: Usage };
    const bloc = corps.content?.find((entree) => entree.type === "tool_use" && entree.name === NOM_OUTIL);
    if (bloc?.input === undefined) throw new VisionRefusee(502, "Le modèle n'a pas rempli le formulaire demandé");

    const lu = (bloc.input as { zones?: unknown }).zones;
    const candidate = {
      zones: Array.isArray(lu) ? lu : [],
      jetons: { entree: corps.usage?.input_tokens ?? 0, sortie: corps.usage?.output_tokens ?? 0 },
      outil: { nom: OUTIL.nom, version: OUTIL.version },
    };

    const valide = ReponseVision.safeParse(candidate);
    if (!valide.success) throw new VisionRefusee(502, "La réponse du modèle n'est pas conforme au contrat");

    const ecarts = reponseRepondA(demande, valide.data);
    if (ecarts.length > 0) throw new VisionRefusee(502, `La réponse ne répond pas à la demande : ${ecarts.join(", ")}`);
    return valide.data;
  };
}

/** Compte ce qu'une demande coûterait, sans la payer (REC-04). */
export function compterParModele(cle: string, appeler: typeof fetch = fetch): CompteurDeJetons {
  return async (demande) => {
    const { max_tokens, ...corps } = corpsDAppel(demande) as Record<string, unknown>;
    void max_tokens;
    const reponse = await appeler(`${API}/messages/count_tokens`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cle, "anthropic-version": VERSION_API },
      body: JSON.stringify(corps),
    });
    if (!reponse.ok) throw new VisionRefusee(502, `Le comptage a été refusé (statut ${reponse.status})`);
    const lu = (await reponse.json()) as { input_tokens?: number };
    const valide = EstimationVision.safeParse({ zones: demande.zones.length, jetonsEntree: lu.input_tokens ?? 0 });
    if (!valide.success) throw new VisionRefusee(502, "Le comptage rendu n'est pas conforme au contrat");
    return valide.data;
  };
}

/** Compare deux chaînes sans laisser le temps de réponse dire où elles diffèrent. */
export function memeJeton(donne: string, attendu: string): boolean {
  if (donne.length !== attendu.length) return false;
  let ecart = 0;
  for (let rang = 0; rang < donne.length; rang += 1) ecart |= donne.charCodeAt(rang) ^ attendu.charCodeAt(rang);
  return ecart === 0;
}

/** Le jeton porté par une requête, s'il y en a un. */
export function jetonPorte(entetes: Headers): string | undefined {
  const brut = entetes.get("authorization");
  if (brut === null) return undefined;
  const [schema, valeur] = brut.split(" ");
  return schema?.toLowerCase() === "bearer" && valeur !== undefined && valeur.length > 0 ? valeur : undefined;
}

export type ZonesDe = readonly ZoneAlire[];
