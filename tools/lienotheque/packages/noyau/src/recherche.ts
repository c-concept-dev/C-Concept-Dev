import { citerPage, type Passage, type VueBibliotheque } from "@lienotheque/contrats";

/** Chercher dans une bibliothèque, sans rien envoyer nulle part (RCH, UX-02).
 *
 *  Tout se passe sur la machine : ce qu'on cherche dans sa propre bibliothèque ne regarde
 *  personne d'autre. Il n'y a pas de second magasin à tenir à jour, donc pas de second magasin à
 *  voir diverger : les repères viennent de la vue, le texte vient des passages de la version —
 *  chacun lu là où il est écrit, et nulle part recopié.
 *
 *  Deux choses font la qualité d'une recherche, et aucune n'est l'algorithme :
 *
 *  1. **Trouver malgré les accents et la casse.** « detachee » doit trouver « détachée ».
 *  2. **Montrer où ça correspond, dans le texte original.** Surligner « détachée » et non
 *     « detachee », donc replier le texte pour chercher, puis revenir aux positions d'origine.
 *
 *  Rien ici ne connaît de domaine : des titres, des lignes de texte, des numéros. Les mots des
 *  intitulés viennent de la bibliothèque (CLA-01). */

export type GenreResultat = "element" | "page" | "piste" | "action";

/** Une portion de texte qui correspond, en positions du texte **original**. */
export type Surlignage = { readonly debut: number; readonly fin: number };

/** La correspondance qui a conduit au Lecteur.
 *
 * Le rang du passage et la position dans son texte sont stables ; le numéro imprimé ne l'est pas
 * assez pour naviguer, et l'extrait affiché par la palette est volontairement tronqué. */
export type CibleRecherche = {
  readonly passage: number;
  readonly debut: number;
  readonly requete: string;
};

export type Resultat = {
  readonly genre: GenreResultat;
  /** Identité stable : c'est elle que le clavier suit d'un résultat à l'autre. */
  readonly cle: string;
  readonly titre: string;
  readonly surlignesTitre: readonly Surlignage[];
  readonly source: string;
  readonly extrait?: string;
  readonly surlignesExtrait?: readonly Surlignage[];
  /** Ce qu'on écrit à droite : un numéro, un minutage. */
  readonly cote?: string;
  /** Où aller en ouvrant. */
  readonly page?: number;
  readonly element?: string;
  readonly piste?: number;
  readonly cibleRecherche?: CibleRecherche;
};

export type Groupe = { readonly genre: GenreResultat; readonly libelle: string; readonly resultats: readonly Resultat[] };

/** Une action que la recherche peut proposer, fournie par l'écran qui sait où elle mène.
 *
 *  Le noyau ne connaît pas les écrans : il filtre sur les mots, il ne décide pas de la
 *  destination. */
export type Action = {
  readonly cle: string;
  readonly titre: string;
  readonly source?: string;
  /** Des mots supplémentaires qui doivent la faire trouver, sans être écrits dans son titre. */
  readonly aussi?: readonly string[];
};

/** Combien de résultats par groupe. Une liste qu'on ne peut plus parcourir d'un coup d'œil n'est
 *  plus une aide : au-delà, on affine. */
export const PAR_GROUPE = 6;

/** Le texte replié pour chercher, et de quoi revenir aux positions d'origine.
 *
 *  Replier caractère par caractère, et non d'un coup : `"été".normalize("NFD")` ne fait pas la
 *  même longueur que `"été"`, et des positions prises sur la forme dépliée ne désignent plus rien
 *  dans l'originale. */
function plier(texte: string): { readonly plie: string; readonly origines: readonly number[] } {
  let plie = "";
  const origines: number[] = [];
  for (let rang = 0; rang < texte.length; rang += 1) {
    const morceau = texte[rang]!.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
    for (const _ of morceau) origines.push(rang);
    plie += morceau;
  }
  // Une position de plus, pour que la fin du dernier caractère se dise.
  origines.push(texte.length);
  return { plie, origines };
}

/** Toutes les occurrences d'une suite de mots, en positions du texte original. */
function trouver(texte: string, morceaux: readonly string[]): readonly Surlignage[] {
  if (morceaux.length === 0) return [];
  const { plie, origines } = plier(texte);
  const surlignes: Surlignage[] = [];
  for (const morceau of morceaux) {
    let depuis = 0;
    for (;;) {
      const trouve = plie.indexOf(morceau, depuis);
      if (trouve === -1) break;
      surlignes.push({ debut: origines[trouve]!, fin: origines[trouve + morceau.length]! });
      depuis = trouve + morceau.length;
    }
  }
  return fusionner(surlignes);
}

/** Fond les portions qui se chevauchent : deux surlignages qui se touchent n'en font qu'un.
 *
 *  Sans cela, chercher « art articulation » surlignerait deux fois le même endroit, et l'écran
 *  afficherait des marques emboîtées. */
function fusionner(surlignes: readonly Surlignage[]): readonly Surlignage[] {
  const tries = [...surlignes].sort((a, b) => a.debut - b.debut || a.fin - b.fin);
  const fondus: Surlignage[] = [];
  for (const portion of tries) {
    const dernier = fondus[fondus.length - 1];
    if (dernier !== undefined && portion.debut <= dernier.fin) {
      if (portion.fin > dernier.fin) fondus[fondus.length - 1] = { debut: dernier.debut, fin: portion.fin };
    } else fondus.push(portion);
  }
  return fondus;
}

/** Ce qu'on cherche : la suite entière d'abord, puis chaque mot. */
function morceauxDe(requete: string): { readonly phrase: string; readonly mots: readonly string[] } {
  const { plie } = plier(requete.trim());
  const mots = plie.split(/\s+/u).filter((mot) => mot !== "");
  return { phrase: plie.replace(/\s+/gu, " ").trim(), mots };
}

/** Un extrait du texte autour de ce qui a été cherché, avec ses positions recalées.
 *
 *  Autour de la **suite entière** quand la ligne la porte, et seulement à défaut autour de la
 *  première correspondance venue. Les morceaux arrivent dans l'ordre `[phrase, ...mots]`, mais
 *  les correspondances, elles, sont rendues dans l'ordre du texte : prendre la première donnait
 *  la fenêtre d'un mot isolé du début de page, et jamais celle de la phrase cherchée.
 *
 *  Ce n'était pas qu'un extrait mal choisi. La sûreté d'un résultat se juge sur son extrait
 *  (`porteLaSuite`) : une page qui portait la suite passait donc pour du bruit, et la citation
 *  tombait sur une autre page. Relevé le 20 octobre 2026 sur un document du corpus traité par la
 *  porte de l'application — une phrase imprimée page 87 citait la première page du livre. */
function extraireAutour(
  lignes: readonly string[],
  morceaux: readonly string[],
): { readonly extrait: string; readonly surlignes: readonly Surlignage[]; readonly ligne: number; readonly debut: number } | undefined {
  for (const [rangLigne, ligne] of lignes.entries()) {
    const surlignes = trouver(ligne, morceaux);
    const premier = surlignes[0];
    if (premier === undefined) continue;

    // La suite entière si la ligne la porte, la première correspondance sinon. Les surlignages
    // restent tous : ce qui change est l'endroit qu'on montre, pas ce qu'on marque dedans.
    const laSuite = morceaux.length > 1 ? trouver(ligne, [morceaux[0]!]) : [];
    const centre = laSuite[0] ?? premier;

    // Une fenêtre autour de la correspondance : une ligne entière de trois cents signes ne se lit
    // pas dans une liste, et couper au milieu d'un mot se voit.
    const marge = 48;
    const debut = Math.max(0, centre.debut - marge);
    const fin = Math.min(ligne.length, centre.fin + marge);
    const coupe = ligne.slice(debut, fin);
    const extrait = `${debut > 0 ? "…" : ""}${coupe}${fin < ligne.length ? "…" : ""}`;
    const decalage = (debut > 0 ? 1 : 0) - debut;
    return {
      extrait,
      ligne: rangLigne,
      debut: centre.debut,
      surlignes: surlignes
        .filter((portion) => portion.debut >= debut && portion.fin <= fin)
        .map((portion) => ({ debut: portion.debut + decalage, fin: portion.fin + decalage })),
    };
  }
  return undefined;
}

/** Les correspondances d'une requête dans le texte original, avec les mêmes règles que la
 * palette : accents et casse ignorés, suite entière prioritaire, positions originales rendues. */
export function surlignagesDe(texte: string, requete: string): readonly Surlignage[] {
  const { phrase, mots } = morceauxDe(requete);
  if (phrase === "") return [];
  return trouver(texte, mots.length > 1 ? [phrase, ...mots] : mots);
}

/** Premier mot en capitale, le reste intact : les mots de la bibliothèque arrivent au singulier
 *  comme on les a écrits, et un intitulé commence par une capitale. */
function capitaliser(mot: string): string {
  return mot.charAt(0).toLocaleUpperCase("fr") + mot.slice(1);
}

/** Cherche dans une vue de bibliothèque et rend les groupes à afficher.
 *
 *  Une requête vide ne rend rien : une liste de tout n'est pas une réponse. */
export function chercher(
  vue: VueBibliotheque,
  requete: string,
  options: {
    readonly actions?: readonly Action[];
    readonly parGroupe?: number;
    /** Le texte du document, tel que la chaîne l'a rangé dans sa version.
     *
     *  En entrée à part, et non dans la vue : `PageAffichee.texte` existe au contrat et rien
     *  ne le remplit. Recopier les passages dedans donnerait deux endroits pour un même
     *  fait, et l'un des deux finirait par mentir. */
    readonly passages?: readonly Passage[];
  } = {},
): readonly Groupe[] {
  const { phrase, mots } = morceauxDe(requete);
  if (phrase === "") return [];
  const parGroupe = options.parGroupe ?? PAR_GROUPE;
  // La suite entière d'abord : c'est elle qu'on veut voir surlignée d'un seul tenant.
  const morceaux = mots.length > 1 ? [phrase, ...mots] : mots;

  const elements: Resultat[] = [];
  const pages: Resultat[] = [];
  const pistes: Resultat[] = [];

  for (const page of vue.pages) {
    // Une page se **désigne** par son rang, qu'on connaît toujours, et se **cite** par son
    // numéro imprimé, qu'on ne connaît pas toujours. Les confondre citait des pages sous un
    // numéro qu'elles ne portent pas — et, avant que le contrat ne les sépare, faisait
    // disparaître de la vue toute page d’un document dont rien n’est numéroté.
    const citation = citerPage(vue.mots, page);
    const ou = `${vue.nom} · ${citation}`;

    for (const element of page.elements) {
      const titre = element.titre === undefined ? element.numero : `${element.numero} — ${element.titre}`;
      const surlignesTitre = trouver(titre, morceaux);
      const autour = extraireAutour(page.texte, morceaux);
      if (surlignesTitre.length === 0 && autour === undefined) continue;
      elements.push({
        genre: "element",
        cle: `element:${element.ancreId}`,
        titre,
        surlignesTitre,
        source: ou,
        ...(autour === undefined ? {} : { extrait: autour.extrait, surlignesExtrait: autour.surlignes }),
        cote: citation,
        page: page.index,
        element: element.ancreId,
        ...(element.media === undefined ? {} : { piste: element.media.piste }),
      });

      // La piste reliée se trouve aussi par ce qu'on cherche : c'est le même élément, vu de
      // l'autre bout du lien (ANC-02).
      if (element.media !== undefined)
        pistes.push({
          genre: "piste",
          cle: `piste:${element.ancreId}`,
          titre: `${capitaliser(vue.mots.piste.un)} ${element.media.piste} — ${element.media.nom}`,
          surlignesTitre: trouver(`${capitaliser(vue.mots.piste.un)} ${element.media.piste} — ${element.media.nom}`, morceaux),
          source: `${vue.nom} · ${vue.mots.element.un} ${element.numero}`,
          ...(autour === undefined ? {} : { extrait: autour.extrait, surlignesExtrait: autour.surlignes }),
          page: page.index,
          element: element.ancreId,
          piste: element.media.piste,
        });
    }

    const titrePage = page.titre ?? capitaliser(citation);
    const surlignesTitre = trouver(titrePage, morceaux);
    const autour = extraireAutour(page.texte, morceaux);
    if (surlignesTitre.length > 0 || autour !== undefined)
      pages.push({
        genre: "page",
        cle: `page:${page.index}`,
        titre: titrePage,
        surlignesTitre,
        source: ou,
        ...(autour === undefined ? {} : { extrait: autour.extrait, surlignesExtrait: autour.surlignes }),
        cote: citation,
        page: page.index,
      });
  }

  // Le texte du document, lu là où il est écrit.
  //
  // La page se cite par son numéro **imprimé** quand il est connu : c'est celui que le lecteur a
  // sous les yeux (RCH-09). Et c'est bien `pageImprimee` qu'il faut lire, non `page` : la vue
  // range ses pages par numéro imprimé (`instantane.ts`), tandis que `Passage.page` est le rang
  // dans le document. Les confondre citerait le feuillet 57 pour un texte imprimé 42.
  //
  // Le numéro imprimé n'est pas toujours connu — mesuré sur un livre de quatre-vingt-seize
  // pages, sept numéros pour vingt-sept passages. À défaut on cite le rang, et on le dit.
  const parCitation = new Map<string, { imprimee?: number; rang: number; lignes: string[]; passages: number[] }>();
  for (const passage of options.passages ?? []) {
    const cle = passage.pageImprimee === undefined ? `rang:${passage.page}` : `imprime:${passage.pageImprimee}`;
    const deja = parCitation.get(cle);
    if (deja === undefined)
      parCitation.set(cle, {
        ...(passage.pageImprimee === undefined ? {} : { imprimee: passage.pageImprimee }),
        rang: passage.page,
        lignes: [passage.texte],
        passages: [passage.rang],
      });
    // Une page qui répond deux fois reste une page : on rassemble ses lignes au lieu de la
    // rendre deux fois dans la liste.
    else {
      deja.lignes.push(passage.texte);
      deja.passages.push(passage.rang);
    }
  }
  for (const [cle, citation] of parCitation) {
    const autour = extraireAutour(citation.lignes, morceaux);
    if (autour === undefined) continue;
    const cote = citerPage(vue.mots, { index: citation.rang, numero: citation.imprimee });
    const titre = capitaliser(cote);
    pages.push({
      genre: "page",
      cle: `passage:${cle}`,
      titre,
      surlignesTitre: trouver(titre, morceaux),
      source: vue.nom,
      extrait: autour.extrait,
      surlignesExtrait: autour.surlignes,
      cote,
      page: citation.rang,
      cibleRecherche: {
        passage: citation.passages[autour.ligne]!,
        debut: autour.debut,
        requete: requete.trim(),
      },
    });
  }

  const actions: Resultat[] = (options.actions ?? [])
    .filter((action) => {
      const ou = [action.titre, ...(action.aussi ?? [])].join(" ");
      return trouver(ou, morceaux).length > 0;
    })
    .map((action) => ({
      genre: "action" as const,
      cle: `action:${action.cle}`,
      titre: action.titre,
      surlignesTitre: trouver(action.titre, morceaux),
      source: action.source ?? "",
    }));

  // La suite entière d'abord, le mot isolé ensuite — et rien d'exclu.
  //
  // Mesuré sur sept vrais documents : « mémoire traumatique » rendait 462 résultats, dont
  // **cinq** portaient la suite. Les 457 autres ne portaient que « mémoire » ou que
  // « traumatique ». Les morceaux étaient déjà composés `[phrase, ...mots]` pour surligner la
  // suite d'un seul tenant, mais l'ordre n'en tenait pas compte.
  //
  // Un mot isolé reste une réponse, simplement moins sûre : on le descend, on ne le retire pas
  // (FMT-04). Et le tri vient **avant** le plafond — sinon les six lignes montrées resteraient
  // celles du bruit, et la correction ne changerait rien à ce qu'on voit.
  const porteLaSuite = (resultat: Resultat): boolean =>
    mots.length > 1 &&
    (trouver(resultat.titre, [phrase]).length > 0 || trouver(resultat.extrait ?? "", [phrase]).length > 0);
  // Le tri de JavaScript est stable : à sûreté égale, l'ordre de lecture est conservé.
  const parSurete = (liste: readonly Resultat[]): readonly Resultat[] =>
    [...liste].sort((un, autre) => Number(porteLaSuite(autre)) - Number(porteLaSuite(un)));

  const groupes: Groupe[] = [
    { genre: "element", libelle: capitaliser(vue.mots.element.plusieurs), resultats: parSurete(elements).slice(0, parGroupe) },
    { genre: "page", libelle: capitaliser(vue.mots.page.plusieurs), resultats: parSurete(pages).slice(0, parGroupe) },
    { genre: "piste", libelle: capitaliser(vue.mots.piste.plusieurs), resultats: parSurete(pistes).slice(0, parGroupe) },
    { genre: "action", libelle: "Actions", resultats: actions.slice(0, parGroupe) },
  ];
  return groupes.filter((groupe) => groupe.resultats.length > 0);
}

/** Tous les résultats à la file, dans l'ordre où l'écran les montre.
 *
 *  C'est cette suite que les flèches parcourent : sauter d'un groupe à l'autre sans y penser est
 *  exactement ce qu'on attend d'une liste, et la recalculer dans l'écran la ferait diverger. */
export function aLaFile(groupes: readonly Groupe[]): readonly Resultat[] {
  return groupes.flatMap((groupe) => groupe.resultats);
}

/** Découpe un texte en morceaux surlignés ou non, pour que l'écran n'ait rien à calculer. */
export function morceler(
  texte: string,
  surlignes: readonly Surlignage[],
): readonly { readonly texte: string; readonly marque: boolean }[] {
  const morceaux: { texte: string; marque: boolean }[] = [];
  let rang = 0;
  for (const portion of surlignes) {
    if (portion.debut > rang) morceaux.push({ texte: texte.slice(rang, portion.debut), marque: false });
    morceaux.push({ texte: texte.slice(portion.debut, portion.fin), marque: true });
    rang = portion.fin;
  }
  if (rang < texte.length) morceaux.push({ texte: texte.slice(rang), marque: false });
  return morceaux;
}
