// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VERSION_PROTOCOLE } from "@lienotheque/contrats";
import { executerTravail } from "../src/executant.js";
import { FormatNonLu, lireLeTexte } from "../src/texte.js";

/** Un format qu'on ne sait pas lire **se dit**, il ne plante pas (FMT-01).
 *
 *  ## Le défaut, mesuré le 20 octobre 2026
 *
 *  `lireLeTexte` sur un EPUB du corpus rendait `InvalidPDFException: Invalid PDF structure.` La
 *  chaîne traitait **tout** comme un PDF, et le message accusait la mauvaise cause : il parlait
 *  d'un PDF abîmé là où le fichier n'en est tout simplement pas un. Quelqu'un qui le lirait
 *  chercherait un défaut dans son document plutôt que dans notre outillage.
 *
 *  C'est la même exigence que les signaux nommés de ce lot — `PasEnLigne`, `PasIdentifie`,
 *  « illisible » distingué de « refusée » — et que les phases journalisées : **une impossibilité
 *  porte son nom**, et ce nom dit ce qui manque.
 *
 *  ## Ce que la refus dit, et ce qu'il ne dit pas
 *
 *  Il nomme le format trouvé, parce que c'est ce qui permet d'agir — « EPUB » appelle un lecteur
 *  d'EPUB, « inconnu » appelle un examen. Il ne promet pas que le format viendra : l'EPUB est
 *  l'étape 7 du chemin du texte, et une promesse dans un message d'erreur est une dette qu'on
 *  n'a pas datée. */

let dossier = "";

beforeEach(() => {
  dossier = mkdtempSync(join(tmpdir(), "lienotheque-format-"));
});

afterEach(() => {
  rmSync(dossier, { recursive: true, force: true });
});

/** Un fichier qui **s'identifie** comme un EPUB.
 *
 *  Ce n'est pas un EPUB valide, et ce n'est pas ce qu'on éprouve : la reconnaissance de format
 *  tient à la signature ZIP suivie de l'indice `mimetypeapplication/epub+zip`, qu'un EPUB
 *  conforme place en tête sans compression. Ce que ce fichier éprouve est **le chemin du refus**,
 *  pas la validité d'une archive. */
const commeUnEpub = (): string => {
  const chemin = join(dossier, "un-livre.epub");
  writeFileSync(chemin, Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.from("mimetypeapplication/epub+zip")]));
  return chemin;
};

describe("un format que la chaîne ne lit pas se dit plutôt que de planter", () => {
  it("nomme un format qu'il ne reconnaît pas du tout", async () => {
    const chemin = join(dossier, "mystere.bin");
    writeFileSync(chemin, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]));
    await expect(lireLeTexte(chemin)).rejects.toThrow(FormatNonLu);
    await expect(lireLeTexte(chemin)).rejects.toThrow(/inconnu/i);
  });

  it("dit que c'est la chaîne qui ne sait pas lire, et non le document qui serait abîmé", async () => {
    // La nuance est tout le défaut : « Invalid PDF structure » envoie chercher un problème dans
    // le fichier de quelqu'un, alors que le fichier va très bien.
    const chemin = join(dossier, "mystere.bin");
    writeFileSync(chemin, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]));
    await expect(lireLeTexte(chemin)).rejects.toThrow(/ne sait pas encore lire/i);
  });

  it("porte le chemin du document, pour qu'on sache lequel est en cause", async () => {
    // Dans un lot de deux cent cinquante, « un format n'est pas lu » sans nom de fichier oblige
    // à les rouvrir un par un.
    const chemin = join(dossier, "mystere.bin");
    writeFileSync(chemin, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]));
    await expect(lireLeTexte(chemin)).rejects.toThrow(/mystere\.bin/);
  });
});

describe("un EPUB n'est plus refusé — et une archive abîmée n'accuse jamais le PDF", () => {
  it("ne parle pas d'un PDF abîmé devant un EPUB qui n'est pas une archive valable", async () => {
    // L'EPUB est lu depuis le 20 octobre 2026, donc ce fichier-ci ne va plus chez pdf.js. Ce que
    // cette épreuve garde est l'invariant du défaut d'origine : **aucun message n'accuse un PDF
    // quand le fichier n'en est pas un.** Le message parle désormais de l'archive, ce qui est
    // la cause réelle.
    const chemin = commeUnEpub();
    await expect(lireLeTexte(chemin)).rejects.toThrow(/archive/i);
    await expect(lireLeTexte(chemin), "le message accuse encore le PDF").rejects.not.toThrow(/PDF structure/);
  });
});

describe("un format illisible ne se retente pas trois fois (JOB-05, FMT-01)", () => {
  /** La porte, telle que l'hôte l'appelle : une demande, une réponse. */
  const demander = async (document: string) =>
    executerTravail({
      type: "demande",
      protocole: VERSION_PROTOCOLE,
      travailId: "00000000-0000-4000-8000-0000000000aa",
      outil: { nom: "traitement-de-lot", version: "1.0.0" },
      versionCible: "00000000-0000-4000-8000-0000000000bb",
      charge: {
        document,
        medias: dossier,
        inventaireMedias: [],
        provenancesMedias: ["lot:epreuve"],
        recette: null,
        description: join(dossier, "bibliotheque.json"),
      },
    });

  it("dit qu'une relance n'y changera rien", async () => {
    // Mesuré le 1er novembre 2026 sur un dépôt réel de `.txt` : trois tentatives, soixante-cinq
    // secondes, et le travail fini en échec définitif par épuisement des essais plutôt que par
    // constat. Or un format que la chaîne ne lit pas ne se mettra pas à se lire au deuxième essai :
    // la porte le savait et l'annonçait quand même reprenable, parce que son unique `catch`
    // suppose qu'une lecture interrompue a laissé du travail utile derrière elle.
    writeFileSync(
      join(dossier, "bibliotheque.json"),
      JSON.stringify({
        id: "essai-du-format",
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
    const chemin = join(dossier, "Les modes.txt");
    writeFileSync(chemin, "Ionien, dorien, phrygien.\n");

    const reponse = await demander(chemin);
    expect(reponse.type, "la porte répond un échec").toBe("echec");
    if (reponse.type !== "echec") return;
    expect(reponse.cause, "et le nomme sans accuser le document").toMatch(/ne sait pas encore lire/i);
    expect(reponse.reprisePossible, "une relance n'y changera rien").toBe(false);
  });
});
