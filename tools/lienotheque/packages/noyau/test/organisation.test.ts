import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ModeleBibliotheque, SchemaBibliotheque, type Axe } from "@lienotheque/contrats";
import {
  GesteRefuse,
  ajouterAxe,
  ajouterValeur,
  changerCardinalite,
  cleNeuve,
  fusionnerValeurs,
  renommerAxe,
  renommerValeur,
  resoudre,
  retirerAxe,
  retirerValeur,
} from "../src/index.js";

/** Organiser sans rien perdre (CLA-01 à CLA-08, CLA-12, REC-03). */

const DOSSIER = join(import.meta.dirname, "../../../fixtures/modeles");

/** Tous les modèles du dépôt, chacun transformé en schéma : le banc d'universalité passe par ici
 *  sans une branche par domaine. */
const SCHEMAS: readonly SchemaBibliotheque[] = readdirSync(DOSSIER)
  .filter((fichier) => fichier.endsWith(".json"))
  .map((fichier) => {
    const lu: unknown = JSON.parse(readFileSync(join(DOSSIER, fichier), "utf8"));
    const modele = ModeleBibliotheque.parse((lu as { modele: unknown }).modele);
    return SchemaBibliotheque.parse({ ...modele, langue: modele.langue });
  });

/** Le premier axe du premier modèle qui porte au moins deux valeurs : de quoi fusionner. */
const { schema: SCHEMA, axe: AXE } = ((): { schema: SchemaBibliotheque; axe: Axe } => {
  for (const schema of SCHEMAS)
    for (const axe of schema.axes) if (axe.valeurs.length >= 2) return { schema, axe };
  throw new Error("Aucun modèle ne porte un axe à deux valeurs : le test n'a rien à éprouver.");
})();

const DEPART = AXE.valeurs[0]!;
const ARRIVEE = AXE.valeurs[1]!;
const axeApres = (schema: SchemaBibliotheque): Axe => schema.axes.find((autre) => autre.cle === AXE.cle)!;

describe("une modification est une version, jamais une retouche (REC-03)", () => {
  it("chaque geste rend un schéma d'une version plus haute", () => {
    const gestes: readonly [string, () => SchemaBibliotheque][] = [
      ["renommer un axe", () => renommerAxe(SCHEMA, AXE.cle, "Autrement dit")],
      ["renommer une valeur", () => renommerValeur(SCHEMA, AXE.cle, DEPART.cle, "Autrement dit")],
      ["ajouter une valeur", () => ajouterValeur(SCHEMA, AXE.cle, "Une valeur neuve")],
      ["fusionner", () => fusionnerValeurs(SCHEMA, AXE.cle, DEPART.cle, ARRIVEE.cle)],
      ["retirer une valeur", () => retirerValeur(SCHEMA, AXE.cle, DEPART.cle, ARRIVEE.cle)],
      ["changer la cardinalité", () => changerCardinalite(SCHEMA, AXE.cle, "plusieurs")],
      ["ajouter un axe", () => ajouterAxe(SCHEMA, "Une façon neuve")],
    ];
    for (const [quoi, geste] of gestes) expect(geste().version, quoi).toBe(SCHEMA.version + 1);
  });

  it("ne touche pas au schéma reçu : l'ancienne version reste lisible", () => {
    const avant = JSON.stringify(SCHEMA);
    renommerValeur(SCHEMA, AXE.cle, DEPART.cle, "Autrement dit");
    fusionnerValeurs(SCHEMA, AXE.cle, DEPART.cle, ARRIVEE.cle);
    retirerValeur(SCHEMA, AXE.cle, DEPART.cle, ARRIVEE.cle);
    expect(JSON.stringify(SCHEMA)).toBe(avant);
  });

  it("rend toujours un schéma que son contrat accepte", () => {
    for (const schema of SCHEMAS) {
      const axe = schema.axes[0]!;
      expect(() => SchemaBibliotheque.parse(renommerAxe(schema, axe.cle, "Autrement dit")), schema.cle).not.toThrow();
      expect(() => SchemaBibliotheque.parse(ajouterAxe(schema, "Une façon neuve")), schema.cle).not.toThrow();
    }
  });
});

describe("renommer change le nom, et lui seul (CLA-08)", () => {
  it("la clé d'un axe ne change jamais", () => {
    const apres = renommerAxe(SCHEMA, AXE.cle, "Autrement dit");
    expect(axeApres(apres).nom).toBe("Autrement dit");
    expect(axeApres(apres).cle).toBe(AXE.cle);
  });

  it("la clé d'une valeur ne change jamais", () => {
    const apres = renommerValeur(SCHEMA, AXE.cle, DEPART.cle, "Autrement dit");
    const valeur = axeApres(apres).valeurs.find((candidate) => candidate.cle === DEPART.cle);
    expect(valeur?.nom).toBe("Autrement dit");
    expect(valeur?.cle).toBe(DEPART.cle);
  });

  it("un élément classé avant le renommage retrouve sa valeur", () => {
    const apres = renommerValeur(SCHEMA, AXE.cle, DEPART.cle, "Autrement dit");
    expect(resoudre(axeApres(apres), DEPART.cle)?.nom).toBe("Autrement dit");
  });

  it("refuse un nom vide, plutôt que d'effacer celui qui était là", () => {
    expect(() => renommerAxe(SCHEMA, AXE.cle, "   ")).toThrow(GesteRefuse);
    expect(() => renommerValeur(SCHEMA, AXE.cle, DEPART.cle, "")).toThrow(GesteRefuse);
  });
});

describe("fusionner : deux noms pour la même chose n'en font plus qu'un (CLA-08)", () => {
  const APRES = fusionnerValeurs(SCHEMA, AXE.cle, DEPART.cle, ARRIVEE.cle);

  it("la valeur de départ quitte la liste : elle n'était qu'un autre nom", () => {
    expect(axeApres(APRES).valeurs.some((valeur) => valeur.cle === DEPART.cle)).toBe(false);
    expect(axeApres(APRES).valeurs).toHaveLength(AXE.valeurs.length - 1);
  });

  it("sa clé passe en alias sur celle d'arrivée", () => {
    expect(axeApres(APRES).valeurs.find((valeur) => valeur.cle === ARRIVEE.cle)?.alias).toContain(DEPART.cle);
  });

  it("un élément classé avec l'ancienne clé se retrouve sur la valeur d'arrivée", () => {
    expect(resoudre(axeApres(APRES), DEPART.cle)?.cle).toBe(ARRIVEE.cle);
  });

  it("deux fusions à la suite gardent les deux anciennes clés joignables", () => {
    const troisieme = axeApres(APRES).valeurs.find((valeur) => valeur.cle !== ARRIVEE.cle);
    if (troisieme === undefined) return;
    const encore = fusionnerValeurs(APRES, AXE.cle, ARRIVEE.cle, troisieme.cle);
    expect(resoudre(axeApres(encore), DEPART.cle)?.cle).toBe(troisieme.cle);
    expect(resoudre(axeApres(encore), ARRIVEE.cle)?.cle).toBe(troisieme.cle);
  });

  it("refuse de fusionner une valeur avec elle-même", () => {
    expect(() => fusionnerValeurs(SCHEMA, AXE.cle, DEPART.cle, DEPART.cle)).toThrow(GesteRefuse);
  });

  it("refuse de fusionner une valeur vers laquelle une autre redirige : la piste se romprait", () => {
    const retire = retirerValeur(SCHEMA, AXE.cle, DEPART.cle, ARRIVEE.cle);
    expect(() => fusionnerValeurs(retire, AXE.cle, ARRIVEE.cle, DEPART.cle)).toThrow(GesteRefuse);
  });

  it("refuse une valeur qui n'existe pas, plutôt que de ne rien faire en silence", () => {
    expect(() => fusionnerValeurs(SCHEMA, AXE.cle, "jamais-vue", ARRIVEE.cle)).toThrow(GesteRefuse);
  });
});

describe("retirer : la valeur reste, barrée, et redirige (CLA-03)", () => {
  const APRES = retirerValeur(SCHEMA, AXE.cle, DEPART.cle, ARRIVEE.cle);

  it("la valeur n'est jamais supprimée : on sait qu'elle a existé", () => {
    const valeur = axeApres(APRES).valeurs.find((candidate) => candidate.cle === DEPART.cle);
    expect(valeur).toBeDefined();
    expect(valeur?.retiree).toBe(true);
    expect(valeur?.redirigeVers).toBe(ARRIVEE.cle);
    expect(axeApres(APRES).valeurs).toHaveLength(AXE.valeurs.length);
  });

  it("un élément classé là se retrouve sur la remplaçante", () => {
    expect(resoudre(axeApres(APRES), DEPART.cle)?.cle).toBe(ARRIVEE.cle);
  });

  it("une chaîne de retraits se suit jusqu'à la valeur vivante", () => {
    const troisieme = axeApres(APRES).valeurs.find((valeur) => !valeur.retiree && valeur.cle !== ARRIVEE.cle);
    if (troisieme === undefined) return;
    const encore = retirerValeur(APRES, AXE.cle, ARRIVEE.cle, troisieme.cle);
    expect(resoudre(axeApres(encore), DEPART.cle)?.cle).toBe(troisieme.cle);
  });

  it("refuse de retirer sans remplaçante vivante", () => {
    expect(() => retirerValeur(APRES, AXE.cle, ARRIVEE.cle, DEPART.cle)).toThrow(GesteRefuse);
  });

  it("refuse de retirer deux fois la même valeur", () => {
    expect(() => retirerValeur(APRES, AXE.cle, DEPART.cle, ARRIVEE.cle)).toThrow(GesteRefuse);
  });

  it("garde toujours une valeur vivante sur la façon de ranger", () => {
    const deux = SchemaBibliotheque.parse({
      ...SCHEMA,
      axes: SCHEMA.axes.map((axe) => (axe.cle === AXE.cle ? { ...axe, valeurs: [DEPART, ARRIVEE] } : axe)),
    });
    const une = retirerValeur(deux, AXE.cle, DEPART.cle, ARRIVEE.cle);
    expect(() => retirerValeur(une, AXE.cle, ARRIVEE.cle, DEPART.cle)).toThrow(GesteRefuse);
  });
});

describe("ajouter", () => {
  it("une valeur neuve reçoit une clé tirée de son nom", () => {
    const apres = ajouterValeur(SCHEMA, AXE.cle, "Une valeur neuve");
    expect(axeApres(apres).valeurs.at(-1)?.cle).toBe("une-valeur-neuve");
  });

  it("une clé neuve n'écrase jamais une clé déjà prise, alias compris", () => {
    expect(cleNeuve("Un nom", ["un-nom"])).toBe("un-nom-2");
    expect(cleNeuve("Un nom", ["un-nom", "un-nom-2"])).toBe("un-nom-3");
  });

  it("refuse deux valeurs de même nom sur la même façon de ranger", () => {
    expect(() => ajouterValeur(SCHEMA, AXE.cle, DEPART.nom)).toThrow(GesteRefuse);
  });

  it("des étiquettes libres deviennent une liste qu'on peut encore étendre (CLA-02)", () => {
    const avec = ajouterAxe(SCHEMA, "Une façon neuve");
    const neuve = avec.axes.at(-1)!;
    expect(neuve.nature).toBe("etiquettes");
    const apres = ajouterValeur(avec, neuve.cle, "Première valeur");
    expect(apres.axes.at(-1)?.nature).toBe("liste_semi_ouverte");
  });

  it("une façon de ranger neuve part d'étiquettes libres, et non d'une liste vide", () => {
    expect(ajouterAxe(SCHEMA, "Une façon neuve").axes.at(-1)?.valeurs).toEqual([]);
  });

  it("refuse une façon de ranger sans nom, ou qui redirait un nom déjà là", () => {
    expect(() => ajouterAxe(SCHEMA, " ")).toThrow(GesteRefuse);
    expect(() => ajouterAxe(SCHEMA, AXE.nom)).toThrow(GesteRefuse);
  });

  it("refuse d'ouvrir une liste de valeurs d'emblée : elle se remplit après", () => {
    expect(() => ajouterAxe(SCHEMA, "Une façon neuve", "referentiel", "une")).toThrow(GesteRefuse);
  });
});

describe("retirer une façon de ranger est le seul geste qui perd quelque chose", () => {
  it("se refuse tant que des éléments y sont rangés, en disant combien", () => {
    expect(() => retirerAxe(SCHEMA, AXE.cle, 12)).toThrow(/12 éléments/);
  });

  it("passe quand rien n'y est rangé", () => {
    const apres = retirerAxe(SCHEMA, AXE.cle, 0);
    expect(apres.axes.some((axe) => axe.cle === AXE.cle)).toBe(false);
    expect(apres.version).toBe(SCHEMA.version + 1);
  });

  it("garde toujours la dernière : sans elle, rien ne se retrouve", () => {
    const seule = SchemaBibliotheque.parse({ ...SCHEMA, axes: [SCHEMA.axes[0]] });
    expect(() => retirerAxe(seule, seule.axes[0]!.cle, 0)).toThrow(GesteRefuse);
  });
});

describe("la cardinalité (CLA-04)", () => {
  it("se change sans toucher aux valeurs", () => {
    const apres = changerCardinalite(SCHEMA, AXE.cle, "principale_et_secondaires");
    expect(axeApres(apres).cardinalite).toBe("principale_et_secondaires");
    expect(axeApres(apres).valeurs).toHaveLength(AXE.valeurs.length);
  });
});

describe("tous les modèles du dépôt se laissent organiser (CLA-12)", () => {
  it("chaque axe à valeurs de chaque modèle se renomme, se fusionne et se résout", () => {
    let eprouves = 0;
    for (const schema of SCHEMAS)
      for (const axe of schema.axes) {
        if (axe.valeurs.length < 2) continue;
        const [premiere, seconde] = [axe.valeurs[0]!, axe.valeurs[1]!];
        const apres = fusionnerValeurs(renommerAxe(schema, axe.cle, "Autrement dit"), axe.cle, premiere.cle, seconde.cle);
        const resultat = apres.axes.find((candidate) => candidate.cle === axe.cle)!;
        expect(resoudre(resultat, premiere.cle)?.cle, `${schema.cle}/${axe.cle}`).toBe(seconde.cle);
        eprouves += 1;
      }
    expect(eprouves, "aucun axe éprouvé : le parcours ne prouverait rien").toBeGreaterThan(3);
  });
});

describe("une façon de ranger se désigne aussi par son ancienne clé", () => {
  it("un axe renommé reste joignable par ses alias", () => {
    const avec = SchemaBibliotheque.parse({
      ...SCHEMA,
      axes: SCHEMA.axes.map((axe) => (axe.cle === AXE.cle ? { ...axe, alias: ["ancienne-cle"] } : axe)),
    });
    expect(renommerAxe(avec, "ancienne-cle", "Autrement dit").axes.find((axe) => axe.cle === AXE.cle)?.nom).toBe(
      "Autrement dit",
    );
  });

  it("refuse une façon de ranger qui n'existe pas", () => {
    expect(() => renommerAxe(SCHEMA, "jamais-vue", "Autrement dit")).toThrow(GesteRefuse);
  });
});
