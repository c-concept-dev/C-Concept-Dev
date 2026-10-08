import catalogue from "virtual:lienotheque-modeles";
import { ModeleBibliotheque } from "@lienotheque/contrats";

/** Le catalogue des modèles de bibliothèque (CLA-09).
 *
 *  Il vient d'un module virtuel qui lit `fixtures/modeles` : un domaine s'ajoute en y déposant un
 *  fichier, sans qu'une ligne de code change. Il traverse une frontière, donc son contrat le
 *  valide ici — et un modèle mal formé ne passe pas inaperçu jusqu'à l'écran.
 *
 *  Un modèle refusé est écarté, pas fatal : les autres restent proposables, et la raison part
 *  dans la console. Un catalogue à demi lisible vaut mieux qu'un assistant qui ne s'ouvre pas. */
export function chargerModeles(): readonly ModeleBibliotheque[] {
  const lu = ModeleBibliotheque.array().safeParse(catalogue);
  if (lu.success) return lu.data;

  if (!Array.isArray(catalogue)) {
    console.error("Catalogue des modèles illisible :", lu.error.issues);
    return [];
  }
  const retenus: ModeleBibliotheque[] = [];
  for (const [rang, brut] of catalogue.entries()) {
    const modele = ModeleBibliotheque.safeParse(brut);
    if (modele.success) retenus.push(modele.data);
    else console.error(`Modèle ${rang} écarté :`, modele.error.issues);
  }
  return retenus;
}
