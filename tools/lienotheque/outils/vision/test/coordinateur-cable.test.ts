import { describe, expect, it } from "vitest";
import { DecisionDeLecture } from "@lienotheque/contrats";
import { coordonnerLectureDifficile, decisionsDeLecture, type ValeurReliante } from "../src/index.js";

/** Le coordinateur, réellement appelé (OUT-10).
 *
 *  Il existait depuis longtemps, complet et éprouvé, et **une seule occurrence de son nom
 *  existait dans tout le dépôt : sa propre ligne d'export**. Ces contrôles le font tourner pour
 *  de bon et vérifient que ce qu'il rend entre sans perte dans la forme que le moteur oracle
 *  consomme.
 *
 *  Ce qui est éprouvé ici n'est pas la logique du coordinateur — elle l'est ailleurs — mais la
 *  soudure : l'ordre sûr qu'il impose doit se retrouver intact de l'autre côté.
 */

const piece = (rang: number): string => String(rang).padStart(2, "0").repeat(32);

type Page = { readonly numero: number; readonly lisible: boolean; readonly vueParVision: boolean };

const valeur = (rang: number, source: "nom" | "contenu"): ValeurReliante => ({
  piece: piece(rang),
  observations: [{ detecteur: "essai", source, constat: "repère lu", ou: `repère ${rang}`, confiance: 1 }],
});

describe("le coordinateur tourne, et son résultat entre dans le moteur (OUT-10)", () => {
  const pages: Page[] = [
    { numero: 1, lisible: true, vueParVision: false },
    { numero: 2, lisible: false, vueParVision: true }, // illisible sur place, relue et corroborée
    { numero: 3, lisible: false, vueParVision: false }, // illisible, et la relecture ne donne rien
  ];

  const faireTourner = async (corrobore: boolean) =>
    coordonnerLectureDifficile<Page, ValeurReliante, { nom: string }>(pages, { nom: "gabarit d’essai" }, {
      lireLocalement: ({ page }) =>
        page.lisible
          ? { etat: "valide", valeur: valeur(page.numero, "contenu"), confiance: 1 }
          : { etat: "incertaine", raison: "rien de lisible sur place" },
      relireParVision: ({ page }) =>
        page.vueParVision
          ? { etat: "valide", valeur: valeur(page.numero, "contenu"), confiance: 0.95 }
          : { etat: "echec", raison: "la relecture n’a rien rendu" },
      corroborer: () => corrobore,
    });

  it("retient sur place ce qui se lit sur place, sans relecture", async () => {
    const decisions = decisionsDeLecture(await faireTourner(true));
    const premiere = decisions.find((decision) => decision.repere === 1);
    expect(premiere?.etat).toBe("retenue");
    if (premiere?.etat === "retenue") expect(premiere.venue).toBe("locale");
  });

  it("retient après relecture seulement quand une autre source la corrobore", async () => {
    const avec = decisionsDeLecture(await faireTourner(true)).find((decision) => decision.repere === 2);
    expect(avec?.etat).toBe("retenue");
    if (avec?.etat === "retenue") expect(avec.venue).toBe("vision_corroboree");

    const sans = decisionsDeLecture(await faireTourner(false)).find((decision) => decision.repere === 2);
    expect(sans?.etat, "une relecture non corroborée ne doit jamais être retenue").toBe("a_verifier");
    if (sans?.etat === "a_verifier")
      expect(sans.raisons.join(" ")).toMatch(/corroboration|corrobore/i);
  });

  it("laisse à vérifier ce que ni la lecture ni la relecture n’ont rendu, avec ses raisons", async () => {
    const decisions = decisionsDeLecture(await faireTourner(true));
    const troisieme = decisions.find((decision) => decision.repere === 3);
    expect(troisieme?.etat).toBe("a_verifier");
    if (troisieme?.etat === "a_verifier") {
      expect(troisieme.raisons.length).toBeGreaterThan(0);
      expect(troisieme.raisons.join(" ")).toMatch(/rien de lisible sur place/);
    }
  });

  it("tout ce qui sort du coordinateur suit le contrat du moteur", async () => {
    for (const decision of decisionsDeLecture(await faireTourner(true)))
      expect(() => DecisionDeLecture.parse(decision)).not.toThrow();
  });

  it("une décision sans la moindre raison reçoit quand même une phrase", async () => {
    // Le contrat exige au moins une raison ; le coordinateur pourrait n'en donner aucune.
    const vide = decisionsDeLecture({ pages: [{ page: 7, entree: pages[0]!, etat: "a_verifier", raisons: [], modele: {}, visionUtilisee: false }], segments: [] });
    expect(() => DecisionDeLecture.parse(vide[0])).not.toThrow();
  });
});
