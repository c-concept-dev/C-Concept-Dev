// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { rejouerParOracle } from "../src/voie-oracle.js";
import { relecteurEnChaine } from "../src/relecteur-en-chaine.js";
import type { PortDeRelectureDesCases, RelecteurDeZone } from "../src/relire-les-zones.js";
import { pdfDePages, prose } from "./aides/pdf.js";

/** A2 — la chaîne appelle vraiment la relecture des cases en défaut (A2, OUT-05, REC-02).
 *
 *  ## Le défaut que ces contrôles existent pour empêcher
 *
 *  Relevé le 6 novembre 2026 : `relireLesZones` et `relecteurSurPlace` étaient construits,
 *  éprouvés, mesurés par un programme autonome — et **appelés par rien dans la chaîne**. Le port
 *  des repères, lui, était appelé, mais sur un bouchon qui échouait toujours. Autrement dit, le
 *  repli Vision était l'exigence 0 et **aucun chemin de la chaîne ne pouvait l'atteindre**.
 *
 *  Un port construit mais débranché est pire qu'un port absent : il donne l'apparence d'une
 *  capacité, et la mesure qui l'emploie rend « rien rattrapé » — ce qui ressemble exactement à
 *  « rien à rattraper ». C'est le trou qui ressemble au succès.
 *
 *  ## Ce que ces contrôles tiennent
 *
 *  Que la chaîne demande la relecture des cases qu'elle n'a pas su lire, qu'elle n'en demande
 *  aucune autre, que la valeur relue serve à publier, et qu'une panne de relecture se compte au
 *  lieu de se taire. */

const bacs: string[] = [];
const bac = (): string => {
  const chemin = mkdtempSync(join(tmpdir(), "chaine-relit-"));
  bacs.push(chemin);
  return chemin;
};
afterAll(() => {
  for (const chemin of bacs) rmSync(chemin, { recursive: true, force: true });
});

/** Une table de huit rangées « élément · piste · folio », dont une case peut manquer.
 *
 *  Le trou est fait comme la vraie vie le fait : la cellule n'a pas été lue du tout. C'est le cas
 *  que `lireLaTable` nomme `aRelire`. */
function motsDeTable(trou?: { readonly rangee: number; readonly colonne: number }) {
  return Array.from({ length: 8 }, (_, place) =>
    [place + 1, place + 1, place + 8].flatMap((valeur, colonne) =>
      trou !== undefined && trou.rangee === place && trou.colonne === colonne
        ? []
        : [{ texte: String(valeur), x: 100 + colonne * 100, y: 100 + place * 20, l: 12, h: 10 }],
    ),
  ).flat();
}

const inventaire = Array.from({ length: 8 }, (_, place) => ({
  nom: `${String(place + 1).padStart(2, "0")} - Élément #${place + 1}.mp3`,
  empreinte: `${place}`.repeat(64).slice(0, 64),
  provenances: ["lot:epreuve"],
}));

/** Le repère dans lequel les mots de cette fixture sont mesurés : celui de `pdfDePages`.
 *
 *  **Il doit être déclaré, et c'est le sujet d'un garde-fou.** La voie rend ses pages à 1800 de
 *  large ; sans cette largeur, elle refuse de relire plutôt que de deviner le facteur — et elle a
 *  commencé par refuser ici, le 12 novembre 2026, ce qui est la preuve que le refus mord. */
const REPERE = { largeur: 595, hauteur: 842 } as const;

const pagesAutour = [
  { page: 2, pageImprimee: 8, texte: "Début du premier élément", mots: [], ...REPERE },
  ...Array.from({ length: 8 }, (_, place) => ({
    page: place + 3,
    ...(place === 7 ? { pageImprimee: 16 } : {}),
    texte: `Élément #${place + 1}`,
    mots: [],
    ...REPERE,
  })),
];

const courir = async (
  trou: { readonly rangee: number; readonly colonne: number } | undefined,
  relectureDesCases?: RelecteurDeZone,
  /** Le port tel qu'il est vraiment : un composeur, qui rend de quoi lire **et** de quoi dire ses
   *  pannes. Donné à la place du relecteur simple quand c'est ce second volet qu'on éprouve. */
  port?: PortDeRelectureDesCases,
) =>
  rejouerParOracle(
    pdfDePages(
      bac(),
      "chaine-relit.pdf",
      Array.from({ length: 10 }, () => prose(700)),
    ),
    bac(),
    {
      inventaireMedias: inventaire,
      provenancesMedias: ["lot:epreuve"],
      foliosEtablis: true,
      texteDesPages: [{ page: 1, texte: "Table des pistes", mots: motsDeTable(trou), ...REPERE }, ...pagesAutour],
      budgetExploration: { paires: 256, secondes: 0 },
      // Le port est un **composeur** : la voie lui passe de quoi voir, il rend de quoi lire.
      // Ces contrôles ignorent les images — ce qu'ils éprouvent est l'appel, pas la lecture.
      ...(port !== undefined
        ? { relectureDesCases: port }
        : relectureDesCases === undefined
          ? {}
          : { relectureDesCases: () => ({ relire: relectureDesCases }) }),
    },
  );

describe("A2 : la chaîne relit les cases qu'elle n'a pas su lire", () => {
  it("demande la relecture de la case en défaut, et d'elle seule (A2)", async () => {
    const relire = vi.fn<RelecteurDeZone>(async () => undefined);
    await courir({ rangee: 3, colonne: 2 }, relire);

    expect(relire, "le port doit être appelé par la chaîne, pas seulement par un programme de mesure").toHaveBeenCalled();
    expect(relire.mock.calls.map(([demande]) => demande.page)).toEqual([1]);
    expect(relire).toHaveBeenCalledTimes(1);
  });

  it("ne demande aucune relecture quand la table est complète (A2)", async () => {
    const relire = vi.fn<RelecteurDeZone>(async () => undefined);
    await courir(undefined, relire);
    expect(relire).not.toHaveBeenCalled();
  });

  it("publie grâce à la valeur relue, là où le trou l'en empêchait (A2, REC-02)", async () => {
    const sansRelecture = await courir({ rangee: 3, colonne: 2 });
    const avecRelecture = await courir({ rangee: 3, colonne: 2 }, async () => "11");

    const recoupees = (rejeu: Awaited<ReturnType<typeof courir>>): number =>
      rejeu.resultat.lignes.filter((ligne) => ligne.sourcePiste === "corroboration_table").length;

    expect(recoupees(avecRelecture)).toBeGreaterThan(recoupees(sansRelecture));
  });

  it("compte la panne d'une relecture au lieu de la taire (A2)", async () => {
    const rejeu = await courir({ rangee: 3, colonne: 2 }, async () => {
      throw new Error("regard distant injoignable");
    });
    expect(rejeu.relectureDesCases?.pannes).toBe(1);
  });

  /** La panne qu'un étage **avale**, et c'est le cas réel — pas celle qui s'échappe.
   *
   *  Mesuré le 12 novembre 2026 sur un document réel : l'étage distant comptait **40 pannes sur
   *  62 demandes**, et le relevé porté à l'écran Vérifier annonçait **0**. La cause est simple et
   *  elle n'était pas visible : `relecteurEnChaine` compte sa panne, passe la main, et **ne lève
   *  pas** — rien ne s'échappe, donc un relevé qui ne compte que ce qui s'échappe dit « aucune
   *  panne » quoi qu'il arrive. Vérifier aurait affirmé que la route était intacte. */
  it("compte la panne qu'un ÉTAGE a avalée, et pas seulement celle qui s'échappe (A2, OUT-10)", async () => {
    const chaine = relecteurEnChaine([
      {
        nom: "regard distant",
        relire: async () => {
          throw new Error("regard distant injoignable");
        },
      },
    ]);
    const rejeu = await courir({ rangee: 3, colonne: 2 }, undefined, () => ({
      relire: chaine.relire,
      pannes: () => chaine.releve().reduce((total, etage) => total + etage.pannes, 0),
    }));
    expect(
      rejeu.relectureDesCases?.pannes,
      "la chaîne a compté sa panne et ne l'a pas levée : un relevé qui ne lit que ce qui s'échappe dit 0",
    ).toBe(1);
    expect(rejeu.relectureDesCases?.nonRelues).toHaveLength(1);
  });

  it("marque la case non relue avec sa raison, pour que Vérifier la montre (A2, OUT-10)", async () => {
    const rejeu = await courir({ rangee: 3, colonne: 2 });
    expect(rejeu.relectureDesCases?.nonRelues).toEqual([
      expect.objectContaining({ page: 1, etat: "relecture_non_faite", pourquoi: "aucun relecteur branché sur cette voie" }),
    ]);
  });
});
