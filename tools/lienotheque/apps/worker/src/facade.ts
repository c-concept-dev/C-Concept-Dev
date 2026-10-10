import { z } from "zod";
import type { BaseSql } from "./registre.js";

/** La façade de compatibilité (INT-04, RCH-12).
 *
 *  Elle rend ce que l'application qui existe attend, depuis le schéma qui est le nôtre. Les
 *  parcours de cette application doivent être inchangés après la bascule : ce n'est donc pas à
 *  elle de s'adapter, c'est à nous.
 *
 *  **Aucun mot de domaine ici** (CLA-01). Les noms de champs que la façade rend sont ceux que
 *  l'application demande — `content`, `page_number` — et ils viennent d'une **correspondance
 *  rangée dans la bibliothèque**, exactement comme un modèle de classement. Le code ne connaît
 *  ni auteur, ni approche, ni langue : il connaît « un champ de sortie, et où le prendre ». */

/** Où prendre la valeur d'un champ de sortie.
 *
 *  `colonne` : une colonne du schéma, nommée dans une liste close — pas un morceau de SQL.
 *  `axe` : un axe du classement du document, lu dans son JSON.
 *  `null` : le champ existe dans la réponse mais ne porte rien. */
export const Source = z.union([
  z.object({ colonne: z.enum(["document.id", "document.titre", "passage.texte", "passage.rang", "ancre.page"]) }).strict(),
  z.object({ axe: z.string().regex(/^[a-z][a-z0-9_]*$/, "Nom d'axe en minuscules") }).strict(),
  z.null(),
]);
export type Source = z.infer<typeof Source>;

/** La correspondance : un champ de sortie, une source. */
export const Correspondance = z.record(z.string().regex(/^[a-z][a-z0-9_]*$/, "Nom de champ en minuscules"), Source);
export type Correspondance = z.infer<typeof Correspondance>;

/** Ce que la base sait rendre pour un passage, avant projection. */
type LigneBrute = {
  document_id: string;
  document_titre: string;
  passage_texte: string;
  passage_rang: number;
  ancre_selecteur: string | null;
  classement_axes: string | null;
};

/** La requête qui ramène les passages, avec ce qu'il faut pour les projeter.
 *
 *  Une seule requête, écrite une fois : les colonnes ne sont pas composées depuis la
 *  correspondance. C'est volontaire — construire du SQL à partir d'une donnée, même la nôtre,
 *  demande de prouver qu'elle ne peut rien injecter. Ici il n'y a rien à prouver : la
 *  correspondance choisit **où lire** dans un résultat, jamais **ce qu'on demande**. */
const REQUETE_BASE = `
  SELECT d.id AS document_id, d.titre AS document_titre,
         p.texte AS passage_texte, p.rang AS passage_rang,
         a.selecteur AS ancre_selecteur, c.axes AS classement_axes
  FROM passage p
  JOIN version v ON v.id = p.version_id
  JOIN document d ON d.id = v.document_id
  LEFT JOIN ancre a ON a.id = p.ancre_id
  LEFT JOIN classement c ON c.document_id = d.id
`;

const pageDe = (selecteur: string | null): number | null => {
  if (selecteur === null) return null;
  try {
    const lu = JSON.parse(selecteur) as { page?: unknown; numero?: unknown };
    for (const valeur of [lu.page, lu.numero]) if (typeof valeur === "number") return valeur;
  } catch {
    // Un sélecteur illisible ne vaut pas une erreur : le passage existe, sa page est inconnue.
  }
  return null;
};

const axeDe = (axes: string | null, nom: string): string | null => {
  if (axes === null) return null;
  try {
    const lu = JSON.parse(axes) as Record<string, unknown>;
    const valeur = lu[nom];
    if (typeof valeur === "string") return valeur;
    if (Array.isArray(valeur) && typeof valeur[0] === "string") return valeur[0];
  } catch {
    // Idem : un classement illisible laisse le champ vide, il n'interrompt rien.
  }
  return null;
};

/** Projette une ligne brute sur les champs que l'application attend. */
export function projeter(ligne: LigneBrute, correspondance: Correspondance): Record<string, unknown> {
  const rendu: Record<string, unknown> = {};
  for (const [champ, source] of Object.entries(correspondance)) {
    if (source === null) {
      rendu[champ] = null;
      continue;
    }
    if ("axe" in source) {
      rendu[champ] = axeDe(ligne.classement_axes, source.axe);
      continue;
    }
    switch (source.colonne) {
      case "document.id":
        rendu[champ] = ligne.document_id;
        break;
      case "document.titre":
        rendu[champ] = ligne.document_titre;
        break;
      case "passage.texte":
        rendu[champ] = ligne.passage_texte;
        break;
      case "passage.rang":
        rendu[champ] = ligne.passage_rang;
        break;
      case "ancre.page":
        rendu[champ] = pageDe(ligne.ancre_selecteur);
        break;
    }
  }
  return rendu;
}

/** Ce qu'on peut demander à la façade. Tout est borné : une limite sans plafond est une façon
 *  de demander à la base de s'arrêter elle-même. */
export const PLAFOND = 50;
const borner = (combien: unknown): number => {
  const nombre = typeof combien === "number" ? Math.floor(combien) : 5;
  return Math.min(Math.max(nombre, 1), PLAFOND);
};

/** Les mots d'une requête, préparés pour l'index plein texte.
 *
 *  On ne passe jamais la phrase de l'utilisateur telle quelle à FTS5 : sa syntaxe a des
 *  opérateurs, et un guillemet mal placé fait répondre une erreur là où l'on attendait zéro
 *  résultat. Chaque mot est cité, et les mots sont liés par OU — comme le fait la recherche
 *  qu'on doit égaler. */
export function motsPourIndex(phrase: string): string | undefined {
  const mots = phrase
    .split(/[^\p{L}\p{N}]+/u)
    .filter((mot) => mot.length >= 2)
    .slice(0, 16)
    .map((mot) => `"${mot.replaceAll('"', "")}"`);
  return mots.length === 0 ? undefined : mots.join(" OR ");
}

/** Cherche des passages, et les rend à la forme attendue. */
export async function chercher(
  base: BaseSql,
  correspondance: Correspondance,
  demande: { readonly query?: unknown; readonly topK?: unknown },
): Promise<readonly Record<string, unknown>[]> {
  const phrase = typeof demande.query === "string" ? demande.query : "";
  const mots = motsPourIndex(phrase);
  const combien = borner(demande.topK);
  if (mots === undefined) return [];

  const { results } = await base
    .prepare(
      `${REQUETE_BASE} JOIN passage_texte t ON t.rowid = p.rowid WHERE passage_texte MATCH ? ORDER BY bm25(passage_texte) LIMIT ?`,
    )
    .bind(mots, combien)
    .all<LigneBrute>();
  return results.map((ligne) => projeter(ligne, correspondance));
}

/** Compte les passages par valeur d'axe, pour les filtres.
 *
 *  Les axes demandés viennent de la correspondance, et les comptes se font **en mémoire** sur le
 *  résultat : compter en SQL demanderait de composer un `json_extract` depuis un nom reçu, et
 *  l'économie ne vaut pas la preuve qu'il faudrait écrire. */
export async function compter(
  base: BaseSql,
  correspondance: Correspondance,
  champs: readonly string[],
  demande: { readonly query?: unknown },
): Promise<Record<string, Record<string, number>>> {
  const phrase = typeof demande.query === "string" ? demande.query : "";
  const mots = motsPourIndex(phrase);
  const { results } =
    mots === undefined
      ? await base.prepare(`${REQUETE_BASE} LIMIT 5000`).bind().all<LigneBrute>()
      : await base
          .prepare(`${REQUETE_BASE} JOIN passage_texte t ON t.rowid = p.rowid WHERE passage_texte MATCH ? LIMIT 5000`)
          .bind(mots)
          .all<LigneBrute>();

  const comptes: Record<string, Record<string, number>> = {};
  for (const champ of champs) comptes[champ] = {};
  for (const ligne of results) {
    const projete = projeter(ligne, correspondance);
    for (const champ of champs) {
      const valeur = projete[champ];
      if (typeof valeur !== "string" || valeur.length === 0) continue;
      comptes[champ]![valeur] = (comptes[champ]![valeur] ?? 0) + 1;
    }
  }
  return comptes;
}
