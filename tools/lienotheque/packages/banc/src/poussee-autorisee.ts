/** Ce qu'une poussée emporte, comparé à ce que l'entrée du registre nomme (lot 0c ter).
 *
 *  ## CE QUE CE GARDE-FOU NE PROUVE PAS, ET IL FAUT LE LIRE EN PREMIER
 *
 *  Il compare la branche à **l'entrée du registre**, et cette entrée est écrite **par moi**. Si
 *  j'y nomme un commit que Christophe n'a pas autorisé, le garde-fou est vert : il aura vérifié
 *  que je suis d'accord avec moi-même. **Seuls les mots de Christophe, cités dans l'entrée,
 *  prouvent son accord**, et aucune mécanique ne peut vérifier qu'une citation est vraie.
 *
 *  Ce qu'il attrape est donc étroit, et c'est déjà ce qui est arrivé : un commit qui **précède**
 *  ceux que l'autorisation nomme et qui part avec eux sans que personne l'ait dit. Le 16 novembre
 *  2026, cinq commits sont partis pour trois autorisés. Ce garde-fou-là aurait rougi.
 *
 *  ## Quand il se déclenche
 *
 *  **Avant la poussée**, et à ce moment seulement : c'est le dernier instant où le geste est
 *  encore réversible sans réécrire d'histoire. Un contrôle qui dirait la même chose après coup
 *  ne protégerait rien — il décrirait un fait accompli. Il vit donc dans `crochets/pre-push`, que
 *  git appelle avec les références à pousser, et il lit **ce que cette poussée-ci emporte** :
 *  `<empreinte distante>..<empreinte locale>`, et non `@{u}..`, qui décrirait une autre question.
 *
 *  ## Sur quelles branches il existe — la dette D17, inchangée
 *
 *  Les crochets de ce dépôt sont **versionnés** (`tools/lienotheque/crochets/`) et désignés par
 *  `core.hooksPath`, un réglage **par copie du dépôt**. Un crochet n'existe donc que là où la
 *  branche le porte : celui-ci protège la branche de travail, et **pas `main`**, qui ne le recevra
 *  qu'à la fusion. C'est exactement la dette **D17**, déjà inscrite pour le crochet de
 *  pré-commit ; ce lot ne la lève pas et ne l'aggrave pas — il la partage.
 *
 *  ## L'exemption, resserrée au seul commit qui ne peut pas se nommer
 *
 *  Une entrée ne peut pas citer sa propre empreinte : un numéro de commit s'écrit **après** le
 *  commit (règle du 10 novembre 2026). Un commit exactement est donc inexemptible autrement, et
 *  c'est **celui qui ajoute au registre l'entrée servant de référence** — lui seul est exempté.
 *
 *  Le premier jet exemptait **tout** commit ne touchant que `docs/`, et c'était trop large :
 *  une correction de prose, une ligne de file des lots, une décision datée — autant de commits de
 *  documents qui n'ajoutent aucune entrée et partaient pourtant sans être nommés. Or le registre,
 *  la file et les décisions sont lus par des garde-fous depuis le lot 0m : ce sont des documents
 *  qui **agissent**. L'exemption porte donc sur ce qu'un commit **fait** (il ajoute l'entrée), et
 *  non plus sur l'endroit où il écrit.
 *
 *  Deux conditions, toutes deux nécessaires : il ajoute la ligne de l'entrée de référence, **et**
 *  il ne touche que des documents — sans quoi l'exemption deviendrait un passage pour du code.
 *  Et un seul commit peut en profiter : si deux prétendent porter l'entrée, aucun n'est exempté.
 *  Le trou qui reste est de la taille d'une ligne de table, et il est le prix de la règle qui
 *  interdit de parier une empreinte. */

/** Un commit que la poussée emporterait. */
export interface CommitEnAvance {
  /** L'empreinte entière, telle que `git rev-list` la donne. */
  readonly empreinte: string;
  readonly titre: string;
  /** Vrai quand il ne touche que `tools/lienotheque/docs/`. Nécessaire à l'exemption, et pas
   *  suffisant : un commit de documents qui n'ajoute pas l'entrée doit être nommé comme un autre. */
  readonly documentsSeulement: boolean;
  /** Vrai quand son diff **ajoute** au registre la ligne de l'entrée qui sert de référence à
   *  cette comparaison. C'est le commit qui ne peut pas se nommer lui-même. */
  readonly ajouteLEntreeDeReference: boolean;
}

export interface Comparaison {
  /** Les commits que cette poussée-ci emporte, du plus ancien au plus récent. */
  readonly enAvance: readonly CommitEnAvance[];
  /** Les empreintes citées par la **dernière** entrée du registre. */
  readonly citees: readonly string[];
  /** La branche porte-t-elle ce commit ? (poussé ou non) */
  readonly surLaBranche: (citation: string) => boolean;
}

/** Les deux écarts, dits en français. Vide quand la poussée est exactement ce qui est nommé.
 *
 *  **Les deux sens comptent, et pour des raisons différentes.** Un commit en avance que l'entrée
 *  ne nomme pas, c'est la faute du 16 novembre — du travail qui part sans être dit. Une empreinte
 *  nommée que la branche ne porte pas, c'est l'entrée qui annonce ce qu'elle ne livre pas : une
 *  empreinte pariée, ou un commit resté sur une autre copie. Le registre dirait alors une poussée
 *  qui n'a pas eu lieu. */
export function ecartsDeLaPoussee({ enAvance, citees, surLaBranche }: Comparaison): readonly string[] {
  const ecarts: string[] = [];

  /** Les prétendants à l'exemption. Deux conditions, et l'unicité en plus : une entrée s'ajoute
   *  une fois. Si deux commits l'ajoutent, le registre a été réécrit quelque part, et l'exemption
   *  tombe pour les deux plutôt que de couvrir le mauvais. */
  const porteurs = enAvance.filter((commit) => commit.documentsSeulement && commit.ajouteLEntreeDeReference);
  if (porteurs.length > 1)
    ecarts.push(
      `${porteurs.length} commits ajoutent l'entrée de référence (${porteurs
        .map((commit) => commit.empreinte.slice(0, 8))
        .join(", ")}) ; l'exemption n'en couvre qu'un, aucun n'en profite`,
    );
  const exempte = porteurs.length === 1 ? porteurs[0] : undefined;

  for (const commit of enAvance) {
    if (commit === exempte) continue;
    if (citees.some((citation) => commit.empreinte.startsWith(citation))) continue;
    const court = `${commit.empreinte.slice(0, 8)} « ${commit.titre} »`;
    // Trois refus distincts, parce que trois causes distinctes. Un message qui dirait « n'ajoute
    // pas l'entrée » d'un commit qui l'ajoute serait faux, et un refus faux s'écarte de sa cause.
    if (commit.documentsSeulement && commit.ajouteLEntreeDeReference)
      ecarts.push(`${court} ajoute l'entrée de référence, mais il n'est pas seul à le faire : l'exemption ne joue pour personne`);
    else if (commit.documentsSeulement)
      ecarts.push(`${court} ne porte que des documents, mais n'ajoute pas l'entrée de référence : il partirait sans être nommé`);
    else ecarts.push(`${court} partirait sans être nommé par l'entrée du registre`);
  }

  for (const citation of citees) {
    if (surLaBranche(citation)) continue;
    ecarts.push(`l'entrée du registre nomme ${citation}, que cette branche ne porte pas`);
  }

  return ecarts;
}
