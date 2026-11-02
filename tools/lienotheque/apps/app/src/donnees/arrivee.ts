import type { TypeDeContenu } from "@lienotheque/contrats";

export type AccompagnementAffiche = {
  readonly nom: string;
  readonly contenu: TypeDeContenu;
};

/** Ce qui accompagne un document, tel que l'écran peut honnêtement le compter.
 *
 * L'hôte écarte déjà les accessoires Apple à l'extraction d'un ZIP. L'écran garde la même
 * frontière : un autre pont ou deux notifications successives ne doivent ni les faire
 * réapparaître, ni compter deux fois le même média. */
function estAccessoireApple(nom: string): boolean {
  const parties = nom.split(/[\\/]/);
  const fichier = parties.at(-1) ?? "";
  return parties.includes("__MACOSX") || fichier === ".DS_Store" || fichier.startsWith("._");
}

export function fusionnerAccompagnements(
  anciens: readonly AccompagnementAffiche[],
  arrives: readonly AccompagnementAffiche[],
): readonly AccompagnementAffiche[] {
  const uniques = new Map<string, AccompagnementAffiche>();
  for (const accompagnement of [...anciens, ...arrives]) {
    if (estAccessoireApple(accompagnement.nom)) continue;
    const cle = `${accompagnement.contenu}\u0000${accompagnement.nom}`;
    if (!uniques.has(cle)) uniques.set(cle, accompagnement);
  }
  return [...uniques.values()];
}
