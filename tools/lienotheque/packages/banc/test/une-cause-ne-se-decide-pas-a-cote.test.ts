import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { masqueDeCode } from "../src/lire-du-code.js";

/** Dette D3, seconde garantie — **une cause d'abstention ne se décide pas à côté de la
 *  préséance** (échéance posée par Christophe le 14 novembre 2026).
 *
 *  La préséance des causes est une **donnée** : une liste ordonnée, lisible d'un coup d'œil. Le
 *  contrôle voisin — `outils/ingestion/test/la-vraie-cause-de-l-abstention.test.ts` — garantit
 *  qu'aucune cause déclarée n'y manque. Celui-ci garantit l'autre moitié : qu'aucune cause ne se
 *  décide **ailleurs**, dans une branche qui n'a pas à le faire.
 *
 *  C'est très exactement ce qui a produit la dette. La branche « aucun repère lu » de
 *  `voie-oracle.ts` composait sa cause à la main, sur place, sans demander si le vivier était
 *  borné — pendant que l'autre branche de la même fonction le demandait avant tout le reste. Une
 *  relecture de la préséance ne pouvait pas rattraper cela : la préséance n'était pas le seul
 *  endroit qui décidait.
 *
 *  ## Pourquoi lire la source, et non les exports
 *
 *  Une cause écrite en dur dans une branche est un fait de **texte**, pas de comportement : elle
 *  ne se voit à l'exécution que sur le cas exact qui l'atteint, et ce cas-là demande une lecture
 *  réelle de plusieurs dizaines de secondes. Le garde-fou lit donc le fichier.
 *
 *  ## Le piège, et c'est celui du lot 0q
 *
 *  Un nom de cause **cité dans un commentaire** n'est pas une cause décidée — les commentaires de
 *  ce dépôt les nomment abondamment, et c'est leur rôle. Le masque de code les efface délimiteurs
 *  compris, mais il efface aussi le **contenu** des littéraux en gardant leurs guillemets. On
 *  cherche donc dans le texte d'origine et l'on ne retient une occurrence que si son guillemet
 *  ouvrant a **survécu au masque** : un guillemet conservé au même décalage prouve du code.
 *
 *  ## Le second piège, trouvé en écrivant ce garde-fou
 *
 *  Sa première version refusait **toute** occurrence hors de la préséance, et elle a accusé un
 *  cas légitime : `voie-oracle.ts:1660` **compare** la cause rendue à `corroboration_insuffisante`
 *  pour remplacer une phrase trompeuse. Comparer n'est pas décider, et interdire la comparaison
 *  n'aurait protégé de rien tout en rendant le code moins lisible. Le garde-fou n'accepte donc
 *  l'occurrence que dans un **contexte de comparaison** — `===`, `!==`, `==`, `!=` — et refuse
 *  tout le reste, y compris un appel de fonction : il vaut mieux qu'il échoue sur un cas
 *  légitime qu'on lui apprendra, que de laisser passer une décision qu'il n'a pas prévue. */

const CHEMIN = (relatif: string): URL => new URL(relatif, import.meta.url);
const SOURCE_DE_LA_VOIE = CHEMIN("../../../outils/ingestion/src/voie-oracle.ts");
const SOURCE_DE_L_ASSOCIATEUR = CHEMIN("../../../outils/recettes/src/associateur.ts");

/** Les causes déclarées, lues dans la source plutôt qu'importées : ce garde-fou ne doit pas
 *  dépendre du paquet qu'il surveille, et la liste est une donnée littérale. */
function causesDeclarees(): readonly string[] {
  const source = readFileSync(SOURCE_DE_L_ASSOCIATEUR, "utf8");
  const declaration = /export const RAISONS_D_ABSTENTION\s*=\s*\[([^\]]*)\]/u.exec(source);
  expect(declaration, "RAISONS_D_ABSTENTION doit être une liste littérale").not.toBeNull();
  return [...(declaration?.[1] ?? "").matchAll(/["'`](\w+)["'`]/gu)].map((trouve) => trouve[1] ?? "");
}

/** Les décalages de la déclaration de préséance, pour l'exclure de la recherche : c'est le seul
 *  endroit qui a le droit de nommer une cause. */
function etendueDeLaPreseance(source: string): { readonly debut: number; readonly fin: number } {
  const debut = source.indexOf("export const PRESEANCE_DES_CAUSES");
  expect(debut, "la préséance doit être déclarée, et exportée").toBeGreaterThan(-1);
  const fin = source.indexOf("\n];", debut);
  expect(fin, "la déclaration de préséance doit se fermer sur une ligne « ]; »").toBeGreaterThan(debut);
  return { debut, fin: fin + 3 };
}

describe("une cause d'abstention ne se décide pas à côté de la préséance (D3, CLA-12)", () => {
  it("ne laisse aucun nom de cause écrit en dur hors de la préséance", () => {
    const source = readFileSync(SOURCE_DE_LA_VOIE, "utf8");
    const masque = masqueDeCode(source);
    const preseance = etendueDeLaPreseance(source);

    const dehors: string[] = [];
    for (const cause of causesDeclarees())
      for (const trouve of source.matchAll(new RegExp(`["'\`]${cause}["'\`]`, "gu"))) {
        const place = trouve.index;
        if (place === undefined) continue;
        // Dans la préséance : c'est sa place.
        if (place >= preseance.debut && place < preseance.fin) continue;
        // Dans un commentaire : le masque a effacé le guillemet avec le reste.
        if (masque[place] !== source[place]) continue;
        // Une comparaison : on LIT la cause, on ne la décide pas.
        if (/(?:===|!==|==|!=)\s*$/u.test(source.slice(Math.max(0, place - 8), place))) continue;
        dehors.push(`${cause} à l'octet ${place} (ligne ${source.slice(0, place).split("\n").length})`);
      }

    expect(dehors, "cause(s) décidée(s) en dehors de la préséance").toEqual([]);
  });

  it("distingue comparer de décider, sur un cas construit", () => {
    const causes = causesDeclarees();
    const compare = 'if (association.abstention?.raison === "corroboration_insuffisante") dire("…");';
    const decide = 'abstention: { raison: "aucun_repere_lu", combien: 0 },';

    const aLAccusation = (extrait: string): readonly string[] => {
      const masque = masqueDeCode(extrait);
      const dehors: string[] = [];
      for (const cause of causes)
        for (const trouve of extrait.matchAll(new RegExp(`["'\`]${cause}["'\`]`, "gu"))) {
          const place = trouve.index;
          if (place === undefined || masque[place] !== extrait[place]) continue;
          if (/(?:===|!==|==|!=)\s*$/u.test(extrait.slice(Math.max(0, place - 8), place))) continue;
          dehors.push(cause);
        }
      return dehors;
    };

    expect(aLAccusation(compare), "comparer une cause est légitime").toEqual([]);
    expect(aLAccusation(decide), "décider une cause hors de la préséance ne l'est pas").toEqual(["aucun_repere_lu"]);
  });

  it("se tait sur un nom de cause cité dans un commentaire, et le prouve sur un cas construit", () => {
    const faux = [
      '// On disait « aucun_repere_lu » ici, et "aucun_media" dans la phrase suivante.',
      '/** La cause "vivier_non_borne" est décidée par la préséance, jamais ici. */',
      "const rien = 1;",
    ].join("\n");
    const masque = masqueDeCode(faux);

    // Aucun des trois noms cités n'est du code : leurs guillemets ont disparu du masque.
    for (const cause of ["aucun_repere_lu", "aucun_media", "vivier_non_borne"]) {
      const place = faux.indexOf(`"${cause}"`) === -1 ? faux.indexOf(`« ${cause} »`) : faux.indexOf(`"${cause}"`);
      expect(place, cause).toBeGreaterThan(-1);
      expect(masque[place] === faux[place], `${cause} ne doit pas compter pour du code`).toBe(false);
    }
  });
});
