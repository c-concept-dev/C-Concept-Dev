import type { ClassementLocal, OrigineClassement, SchemaBibliotheque, ValeursAxe } from "@lienotheque/contrats";
import { GesteRefuse } from "./organisation.js";

/** Ranger un document sur les axes de sa bibliothèque (CLA-01, CLA-02, CLA-03).
 *
 *  Un seul geste pour les deux déclencheurs — l'import d'une base existante et la main de la
 *  personne —, parce qu'ils écrivent la même chose et doivent la vérifier pareillement. Ce qui
 *  les distingue voyage dans `origine`, et ne se perd pas en chemin.
 *
 *  Rien ici ne connaît de domaine : des axes, des clés, des valeurs. Les mots viennent du
 *  schéma de la bibliothèque (CLA-01). */

const refus = (raison: string): never => {
  throw new GesteRefuse(raison);
};

/** La clé courante d'une valeur : elle-même, celle qu'elle aliase, ou celle vers qui elle redirige.
 *
 *  Une base ancienne porte les noms d'hier. Les refuser perdrait le classement d'un document
 *  pour une décision de vocabulaire prise après lui — alors que le schéma sait exactement où
 *  cette valeur a mené (CLA-03). */
function clefCourante(axe: SchemaBibliotheque["axes"][number], demandee: string, ouAxe: string): string {
  const directe = axe.valeurs.find((valeur) => valeur.cle === demandee);
  const par = directe ?? axe.valeurs.find((valeur) => valeur.alias.includes(demandee));
  if (par === undefined) return refus(`L'axe « ${ouAxe} » ne porte pas la valeur « ${demandee} ».`);
  if (!par.retiree) return par.cle;
  // Le contrat garantit qu'une valeur retirée redirige : si elle ne le fait pas, c'est le schéma
  // qui est abîmé, et le dire vaut mieux que ranger le document sous une valeur morte.
  if (par.redirigeVers === undefined)
    return refus(`La valeur « ${demandee} » est retirée et ne redirige vers rien : le schéma est incomplet.`);
  return clefCourante(axe, par.redirigeVers, ouAxe);
}

/** Le classement d'un document, vérifié contre le schéma de sa bibliothèque.
 *
 *  Un document sans rien à ranger rend un classement sans axe : c'est un fait, pas une panne.
 *  C'est même le cas qu'il faut pouvoir dire — « ce document n'est rangé nulle part » — plutôt
 *  que de lui inventer une valeur par défaut. */
export function classerUnDocument(
  schema: SchemaBibliotheque,
  empreinte: string,
  apports: Readonly<Record<string, ValeursAxe>>,
  origine: OrigineClassement,
): ClassementLocal {
  const axes: Record<string, ValeursAxe> = {};

  for (const [cleAxe, apport] of Object.entries(apports)) {
    const axe = schema.axes.find((candidat) => candidat.cle === cleAxe || candidat.alias.includes(cleAxe));
    if (axe === undefined) return refus(`Cette bibliothèque n'a pas d'axe « ${cleAxe} ».`);

    if (apport.type === "reference") {
      if (axe.nature !== "referentiel" && axe.nature !== "liste_semi_ouverte")
        return refus(`L'axe « ${axe.nom} » ne se range pas par valeurs de référence.`);
      const valeurs = apport.valeurs.map((demandee) => clefCourante(axe, demandee, axe.nom));
      // Une redirection peut amener deux valeurs différentes sur la même : on ne range pas deux
      // fois sous la même valeur.
      const uniques = [...new Set(valeurs)];
      if (axe.cardinalite === "une" && uniques.length > 1)
        return refus(`L'axe « ${axe.nom} » ne prend qu'une valeur, et ${uniques.length} ont été apportées.`);
      axes[axe.cle] = { type: "reference", valeurs: uniques };
      continue;
    }
    axes[axe.cle] = apport;
  }

  return { empreinte, schema: schema.cle, schemaVersion: schema.version, axes, origine };
}
