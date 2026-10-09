import { z } from "zod";
import { Cle, SchemaBibliotheque } from "./classement.js";
import { MotsBibliotheque } from "./ecrans.js";

/** Ce qu'une bibliothèque dit d'elle-même (CLA-01, ANC-05).
 *
 *  Un fichier dans son dossier portable, et la seule source de son vocabulaire. C'est de là que
 *  viennent les mots des écrans et les axes de son classement : rien de tout cela n'est écrit
 *  dans le code, qui ne connaît aucun domaine.
 *
 *  Elle traverse trois frontières — l'assistant qui la crée, l'hôte qui l'écrit, la chaîne qui la
 *  lit — et doit donc être validée par un contrat. Elle l'était par un analyseur écrit à la main
 *  dans `outils/ingestion`, qui acceptait n'importe quel `id` et n'importe quel `nom` : une
 *  description incomplète ne se voyait qu'à l'écran, longtemps après. */

/** Ce qu'une bibliothèque s'attend à contenir (maquette 1, étape « contenu »).
 *
 *  Un type de contenu, pas un type d'élément : « audio » dit qu'il y aura des enregistrements,
 *  pas ce qu'ils représentent. Ce que les éléments *sont* vient du schéma, jamais d'ici. */
export const TypeDeContenu = z.enum(["documents", "audio", "videos", "images"]);
export type TypeDeContenu = z.infer<typeof TypeDeContenu>;

export const DescriptionBibliotheque = z
  .object({
    /** Identifiant stable. Il ne change jamais, même quand la bibliothèque est renommée. */
    id: Cle,
    nom: z.string().min(1),
    /** Ce que la bibliothèque attend. Vide est permis : on peut créer puis déposer plus tard. */
    contenus: z.array(TypeDeContenu).default([]),
    mots: MotsBibliotheque,
    schema: SchemaBibliotheque,
    /** Texte libre que l'assistant laisse, et que les écrans peuvent montrer. */
    description: z.string().min(1).optional(),
  })
  .strict();
export type DescriptionBibliotheque = z.infer<typeof DescriptionBibliotheque>;

/** Le nom de fichier de la description, dans le dossier `base` d'une bibliothèque.
 *
 *  Écrit ici et nulle part ailleurs : l'assistant, l'hôte et la chaîne le nomment tous les trois,
 *  et trois chaînes de caractères identiques finissent par ne plus l'être. */
export const FICHIER_DESCRIPTION = "bibliotheque.json";
