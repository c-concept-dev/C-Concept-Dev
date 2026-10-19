import {
  ApercuEnLigne,
  type ApercuDocument,
  type ClassementLocal,
  type Passage,
  type VueBibliotheque,
} from "@lienotheque/contrats";

/** Publier un document, au moment où sa version s'active (scénario B).
 *
 *  La route `PUT /vue/...` existait et **personne ne l'appelait** — le même écart entre capacité
 *  et pratique que `signer`, qui n'avait aucun appelant avant l'étape 5. Ce module le ferme.
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
 *  ## Trois écritures, et l'ordre n'est pas indifférent
 *
 *  Les passages, puis la vue, puis l'aperçu. **L'objet qui référence les autres va en dernier**,
 *  parce qu'un document annoncé à l'aperçu mais pas encore rangé donnerait un 404 à qui le
 *  choisirait dans le Catalogue.
 *
 *  Il n'y a **aucune atomicité** entre trois objets, et aucun moyen d'en obtenir une ici. Ce
 *  qu'on peut faire est de choisir l'ordre et de refuser de taire une moitié : chaque échec dit
 *  ce qui a été posé avant lui. Republier est sans danger — les objets sont remplacés, jamais
 *  accumulés.
 *
 *  ## L'aperçu se lit avant d'être réécrit, et c'est une course
 *
 *  Publier un document remplace **son** entrée dans l'aperçu et garde les autres : il faut donc
 *  lire l'aperçu, le modifier, le réécrire. Deux publications simultanées pourraient se perdre
 *  l'une l'autre — la seconde écrirait un aperçu lu avant la première.
 *
 *  C'est nommé plutôt que corrigé : les publications se lancent à la main, une par une, et une
 *  correction demanderait soit une écriture conditionnelle que R2 n'offre pas ici, soit un objet
 *  par document pour l'aperçu lui-même, c'est-à-dire le problème déplacé. Si deux publications
 *  simultanées deviennent un usage réel, ce sera le moment d'y revenir. */

export type Publication =
  | { readonly faite: true; readonly pages: number; readonly passages: number; readonly documents: number }
  | { readonly faite: false; readonly raison: string };

/** Ce qu'il faut pour publier un document : son entrée d'aperçu, sa vue, son texte, et son
 *  classement s'il en a un. Rien n'est deviné ici — tout vient de l'appelant. */
export type ADocumentPublier = {
  readonly entree: ApercuDocument;
  readonly vue: VueBibliotheque;
  readonly passages: readonly Passage[];
  readonly classement?: ClassementLocal;
};

const sansFin = (adresse: string): string => adresse.trim().replace(/\/+$/, "");

const lisible = (souci: unknown): string => (souci instanceof Error ? souci.message : String(souci));

/** Publie un document et rafraîchit l'aperçu. `appeler` est remplaçable pour que les épreuves
 *  tournent sans réseau — c'est la seule façon d'éprouver une moitié posée. */
export async function publierUnDocument(
  service: string,
  jeton: string,
  contenu: ADocumentPublier,
  appeler: typeof fetch = fetch,
): Promise<Publication> {
  const racine = sansFin(service);
  if (racine.length === 0 || !/^https?:\/\/[^\s/]+/.test(racine))
    return { faite: false, raison: `Adresse de service inutilisable : « ${service.trim()} ».` };
  if (jeton.length === 0) return { faite: false, raison: "Aucun jeton de service : rien n'a été posé." };

  const empreinte = contenu.entree.empreinte;
  const document = `/vue/document/${empreinte}`;

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

  const surLesPassages = await ranger(`${document}/passages`, contenu.passages);
  if (surLesPassages !== undefined)
    return { faite: false, raison: `Les passages n'ont pas été posés — ${surLesPassages}. Rien n'a été posé.` };

  const surLaVue = await ranger(document, contenu.vue);
  if (surLaVue !== undefined)
    return {
      faite: false,
      raison:
        `La vue n'a pas été posée — ${surLaVue}. Les passages l'ont été : ce document est à demi ` +
        `publié, et l'aperçu ne l'annonce pas encore. Relancer la publication suffit.`,
    };

  // L'aperçu : lu, modifié, réécrit. C'est lui qui annonce le document, donc il vient en dernier.
  let avant: ApercuEnLigne;
  try {
    const reponse = await appeler(`${racine}/vue/apercu`, {
      method: "GET",
      headers: { "x-api-key": jeton },
    });
    if (reponse.status === 404) avant = { documents: [], classements: [] };
    else if (!reponse.ok)
      return {
        faite: false,
        raison:
          `L'aperçu n'a pas pu être lu — le service a répondu ${reponse.status}. La vue et les ` +
          `passages ont été posés ; l'aperçu n'annonce pas encore ce document. Relancer suffit.`,
      };
    else avant = ApercuEnLigne.parse(await reponse.json());
  } catch (souci) {
    return {
      faite: false,
      raison:
        `L'aperçu n'a pas pu être lu — ${lisible(souci)}. La vue et les passages ont été posés ; ` +
        `l'aperçu n'annonce pas encore ce document. Relancer suffit.`,
    };
  }

  // Son entrée remplace la précédente ; les autres documents restent. Republier le même document
  // ne le dédouble donc pas, et c'est ce qui rend la commande rejouable.
  const documents = [...avant.documents.filter((un) => un.empreinte !== empreinte), contenu.entree];
  const classements =
    contenu.classement === undefined
      ? avant.classements.filter((un) => un.empreinte !== empreinte)
      : [...avant.classements.filter((un) => un.empreinte !== empreinte), contenu.classement];

  const surLApercu = await ranger("/vue/apercu", { documents, classements });
  if (surLApercu !== undefined)
    return {
      faite: false,
      raison:
        `L'aperçu n'a pas été posé — ${surLApercu}. La vue et les passages l'ont été ; le ` +
        `document existe en ligne mais le Catalogue ne l'annonce pas. Relancer suffit.`,
    };

  return {
    faite: true,
    pages: contenu.vue.pages.length,
    passages: contenu.passages.length,
    documents: documents.length,
  };
}
