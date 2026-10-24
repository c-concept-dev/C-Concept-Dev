import { readFile } from "node:fs/promises";
import { entreesZip } from "@lienotheque/formats";

/** Lire un EPUB : des chapitres, pas des pages (RCH-07, RCH-09, étape 7 du chemin du texte).
 *
 *  ## Ce qu'un EPUB offre vraiment, mesuré
 *
 *  Quatre EPUB du corpus sondés le 20 octobre 2026 : **aucun** ne porte de pagination d'édition
 *  imprimée — ni `page-list`, ni repère `pagebreak`. « Toujours sur la vraie page » n'a donc pas
 *  de sens littéral ici, et fabriquer des numéros reviendrait à promettre une vérification que
 *  personne ne pourrait faire.
 *
 *  Et le découpage de l'auteur ne fait pas mesure : le même corpus donne **3 fichiers de
 *  contenu** pour un livre et **69** pour un autre, 1 Kio médian contre 16. « Chapitre 1 sur 3 »
 *  ne situe rien.
 *
 *  ## Ce qui a été décidé, et ce que chaque pièce porte
 *
 *  | | |
 *  |---|---|
 *  | le **rang** | un découpage régulier en **feuillets**, figé avec la version |
 *  | la **vérifiabilité** | le texte exact du feuillet, qui est son propre repère |
 *  | le **contexte** | le chapitre d'où il vient |
 *
 *  Un feuillet **n'est pas une page**, et ne s'appelle pas ainsi : le contrat garde
 *  `pageImprimee` absent, et l'écran dit alors « passage 47 du document » plutôt qu'un numéro
 *  que le livre ne porte pas — `citerPage` tient déjà cette règle.
 *
 *  Il donne ce que le chapitre ne donne pas : une granularité comparable d'un livre à l'autre, et
 *  un rang stable tant que la version ne change pas. Une version est immuable, donc le découpage
 *  l'est aussi — c'est ce qui rend une citation reproductible.
 */

/** Combien de mots porte un feuillet.
 *
 *  **Figé avec la version**, et c'est le point : changer cette valeur renumérote toutes les
 *  citations d'un livre déjà lu. La toucher demande de relire les documents concernés, comme
 *  changer une recette le demande.
 *
 *  Trois cents mots, parce que c'est l'ordre de grandeur d'une page de livre — assez pour qu'un
 *  feuillet porte une idée, assez peu pour qu'une citation ne se perde pas dedans. */
export const TAILLE_FEUILLET = 300;

const BLOCS = /<\/?(p|div|br|h[1-6]|li|tr|td|th|section|article|blockquote|figcaption)\b[^>]*>/gi;
const SANS_TEXTE = /<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi;
const BALISES = /<[^>]*>/g;

const ENTITES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Le texte lisible d'un chapitre, débarrassé de son balisage.
 *
 *  Les blocs deviennent des espaces **avant** que les balises disparaissent : sans cela
 *  « …la fin.</p><p>Le début… » donne « la fin.Le début », deux phrases soudées qu'aucune
 *  recherche de phrase ne retrouve. */
export function texteDuXhtml(xhtml: string): string {
  return xhtml
    .replace(SANS_TEXTE, " ")
    .replace(BLOCS, " ")
    .replace(BALISES, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (entier, nom: string) => ENTITES[nom.toLowerCase()] ?? entier)
    .replace(/\s+/g, " ")
    .trim();
}

/** La langue que le **livre** déclare.
 *
 *  Et non celle de la bibliothèque : une bibliothèque dit la langue de sa collection, un livre
 *  dit la sienne. Mesuré sur le corpus, l'un des quatre EPUB sondés est en anglais dans une
 *  bibliothèque française — s'en remettre à la bibliothèque l'aurait lu de travers. */
export function langueDeLOpf(opf: string): string | undefined {
  const trouve = /<dc:language[^>]*>([^<]+)<\/dc:language>/i.exec(opf) ?? /<language[^>]*>([^<]+)<\/language>/i.exec(opf);
  const langue = trouve?.[1]?.trim();
  return langue === undefined || langue === "" ? undefined : langue;
}

/** Le chemin d'un fichier cité par l'OPF, ramené à sa place dans l'archive. */
function depuisLOpf(cheminOpf: string, href: string): string {
  const dossier = cheminOpf.includes("/") ? cheminOpf.slice(0, cheminOpf.lastIndexOf("/") + 1) : "";
  const brut = decodeURIComponent(href.split("#")[0] ?? "");
  const morceaux: string[] = [];
  for (const morceau of `${dossier}${brut}`.split("/")) {
    if (morceau === "." || morceau === "") continue;
    if (morceau === "..") morceaux.pop();
    else morceaux.push(morceau);
  }
  return morceaux.join("/");
}

/** Les chapitres dans l'ordre où ils se lisent.
 *
 *  **La colonne vertébrale fait foi, jamais le manifeste.** Le manifeste est un inventaire, et
 *  son ordre est celui de l'éditeur de l'EPUB ; la colonne vertébrale est l'ordre du livre. Les
 *  confondre met un livre à l'envers, et c'est le genre de défaut qu'on ne voit qu'à la lecture.
 *
 *  Ce que la colonne vertébrale ne cite pas reste dehors : feuilles de style, images, notices. */
export function ordreDeLecture(opf: string, cheminOpf: string): readonly string[] {
  const parId = new Map<string, string>();
  for (const item of opf.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const attributs = item[1] ?? "";
    const id = /\bid\s*=\s*"([^"]*)"/i.exec(attributs)?.[1];
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attributs)?.[1];
    if (id !== undefined && href !== undefined) parId.set(id, depuisLOpf(cheminOpf, href));
  }

  const ordre: string[] = [];
  for (const renvoi of opf.matchAll(/<itemref\b([^>]*)\/?>/gi)) {
    const idref = /\bidref\s*=\s*"([^"]*)"/i.exec(renvoi[1] ?? "")?.[1];
    const chemin = idref === undefined ? undefined : parId.get(idref);
    if (chemin !== undefined) ordre.push(chemin);
  }
  return ordre;
}

export type Feuillet = {
  /** Son rang de lecture dans le livre, à partir de un. C'est lui qui tient lieu de page. */
  readonly rang: number;
  readonly texte: string;
  /** Le chapitre d'où il vient : montré à l'écran, jamais employé pour citer. */
  readonly chapitre: string;
};

/** Coupe le livre en feuillets réguliers, sans jamais faire chevaucher deux chapitres.
 *
 *  Un feuillet à cheval appartiendrait à deux chapitres, et le contexte affiché mentirait sur
 *  l'un des deux. Un chapitre court donne donc un feuillet court — c'est le bon compromis : le
 *  rang reste juste, et seule la régularité souffre là où l'auteur a fait court.
 *
 *  La coupe tombe **entre les mots**. Un feuillet qui commencerait par « ésie » ne se citerait
 *  pas, et une recherche de phrase le raterait. */
export function enFeuillets(chapitres: readonly { nom: string; texte: string }[]): readonly Feuillet[] {
  const feuillets: Feuillet[] = [];
  for (const chapitre of chapitres) {
    const mots = chapitre.texte.split(/\s+/).filter((mot) => mot !== "");
    for (let depuis = 0; depuis < mots.length; depuis += TAILLE_FEUILLET)
      feuillets.push({
        rang: feuillets.length + 1,
        texte: mots.slice(depuis, depuis + TAILLE_FEUILLET).join(" "),
        chapitre: chapitre.nom,
      });
  }
  return feuillets;
}

export type EpubLu = {
  readonly feuillets: readonly Feuillet[];
  /** La langue déclarée par le livre, quand il en déclare une. */
  readonly langue?: string | undefined;
  readonly chapitres: number;
};

/** Ouvre un EPUB et le rend en feuillets.
 *
 *  Le chemin de l'OPF se lit dans `META-INF/container.xml`, qu'un EPUB conforme porte toujours à
 *  cet endroit exact — c'est la seule entrée dont la place soit fixée par la norme, et c'est
 *  pourquoi on part de là plutôt que de chercher un `.opf` au hasard. */
export async function lireEpub(chemin: string): Promise<EpubLu> {
  const entrees = entreesZip(Buffer.from(await readFile(chemin)));

  const container = entrees.get("META-INF/container.xml")?.toString("utf8");
  if (container === undefined) throw new Error(`Cet EPUB n'a pas de « META-INF/container.xml » : ${chemin}`);
  const cheminOpf = /<rootfile\b[^>]*full-path\s*=\s*"([^"]+)"/i.exec(container)?.[1];
  if (cheminOpf === undefined) throw new Error(`Cet EPUB ne dit pas où est sa description : ${chemin}`);

  const opf = entrees.get(decodeURIComponent(cheminOpf))?.toString("utf8");
  if (opf === undefined) throw new Error(`La description de cet EPUB est introuvable (${cheminOpf}) : ${chemin}`);

  const chapitres = ordreDeLecture(opf, decodeURIComponent(cheminOpf))
    .map((nom) => ({ nom, texte: texteDuXhtml(entrees.get(nom)?.toString("utf8") ?? "") }))
    .filter((chapitre) => chapitre.texte !== "");

  const langue = langueDeLOpf(opf);
  return {
    feuillets: enFeuillets(chapitres),
    ...(langue === undefined ? {} : { langue }),
    chapitres: chapitres.length,
  };
}
