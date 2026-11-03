/** Combien de documents impriment, en mots, à quelle pièce du vivier une page appartient ?
 *
 *  Rien de spécifique n'est écrit ici : les mots à chercher sont une **donnée**, passée en
 *  argument, et c'est le schéma de la bibliothèque qui les fournira le jour où ce chemin
 *  existera. La mesure ne fait que dire si le signal est là, et sur combien de familles.
 */
import { mkdtempSync, readdirSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

const MOTEURS = realpathSync(
  "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-main-fusion-wt/tools/lienotheque/apps/app/src-tauri/moteurs",
);
const racine = process.argv[2]!;
const mots = (process.argv[3] ?? "track,piste,plage").split(",");
// « le mot, puis un nombre » — avec au plus deux mots intercalés, parce que « CD TRACK 6 » et
// « Track no. 6 » doivent compter tous les deux.
const motif = new RegExp(`\\b(?:${mots.join("|")})\\b(?:\\s+\\S{1,4})??\\s+(\\d{1,3})\\b`, "giu");

// Une racine de familles, ou une famille seule : on le déduit de ce que le dossier contient.
const estUneFamille = readdirSync(racine).some((nom) => nom.toLowerCase().endsWith(".pdf"));
const titreDuDossier = racine.split("/").pop() ?? racine;
const familles = estUneFamille
  ? ["."]
  : readdirSync(racine)
      .filter((nom) => !nom.startsWith(".") && /^\d/u.test(nom))
      .sort();

if (!estUneFamille) console.log(`${familles.length} famille(s), mots cherchés : ${mots.join(", ")}\n`);
for (const famille of familles) {
  const dossier = join(racine, famille);
  const nomPdf = readdirSync(dossier).find((nom) => nom.toLowerCase().endsWith(".pdf"));
  if (nomPdf === undefined) {
    console.log(`${(famille === "." ? titreDuDossier : famille).slice(0, 40).padEnd(40)} (aucun document)`);
    continue;
  }
  const pistes = readdirSync(dossier).filter((nom) => nom.toLowerCase().endsWith(".mp3")).length;
  // La couche AVANT le rendu : lire la couche entre l'ouverture d'un rendu et sa première page
  // fait que cette page ne rend jamais la main — mesuré le 1er novembre 2026 sur neuf documents
  // réels sur dix-sept. Cet ordre contourne le piège sans toucher au produit.
  const couche = await lireCoucheTexte(join(dossier, nomPdf));
  const rendu = await ouvrirRenduPdf(join(dossier, nomPdf));
  const parRang = new Map(couche.pages.map((page) => [page.index, page]));
  const bac = mkdtempSync(join(tmpdir(), "lienotheque-renvois-"));
  const renvois: { page: number; valeur: number }[] = [];
  let ocerisees = 0;
  try {
    for (let rang = 1; rang <= rendu.nombreDePages; rang += 1) {
      const deLaCouche = parRang.get(rang);
      let page = deLaCouche !== undefined && coucheSuffisante(deLaCouche) ? deLaCouche : undefined;
      if (page === undefined) {
        page = ocrDUnePageGrise(enGris(await rendu.page(rang, 1800)), rang, bac, {
          binaire: join(MOTEURS, "bin/tesseract"),
          tessdata: join(MOTEURS, "tessdata"),
        });
        ocerisees += 1;
      }
      const texte = page.mots.map((mot) => mot.texte).join(" ");
      for (const trouve of texte.matchAll(motif)) renvois.push({ page: rang, valeur: Number(trouve[1]) });
    }
  } finally {
    rmSync(bac, { recursive: true, force: true });
    await rendu.fermer();
  }
  // Une page peut en porter plusieurs (un sommaire) : on distingue les pages à renvoi unique.
  const parPage = new Map<number, number[]>();
  for (const renvoi of renvois) parPage.set(renvoi.page, [...(parPage.get(renvoi.page) ?? []), renvoi.valeur]);
  const uniques = [...parPage].filter(([, valeurs]) => new Set(valeurs).size === 1).sort((un, autre) => un[0] - autre[0]);
  const suite = uniques.map(([page, valeurs]) => `p${page}→${valeurs[0]}`);
  const croissante = uniques.every(([, v], place) => place === 0 || v[0]! >= uniques[place - 1]![1][0]!);
  const dans = uniques.filter(([, v]) => v[0]! >= 1 && v[0]! <= pistes).length;
  console.log(
    `${(famille === "." ? titreDuDossier : famille).slice(0, 40).padEnd(40)} ${String(rendu.nombreDePages).padStart(3)}p ${String(pistes).padStart(3)} pistes | ` +
      `${String(renvois.length).padStart(3)} renvoi(s), ${String(uniques.length).padStart(2)} page(s) à renvoi unique, ` +
      `${dans} dans le vivier${uniques.length > 1 ? (croissante ? ", croissant" : ", NON croissant") : ""}`,
  );
  if (suite.length > 0) console.log(`${" ".repeat(42)}${suite.slice(0, 14).join("  ")}${suite.length > 14 ? " …" : ""}`);
}
