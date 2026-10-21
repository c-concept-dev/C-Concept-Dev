/** Navigation entre les écrans (B4).
 *
 *  Une adresse par écran, lisible et partageable : un fragment, pas un état caché. On peut
 *  revenir en arrière, ouvrir dans un autre onglet, envoyer un lien à quelqu'un — et le clavier
 *  y arrive comme la souris, puisque ce sont des liens.
 *
 *  Le routeur du lot C tient en un fragment. Les écrans du CDC en demanderont davantage ; ce
 *  module changera, pas eux. */

export type Route =
  | { readonly ecran: "accueil" }
  | { readonly ecran: "reglages" }
  | { readonly ecran: "creer" }
  | { readonly ecran: "organisation" }
  | { readonly ecran: "depot" }
  | { readonly ecran: "maniere" }
  | { readonly ecran: "catalogue"; readonly page?: number }
  | { readonly ecran: "lecteur"; readonly page: number; readonly element?: string }
  /** Retirer une bibliothèque : l'oublier, ou la mettre à la corbeille. Un écran à elle seule,
   *  parce qu'une fenêtre de confirmation se ferme d'un clic distrait. */
  | { readonly ecran: "retirer" }
  | { readonly ecran: "verifier" }
  /** Entrer, enrôler, sortir — le seul écran qui vive **avant** toute session.
   *
   *  `invitation` porte le défi d'amorçage quand il y en a un : le premier accès s'ouvre par une
   *  invitation que le jeton de service a émise, et qui voyage dans l'adresse. Elle n'est pas un
   *  secret du compte mais un titre à usage unique, périmé en cinq minutes. */
  | { readonly ecran: "entrer"; readonly invitation?: string };

export const ACCUEIL: Route = { ecran: "accueil" };

/** Lit un fragment d'adresse. Tout ce qui n'est pas reconnu ramène à l'accueil : une adresse
 *  fausse ne doit jamais laisser l'écran vide. */
export function lireRoute(fragment: string): Route {
  const propre = fragment.replace(/^#/, "");
  if (propre === "") return ACCUEIL;

  const [ecran, ...reste] = propre.split("/");
  const parametres = new Map(
    reste
      .join("/")
      .split("&")
      .filter((morceau) => morceau !== "")
      .map((morceau) => {
        const [clef, valeur] = morceau.split("=");
        return [clef ?? "", valeur ?? ""] as const;
      }),
  );
  const entier = (clef: string): number | undefined => {
    const brut = parametres.get(clef);
    const nombre = brut === undefined ? Number.NaN : Number(brut);
    return Number.isInteger(nombre) && nombre > 0 ? nombre : undefined;
  };

  switch (ecran) {
    case "reglages":
      return { ecran: "reglages" };
    case "creer":
      return { ecran: "creer" };
    case "organisation":
      return { ecran: "organisation" };
    case "depot":
      return { ecran: "depot" };
    case "maniere":
      return { ecran: "maniere" };
    case "verifier":
      return { ecran: "verifier" };
    case "retirer":
      return { ecran: "retirer" };
    case "entrer": {
      const invitation = parametres.get("invitation");
      return invitation === undefined || invitation === "" ? { ecran: "entrer" } : { ecran: "entrer", invitation };
    }
    case "catalogue": {
      const page = entier("page");
      return page === undefined ? { ecran: "catalogue" } : { ecran: "catalogue", page };
    }
    case "lecteur": {
      const page = entier("page");
      if (page === undefined) return ACCUEIL;
      const element = parametres.get("element");
      return element === undefined || element === "" ? { ecran: "lecteur", page } : { ecran: "lecteur", page, element };
    }
    default:
      return ACCUEIL;
  }
}

/** Écrit l'adresse d'une route. Aller-retour fidèle : `lireRoute(ecrireRoute(r))` rend `r`. */
export function ecrireRoute(route: Route): string {
  switch (route.ecran) {
    case "accueil":
      return "#";
    case "reglages":
      return "#reglages";
    case "creer":
      return "#creer";
    case "organisation":
      return "#organisation";
    case "depot":
      return "#depot";
    case "maniere":
      return "#maniere";
    case "verifier":
      return "#verifier";
    case "retirer":
      return "#retirer";
    case "entrer":
      return route.invitation === undefined ? "#entrer" : `#entrer/invitation=${route.invitation}`;
    case "catalogue":
      return route.page === undefined ? "#catalogue" : `#catalogue/page=${route.page}`;
    case "lecteur":
      return route.element === undefined
        ? `#lecteur/page=${route.page}`
        : `#lecteur/page=${route.page}&element=${route.element}`;
  }
}
