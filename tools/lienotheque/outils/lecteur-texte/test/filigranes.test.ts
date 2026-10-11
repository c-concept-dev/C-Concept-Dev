// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Passage } from "@lienotheque/contrats";
import { PART_FILIGRANE, adressesRecurrentes } from "../src/index.js";

/** Les adresses qui reviennent sur chaque page : des filigranes, pas du contenu (FMT-04).
 *
 *  Mesuré sur le corpus réel, et c'est ce qui fixe le seuil :
 *
 *    · `http://doctidoc2.blogspot.com`   **100,0 %** des 1 275 pages d'un ouvrage — un tampon
 *    · `www.institut-double-helice.fr`      7,5 % des 80 pages d'un autre — un pied de diapositive
 *    · `www.psychiatry.org/dsm5`            1,1 % — une référence dans le texte
 *
 *  Le contrôle **signale**, il ne retire rien. Retirer du texte serait changer l'extrait exact
 *  que RCH-07 promet de rendre, et la décision n'appartient pas au lecteur.
 */

const passage = (rang: number, texte: string): Passage => ({
  rang,
  page: rang + 1,
  texte,
  source: "couche_texte",
  lisible: true,
});

/** Un document dont chaque page porte le même tampon, plus du texte propre. */
const tamponne = (combien: number, tampon: string): Passage[] =>
  Array.from({ length: combien }, (_, rang) => passage(rang, `${tampon} Le texte de la page ${rang + 1}, qui parle d'autre chose.`));

describe("une adresse sur chaque page est un tampon (FMT-04)", () => {
  it("la signale avec son compte et sa part", () => {
    const trouvees = adressesRecurrentes(tamponne(40, "http://exemple-de-scan.test"));
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]).toMatchObject({ adresse: "http://exemple-de-scan.test", pages: 40, part: 1 });
  });

  it("ne signale pas une adresse citée sur quelques pages : c'est du contenu", () => {
    const passages = [
      ...Array.from({ length: 38 }, (_, rang) => passage(rang, `Du texte ordinaire sur la page ${rang + 1}.`)),
      passage(38, "Voir le site www.une-reference.test pour la suite."),
      passage(39, "Et aussi www.une-reference.test, cité deux fois."),
    ];
    expect(adressesRecurrentes(passages)).toEqual([]);
  });

  it("reconnaît une adresse de courriel autant qu'une URL : les deux servent de tampon", () => {
    const trouvees = adressesRecurrentes(tamponne(30, "numerise-par@exemple.test"));
    expect(trouvees.map((f) => f.adresse)).toEqual(["numerise-par@exemple.test"]);
  });

  it("compte les pages, pas les occurrences : un tampon deux fois sur la même page reste une page", () => {
    const deuxFois = Array.from({ length: 20 }, (_, rang) =>
      passage(rang, `http://tampon.test en haut, et http://tampon.test en bas, page ${rang + 1}.`),
    );
    expect(adressesRecurrentes(deuxFois)[0]).toMatchObject({ pages: 20, part: 1 });
  });

  it("ignore la ponctuation qui colle à la fin, sinon un même tampon se compte en trois", () => {
    const passages = [
      ...Array.from({ length: 10 }, (_, rang) => passage(rang, `Texte, http://tampon.test.`)),
      ...Array.from({ length: 10 }, (_, rang) => passage(rang + 10, `Texte (http://tampon.test)`)),
    ];
    const trouvees = adressesRecurrentes(passages);
    expect(trouvees).toHaveLength(1);
    expect(trouvees[0]?.pages).toBe(20);
  });

  it("ne signale rien sur un document sans adresse, ni sur un document vide", () => {
    expect(adressesRecurrentes([passage(0, "Du texte sans la moindre adresse.")])).toEqual([]);
    expect(adressesRecurrentes([])).toEqual([]);
  });

  it("le seuil laisse un large écart entre le tampon mesuré et l'adresse citée la plus fréquente", () => {
    // 100 % contre 7,5 % : le seuil doit tenir loin des deux, et non raser le second.
    expect(PART_FILIGRANE).toBeGreaterThan(0.1);
    expect(PART_FILIGRANE).toBeLessThan(1);
  });

  it("rend les plus fréquentes d'abord : c'est l'ordre dans lequel on les regarde", () => {
    const passages = [
      ...tamponne(30, "http://partout.test"),
      ...Array.from({ length: 10 }, (_, rang) => passage(rang + 30, "http://souvent.test et du texte.")),
    ];
    // « souvent » n'est sur que 10 des 40 pages : sous le seuil, donc absent.
    const trouvees = adressesRecurrentes(passages);
    expect(trouvees.map((f) => f.adresse)).toEqual(["http://partout.test"]);
  });
});
