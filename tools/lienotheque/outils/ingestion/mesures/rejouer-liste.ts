/** Rejoue une liste bornée de documents par le moteur réellement empaqueté.
 *
 *   pnpm --filter @lienotheque/ingestion exec tsx mesures/rejouer-liste.ts \
 *     <bibliothèque> <manifest.json> <dossier de preuve>
 *
 * Le manifeste est une liste de `{ nom, source, motsAvant }`. La bibliothèque n'est jamais
 * écrite : cache, images et rapport vivent exclusivement dans le dossier de preuve.
 */

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Passage } from "@lienotheque/contrats";
import { demandeDeTraitement } from "../src/index.js";

type Entree = { readonly nom: string; readonly source: string; readonly motsAvant: number };
type LigneRapport = Entree & {
  readonly etat: "reussi" | "echec";
  readonly passages: number;
  readonly motsApres: number;
  readonly cause?: string;
  readonly secondes: number;
};

const [bibliotheque, manifeste, preuve] = process.argv.slice(2);
if (bibliotheque === undefined || manifeste === undefined || preuve === undefined) {
  console.error("Attendu : <bibliothèque> <manifest.json> <dossier de preuve>");
  process.exit(2);
}

const RACINE = join(import.meta.dirname, "../../..");
const NODE = join(RACINE, "apps/app/src-tauri/moteurs/bin/node");
const MOTEUR = join(RACINE, "apps/app/src-tauri/moteurs/chaine/moteur.js");
const CODECS = join(RACINE, "apps/app/src-tauri/moteurs/chaine/codecs");
for (const chemin of [NODE, MOTEUR, manifeste])
  if (!existsSync(chemin)) throw new Error(`Fichier requis absent : ${chemin}`);

const entrees = JSON.parse(readFileSync(manifeste, "utf8")) as Entree[];
mkdirSync(preuve, { recursive: true });
const rapport: LigneRapport[] = [];

const nombreDeMots = (texte: string): number => texte.match(/[\p{L}']{4,}/gu)?.length ?? 0;

async function rejouer(entree: Entree, rang: number): Promise<LigneRapport> {
  const dossier = join(preuve, String(rang + 1).padStart(2, "0"));
  const cache = join(dossier, "cache");
  const images = join(dossier, "images");
  mkdirSync(cache, { recursive: true });
  mkdirSync(images, { recursive: true });
  const demande = demandeDeTraitement(randomUUID(), randomUUID(), {
    document: entree.source,
    medias: join(bibliotheque, "sources"),
    inventaireMedias: [],
    recette: join(bibliotheque, "base/recette.json"),
    description: join(bibliotheque, "base/bibliotheque.json"),
    cache,
    images,
  });
  const depart = performance.now();

  return await new Promise((resoudre) => {
    const enfant = spawn(NODE, ["--max-old-space-size=2048", MOTEUR], {
      stdio: ["pipe", "pipe", "inherit"],
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/bin:/bin:${process.env["PATH"] ?? ""}`,
        TESSDATA_PREFIX: "/Applications/Liénothèque.app/Contents/Resources/moteurs/tessdata",
        LIENOTHEQUE_CODECS: CODECS,
        LIENOTHEQUE_PDFJS: join(RACINE, "apps/app/src-tauri/moteurs/chaine/pdfjs"),
      },
    });
    const lignes = createInterface({ input: enfant.stdout });
    let fini = false;
    const conclure = (ligne: LigneRapport): void => {
      if (fini) return;
      fini = true;
      lignes.close();
      enfant.stdin.end();
      enfant.kill();
      resoudre(ligne);
    };

    lignes.on("line", (brute) => {
      if (brute.trim() === "") return;
      const message = JSON.parse(brute) as {
        type: string;
        cause?: string;
        charge?: { passages?: Passage[] };
      };
      if (message.type === "salutation") enfant.stdin.write(`${JSON.stringify(demande)}\n`);
      if (message.type === "resultat") {
        const passages = message.charge?.passages ?? [];
        conclure({
          ...entree,
          etat: "reussi",
          passages: passages.length,
          motsApres: passages.reduce((total, passage) => total + nombreDeMots(passage.texte), 0),
          secondes: Math.round((performance.now() - depart) / 100) / 10,
        });
      }
      if (message.type === "echec")
        conclure({
          ...entree,
          etat: "echec",
          passages: 0,
          motsApres: 0,
          cause: message.cause ?? "cause absente",
          secondes: Math.round((performance.now() - depart) / 100) / 10,
        });
    });
    enfant.on("exit", (code) => {
      if (!fini)
        conclure({
          ...entree,
          etat: "echec",
          passages: 0,
          motsApres: 0,
          cause: `moteur arrêté sans résultat (code ${code ?? "?"})`,
          secondes: Math.round((performance.now() - depart) / 100) / 10,
        });
    });
  });
}

for (const [rang, entree] of entrees.entries()) {
  console.log(`[${rang + 1}/${entrees.length}] ${entree.nom}`);
  const ligne = await rejouer(entree, rang);
  rapport.push(ligne);
  writeFileSync(join(preuve, "rapport.json"), JSON.stringify(rapport, null, 2));
  console.log(`  ${ligne.etat} · ${ligne.motsAvant} → ${ligne.motsApres} mots · ${ligne.secondes} s`);
}

console.log(`Rapport : ${join(preuve, "rapport.json")}`);
