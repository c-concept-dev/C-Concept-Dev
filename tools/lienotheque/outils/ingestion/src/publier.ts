import type { Passage, VueBibliotheque } from "@lienotheque/contrats";

/** Publier la vue d'une bibliothèque, au moment où une version s'active.
 *
 *  La route `PUT /vue` existait et **personne ne l'appelait** — le même écart entre capacité et
 *  pratique que `signer`, qui n'avait aucun appelant avant l'étape 5. Ce module le ferme.
 *
 *  ## Le jeton de service, et pas une session
 *
 *  C'est un appel de machine à machine : la chaîne de traitement tourne sur la machine de
 *  l'ingestion, pas dans un navigateur, et n'a aucune session personnelle à présenter. C'est
 *  exactement l'usage pour lequel le jeton de service existe.
 *
 *  Le jeton est **passé en argument** et jamais lu ici : `jetonDacces()` sait déjà où il vit, et
 *  un second endroit qui le chercherait serait un second endroit à corriger le jour où il
 *  déménage. Il n'apparaît dans aucune valeur rendue — une raison d'échec finit dans un journal
 *  de sortie, qui finit dans un rapport.
 *
 *  ## Deux objets, deux écritures, aucune atomicité
 *
 *  La vue et les passages sont deux objets — le contrat les sépare, et le réseau aussi. Il n'y a
 *  donc **aucun moyen de les poser d'un seul geste**, et une fenêtre existe entre les deux.
 *
 *  Ce qu'on peut faire, et qui est fait : choisir l'ordre, et refuser de taire une moitié.
 *
 *  **Les passages d'abord, la vue ensuite.** La vue est ce que l'application exige — son absence
 *  vaut « dépôt vide ». Des passages en avance ne servent à personne tant que la vue ne les cite
 *  pas ; une vue en avance, elle, citerait des passages qui ne sont pas encore là.
 *
 *  Si la seconde écriture échoue, la bibliothèque en ligne est dans un état mêlé, et la valeur
 *  rendue le dit : quelle moitié a été posée, et qu'il faut relancer. C'est sans danger —
 *  les objets sont remplacés, jamais accumulés, donc republier est idempotent. */

export type Publication =
  | { readonly faite: true; readonly pages: number; readonly passages: number }
  | { readonly faite: false; readonly raison: string };

const sansFin = (adresse: string): string => adresse.trim().replace(/\/+$/, "");

const lisible = (souci: unknown): string => (souci instanceof Error ? souci.message : String(souci));

/** Publie la vue et ses passages. `appeler` est remplaçable pour que les épreuves tournent sans
 *  réseau — c'est la seule façon d'éprouver la moitié posée. */
export async function publierLaVue(
  service: string,
  jeton: string,
  contenu: { readonly vue: VueBibliotheque; readonly passages: readonly Passage[] },
  appeler: typeof fetch = fetch,
): Promise<Publication> {
  const racine = sansFin(service);
  if (racine.length === 0 || !/^https?:\/\/[^\s/]+/.test(racine))
    return { faite: false, raison: `Adresse de service inutilisable : « ${service.trim()} ».` };
  if (jeton.length === 0)
    return { faite: false, raison: "Aucun jeton de service : rien n'a été posé." };

  const ranger = async (chemin: string, corps: unknown): Promise<string | undefined> => {
    try {
      const reponse = await appeler(`${racine}${chemin}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "x-api-key": jeton },
        body: JSON.stringify(corps),
      });
      // Le corps de la réponse n'est pas relayé : il peut citer ce qu'on a envoyé, et on dit ce
      // qui s'est passé plutôt que ce qu'on a lu.
      return reponse.ok ? undefined : `le service a répondu ${reponse.status}`;
    } catch (souci) {
      return lisible(souci);
    }
  };

  const surLesPassages = await ranger("/vue/passages", contenu.passages);
  if (surLesPassages !== undefined)
    return { faite: false, raison: `Les passages n'ont pas été posés — ${surLesPassages}. Rien n'a été posé.` };

  const surLaVue = await ranger("/vue", contenu.vue);
  if (surLaVue !== undefined)
    return {
      faite: false,
      raison:
        `La vue n'a pas été posée — ${surLaVue}. Les passages ont été posés : la bibliothèque en ` +
        `ligne est dans un état mêlé jusqu'à relancer la publication.`,
    };

  return { faite: true, pages: contenu.vue.pages.length, passages: contenu.passages.length };
}
