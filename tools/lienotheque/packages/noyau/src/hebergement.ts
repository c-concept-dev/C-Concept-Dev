import type { BibliothequePubliee, EtatHebergement, Liaison, Region } from "@lienotheque/contrats";

/** Ce qu'on peut décider d'un hébergement, sans rien écrire ni appeler (HEB-01 à HEB-06).
 *
 *  Tout est pur : on donne l'état du registre, on reçoit ce qu'il faudrait en faire. Le Worker
 *  écrit, l'écran montre, mais c'est ici qu'on décide — et c'est ici que les tests mordent. */

/** La région proposée par défaut, et la seule dont on puisse expliquer le choix à l'écran :
 *  celle où vivent les personnes qui lisent (HEB-06). Un défaut qu'on ne sait pas justifier est
 *  un défaut qu'on ne devrait pas proposer. */
export const REGION_PAR_DEFAUT: Region = "weur";

/** Le préfixe des objets d'une bibliothèque dans le compartiment.
 *
 *  Une seule fonction le compose, et elle part de la clé — jamais d'une valeur reçue dans une
 *  requête. C'est elle qui tient l'isolation côté fichiers, là où D1 la tient par sa structure. */
export function prefixeDe(cle: string): string {
  return `${cle}/`;
}

/** Les liaisons libres de la réserve, dans l'ordre.
 *
 *  « Liaisons » et non « places » : la file de travaux a déjà ses places libres, qui sont des
 *  places de travail, et deux choses différentes ne doivent pas porter le même nom — le typage
 *  l'a dit avant moi.
 *
 *  `declarees` vient de la configuration du Worker : ce sont les places qui existent vraiment.
 *  Une place qu'on croirait libre mais qui n'est pas déclarée ne mène à aucune base. */
export function liaisonsLibres(
  declarees: readonly Liaison[],
  occupees: readonly (Liaison | undefined)[],
): readonly Liaison[] {
  const prises = new Set(occupees.filter((place): place is Liaison => place !== undefined));
  return declarees.filter((place) => !prises.has(place));
}

/** Ce qui empêche de publier, s'il y a quelque chose.
 *
 *  Rend une phrase lisible plutôt qu'un code : elle s'affiche telle quelle. Rien ici ne dit
 *  « erreur » — on dit ce qui manque, et c'est ce que l'écran a besoin de montrer avant
 *  confirmation (HEB-01). */
export function empechePublication(
  bibliotheque: Pick<BibliothequePubliee, "cle" | "etat">,
  placesDisponibles: readonly Liaison[],
  prefixesPris: readonly string[],
): string | undefined {
  if (bibliotheque.etat !== "locale") return "Cette bibliothèque est déjà servie.";
  if (placesDisponibles.length === 0)
    return "Toutes les places d'hébergement sont prises. Il faut en déclarer une de plus et redéployer.";
  if (prefixesPris.includes(prefixeDe(bibliotheque.cle)))
    return "Une autre bibliothèque occupe déjà cet emplacement de fichiers.";
  return undefined;
}

/** Les gestes qu'on peut faire sur l'hébergement d'une bibliothèque. */
export type Geste = "publier" | "depublier" | "passer_en_mixte";

/** L'état qu'un geste donne, ou rien si le geste n'a pas de sens depuis là.
 *
 *  Dépublier ne détruit rien : on cesse de servir, la base et les fichiers restent. C'est ce qui
 *  rend le retour arrière sans perte — et c'est pour cela que ce tableau ne mène jamais à un
 *  état « supprimée ». La suppression n'est pas une transition, c'est une décision à part. */
export function apres(etat: EtatHebergement, geste: Geste): EtatHebergement | undefined {
  const table: Record<EtatHebergement, Partial<Record<Geste, EtatHebergement>>> = {
    locale: { publier: "publiee", passer_en_mixte: "mixte" },
    mixte: { publier: "publiee", depublier: "locale" },
    publiee: { depublier: "locale", passer_en_mixte: "mixte" },
  };
  return table[etat][geste];
}

/** Ce qu'une bibliothèque promet dans cet état, pour que l'écran l'annonce avant confirmation
 *  (HEB-01) et n'offre jamais une fonction qui échouerait (PLT-12). */
export function capacites(etat: EtatHebergement): readonly string[] {
  if (etat === "locale") return ["lecture sur cet ordinateur"];
  if (etat === "mixte")
    return ["lecture partout", "recherche partout", "médias servis par l'ordinateur, quand il est allumé"];
  return ["lecture partout", "recherche partout", "médias servis partout"];
}

/** Le poids qu'une bibliothèque prendra chez l'hébergeur, pour l'annoncer avant envoi (HEB-06).
 *
 *  Seules les **pages** comptent : un fichier d'origine qu'aucune page ne réclame ne part pas.
 *  L'épreuve du lot E l'a montré sur un document de 345 Mo dont 122,5 Mo ne s'affichaient nulle
 *  part. On annonce donc ce qu'on enverra, pas ce que pèse le dossier. */
export function poidsAnnonce(octetsDesPages: number, rapportMesure: number): number {
  return Math.round(octetsDesPages * rapportMesure);
}
