import type { VueBibliotheque } from "@lienotheque/contrats";

/** Chercher dans une bibliothèque, sans rien envoyer nulle part (RCH, UX-02).
 *
 *  Tout se passe sur la machine : ce qu'on cherche dans sa propre bibliothèque ne regarde
 *  personne d'autre. L'index, c'est la vue elle-même — il n'y a pas de second magasin à tenir à
 *  jour, donc pas de second magasin à voir diverger.
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

/** Un extrait du texte autour de la première correspondance, avec ses positions recalées. */
function extraireAutour(
  lignes: readonly string[],
  morceaux: readonly string[],
): { readonly extrait: string; readonly surlignes: readonly Surlignage[] } | undefined {
  for (const ligne of lignes) {
    const surlignes = trouver(ligne, morceaux);
    const premier = surlignes[0];
    if (premier === undefined) continue;

    // Une fenêtre autour de la correspondance : une ligne entière de trois cents signes ne se lit
    // pas dans une liste, et couper au milieu d'un mot se voit.
    const marge = 48;
    const debut = Math.max(0, premier.debut - marge);
    const fin = Math.min(ligne.length, premier.fin + marge);
    const coupe = ligne.slice(debut, fin);
    const extrait = `${debut > 0 ? "…" : ""}${coupe}${fin < ligne.length ? "…" : ""}`;
    const decalage = (debut > 0 ? 1 : 0) - debut;
    return {
      extrait,
      surlignes: surlignes
        .filter((portion) => portion.debut >= debut && portion.fin <= fin)
        .map((portion) => ({ debut: portion.debut + decalage, fin: portion.fin + decalage })),
    };
  }
  return undefined;
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
  options: { readonly actions?: readonly Action[]; readonly parGroupe?: number } = {},
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
    const ou = `${vue.nom} · ${vue.mots.page.un} ${page.numero}`;

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
        cote: `${vue.mots.page.un} ${page.numero}`,
        page: page.numero,
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
          page: page.numero,
          element: element.ancreId,
          piste: element.media.piste,
        });
    }

    const titrePage = page.titre ?? `${capitaliser(vue.mots.page.un)} ${page.numero}`;
    const surlignesTitre = trouver(titrePage, morceaux);
    const autour = extraireAutour(page.texte, morceaux);
    if (surlignesTitre.length > 0 || autour !== undefined)
      pages.push({
        genre: "page",
        cle: `page:${page.numero}`,
        titre: titrePage,
        surlignesTitre,
        source: ou,
        ...(autour === undefined ? {} : { extrait: autour.extrait, surlignesExtrait: autour.surlignes }),
        cote: `${vue.mots.page.un} ${page.numero}`,
        page: page.numero,
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

  const groupes: Groupe[] = [
    { genre: "element", libelle: capitaliser(vue.mots.element.plusieurs), resultats: elements.slice(0, parGroupe) },
    { genre: "page", libelle: capitaliser(vue.mots.page.plusieurs), resultats: pages.slice(0, parGroupe) },
    { genre: "piste", libelle: capitaliser(vue.mots.piste.plusieurs), resultats: pistes.slice(0, parGroupe) },
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
