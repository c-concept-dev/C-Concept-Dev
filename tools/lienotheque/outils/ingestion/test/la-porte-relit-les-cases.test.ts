// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DemandeVision, ReponseVision } from "@lienotheque/contrats";
import { tesseractDisponible } from "@lienotheque/lecteur-texte";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "../src/index.js";
import { pdfDePages, prose } from "./aides/pdf.js";

/** A2 — la PORTE relit les cases en défaut, et le dit à l'écran (A2, OUT-05, OUT-10, JOB-05).
 *
 *  ## Le défaut que ces contrôles existent pour empêcher
 *
 *  Le 12 novembre 2026, la voie savait appeler son port de relecture et personne ne le lui
 *  passait : `instantaneDeLot` construisait ses options sans lui. La capacité existait, elle
 *  était éprouvée, et **aucun document traité par l'application ne pouvait l'atteindre**. C'est
 *  le quatrième cas de cette famille dans ce dépôt, et le garde-fou de `packages/banc` le dit
 *  déjà : une épreuve qui appelle la fonction prouve la fonction ; seule une épreuve qui
 *  franchit `executerTravail` prouve le produit.
 *
 *  ## Le piège que ces contrôles tiennent, et il a failli coûter de l'argent
 *
 *  **Les cases ne sont pas mesurées dans le repère des images.** Sur un document natif, les mots
 *  viennent de la couche du PDF et leurs coordonnées sont en points — 595 × 842 ici —, alors que
 *  la voie rend ses pages à 1800 de large. Relire sans convertir aurait envoyé lire le neuvième
 *  supérieur gauche de la feuille, c'est-à-dire du papier blanc, **au tarif d'un appel en ligne**.
 *  Mesuré avant d'écrire la première ligne du relecteur distant : 595 d'un côté, 1800 de l'autre.
 *
 *  ## Ce qui n'est pas éprouvé ici, et où ça l'est
 *
 *  Le transport est un port : il reçoit une fonction, aucun réseau n'est touché, aucun jeton
 *  n'est lu. Ce que le vrai transport fait de la demande est éprouvé dans `@lienotheque/vision`,
 *  et ce que le relecteur distant en fait dans `relecteur-par-vision.test.ts`.
 *
 *  **Ce qui n'est PAS repris ici, et c'est délibéré** : le comptage d'une panne, et le cas « aucun
 *  relecteur » vu de la voie. Les deux sont tenus deux étages plus bas — `la-chaine-relit-les-cases`
 *  pour la voie, `relecteur-par-vision` pour l'étage distant — et **un rejeu de document coûte
 *  quarante-cinq secondes**. Ce que seule la porte peut prouver, c'est le **branchement** : qu'un
 *  document traité par l'application atteigne le port, dans le bon repère, et que ce qu'il en
 *  rapporte arrive à l'écran. Le reste n'a pas à être repayé ici. */

/** Sans Tesseract, aucun document ne traverse la porte : `executerTravail` lit les pages, et
 *  l'ingestion appelle la reconnaissance locale même sur un document natif. C'est un fait de
 *  l'hôte, pas du produit — l'application embarque son propre moteur.
 *
 *  **Mesuré, et c'était mon erreur.** La course 43242544864 a échoué sur `Vérification
 *  (ubuntu-latest)` : cinq contrôles de ce fichier sur six, tous sur `spawnSync tesseract
 *  ENOENT`. `lienotheque-ci.yml` n'installe Tesseract **que sur macOS**, et délibérément — avec
 *  les octets exacts du paquet, pour qu'un vert dise quelque chose du produit. Le contrôle local
 *  ne pouvait pas le voir : cette machine a Tesseract. Le même fait est déjà épinglé ailleurs
 *  (`tesseract-absent-aucune-page-lue`) ; sauter est plus honnête qu'un rouge permanent, parce
 *  qu'un contrôle sauté dit « pas éprouvé ici » au lieu de dire « cassé ». */
const siTesseract = tesseractDisponible() ? it : it.skip;

let dossier = "";

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-porte-relit-"));
});

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

const cellule = (x: number, y: number, texte: string): string => `0 g BT /F1 12 Tf ${x} ${y} Td (${texte}) Tj ET`;

/** Une table de huit rangées sur trois colonnes, dont une case manque à la couche texte.
 *
 *  Le trou est exactement celui que `lireLaTable` nomme `aRelire` : mesuré sur cette fixture,
 *  huit rangées et **une** seule case en défaut, rangée 3, colonne 1. */
const TABLE = Array.from({ length: 8 }, (_, rang) =>
  [rang + 1, rang + 1, rang + 8]
    .map((valeur, colonne) =>
      rang === 3 && colonne === 1 ? "" : cellule(90 + colonne * 90, 700 - rang * 24, String(valeur)),
    )
    .join(" "),
).join(" ");

function lieux(): { description: string; medias: string; document: string } {
  const description = join(dossier, "bibliotheque.json");
  writeFileSync(
    description,
    JSON.stringify({
      id: "essai-de-relecture",
      nom: "Essai",
      mots: {
        element: { un: "élément", plusieurs: "éléments" },
        piste: { un: "piste", plusieurs: "pistes" },
        page: { un: "page", plusieurs: "pages" },
      },
      schema: {
        cle: "essai",
        nom: "Essai",
        langue: "fr",
        version: 1,
        axes: [
          {
            cle: "un-axe",
            nom: "Un axe",
            nature: "referentiel",
            cardinalite: "une",
            structure: "plat",
            obligatoire: false,
            alias: [],
            valeurs: [{ cle: "une", nom: "Une valeur", alias: [], synonymes: [], retiree: false }],
          },
        ],
      },
    }),
  );
  const medias = join(dossier, "medias");
  mkdirSync(medias);
  // Trois pages : assez pour que rien ne revienne régulièrement — donc la seconde voie passe par
  // sa table globale —, et pas plus, parce que **chaque page est un rendu**. Mesuré : le corps de
  // ce fichier est à peu près linéaire en pages, neuf secondes chacune sur cette machine.
  const document = pdfDePages(dossier, "table.pdf", [TABLE, ...Array.from({ length: 2 }, (_, r) => prose(700 - r * 60))]);
  return { description, medias, document };
}

const GROUPE = "lot:essai";
const inventaire = Array.from({ length: 8 }, (_, place) => ({
  nom: `${String(place + 1).padStart(2, "0")} - support.mp3`,
  empreinte: `${place}`.repeat(64).slice(0, 64),
  provenances: [GROUPE],
}));

/** Un transport fabriqué : il note ce qu'on lui envoie et rend le nombre demandé. */
const transportQuiRepond = (numero: number | null) =>
  vi.fn(
    async (demande: DemandeVision): Promise<ReponseVision> => ({
      zones: demande.zones.map((zone) => ({
        empreinte: zone.empreinte,
        numero,
        confiance: numero === null ? 0 : 0.95,
      })),
      jetons: { entree: 1200, sortie: 60 },
      outil: { nom: "essai", version: "1" },
    }),
  );

async function parLaPorte(options: { transport?: ReturnType<typeof transportQuiRepond>; sansAdresse?: boolean } = {}) {
  const { description, medias, document } = lieux();
  const journal: string[] = [];
  const message = await executerTravail(
    demandeDeTraitement(randomUUID(), randomUUID(), {
      description,
      medias,
      document,
      inventaireMedias: inventaire,
      provenancesMedias: [GROUPE],
      ...(options.sansAdresse === true ? {} : { relecture: "https://exemple.invalide" }),
    }),
    {
      emettre: (un) => {
        if (un.type === "journal") journal.push(un.texte);
      },
      transport: options.transport,
    },
  );
  return { charge: chargeOuEchec(message), journal };
}

type ChargeDeResultat = Awaited<ReturnType<typeof parLaPorte>>["charge"];

describe("A2 : la porte relit les cases en défaut", () => {
  /** Un seul passage pour les deux contrôles qui l'observent : le même rejeu, deux questions.
   *
   *  Un rejeu par assertion ferait cinq rendus de document pour cinq questions sur le même fait,
   *  et le corps d'un contrôle se raccourcit — jamais son délai. */
  const unPassage = (() => {
    let fait:
      | Promise<{ transport: ReturnType<typeof transportQuiRepond>; charge: ChargeDeResultat; journal: readonly string[] }>
      | undefined;
    return () => {
      fait ??= (async () => {
        // Le regard distant ne rend rien : ce qui est éprouvé ici est ce qui **part**, et le fait
        // qu'une case sans valeur arrive à l'écran. Une réponse pleine la ferait disparaître du
        // relevé, et il faudrait un second passage pour l'observer.
        const transport = transportQuiRepond(null);
        const { charge, journal } = await parLaPorte({ transport });
        return { transport, charge, journal };
      })();
      return fait;
    };
  })();

  siTesseract(
    "demande la relecture de la case en défaut, une seule fois et pour elle seule (A2, JOB-05)",
    async () => {
      const { transport } = await unPassage();
      expect(transport, "la porte ne passe pas le port : aucun document traité ne peut l'atteindre").toHaveBeenCalled();
      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0]![0].zones).toHaveLength(1);
    },
    180_000,
  );

  siTesseract(
    "envoie la case dans le repère des IMAGES, pas dans celui du texte (A2, OUT-08)",
    async () => {
      const { transport } = await unPassage();
      const zone = transport.mock.calls[0]![0].zones[0]!;
      // La case mesure 13,3 × 12 dans le repère du texte (595 de large) et la voie rend à 1800 :
      // le facteur est de 3,03, marge claire en plus. Sans conversion, ce qui partirait ferait
      // une vingtaine de pixels de côté — et montrerait le coin de la feuille.
      expect(zone.largeur, "la case part à la taille du repère du texte : on lirait du papier blanc").toBeGreaterThan(30);
      expect(zone.hauteur).toBeGreaterThan(30);
      expect(zone.largeur, "ce qui part n'est plus une case").toBeLessThan(300);
    },
    180_000,
  );

  siTesseract(
    "porte le relevé jusqu'à l'écran, avec ses comptes (A2, OUT-10, UX-03)",
    async () => {
      const { charge } = await unPassage();
      const cas = charge.vue.douteux.filter((doute) => doute.etat === "relecture_non_faite");
      expect(cas, "une case qu'on n'a pas su lire a disparu de l'écran").toHaveLength(1);
      expect(`${cas[0]!.proposition} ${cas[0]!.motif}`).toMatch(/1/);
    },
    180_000,
  );

  siTesseract(
    "n'appelle rien quand l'hôte ne donne aucune adresse de relecture, et le dit (A2)",
    async () => {
      const transport = transportQuiRepond(4);
      const { charge } = await parLaPorte({ transport, sansAdresse: true });
      expect(transport).not.toHaveBeenCalled();
      const cas = charge.vue.douteux.filter((doute) => doute.etat === "relecture_non_faite");
      expect(cas, "sans relecteur, la case doit être DITE non relue, pas oubliée").toHaveLength(1);
    },
    180_000,
  );

  /** La panne de l'étage distant, vue **depuis l'écran**, et c'est le seul endroit qui le prouve.
   *
   *  Mesuré le 12 novembre 2026 sur un document réel : 40 pannes au regard distant, et le relevé
   *  porté à Vérifier annonçait **0**. La chaîne compte sa panne et ne la lève pas — ce qu'il faut
   *  qu'elle fasse —, donc rien ne s'échappe, donc la voie n'en savait rien. Les deux étages
   *  au-dessous comptent bien leurs pannes ; ce qui manquait était le **fil** entre eux et l'écran,
   *  et un fil ne se prouve qu'en le suivant d'un bout à l'autre.
   *
   *  C'est le seul contrôle de ce fichier qui mérite son propre rejeu : il faut un transport qui
   *  tombe, et le passage partagé répond. */
  siTesseract(
    "porte jusqu'à l'écran la panne que la chaîne a AVALÉE (A2, OUT-10)",
    async () => {
      const transport = vi.fn(async (): Promise<ReponseVision> => {
        throw new Error("regard distant injoignable");
      });
      const { charge, journal } = await parLaPorte({ transport });
      expect(transport).toHaveBeenCalled();
      expect(
        charge.relectureDesCases?.pannes,
        "une route coupée doit se voir : « aucune panne » ressemblerait à « rien à rattraper »",
      ).toBeGreaterThanOrEqual(1);
      const dit = journal.find((ligne) => ligne.startsWith("relecture des cases :"));
      expect(dit, "le journal porte le compte agrégé, et il doit porter la panne").toMatch(/1 en panne/);
    },
    180_000,
  );

  siTesseract(
    "dit au journal ce que la relecture a demandé, rendu et raté (A2, JOB-07)",
    async () => {
      const { journal } = await unPassage();
      const dit = journal.find((ligne) => ligne.startsWith("relecture des cases"));
      expect(dit, "une dépense qu'on ne voit pas est une dépense qu'on ne surveille pas").toBeDefined();
      expect(dit!, "les pannes se disent à part : une panne tue ressemble à un succès").toMatch(/panne/i);
      expect(journal.some((ligne) => ligne.includes("regard distant")), "le coût n'est pas dit").toBe(true);
    },
    180_000,
  );
});
