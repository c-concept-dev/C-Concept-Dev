/** Un journal en **ajout seul** : ses entrées sont numérotées sans trou, et aucune n'est jamais
 *  réécrite (dette D12, seconde moitié).
 *
 *  ## D'où vient ce garde-fou
 *
 *  Du 8 novembre 2026. Les rangées **13 à 17** du registre des poussées s'étaient retrouvées en
 *  ordre **décroissant**, et la phrase qui s'appuyait dessus annonçait **13 poussées** quand il y
 *  en avait **17** — fausse sans que rien ne le signale. Un journal dont l'ordre porte du sens a
 *  besoin d'une mécanique, pas d'une relecture attentive.
 *
 *  La première moitié de la dette — toute empreinte citée existe dans l'historique — a été payée
 *  au lot 0m. Voici les deux garanties d'origine : **des numéros consécutifs et croissants**, et
 *  **aucune ligne ancienne modifiée**.
 *
 *  ## Pourquoi le relevé d'empreintes annoncé n'a pas été écrit
 *
 *  La ligne du lot prévoyait d'enregistrer l'empreinte de chaque ligne dans un fichier de
 *  références, « comme le gel de l'archive le fait pour un fichier entier », en avertissant que le
 *  premier relevé **figerait l'état actuel** et ne prouverait rien du passé.
 *
 *  Ce relevé est inutile : **l'historique Git est déjà le relevé**. Mesuré avant d'écrire ce
 *  module — les **35** versions passées du registre se lisent en **108 ms** en une commande, et la
 *  comparaison entrée par entrée sur ces 35 versions plus la copie de travail ne trouve **aucune**
 *  entrée réécrite, sur 36 entrées. Le garde-fou prouve donc le passé **entier** au lieu de figer
 *  le présent, et il n'ajoute aucune donnée à tenir à jour. L'avertissement de la ligne du lot
 *  tombe avec le relevé qui le motivait.
 *
 *  ## Pourquoi l'entête, et pas le motif seul
 *
 *  Une ligne « `| 37 |` » n'est pas en soi une entrée de journal : l'archive gelée en porte
 *  **125**, qui sont des rangées de mesure et de comparaison. Les entrées se comptent donc **après
 *  l'entête du journal**, et un entête absent est un rouge — non un journal vide.
 */

/** L'entête qui ouvre la table du journal. Tout ce qui précède est de la prose, et la prose,
 *  elle, se corrige : la règle d'ajout seul porte sur les **entrées**. */
export const ENTETE_DU_JOURNAL = "| # | commits poussés | autorisation | origine, conditions, marge |";

/** Le premier numéro que le registre porte. **Donnée, et non règle en dur** : les autorisations
 *  **1 à 18** vivent dans `docs/decisions.md`, dont la section « 6 novembre 2026 — Les
 *  autorisations de push » porte exactement 1 à 18, consécutifs — vérifié — et dont l'empreinte
 *  est gelée par `archive-gelee`. Ce 18 ne peut donc plus bouger, et 19 avec lui. */
export const PREMIER_NUMERO = 19;

/** Une entrée, telle qu'une ligne du journal la porte. */
export interface EntreeDeJournal {
  readonly numero: number;
  /** La ligne entière, accents graves et espaces compris : c'est elle qu'on compare. */
  readonly ligne: string;
}

const DEBUT_DE_LIGNE = /^\| (\d+) \|/u;

/** Les rangées du journal qui ne sont pas des entrées lisibles, dites en français. Vide quand la
 *  table est en ordre.
 *
 *  **Pourquoi ce contrôle existe, et il n'était pas prévu** : l'entrée du lot 18 est partie
 *  **sans son numéro** — quatre colonnes attendues, trois écrites, le commit à la place du
 *  numéro — et elle a traversé un contrôle complet, une poussée et une course verte sans que rien
 *  ne le dise. Les deux contrôles de ce module ne pouvaient pas la voir : une rangée sans numéro
 *  n'est pas une entrée **pour eux**, donc ils ne la comptaient ni ne la comparaient. Un garde-fou
 *  qui ne juge que ce qu'il reconnaît laisse passer ce qu'il ne reconnaît pas, et c'est le pire
 *  endroit où être aveugle : la rangée existait, elle rapportait une poussée, et le journal
 *  pouvait désormais porter une poussée **sans numéro** — ce que la numérotation continue de
 *  l'archive devait justement empêcher. */
export function rangeesQuiNeSontPasDesEntrees(texte: string): readonly string[] {
  const lignes = texte.split("\n");
  const entete = lignes.indexOf(ENTETE_DU_JOURNAL);
  if (entete === -1) return [`l'entête « ${ENTETE_DU_JOURNAL} » manque`];
  const colonnes = ENTETE_DU_JOURNAL.split("|").length;
  return lignes.slice(entete + 1).flatMap((ligne, rang) => {
    if (!ligne.startsWith("|")) return [];
    if (/^\|[-| ]+\|$/u.test(ligne)) return []; // la ligne de séparation de la table
    const ou = `rangée ${rang + 1} après l'entête`;
    if (DEBUT_DE_LIGNE.exec(ligne) === null)
      return [`${ou} : ne commence pas par un numéro — « ${ligne.slice(0, 40)}… »`];
    const vues = ligne.split("|").length;
    if (vues === colonnes) return [];
    //  Trop de colonnes : la cause est presque toujours une barre verticale écrite dans une
    //  cellule. L'échappement markdown n'y change rien — ce découpage compte les barres, il
    //  n'interprète pas le markdown —, et la règle se dit donc ici, à la seconde où on la viole,
    //  plutôt que dans un document qu'il faudrait penser à ouvrir. Entrée 65 du registre : une
    //  rangée a compté huit colonnes pour quatre parce qu'une clause de shell y était citée.
    const regle =
      vues > colonnes
        ? " — pas de barre verticale dans une cellule, même échappée ; l'écrire en mots"
        : "";
    return [`${ou} : ${vues - 2} colonne(s) au lieu de ${colonnes - 2}${regle}`];
  });
}

/** Les entrées d'un journal, dans l'ordre où elles paraissent. Rien avant l'entête n'est lu. */
export function entreesDuJournal(texte: string): readonly EntreeDeJournal[] {
  const lignes = texte.split("\n");
  const entete = lignes.indexOf(ENTETE_DU_JOURNAL);
  if (entete === -1) return [];
  return lignes.slice(entete + 1).flatMap((ligne) => {
    const trouve = DEBUT_DE_LIGNE.exec(ligne);
    return trouve === null ? [] : [{ numero: Number(trouve[1]), ligne }];
  });
}

/** Ce qui cloche dans la numérotation, dit en français. Vide quand elle est en ordre.
 *
 *  Trois défauts, et le même mécanisme les attrape : un trou, un doublon, un retour en arrière.
 *  Chacun est nommé séparément, parce qu'un rouge qui dit « 13, 17, 16 » apprend plus qu'un rouge
 *  qui dit « numérotation incorrecte ». */
export function rupturesDeNumerotation(
  entrees: readonly EntreeDeJournal[],
  premier = PREMIER_NUMERO,
): readonly string[] {
  if (entrees.length === 0) return [`aucune entrée lue : l'entête « ${ENTETE_DU_JOURNAL} » manque-t-il ?`];
  const ruptures: string[] = [];
  const debut = entrees[0]?.numero;
  if (debut !== premier) ruptures.push(`la première entrée porte ${debut} et non ${premier}`);
  entrees.forEach((entree, rang) => {
    if (rang === 0) return;
    const avant = entrees[rang - 1]?.numero ?? 0;
    const attendu = avant + 1;
    if (entree.numero === attendu) return;
    const cause =
      entree.numero === avant ? "deux fois le même numéro" : entree.numero < avant ? "un retour en arrière" : "un trou";
    ruptures.push(`après ${avant} vient ${entree.numero} : ${cause} (attendu ${attendu})`);
  });
  return ruptures;
}
