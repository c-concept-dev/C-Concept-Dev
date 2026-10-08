import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { comparer, releverCoucheTexte } from "@lienotheque/recettes";
import { tesseractDisponible } from "@lienotheque/lecteur-texte";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "../src/index.js";

/** Les critères des corpus, mesurés à la porte de l'application (OUT-15, REC-06).
 *
 *  Un critère par corpus, et pas deux : une seconde mesure du même critère finit par diverger de
 *  la première, et on ne sait plus laquelle croit. Ils sont ici, et non plus dans les paquets
 *  d'outils, parce qu'ici est la porte que l'application franchit — `executerTravail`. Mesurer une
 *  marche plus bas, c'est prouver un script et non le produit.
 *
 *  F1 fait exception, et la garde : son critère porte sur la couche texte, que la chaîne consomme
 *  mais ne note pas. Le faire passer par la porte changerait ce qu'il prouve. Il est ici pour être
 *  avec les autres, pas pour être mesuré autrement. */

const RACINE = join(import.meta.dirname, "../../..");
const CACHE = ouvrirCache({ avertir: (message) => console.warn(message) });

const F1 = join(RACINE, "fixtures/fichiers/F1/aebersold-FRENCH.pdf");
const F3 = join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf");
const F3_MEDIAS = join(RACINE, "fixtures/fichiers/F3");
const F3_RECETTE = join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json");
const F3_DESCRIPTION = join(RACINE, "fixtures/bibliotheques/F3.json");
const REFERENCE_F3 = join(RACINE, "docs/prototypes/70s_Funk_Disco_appariement_mp3.json");

type Reference = {
  appariements: { exercice: number; piste: number; page_imprimee: number }[];
  pages_absentes_du_scan: number[][];
  mp3_orphelins: number[];
};

const siF1 = existsSync(F1) ? it : it.skip;
const siF3 = existsSync(F3) && existsSync(REFERENCE_F3) && tesseractDisponible() ? it : it.skip;

describe("critère F1 — PDF natif, couche texte exacte (OUT-15)", () => {
  siF1(
    "retrouve la couche texte relevée, page par page",
    async () => {
      const reference = JSON.parse(readFileSync(join(RACINE, "fixtures/references/F1-couche-texte.json"), "utf8")) as {
        empreinte: string;
        pages: number;
        caracteres: number;
        pagesAvecTexte: number;
        detail: { index: number; caracteres: number; mots: number; empreinteTexte: string }[];
      };
      const releve = await releverCoucheTexte(F1);

      expect(releve.empreinte, "la fixture est bien celle qui a servi à relever").toBe(reference.empreinte);
      expect(releve.pages).toBe(reference.pages);
      expect(releve.pagesAvecTexte).toBe(reference.pagesAvecTexte);
      expect(releve.caracteres).toBe(reference.caracteres);
      expect(releve.detail).toEqual(reference.detail);
    },
    600_000,
  );
});

describe("critère F3 — méthode numérisée, 95 sur 95 (OUT-15, REC-06)", () => {
  siF3(
    "relie les 95 éléments à la bonne piste, repère les deux pages absentes et les six médias sans page",
    async () => {
      const reference = JSON.parse(readFileSync(REFERENCE_F3, "utf8")) as Reference;

      const { resultat, association } = chargeOuEchec(
        await executerTravail(
          demandeDeTraitement(randomUUID(), randomUUID(), {
            document: F3,
            medias: F3_MEDIAS,
            recette: F3_RECETTE,
            description: F3_DESCRIPTION,
            cache: CACHE.dossier,
          }),
        ),
      );

      const score = comparer(
        resultat.lignes,
        reference.appariements.map((appariement) => ({ numero: appariement.exercice, piste: appariement.piste })),
      );
      expect(score.fautifs, "aucun élément relié à la mauvaise piste").toEqual([]);
      expect(score.manquants, "aucun élément perdu").toEqual([]);
      expect(score.justes, `${score.justes}/${score.attendus} éléments à la bonne piste`).toBe(score.attendus);
      expect(score.attendus).toBe(95);

      // Les pages 30 et 31 ne sont pas dans le lot : la numérotation le dit, elle ne le masque pas.
      expect(resultat.pagesAbsentes).toEqual(reference.pages_absentes_du_scan.flat());
      expect(resultat.pagesAbsentes).toEqual([30, 31]);

      // Les six médias que portaient ces pages n'ont donc aucune page : on les signale.
      expect(association.orphelins).toEqual([...reference.mp3_orphelins]);
      expect(association.orphelins).toEqual([93, 94, 95, 96, 97, 98]);

      // Et chaque élément tombe sur la page que le prototype lui donnait.
      const pagesAttendues = new Map(reference.appariements.map((a) => [a.exercice, a.page_imprimee]));
      for (const ligne of resultat.lignes)
        expect(ligne.pageImprimee, `élément ${ligne.numero}`).toBe(pagesAttendues.get(ligne.numero));

      expect(resultat.ecartes, "aucun élément écarté").toEqual([]);
      expect(association.appariements.filter((a) => a.statut === "auto")).toHaveLength(95);
      expect(association.manquants, "aucune piste réclamée sans média").toEqual([]);
      expect(resultat.recette).toEqual({ id: "methode-pastille-piste", version: 2 });
    },
    3_600_000,
  );

  siF3(
    "dit où il en est pendant la lecture, et finit à cent pour cent (JOB-03)",
    async () => {
      // Le cache sert la lecture : on mesure donc la fin, qui est annoncée dans tous les cas.
      const pas: number[] = [];
      await executerTravail(
        demandeDeTraitement(randomUUID(), randomUUID(), {
          document: F3,
          medias: F3_MEDIAS,
          recette: F3_RECETTE,
          description: F3_DESCRIPTION,
          cache: CACHE.dossier,
        }),
        { emettre: (message) => (message.type === "progression" ? pas.push(message.progression) : undefined) },
      );
      expect(pas.at(-1), "le dernier mot est cent pour cent").toBe(1);
      expect(pas.every((part) => part >= 0 && part <= 1), "une part reste entre zéro et un").toBe(true);
    },
    3_600_000,
  );

  siF3(
    "refuse une demande dont la charge ne dit pas quoi traiter, sans rien lancer",
    async () => {
      const message = await executerTravail({
        type: "demande",
        protocole: 1,
        travailId: randomUUID(),
        outil: { nom: "traitement-de-lot", version: "1.0.0" },
        versionCible: randomUUID(),
        charge: { document: F3 },
      });
      expect(message.type).toBe("echec");
      expect(message.type === "echec" && message.cause).toMatch(/medias|description|recette/);
      expect(message.type === "echec" && message.reprisePossible, "réessayer ne corrigera pas une demande mal formée").toBe(false);
    },
  );
});

describe("la porte refuse ce qu'elle ne comprend pas", () => {
  it("refuse un désaccord de version avant tout travail (PLT-02)", async () => {
    const message = await executerTravail({
      type: "demande",
      protocole: 99,
      travailId: randomUUID(),
      outil: { nom: "traitement-de-lot", version: "1.0.0" },
      versionCible: randomUUID(),
      charge: {},
    });
    expect(message.type).toBe("echec");
    expect(message.type === "echec" && message.cause).toMatch(/version/i);
  });

  it("lève sur une demande qu'on ne sait pas lire : aucun travail auquel rattacher l'échec", async () => {
    await expect(executerTravail({ type: "demande", protocole: 1 })).rejects.toThrow();
  });
});
