/** Repli réel et borné sur les seuls identifiants que la lecture locale de Funk Fusion n'a pas
 * retrouvés. Les pages candidates viennent des voisins déjà lus ; Vision confirme la présence
 * exacte ou s'abstient. Aucun résultat n'est écrit dans une bibliothèque. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DemandeValidationCibles, ReponseValidationCibles } from "@lienotheque/contrats";
import { coin, ouvrirCache } from "@lienotheque/cache";
import { jetonDacces } from "../src/index.js";

const PDF =
  process.env["LIENOTHEQUE_FUNK_FUSION_PDF"] ??
  "/Volumes/Macbook Pro/Basse/Basse/Funk Fusion Bass (Hal Leonard - Bass Builders) [Book+CD]/Funk Fusion Bass.pdf";
const BASE = process.env["LIENOTHEQUE_DIAGNOSTIC_URL"];
if (BASE === undefined) throw new Error("LIENOTHEQUE_DIAGNOSTIC_URL manque");
const jeton = jetonDacces();
if (jeton === undefined) throw new Error("Jeton Liénothèque absent du trousseau et de l'environnement");

const pages = (process.env["LIENOTHEQUE_PAGES_CIBLES"] ?? "65,67,69,70,72,73")
  .split(",")
  .map(Number)
  .filter(Number.isInteger);
const cibles = (process.env["LIENOTHEQUE_IDENTIFIANTS_CIBLES"] ?? "5.8,5.17,5.24,5.27,5.34,5.37,5.40,5.41")
  .split(",")
  .map((cible) => cible.trim())
  .filter(Boolean);
const temporaire = mkdtempSync(join(tmpdir(), "lienotheque-cibles-"));
const sha = (octets: Uint8Array): string => createHash("sha256").update(octets).digest("hex");
const document = sha(readFileSync(PDF));

try {
  const images = pages.map((numero) => {
    const prefixe = join(temporaire, `page-${numero}`);
    execFileSync("pdftoppm", ["-f", String(numero), "-l", String(numero), "-singlefile", "-r", "300", "-png", PDF, prefixe]);
    const image = readFileSync(`${prefixe}.png`);
    const dimensions = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", `${prefixe}.png`], { encoding: "utf8" });
    const largeur = Number(/pixelWidth:\s+(\d+)/.exec(dimensions)?.[1]);
    const hauteur = Number(/pixelHeight:\s+(\d+)/.exec(dimensions)?.[1]);
    return { numero, empreinte: sha(image), image: image.toString("base64"), typeMime: "image/png" as const, largeur, hauteur };
  });
  const demande = DemandeValidationCibles.parse({ document, pages: images, cibles });
  const vue = await fetch(`${BASE.replace(/\/$/, "")}/vision/structure/cibles`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${jeton}` },
    body: JSON.stringify(demande),
  });
  if (!vue.ok) throw new Error(`Validation ciblée refusée (${vue.status}) : ${await vue.text()}`);
  const reponse = ReponseValidationCibles.parse(await vue.json());
  const cache = coin(ouvrirCache(), "diagnostic-structurel");
  const sortie = join(cache, `funk-fusion-cibles-${new Date().toISOString().replaceAll(":", "-")}.json`);
  writeFileSync(sortie, JSON.stringify({ pdf: PDF, demande: { document, pages, cibles }, reponse }, null, 2));
  console.log(JSON.stringify({ sortie, resultats: reponse.resultats, jetons: reponse.jetons }, null, 2));
  if (reponse.resultats.some((resultat) => resultat.etat !== "trouve")) process.exitCode = 2;
} finally {
  rmSync(temporaire, { recursive: true, force: true });
}
