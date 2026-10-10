/** L'inventaire d'un corpus, avant de le toucher (lot E2, étape 1).
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/inventaire.ts <dossier> [sortie.json]
 *
 *  **Il ne fait que lire.** Aucun fichier n'est écrit, renommé ni déplacé dans le dossier
 *  inventorié ; le seul fichier produit est le relevé, là où on le lui demande.
 *
 *  Ce qu'il répond : combien de fichiers, combien de pages, lesquels sont des doublons exacts,
 *  et lesquels portent déjà une couche texte. Rien de plus — l'analyse fine coûte une heure par
 *  gigaoctet, et l'inventaire doit tenir en minutes pour qu'on le relance sans y penser.
 *
 *  **Lu en flux, jamais en entier.** Un document de 345 Mo chargé d'un bloc, converti en texte
 *  pour y chercher des motifs, c'est près d'un gigaoctet en mémoire pour compter des pages. Les
 *  plafonds du projet existent pour que personne ne fasse cela ; ce banc les respecte comme le
 *  reste. On lit par tranches, on compte au passage, et on garde un chevauchement pour les
 *  motifs qui tombent à cheval sur deux tranches.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { writeFile } from "node:fs/promises";

const dossier = process.argv[2];
const sortie = process.argv[3];
if (dossier === undefined) {
  console.error("Attendu : <dossier> [sortie.json]");
  process.exit(2);
}

/** Tous les formats de livre, et non les seuls PDF.
 *
 *  Un premier inventaire ne lisait que les PDF, et déclarait donc introuvables des ouvrages qui
 *  étaient là, au format d'à côté. Un inventaire qui ignore un format ne dit pas « il n'y en a
 *  pas » : il dit « je n'ai pas regardé », et les deux ne se ressemblent pas. */
const FORMATS = new Set([".pdf", ".epub", ".mobi", ".azw3", ".doc", ".docx", ".rtf", ".txt"]);

const TRANCHE = 4 * 1024 * 1024;
/** De quoi ne pas couper un motif en deux. Le plus long qu'on cherche fait une vingtaine
 *  d'octets ; sans ce chevauchement, une page tomberait de temps en temps dans la fente. */
const CHEVAUCHEMENT = 64;

const mo = (octets: number) => `${(octets / 1e6).toFixed(1)} Mo`;
const go = (octets: number) => `${(octets / 1e9).toFixed(2)} Go`;

type Releve = {
  readonly chemin: string;
  readonly octets: number;
  readonly empreinte: string;
  readonly pages: number;
  readonly polices: number;
  readonly images: number;
  readonly format: string;
};

/** Compte les occurrences d'un motif dans une tranche, chevauchement compris. */
function compter(texte: string, motif: RegExp): number {
  return (texte.match(motif) ?? []).length;
}

const PAGE = /\/Type\s*\/Page[^s]/g;
const POLICE = /\/Font\b/g;
const IMAGE = /\/Subtype\s*\/Image/g;

/** Un EPUB, un fichier Word : on ne compte pas leurs pages, et on ne prétend pas le faire.
 *  Ce que l'inventaire doit savoir d'eux, c'est qu'ils existent, ce qu'ils pèsent, et sous quel
 *  titre — le reste viendra du moteur, qui sait les ouvrir. */
const SANS_PAGES = new Set([".epub", ".mobi", ".azw3", ".doc", ".docx", ".rtf", ".txt"]);

async function relever(chemin: string): Promise<Releve> {
  const condense = createHash("sha256");
  let pages = 0;
  let polices = 0;
  let images = 0;
  let octets = 0;
  let queue = "";

  await new Promise<void>((resoudre, rejeter) => {
    const flux = createReadStream(chemin, { highWaterMark: TRANCHE });
    flux.on("data", (morceau) => {
      const tampon = morceau as Buffer;
      condense.update(tampon);
      octets += tampon.length;
      const texte = queue + tampon.toString("latin1");
      pages += compter(texte, PAGE);
      polices += compter(texte, POLICE);
      images += compter(texte, IMAGE);
      queue = texte.slice(-CHEVAUCHEMENT);
    });
    flux.on("end", () => resoudre());
    flux.on("error", rejeter);
  });

  const format = extname(chemin).toLowerCase();
  if (SANS_PAGES.has(format)) return { chemin, octets, empreinte: condense.digest("hex"), pages: 0, polices: 0, images: 0, format };
  return { chemin, octets, empreinte: condense.digest("hex"), pages, polices, images, format };
}

const fichiersDe = async (racine: string): Promise<string[]> => {
  const entrees = (await readdir(racine, { recursive: true })) as string[];
  const candidats = entrees.filter((nom) => FORMATS.has(extname(nom).toLowerCase())).map((nom) => join(racine, nom));
  // Un EPUB est un dossier zippé : macOS en déplie parfois le contenu, et le dossier porte
  // alors le même nom. On garde le fichier, jamais ce qu'il y a dedans.
  const dossiers = new Set(candidats.filter((c) => c.endsWith(".epub")).map((c) => `${c}/`));
  const fichiers: string[] = [];
  for (const candidat of candidats) {
    if ([...dossiers].some((d) => candidat.startsWith(d))) continue;
    const etat = await stat(candidat).catch(() => undefined);
    if (etat?.isFile() === true) fichiers.push(candidat);
  }
  return fichiers;
};

const chemins = (await fichiersDe(dossier)).sort();
console.error(`${chemins.length} fichiers à relever…`);

const releves: Releve[] = [];
let lus = 0;
for (const chemin of chemins) {
  releves.push(await relever(chemin));
  lus += 1;
  if (lus % 25 === 0) console.error(`  ${lus} / ${chemins.length}`);
}

// Les doublons se comptent par empreinte, jamais par nom : deux fichiers peuvent porter le même
// nom sans être les mêmes, et le même contenu sous deux noms différents.
const parEmpreinte = new Map<string, Releve[]>();
for (const releve of releves) parEmpreinte.set(releve.empreinte, [...(parEmpreinte.get(releve.empreinte) ?? []), releve]);

const distincts = [...parEmpreinte.values()].map((groupe) => groupe[0]!);
const enTrop = releves.length - distincts.length;
const octetsEnTrop = [...parEmpreinte.values()].reduce((somme, groupe) => somme + groupe[0]!.octets * (groupe.length - 1), 0);

const total = releves.reduce((somme, r) => somme + r.octets, 0);
const pagesDistinctes = distincts.reduce((somme, r) => somme + r.pages, 0);
const avecTexte = distincts.filter((r) => r.polices > 0).length;
const avecImages = distincts.filter((r) => r.images > 0).length;

console.log(`\n## Inventaire — ${new Date().toISOString().slice(0, 10)}\n`);
console.log("| | |");
console.log("|---|---:|");
console.log(`| Fichiers lus | ${releves.length} |`);
console.log(`| Poids total | ${go(total)} |`);
console.log(`| **Doublons exacts** | **${enTrop} fichiers, ${go(octetsEnTrop)}** |`);
console.log(`| Documents distincts | ${distincts.length} |`);
console.log(`| Poids distinct | ${go(total - octetsEnTrop)} |`);
console.log(`| **Pages à traiter** | **${pagesDistinctes}** |`);
console.log(`| Documents portant une couche texte | ${avecTexte} sur ${distincts.length} |`);
console.log(`| Documents portant des images | ${avecImages} sur ${distincts.length} |`);

const parFormat = new Map<string, number>();
for (const r of distincts) parFormat.set(r.format, (parFormat.get(r.format) ?? 0) + 1);
console.log(`\n### Par format\n`);
console.log("| Format | Documents |");
console.log("|---|---:|");
for (const [format, combien] of [...parFormat.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`| ${format} | ${combien} |`);

const gros = [...distincts].sort((a, b) => b.pages - a.pages).slice(0, 8);
console.log(`\n### Les huit plus longs\n`);
console.log("| Document | Pages | Poids | Couche texte |");
console.log("|---|---:|---:|---|");
for (const r of gros)
  console.log(`| ${relative(dossier, r.chemin).slice(0, 50)} | ${r.pages} | ${mo(r.octets)} | ${r.polices > 0 ? "oui" : "non"} |`);

const sansPage = distincts.filter((r) => r.pages === 0);
if (sansPage.length > 0) {
  console.log(`\n**${sansPage.length} document(s) dont on ne sait pas compter les pages** — à regarder avant de les traiter :\n`);
  for (const r of sansPage.slice(0, 10)) console.log(`- ${relative(dossier, r.chemin)} (${mo(r.octets)})`);
}

if (sortie !== undefined) {
  await writeFile(sortie, JSON.stringify({ releve_le: new Date().toISOString(), dossier, releves }, null, 2));
  console.error(`\nRelevé complet écrit dans ${sortie}`);
}
