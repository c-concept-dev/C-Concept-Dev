import { Liaison } from "@lienotheque/contrats";

/** La réserve de places, lue dans les liaisons que l'hébergeur fournit vraiment (SEC-08).
 *
 *  Une place est une liaison D1 déclarée dans `wrangler.toml` sous un nom de la forme `BIB_1`.
 *  Le Worker ne crée ni ne supprime de base : il lit celle qu'on lui a reliée, et rien d'autre.
 *  C'est la raison d'être de ce découpage — l'autre voie, l'API de compte, lui donnerait un
 *  jeton capable de supprimer une base, ce que SEC-08 interdit.
 *
 *  La réserve se **lit** plutôt qu'elle ne se déclare une seconde fois dans le code : une liste
 *  écrite à deux endroits finit par diverger, et le jour où elle diverge, le Worker propose une
 *  place qui ne mène à aucune base. */

/** Ce qu'une liaison D1 doit savoir faire pour qu'on la tienne pour une place utilisable. */
export type BaseReliee = { readonly prepare: (sql: string) => unknown };

const estUneBase = (valeur: unknown): valeur is BaseReliee =>
  typeof valeur === "object" && valeur !== null && typeof (valeur as BaseReliee).prepare === "function";

/** Les places réellement reliées, dans l'ordre de leur numéro.
 *
 *  Une liaison dont le nom a la bonne forme mais qui n'est pas une base n'est pas une place :
 *  mieux vaut une réserve plus courte qu'une place qui échouerait au premier usage. */
export function placesDeclarees(liaisons: Record<string, unknown>): readonly Liaison[] {
  return Object.keys(liaisons)
    .filter((nom) => Liaison.safeParse(nom).success && estUneBase(liaisons[nom]))
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
}

/** La base reliée à une place, ou rien.
 *
 *  Le nom de la place vient du registre, jamais d'une requête : c'est ce qui fait que personne
 *  ne peut demander la base d'une autre bibliothèque en changeant un paramètre. */
export function baseDeLaPlace(liaisons: Record<string, unknown>, place: Liaison): BaseReliee | undefined {
  const candidate = liaisons[place];
  return estUneBase(candidate) ? candidate : undefined;
}
