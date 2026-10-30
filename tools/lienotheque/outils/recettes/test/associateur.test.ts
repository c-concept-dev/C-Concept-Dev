import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LigneInterpretee } from "@lienotheque/contrats";
import {
  associer,
  demandeDeLaRecette,
  borneDuVivier,
  chargerRecette,
  corroborationDesLignes,
  dureeReliee,
  lireNomMedia,
  pisteDuNom,
  qualifierAssociation,
  type BorneDuVivier,
  type Media,
} from "../src/index.js";

const RECETTE = chargerRecette(
  JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/recettes/methode-pastille-piste.v2.json"), "utf8")),
);

const RECETTE_AVEC_INDICES = chargerRecette(
  JSON.parse(readFileSync(join(import.meta.dirname, "../../../fixtures/recettes/methode-pastilles-cd.v5.json"), "utf8")),
);

const ligne = (numero: number, piste: number, confiance = 1, disque = 1): LigneInterpretee => ({
  numero,
  pageImprimee: 3,
  piste,
  disque,
  sourcePiste: "pastille",
  confiance,
});

/** Le cas normal : chaque média présenté porte le groupe de dépôt du document. On le construit
 *  par la vraie fonction, pour que les épreuves qui s'en servent l'éprouvent aussi. */
const GROUPE = "depot:0000";
const borneDe = (medias: readonly Media[]): BorneDuVivier =>
  borneDuVivier([GROUPE], medias.map(() => ({ provenances: [GROUPE] })));

const media = (piste: number, nom: string, dureeS?: number): Media => ({
  piste,
  nom,
  empreinte: String(piste).padStart(64, "0"),
  ...(dureeS === undefined ? {} : { dureeS }),
});

describe("ce qu'un nom de fichier laisse deviner (REC-05)", () => {
  it("sans motif, prend le premier nombre", () => {
    expect(pisteDuNom("Track 45")).toBe(45);
    expect(pisteDuNom("70's Funk 12")).toBe(70);
    expect(pisteDuNom("sans numéro")).toBeUndefined();
  });

  it("avec le motif de la recette, lit chaque champ à sa place", () => {
    const lu = lireNomMedia("1-41 Latin Riffs - 400 Pg.127", "{disque}-{piste} {style} - {element} Pg.{page}");
    expect(lu).toEqual({ disque: 1, piste: 41, element: 400, page: 127 });
  });

  it("le motif l'emporte sur le premier nombre venu", () => {
    // Sans motif, « 1-14 … » donnerait la piste 1 : c'est le numéro de disque.
    expect(pisteDuNom("1-14 James Jamerson - 191 Pg.81")).toBe(1);
    expect(lireNomMedia("1-14 James Jamerson - 191 Pg.81", "{disque}-{piste} {style} - {element} Pg.{page}").piste).toBe(14);
  });

  it("ne devine rien quand le nom ne suit pas le motif", () => {
    expect(lireNomMedia("Track 45", "{disque}-{piste} {style} - {element} Pg.{page}")).toEqual({});
  });

  it("supporte les caractères que les noms d'origine contiennent", () => {
    const lu = lireNomMedia("1-05 4_4 Blues And R&B - 136 Pg.69", "{disque}-{piste} {style} - {element} Pg.{page}");
    expect(lu).toMatchObject({ disque: 1, piste: 5, element: 136, page: 69 });
  });

  it("lit un numéro hiérarchique selon l'exemple déclaré par la manière de lire", () => {
    const motif = "{piste}-{description}#{element}";

    expect(lireNomMedia("20-Chapter 5, Groove #5.19", motif, "5.19")).toEqual({ piste: 20, element: 5_019 });
    expect(lireNomMedia("78-Chapter 6, Lick #6.4", motif, "5.19")).toEqual({ piste: 78, element: 6_004 });
  });

  it("s'abstient quand le numéro hiérarchique du nom est absent ou ambigu", () => {
    const motif = "{piste}-{description}#{element}";

    expect(lireNomMedia("01-Introduction", motif, "5.19")).toEqual({});
    expect(lireNomMedia("20-Chapter 5, Groove #5.19.2", motif, "5.19")).toEqual({});
    expect(lireNomMedia("20-Chapter 5, Groove #519", motif, "5.19")).toEqual({});
  });
});

describe("supports multiples (A3)", () => {
  it("la piste 3 du disque 2 n'est pas la piste 3 du disque 1", () => {
    const medias = [media(3, "disque1.mp3"), { ...media(3, "disque2.mp3"), disque: 2 }];
    const association = associer([ligne(1, 3, 1, 1), ligne(2, 3, 1, 2)], medias, demandeDeLaRecette(RECETTE));
    expect(association.appariements[0]?.media?.nom).toBe("disque1.mp3");
    expect(association.appariements[1]?.media?.nom).toBe("disque2.mp3");
    expect(association.orphelins).toEqual([]);
  });

  it("un élément d'un support dont on n'a pas le média reste sans média", () => {
    const association = associer([ligne(1, 3, 1, 2)], [media(3, "disque1.mp3")], demandeDeLaRecette(RECETTE));
    expect(association.appariements[0]?.media).toBeUndefined();
    expect(association.orphelins, "le média du disque 1 n'est réclamé par personne").toEqual([3]);
    expect(association.manquants).toEqual([3]);
  });
});

describe("association des médias (OUT-10)", () => {
  it("relie chaque élément au média qui porte sa piste", () => {
    const association = associer([ligne(1, 1), ligne(2, 2)], [media(1, "Track 01.mp3"), media(2, "Track 02.mp3")], demandeDeLaRecette(RECETTE));
    expect(association.appariements.map((a) => a.media?.nom)).toEqual(["Track 01.mp3", "Track 02.mp3"]);
    expect(association.appariements.every((a) => a.statut === "auto")).toBe(true);
  });

  it("ne fabrique aucune position : faute de segment vérifié, la paire est inconnue (ANC-03)", () => {
    const association = associer([ligne(1, 1)], [media(1, "Track 01.mp3", 180)], demandeDeLaRecette(RECETTE));
    expect(association.appariements[0]?.segment).toBe("inconnu");
  });

  it("signale les médias qu'aucun élément ne réclame", () => {
    const association = associer([ligne(1, 1)], [media(1, "a.mp3"), media(7, "b.mp3"), media(5, "c.mp3")], demandeDeLaRecette(RECETTE));
    expect(association.orphelins).toEqual([5, 7]);
  });

  it("signale les pistes que la page réclame et qu'aucun média ne porte", () => {
    const association = associer([ligne(1, 1), ligne(2, 9)], [media(1, "a.mp3")], demandeDeLaRecette(RECETTE));
    expect(association.manquants).toEqual([9]);
    expect(association.appariements[1]?.statut).toBe("a_verifier");
  });

  it("met à vérifier ce qui passe sous le seuil de la recette", () => {
    const association = associer([ligne(1, 1, 0.4)], [media(1, "a.mp3")], demandeDeLaRecette(RECETTE));
    expect(RECETTE.validation.seuil_confiance).toBe(0.6);
    expect(association.appariements[0]?.statut).toBe("a_verifier");
  });

  it("plusieurs éléments peuvent pointer la même piste", () => {
    const association = associer([ligne(1, 1), ligne(2, 1)], [media(1, "a.mp3")], demandeDeLaRecette(RECETTE));
    expect(association.appariements.map((a) => a.media?.nom)).toEqual(["a.mp3", "a.mp3"]);
    expect(association.orphelins).toEqual([]);
  });

  it("à deux médias pour une piste, choisit par le nom : deux exécutions, un même résultat", () => {
    const medias = [media(1, "b.mp3"), media(1, "a.mp3")];
    expect(associer([ligne(1, 1)], medias, demandeDeLaRecette(RECETTE)).appariements[0]?.media?.nom).toBe("a.mp3");
    expect(associer([ligne(1, 1)], [...medias].reverse(), demandeDeLaRecette(RECETTE)).appariements[0]?.media?.nom).toBe("a.mp3");
  });

  it("un nom de fichier ne contredit jamais une piste lue sur la page (REC-05)", () => {
    // La page a lu la piste 2 ; le seul média disponible s'appelle « Track 99 ».
    const association = associer([ligne(1, 2)], [media(99, "Track 99.mp3")], demandeDeLaRecette(RECETTE));
    expect(association.appariements[0]?.media).toBeUndefined();
    expect(association.appariements[0]?.ligne.piste, "la page garde raison").toBe(2);
    expect(association.manquants).toEqual([2]);
  });
});

describe("abstention avant toute association automatique (REC-05, OUT-10)", () => {
  it("un indice de nom déjà déclaré par la recette corrobore la page, mais une contradiction passe à vérifier", () => {
    const juste = { ...ligne(488, 54, 0.8, 1), pageImprimee: 144, sourcePiste: "sequence" as const };
    const faux = { ...ligne(489, 55, 0.8, 1), pageImprimee: 144, sourcePiste: "sequence" as const };

    const qualification = qualifierAssociation(
      [juste, faux],
      [
        { ...media(54, "1-54 exemple - 488 Pg.144.mp3"), disque: 1, element: 488, page: 144 },
        { ...media(55, "1-55 exemple - 500 Pg.145.mp3"), disque: 1, element: 500, page: 145 },
      ],
      demandeDeLaRecette(RECETTE_AVEC_INDICES),
      {
        mediasDisponibles: 2,
        borne: borneDe([media(54, "a"), media(55, "b")]),
        // Ce contrôle porte sur les indices tirés des noms, pas sur la corroboration. Ses
        // lignes sont des déductions — zéro lecture — et la règle les refuserait à juste titre.
        // On déclare donc la corroboration tenue, en toutes lettres plutôt qu'en la dérivant,
        // pour que personne ne lise ce contrôle comme une permission de publier sans lecture.
        corroboration: {
          signaux: ["corroboration_media", "pastille"],
          preuveHumaine: false,
          suffisante: true,
          pourquoi: "Déclarée tenue par ce contrôle, qui éprouve les indices de nom.",
        },
      },
    );

    expect(qualification.appariements.map((a) => a.statut)).toEqual(["auto", "a_verifier"]);
  });

  it("s'abstient sur tout le lot quand des médias présents sont tous illisibles par la manière choisie", () => {
    const qualification = qualifierAssociation([ligne(10, 1), ligne(11, 2), ligne(12, 3)], [], demandeDeLaRecette(RECETTE_AVEC_INDICES), {
      mediasDisponibles: 37,
      borne: borneDe([]),
      corroboration: corroborationDesLignes([], { preuveHumaine: true }),
    });
    expect(qualification.appariements).toEqual([]);
    expect(qualification.abstention).toMatchObject({ raison: "medias_non_interpretes", combien: 37 });
  });

  it("ne change pas le témoin F3 dont la recette ne déclare aucun motif de nom", () => {
    // Ce témoin est devenu la preuve vivante de la deuxième voie. Ce recueil n'a qu'une seule
    // lecture — la pastille ; ses enregistrements s'appellent « Track 01 » et ne portent aucun
    // identifiant d'élément à corroborer. Il publie parce que quelqu'un l'a vérifié, et pas
    // autrement : retirez la vérification, il s'abstient.
    const avecOeil = {
      mediasDisponibles: 1,
      borne: borneDe([media(1, "Track 01.mp3")]),
      corroboration: corroborationDesLignes([ligne(1, 1)], { preuveHumaine: true }),
    };
    const qualification = qualifierAssociation([ligne(1, 1)], [media(1, "Track 01.mp3")], demandeDeLaRecette(RECETTE), avecOeil);
    expect(qualification.abstention).toBeUndefined();
    expect(qualification.appariements[0]?.statut).toBe("auto");

    const sansOeil = { ...avecOeil, corroboration: corroborationDesLignes([ligne(1, 1)]) };
    const sansPersonne = qualifierAssociation([ligne(1, 1)], [media(1, "Track 01.mp3")], demandeDeLaRecette(RECETTE), sansOeil);
    expect(sansPersonne.abstention?.raison).toBe("corroboration_insuffisante");
  });
});

/** Un lien ne se publie pas sur un seul décret (OUT-10).
 *
 *  Le principe, posé le 29 octobre 2026 après inventaire des signaux réellement disponibles :
 *  publier demande **deux lectures indépendantes qui s'accordent**, ou **une lecture et une
 *  vérification humaine enregistrée**. Faute de l'un et de l'autre, on s'abstient.
 *
 *  Ce qui compte comme lecture, et ce qui n'en est pas une : une pastille lue sur la page, un
 *  identifiant lu dans le nom d'un enregistrement, une relecture ciblée sont des **lectures** —
 *  quelque chose a été vu quelque part. `sequence`, `suite` et `numero_element` sont des
 *  **déductions** : la recette décrète, rien n'a été lu. Confondre les deux est exactement ce qui
 *  a permis de publier 52 liens sur un document dont pas un repère n'avait été lu.
 *
 *  Les deux cas qui départagent la règle sont réels, et mesurés sur la vraie bibliothèque : un
 *  recueil publie 89 liens de source `pastille` et a été vérifié à l'oreille ; un autre publie
 *  52 liens de source `numero_element`, et porte pourtant le même marqueur « vérifié », posé à la
 *  main à une époque où ses liens pointaient sur l'audio d'un troisième recueil.
 */
describe("publier demande deux lectures, ou une lecture et un œil (OUT-10)", () => {
  const litPar = (numero: number, sourcePiste: LigneInterpretee["sourcePiste"]): LigneInterpretee => ({
    ...ligne(numero, numero),
    ...(sourcePiste === undefined ? {} : { sourcePiste }),
  });
  const deuxMedias = [media(1, "un.mp3"), media(2, "deux.mp3")];

  it("compte les lectures et ignore les déductions", () => {
    const corroboration = corroborationDesLignes([
      litPar(1, "pastille"),
      litPar(2, "pastille"),
      litPar(3, "sequence"),
      litPar(4, "suite"),
    ]);
    expect(corroboration.signaux).toEqual(["pastille"]);
  });

  it("deux lectures indépendantes suffisent, sans personne pour regarder", () => {
    const corroboration = corroborationDesLignes([litPar(1, "pastille"), litPar(2, "corroboration_media")]);
    expect(corroboration.signaux).toHaveLength(2);
    expect(corroboration.suffisante).toBe(true);
  });

  it("une seule lecture ne suffit pas à elle seule", () => {
    const corroboration = corroborationDesLignes([litPar(1, "pastille"), litPar(2, "pastille")]);
    expect(corroboration.suffisante).toBe(false);
    expect(corroboration.pourquoi).toMatch(/une seule/i);
  });

  it("une seule lecture plus un œil suffit — le recueil vérifié à l'oreille", () => {
    const corroboration = corroborationDesLignes([litPar(1, "pastille"), litPar(2, "pastille")], {
      preuveHumaine: true,
    });
    expect(corroboration.suffisante).toBe(true);
  });

  it("un œil sans aucune lecture ne suffit pas — le recueil décrété", () => {
    const corroboration = corroborationDesLignes([litPar(1, "numero_element"), litPar(2, "numero_element")], {
      preuveHumaine: true,
    });
    expect(corroboration.signaux).toHaveLength(0);
    expect(corroboration.suffisante, "un marqueur posé à la main a suffi à publier").toBe(false);
    expect(corroboration.pourquoi).toMatch(/aucune lecture/i);
  });

  it("s'abstient au lieu de publier, et dit ce qui manquait", () => {
    const decretees = [litPar(1, "numero_element"), litPar(2, "numero_element")];
    const association = qualifierAssociation(decretees, deuxMedias, demandeDeLaRecette(RECETTE), {
      borne: borneDe(deuxMedias),
      corroboration: corroborationDesLignes(decretees),
    });
    expect(association.appariements, "des liens ont été publiés sans aucune lecture").toEqual([]);
    expect(association.abstention?.raison).toBe("corroboration_insuffisante");
    expect(association.abstention?.pourquoi).toMatch(/aucune lecture/i);
  });

  it("publie quand la corroboration tient", () => {
    const lues = [litPar(1, "pastille"), litPar(2, "corroboration_media")];
    const association = qualifierAssociation(lues, deuxMedias, demandeDeLaRecette(RECETTE), {
      borne: borneDe(deuxMedias),
      corroboration: corroborationDesLignes(lues),
    });
    expect(association.abstention).toBeUndefined();
    expect(association.appariements).toHaveLength(2);
  });
});

describe("le vivier présenté doit être borné au document avant toute publication (OUT-10)", () => {
  it("borne le vivier quand chaque média porte un groupe de dépôt du document", () => {
    const borne = borneDuVivier(["depot:a"], [{ provenances: ["depot:a"] }, { provenances: ["depot:a", "depot:b"] }]);
    expect(borne.bornee, borne.pourquoi).toBe(true);
    expect(borne.presentes).toBe(2);
    expect(borne.horsBornes).toBe(0);
  });

  it("refuse de borner quand un média vient d'ailleurs, et dit combien", () => {
    const borne = borneDuVivier(["depot:a"], [{ provenances: ["depot:a"] }, { provenances: ["depot:b"] }]);
    expect(borne.bornee).toBe(false);
    expect(borne.horsBornes, "le média étranger est compté").toBe(1);
  });

  it("refuse de borner quand un média ne dit pas d'où il vient", () => {
    const borne = borneDuVivier(["depot:a"], [{ provenances: ["depot:a"] }, {}]);
    expect(borne.bornee).toBe(false);
    expect(borne.sansGroupe).toBe(1);
  });

  it("refuse de borner un document dont on ignore la provenance, même si tout concorde par ailleurs", () => {
    const borne = borneDuVivier([], [{ provenances: ["depot:a"] }]);
    expect(borne.bornee, "ne rien savoir n'est pas une preuve").toBe(false);
  });

  it("borne un document sans aucun média : il n'y a rien à déborder", () => {
    expect(borneDuVivier(["depot:a"], []).bornee).toBe(true);
  });

  it("s'abstient sur tout le lot quand le vivier n'est pas borné, même si chaque lien concorde", () => {
    // Tout est par ailleurs parfait : la page lit la piste 1, et un média porte la piste 1. Seul
    // le bornage manque — et cela suffit à ne rien publier.
    const qualification = qualifierAssociation([ligne(1, 1)], [media(1, "Track 01.mp3")], demandeDeLaRecette(RECETTE), {
      mediasDisponibles: 1,
      borne: borneDuVivier(["depot:a"], [{ provenances: ["depot:b"] }]),
      // La corroboration tient : c'est bien le bornage, et lui seul, qui fait tout arrêter.
      corroboration: corroborationDesLignes([ligne(1, 1)], { preuveHumaine: true }),
    });
    expect(qualification.appariements, "rien n'est présenté").toEqual([]);
    expect(qualification.abstention?.raison).toBe("vivier_non_borne");
  });

  it("ne publie rien non plus quand personne n'a dit sur quoi le vivier est borné", () => {
    const qualification = qualifierAssociation([ligne(1, 1)], [media(1, "Track 01.mp3")], demandeDeLaRecette(RECETTE), {
      mediasDisponibles: 1,
      borne: borneDuVivier([], [{}]),
      corroboration: corroborationDesLignes([ligne(1, 1)], { preuveHumaine: true }),
    });
    expect(qualification.abstention?.raison).toBe("vivier_non_borne");
  });
});

describe("durée reliée", () => {
  it("compte chaque piste une fois, même citée plusieurs fois", () => {
    expect(dureeReliee(associer([ligne(1, 1), ligne(2, 1), ligne(3, 2)], [media(1, "a.mp3", 100), media(2, "b.mp3", 50)], demandeDeLaRecette(RECETTE)))).toBe(150);
  });

  it("ne rend rien plutôt qu'une somme incomplète", () => {
    expect(dureeReliee(associer([ligne(1, 1)], [media(1, "a.mp3")], demandeDeLaRecette(RECETTE)))).toBeUndefined();
  });
});
