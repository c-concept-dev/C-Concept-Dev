import type { ClassementLocal, SchemaBibliotheque, ValeursAxe } from "@lienotheque/contrats";
import { classerUnDocument } from "@lienotheque/noyau";

/** Reprendre le classement d'une base existante, sans rien inventer (CLA-01, CLA-03).
 *
 *  Deux tables, et deux occasions de perdre un document en silence : un appariement nomme un
 *  **fichier**, une seconde table donne l'**approche** de l'ouvrage. Ce qui ne se résout pas
 *  sort nommé, avec sa raison — on ne range pas au hasard, et on ne se tait pas.
 *
 *  Rien ici ne connaît de domaine : les axes visés sont fournis par l'appelant, jamais écrits
 *  dans le code. */

export type Appariement = { readonly fichier: string; readonly book_id: string };
export type ApprocheOuvrage = { readonly book_id: string; readonly approach: string; readonly language: string };
export type DocumentConnu = { readonly empreinte: string; readonly nom: string };
export type Ecart = { readonly nom: string; readonly raison: string };

export type ResultatImport = {
  readonly table: Readonly<Record<string, ClassementLocal>>;
  /** Les documents qu'aucun appariement ne nomme : ils restent à classer à la main. */
  readonly sansAppariement: readonly string[];
  /** Ceux qu'on a renoncé à ranger, chacun avec sa raison. */
  readonly ecartes: readonly Ecart[];
};

/** Le nom d'un fichier, comparable d'une table à l'autre.
 *
 *  Deux pièges, tous deux mesurés sur les vraies données :
 *
 *  1. La table d'appariement porte des **chemins** (« IRIS SCAN/dossier 3/… »), la bibliothèque
 *     des noms. On compare la dernière composante.
 *  2. La table les porte en **NFD** — la forme du système de fichiers macOS — et la bibliothèque
 *     en **NFC**. Les deux chaînes s'affichent à l'identique et comparent inégal : sans cette
 *     normalisation, seuls les titres sans accent s'apparient, et le reste se perd sans un mot. */
function nomComparable(chemin: string): string {
  const dernier = chemin.split("/").at(-1) ?? chemin;
  return dernier.normalize("NFC");
}

export function importerLesClassements(entree: {
  readonly schema: SchemaBibliotheque;
  /** Quel axe du schéma reçoit l'approche, lequel reçoit la langue. */
  readonly axes: { readonly approche: string; readonly langue: string };
  readonly documents: readonly DocumentConnu[];
  readonly apparies: readonly Appariement[];
  readonly approches: readonly ApprocheOuvrage[];
  /** Les ouvrages explicitement tenus hors de l'import automatique. */
  readonly horsPerimetre?: readonly string[];
}): ResultatImport {
  const parNom = new Map(entree.apparies.map((a) => [nomComparable(a.fichier), a.book_id]));
  const parOuvrage = new Map(entree.approches.map((a) => [a.book_id, a]));
  const exclus = new Set(entree.horsPerimetre ?? []);

  const table: Record<string, ClassementLocal> = {};
  const sansAppariement: string[] = [];
  const ecartes: Ecart[] = [];
  const reference = (valeur: string): ValeursAxe => ({ type: "reference", valeurs: [valeur] });

  for (const document of entree.documents) {
    const ouvrage = parNom.get(nomComparable(document.nom));
    if (ouvrage === undefined) {
      sansAppariement.push(document.nom);
      continue;
    }
    if (exclus.has(ouvrage)) {
      ecartes.push({ nom: document.nom, raison: `« ${ouvrage} » est hors périmètre de l’import automatique` });
      continue;
    }
    const connu = parOuvrage.get(ouvrage);
    if (connu === undefined) {
      ecartes.push({ nom: document.nom, raison: `aucune approche connue pour « ${ouvrage} »` });
      continue;
    }
    try {
      // Un seul document mal classé ne doit pas emporter les deux cent quinze autres : on
      // l'écarte en nommant la valeur fautive, et l'import continue.
      table[document.empreinte] = classerUnDocument(
        entree.schema,
        document.empreinte,
        { [entree.axes.approche]: reference(connu.approach), [entree.axes.langue]: reference(connu.language) },
        "import",
      );
    } catch (refus) {
      ecartes.push({ nom: document.nom, raison: refus instanceof Error ? refus.message : String(refus) });
    }
  }

  return { table, sansAppariement, ecartes };
}
