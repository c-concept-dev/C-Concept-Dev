import { describe, expect, it } from "vitest";
import { RAISONS_D_ABSTENTION, borneDuVivier } from "@lienotheque/recettes";
import { PRESEANCE_DES_CAUSES, causeDeLAbstention } from "../src/voie-oracle.js";

/** Dette D3 — « la vraie cause d'abstention » (échéance posée par Christophe le 14 novembre 2026,
 *  juste après le lot 0x, « même sujet que 0x »).
 *
 *  ## Ce que la lecture du code a trouvé, et qui précise l'énoncé de la dette
 *
 *  La dette dit : « `voie-oracle.ts` rend `aucun_repere_lu` sans demander si le vivier est
 *  borné ». C'est vrai, et c'est plus précis que cela : **les deux branches de la même fonction
 *  ne se comportent pas pareil.**
 *
 *  | branche | comment la cause est décidée | la borne du vivier est-elle demandée ? |
 *  |---|---|---|
 *  | des repères ont été lus | `qualifierAssociation` | **oui**, et avant tout le reste |
 *  | aucun repère lu | à la main, sur place | **non** — la borne n'est même pas calculée |
 *
 *  Le même document, selon qu'une ligne a été lue ou non, reçoit donc `vivier_non_borne` ou
 *  `aucun_repere_lu` pour un vivier exactement aussi peu borné. La seconde est la moins
 *  informative des deux : elle dit « rien ne numérote » là où la vérité est « rien ne permet
 *  d'affirmer que ces enregistrements appartiennent à ce document ».
 *
 *  La préséance n'est donc pas à inventer : `qualifierAssociation` la porte déjà, et son
 *  commentaire la justifie — « avant toute autre question, et avant même de regarder si cette
 *  manière de lire s'applique : un score calculé dans un vivier qui déborde le document ne vaut
 *  rien, aussi régulier soit-il ». Le travail est de **mettre les deux branches d'accord**.
 *
 *  ## Et de rendre mécanique le fait qu'une cause ne puisse pas manquer
 *
 *  Deux garanties, parce qu'une cause peut disparaître de deux façons : être **absente** de la
 *  préséance, ou être décidée **à côté** d'elle. La première a produit cette dette ; elle est
 *  gardée ici. La seconde est ce qui la ferait revenir, et elle demande de lire la source : elle
 *  est gardée par `packages/banc/test/une-cause-ne-se-decide-pas-a-cote.test.ts`, là où vivent
 *  les garde-fous qui lisent le dépôt et où le masque de code existe déjà. */

/** Un vivier que rien ne borne : le document ne dit pas d'où il vient. C'est le cas réel — la
 *  provenance est une donnée de dépôt, et un document déposé seul n'en porte aucune. */
const VIVIER_NON_BORNE = borneDuVivier([], [{}, {}, {}]);
/** Le même vivier, borné : les enregistrements viennent tous d'un dépôt de ce document. */
const VIVIER_BORNE = borneDuVivier(["lot:epreuve"], [{ provenances: ["lot:epreuve"] }]);

describe("l'abstention dit sa vraie cause, dans les deux branches (D3, § 3.5)", () => {
  it("dit « vivier non borné » plutôt que « aucun repère lu » quand rien ne borne le vivier", () => {
    const cause = causeDeLAbstention({
      disponibles: 3,
      interpretes: 0,
      borne: VIVIER_NON_BORNE,
      explorationInterrompue: false,
      aucuneMarqueNeTient: false,
    });

    // Trois présents, aucun interprété : « médias non interprétés » serait vrai aussi, et la
    // borne passe devant — comme dans `qualifierAssociation`, pour la raison qu'elle y donne.
    expect(cause.raison).toBe("vivier_non_borne");
    // Et la phrase est celle que la borne a écrite, pas une reformulation : elle dit quoi faire.
    expect(cause.pourquoi).toBe(VIVIER_NON_BORNE.pourquoi);
  });

  it("dit toujours « aucun repère lu » quand le vivier est borné et que la lecture n'a rien trouvé", () => {
    // Onze présents, onze interprétés : les enregistrements ne sont pour rien dans ce silence.
    const cause = causeDeLAbstention({
      disponibles: 11,
      interpretes: 11,
      borne: VIVIER_BORNE,
      explorationInterrompue: false,
      aucuneMarqueNeTient: false,
    });

    expect(cause.raison).toBe("aucun_repere_lu");
  });

  it("garde l'ordre déjà acquis : une exploration arrêtée et des marques qui ne tiennent pas passent devant", () => {
    const interrompue = causeDeLAbstention({
      disponibles: 11,
      interpretes: 11,
      borne: VIVIER_BORNE,
      explorationInterrompue: true,
      aucuneMarqueNeTient: false,
    });
    const sansMarque = causeDeLAbstention({
      disponibles: 11,
      interpretes: 11,
      borne: VIVIER_BORNE,
      explorationInterrompue: false,
      aucuneMarqueNeTient: true,
    });

    expect(interrompue.raison).toBe("exploration_interrompue");
    expect(sansMarque.raison).toBe("aucune_marque_ne_tient");
  });

  it("ne dit pas « vivier non borné » d'un document sans aucun enregistrement : il n'y a rien à borner", () => {
    const cause = causeDeLAbstention({
      disponibles: 0,
      interpretes: 0,
      borne: borneDuVivier([], []),
      explorationInterrompue: false,
      aucuneMarqueNeTient: false,
    });

    expect(cause.raison).toBe("aucun_media");
  });

  it("dit « médias non interprétés » quand ils sont là, bornés, et qu'aucun n'a pu être interprété", () => {
    // Onze présents, aucun interprété : leur nom ne porte pas de numéro lisible.
    const cause = causeDeLAbstention({
      disponibles: 11,
      interpretes: 0,
      borne: VIVIER_BORNE,
      explorationInterrompue: false,
      aucuneMarqueNeTient: false,
    });

    expect(cause.raison).toBe("medias_non_interpretes");
  });
});

describe("aucune cause connue ne peut manquer à la préséance (D3, garde-fou)", () => {
  it("place chaque cause déclarée : ou dans la préséance, ou nommée comme décidée ailleurs", () => {
    const dansLaPreseance = new Set(PRESEANCE_DES_CAUSES.map((une) => une.raison));
    const ailleurs = new Set(PRESEANCE_DES_CAUSES.flatMap((une) => (une.decideeAilleurs === undefined ? [] : [une.raison])));
    const placees = new Set([...dansLaPreseance, ...ailleurs]);

    // Une cause ajoutée à la déclaration sans être placée fait échouer ici, et non à l'écran.
    expect([...RAISONS_D_ABSTENTION].filter((une) => !placees.has(une)), "cause(s) déclarée(s) mais non placée(s)").toEqual([]);
    // Et l'inverse : une cause placée qui n'existe plus laisserait une branche morte.
    expect([...placees].filter((une) => !(RAISONS_D_ABSTENTION as readonly string[]).includes(une)), "cause(s) placée(s) mais disparue(s)").toEqual([]);
  });

  /** La faille trouvée en éprouvant ce garde-fou par mutation, et fermée ici.
   *
   *  `decideeAilleurs` est une échappatoire nécessaire — `corroboration_insuffisante` est décidée
   *  par la confrontation, jamais par la voie qui lit —, mais elle se retourne : il suffit de
   *  l'écrire sur n'importe quelle cause pour que le contrôle de couverture la tienne pour
   *  placée. La mutation qui retirait `vivier_non_borne` de la préséance en la déclarant « décidée
   *  ailleurs » passait ainsi la couverture, et seul le contrôle de comportement l'a tuée.
   *
   *  Vérifier la déclaration contre la source ne suffirait pas : `vivier_non_borne` **est**
   *  réellement décidée dans `associateur.ts`, ce qui rendrait le mensonge vrai au regard d'un
   *  tel contrôle. La seule garantie solide est donc de **figer la liste** de ce qui a le droit
   *  d'échapper. Y ajouter une cause devient alors une modification visible d'un contrôle, et non
   *  un silence. */
  it("ne laisse qu'une seule cause échapper à la préséance, nommément", () => {
    const echappent = PRESEANCE_DES_CAUSES.flatMap((une) => (une.decideeAilleurs === undefined ? [] : [une.raison]));

    expect(echappent).toEqual(["corroboration_insuffisante"]);
  });

});
