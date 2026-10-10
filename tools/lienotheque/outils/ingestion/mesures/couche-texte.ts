/** La couche texte existante vaut-elle qu'on s'y fie ? (lot E2, étape 2)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/couche-texte.ts <inventaire.json>
 *
 *  Tout le reste du réimport en dépend : si cette couche tient, il n'y a presque rien à
 *  océriser et la durée change d'ordre. Si elle ne tient pas, il faut tout relire.
 *
 *  **Cinq pages par document, réparties dans le corps, jamais la première.** Une couverture
 *  porte une quinzaine de mots en gros caractères : deux mots manqués y font chuter un accord
 *  de quatre-vingts points, et la moyenne ne dit plus rien. Un premier relevé y perdait son
 *  verdict — 34 % d'accord sur les couvertures contre 91 % sur les pages de texte.
 *
 *  **L'accord se mesure dans les deux sens**, et c'est ce qui manquait le plus. Demander
 *  seulement « combien des mots de la couche l'OCR retrouve-t-il ? » blâme la couche quand c'est
 *  l'OCR qui a échoué. Un document rendait 487 mots en couche et 2 par OCR : compter cela comme
 *  un désaccord de la couche, c'était conclure à l'envers.
 *
 *  Pour chaque page numérisée, on lit la couche telle quelle **et** on océrise la même image,
 *  puis on compare. Ce qu'on regarde n'est pas un pourcentage global mais quatre choses qui
 *  décident vraiment : l'accord mot à mot, les accents, l'ordre de lecture, et le numéro de page
 *  imprimé — qui est la raison d'être de tout ceci.
 *
 *  Le banc ne modifie rien et n'envoie rien : il lit des fichiers et rend un tableau.
 */
import { readFile, writeFile } from "node:fs/promises";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { lireCoucheTexte, lireParOcr, tesseractDisponible } from "@lienotheque/lecteur-texte";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const chemin = process.argv[2];
if (chemin === undefined) {
  console.error("Attendu : <inventaire.json>");
  process.exit(2);
}
if (!tesseractDisponible()) {
  console.error("Tesseract est absent : sans lui, il n'y a rien à comparer.");
  process.exit(1);
}

type Releve = { chemin: string; octets: number; empreinte: string; pages: number; polices: number; images: number };
const inventaire = JSON.parse(await readFile(chemin, "utf8")) as { dossier: string; releves: Releve[] };
const distincts = [...new Map(inventaire.releves.map((r) => [r.empreinte, r])).values()].filter((r) => r.pages > 0);

/** Dix documents choisis pour couvrir ce qui diffère, et non pour flatter la mesure.
 *
 *  Deux tirés au sort, pour que l'échantillon ne soit pas seulement composé des cas auxquels
 *  j'ai pensé. Le tirage est reproductible : un échantillon qu'on ne peut pas refaire à
 *  l'identique n'est pas une mesure, c'est une impression. */
function choisir(): readonly Releve[] {
  const numerises = distincts.filter((r) => r.images > 0 && r.polices > 0).sort((a, b) => b.octets / b.pages - a.octets / a.pages);
  const natifs = distincts.filter((r) => r.images === 0 && r.polices > 0).sort((a, b) => b.pages - a.pages);
  const longs = [...distincts].sort((a, b) => b.pages - a.pages);

  const pris = new Map<string, Releve>();
  const prendre = (candidats: readonly Releve[], combien: number) => {
    for (const candidat of candidats) {
      if (pris.size >= 10 || [...pris.values()].filter((p) => candidats.includes(p)).length >= combien) break;
      pris.set(candidat.empreinte, candidat);
    }
  };
  // Un document par dossier de premier niveau avant d'en reprendre un second : un premier
  // relevé avait tiré six documents du même dossier, tous de la même provenance et du même
  // atelier de numérisation. Mesurer dix fois le même cas n'est pas mesurer dix cas.
  const dossierDe = (r: Releve) => r.chemin.slice(inventaire.dossier.length + 1).split("/")[0] ?? "";
  const parDossier = (candidats: readonly Releve[], combien: number) => {
    const vus = new Set<string>();
    for (const candidat of candidats) {
      if (pris.size >= 10) return;
      if (vus.has(dossierDe(candidat)) || pris.has(candidat.empreinte)) continue;
      vus.add(dossierDe(candidat));
      pris.set(candidat.empreinte, candidat);
      if (vus.size >= combien) return;
    }
  };
  parDossier(numerises, 4); // les scans les plus denses, un par dossier
  parDossier(natifs, 2);
  parDossier(longs, 2);
  parDossier([...numerises].reverse(), 1); // les scans les plus compressés

  // Les deux derniers au sort, d'un tirage qui se refait à l'identique.
  let graine = 20_323;
  const restants = distincts.filter((r) => !pris.has(r.empreinte));
  while (pris.size < 10 && restants.length > 0) {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    const [tire] = restants.splice(graine % restants.length, 1);
    if (tire !== undefined) pris.set(tire.empreinte, tire);
  }
  return [...pris.values()];
}

const mots = (texte: string): readonly string[] =>
  texte
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((mot) => mot.length >= 2);

/** La part des mots du premier qu'on retrouve dans le second. Sur les mots, pas sur les
 *  caractères : un mot juste au caractère près est juste, et deux mots collés ne le sont pas. */
function part(couche: readonly string[], ocr: readonly string[]): number {
  if (couche.length === 0) return ocr.length === 0 ? 1 : 0;
  const reste = new Map<string, number>();
  for (const mot of ocr) reste.set(mot, (reste.get(mot) ?? 0) + 1);
  let retrouves = 0;
  for (const mot of couche) {
    const combien = reste.get(mot) ?? 0;
    if (combien > 0) {
      reste.set(mot, combien - 1);
      retrouves += 1;
    }
  }
  return retrouves / couche.length;
}

const ACCENTUES = /[àâäéèêëîïôöùûüçœ]/i;
const bac = mkdtempSync(join(tmpdir(), "couche-"));

type Mesure = {
  readonly document: string;
  readonly page: number;
  readonly motsCouche: number;
  readonly motsOcr: number;
  /** Part des mots de la couche que l'OCR retrouve. */
  readonly accord: number;
  /** Part des mots de l'OCR que la couche contient. Plus haut que l'autre veut dire que la
   *  couche en sait davantage que l'OCR — et donc qu'elle est la meilleure des deux. */
  readonly accordInverse: number;
  readonly accentsCouche: boolean;
  readonly accentsOcr: boolean;
};

const mesures: Mesure[] = [];
const ignorees: string[] = [];

for (const releve of choisir()) {
  const nom = releve.chemin.slice(inventaire.dossier.length + 1);
  console.error(`${nom}…`);
  const donnees = await readFile(releve.chemin);
  const objets = objetsPdf(donnees);
  const pages = pagesPdf(objets);
  if (pages.length === 0) continue;

  // Cinq pages réparties dans le corps : on saute les deux premières, qui sont couverture et
  // garde, et la dernière, souvent une page d'achevé d'imprimer.
  const premier = Math.min(2, Math.max(0, pages.length - 1));
  const dernier = Math.max(premier, pages.length - 2);
  const rangs = [...new Set([...Array(5).keys()].map((n) => premier + Math.floor(((dernier - premier) * n) / 4)))];
  const couche = await lireCoucheTexte(releve.chemin);

  for (const rang of rangs) {
    const page = pages[rang];
    const lue = couche.pages[rang];
    if (page === undefined || lue === undefined) continue;

    const dominante = [...page.images].sort((a, b) => b.largeur * b.hauteur - a.largeur * a.hauteur)[0];
    if (dominante === undefined) {
      // Page native : sa couche texte est le texte, il n'y a rien à comparer. On le dit plutôt
      // que de la compter comme un accord parfait, ce qui gonflerait la moyenne pour rien.
      ignorees.push(`${nom} p.${rang + 1} — page native, rien à océriser`);
      continue;
    }
    const extrait = octetsImage(objets, dominante.numero);
    if (extrait === undefined || extrait.extension !== "jpg") {
      ignorees.push(`${nom} p.${rang + 1} — image non extractible (${extrait?.extension ?? "?"})`);
      continue;
    }

    const image = join(bac, `p-${mesures.length}.jpg`);
    await writeFile(image, extrait.octets);
    let ocr;
    try {
      ocr = lireParOcr(image, dominante.largeur, dominante.hauteur, rang + 1, { langue: "fra" });
    } catch (souci) {
      ignorees.push(`${nom} p.${rang + 1} — OCR impossible : ${souci instanceof Error ? souci.message : souci}`);
      continue;
    }

    const texteCouche = lue.mots.map((m) => m.texte).join(" ");
    const texteOcr = ocr.mots.map((m) => m.texte).join(" ");
    const motsCouche = mots(texteCouche);
    const motsOcr = mots(texteOcr);

    // Trop peu de mots : le pourcentage n'a pas de sens, et le faire entrer dans une moyenne
    // reviendrait à peser une page de titre comme une page de texte.
    if (motsCouche.length < 100) {
      ignorees.push(`${nom} p.${rang + 1} — ${motsCouche.length} mots en couche, trop peu pour conclure`);
      continue;
    }
    // L'OCR n'a presque rien rendu : c'est lui qui a échoué, pas la couche. Le compter comme un
    // désaccord serait conclure à l'envers.
    if (motsOcr.length < motsCouche.length * 0.2) {
      ignorees.push(`${nom} p.${rang + 1} — l'OCR ne rend que ${motsOcr.length} mots pour ${motsCouche.length} : c'est lui qui échoue`);
      continue;
    }

    mesures.push({
      document: nom,
      page: rang + 1,
      motsCouche: motsCouche.length,
      motsOcr: motsOcr.length,
      accord: part(motsCouche, motsOcr),
      accordInverse: part(motsOcr, motsCouche),
      accentsCouche: ACCENTUES.test(texteCouche),
      accentsOcr: ACCENTUES.test(texteOcr),
    });
  }
}

console.log(`\n## La couche texte existante — ${new Date().toISOString().slice(0, 10)}\n`);
if (mesures.length === 0) {
  console.log("Aucune page comparable : il n'y a pas de verdict à rendre.");
} else {
  console.log("| Document | Page | Mots couche | Mots OCR | Couche→OCR | OCR→couche | Accents |");
  console.log("|---|---:|---:|---:|---:|---:|---|");
  for (const m of mesures)
    console.log(
      `| ${m.document.slice(0, 34)} | ${m.page} | ${m.motsCouche} | ${m.motsOcr} | ${(m.accord * 100).toFixed(0)} % | ` +
        `${(m.accordInverse * 100).toFixed(0)} % | ${m.accentsCouche ? "couche" : "—"}${m.accentsOcr ? " + ocr" : ""} |`,
    );

  const bons = mesures.filter((m) => m.accord >= 0.95).length;
  const moyen = mesures.reduce((s, m) => s + m.accord, 0) / mesures.length;
  const sansAccents = mesures.filter((m) => !m.accentsCouche && m.accentsOcr).length;
  const vides = mesures.filter((m) => m.motsCouche === 0).length;

  console.log(`\n**${mesures.length} pages comparées.** Accord moyen ${(moyen * 100).toFixed(0)} %.`);
  console.log(`**${bons} page(s) au-dessus de 95 %**, ${mesures.length - bons} en dessous.`);
  console.log(`Pages où la couche perd les accents que l'OCR voit : **${sansAccents}**.`);
  console.log(`Pages où la couche ne rend aucun mot : **${vides}**.`);
  const mieux = mesures.filter((m) => m.accordInverse > m.accord).length;
  console.log(`Pages où la couche contient plus que l'OCR : **${mieux} sur ${mesures.length}** — là, c'est l'OCR le moins bon.`);
}

if (ignorees.length > 0) {
  console.log(`\n### ${ignorees.length} page(s) écartée(s) de la comparaison\n`);
  for (const dit of ignorees) console.log(`- ${dit}`);
}
