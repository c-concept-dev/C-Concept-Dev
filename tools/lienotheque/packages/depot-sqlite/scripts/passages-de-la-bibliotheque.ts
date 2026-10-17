/** Les passages d'une bibliothèque traitée : on les range, puis on les cherche (lot E2, étape 5)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx \
 *       mesures/passages-de-la-bibliotheque.ts <racine de la bibliothèque> [requête]...
 *
 *  Le chaînon qui manquait se vérifie ici de bout en bout : la chaîne a écrit des passages dans
 *  les versions, on les range dans une vraie base avec son index plein texte, et l'on cherche
 *  dedans. Rien n'est simulé — c'est l'adaptateur SQLite du projet et ses migrations.
 *
 *  Il rend des **données** autant qu'un tableau : trois fois dans ce lot, un relevé tronqué relu
 *  de travers a coûté une demi-journée. Le JSON part à côté, le tableau est pour les yeux.
 */

import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Passage, VersionDocument } from "@lienotheque/contrats";
import { ouvrirDepot } from "../src/index.js";

const [racine, ...requetes] = process.argv.slice(2);
if (racine === undefined) {
  console.error("Attendu : <racine de la bibliothèque> [requête]...");
  process.exit(2);
}

const base = join(racine, "base");
const LE = new Date().toISOString();
const id = (n: number): string => `0190f0a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

/** Les travaux disent quel document porte quelle version : c'est par eux qu'on retrouve le nom. */
const nomParVersion = new Map<string, string>();
for (const fichier of readdirSync(join(base, "travaux")).filter((n) => n.endsWith(".json"))) {
  const travail = JSON.parse(readFileSync(join(base, "travaux", fichier), "utf8")) as {
    version_cible?: string;
    sujet?: { nom?: string };
    etat?: string;
  };
  if (travail.version_cible !== undefined && travail.sujet?.nom !== undefined)
    nomParVersion.set(travail.version_cible, travail.sujet.nom);
}

const dossier = mkdtempSync(join(tmpdir(), "lienotheque-passages-"));
const depot = ouvrirDepot(dossier);

const FICHIER = "0".repeat(64);
await depot.enregistrerFichier({
  empreinte: FICHIER,
  taille: 1,
  typeMime: "application/pdf",
  nomOrigine: "source",
  ajouteLe: LE,
  appareilId: id(99),
});

type Rangee = { readonly nom: string; readonly version: string; readonly passages: number; readonly parOcr: number };
const rangees: Rangee[] = [];
let numero = 0;

for (const fichier of readdirSync(join(base, "versions")).filter((n) => n.endsWith(".json"))) {
  const versionId = basename(fichier, ".json");
  const charge = JSON.parse(readFileSync(join(base, "versions", fichier), "utf8")) as {
    passages?: unknown[];
    lecture?: { parLaCouche: number; parOcr: number; sansTexte: number };
  };
  const passages = (charge.passages ?? []).map((brut) => Passage.parse(brut));
  const nom = nomParVersion.get(versionId) ?? versionId;

  numero += 1;
  await depot.enregistrerDocument({ id: id(numero), bibliothequeId: id(0), titre: nom, alias: [], creeLe: LE });
  await depot.enregistrerVersion(
    VersionDocument.parse({
      id: versionId,
      documentId: id(numero),
      numero: 1,
      etat: "pret_a_lire",
      active: true,
      fichiers: [FICHIER],
      recette: { id: "essai", version: 1 },
      outils: [{ nom: "lecteur-texte", version: "1.0.0" }],
      manques: [],
      creeLe: LE,
    }),
  );
  await depot.enregistrerPassages(versionId, passages);
  rangees.push({ nom, version: versionId, passages: passages.length, parOcr: charge.lecture?.parOcr ?? 0 });
}

console.log(`\n── ${rangees.length} document(s) rangé(s) dans une base neuve ──\n`);
console.log(`  ${"document".padEnd(50)} ${"passages".padStart(9)} ${"dont OCR".padStart(9)}`);
console.log(`  ${"-".repeat(50)} ${"-".repeat(9)} ${"-".repeat(9)}`);
for (const r of [...rangees].sort((a, b) => b.passages - a.passages))
  console.log(`  ${r.nom.slice(0, 50).padEnd(50)} ${String(r.passages).padStart(9)} ${String(r.parOcr).padStart(9)}`);
console.log(`  ${"-".repeat(50)} ${"-".repeat(9)}`);
console.log(`  ${"ensemble".padEnd(50)} ${String(rangees.reduce((s, r) => s + r.passages, 0)).padStart(9)}`);

const trouvailles: unknown[] = [];
for (const requete of requetes) {
  const debut = performance.now();
  const trouves = await depot.chercherPassages(requete, { plafond: 3 });
  const duree = performance.now() - debut;
  console.log(`\n── « ${requete} » — ${trouves.length} passage(s), ${duree.toFixed(1)} ms ──`);
  for (const { versionId, passage } of trouves) {
    const nom = nomParVersion.get(versionId) ?? versionId;
    const ou = passage.pageImprimee === undefined ? `page ${passage.page} (numéro non lu)` : `page ${passage.pageImprimee}`;
    const comment = passage.source === "couche_texte" ? "lu dans le document" : "reconnu sur l'image";
    console.log(`\n  ${nom} — ${ou} — ${comment}`);
    console.log(`    « ${passage.texte.replace(/\s+/g, " ").slice(0, 300)}${passage.texte.length > 300 ? " …" : ""} »`);
  }
  trouvailles.push({ requete, duree, trouves });
}

const sortie = "/tmp/claude-501/e2/passages-essai.json";
writeFileSync(sortie, JSON.stringify({ rangees, trouvailles }, null, 2));
console.log(`\nRelevé écrit dans ${sortie}`);
depot.fermer();
