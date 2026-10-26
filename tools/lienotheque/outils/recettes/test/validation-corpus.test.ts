import { describe, expect, it } from "vitest";
import type { LigneInterpretee } from "@lienotheque/contrats";
import { bilanAssociationCorpus, type Association, type Media } from "../src/index.js";

const ligne = (numero: number, pageImprimee: number): LigneInterpretee => ({
  numero,
  pageImprimee,
  disque: 1,
  piste: 1,
  sourcePiste: "sequence",
  confiance: 0.8,
});

const media = (element: number, page: number): Media => ({
  disque: 1,
  piste: 1,
  element,
  page,
  nom: `1-01 exemple - ${element} Pg.${page}.mp3`,
  empreinte: "a".repeat(64),
});

const association = (appariements: Association["appariements"]): Association => ({
  appariements,
  manquants: [],
  orphelins: [],
});

describe("banc C9.3 — jugement indépendant des faux positifs", () => {
  it("compte comme faux automatique une contradiction d'élément ou de page", () => {
    const juste = { ligne: ligne(488, 144), media: media(488, 144), segment: "inconnu" as const, statut: "auto" as const };
    const faux = { ligne: ligne(489, 144), media: media(500, 145), segment: "inconnu" as const, statut: "auto" as const };
    const bilan = bilanAssociationCorpus(association([juste, faux]));

    expect(bilan.automatiques).toBe(2);
    expect(bilan.fauxAutomatiques).toEqual([faux]);
  });

  it("ne transforme pas une proposition à vérifier en faux lien persistable", () => {
    const proposition = {
      ligne: ligne(489, 144),
      media: media(500, 145),
      segment: "inconnu" as const,
      statut: "a_verifier" as const,
    };
    const bilan = bilanAssociationCorpus(association([proposition]));

    expect(bilan.automatiques).toBe(0);
    expect(bilan.aVerifier).toBe(1);
    expect(bilan.fauxAutomatiques).toEqual([]);
  });

  it("rapporte séparément l'abstention, les manques et les orphelins", () => {
    const bilan = bilanAssociationCorpus({
      appariements: [],
      manquants: [1, 2],
      orphelins: [3],
      abstention: { raison: "medias_non_interpretes", combien: 37 },
    });

    expect(bilan).toMatchObject({ abstention: true, pistesManquantes: 2, mediasOrphelins: 1 });
  });
});
