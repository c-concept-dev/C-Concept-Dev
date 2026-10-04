/** Navigation (B4) : une adresse dit où l'on est, et rien d'autre ne le dit.
 *
 *  Tout tient dans le fragment — l'application est servie depuis un fichier dans la coquille
 *  Tauri, où il n'y a pas de serveur pour router des chemins. Le fragment survit au rechargement,
 *  se copie, se met en favori : c'est ce qui permet de reprendre une lecture là où on l'a laissée
 *  (SYN-03) et de partager un lien vers un cas à vérifier. */

export type Destination =
  | { readonly ecran: "accueil" }
  | { readonly ecran: "reglages" }
  | { readonly ecran: "catalogue"; readonly bibliothequeId: string }
  | { readonly ecran: "verifier"; readonly bibliothequeId: string; readonly casId?: string }
  | { readonly ecran: "lecteur"; readonly bibliothequeId: string; readonly page: number; readonly ancreId?: string };

export const ACCUEIL: Destination = { ecran: "accueil" };

/** Adresse d'une destination, fragment compris. Une seule fonction l'écrit : un lien du Catalogue
 *  et un lien de Vérifier ne peuvent pas pointer deux endroits différents pour la même chose. */
export function adresseDe(destination: Destination): string {
  switch (destination.ecran) {
    case "accueil":
      return "#accueil";
    case "reglages":
      return "#reglages";
    case "catalogue":
      return `#bibliotheque/${destination.bibliothequeId}`;
    case "verifier":
      return `#bibliotheque/${destination.bibliothequeId}/verifier${destination.casId === undefined ? "" : `/${destination.casId}`}`;
    case "lecteur":
      return `#bibliotheque/${destination.bibliothequeId}/page/${destination.page}${
        destination.ancreId === undefined ? "" : `/element/${destination.ancreId}`
      }`;
  }
}

const entier = (valeur: string | undefined): number | undefined => {
  if (valeur === undefined || !/^\d+$/.test(valeur)) return undefined;
  const nombre = Number.parseInt(valeur, 10);
  return nombre > 0 ? nombre : undefined;
};

/** Destination lue dans un fragment. Une adresse qu'on ne comprend pas ramène à l'accueil :
 *  mieux vaut un écran qui existe qu'un message d'erreur. */
export function destinationDe(fragment: string): Destination {
  const morceaux = fragment.replace(/^#/, "").split("/").filter((morceau) => morceau.length > 0);
  const [tete, bibliothequeId, quoi, valeur, puis, apres] = morceaux;

  if (tete === "reglages") return { ecran: "reglages" };
  if (tete !== "bibliotheque" || bibliothequeId === undefined) return ACCUEIL;

  if (quoi === "verifier") return valeur === undefined ? { ecran: "verifier", bibliothequeId } : { ecran: "verifier", bibliothequeId, casId: valeur };

  if (quoi === "page") {
    const page = entier(valeur);
    if (page === undefined) return { ecran: "catalogue", bibliothequeId };
    return puis === "element" && apres !== undefined
      ? { ecran: "lecteur", bibliothequeId, page, ancreId: apres }
      : { ecran: "lecteur", bibliothequeId, page };
  }

  return { ecran: "catalogue", bibliothequeId };
}

/** Aller quelque part, sans recharger : l'adresse change, l'événement « hashchange » suit. */
export function aller(destination: Destination): void {
  const adresse = adresseDe(destination);
  if (globalThis.location !== undefined && globalThis.location.hash !== adresse) globalThis.location.hash = adresse;
}
