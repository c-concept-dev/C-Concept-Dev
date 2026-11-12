// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { DemandeVision, ReponseVision } from "@lienotheque/contrats";
import type { ImageGrise } from "@lienotheque/images";
import { relecteurParVision } from "../src/relecteur-par-vision.js";
import type { DemandeDeRelecture } from "../src/relire-les-zones.js";

/** A2 — le regard distant au bout du port de relecture des cases (A2, OUT-05, OUT-08, OUT-10).
 *
 *  ## Le défaut que ces contrôles existent pour empêcher
 *
 *  Le port de relecture existait, l'étage local existait, et **rien ne branchait un regard
 *  distant au bout** : les cases restées sans accord sur place étaient dites non relues, point
 *  final. C'est la seule dépense qu'un appel en ligne mérite, et personne ne la faisait.
 *
 *  ## Ce que ces contrôles tiennent
 *
 *  Qu'une case parte **seule** et recadrée, avec l'intervalle que le vivier autorise ; qu'un
 *  nombre hors de cet intervalle soit **refusé** au lieu d'être rendu ; qu'une entrée déjà
 *  gardée ne soit pas repayée ; que le plafond de dépense s'applique **avant** l'appel qui le
 *  dépasserait ; et qu'une page absente ne fasse partir aucun appel.
 *
 *  Aucun réseau n'est touché : le transport est un port, et il reçoit ici une fonction. */

const page = (largeur: number, hauteur: number): ImageGrise => ({
  largeur,
  hauteur,
  // Un fond clair, un pavé sombre au milieu : de quoi produire un recadrage non trivial.
  pixels: Uint8Array.from({ length: largeur * hauteur }, (_, rang) =>
    Math.floor(rang / largeur) > hauteur / 3 && Math.floor(rang / largeur) < (2 * hauteur) / 3 ? 20 : 240,
  ),
});

const demande = (dessus: Partial<DemandeDeRelecture> = {}): DemandeDeRelecture => ({
  page: 1,
  x: 100,
  y: 100,
  l: 60,
  h: 30,
  pourquoi: "cellule non lue",
  ...dessus,
});

/** Une réponse de transport fabriquée : le nombre lu, et les jetons qu'il aurait coûtés. */
const repond = (numero: number | null, jetons = { entree: 2000, sortie: 100 }) =>
  vi.fn(
    async (envoyee: DemandeVision): Promise<ReponseVision> => ({
      zones: envoyee.zones.map((zone) => ({
        empreinte: zone.empreinte,
        numero,
        confiance: numero === null ? 0 : 0.9,
      })),
      jetons,
      outil: { nom: "essai", version: "1" },
    }),
  );

describe("A2 : le regard distant relit une case, et ne dépense que ce qu'il doit", () => {
  it("envoie la case seule, recadrée, avec l'intervalle que le vivier autorise (A2, OUT-08)", async () => {
    const transport = repond(12);
    const { relire } = relecteurParVision({
      transport,
      imageDeLaPage: () => page(400, 300),
      attendu: { min: 1, max: 52 },
    });

    expect(await relire(demande())).toBe("12");
    expect(transport).toHaveBeenCalledTimes(1);
    const envoyee = transport.mock.calls[0]![0];
    expect(envoyee.zones, "une case part seule : un appel qui en porte vingt ne se rejoue pas").toHaveLength(1);
    expect(envoyee.zones[0]!.attendu).toEqual({ min: 1, max: 52 });
    expect(envoyee.zones[0]!.largeur, "ce qui part est la case, pas la page").toBeLessThan(400);
    expect(envoyee.zones[0]!.image.length, "la case part bien avec son image").toBeGreaterThan(0);
  });

  it("rend ce qui est illisible pour illisible, sans le deviner (A2, exigence 0)", async () => {
    const transport = repond(null);
    const { relire, releve } = relecteurParVision({ transport, imageDeLaPage: () => page(400, 300) });
    expect(await relire(demande())).toBeUndefined();
    expect(releve().rendus).toBe(0);
  });

  it("refuse un nombre hors de l'intervalle attendu plutôt que de le rendre (A2, REC-05)", async () => {
    const transport = repond(99);
    const { relire, releve } = relecteurParVision({
      transport,
      imageDeLaPage: () => page(400, 300),
      attendu: { min: 1, max: 52 },
    });
    expect(await relire(demande()), "99 déborde le vivier : il n'a rien à désigner").toBeUndefined();
    expect(releve().refusees).toBe(1);
  });

  it("ne rappelle pas ce qu'une entrée gardée porte déjà (A2)", async () => {
    const gardees = new Map<string, unknown>();
    const cache = {
      lire: (empreinte: string) => gardees.get(empreinte) as never,
      ecrire: (empreinte: string, entree: unknown) => void gardees.set(empreinte, entree),
    };
    const transport = repond(7);
    const premier = relecteurParVision({ transport, imageDeLaPage: () => page(400, 300), cache });
    expect(await premier.relire(demande())).toBe("7");

    const second = relecteurParVision({ transport, imageDeLaPage: () => page(400, 300), cache });
    expect(await second.relire(demande())).toBe("7");
    expect(transport, "la même case, le même recadrage : une seule dépense").toHaveBeenCalledTimes(1);
    expect(second.releve().depuisLeCache).toBe(1);
  });

  it("s'arrête AVANT l'appel qui dépasserait le plafond de dépense (A2, OUT-08)", async () => {
    const transport = repond(3, { entree: 2_000_000, sortie: 0 });
    const { relire, releve } = relecteurParVision({
      transport,
      imageDeLaPage: () => page(400, 300),
      // Deux millions de jetons d'entrée au premier appel, soit près de deux euros au tarif
      // affiché : le second doit être refusé par un plafond d'un euro.
      plafondEnEuros: 1,
    });
    expect(await relire(demande())).toBe("3");
    expect(await relire(demande({ x: 200 })), "le plafond est atteint : plus rien ne part").toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(releve().plafondAtteint).toBe(true);
  });

  it("n'appelle rien quand la page n'est pas disponible (A2)", async () => {
    const transport = repond(5);
    const { relire, releve } = relecteurParVision({ transport, imageDeLaPage: () => undefined });
    expect(await relire(demande())).toBeUndefined();
    expect(transport).not.toHaveBeenCalled();
    expect(releve().appels).toBe(0);
  });

  it("compte ce qui a été dépensé d'après les jetons rendus, jamais d'après une projection (A2)", async () => {
    const transport = repond(4, { entree: 1000, sortie: 200 });
    const { relire, releve } = relecteurParVision({ transport, imageDeLaPage: () => page(400, 300) });
    await relire(demande());
    const compte = releve();
    expect(compte.jetons).toEqual({ entree: 1000, sortie: 200 });
    expect(compte.appels).toBe(1);
    expect(compte.rendus).toBe(1);
    expect(compte.cout, "une dépense nulle ne se rapporte pas comme une dépense").toBeGreaterThan(0);
  });

  /** Une panne **lève**, et c'est voulu : c'est l'étage au-dessus — la chaîne — qui décide ce
   *  qu'on fait d'un réseau coupé, et son relevé la compte comme panne et non comme silence.
   *  L'avaler ici rendrait « rien rattrapé », ce qui ressemble exactement à « rien à
   *  rattraper ». Ce relecteur la compte quand même, pour pouvoir la dire seul. */
  it("laisse la panne du transport LEVER, après l'avoir comptée (A2)", async () => {
    const transport = vi.fn(async (): Promise<ReponseVision> => {
      throw new Error("regard distant injoignable");
    });
    const { relire, releve } = relecteurParVision({ transport, imageDeLaPage: () => page(400, 300) });
    await expect(relire(demande())).rejects.toThrow("injoignable");
    expect(releve().pannes).toBe(1);
  });
});
