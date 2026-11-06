/** Ce qui ne doit jamais entrer dans le dépôt, qui est public (CLAUDE.md, règle 5).
 *
 *  ## Pourquoi ce garde-fou existe
 *
 *  Le 6 novembre 2026, en préparant un commit, un `git add` désignant un **dossier** au lieu de
 *  fichiers a happé tout un arbre de sorties de mesure non suivi : des centaines de fichiers,
 *  **dont deux PDF**, vers un dépôt public. Rattrapé avant le commit, à la relecture — c'est-à-dire
 *  par l'attention, qui n'est pas un mécanisme.
 *
 *  Ce n'était pas la première fois. Le `.gitignore` du dépôt porte déjà la trace d'une copie de
 *  582 Mo d'œuvres sous droits, née d'un mauvais chemin relatif, « à un `git add -A` près d'un
 *  dépôt public ».
 *
 *  **Une règle qu'on doit se rappeler n'est pas une règle.** Celle-ci s'exécute.
 *
 *  ## Ce qu'elle refuse
 *
 *  Les œuvres — documents et enregistrements — et les sorties de mesure, qui sont volumineuses,
 *  régénérables, et parfois pleines de ce qu'on vient de dire.
 *
 *  Elle lit **l'index**, non les commits : un fichier ajouté et pas encore commité est déjà
 *  refusé, ce qui est le seul moment où le refus sert encore à quelque chose. */

/** Les extensions d'une œuvre : un document ou un enregistrement. */
const EXTENSIONS_INTERDITES = [".pdf", ".mp3", ".m4a", ".wav", ".flac", ".ogg", ".aac"];

/** Les dossiers dont rien ne doit être suivi. */
const DOSSIERS_INTERDITS = ["mesures/sorties/"];

/** Ce que le dépôt porte légitimement, et pourquoi.
 *
 *  Chaque entrée se justifie ici ou n'existe pas. Allonger cette liste est une décision, pas une
 *  commodité : un fichier qu'on y met échappe au garde-fou pour toujours. */
export const TOLERES: readonly { readonly chemin: string; readonly raison: string }[] = [
  {
    chemin: "docs/ui-kit/Catalogue-UI.pdf",
    raison:
      "Le catalogue du kit d'interface, écrit pour ce projet et par lui. Ce n'est pas une œuvre " +
      "d'un tiers, et il fait partie de ce qu'on livre.",
  },
];

export type FichierRefuse = { readonly chemin: string; readonly pourquoi: string };

/** Les fichiers d'une liste que le dépôt ne doit pas porter.
 *
 *  Fonction pure, et c'est voulu : un garde-fou qui ne s'éprouve que sur l'état réel du dépôt ne
 *  s'éprouve pas du tout — il passerait au vert le jour où il cesserait de voir quoi que ce soit. */
export function fichiersRefuses(chemins: readonly string[]): readonly FichierRefuse[] {
  const toleres = new Set(TOLERES.map((tolere) => tolere.chemin));
  return chemins.flatMap((chemin) => {
    if (toleres.has(chemin)) return [];
    const dossier = DOSSIERS_INTERDITS.find((interdit) => chemin.includes(interdit));
    if (dossier !== undefined)
      return [{ chemin, pourquoi: `sortie de mesure (« ${dossier} ») : volumineuse et régénérable` }];
    const extension = EXTENSIONS_INTERDITES.find((fin) => chemin.toLowerCase().endsWith(fin));
    if (extension !== undefined)
      return [{ chemin, pourquoi: `œuvre (« ${extension} ») : le dépôt est public` }];
    return [];
  });
}
