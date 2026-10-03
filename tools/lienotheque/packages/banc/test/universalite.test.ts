// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ClassementDocument,
  ModeleBibliotheque,
  SchemaBibliotheque,
  axeDe,
  axesParRoleCommun,
  ecartsDuClassement,
  exporterModele,
  filtresDepuisAxes,
  fusionnerValeurs,
  hierarchiser,
  importerModele,
  normaliserClassement,
  pertesDuClassement,
  renommerAxe,
  renommerValeur,
  resoudreValeur,
  retirerValeur,
} from "@lienotheque/contrats";
import { describe, expect, it } from "vitest";

/** Banc d'universalité (CLA-12). Un seul test parcourt tous les modèles : aucune branche par
 *  domaine, aucun nom de domaine. Ajouter un domaine, c'est ajouter un fichier de données. */

const MODELES = fileURLToPath(new URL("../../../fixtures/modeles", import.meta.url));

type Cas = {
  readonly fichier: string;
  readonly modele: ModeleBibliotheque;
  readonly schema: SchemaBibliotheque;
  readonly fiches: readonly ClassementDocument[];
};

const cas: readonly Cas[] = readdirSync(MODELES)
  .filter((nom) => nom.endsWith(".json"))
  .sort()
  .map((fichier) => {
    const brut = JSON.parse(readFileSync(join(MODELES, fichier), "utf8")) as {
      modele: unknown;
      fiches: { documentId: string; axes: unknown }[];
    };
    const modele = ModeleBibliotheque.parse(brut.modele);
    const schema = importerModele(modele);
    const fiches = brut.fiches.map((fiche) =>
      ClassementDocument.parse({ ...fiche, schema: schema.cle, schemaVersion: schema.version }),
    );
    return { fichier, modele, schema, fiches };
  });

/** Première valeur de référentiel d'un axe donné, pour éprouver les évolutions sans nommer personne. */
const premierAxeAValeurs = (schema: SchemaBibliotheque) => schema.axes.find((axe) => axe.valeurs.length >= 2);

describe("banc d'universalité (CLA-12)", () => {
  it("compte au moins cinq modèles très différents", () => {
    expect(cas.length).toBeGreaterThanOrEqual(5);
    expect(new Set(cas.map((c) => c.schema.cle)).size).toBe(cas.length);
  });

  it.each(cas.map((c) => [c.fichier, c] as const))("%s : le modèle et ses fiches valident leurs contrats (CLA-02)", (_, c) => {
    expect(SchemaBibliotheque.safeParse(c.schema).success).toBe(true);
    expect(c.fiches.length).toBeGreaterThan(0);
    for (const fiche of c.fiches) {
      expect(ecartsDuClassement(fiche, c.schema), `${c.fichier} ${fiche.documentId}`).toEqual([]);
    }
  });

  it.each(cas.map((c) => [c.fichier, c] as const))("%s : les filtres naissent des axes (CLA-10)", (_, c) => {
    const filtres = filtresDepuisAxes(c.schema);
    expect(filtres.map((f) => f.axe)).toEqual(c.schema.axes.map((a) => a.cle));
    for (const [rang, filtre] of filtres.entries()) {
      const axe = c.schema.axes[rang]!;
      expect(filtre.nom).toBe(axe.nom);
      expect(filtre.multiple).toBe(axe.cardinalite !== "une");
      expect(filtre.options.length).toBe(axe.valeurs.filter((v) => !v.retiree).length);
    }
  });

  it.each(cas.map((c) => [c.fichier, c] as const))("%s : renommer ne perd rien (CLA-08)", (_, c) => {
    const axe = premierAxeAValeurs(c.schema);
    expect(axe, `${c.fichier} : aucun axe à valeurs`).toBeDefined();
    const cible = axe!.valeurs[0]!;

    let schema = renommerAxe(c.schema, axe!.cle, "Axe renommé par le banc");
    schema = renommerValeur(schema, axe!.cle, cible.cle, "Valeur renommée par le banc");

    expect(axeDe(schema, axe!.cle)?.nom).toBe("Axe renommé par le banc");
    expect(resoudreValeur(axeDe(schema, axe!.cle)!, cible.cle)?.nom).toBe("Valeur renommée par le banc");
    for (const fiche of c.fiches) expect(pertesDuClassement(fiche, schema)).toEqual([]);
  });

  it.each(cas.map((c) => [c.fichier, c] as const))("%s : fusionner ne perd rien (CLA-03, CLA-08)", (_, c) => {
    const axe = premierAxeAValeurs(c.schema)!;
    const [source, cible] = [axe.valeurs[0]!, axe.valeurs[1]!];

    const schema = fusionnerValeurs(c.schema, axe.cle, source.cle, cible.cle);
    const apres = axeDe(schema, axe.cle)!;

    expect(resoudreValeur(apres, source.cle)?.cle, "l'ancienne clé mène à la valeur qui l'absorbe").toBe(cible.cle);
    expect(resoudreValeur(apres, cible.cle)?.synonymes).toContain(source.nom);
    for (const fiche of c.fiches) {
      expect(pertesDuClassement(fiche, schema), `${c.fichier} ${fiche.documentId}`).toEqual([]);
      const normalise = normaliserClassement(fiche, schema);
      expect(ClassementDocument.safeParse(normalise).success).toBe(true);
      expect(JSON.stringify(normalise)).not.toContain(`"${source.cle}"`);
    }
  });

  it.each(cas.map((c) => [c.fichier, c] as const))("%s : retirer avec redirection ne perd rien (CLA-03)", (_, c) => {
    const axe = premierAxeAValeurs(c.schema)!;
    const [source, cible] = [axe.valeurs[0]!, axe.valeurs[1]!];

    const schema = retirerValeur(c.schema, axe.cle, source.cle, cible.cle);
    const apres = axeDe(schema, axe.cle)!;

    expect(resoudreValeur(apres, source.cle)?.cle).toBe(cible.cle);
    expect(apres.valeurs.find((v) => v.cle === source.cle)?.retiree).toBe(true);
    expect(filtresDepuisAxes(schema).find((f) => f.axe === axe.cle)?.options.map((o) => o.cle)).not.toContain(source.cle);
    for (const fiche of c.fiches) expect(pertesDuClassement(fiche, schema)).toEqual([]);
  });

  it.each(cas.map((c) => [c.fichier, c] as const))("%s : hiérarchiser ne perd rien (CLA-08)", (_, c) => {
    const axe = c.schema.axes.find((a) => a.structure === "plat" && a.valeurs.length >= 2);
    if (axe === undefined) return; // ce modèle n'a pas d'axe à plat à hiérarchiser
    const schema = hierarchiser(c.schema, axe.cle, axe.valeurs[1]!.cle, axe.valeurs[0]!.cle);

    expect(SchemaBibliotheque.safeParse(schema).success, "le schéma reste valide").toBe(true);
    expect(axeDe(schema, axe.cle)?.structure).toBe("hierarchique");
    expect(filtresDepuisAxes(schema).find((f) => f.axe === axe.cle)?.hierarchique).toBe(true);
    for (const fiche of c.fiches) expect(pertesDuClassement(fiche, schema)).toEqual([]);
  });

  it.each(cas.map((c) => [c.fichier, c] as const))("%s : export puis import rendent le modèle à l'identique (CLA-09)", (_, c) => {
    const aller = exporterModele(c.schema);
    const retour = exporterModele(importerModele(aller));
    expect(ModeleBibliotheque.safeParse(aller).success).toBe(true);
    expect(retour).toEqual(aller);
    expect(JSON.parse(JSON.stringify(aller))).toEqual(JSON.parse(JSON.stringify(c.modele)));
  });

  it("recoupe les domaines par leurs rôles communs (CLA-11)", () => {
    const roles = axesParRoleCommun(cas.map((c) => c.schema));
    const partages = [...roles.entries()].filter(([, axes]) => axes.length >= 2);
    expect(partages.length, "au moins un rôle commun relie plusieurs bibliothèques").toBeGreaterThan(0);
  });

  it("n'a besoin d'aucune branche par domaine : le même test les parcourt tous", () => {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const noms = cas.map((c) => c.schema.cle);
    for (const nom of noms) expect(source, `le banc nomme « ${nom} »`).not.toContain(`"${nom}"`);
  });
});
