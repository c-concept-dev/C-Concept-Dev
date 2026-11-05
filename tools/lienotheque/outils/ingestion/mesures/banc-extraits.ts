/** Le banc d'extraits : un petit bout de chaque méthode, choisi pour piéger la chaîne.
 *
 *  **Ce que c'est.** Les fixtures F1 à F8 sont des œuvres entières : précieuses, lentes, et trop
 *  peu nombreuses pour couvrir les familles. Le banc, lui, prend **un petit bout de chaque
 *  méthode** — assez pour que la chaîne rencontre ce qui la met en difficulté, assez peu pour
 *  qu'on puisse les rejouer toutes.
 *
 *  **Les archives ne sont jamais touchées.** Elles sont lues en flux, jamais modifiées, jamais
 *  déplacées, et la destination est vérifiée avant d'écrire : hors de toute bibliothèque.
 *
 *  **Comment les pages sont choisies, et pourquoi sans nommer aucun domaine.** Cinq rôles, cinq
 *  mesures faites sur le document lui-même :
 *
 *  | rôle | ce qu'on mesure |
 *  |---|---|
 *  | la page qui liste les pistes | la plus forte densité de **nombres** par rapport aux mots |
 *  | deux pages de contenu | les plus denses en texte, prises au milieu |
 *  | une page presque vide | la moins dense en texte |
 *  | la page de fin | la dernière |
 *  | une page difficile | la plus basse confiance de lecture |
 *
 *  Aucun de ces cinq rôles ne nomme un domaine : « la page qui liste les pistes » se trouve par
 *  des chiffres, pas par le mot « sommaire » ni par un titre.
 *
 *  **Les médias.** Ceux dont le numéro apparaît dans la page qui liste les pistes, plus
 *  **quelques-uns en trop** — un banc où tout média a sa place ne mesure pas ce qui arrive quand
 *  il y en a d'autres.
 *
 *  Usage : banc-extraits.ts <archive.zip> <dossier-du-banc> [--pages N]
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";
import { PDFDocument } from "../../../node_modules/.pnpm/pdf-lib@1.17.1/node_modules/pdf-lib/es/index.js";

const MOTEURS = join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs");
const LARGEUR_DE_RENDU = 1800;
/** Combien de médias en trop : assez pour que le choix ne soit pas trivial, pas assez pour noyer. */
const MEDIAS_EN_TROP = 3;

const arguments_ = process.argv.slice(2);
const [archive, dossierBanc] = arguments_.filter((un) => !un.startsWith("--"));
const combienDePages = Number(arguments_.find((u) => u.startsWith("--pages="))?.split("=")[1] ?? 8);
if (archive === undefined || dossierBanc === undefined) {
  console.error("usage : banc-extraits.ts <archive.zip> <dossier-du-banc> [--pages=N]");
  process.exit(2);
}

// La destination est vérifiée AVANT d'écrire : une bibliothèque porte `base/actives.json`, et on
// n'écrit jamais dedans. Le contrôle est sur le chemin, pas sur ma vigilance.
for (let d = dossierBanc; d !== "/" && d !== "."; d = join(d, "..")) {
  if (existsSync(join(d, "base", "actives.json"))) {
    console.error(`Refus : « ${d} » est une bibliothèque. Le banc n'écrit jamais dans une bibliothèque.`);
    process.exit(2);
  }
}

const nom = basename(archive, ".zip");
const sortie = join(dossierBanc, nom);
mkdirSync(sortie, { recursive: true });
const bac = mkdtempSync(join(tmpdir(), "lienotheque-banc-"));

/** Liste le contenu d'une archive sans l'extraire. */
const listerArchive = (): readonly string[] =>
  execFileSync("unzip", ["-Z1", archive], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((ligne) => ligne.trim() !== "" && !ligne.endsWith("/"));

/** Extrait UN fichier de l'archive vers un dossier, sans toucher à l'archive.
 *
 *  **Le nom du membre est échappé.** `unzip` traite son argument comme un MOTIF, pas comme un
 *  nom : un titre entre crochets — et il y en a cent dans ce corpus — devient une classe de
 *  caractères, et le fichier « n'est pas trouvé » alors qu'il est là. Mesuré le 5 novembre 2026,
 *  sur la première archive essayée. */
const extraireUn = (interne: string, vers: string): string => {
  const motif = interne.replace(/[[\]*?\\]/g, (c) => `\\${c}`);
  execFileSync("unzip", ["-o", "-j", archive, motif, "-d", vers], { stdio: ["ignore", "ignore", "pipe"] });
  return join(vers, basename(interne));
};

const contenu = listerArchive();
const pdfInterne = contenu.find((n) => n.toLowerCase().endsWith(".pdf"));
const audioInternes = contenu.filter((n) => /\.(mp3|m4a|wav|flac)$/i.test(n)).sort();
if (pdfInterne === undefined) {
  console.error(`« ${nom} » ne porte aucun PDF.`);
  process.exit(2);
}
console.log(`${nom} · ${contenu.length} fichiers · 1 PDF · ${audioInternes.length} médias`);

const pdf = extraireUn(pdfInterne, bac);
// **La couche d'abord, le rendu ensuite.** L'ordre inverse laissait le premier `rendu.page()`
// sans réponse et le programme s'arrêtait sur une promesse pendante — mesuré le 5 novembre 2026,
// et le même PDF se rendait parfaitement quand le rendu était ouvert seul.
const couche = await lireCoucheTexte(pdf);
const parRang = new Map(couche.pages.map((p) => [p.index, p]));
const rendu = await ouvrirRenduPdf(pdf);

/** Ce qu'une page porte, mesuré. La couche quand elle suffit, l'OCR sinon. */
type Releve = { rang: number; mots: number; nombres: number; confiance: number };
const releves: Releve[] = [];
for (let rang = 1; rang <= rendu.nombreDePages; rang += 1) {
  const deLaCouche = parRang.get(rang);
  const page =
    deLaCouche !== undefined && coucheSuffisante(deLaCouche)
      ? deLaCouche
      : ocrDUnePageGrise(enGris(await rendu.page(rang, LARGEUR_DE_RENDU)), rang, bac, {
          binaire: join(MOTEURS, "bin/tesseract"),
          tessdata: join(MOTEURS, "tessdata"),
          // Un délai large, et surtout : il existe (A2). Sans lui, un document piégé bloquerait
          // le banc entier sans rien dire.
          delaiMs: 60_000,
        });
  const mots = page.mots.length;
  const nombres = page.mots.filter((m) => /^\d{1,4}$/.test(m.texte)).length;
  const confiances = page.mots.map((m) => m.confiance).filter((c): c is number => c !== undefined);
  const mediane = confiances.length === 0 ? 1 : [...confiances].sort((a, b) => a - b)[Math.floor(confiances.length / 2)]!;
  releves.push({ rang, mots, nombres, confiance: mediane });
}
await rendu.fermer();

const parts = (r: Releve) => (r.mots === 0 ? 0 : r.nombres / r.mots);
const avecTexte = releves.filter((r) => r.mots > 0);
const listePistes = [...avecTexte].sort((a, b) => parts(b) - parts(a))[0];
const denses = [...avecTexte].sort((a, b) => b.mots - a.mots).filter((r) => r.rang !== listePistes?.rang);
const presqueVide = [...releves].sort((a, b) => a.mots - b.mots)[0];
const difficile = [...avecTexte].sort((a, b) => a.confiance - b.confiance)[0];
const fin = releves[releves.length - 1];

const choisies = new Map<number, string>();
const retenir = (r: Releve | undefined, role: string) => {
  if (r !== undefined && !choisies.has(r.rang)) choisies.set(r.rang, role);
};
retenir(listePistes, "liste des pistes (plus forte densité de nombres)");
for (const r of denses.slice(0, 2)) retenir(r, "page de contenu (dense en texte)");
retenir(presqueVide, "page presque vide");
retenir(difficile, "page difficile (plus basse confiance)");
retenir(fin, "page de fin");
for (const r of denses.slice(2)) {
  if (choisies.size >= combienDePages) break;
  retenir(r, "page de contenu (complément)");
}

const rangs = [...choisies.keys()].sort((a, b) => a - b);
const source = await PDFDocument.load(readFileSync(pdf), { ignoreEncryption: true });
const extrait = await PDFDocument.create();
for (const page of await extrait.copyPages(source, rangs.map((r) => r - 1))) extrait.addPage(page);
writeFileSync(join(sortie, `${nom}.pdf`), await extrait.save({ useObjectStreams: false }));

/** Les nombres que porte la page qui liste les pistes : les médias qu'on garde.
 *
 *  Relue ici seulement si sa couche ne suffit pas — et si la relecture ne donne rien, on prend
 *  les premiers médias plutôt que de ne rien prendre : un banc sans média ne mesure rien. */
const numerosDeLaListe = new Set<number>();
if (listePistes !== undefined) {
  const deLaCouche = parRang.get(listePistes.rang);
  const renduDeNouveau = await ouvrirRenduPdf(pdf);
  const page =
    deLaCouche !== undefined && coucheSuffisante(deLaCouche)
      ? deLaCouche
      : ocrDUnePageGrise(enGris(await renduDeNouveau.page(listePistes.rang, LARGEUR_DE_RENDU)), listePistes.rang, bac, {
          binaire: join(MOTEURS, "bin/tesseract"),
          tessdata: join(MOTEURS, "tessdata"),
          delaiMs: 60_000,
        });
  await renduDeNouveau.fermer();
  for (const mot of page.mots) {
    const n = Number(mot.texte);
    if (Number.isInteger(n) && n > 0 && n <= audioInternes.length) numerosDeLaListe.add(n);
  }
}
const parNumero = (n: string): number | undefined => {
  const m = basename(n).match(/\d+/);
  return m ? Number(m[0]) : undefined;
};
const voulus = audioInternes.filter((n) => {
  const num = parNumero(n);
  return num !== undefined && numerosDeLaListe.has(num);
});
// **Autant de médias que de pages retenues, et répartis sur tout le vivier.**
//
// La première version ne gardait que les médias désignés par les nombres lus sur la page qu'elle
// avait prise pour la liste des pistes. Quand cette page n'en est pas une — ou quand ses nombres
// sont mal lus, ce qui est précisément le défaut qu'A2 traite — le compte tombait à deux, et un
// extrait à deux médias n'éprouve pas grand-chose. Mesuré le 5 novembre 2026 sur six méthodes :
// 2, 2, 6, 3, 6 et 6 médias retenus sur des viviers de 11 à 99.
//
// La règle ne pose aucun nombre : on en garde **autant que de pages retenues** — un compte que le
// document a lui-même fourni — en prenant d'abord ceux que la liste désigne, puis un échantillon
// RÉGULIER du reste, pour couvrir toute l'étendue du vivier plutôt que son début.
const combienDeMedias = Math.min(audioInternes.length, choisies.size);
const retenus: string[] = [...voulus].slice(0, combienDeMedias);
if (retenus.length < combienDeMedias && audioInternes.length > 0) {
  const reste = audioInternes.filter((n) => !retenus.includes(n));
  const pas = Math.max(1, Math.floor(reste.length / Math.max(1, combienDeMedias - retenus.length)));
  for (let i = 0; i < reste.length && retenus.length < combienDeMedias; i += pas) retenus.push(reste[i]!);
}
const enTrop = audioInternes.filter((n) => !retenus.includes(n)).slice(-MEDIAS_EN_TROP);
const dossierMedias = join(sortie, "medias");
mkdirSync(dossierMedias, { recursive: true });
for (const interne of [...retenus, ...enTrop]) extraireUn(interne, dossierMedias);

writeFileSync(
  join(sortie, "choix.json"),
  `${JSON.stringify(
    {
      archive: basename(archive),
      pdf_interne: pdfInterne,
      pages_du_document: rendu.nombreDePages,
      pages_retenues: rangs.map((r) => ({ rang: r, role: choisies.get(r) })),
      medias_du_document: audioInternes.length,
      medias_retenus: retenus.map((n) => basename(n)),
      medias_en_trop: enTrop.map((n) => basename(n)),
      choisi_le: new Date().toISOString(),
    },
    null,
    1,
  )}\n`,
);
rmSync(bac, { recursive: true, force: true });
console.log(`  pages retenues : ${rangs.join(", ")} sur ${rendu.nombreDePages}`);
for (const r of rangs) console.log(`    ${r} — ${choisies.get(r)}`);
console.log(`  médias : ${retenus.length} retenus + ${enTrop.length} en trop, sur ${audioInternes.length}`);
console.log(`  écrit dans ${sortie}`);
