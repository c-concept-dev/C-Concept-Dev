import {
  type Axe,
  type CardinaliteAxe,
  type NatureAxe,
  SchemaBibliotheque,
  type ValeurReferentiel,
} from "@lienotheque/contrats";

/** Organiser une bibliothèque sans rien perdre (CLA-01 à CLA-08, REC-03).
 *
 *  Huit gestes, et une règle au-dessus d'eux : une clé ne change jamais. Renommer change le nom
 *  et lui seul ; fusionner laisse la clé de départ en alias sur celle d'arrivée ; retirer ne
 *  supprime pas, cela redirige. Ce qui était classé avec l'ancienne clé se retrouve donc toujours,
 *  et `resoudre` le démontre.
 *
 *  Chaque geste rend un schéma neuf, d'une version plus haute : une modification est une version,
 *  jamais une retouche sur place (REC-03). Le schéma rendu est validé par son contrat — un geste
 *  qui casserait l'organisation lève ici, pas trois écrans plus loin.
 *
 *  Rien ici ne connaît de domaine : des axes, des valeurs, des clés. Les noms sont des données. */

/** Ce qui a empêché un geste, dit à qui le lit. */
export class GesteRefuse extends Error {}

const refus = (raison: string): never => {
  throw new GesteRefuse(raison);
};

/** L'axe nommé, ou un refus lisible. On ne devine pas un axe absent. */
function axeDe(schema: SchemaBibliotheque, cleAxe: string): Axe {
  return (
    schema.axes.find((axe) => axe.cle === cleAxe || axe.alias.includes(cleAxe)) ??
    refus("Cette façon de ranger n’existe plus.")
  );
}

function valeurDe(axe: Axe, cleValeur: string): ValeurReferentiel {
  return (
    axe.valeurs.find((valeur) => valeur.cle === cleValeur || valeur.alias.includes(cleValeur)) ??
    refus("Cette valeur n’existe plus.")
  );
}

/** Pose le schéma modifié : version suivante, et contrat vérifié. */
function version(schema: SchemaBibliotheque, axes: readonly Axe[]): SchemaBibliotheque {
  return SchemaBibliotheque.parse({ ...schema, version: schema.version + 1, axes });
}

/** Remplace un axe par sa version modifiée, les autres intacts. */
function avecAxe(schema: SchemaBibliotheque, cleAxe: string, modifie: (axe: Axe) => Axe): SchemaBibliotheque {
  const vise = axeDe(schema, cleAxe);
  return version(
    schema,
    schema.axes.map((axe) => (axe.cle === vise.cle ? modifie(axe) : axe)),
  );
}

/** Remplace une valeur par sa version modifiée, les autres intactes. */
function avecValeur(axe: Axe, cleValeur: string, modifie: (valeur: ValeurReferentiel) => ValeurReferentiel): Axe {
  const vise = valeurDe(axe, cleValeur);
  return { ...axe, valeurs: axe.valeurs.map((valeur) => (valeur.cle === vise.cle ? modifie(valeur) : valeur)) };
}

/** Une clé neuve, tirée d'un nom, qui n'entre en collision avec rien de ce qui est déjà pris.
 *
 *  Les alias comptent comme pris : une clé réemployée ferait ressurgir un ancien classement sous
 *  un nom qui n'est plus le sien. */
export function cleNeuve(nom: string, prises: readonly string[]): string {
  const base =
    nom
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "valeur";
  const occupees = new Set(prises);
  if (!occupees.has(base)) return base;
  for (let rang = 2; rang < 10_000; rang += 1) if (!occupees.has(`${base}-${rang}`)) return `${base}-${rang}`;
  return refus("Trop de valeurs portent déjà ce nom.");
}

const clesPrises = (axe: Axe): readonly string[] =>
  axe.valeurs.flatMap((valeur) => [valeur.cle, ...valeur.alias]);

const clesDAxes = (schema: SchemaBibliotheque): readonly string[] =>
  schema.axes.flatMap((axe) => [axe.cle, ...axe.alias]);

/** Suit les alias et les redirections jusqu'à la valeur vivante, pour une clé d'hier.
 *
 *  C'est la preuve que rien ne se perd : un élément classé avant un renommage, une fusion ou un
 *  retrait retrouve sa valeur par cette fonction, et par elle seule. Rien si la piste s'arrête. */
export function resoudre(axe: Axe, cle: string): ValeurReferentiel | undefined {
  const vues = new Set<string>();
  let courante = axe.valeurs.find((valeur) => valeur.cle === cle || valeur.alias.includes(cle));
  while (courante !== undefined && courante.retiree) {
    if (vues.has(courante.cle)) return undefined;
    vues.add(courante.cle);
    const vers: string | undefined = courante.redirigeVers;
    if (vers === undefined) return undefined;
    courante = axe.valeurs.find((valeur) => valeur.cle === vers || valeur.alias.includes(vers));
  }
  return courante;
}

/** Renommer une façon de ranger. Son nom change, sa clé jamais (CLA-08). */
export function renommerAxe(schema: SchemaBibliotheque, cleAxe: string, nom: string): SchemaBibliotheque {
  const propre = nom.trim();
  if (propre === "") refus("Donnez un nom à cette façon de ranger.");
  return avecAxe(schema, cleAxe, (axe) => ({ ...axe, nom: propre }));
}

/** Renommer une valeur. Son nom change, sa clé jamais (CLA-08). */
export function renommerValeur(
  schema: SchemaBibliotheque,
  cleAxe: string,
  cleValeur: string,
  nom: string,
): SchemaBibliotheque {
  const propre = nom.trim();
  if (propre === "") refus("Donnez un nom à cette valeur.");
  return avecAxe(schema, cleAxe, (axe) => avecValeur(axe, cleValeur, (valeur) => ({ ...valeur, nom: propre })));
}

/** Ajouter une valeur à une façon de ranger.
 *
 *  Des étiquettes libres deviennent alors une liste qu'on peut encore étendre : c'est exactement
 *  « on emplit en chemin faisant », et la première valeur nommée est ce qui referme la façon de
 *  ranger d'un cran (CLA-02). */
export function ajouterValeur(schema: SchemaBibliotheque, cleAxe: string, nom: string): SchemaBibliotheque {
  const propre = nom.trim();
  if (propre === "") refus("Donnez un nom à cette valeur.");
  return avecAxe(schema, cleAxe, (axe) => {
    if (axe.nature === "nombre" || axe.nature === "date")
      refus("Cette façon de ranger ne porte pas de liste de valeurs.");
    if (axe.valeurs.some((valeur) => valeur.nom === propre && !valeur.retiree))
      refus("Une valeur porte déjà ce nom.");
    return {
      ...axe,
      nature: axe.nature === "etiquettes" ? "liste_semi_ouverte" : axe.nature,
      valeurs: [
        ...axe.valeurs,
        {
          cle: cleNeuve(propre, clesPrises(axe)),
          nom: propre,
          synonymes: [],
          alias: [],
          retiree: false,
        },
      ],
    };
  });
}

/** Fusionner deux valeurs : celle de départ rejoint celle d'arrivée, et rien ne se perd.
 *
 *  La valeur de départ quitte la liste, mais sa clé et ses alias passent sur celle d'arrivée : un
 *  élément classé avec l'ancienne clé se retrouve sur la valeur d'arrivée (CLA-08). Deux noms
 *  qui désignaient la même chose n'en font plus qu'un, et l'ancien ne s'affiche plus.
 *
 *  C'est le geste à employer quand les deux valeurs étaient la même chose. Quand la valeur de
 *  départ a existé pour elle-même et doit rester lisible, c'est `retirerValeur` (CLA-03). */
export function fusionnerValeurs(
  schema: SchemaBibliotheque,
  cleAxe: string,
  depart: string,
  arrivee: string,
): SchemaBibliotheque {
  return avecAxe(schema, cleAxe, (axe) => {
    const source = valeurDe(axe, depart);
    const cible = valeurDe(axe, arrivee);
    if (source.cle === cible.cle) refus("Une valeur ne se fusionne pas avec elle-même.");
    if (cible.retiree) refus("On ne fusionne pas vers une valeur retirée.");
    if (axe.valeurs.some((valeur) => valeur.redirigeVers === source.cle))
      refus("Une valeur retirée redirige vers celle-ci : retirez-la plutôt que de la fusionner.");

    return {
      ...axe,
      valeurs: axe.valeurs
        .filter((valeur) => valeur.cle !== source.cle)
        .map((valeur) =>
          valeur.cle === cible.cle
            ? { ...valeur, alias: [...valeur.alias, source.cle, ...source.alias] }
            : valeur,
        ),
    };
  });
}

/** Retirer une valeur. Elle n'est jamais supprimée : elle reste, barrée, et redirige (CLA-03).
 *
 *  La différence avec la fusion est ce qu'on voit : une valeur retirée s'affiche encore, pour que
 *  l'on sache qu'elle a existé et vers quoi elle mène. Une valeur fusionnée n'était qu'un autre
 *  nom, et disparaît. Dans les deux cas, l'ancienne clé se résout toujours.
 *
 *  Sans remplaçante, le geste est refusé : un élément classé là deviendrait introuvable. */
export function retirerValeur(
  schema: SchemaBibliotheque,
  cleAxe: string,
  cleValeur: string,
  versCle: string,
): SchemaBibliotheque {
  return avecAxe(schema, cleAxe, (axe) => {
    const source = valeurDe(axe, cleValeur);
    const cible = valeurDe(axe, versCle);
    if (source.cle === cible.cle) refus("Une valeur ne se remplace pas par elle-même.");
    if (source.retiree) refus("Cette valeur est déjà retirée.");
    if (cible.retiree) refus("Choisissez une valeur vivante comme remplaçante.");
    if (axe.valeurs.filter((valeur) => !valeur.retiree).length <= 1)
      refus("Gardez au moins une valeur sur cette façon de ranger.");

    return avecValeur(axe, source.cle, (valeur) => ({ ...valeur, retiree: true, redirigeVers: cible.cle }));
  });
}

/** Changer combien de valeurs un élément porte sur cette façon de ranger (CLA-04). */
export function changerCardinalite(
  schema: SchemaBibliotheque,
  cleAxe: string,
  cardinalite: CardinaliteAxe,
): SchemaBibliotheque {
  return avecAxe(schema, cleAxe, (axe) => ({ ...axe, cardinalite }));
}

/** Ajouter une façon de ranger. Des étiquettes libres par défaut : on emplit en chemin faisant. */
export function ajouterAxe(
  schema: SchemaBibliotheque,
  nom: string,
  nature: NatureAxe = "etiquettes",
  cardinalite: CardinaliteAxe = "plusieurs",
): SchemaBibliotheque {
  const propre = nom.trim();
  if (propre === "") refus("Donnez un nom à cette façon de ranger.");
  if (schema.axes.some((axe) => axe.nom === propre)) refus("Une façon de ranger porte déjà ce nom.");
  if (nature === "referentiel" || nature === "liste_semi_ouverte")
    refus("Une liste de valeurs se remplit après : commencez par des étiquettes libres.");

  return version(schema, [
    ...schema.axes,
    {
      cle: cleNeuve(propre, clesDAxes(schema)),
      nom: propre,
      nature,
      cardinalite,
      structure: "plat",
      obligatoire: false,
      valeurs: [],
      alias: [],
    },
  ]);
}

/** Retirer une façon de ranger.
 *
 *  Une bibliothèque en garde toujours au moins une — sans quoi rien ne se retrouve. Et ce qui
 *  était classé dessus disparaît avec elle : c'est le seul geste qui perd quelque chose, donc le
 *  seul qui demande qu'on dise combien d'éléments en dépendent avant de l'autoriser. */
export function retirerAxe(schema: SchemaBibliotheque, cleAxe: string, elementsClasses: number): SchemaBibliotheque {
  const vise = axeDe(schema, cleAxe);
  if (schema.axes.length === 1) refus("Gardez au moins une façon de ranger.");
  if (elementsClasses > 0)
    refus(
      `${elementsClasses} élément${elementsClasses > 1 ? "s" : ""} y sont rangés : fusionnez leurs valeurs avant de retirer cette façon de ranger.`,
    );
  return version(
    schema,
    schema.axes.filter((axe) => axe.cle !== vise.cle),
  );
}
