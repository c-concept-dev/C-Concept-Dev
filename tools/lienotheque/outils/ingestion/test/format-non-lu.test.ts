// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("refuse un EPUB en le nommant, et ne parle pas d'un PDF abîmé", async () => {
    await expect(lireLeTexte(commeUnEpub())).rejects.toThrow(FormatNonLu);
    await expect(lireLeTexte(commeUnEpub())).rejects.toThrow(/EPUB/);
    await expect(lireLeTexte(commeUnEpub()), "le message accuse encore le PDF").rejects.not.toThrow(/PDF structure/);
  });

  it("dit que c'est la chaîne qui ne sait pas lire, et non le document qui serait abîmé", async () => {
    // La nuance est tout le défaut : « Invalid PDF structure » envoie chercher un problème dans
    // le fichier de quelqu'un, alors que le fichier va très bien.
    await expect(lireLeTexte(commeUnEpub())).rejects.toThrow(/ne sait pas encore lire/i);
  });

  it("nomme aussi un format qu'il ne reconnaît pas du tout", async () => {
    const chemin = join(dossier, "mystere.bin");
    writeFileSync(chemin, Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]));
    await expect(lireLeTexte(chemin)).rejects.toThrow(FormatNonLu);
    await expect(lireLeTexte(chemin)).rejects.toThrow(/inconnu/i);
  });

  it("porte le chemin du document, pour qu'on sache lequel est en cause", async () => {
    // Dans un lot de deux cent cinquante, « un EPUB n'est pas lu » sans nom de fichier oblige à
    // les rouvrir un par un.
    await expect(lireLeTexte(commeUnEpub())).rejects.toThrow(/un-livre\.epub/);
  });
});
