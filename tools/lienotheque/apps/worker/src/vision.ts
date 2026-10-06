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
  "Rends ta confiance de 0 à 1 : elle porte sur l'ensemble de ta réponse pour cette image.",
  "Rends une entrée par image, en reprenant son rang — « Image 1 », « Image 2 » — pour qu'on sache à quoi tu réponds.",
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
          image: { type: "integer", description: "Le rang de l'image, tel qu'il est annoncé : 1 pour la première" },
          numero: { type: ["integer", "null"], description: "Le nombre lu, ou null si rien n'est lisible" },
          confiance: { type: "number", description: "De 0 à 1, sur l'ensemble de ta réponse pour cette image" },
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
        required: question === "repere" ? ["image", "repere", "numero", "confiance"] : ["image", "numero", "confiance"],
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
  // Le rang, et non l'empreinte. Faire recopier trente-deux caractères hexadécimaux était une
  // mauvaise idée : sur deux cent quarante-trois pavés, le modèle en a changé un — « …ff786… »
  // rendu « …ff746… » — et toute la réponse était refusée pour une zone inconnue. Un rang de un
  // ou deux chiffres se recopie, et l'empreinte reste notre clef, de notre côté.
  for (const [rang, zone] of demande.zones.entries()) {
    const borne = zone.attendu === undefined ? "" : ` Le nombre attendu est entre ${zone.attendu.min} et ${zone.attendu.max}.`;
    contenu.push({ type: "text", text: `Image ${rang + 1}.${borne}` });
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
    // Le rang redevient l'empreinte, de notre côté. Un rang hors de la demande est refusé : le
    // modèle a répondu d'une image qu'on ne lui a pas montrée.
    const rendues = (Array.isArray(lu) ? lu : []).map((entree) => {
      const { image, ...reste } = entree as { image?: unknown };
      const rang = typeof image === "number" ? image : Number.NaN;
      const zone = demande.zones[rang - 1];
      return zone === undefined ? reste : { ...reste, empreinte: zone.empreinte };
    });
    const candidate = {
      zones: rendues,
      jetons: { entree: corps.usage?.input_tokens ?? 0, sortie: corps.usage?.output_tokens ?? 0 },
      outil: { nom: OUTIL.nom, version: OUTIL.version },
    };

    const valide = ReponseVision.safeParse(candidate);
    if (!valide.success) {
      // Les chemins et messages de notre propre contrat, pas les valeurs reçues : ceux-là sont à
      // nous et rendent la panne diagnosticable, celles-là viennent du modèle et pourraient citer
      // la requête. Sans ce détail, « non conforme » ne dit pas quel champ a manqué.
      const ou = valide.error.issues.slice(0, 3).map((souci) => `${souci.path.join(".")} : ${souci.message}`);
      throw new VisionRefusee(502, `La réponse du modèle n'est pas conforme au contrat — ${ou.join(" ; ")}`);
    }

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
