import { DemandeVision, EstimationVision, EtatService, ReponseVision, reponseRepondA, type Capacite } from "@lienotheque/contrats";
import {
  DUREE_PAR_DEFAUT,
  DUREE_SESSION,
  cleDerive,
  clePassagesDeDocument,
  cleVue,
  cleVueDeDocument,
  entetRetrait,
  entetTemoin,
  signer,
  verifier,
} from "@lienotheque/noyau";
import { Correspondance, chercher, compter } from "./facade.js";
import { baseDeLaPlace } from "./reserve.js";
import { laBibliotheque, type BaseSql } from "./registre.js";
import { Hono } from "hono";
import { SESSIONS_EXIGEES, laFacadePeutServir } from "./portes.js";
import {
  NOM_DU_TEMOIN,
  autoriser,
  identifierParSession,
  laSessionDuTemoin,
  repousserSiBesoin,
} from "./porte.js";
import { enroler, ouvrirUnDefi } from "./enrolement.js";
import { entrer } from "./entree.js";
import {
  combienDeCles,
  inscrireUnDroit,
  inscrireUnePersonne,
  lesPersonnes,
  revoquerLaSession,
} from "./qui-entre.js";
import {
  ApercuEnLigne,
  PassagesDuDocument,
  PreuveDEnrolement,
  PreuveDEntree,
  VueBibliotheque,
} from "@lienotheque/contrats";
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
  /** Le compartiment des fichiers. Jamais lu sans laissez-passer vérifié.
   *
   *  `put` ne sert qu'aux vues : les sources et les dérivés sont écrits par la chaîne, qui ne
   *  passe pas par ici. Le Worker n'a donc d'écriture que sur une famille d'objets, et c'est
   *  tout ce qu'il lui faut. */
  readonly MEDIAS?: {
    readonly get: (cle: string, options?: unknown) => Promise<ObjetServi | null>;
    readonly put?: (cle: string, corps: ArrayBuffer | string, options?: unknown) => Promise<unknown>;
  };
  /** Le registre des bibliothèques publiées. */
  readonly REGISTRE?: BaseSql;
  /** La bibliothèque que la façade sert. Une seule : la façade existe pour une application qui
   *  n'en connaît qu'une, et lui en proposer plusieurs serait lui demander de changer. */
  readonly BIBLIOTHEQUE_FACADE?: string;
  /** L'origine exacte de la page qui mène les cérémonies : schéma, hôte et port, telle qu'un
   *  navigateur l'écrit.
   *
   *  **Posée à la main, jamais lue dans la requête.** La lire dans l'en-tête `Origin` rendrait la
   *  vérification vide de sens : c'est précisément ce qu'un attaquant contrôle. Et ce n'est pas
   *  l'origine du Worker : la page vit ailleurs.
   *
   *  Aucun exemple écrit ici : un test balaie les sources et refuse toute adresse distante autre
   *  que celle du modèle, et il a raison — un exemple ne se distingue pas d'une vraie adresse. */
  readonly ORIGINE_CEREMONIE?: string;
  /** Le domaine, et lui seul, pour lequel les clés sont enrôlées — sans schéma ni port.
   *
   *  L'appareil l'inclut dans ce qu'il signe, et c'est la garde contre une signature prise sur un
   *  site voisin. Posé à la main, pour la même raison que l'origine. */
  readonly DOMAINE_CEREMONIE?: string;
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
  /** Les sessions personnelles sont-elles exigées pour entrer par la façade ?
   *
   *  La valeur vient de `portes.ts` ; cette option existe pour que les tests éprouvent **les deux
   *  positions**. Sans quoi on ne saurait de la bascule que ce qu'on en suppose.
   *
   *  Ce n'est pas un réglage d'hébergement : la bascule est une décision, donc une ligne de code
   *  qu'on change et qu'on déploie, pas une variable qu'on pousse un soir. */
  readonly sessionsExigees?: boolean;
};

/** Application Hono de l'API Liénothèque.
 *
 *  Deux routes au-delà de la santé, et une seule porte : un jeton d'accès exigé, comparé sans
 *  laisser le temps de réponse dire où il diffère. Tout ce qui entre et tout ce qui sort est
 *  validé par son contrat (règle 2). */
export function creerApp({
  maintenant = () => new Date(),
  lecteur = lireParModele,
  compteur = compterParModele,
  sessionsExigees = SESSIONS_EXIGEES,
}: Options = {}): Hono<{
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

    // L'horloge injectée, et non `Date.now()`. L'application en a une pour que ses routes
    // s'éprouvent à un instant choisi ; cette route-ci l'ignorait, et c'est le seul endroit qui
    // le faisait. En production la valeur est la même — l'horloge par défaut est l'horloge.
    const verdict = await verifier(secret, contexte.req.param("laissez"), Math.floor(maintenant().getTime() / 1000));
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
  /** La porte des routes de lecture : **une porte ou l'autre, jamais les deux.**
   *
   *  Tant que les sessions ne sont pas exigées, le jeton de service ouvre — c'est l'état
   *  d'aujourd'hui. Le jour où elles le sont, il cesse d'ouvrir ces routes, et seule la session
   *  compte. Deux serrures dont une seule est vérifiée seraient pires qu'une : le jour où l'une
   *  cède, rien ne dirait laquelle a servi.
   *
   *  L'ordre est celui de la règle du 10 octobre : on identifie **avant** de lire le moindre
   *  réglage, de sorte qu'un appelant anonyme n'apprenne pas si la façade est configurée.
   *
   *  Rend `undefined` quand la porte s'ouvre — un refus est une réponse, et il n'y a rien à
   *  rendre quand il n'y a pas de refus. */
  const porteParBascule = async (
    contexte: { env: Liaisons; req: { raw: Request } },
    action: string,
  ): Promise<Response | undefined> => {
    if (!sessionsExigees) {
      const attendu = contexte.env.JETON_ACCES;
      if (attendu === undefined || attendu.length === 0)
        return Response.json({ erreur: "Jeton refusé" }, { status: 401 });
      const donne = contexte.req.raw.headers.get("x-api-key") ?? undefined;
      if (donne === undefined || !memeJeton(donne, attendu))
        return Response.json({ erreur: "Jeton refusé" }, { status: 401 });
      return undefined;
    }

    const registre = contexte.env.REGISTRE;
    if (registre === undefined) return Response.json({ erreur: "Accès refusé." }, { status: 401 });

    // Premier temps : aucun réglage n'est lu, donc rien n'est appris.
    const qui = await identifierParSession(registre, contexte.req.raw.headers, maintenant().toISOString());
    if (!qui.ouverte) return Response.json({ erreur: qui.mot }, { status: qui.statut });

    const cle = contexte.env.BIBLIOTHEQUE_FACADE;
    if (cle === undefined || cle.length === 0)
      return Response.json({ erreur: "La façade n'est pas configurée" }, { status: 503 });

    // Second temps : le droit, maintenant qu'on sait sur quoi.
    const droit = await autoriser(registre, qui.personneId, cle, action);
    if (!droit.ouverte) return Response.json({ erreur: droit.mot }, { status: droit.statut });

    await repousserSiBesoin(registre, qui.session, maintenant().toISOString());
    return undefined;
  };

  const ouvrirFacade = async (contexte: {
    env: Liaisons;
    req: { raw: Request };
  }): Promise<{ base: BaseSql; correspondance: Correspondance } | Response> => {
    // La porte d'abord, la configuration ensuite.
    //
    // L'inverse — vérifier la configuration avant le jeton — apprenait à un appelant anonyme si
    // la façade est configurée, et sur quelle bibliothèque elle bute. C'est le même principe que
    // les refus indiscernables des droits : qui n'a pas le jeton n'apprend rien, pas même
    // l'état du service. Le défaut s'est vu en éprouvant les routes par-dessus le réseau, pas
    // dans les tests — ils passaient tous, chacun regardant une question à la fois.
    const refus = await porteParBascule(contexte, "chercher");
    if (refus !== undefined) return refus;

    const registre = contexte.env.REGISTRE;
    const cle = contexte.env.BIBLIOTHEQUE_FACADE;
    if (cle === undefined || cle.length === 0 || registre === undefined)
      return Response.json({ erreur: "La façade n'est pas configurée" }, { status: 503 });

    // Tant que personne n'est identifié, la façade ne sert qu'une bibliothèque d'essai.
    //
    // Le même mot de refus que pour toute autre indisponibilité, et **après** le jeton : un
    // appelant n'apprend ni qu'une bibliothèque existe, ni pourquoi elle lui est refusée.
    if (!laFacadePeutServir(cle)) return Response.json({ erreur: "Bibliothèque indisponible" }, { status: 503 });

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

  /** Sert un objet de vue, tel qu'il a été rangé (étape 6 d'E5, scénario B).
   *
   *  **Rien n'est rebâti ici.** `instantane.ts` construit la vue à l'ingestion, et une seconde
   *  mise en œuvre serait une seconde vérité — celle des deux qui finirait par mentir. La
   *  recherche en ligne fait ensuite tourner le **même** `chercher` sur la **même** vue, de sorte
   *  que les résultats soient identiques par construction et non par ressemblance.
   *
   *  Trois objets : l'aperçu de la bibliothèque — sa liste et ses classements, toujours demandés
   *  ensemble —, puis la vue et les passages **de chaque document**, nommés par son empreinte.
   *
   *  L'absence d'un objet rend **404**, que l'application lit comme un dépôt vide — l'état de
   *  quiconque n'a rien importé. C'est déjà la convention du greffon de Vite côté bureau.
   *
   *  La clé n'est jamais composée ici : `objets.ts` la compose et **refuse** une empreinte qui
   *  n'en est pas une. Une empreinte reçue d'une requête ne peut donc pas devenir un chemin. */
  const servirUnObjet = async (
    contexte: { env: Liaisons; req: { raw: Request } },
    quelleCle: (bibliotheque: string) => string | undefined,
  ): Promise<Response> => {
    const refus = await porteParBascule(contexte, "lire");
    if (refus !== undefined) return refus;

    const compartiment = contexte.env.MEDIAS;
    const bibliotheque = contexte.env.BIBLIOTHEQUE_FACADE;
    if (compartiment === undefined || bibliotheque === undefined || bibliotheque.length === 0)
      return Response.json({ erreur: "Le service de fichiers n'est pas configuré" }, { status: 503 });

    const cle = quelleCle(bibliotheque);
    if (cle === undefined) return Response.json({ erreur: "Demande refusée" }, { status: 400 });

    const objet = await compartiment.get(cle);
    if (objet === null || objet.body === null) return Response.json({ erreur: "Rien à lire" }, { status: 404 });

    return new Response(objet.body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...(objet.httpEtag === undefined ? {} : { etag: objet.httpEtag }),
        // Jamais de cache partagé : une vue dit ce qu'une personne a le droit de voir.
        "cache-control": "private, no-store",
      },
    });
  };

  app.get("/vue/apercu", (contexte) => servirUnObjet(contexte, (bib) => cleVue(bib, "apercu.json")));
  app.get("/vue/document/:empreinte", (contexte) =>
    servirUnObjet(contexte, (bib) => cleVueDeDocument(bib, contexte.req.param("empreinte"))),
  );
  app.get("/vue/document/:empreinte/passages", (contexte) =>
    servirUnObjet(contexte, (bib) => clePassagesDeDocument(bib, contexte.req.param("empreinte"))),
  );

  /** Range un objet de vue, au moment où une version s'active.
   *
   *  **Derrière le jeton de service, et lui seul.** C'est un appel de machine à machine : la
   *  chaîne de traitement tourne sur la machine de l'ingestion, pas dans un navigateur, et elle
   *  n'a pas de session personnelle à présenter. C'est exactement l'usage pour lequel le jeton de
   *  service existe — comme `/vision`.
   *
   *  **Au moment de l'activation, pas sur un intervalle.** Une vue poussée toutes les heures
   *  serait périmée cinquante-neuf minutes sur soixante sans que personne sache de combien ;
   *  poussée à l'activation, elle est aussi fraîche que la dernière activation, et jamais plus
   *  périmée que ce que le bureau montre lui-même.
   *
   *  L'objet est **validé avant d'être rangé**. Ranger ce qu'on ne saurait pas relire reporterait
   *  la panne au moment de la lecture, c'est-à-dire chez le lecteur, le jour où il ouvre la
   *  bibliothèque. Mieux vaut refuser maintenant, à qui peut corriger. */
  const rangerUnObjet = async (
    contexte: { env: Liaisons; req: { raw: Request; json: () => Promise<unknown> } },
    quelleCle: (bibliotheque: string) => string | undefined,
    valider: (brut: unknown) => { success: true; data: unknown } | { success: false; error: { issues: readonly { path: readonly (string | number | symbol)[]; message: string }[] } },
  ): Promise<Response> => {
    const attendu = contexte.env.JETON_ACCES;
    if (attendu === undefined || attendu.length === 0)
      return Response.json({ erreur: "Jeton refusé" }, { status: 401 });
    const donne = contexte.req.raw.headers.get("x-api-key") ?? undefined;
    if (donne === undefined || !memeJeton(donne, attendu))
      return Response.json({ erreur: "Jeton refusé" }, { status: 401 });

    const compartiment = contexte.env.MEDIAS;
    const bibliotheque = contexte.env.BIBLIOTHEQUE_FACADE;
    if (compartiment?.put === undefined || bibliotheque === undefined || bibliotheque.length === 0)
      return Response.json({ erreur: "Le service de fichiers n'est pas configuré" }, { status: 503 });

    const cle = quelleCle(bibliotheque);
    if (cle === undefined) return Response.json({ erreur: "Demande refusée" }, { status: 400 });

    let brut: unknown;
    try {
      brut = await contexte.req.json();
    } catch {
      return Response.json({ erreur: "Corps illisible" }, { status: 400 });
    }

    const lu = valider(brut);
    if (!lu.success)
      return Response.json(
        {
          erreur: "Vue refusée",
          ecarts: lu.error.issues.slice(0, 5).map((souci) => `${souci.path.join(".")} : ${souci.message}`),
        },
        { status: 400 },
      );

    // Ce qui est rangé est ce que le contrat a rendu, et non les octets reçus : les défauts du
    // contrat sont ainsi appliqués une fois, à l'écriture, et non à chaque lecture.
    await compartiment.put(cle, JSON.stringify(lu.data), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    return Response.json({ rangee: true });
  };

  app.put("/vue/apercu", (contexte) =>
    rangerUnObjet(contexte, (bib) => cleVue(bib, "apercu.json"), (brut) => ApercuEnLigne.safeParse(brut)),
  );
  app.put("/vue/document/:empreinte", (contexte) =>
    rangerUnObjet(
      contexte,
      (bib) => cleVueDeDocument(bib, contexte.req.param("empreinte")),
      (brut) => VueBibliotheque.safeParse(brut),
    ),
  );
  app.put("/vue/document/:empreinte/passages", (contexte) =>
    rangerUnObjet(
      contexte,
      (bib) => clePassagesDeDocument(bib, contexte.req.param("empreinte")),
      (brut) => PassagesDuDocument.safeParse(brut),
    ),
  );

  /** Un nom de dérivé, tel qu'une version en produit : des minuscules, des chiffres, des
   *  points, des tirets, et des barres obliques pour les paliers.
   *
   *  Volontairement étroit, et vérifié **avant** toute composition de clé. R2 ne résout pas les
   *  chemins — « .. » y serait un segment comme un autre, pas une remontée — mais une clé qui
   *  ressemble à une remontée finit par être lue par quelque chose qui, lui, la résout : un
   *  cache, un miroir, un outil d'inspection. Mieux vaut qu'elle n'existe jamais.
   *
   *  Ni majuscule ni espace : les noms sont composés par nous, et un nom qui s'en écarte est le
   *  signe que quelqu'un d'autre l'a composé. */
  const NOM_DE_DERIVE = /^[a-z0-9][a-z0-9.\-]*(\/[a-z0-9][a-z0-9.\-]*)*$/;
  const IDENTIFIANT_DE_VERSION = /^[a-z0-9][a-z0-9-]{0,63}$/;

  /** Signe un laissez-passer pour une image de page (SEC-05).
   *
   *  **La clé de l'objet est composée ici**, à partir de la clé de la bibliothèque, et jamais
   *  reçue : c'est la règle d'`objets.ts`, et c'est elle qui tient l'isolation des fichiers,
   *  puisqu'un seul compartiment les porte toutes. L'appelant donne une version et un nom ; il ne
   *  désigne pas un chemin.
   *
   *  La porte est celle de la bascule — la même que la façade, et pas une seconde inventée pour
   *  l'occasion. Elle est franchie **avant** qu'on regarde le corps : un corps absurde présenté
   *  sans porte doit rendre un refus de porte, sans quoi un inconnu apprendrait ce que la route
   *  attend. */
  app.post("/laissez", async (contexte) => {
    const refus = await porteParBascule(contexte, "ouvrir_fichier");
    if (refus !== undefined) return refus;

    const secret = contexte.env.SECRET_LAISSEZ;
    const cle = contexte.env.BIBLIOTHEQUE_FACADE;
    if (secret === undefined || secret.length === 0 || cle === undefined || cle.length === 0)
      return contexte.json({ erreur: "Le service de fichiers n'est pas configuré" }, 503);

    const corps = await corpsObjet(contexte);
    const version = corps["version"];
    const fichier = corps["fichier"];
    if (typeof version !== "string" || !IDENTIFIANT_DE_VERSION.test(version))
      return contexte.json({ erreur: "Demande refusée" }, 400);
    if (typeof fichier !== "string" || fichier.length > 200 || !NOM_DE_DERIVE.test(fichier))
      return contexte.json({ erreur: "Demande refusée" }, 400);

    const jusqua = Math.floor(maintenant().getTime() / 1000) + DUREE_PAR_DEFAUT;
    const laissez = await signer(secret, { bibliotheque: cle, cle: cleDerive(cle, version, fichier), jusqua });
    // Le laissez-passer porte la clé signée ; on ne la répète pas en clair à côté.
    return contexte.json({ laissez, secondes: DUREE_PAR_DEFAUT });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Les cérémonies : entrer, enrôler, amorcer, sortir.
  //
  // Chaque route dit sa porte **dès sa première ligne**, et il n'y en a qu'une par route :
  //
  //   /entree/defi, /entree          aucune — c'est la porte elle-même
  //   /enrolement/defi, /enrolement  session + droit « enroler_cle » (administration)
  //   /amorce/defi, /amorce          jeton de service, **et** aucune clé enrôlée
  //   /session (DELETE)              le témoin seul : se déconnecter n'est pas une autorisation
  // ══════════════════════════════════════════════════════════════════════════

  /** Ce qu'il faut pour mener une cérémonie, ou le refus qui dit ce qui manque.
   *
   *  L'origine et le domaine sont **posés à la main**, jamais lus dans la requête : lire
   *  l'en-tête `Origin` rendrait la vérification vide de sens, puisque c'est exactement ce qu'un
   *  attaquant contrôle. Sans eux, la route refuse d'ouvrir — comme pour les laissez-passer,
   *  l'oubli d'un réglage ne doit pas se solder par une cérémonie permissive. */
  const cadreDeCeremonie = (
    contexte: { env: Liaisons },
  ): { registre: BaseSql; origine: string; domaine: string; maintenant: string } | Response => {
    const registre = contexte.env.REGISTRE;
    const origine = contexte.env.ORIGINE_CEREMONIE;
    const domaine = contexte.env.DOMAINE_CEREMONIE;
    if (registre === undefined || origine === undefined || origine.length === 0 || domaine === undefined || domaine.length === 0)
      return Response.json({ erreur: "La cérémonie n'est pas configurée" }, { status: 503 });
    return { registre, origine, domaine, maintenant: maintenant().toISOString() };
  };

  const corpsObjet = async (contexte: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> => {
    try {
      const lu = await contexte.req.json();
      return typeof lu === "object" && lu !== null ? (lu as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  app.post("/entree/defi", async (contexte) => {
    // Aucune porte : c'est celle-ci qu'on vient ouvrir. Un défi ne vaut qu'avec une clé
    // enrôlée et une signature, et il ne dit rien de ce qui existe.
    const cadre = cadreDeCeremonie(contexte);
    if (cadre instanceof Response) return cadre;

    const ouvert = await ouvrirUnDefi(cadre.registre, { usage: "entree" }, cadre.maintenant);
    if (!ouvert.fait) return contexte.json({ erreur: "Entrée refusée." }, 503);
    return contexte.json({ defi: ouvert.valeur.valeur, domaine: cadre.domaine });
  });

  app.post("/entree", async (contexte) => {
    const cadre = cadreDeCeremonie(contexte);
    if (cadre instanceof Response) return cadre;

    const lue = PreuveDEntree.safeParse(await corpsObjet(contexte));
    // Un corps mal formé rend le **même** mot qu'une signature fausse : qui apprendrait la
    // différence apprendrait où chercher.
    if (!lue.success) return contexte.json({ erreur: "Entrée refusée." }, 401);

    const entree = await entrer(cadre.registre, lue.data, {
      origine: cadre.origine,
      domaine: cadre.domaine,
      maintenant: cadre.maintenant,
    });
    if (!entree.fait) return contexte.json({ erreur: entree.mot }, 401);

    contexte.header("set-cookie", entetTemoin(NOM_DU_TEMOIN, entree.jeton, DUREE_SESSION));
    // Le jeton part dans le témoin et nulle part ailleurs : jamais dans le corps, qu'un journal
    // de navigateur ou une extension pourrait relire.
    return contexte.json({ entre: true });
  });

  app.delete("/session", async (contexte) => {
    const registre = contexte.env.REGISTRE;
    if (registre === undefined) return contexte.json({ ferme: true });

    const session = await laSessionDuTemoin(registre, contexte.req.raw.headers);
    // Le témoin est retiré dans tous les cas, et la réponse est la même : se déconnecter ne doit
    // pas apprendre si l'on était connecté.
    if (session !== undefined && session.revoqueeLe === undefined)
      await revoquerLaSession(registre, session.id, session.personneId, maintenant().toISOString());

    contexte.header("set-cookie", entetRetrait(NOM_DU_TEMOIN));
    return contexte.json({ ferme: true });
  });

  /** La porte des enrôlements : une session, et le droit d'enrôler une clé. */
  const porteDEnrolement = async (contexte: { env: Liaisons; req: { raw: Request } }) => {
    // **La porte avant la configuration**, en deux temps — la règle du 10 octobre.
    //
    // L'ordre inverse était écrit ici, et le Worker déployé l'a montré : « /enrolement/defi »
    // rendait 503 à un inconnu, lui apprenant que la cérémonie n'est pas configurée avant qu'il
    // ait présenté quoi que ce soit. Mesuré sur le service en ligne, pas vu par les tests —
    // ils éprouvaient la porte avec les réglages toujours posés.
    const registre = contexte.env.REGISTRE;
    if (registre === undefined) return Response.json({ erreur: "Accès refusé." }, { status: 401 });

    const maintenantIso = maintenant().toISOString();
    const qui = await identifierParSession(registre, contexte.req.raw.headers, maintenantIso);
    if (!qui.ouverte) return Response.json({ erreur: qui.mot }, { status: qui.statut });

    // Identifié : on peut maintenant parler de configuration sans rien apprendre à un inconnu.
    const cadre = cadreDeCeremonie(contexte);
    if (cadre instanceof Response) return cadre;
    const cle = contexte.env.BIBLIOTHEQUE_FACADE;
    if (cle === undefined || cle.length === 0)
      return Response.json({ erreur: "La cérémonie n'est pas configurée" }, { status: 503 });

    const droit = await autoriser(registre, qui.personneId, cle, "enroler_cle");
    if (!droit.ouverte) return Response.json({ erreur: droit.mot }, { status: droit.statut });

    await repousserSiBesoin(registre, qui.session, maintenantIso);
    return { ...cadre, personneId: qui.personneId };
  };

  app.post("/enrolement/defi", async (contexte) => {
    const porte = await porteDEnrolement(contexte);
    if (porte instanceof Response) return porte;

    // Le défi est lié à **la personne de la session** : on enrôle un appareil de plus pour
    // soi-même. Enrôler pour quelqu'un d'autre est un autre geste, et il n'existe pas encore.
    const ouvert = await ouvrirUnDefi(
      porte.registre,
      { usage: "enrolement", personneId: porte.personneId },
      porte.maintenant,
    );
    if (!ouvert.fait) return contexte.json({ erreur: "Accès refusé." }, 503);
    return contexte.json({ defi: ouvert.valeur.valeur, domaine: porte.domaine });
  });

  app.post("/enrolement", async (contexte) => {
    const porte = await porteDEnrolement(contexte);
    if (porte instanceof Response) return porte;

    const lue = PreuveDEnrolement.safeParse(await corpsObjet(contexte));
    if (!lue.success) return contexte.json({ erreur: "Accès refusé." }, 400);

    const enrole = await enroler(porte.registre, lue.data, {
      origine: porte.origine,
      maintenant: porte.maintenant,
      auteur: porte.personneId,
    });
    // Ici le motif **sort**, et c'est délibéré : l'appelant est une personne identifiée, qui a le
    // droit d'enrôler, et qui a besoin de savoir que son navigateur n'a pas rendu de clé plutôt
    // que de réessayer indéfiniment. Ce n'est pas la même situation qu'une entrée refusée.
    if (!enrole.fait) return contexte.json({ erreur: enrole.raison }, 400);
    return contexte.json({ enrolee: true, appareil: enrole.valeur.appareil ?? null });
  });

  /** L'amorçage se fait en deux temps, et **ce ne sont pas les mêmes portes**.
   *
   *  Le premier accès ne peut pas se donner par une session — il n'en existe aucune. Mais il ne
   *  peut pas non plus se donner par le jeton de service, car c'est un **navigateur** qui doit
   *  mener la cérémonie, et un navigateur n'a pas le droit de porter ce jeton (règle 6, LIV-04).
   *  Les deux routes l'exigeaient : aucune page ne pouvait les franchir, et le défaut n'est
   *  apparu qu'en cherchant qui, concrètement, ferait l'appel.
   *
   *  D'où la division : **le jeton invite, l'invitation entre.**
   *
   *  `ouvrirLInvitation` garde le jeton : émettre une invitation est un geste de machine, et
   *  sans ce secret n'importe qui s'amorcerait.
   *
   *  `tenirLInvitation` n'exige rien d'autre que le **défi**, qui est le titre d'accès lui-même :
   *  imprévisible, à usage unique, périmé en cinq minutes, et nul ne peut en obtenir un sans le
   *  jeton. Une invitation est engendrée par le secret ; elle n'est jamais le secret.
   *
   *  Le défi n'est pas vérifié ici mais dans `enroler`, qui le fait déjà — et **en premier**,
   *  avant de regarder la clé. Un appelant sans invitation s'arrête donc là, et n'apprend rien
   *  de ce qui suit. */
  const ouvrirLInvitation = async (contexte: { env: Liaisons; req: { raw: Request } }) => {
    const attendu = contexte.env.JETON_ACCES;
    if (attendu === undefined || attendu.length === 0) return Response.json({ erreur: "Jeton refusé" }, { status: 401 });
    const donne = contexte.req.raw.headers.get("x-api-key") ?? undefined;
    if (donne === undefined || !memeJeton(donne, attendu)) return Response.json({ erreur: "Jeton refusé" }, { status: 401 });
    return tenirLInvitation(contexte);
  };

  const tenirLInvitation = async (contexte: { env: Liaisons }) => {
    const cadre = cadreDeCeremonie(contexte);
    if (cadre instanceof Response) return cadre;

    // Dès qu'une clé existe, l'amorçage est clos pour toujours. Le dire à un appelant anonyme
    // n'apprend que ceci : la bibliothèque a été mise en service. Qui voit la page le sait déjà.
    if ((await combienDeCles(cadre.registre)) > 0)
      return Response.json({ erreur: "L'amorçage est clos." }, { status: 409 });
    return cadre;
  };

  app.post("/amorce/defi", async (contexte) => {
    const porte = await ouvrirLInvitation(contexte);
    if (porte instanceof Response) return porte;

    const corps = await corpsObjet(contexte);
    const nom = typeof corps["nom"] === "string" ? corps["nom"] : "";

    // Une personne peut déjà exister si un amorçage a été commencé puis abandonné : on la reprend
    // plutôt que d'en créer une seconde qui n'aurait jamais de clé.
    const dejaLa = await lesPersonnes(porte.registre);
    const personne =
      dejaLa[0] ??
      (await (async () => {
        const fait = await inscrireUnePersonne(porte.registre, nom, porte.maintenant, "amorçage");
        if (!fait.fait) return undefined;
        return fait.valeur;
      })());
    if (personne === undefined) return contexte.json({ erreur: "Amorçage refusé : il faut un nom." }, 400);

    const cle = contexte.env.BIBLIOTHEQUE_FACADE;
    if (cle === undefined || cle.length === 0)
      return contexte.json({ erreur: "La cérémonie n'est pas configurée" }, 503);
    // Le premier accès reçoit l'administration : sans quoi personne ne pourrait enrôler le second.
    await inscrireUnDroit(
      porte.registre,
      { personneId: personne.id, bibliotheque: cle, niveau: "administration" },
      porte.maintenant,
      "amorçage",
    );

    const ouvert = await ouvrirUnDefi(
      porte.registre,
      { usage: "enrolement", personneId: personne.id },
      porte.maintenant,
    );
    if (!ouvert.fait) return contexte.json({ erreur: "Amorçage refusé." }, 503);
    return contexte.json({ defi: ouvert.valeur.valeur, domaine: porte.domaine, personne: personne.nom });
  });

  app.post("/amorce", async (contexte) => {
    // Le défi seul : c'est l'invitation qui ouvre, et elle a été émise par le jeton.
    const porte = await tenirLInvitation(contexte);
    if (porte instanceof Response) return porte;

    const lue = PreuveDEnrolement.safeParse(await corpsObjet(contexte));
    if (!lue.success) return contexte.json({ erreur: "Amorçage refusé." }, 400);

    const enrole = await enroler(porte.registre, lue.data, {
      origine: porte.origine,
      maintenant: porte.maintenant,
      auteur: "amorçage",
    });
    if (!enrole.fait) return contexte.json({ erreur: enrole.raison }, 400);
    return contexte.json({ enrolee: true });
  });

  app.notFound((contexte) => contexte.json({ erreur: "Route inconnue" }, 404));

  return app;
}
