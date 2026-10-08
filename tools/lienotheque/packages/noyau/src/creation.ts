import {
  type Axe,
  Cle,
  DescriptionBibliotheque,
  type MotsBibliotheque,
  type ModeleBibliotheque,
  type TypeDeContenu,
} from "@lienotheque/contrats";

/** Créer une bibliothèque, en quatre temps (CLA-01, CLA-09, maquette 1).
 *
 *  La logique de l'assistant, sans écran : ce qui manque à chaque temps, ce qu'on peut faire
 *  ensuite, et comment les réponses deviennent une description de bibliothèque. L'écran la pose
 *  sur des boutons ; les tests la posent sur des cas. Les deux lisent la même règle.
 *
 *  Rien ici ne connaît de domaine. Les façons de ranger viennent des modèles, qui sont des
 *  données ; le vocabulaire vient des réponses. Un domaine s'ajoute en déposant un modèle, pas
 *  en écrivant une ligne. */

export const TEMPS = ["nom", "contenu", "rangement", "acces"] as const;
export type Temps = (typeof TEMPS)[number];

/** Ce que chaque temps demande, tel que l'écran l'annonce. */
export const INTITULE: Readonly<Record<Temps, string>> = {
  nom: "Nom",
  contenu: "Contenu",
  rangement: "Rangement",
  acces: "Accès",
};

/** D'où vient le rangement initial : d'un modèle, ou d'une seule façon de ranger à soi.
 *
 *  Une bibliothèque porte toujours au moins une façon de ranger — sans quoi rien ne se retrouve.
 *  Qui ne reconnaît aucun modèle en nomme une et l'emplit en chemin faisant. */
export type Rangement =
  | { readonly type: "modele"; readonly cle: string }
  | { readonly type: "libre"; readonly nom: string };

export type Reponses = {
  readonly nom: string;
  readonly description?: string;
  readonly contenus: readonly TypeDeContenu[];
  readonly rangement?: Rangement;
  readonly mots: MotsBibliotheque;
  readonly dossier: string;
};

/** Les mots qu'on propose avant que l'administrateur ne dise les siens.
 *
 *  Les plus généraux qui soient : ils ne désignent aucun métier, et c'est exactement pourquoi ils
 *  conviennent à tous en attendant. L'écran les montre modifiables. */
export const MOTS_PROPOSES: MotsBibliotheque = {
  element: { un: "élément", plusieurs: "éléments" },
  piste: { un: "piste", plusieurs: "pistes" },
  page: { un: "page", plusieurs: "pages" },
};

export const DEBUT: Reponses = { nom: "", contenus: [], mots: MOTS_PROPOSES, dossier: "" };

export function suivant(temps: Temps): Temps | undefined {
  return TEMPS[TEMPS.indexOf(temps) + 1];
}

export function precedent(temps: Temps): Temps | undefined {
  const rang = TEMPS.indexOf(temps);
  return rang <= 0 ? undefined : TEMPS[rang - 1];
}

/** Ce qui manque pour quitter ce temps, dit à qui le lit — ou rien si l'on peut continuer.
 *
 *  Une phrase et non un booléen : un bouton éteint sans raison est une énigme. */
export function manque(temps: Temps, reponses: Reponses): string | undefined {
  switch (temps) {
    case "nom":
      if (reponses.nom.trim() === "") return "Donnez un nom à cette bibliothèque.";
      if (cleDepuisNom(reponses.nom) === undefined)
        return "Ce nom ne contient aucune lettre ni chiffre : ajoutez-en au moins un.";
      return undefined;
    case "contenu":
      return reponses.contenus.length === 0 ? "Choisissez au moins un type de contenu." : undefined;
    case "rangement": {
      if (reponses.rangement === undefined) return "Choisissez une façon de ranger, ou nommez la vôtre.";
      if (reponses.rangement.type === "libre" && reponses.rangement.nom.trim() === "")
        return "Nommez votre façon de ranger.";
      for (const mot of Object.values(reponses.mots))
        if (mot.un.trim() === "" || mot.plusieurs.trim() === "")
          return "Chaque mot se dit au singulier et au pluriel.";
      return undefined;
    }
    case "acces":
      return reponses.dossier.trim() === "" ? "Choisissez le dossier qui portera cette bibliothèque." : undefined;
  }
}

/** Vrai quand plus rien ne manque, à aucun temps : l'écran peut créer. */
export function complet(reponses: Reponses): boolean {
  return TEMPS.every((temps) => manque(temps, reponses) === undefined);
}

/** Une clé stable tirée du nom, ou rien si le nom n'offre aucune lettre ni chiffre.
 *
 *  La clé ne change plus jamais, même renommée : elle ne sert qu'à désigner. Les accents sont
 *  dépliés puis retirés, pour qu'« Été » et « Ete » mènent à la même clé lisible. */
export function cleDepuisNom(nom: string): string | undefined {
  const brut = nom
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return Cle.safeParse(brut).success ? brut : undefined;
}

/** La même clé, écartée de celles déjà prises : deux bibliothèques du même nom coexistent. */
export function cleLibre(nom: string, prises: readonly string[]): string | undefined {
  const base = cleDepuisNom(nom);
  if (base === undefined) return undefined;
  const occupees = new Set(prises);
  if (!occupees.has(base)) return base;
  for (let rang = 2; rang < 1_000; rang += 1) if (!occupees.has(`${base}-${rang}`)) return `${base}-${rang}`;
  return undefined;
}

/** Les réponses deviennent une description, validée par son contrat.
 *
 *  Elle lève si les réponses sont incomplètes : l'écran le sait avant, par `manque`, et on ne
 *  veut pas d'une seconde règle qui dirait presque la même chose. */
export function assembler(
  reponses: Reponses,
  modeles: readonly ModeleBibliotheque[],
  prises: readonly string[] = [],
): DescriptionBibliotheque {
  const premier = TEMPS.map((temps) => manque(temps, reponses)).find((raison) => raison !== undefined);
  if (premier !== undefined) throw new Error(premier);

  const id = cleLibre(reponses.nom, prises);
  if (id === undefined) throw new Error("Aucune clé disponible pour ce nom.");

  const nom = reponses.nom.trim();
  const rangement = reponses.rangement;
  if (rangement === undefined) throw new Error("Aucune façon de ranger n'a été choisie.");
  const initial = rangementInitial(rangement, modeles);

  return DescriptionBibliotheque.parse({
    id,
    nom,
    contenus: [...reponses.contenus],
    mots: reponses.mots,
    ...(reponses.description !== undefined && reponses.description.trim() !== ""
      ? { description: reponses.description.trim() }
      : {}),
    schema: {
      cle: id,
      nom,
      langue: "fr",
      version: 1,
      ...(initial.description === undefined ? {} : { description: initial.description }),
      axes: initial.axes,
    },
  });
}

/** Les axes de départ, et la description qui les accompagne quand le modèle en porte une.
 *
 *  Les deux viennent du même endroit, donc se lisent d'un seul coup : deux recherches séparées
 *  dans la même liste finissent par ne plus trouver la même chose. */
function rangementInitial(
  rangement: Rangement,
  modeles: readonly ModeleBibliotheque[],
): { readonly axes: readonly Axe[]; readonly description?: string } {
  if (rangement.type === "libre")
    return {
      axes: [
        {
          cle: cleDepuisNom(rangement.nom) ?? "rangement",
          nom: rangement.nom.trim(),
          nature: "etiquettes",
          cardinalite: "plusieurs",
          structure: "plat",
          obligatoire: false,
          valeurs: [],
          alias: [],
        },
      ],
    };

  const modele = modeles.find((candidat) => candidat.cle === rangement.cle);
  if (modele === undefined) throw new Error("Façon de ranger introuvable.");
  return { axes: modele.axes, ...(modele.description === undefined ? {} : { description: modele.description }) };
}
