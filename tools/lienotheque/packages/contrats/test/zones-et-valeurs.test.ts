import { describe, expect, it } from "vitest";
import { Axe, LectureRepere, LigneInterpretee, PageAffichee, ZoneRelative } from "../src/index.js";

/** Deux choses qui ne traversaient pas (B1, CLA-10).
 *
 *  La lecture connaît la position de chaque repère, et le schéma connaît ses axes. Ni l'une ni
 *  l'autre n'arrivait aux écrans : le Lecteur montrait la vraie page sans ses zones cliquables,
 *  et le catalogue des cases à cocher sans rien sur quoi comparer. */

const ZONE = { x: 0.08, y: 0.42, l: 0.06, h: 0.03 };

describe("une zone est une part de la page, jamais des pixels", () => {
  it("accepte une part, refuse ce qui déborde", () => {
    expect(ZoneRelative.safeParse(ZONE).success).toBe(true);
    expect(ZoneRelative.safeParse({ x: 0, y: 0, l: 1, h: 1 }).success).toBe(true);
    expect(ZoneRelative.safeParse({ ...ZONE, l: 1.2 }).success).toBe(false);
    expect(ZoneRelative.safeParse({ ...ZONE, x: -0.1 }).success).toBe(false);
  });

  it("refuse une zone sans surface : elle ne désignerait rien", () => {
    expect(ZoneRelative.safeParse({ ...ZONE, l: 0 }).success).toBe(false);
    expect(ZoneRelative.safeParse({ ...ZONE, h: 0 }).success).toBe(false);
  });
});

describe("la zone traverse la lecture puis l'interprétation (B1)", () => {
  it("une lecture peut dire où elle a regardé", () => {
    const lue = LectureRepere.safeParse({ y: 0.42, zone: ZONE, numero: 401, presencePiste: 0.9, suite: false });
    expect(lue.success).toBe(true);
    if (lue.success) expect(lue.data.zone).toEqual(ZONE);
  });

  it("une ligne interprétée la porte jusqu'à l'instantané", () => {
    const ligne = LigneInterpretee.safeParse({
      numero: 401,
      pageImprimee: 127,
      piste: 41,
      disque: 1,
      sourcePiste: "pastille",
      zone: ZONE,
      confiance: 1,
    });
    expect(ligne.success).toBe(true);
    if (ligne.success) expect(ligne.data.zone).toEqual(ZONE);
  });

  it("reste facultative : une lecture peut ne pas savoir où elle regardait", () => {
    const sans = LigneInterpretee.safeParse({ numero: 401, pageImprimee: 127, disque: 1, confiance: 1 });
    expect(sans.success, "une page sans zone reste lisible").toBe(true);
    if (sans.success) expect(sans.data.zone).toBeUndefined();
  });
});

describe("une page porte ses valeurs d'axe (CLA-10)", () => {
  const page = { numero: 127, elements: [], texte: [], traduction: [] };

  it("range les clés de valeurs par clé d'axe", () => {
    const lue = PageAffichee.safeParse({ ...page, valeurs: { "etat-du-lien": ["avec"], theme: ["a", "b"] } });
    expect(lue.success).toBe(true);
    if (lue.success) expect(lue.data.valeurs["etat-du-lien"]).toEqual(["avec"]);
  });

  it("n'en porte aucune par défaut : une absence n'est pas une valeur vide", () => {
    const lue = PageAffichee.safeParse(page);
    expect(lue.success).toBe(true);
    if (lue.success) expect(lue.data.valeurs).toEqual({});
  });

  it("refuse une clé vide : une valeur qu'on ne peut pas désigner ne filtre rien", () => {
    expect(PageAffichee.safeParse({ ...page, valeurs: { axe: [""] } }).success).toBe(false);
  });
});

describe("une valeur peut dire ce qu'elle désigne, sans mot de domaine (CLA-01, CLA-11)", () => {
  const axe = (valeurs: unknown[]): unknown => ({
    cle: "etat-du-lien",
    nom: "Avec enregistrement",
    nature: "referentiel",
    cardinalite: "une",
    roleCommun: "etat",
    valeurs,
  });

  it("accepte « present » et « absent » sur les valeurs d'un axe", () => {
    const lu = Axe.safeParse(
      axe([
        { cle: "avec", nom: "Oui", roleValeur: "present" },
        { cle: "sans", nom: "Non", roleValeur: "absent" },
      ]),
    );
    expect(lu.success).toBe(true);
    if (lu.success) expect(lu.data.valeurs.map((v) => v.roleValeur)).toEqual(["present", "absent"]);
  });

  it("refuse un rôle inventé : la liste est close, c'est ce qui la garde générique", () => {
    expect(Axe.safeParse(axe([{ cle: "avec", nom: "Oui", roleValeur: "enregistre" }])).success).toBe(false);
  });

  it("reste facultatif : un axe que l'application ne sait pas remplir n'en porte pas", () => {
    const lu = Axe.safeParse(axe([{ cle: "a", nom: "A" }]));
    expect(lu.success).toBe(true);
    if (lu.success) expect(lu.data.valeurs[0]?.roleValeur).toBeUndefined();
  });
});
