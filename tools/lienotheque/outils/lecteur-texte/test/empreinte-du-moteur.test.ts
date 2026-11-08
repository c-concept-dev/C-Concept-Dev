// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { empreinteDuMoteur } from "../src/ocr.js";

/** L'identité du moteur de lecture (OUT-05).
 *
 *  ## Pourquoi elle doit être exacte
 *
 *  Un mémo de reconnaissance sert une lecture déjà faite au lieu de la refaire. Il ne vaut que par
 *  sa clé : si deux moteurs différents, ou deux modèles de langue différents, donnent la même
 *  identité, le mémo servira la lecture de l'un pour l'autre — et le résultat sera faux **en
 *  silence**. C'est la consigne de Christophe du 8 novembre 2026 : « rien de ce qui change une
 *  lecture ne doit manquer à la clé ».
 *
 *  Ces contrôles n'ont pas besoin de Tesseract : ils éprouvent ce que l'identité distingue. */

function dossierDeModeles(fichiers: Readonly<Record<string, string>>): string {
  const dossier = mkdtempSync(join(tmpdir(), "lienotheque-modeles-"));
  for (const [nom, contenu] of Object.entries(fichiers)) writeFileSync(join(dossier, nom), contenu);
  return dossier;
}

describe("l'identité du moteur de lecture (OUT-05)", () => {
  it("distingue deux jeux de modèles différents", () => {
    const un = dossierDeModeles({ "fra.traineddata": "modèle A" });
    const autre = dossierDeModeles({ "fra.traineddata": "modèle B" });
    try {
      expect(empreinteDuMoteur({ tessdata: un })).not.toBe(empreinteDuMoteur({ tessdata: autre }));
    } finally {
      rmSync(un, { recursive: true, force: true });
      rmSync(autre, { recursive: true, force: true });
    }
  });

  it("change si le CONTENU d'un modèle change, à nom et à taille égaux", () => {
    // Le cas qui compte : une mise à jour qui remplace un modèle sans changer son nom. Une
    // identité fondée sur les noms seuls ne la verrait pas.
    const avant = dossierDeModeles({ "fra.traineddata": "AAAA" });
    const apres = dossierDeModeles({ "fra.traineddata": "BBBB" });
    try {
      expect(empreinteDuMoteur({ tessdata: avant })).not.toBe(empreinteDuMoteur({ tessdata: apres }));
    } finally {
      rmSync(avant, { recursive: true, force: true });
      rmSync(apres, { recursive: true, force: true });
    }
  });

  it("nomme chaque modèle, et ne dépend pas de l'ordre où le système les énumère", () => {
    const dossier = dossierDeModeles({ "fra.traineddata": "f", "eng.traineddata": "e" });
    try {
      const identite = empreinteDuMoteur({ tessdata: dossier });
      expect(identite).toContain("eng.traineddata:");
      expect(identite).toContain("fra.traineddata:");
      // Rendus triés : « eng » avant « fra », quoi qu'ait dit le système de fichiers.
      expect(identite.indexOf("eng.traineddata:")).toBeLessThan(identite.indexOf("fra.traineddata:"));
    } finally {
      rmSync(dossier, { recursive: true, force: true });
    }
  });

  it("dit qu'elle ne sait pas, plutôt que de ressembler à une autre", () => {
    const identite = empreinteDuMoteur({ binaire: "/aucun/tesseract/ici" });
    expect(identite).toContain("version inconnue");
    // Et une identité qui ne sait pas se nommer ne doit pas valoir celle d'un moteur connu avec
    // d'autres modèles : le dossier des modèles reste dans la clé.
    const avecModeles = dossierDeModeles({ "fra.traineddata": "x" });
    try {
      expect(empreinteDuMoteur({ binaire: "/aucun/tesseract/ici", tessdata: avecModeles })).not.toBe(identite);
    } finally {
      rmSync(avecModeles, { recursive: true, force: true });
    }
  });

  it("dit que les modèles du système ne sont pas empreints, au lieu de le taire", () => {
    expect(empreinteDuMoteur({ binaire: "/aucun/tesseract/ici" })).toContain("modèles du système");
  });

  it("refuse de se taire quand le dossier des modèles est illisible", () => {
    expect(empreinteDuMoteur({ binaire: "/aucun/tesseract/ici", tessdata: "/aucun/dossier/ici" })).toContain(
      "modèles illisibles",
    );
  });
});
