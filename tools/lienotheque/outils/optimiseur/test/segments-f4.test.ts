// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { decouper, pcmDeWav } from "../src/index.js";

/** Justesse du découpage aux silences, mesurée sur les médias de F4 (A4).
 *
 *  Chaque piste du disque porte un ou plusieurs éléments ; la référence du prototype dit
 *  lesquels. Un découpage juste rend autant de segments que la piste porte d'éléments.
 *
 *  Fixtures sous droits, et décodage par l'outil du système : ces contrôles se sautent proprement
 *  ailleurs. Le décodeur n'appartient pas au produit — l'application de bureau tirera son PCM de
 *  son hôte, comme le dépôt tire sa base du sien ; c'est pourquoi `decouper` ne prend que du PCM
 *  et ne sait rien des formats. */

const RACINE = join(import.meta.dirname, "../../..");
const MEDIAS = join(RACINE, "fixtures/fichiers/F4/Bass Bible Vol 1 - World History Of Styles & Techniques [Disc 1]");
const REFERENCE = join(RACINE, "docs/prototypes/Westwood_Vol1_CD1_pistes.csv");

const dossier = mkdtempSync(join(tmpdir(), "lienotheque-segments-"));
afterAll(() => rmSync(dossier, { recursive: true, force: true }));

/** Le décodeur du système a besoin de services que certains environnements lui refusent. On ne
 *  se contente donc pas de vérifier qu'il existe : on lui demande de décoder, une fois. */
function decodeurUtilisable(): boolean {
  if (!existsSync(MEDIAS)) return false;
  const premier = readdirSync(MEDIAS).filter((nom) => nom.toLowerCase().endsWith(".mp3")).sort()[0];
  if (premier === undefined) return false;
  const essai = join(dossier, "essai.wav");
  try {
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16", realpathSync(join(MEDIAS, premier)), essai], { stdio: "ignore" });
    return existsSync(essai) && readFileSync(essai).length > 1024;
  } catch {
    return false;
  } finally {
    rmSync(essai, { force: true });
  }
}

const siMedias = existsSync(MEDIAS) && existsSync(REFERENCE) && decodeurUtilisable() ? it : it.skip;

/** PCM d'un MP3, par l'outil du système. Les canaux sont mélangés à la lecture du WAV : la
 *  découpe aux silences ne regarde que l'enveloppe. */
function pcm(chemin: string): { echantillons: Float32Array; frequence: number } {
  const wav = join(dossier, "piste.wav");
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16", realpathSync(chemin), wav], { stdio: "ignore" });
  const lu = pcmDeWav(readFileSync(wav));
  rmSync(wav, { force: true });
  return lu;
}

/** Éléments attendus par piste, relevés par le prototype. */
function attendus(): Map<string, number> {
  const lignes = readFileSync(REFERENCE, "utf8").trim().split("\n").slice(1);
  const par = new Map<string, number>();
  for (const ligne of lignes) {
    const cases = ligne.split(",");
    const nom = cases[1];
    const elements = cases[3];
    if (nom !== undefined && elements !== undefined && elements.trim() !== "") par.set(nom, elements.trim().split(/\s+/).length);
  }
  return par;
}

describe("découpe des médias de F4 aux silences (A4)", () => {
  siMedias(
    "rend autant de segments que la piste porte d'éléments, sur les trois quarts d'un échantillon",
    () => {
      const parNom = attendus();
      const pistes = readdirSync(MEDIAS)
        .filter((nom) => nom.toLowerCase().endsWith(".mp3") && parNom.has(nom))
        .sort((a, b) => a.localeCompare(b, "fr"))
        // Un média sur six : assez pour mesurer, assez peu pour que le contrôle reste court.
        .filter((_, rang) => rang % 6 === 0);
      expect(pistes.length, "l'échantillon n'est pas vide").toBeGreaterThan(8);

      let justes = 0;
      const ecarts: string[] = [];
      for (const nom of pistes) {
        const attendu = parNom.get(nom)!;
        const { echantillons, frequence } = pcm(join(MEDIAS, nom));
        const decoupe = decouper(echantillons, frequence);
        if (decoupe.segments.length === attendu) justes += 1;
        else ecarts.push(`${nom.slice(0, 6)} attendu ${attendu}, obtenu ${decoupe.segments.length}`);
        expect(decoupe.dureeS, `${nom} a une durée`).toBeGreaterThan(5);
      }

      const part = justes / pistes.length;
      console.log(`[A4] segments justes : ${justes}/${pistes.length} (${Math.round(part * 100)} %)`);
      if (ecarts.length > 0) console.log(`[A4] écarts : ${ecarts.join(" | ")}`);
      expect(part, `${justes}/${pistes.length} pistes découpées au bon nombre de segments`).toBeGreaterThanOrEqual(0.75);
    },
    1_800_000,
  );

  siMedias(
    "ne pose jamais un segment hors du média",
    () => {
      const nom = readdirSync(MEDIAS).filter((f) => f.toLowerCase().endsWith(".mp3")).sort()[0]!;
      const { echantillons, frequence } = pcm(join(MEDIAS, nom));
      const decoupe = decouper(echantillons, frequence);
      for (const segment of decoupe.segments) {
        expect(segment.debut).toBeGreaterThanOrEqual(0);
        expect(segment.fin).toBeLessThanOrEqual(decoupe.dureeS);
      }
    },
    600_000,
  );
});
