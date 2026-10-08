// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DemandeVision, Recette, ReponseVision, ZONES_MAX_PAR_APPEL, type ZoneLue } from "@lienotheque/contrats";
import type { ImageGrise } from "@lienotheque/images";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheDansDossier, coutEnEuros, coutProjete, entreesGardees, relire, TARIF_PAR_DEFAUT, type Candidat, type Transport } from "../src/index.js";

const RECETTES = join(import.meta.dirname, "../../../fixtures/recettes");
const lire = (nom: string): Recette => Recette.parse(JSON.parse(readFileSync(join(RECETTES, nom), "utf8")));
const RECETTE = lire("methode-pastilles-cd.v5.json");

/** Une page où chaque pavé a des pixels différents, pour que les empreintes diffèrent. */
const page = (graine: number): ImageGrise => ({
  largeur: 200,
  hauteur: 200,
  pixels: Uint8Array.from({ length: 40000 }, (_, rang) => (rang * 7 + graine * 31) % 256),
});

const candidat = (numero: number): Candidat => ({
  page: numero,
  numero,
  motif: "lecture_incomplete",
  repere: { x: 10, y: 10, l: 40, h: 45 },
  recadrage: { x: 0, y: 0, l: 80 + (numero % 5), h: 85 },
});

/** Un transport qui rend un numéro par zone et compte ses appels. */
const transportQuiRepond = (): Transport & { appels: number; zonesVues: number } => {
  const fonction = (async (demande: DemandeVision) => {
    fonction.appels += 1;
    fonction.zonesVues += demande.zones.length;
    return ReponseVision.parse({
      zones: demande.zones.map((zone, rang) => ({ empreinte: zone.empreinte, numero: 10 + rang, confiance: 0.8 })),
      jetons: { entree: 100 * demande.zones.length, sortie: 20 * demande.zones.length },
      outil: { nom: "vision-ciblee", version: "0.1.0" },
    });
  }) as Transport & { appels: number; zonesVues: number };
  fonction.appels = 0;
  fonction.zonesVues = 0;
  return fonction;
};

const jamais: Transport = async () => {
  throw new Error("le réseau a été appelé alors qu'il ne devait pas l'être");
};

let dossier: string;
beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-vision-"));
});
afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

describe("relire un lot (OUT-08)", () => {
  it("relit chaque pavé et rapporte les jetons dépensés", async () => {
    const transport = transportQuiRepond();
    const vue = await relire([candidat(1), candidat(2)], () => page(1), RECETTE, transport);
    expect(vue.relues).toHaveLength(2);
    expect(vue.jetons).toEqual({ entree: 200, sortie: 40 });
    expect(transport.appels).toBe(1);
  });

  it("groupe les zones par appel, sans dépasser ce qu'un appel transporte", async () => {
    const transport = transportQuiRepond();
    const beaucoup = Array.from({ length: ZONES_MAX_PAR_APPEL + 3 }, (_, rang) => candidat(rang + 1));
    await relire(beaucoup, (c) => page(c.numero), RECETTE, transport, { cache: cacheDansDossier(dossier) });
    expect(transport.appels).toBe(2);
    expect(transport.zonesVues).toBe(ZONES_MAX_PAR_APPEL + 3);
  });

  it("porte l'intervalle que la recette autorise jusque dans la demande", async () => {
    let vues: DemandeVision | undefined;
    const transport: Transport = async (demande) => {
      vues = demande;
      return ReponseVision.parse({
        zones: demande.zones.map((zone) => ({ empreinte: zone.empreinte, numero: 14, confiance: 0.9 })),
        jetons: { entree: 1, sortie: 1 },
        outil: { nom: "vision-ciblee", version: "0.1.0" },
      });
    };
    await relire([candidat(1)], () => page(1), RECETTE, transport, { attendu: { min: 1, max: 92 } });
    expect(vues?.zones[0]!.attendu).toEqual({ min: 1, max: 92 });
  });

  it("ne perd pas un pavé dont le recadrage ne peut pas être fait", async () => {
    const vue = await relire([candidat(1)], () => undefined, RECETTE, jamais);
    expect(vue.relues).toEqual([]);
    expect(vue.nonRelus).toEqual([{ candidat: candidat(1), raison: "recadrage" }]);
  });

  it("refuse une réponse qui ne répond pas à la demande", async () => {
    const menteur: Transport = async (demande) =>
      ReponseVision.parse({
        zones: [{ empreinte: "f".repeat(32), numero: 7, confiance: 0.5 }],
        jetons: { entree: 1, sortie: 1 },
        outil: { nom: "vision-ciblee", version: "0.1.0" },
      });
    await expect(relire([candidat(1)], () => page(1), RECETTE, menteur)).rejects.toThrow(/ne répond pas/);
  });
});

describe("le budget s'arrête net (REC-04)", () => {
  const avecPlafond = (zones: number): Recette => ({ ...RECETTE, vision: { ...RECETTE.vision!, zones_max_par_lot: zones } });

  it("ne lit rien au-delà du plafond, et ne perd pas ce qui restait", async () => {
    const transport = transportQuiRepond();
    const candidats = Array.from({ length: 5 }, (_, rang) => candidat(rang + 1));
    const vue = await relire(candidats, (c) => page(c.numero), avecPlafond(2), transport);

    expect(vue.relues).toHaveLength(2);
    expect(vue.nonRelus).toHaveLength(3);
    expect(vue.nonRelus.every((reste) => reste.raison === "budget")).toBe(true);
    expect(transport.zonesVues).toBe(2);
  });

  it("garde les premiers de la liste : l'arrêt est net, pas arbitraire", async () => {
    const candidats = [candidat(1), candidat(2), candidat(3)];
    const vue = await relire(candidats, (c) => page(c.numero), avecPlafond(1), transportQuiRepond());
    expect(vue.relues.map((relue) => relue.candidat.numero)).toEqual([1]);
    expect(vue.nonRelus.map((reste) => reste.candidat.numero)).toEqual([2, 3]);
  });

  it("n'envoie rien quand la recette ne déclare aucune relecture", async () => {
    const sansVision = lire("methode-pastilles-cd.v4.json");
    const vue = await relire([candidat(1)], () => page(1), sansVision, jamais);
    expect(vue.relues).toEqual([]);
    expect(vue.nonRelus[0]?.raison).toBe("budget");
  });
});

describe("un rejeu ne rappelle personne (REC-02)", () => {
  it("relit depuis le cache, sans toucher au réseau", async () => {
    const cache = cacheDansDossier(dossier);
    const candidats = [candidat(1), candidat(2)];
    const transport = transportQuiRepond();

    const premier = await relire(candidats, (c) => page(c.numero), RECETTE, transport, { cache });
    expect(premier.depuisLeCache).toBe(0);
    expect(entreesGardees(dossier)).toBe(2);

    // Deuxième passage : le transport lève si on l'appelle.
    const second = await relire(candidats, (c) => page(c.numero), RECETTE, jamais, { cache });
    expect(second.depuisLeCache).toBe(2);
    expect(second.appels).toBe(0);
    expect(second.jetons).toEqual({ entree: 0, sortie: 0 });
    expect(second.relues.map((relue) => relue.zone.numero)).toEqual(premier.relues.map((relue) => relue.zone.numero));
  });

  it("ne fait pas compter une entrée gardée dans le budget : un rejeu n'est pas plus cher", async () => {
    const cache = cacheDansDossier(dossier);
    const candidats = [candidat(1), candidat(2), candidat(3)];
    await relire(candidats, (c) => page(c.numero), RECETTE, transportQuiRepond(), { cache });

    const serre = { ...RECETTE, vision: { ...RECETTE.vision!, zones_max_par_lot: 1 } };
    const rejeu = await relire(candidats, (c) => page(c.numero), serre, jamais, { cache });
    expect(rejeu.relues).toHaveLength(3);
    expect(rejeu.nonRelus).toEqual([]);
  });

  it("garde l'outil qui a lu : un lien doit pouvoir dire d'où vient son numéro", async () => {
    const cache = cacheDansDossier(dossier);
    await relire([candidat(1)], () => page(1), RECETTE, transportQuiRepond(), { cache });
    const rejeu = await relire([candidat(1)], () => page(1), RECETTE, jamais, { cache });
    expect(rejeu.relues[0]!.outil).toEqual({ nom: "vision-ciblee", version: "0.1.0" });
  });
});

describe("le cache ne sert jamais une entrée douteuse (REC-02)", () => {
  it("écrit en deux temps : rien de provisoire ne reste", async () => {
    const cache = cacheDansDossier(dossier);
    await relire([candidat(1)], () => page(1), RECETTE, transportQuiRepond(), { cache });
    expect(readdirSync(dossier).filter((nom) => nom.includes("partiel"))).toEqual([]);
  });

  it("relit une entrée tronquée au lieu de la servir", async () => {
    const cache = cacheDansDossier(dossier);
    const transport = transportQuiRepond();
    await relire([candidat(1)], () => page(1), RECETTE, transport, { cache });

    const [nom] = readdirSync(dossier);
    writeFileSync(join(dossier, nom!), '{"zone":{"empreinte":"aaa');

    const apres = await relire([candidat(1)], () => page(1), RECETTE, transport, { cache });
    expect(apres.depuisLeCache).toBe(0);
    expect(apres.relues).toHaveLength(1);
  });

  it("refuse une entrée qui parle d'une autre image", async () => {
    const cache = cacheDansDossier(dossier);
    await relire([candidat(1)], () => page(1), RECETTE, transportQuiRepond(), { cache });
    const [nom] = readdirSync(dossier);
    const entree = JSON.parse(readFileSync(join(dossier, nom!), "utf8")) as { zone: ZoneLue };
    writeFileSync(join(dossier, nom!), JSON.stringify({ ...entree, zone: { ...entree.zone, empreinte: "9".repeat(32) } }));

    expect(cache.lire(nom!.replace(".json", ""))).toBeUndefined();
  });

  it("refuse une entrée hors contrat", () => {
    const cache = cacheDansDossier(dossier);
    const empreinte = "c".repeat(32);
    writeFileSync(join(dossier, `${empreinte}.json`), JSON.stringify({ zone: { empreinte, numero: -1, confiance: 2 } }));
    expect(cache.lire(empreinte)).toBeUndefined();
    expect(entreesGardees(dossier)).toBe(0);
  });
});

describe("le plafond de dépense s'arrête avant l'appel qui le dépasserait (REC-04)", () => {
  /** Un transport qui rapporte des jetons réalistes : le coût fixe d'un appel, plus les zones. */
  const transportFacture = (): Transport & { appels: number } => {
    const fonction = (async (demande: DemandeVision) => {
      fonction.appels += 1;
      return ReponseVision.parse({
        zones: demande.zones.map((zone, rang) => ({ empreinte: zone.empreinte, numero: 10 + rang, confiance: 0.8 })),
        jetons: { entree: 1058 + demande.zones.length * 37, sortie: demande.zones.length * 30 },
        outil: { nom: "vision-ciblee", version: "0.1.0" },
      });
    }) as Transport & { appels: number };
    fonction.appels = 0;
    return fonction;
  };

  /** On garde l'agrandissement de la recette : l'empreinte d'un recadrage en dépend, donc le
   *  changer ferait manquer le cache — ce qui est juste, et ce qu'un test a d'abord pris pour un
   *  défaut du budget. */
  const avecPlafondCout = (euros: number | undefined): Recette => ({
    ...RECETTE,
    vision: { ...RECETTE.vision!, ...(euros === undefined ? { cout_max_eur: undefined } : { cout_max_eur: euros }) },
  });

  it("compte ce qui a été dépensé sur les jetons rapportés, pas sur l'estimation", async () => {
    const transport = transportFacture();
    const vue = await relire([candidat(1), candidat(2)], (c) => page(c.numero), RECETTE, transport);
    expect(vue.cout).toBeCloseTo(coutEnEuros(vue.jetons, TARIF_PAR_DEFAUT), 10);
    expect(vue.cout).toBeGreaterThan(0);
  });

  it("refuse l'appel qui ferait dépasser, et n'en fait aucun quand le plafond est minuscule", async () => {
    const transport = transportFacture();
    const vue = await relire([candidat(1), candidat(2)], (c) => page(c.numero), avecPlafondCout(0.0000001), transport);
    expect(transport.appels).toBe(0);
    expect(vue.relues).toEqual([]);
    expect(vue.cout).toBe(0);
    expect(vue.nonRelus.map((reste) => reste.raison)).toEqual(["cout", "cout"]);
  });

  it("laisse passer le premier appel et refuse le second quand le plafond tient entre les deux", async () => {
    const transport = transportFacture();
    // Vingt zones par appel : le plafond est posé juste au-dessus d'un appel plein.
    const candidats = Array.from({ length: 40 }, (_, rang) => candidat(rang + 1));
    const unAppel = coutProjete(20, TARIF_PAR_DEFAUT);
    const vue = await relire(candidats, (c) => page(c.numero), avecPlafondCout(unAppel * 1.5), transport);

    expect(transport.appels).toBe(1);
    expect(vue.relues).toHaveLength(20);
    expect(vue.nonRelus).toHaveLength(20);
    expect(vue.nonRelus.every((reste) => reste.raison === "cout")).toBe(true);
    expect(vue.cout).toBeLessThanOrEqual(unAppel * 1.5);
  });

  it("ne reprend pas un appel plus petit après un refus : l'arrêt est net, pas poreux", async () => {
    const transport = transportFacture();
    // 25 candidats : un appel de 20, puis un de 5. Si l'arrêt était poreux, le petit passerait.
    const candidats = Array.from({ length: 25 }, (_, rang) => candidat(rang + 1));
    const vue = await relire(candidats, (c) => page(c.numero), avecPlafondCout(0.0000001), transport);
    expect(transport.appels).toBe(0);
    expect(vue.nonRelus).toHaveLength(25);
  });

  it("ne plafonne rien quand la recette ne déclare aucun coût maximal", async () => {
    const transport = transportFacture();
    const vue = await relire([candidat(1), candidat(2)], (c) => page(c.numero), avecPlafondCout(undefined), transport);
    expect(transport.appels).toBe(1);
    expect(vue.relues).toHaveLength(2);
  });

  it("prend le tarif qu'on lui donne : un prix affiché change sans nous", async () => {
    const transport = transportFacture();
    const cher = { entreeParMillion: 1000, sortieParMillion: 5000 };
    const vue = await relire([candidat(1)], (c) => page(c.numero), avecPlafondCout(0.2), transport, { tarif: cher });
    expect(transport.appels).toBe(0);
    expect(vue.nonRelus[0]?.raison).toBe("cout");
  });

  it("ne fait pas payer une entrée gardée : un rejeu ne consomme aucun plafond", async () => {
    const cache = cacheDansDossier(dossier);
    const candidats = [candidat(1), candidat(2)];
    await relire(candidats, (c) => page(c.numero), RECETTE, transportFacture(), { cache });

    const rejeu = await relire(candidats, (c) => page(c.numero), avecPlafondCout(0.0000001), jamais, { cache });
    expect(rejeu.relues).toHaveLength(2);
    expect(rejeu.cout).toBe(0);
    expect(rejeu.nonRelus).toEqual([]);
  });
});

describe("une entrée gardée qui ne répond plus à la question (lot D, REC-02)", () => {
  const transportAvecVerdict = (): Transport & { appels: number } => {
    const fonction = (async (demande: DemandeVision) => {
      fonction.appels += 1;
      return ReponseVision.parse({
        zones: demande.zones.map((zone) => ({
          empreinte: zone.empreinte,
          numero: 14,
          confiance: 0.9,
          ...(zone.cherche === "repere" ? { repere: "present" as const } : {}),
        })),
        jetons: { entree: 100, sortie: 20 },
        outil: { nom: "vision-ciblee", version: "0.1.0" },
      });
    }) as Transport & { appels: number };
    fonction.appels = 0;
    return fonction;
  };

  const surRepere = (numero: number): Candidat => ({ ...candidat(numero), cherche: "repere" });

  it("est redemandée une fois quand le verdict manque", async () => {
    const cache = cacheDansDossier(dossier);
    // Première demande : un nombre seul. L'entrée gardée ne porte donc aucun verdict.
    const avant = transportQuiRepond();
    await relire([candidat(1)], (c) => page(c.numero), RECETTE, avant, { cache });
    expect(entreesGardees(dossier)).toBe(1);

    // Puis la même image, avec le verdict demandé : l'entrée ne répond plus, elle est refaite.
    const apres = transportAvecVerdict();
    const vue = await relire([surRepere(1)], (c) => page(c.numero), RECETTE, apres, { cache });
    expect(apres.appels).toBe(1);
    expect(vue.depuisLeCache).toBe(0);
    expect(vue.relues[0]!.zone.repere).toBe("present");
  });

  it("et la fois suivante elle répond : redemandée une fois, pas à chaque passage", async () => {
    const cache = cacheDansDossier(dossier);
    const transport = transportAvecVerdict();
    await relire([surRepere(1)], (c) => page(c.numero), RECETTE, transport, { cache });
    const rejeu = await relire([surRepere(1)], (c) => page(c.numero), RECETTE, jamais, { cache });
    expect(rejeu.depuisLeCache).toBe(1);
    expect(rejeu.relues[0]!.zone.repere).toBe("present");
  });

  it("une entrée avec verdict sert aussi une demande qui n'en veut pas", async () => {
    const cache = cacheDansDossier(dossier);
    await relire([surRepere(1)], (c) => page(c.numero), RECETTE, transportAvecVerdict(), { cache });
    const vue = await relire([candidat(1)], (c) => page(c.numero), RECETTE, jamais, { cache });
    expect(vue.depuisLeCache).toBe(1);
  });

  it("deux candidats sur la même image ne la demandent qu'une fois", async () => {
    const transport = transportAvecVerdict();
    // Deux candidats dont le recadrage donne les mêmes pixels : même empreinte, un seul envoi.
    const jumeaux = [surRepere(1), { ...surRepere(1), numero: 2 }];
    const vue = await relire(jumeaux, () => page(1), RECETTE, transport, { cache: cacheDansDossier(dossier) });
    expect(transport.appels).toBe(1);
    expect(vue.relues).toHaveLength(2);
    expect(vue.relues.map((relue) => relue.zone.repere)).toEqual(["present", "present"]);
  });
});
