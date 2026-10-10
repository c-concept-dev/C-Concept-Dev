import { DemandeVision, EstimationVision, EtatService, ReponseVision, reponseRepondA, type Capacite } from "@lienotheque/contrats";
import { verifier } from "@lienotheque/noyau";
import { Correspondance, chercher, compter } from "./facade.js";
import { baseDeLaPlace } from "./reserve.js";
import { laBibliotheque, type BaseSql } from "./registre.js";
import { Hono } from "hono";
import {
  compterParModele,
  jetonPorte,
  lireParModele,
  memeJeton,
  VisionRefusee,
  type CompteurDeJetons,
  type LecteurDeZones,
} from "./vision.js";

export const SERVICE = "lienotheque-api";
export const VERSION = "0.2.0";

/** Ce que le service sait faire. La liste grandit avec les routes (HEB-01). */
export const CAPACITES: readonly Capacite[] = ["sante", "vision", "fichiers", "recherche"];

/** Ce que l'hébergeur fournit. Jamais écrit dans un fichier du dépôt, jamais rendu dans une
 *  réponse, jamais consigné : ce sont des secrets posés à la main sur le Worker (règle 6). */
export type Liaisons = {
  readonly ANTHROPIC_API_KEY?: string;
  readonly JETON_ACCES?: string;
  /** Le secret qui signe les laissez-passer des fichiers (SEC-05). */
  readonly SECRET_LAISSEZ?: string;
  /** Le compartiment des fichiers. Jamais lu sans laissez-passer vérifié. */
  readonly MEDIAS?: { readonly get: (cle: string, options?: unknown) => Promise<ObjetServi | null> };
  /** Le registre des bibliothèques publiées. */
  readonly REGISTRE?: BaseSql;
  /** La bibliothèque que la façade sert. Une seule : la façade existe pour une application qui
   *  n'en connaît qu'une, et lui en proposer plusieurs serait lui demander de changer. */
  readonly BIBLIOTHEQUE_FACADE?: string;
};

/** Ce qu'un objet du compartiment doit savoir rendre pour qu'on le serve. */
export type ObjetServi = {
  readonly body: ReadableStream | null;
  readonly size?: number;
  readonly httpEtag?: string;
  readonly httpMetadata?: { readonly contentType?: string };
};

type Options = {
  readonly maintenant?: () => Date;
  /** De quoi lire des zones, à partir de la clé. Remplaçable pour que les tests éprouvent la
   *  route entière sans clé et sans réseau — c'est la seule façon de prouver qu'une réponse non
   *  conforme est refusée. */
  readonly lecteur?: (cle: string) => LecteurDeZones;
  readonly compteur?: (cle: string) => CompteurDeJetons;
};

/** Application Hono de l'API Liénothèque.
 *
 *  Deux routes au-delà de la santé, et une seule porte : un jeton d'accès exigé, comparé sans
 *  laisser le temps de réponse dire où il diffère. Tout ce qui entre et tout ce qui sort est
 *  validé par son contrat (règle 2). */
export function creerApp({ maintenant = () => new Date(), lecteur = lireParModele, compteur = compterParModele }: Options = {}): Hono<{
  Bindings: Liaisons;
}> {
  const app = new Hono<{ Bindings: Liaisons }>();

  app.get("/sante", (contexte) => {
    const etat = EtatService.parse({
      service: SERVICE,
      version: VERSION,
      etat: "pret",
      horodatage: maintenant().toISOString().replace("Z", "+00:00"),
      capacites: [...CAPACITES],
    });
    return contexte.json(etat);
  });

  /** La porte. Sans jeton configuré, la route n'ouvre pas : une route ouverte serait pire qu'une
   *  route absente, et l'oubli d'un secret ne doit pas se solder par un service offert. */
  const laisserEntrer = (contexte: { env: Liaisons; req: { raw: Request } }): Response | undefined => {
    const attendu = contexte.env.JETON_ACCES;
    if (attendu === undefined || attendu.length === 0)
      return Response.json({ erreur: "Le jeton d'accès n'est pas configuré" }, { status: 503 });
    const donne = jetonPorte(contexte.req.raw.headers);
    if (donne === undefined || !memeJeton(donne, attendu)) return Response.json({ erreur: "Jeton refusé" }, { status: 401 });
    if (contexte.env.ANTHROPIC_API_KEY === undefined || contexte.env.ANTHROPIC_API_KEY.length === 0)
      return Response.json({ erreur: "La clé du modèle n'est pas posée" }, { status: 503 });
    return undefined;
  };

  /** Lit le corps et le valide. Les écarts sont nommés — sans citer les images reçues. */
  const demandeDe = async (contexte: { req: { json: () => Promise<unknown> } }): Promise<DemandeVision | Response> => {
    let brut: unknown;
    try {
      brut = await contexte.req.json();
    } catch {
      return Response.json({ erreur: "Corps illisible" }, { status: 400 });
    }
    const valide = DemandeVision.safeParse(brut);
    if (!valide.success)
      return Response.json(
        { erreur: "Demande refusée", ecarts: valide.error.issues.map((souci) => `${souci.path.join(".")} : ${souci.message}`) },
        { status: 400 },
      );
    return valide.data;
  };

  const repondre = async <T>(travail: () => Promise<T>, valider: (valeur: T) => unknown): Promise<Response> => {
    try {
      return Response.json(valider(await travail()) as Record<string, unknown>);
    } catch (leve) {
      // Rien de ce qui vient du modèle n'est relayé : un corps d'erreur peut citer la requête,
      // et une trace peut citer un en-tête. On dit ce qui s'est passé, pas ce qu'on a lu.
      if (leve instanceof VisionRefusee) return Response.json({ erreur: leve.message }, { status: leve.statut });
      return Response.json({ erreur: "La relecture a échoué" }, { status: 502 });
    }
  };

  app.post("/vision", async (contexte) => {
    const refus = laisserEntrer(contexte);
    if (refus !== undefined) return refus;
    const demande = await demandeDe(contexte);
    if (demande instanceof Response) return demande;
    return repondre(
      () => lecteur(contexte.env.ANTHROPIC_API_KEY!)(demande),
      (brute) => {
        // Le recoupement se fait ici, et pas chez le lecteur. Seule la route tient les deux
        // bouts, et ce qui garantit une propriété doit être du côté qui ne peut pas être
        // remplacé : un lecteur quelconque ne doit pas pouvoir laisser passer une réponse qui
        // parle d'une zone qu'on n'a pas demandée. Un test l'a montré en remplaçant le lecteur.
        const reponse = ReponseVision.parse(brute);
        const ecarts = reponseRepondA(demande, reponse);
        if (ecarts.length > 0) throw new VisionRefusee(502, `La réponse ne répond pas à la demande : ${ecarts.join(", ")}`);
        return reponse;
      },
    );
  });

  app.post("/vision/jetons", async (contexte) => {
    const refus = laisserEntrer(contexte);
    if (refus !== undefined) return refus;
    const demande = await demandeDe(contexte);
    if (demande instanceof Response) return demande;
    return repondre(() => compteur(contexte.env.ANTHROPIC_API_KEY!)(demande), (estimation) => EstimationVision.parse(estimation));
  });

  /** Servir un fichier, et seulement sur laissez-passer (SEC-05).
   *
   *  Le Worker retransmet au lieu de signer une adresse chez l'hébergeur de fichiers : un secret
   *  de moins, et la sortie ne coûte rien. Ce qui autorise, c'est la signature — jamais la clé
   *  de l'objet, qu'on ne lit d'ailleurs qu'une fois la signature vérifiée.
   *
   *  Aucune réponse ne dit **ce qui** manque : un fichier absent et un laissez-passer refusé se
   *  distinguent par leur code, pas par un message qui apprendrait ce qui existe. */
  app.get("/fichier/:laissez{.+}", async (contexte) => {
    const secret = contexte.env.SECRET_LAISSEZ;
    const compartiment = contexte.env.MEDIAS;
    if (secret === undefined || secret.length === 0 || compartiment === undefined)
      return contexte.json({ erreur: "Le service de fichiers n'est pas configuré" }, 503);

    const verdict = await verifier(secret, contexte.req.param("laissez"), Math.floor(Date.now() / 1000));
    if (!verdict.ouvert) return contexte.json({ erreur: verdict.raison }, 403);

    const objet = await compartiment.get(verdict.laissez.cle);
    if (objet === null || objet.body === null) return contexte.json({ erreur: "Fichier absent" }, 404);

    const entetes = new Headers({
      "content-type": objet.httpMetadata?.contentType ?? "application/octet-stream",
      // Privé, et pas seulement « non public » : un fichier servi sur laissez-passer n'a rien à
      // faire dans un cache partagé, qui le resservirait après l'expiration.
      "cache-control": "private, no-store",
    });
    if (objet.size !== undefined) entetes.set("content-length", String(objet.size));
    if (objet.httpEtag !== undefined) entetes.set("etag", objet.httpEtag);
    return new Response(objet.body, { headers: entetes });
  });

  /** La façade de compatibilité (INT-04, RCH-12).
   *
   *  Quatre routes, les corps et les formes de réponse de l'application qui existe. Elle ne doit
   *  rien changer chez elle : la bascule est une valeur de configuration, pas une migration.
   *
   *  La bibliothèque servie vient de la configuration, jamais de la requête — demander laquelle
   *  servir reviendrait à laisser choisir celui qui appelle. */
  const ouvrirFacade = async (contexte: {
    env: Liaisons;
    req: { raw: Request };
  }): Promise<{ base: BaseSql; correspondance: Correspondance } | Response> => {
    const cle = contexte.env.BIBLIOTHEQUE_FACADE;
    const registre = contexte.env.REGISTRE;
    if (cle === undefined || cle.length === 0 || registre === undefined)
      return Response.json({ erreur: "La façade n'est pas configurée" }, { status: 503 });

    const attendu = contexte.env.JETON_ACCES;
    if (attendu === undefined || attendu.length === 0)
      return Response.json({ erreur: "Le jeton d'accès n'est pas configuré" }, { status: 503 });
    const donne = contexte.req.raw.headers.get("x-api-key") ?? undefined;
    if (donne === undefined || !memeJeton(donne, attendu)) return Response.json({ erreur: "Jeton refusé" }, { status: 401 });

    const inscrite = await laBibliotheque(registre, cle);
    if (inscrite === undefined || inscrite.liaison === undefined)
      return Response.json({ erreur: "Bibliothèque indisponible" }, { status: 503 });

    const base = baseDeLaPlace(contexte.env as unknown as Record<string, unknown>, inscrite.liaison) as BaseSql | undefined;
    if (base === undefined) return Response.json({ erreur: "Bibliothèque indisponible" }, { status: 503 });

    const ligne = await base
      .prepare("SELECT contenu FROM schema_bibliotheque WHERE cle = ?")
      .bind("facade")
      .first<{ contenu: string }>();
    if (ligne === null) return Response.json({ erreur: "Bibliothèque indisponible" }, { status: 503 });

    const lue = Correspondance.safeParse(JSON.parse(ligne.contenu));
    // Une correspondance illisible ne se devine pas : mieux vaut un service indisponible qu'un
    // service qui rend des champs vides sans le dire.
    if (!lue.success) return Response.json({ erreur: "Bibliothèque indisponible" }, { status: 503 });
    return { base, correspondance: lue.data };
  };

  const corpsDe = async (contexte: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> => {
    try {
      const lu = await contexte.req.json();
      return typeof lu === "object" && lu !== null ? (lu as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  for (const route of ["/search-library", "/rag-search", "/d1-query"] as const) {
    app.post(route, async (contexte) => {
      const ouverte = await ouvrirFacade(contexte);
      if (ouverte instanceof Response) return ouverte;
      const corps = await corpsDe(contexte);
      const trouves = await chercher(ouverte.base, ouverte.correspondance, {
        // `/d1-query` reçoit une intention et non une phrase : ses termes sont déjà séparés.
        query: typeof corps["query"] === "string" ? corps["query"] : Array.isArray(corps["terms"]) ? corps["terms"].join(" ") : "",
        topK: corps["topK"],
      });
      // Chaque route garde le nom que son appelant attend. Les deux noms désignent la même
      // chose : c'est l'application qui a deux habitudes, pas nous deux réponses.
      return contexte.json(route === "/rag-search" ? { chunks: trouves } : { results: trouves });
    });
  }

  app.post("/library-facets", async (contexte) => {
    const ouverte = await ouvrirFacade(contexte);
    if (ouverte instanceof Response) return ouverte;
    const corps = await corpsDe(contexte);
    // Les champs comptés sont ceux que la correspondance déclare depuis un axe : le code ne sait
    // pas lesquels, et n'a pas à le savoir (CLA-01).
    const champs = Object.entries(ouverte.correspondance)
      .filter(([, source]) => source !== null && "axe" in source)
      .map(([champ]) => champ);
    return contexte.json({ facets: await compter(ouverte.base, ouverte.correspondance, champs, { query: corps["query"] }) });
  });

  app.notFound((contexte) => contexte.json({ erreur: "Route inconnue" }, 404));

  return app;
}
