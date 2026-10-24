import {
  ApercuEnLigne,
  PassagesDuDocument,
  TraductionDePage,
  VueBibliotheque,
  type ApercuDocument,
  type ClassementLocal,
} from "@lienotheque/contrats";
import type { PortDeLecture } from "./port.js";

/** Le pont de la version en ligne : le même port, la façade Worker derrière (scénario B).
 *
 *  ## Ce qu'il sert, et d'où
 *
 *  La vue **n'est pas rebâtie** : `instantane.ts` la construit à l'ingestion, elle est rangée
 *  comme objet, et le Worker la sert telle quelle. La recherche en ligne fait donc tourner le
 *  **même `chercher` sur la même vue** — les résultats sont identiques par construction, et non
 *  par ressemblance. Une seconde mise en œuvre de la vue serait une seconde vérité, et celle des
 *  deux qui finirait par mentir.
 *
 *  Trois objets :
 *
 *  | objet | ce qu'il porte |
 *  |---|---|
 *  | `/vue/apercu` | la liste des documents **et** leurs classements, toujours demandés ensemble |
 *  | `/vue/document/<empreinte>` | la vue de ce document |
 *  | `/vue/document/<empreinte>/passages` | son texte, en entrée à part |
 *
 *  **L'aperçu porte la version active de chaque document**, ce qui suffit à résoudre l'image
 *  d'une page : `versionActive` est donc une lecture dans l'aperçu, et non un objet de plus.
 *
 *  ## Ce qu'il ne fait pas, et le dit
 *
 *  `classerDocument` refuse, avec un mot qui nomme la raison. Classer en ligne demanderait
 *  d'écrire un fait que l'instantané porte aussi, et les deux ne seraient d'accord qu'entre deux
 *  publications — la double vérité qu'on a justement éliminée. La décision est prise : le
 *  classement reste un geste de bureau.
 *
 *  ## Le témoin voyage, et rien d'autre
 *
 *  Chaque appel part avec `credentials: "include"` : la session vit dans un témoin `HttpOnly`,
 *  qu'aucun script ne lit — pas même celui-ci. Il n'y a donc **aucun jeton à manipuler ici**, et
 *  c'est tout l'intérêt (LIV-04 : aucune clé dans le navigateur).
 *
 *  ## Un coût assumé, et nommé
 *
 *  `apercuDeBibliotheque`, `versionActive` et `classementsDeBibliotheque` lisent le **même**
 *  objet, et chacune le demande. Aucun cache ici : un cache figerait une liste que la
 *  publication peut changer, et la staleness serait pire que l'appel. Le vrai remède est côté
 *  écran — `App.tsx` tient déjà la liste des documents en mémoire quand il demande
 *  `versionActive`, et pourrait y lire la version plutôt que de la redemander. C'est une
 *  modification d'écran, pas de pont. */

/** Ce qu'une fonction du port en ligne lève quand elle ne servira pas.
 *
 *  Nommée, parce qu'un écran doit pouvoir la reconnaître et dire « pas en ligne » plutôt que
 *  « une erreur est survenue ». */
export class PasEnLigne extends Error {
  constructor(geste: string, pourquoi: string) {
    super(`« ${geste} » ne se fait pas en ligne : ${pourquoi}`);
    this.name = "PasEnLigne";
  }
}

/** Ce que le service répond quand personne n'est identifié — et qu'aucun script ne peut deviner.
 *
 *  Le témoin de session est `HttpOnly` **par conception** : la page ne le lit pas, et ne saura
 *  donc jamais d'elle-même si quelqu'un est entré. Elle l'apprend en demandant et en se faisant
 *  refuser. Levée nommée plutôt qu'« une erreur est survenue », parce que l'écran doit pouvoir
 *  conduire à la cérémonie plutôt que d'afficher une panne : ne pas être entré n'est pas une
 *  panne, c'est l'état de tout le monde avant d'entrer. */
export class PasIdentifie extends Error {
  constructor() {
    super("Personne n'est identifié ici.");
    this.name = "PasIdentifie";
  }
}

/** Ce que le pont en ligne a besoin de savoir pour appeler le service. */
export type Adresse = {
  /** La racine du service, sans barre oblique finale. */
  readonly base: string;
  /** De quoi appeler, remplaçable pour que les épreuves tournent sans réseau. */
  readonly appeler?: typeof fetch;
};

const sansFin = (base: string): string => base.replace(/\/+$/, "");

export function pontEnLigne({ base, appeler = fetch }: Adresse): PortDeLecture {
  const racineDuService = sansFin(base);

  /** Un appel au service, avec le témoin et rien d'autre.
   *
   *  Rend `undefined` sur 404 : c'est l'état « rien n'a été rangé », que l'application lit comme
   *  un dépôt vide — la même convention qu'au bureau, où l'absence d'instantané rend un 404.
   *  Tout autre échec lève, parce qu'un service en panne n'est pas une bibliothèque vide. */
  const demander = async (chemin: string, options: RequestInit = {}): Promise<unknown | undefined> => {
    const reponse = await appeler(`${racineDuService}${chemin}`, {
      ...options,
      credentials: "include",
      headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...options.headers },
    });
    if (reponse.status === 404) return undefined;
    // Un 401 n'est pas une panne et n'est pas une bibliothèque vide : c'est « entrez d'abord ».
    // Le confondre avec l'un ou l'autre menait exactement au défaut du 20 octobre — un écran de
    // premier lancement servi à quelqu'un qui avait simplement oublié d'entrer.
    if (reponse.status === 401) throw new PasIdentifie();
    if (!reponse.ok) throw new Error(`Le service a refusé « ${chemin} » (${reponse.status}).`);
    return reponse.json();
  };

  /** L'aperçu, passé par son contrat. Absent, la bibliothèque est vide — et c'est un état, pas
   *  une panne : personne n'a encore publié. */
  const apercu = async (): Promise<ApercuEnLigne | undefined> => {
    const brut = await demander("/vue/apercu");
    return brut === undefined ? undefined : ApercuEnLigne.parse(brut);
  };

  return {
    apercuDeBibliotheque: async (): Promise<readonly ApercuDocument[]> => (await apercu())?.documents ?? [],

    /** La version active d'un document, lue dans l'aperçu.
     *
     *  Pas d'objet de plus : `ApercuDocument` porte déjà sa version — « un aperçu décrit un état,
     *  pas un document en général ». */
    versionActive: async (_racine: string, empreinte: string): Promise<string | undefined> => {
      const vu = await apercu();
      return vu?.documents.find((un) => un.empreinte === empreinte)?.version;
    },

    /** Les classements, en carte par empreinte — la forme que les écrans attendent.
     *
     *  Ils voyagent en liste, chacun portant son empreinte : on ne transporte pas deux fois la
     *  même clé, et la carte se reconstruit à l'arrivée. */
    classementsDeBibliotheque: async (): Promise<ReadonlyMap<string, ClassementLocal>> => {
      const vu = await apercu();
      return new Map((vu?.classements ?? []).map((un) => [un.empreinte, un]));
    },

    vueDeDocument: async (_racine: string, empreinte: string) => {
      const brut = await demander(`/vue/document/${encodeURIComponent(empreinte)}`);
      return brut === undefined ? undefined : VueBibliotheque.parse(brut);
    },

    /** Les passages, en entrée **à part** de la vue.
     *
     *  Le contrat le dit : « recopier les passages dedans donnerait deux endroits pour un même
     *  fait, et l'un des deux finirait par mentir ». La séparation vaut aussi sur le réseau.
     *
     *  Le contrat de **liste** est employé, et non chaque passage séparément : lui seul vérifie
     *  que les rangs se suivent, et un trou dans les rangs est ce qu'un transport perd. */
    passagesDeDocument: async (_racine: string, empreinte: string) => {
      const brut = await demander(`/vue/document/${encodeURIComponent(empreinte)}/passages`);
      if (brut === undefined) return [];
      if (!Array.isArray(brut)) throw new Error("Les passages servis ne sont pas une liste.");
      return PassagesDuDocument.parse(brut);
    },

    /** L'adresse d'une image de page, ouverte par un laissez-passer signé (SEC-05).
     *
     *  Le service compose la clé de l'objet lui-même, à partir de la clé de la bibliothèque : on
     *  lui donne une version et un nom, jamais un chemin. Le laissez-passer vaut trois
     *  minutes — assez pour que le navigateur charge l'image, trop peu pour qu'une adresse
     *  recopiée serve encore demain. */
    imageDePage: async (_racine: string, version: string, fichier: string) => {
      const brut = await demander("/laissez", { method: "POST", body: JSON.stringify({ version, fichier }) });
      if (brut === null || typeof brut !== "object") return undefined;
      const { laissez } = brut as Record<string, unknown>;
      if (typeof laissez !== "string" || laissez.length === 0) return undefined;
      return `${racineDuService}/fichier/${laissez}`;
    },

    traduirePage: async (_racine: string, version: string, page: number) => {
      const brut = await demander("/traduction/page", {
        method: "POST",
        body: JSON.stringify({ version, page }),
      });
      if (brut === undefined) throw new Error("Aucun texte canonique n'est disponible pour cette page.");
      return TraductionDePage.parse(brut);
    },

    /** Classer ne se fait pas en ligne, et ce n'est pas un manque à combler.
     *
     *  Le classement vivrait alors à deux endroits — ce que la route écrirait, et ce que
     *  l'instantané porte — d'accord seulement entre deux publications. C'est la double vérité
     *  qu'on a éliminée en servant l'instantané plutôt qu'en le rebâtissant. */
    classerDocument: (): Promise<void> => {
      throw new PasEnLigne(
        "classerDocument",
        "le classement vivrait à deux endroits, l'instantané et la base, d'accord seulement entre deux publications.",
      );
    },
  };
}
