import { PassagesDuDocument, VueBibliotheque, type ApercuDocument, type ClassementLocal } from "@lienotheque/contrats";
import type { PortDeLecture } from "./port.js";

/** Le pont de la version en ligne : le même port, la façade Worker derrière.
 *
 *  ## Ce qu'il sert, et d'où
 *
 *  La vue **n'est pas rebâtie** : `instantane.ts` la construit à l'ingestion, elle est rangée
 *  comme objet, et le Worker la sert telle quelle. La recherche en ligne fait donc tourner le
 *  **même `chercher` sur la même vue** — les résultats sont identiques par construction, et non
 *  par ressemblance. Une seconde mise en œuvre de la vue serait une seconde vérité, et celle des
 *  deux qui finirait par mentir.
 *
 *  ## Ce qu'il ne sert pas encore, et le dit
 *
 *  Quatre fonctions du port refusent, avec un mot qui nomme la raison. Elles demandent un
 *  découpage des objets par document — un aperçu, une vue et des passages par empreinte — et ce
 *  découpage dépend de ce que les écrans montreront en ligne, question ouverte et tranchée à
 *  part.
 *
 *  **Elles refusent plutôt que de rendre une liste vide.** Une liste vide se confond avec une
 *  bibliothèque vide, et un écran qui n'affiche rien sans dire pourquoi coûte des heures à
 *  diagnostiquer. C'est la même raison qui fait qu'un enrôlement sans clé échoue en le disant.
 *
 *  ## Le témoin voyage, et rien d'autre
 *
 *  Chaque appel part avec `credentials: "include"` : la session vit dans un témoin `HttpOnly`,
 *  qu'aucun script ne lit — pas même celui-ci. Il n'y a donc **aucun jeton à manipuler ici**, et
 *  c'est tout l'intérêt (LIV-04 : aucune clé dans le navigateur). */

/** Ce qu'une fonction du port en ligne lève quand elle ne peut pas encore répondre.
 *
 *  Nommée, parce qu'un écran doit pouvoir la reconnaître et dire « pas encore en ligne » plutôt
 *  que « une erreur est survenue ». */
export class PasEncoreEnLigne extends Error {
  constructor(geste: string) {
    super(`« ${geste} » n'est pas encore servi en ligne : les objets ne sont pas découpés par document.`);
    this.name = "PasEncoreEnLigne";
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
    if (!reponse.ok) throw new Error(`Le service a refusé « ${chemin} » (${reponse.status}).`);
    return reponse.json();
  };

  return {
    /** La vue de la bibliothèque, telle qu'elle a été rangée.
     *
     *  L'empreinte est ignorée aujourd'hui : un seul objet de vue est servi, et feindre de
     *  choisir parmi plusieurs serait mentir sur ce qu'on sait faire. Le jour où les objets
     *  seront découpés par document, c'est ici que l'empreinte entrera. */
    vueDeDocument: async (_racine: string, _empreinte: string) => {
      const brut = await demander("/vue");
      return brut === undefined ? undefined : VueBibliotheque.parse(brut);
    },

    /** Les passages, en entrée **à part** de la vue.
     *
     *  Le contrat le dit : « recopier les passages dedans donnerait deux endroits pour un même
     *  fait, et l'un des deux finirait par mentir ». La séparation vaut aussi sur le réseau, et
     *  c'est pourquoi il y a deux objets et deux routes. */
    passagesDeDocument: async (_racine: string, _empreinte: string) => {
      const brut = await demander("/vue/passages");
      if (brut === undefined) return [];
      // Le message d'abord, le contrat ensuite : « ce n'est pas une liste » se diagnostique en
      // un coup d'œil, là où l'écart d'un contrat de tableau se lit moins vite.
      if (!Array.isArray(brut)) throw new Error("Les passages servis ne sont pas une liste.");
      // Le contrat de **liste**, et non chaque passage séparément : lui seul vérifie que les
      // rangs se suivent, et un trou dans les rangs est exactement ce qu'un transport perd.
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

    // ── Ce qui attend le découpage par document ───────────────────────────────
    apercuDeBibliotheque: (): Promise<readonly ApercuDocument[]> => {
      throw new PasEncoreEnLigne("apercuDeBibliotheque");
    },
    versionActive: (): Promise<string | undefined> => {
      throw new PasEncoreEnLigne("versionActive");
    },
    classementsDeBibliotheque: (): Promise<ReadonlyMap<string, ClassementLocal>> => {
      throw new PasEncoreEnLigne("classementsDeBibliotheque");
    },
    classerDocument: (): Promise<void> => {
      throw new PasEncoreEnLigne("classerDocument");
    },
  };
}
