/** Ce que coûte la lecture du texte, par famille de document (lot E2, mesure préalable)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/cout-du-texte.ts <inventaire.json>
 *
 *  La chaîne actuelle ne lit pas de texte : elle repère des numéros d'éléments et les apparie à
 *  des pistes. Avant de bâtir le chemin du texte, il faut savoir ce qu'il coûtera, et cela
 *  dépend d'un seul fait mesurable : **combien de pages portent déjà une couche texte**. Une
 *  page qui en porte une se lit en millisecondes ; une page qui n'en porte pas demande l'OCR,
 *  qui coûte mille fois plus.
 *
 *  On mesure sur un échantillon de documents tirés de chaque famille, et l'on rend des données :
 *  un tableau tronqué relu de travers a déjà coûté cher trois fois dans ce lot.
 */

import { readFile, writeFile } from "node:fs/promises";
import { lireCoucheTexte } from "@lienotheque/lecteur-texte";

type Releve = { chemin: string; famille: string; pages: number; empreinte: string };

const [cheminInventaire, cheminFamilles, sortie = "/tmp/claude-501/e2/cout-du-texte.json"] = process.argv.slice(2);
if (cheminInventaire === undefined || cheminFamilles === undefined) {
  console.error("Attendu : <inventaire.json> <familles.json> [sortie.json]");
  process.exit(2);
}

const familles = (JSON.parse(await readFile(cheminFamilles, "utf8")) as { traits: Releve[] }).traits;
const inventaire = JSON.parse(await readFile(cheminInventaire, "utf8")) as { dossier: string; releves: { empreinte: string; chemin: string }[] };
const parEmpreinte = new Map(inventaire.releves.map((r) => [r.empreinte, r.chemin]));

/** Combien de documents par famille : assez pour une moyenne, pas assez pour y passer l'heure. */
const PAR_FAMILLE = 4;

const choisis = new Map<string, Releve[]>();
for (const trait of familles) {
  if (trait.pages === 0) continue;
  const deja = choisis.get(trait.famille) ?? [];
  if (deja.length < PAR_FAMILLE) choisis.set(trait.famille, [...deja, trait]);
}

const resultats: unknown[] = [];
for (const [famille, documents] of choisis) {
  for (const document of documents) {
    const chemin = parEmpreinte.get(document.empreinte);
    if (chemin === undefined) continue;
    const debut = performance.now();
    try {
      const lu = await lireCoucheTexte(chemin);
      const duree = performance.now() - debut;
      // Une page « servie » est une page dont la couche rend des mots : c'est elle qui n'aura
      // pas besoin d'OCR. Compter les pages du document au dénominateur, pas celles qui ont
      // parlé — sinon un document qui ne rend rien afficherait cent pour cent.
      const servies = lu.pages.filter((page) => page.mots.length >= 20).length;
      const mots = lu.pages.reduce((somme, page) => somme + page.mots.length, 0);
      resultats.push({
        famille,
        nom: chemin.split("/").at(-1),
        pages: document.pages,
        pagesServies: servies,
        partServie: document.pages === 0 ? 0 : servies / document.pages,
        mots,
        secondes: duree / 1000,
        secondesParPage: duree / 1000 / Math.max(document.pages, 1),
      });
      console.log(
        `  ${famille.slice(0, 30).padEnd(32)} ${(chemin.split("/").at(-1) ?? "").slice(0, 34).padEnd(36)} ` +
          `${document.pages.toString().padStart(5)} p.  ${servies.toString().padStart(5)} servies  ${(duree / 1000).toFixed(1)} s`,
      );
    } catch (cause) {
      const pourquoi = cause instanceof Error ? cause.message : String(cause);
      resultats.push({ famille, nom: chemin.split("/").at(-1), pages: document.pages, echec: pourquoi });
      console.log(`  ${famille.slice(0, 30).padEnd(32)} ${(chemin.split("/").at(-1) ?? "").slice(0, 34).padEnd(36)} échec : ${pourquoi.slice(0, 50)}`);
    }
  }
}

await writeFile(sortie, JSON.stringify({ parFamille: PAR_FAMILLE, resultats }, null, 2));
console.log(`\nRelevé écrit dans ${sortie}`);
