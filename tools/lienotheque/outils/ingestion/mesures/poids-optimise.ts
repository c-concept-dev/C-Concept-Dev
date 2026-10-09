/** Ce qu'un corpus pèsera une fois optimisé — mesuré, puis extrapolé.
 *
 *  Chiffrer un hébergement demande un poids, et un poids demande une mesure. L'Inspecteur sait
 *  l'estimer depuis une table de rapports (OPT-06) ; cette table est prudente et date de
 *  l'échantillon F7. Ce banc-ci ne l'estime pas : il **encode vraiment** un échantillon de pages
 *  de chaque document, compare les octets, et n'extrapole qu'ensuite, au rapport mesuré.
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/poids-optimise.ts <dossier> [pages]
 *
 *  Il ne modifie aucun fichier et n'écrit rien : il lit des PDF et rend un tableau. Les documents
 *  qu'on lui donne restent hors du dépôt — ce sont des œuvres sous droits (règle 5).
 *
 *  Deux chiffres à ne pas confondre, et c'est tout l'objet de ce banc :
 *  le **texte seul** est ce qu'une base de recherche retient d'un ouvrage, quelques centaines de
 *  kilo-octets ; les **images de page** sont ce qu'il faut garder pour montrer la vraie page.
 *  Les comparer reviendrait à comparer une table des matières à un livre.
 */
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { aUneCoucheTexte, objetsPdf, octetsImage, pagesPdf, rasterBilevel } from "@lienotheque/formats";
import { decoderJpeg, encoderAvif } from "@lienotheque/images";
import { encoderGroupe4 } from "@lienotheque/optimiseur";

const dossier = process.argv[2];
const PAGES_ECHANTILLON = Number(process.argv[3] ?? 8);
if (dossier === undefined) {
  console.error("Attendu : <dossier de PDF> [pages par document]");
  process.exit(2);
}

const mo = (octets: number) => `${(octets / 1e6).toFixed(1)} Mo`;

/** Les index d'un échantillon réparti sur toute la longueur : un livre ne se juge pas sur son
 *  début, où les planches en couleur se concentrent. */
function repartir(total: number, combien: number): readonly number[] {
  if (total <= combien) return [...Array(total).keys()];
  return [...Array(combien).keys()].map((rang) => Math.floor((rang * total) / combien));
}

type Mesure = {
  readonly nom: string;
  readonly octets: number;
  readonly nature: string;
  readonly pages: number;
  readonly coucheTexte: boolean;
  readonly octetsImages: number;
  /** Ce que l'échantillon pesait, et ce qu'il pèse une fois encodé. */
  readonly avant: number;
  readonly apres: number;
  readonly pagesMesurees: number;
};

async function mesurer(chemin: string): Promise<Mesure> {
  const donnees = await readFile(chemin);
  const objets = objetsPdf(donnees);
  const pages = pagesPdf(objets);
  // La nature se classe comme l'Inspecteur la classe (OUT-01), sans l'importer : ce banc n'a pas
  // à élargir le graphe de dépendances d'un paquet pour une mesure. Une page qui porte à la fois
  // du texte et une image est **mixte** — c'est le cas d'un scan passé par un lecteur optique, et
  // les confondre avec les natives ferait dire « natif » à un livre entièrement photographié.
  const octetsImages = pages.reduce((somme, page) => somme + page.images.reduce((s, i) => s + i.octets, 0), 0);
  const parNature = { native: 0, mixte: 0, numerisee: 0, vide: 0 };
  for (const page of pages) {
    const image = page.images.length > 0;
    parNature[page.couchTexte && image ? "mixte" : page.couchTexte ? "native" : image ? "numerisee" : "vide"] += 1;
  }
  const dominante = (Object.entries(parNature) as [keyof typeof parNature, number][]).sort((a, b) => b[1] - a[1])[0]!;
  const nature = `${dominante[0]} ${Math.round((dominante[1] / Math.max(pages.length, 1)) * 100)} %`;

  let avant = 0;
  let apres = 0;
  let mesurees = 0;
  for (const index of repartir(pages.length, PAGES_ECHANTILLON)) {
    const page = pages[index];
    if (page === undefined) continue;

    // Noir et blanc : le groupe 4 contre ce que la source avait mis.
    const raster = rasterBilevel(objets, page);
    if (raster !== undefined && raster.bandes >= 4) {
      avant += raster.octetsOrigine;
      apres += encoderGroupe4(raster.donnees, raster.largeur, raster.hauteur).length;
      mesurees += 1;
      continue;
    }

    // Gris et couleur : AVIF, à résolution inchangée (OPT-04).
    const dominante = [...page.images].sort((a, b) => b.largeur * b.hauteur - a.largeur * a.hauteur)[0];
    if (dominante === undefined) continue;
    const extrait = octetsImage(objets, dominante.numero);
    if (extrait === undefined || extrait.extension !== "jpg") continue;
    try {
      const image = await decoderJpeg(extrait.octets);
      avant += extrait.octets.length;
      apres += (await encoderAvif(image)).length;
      mesurees += 1;
    } catch {
      // Une image que le décodeur refuse n'entre pas dans la moyenne : on mesure ce qu'on sait
      // encoder, et le nombre de pages mesurées dit sur quoi le rapport porte.
    }
  }

  return {
    nom: basename(chemin),
    octets: donnees.length,
    nature,
    pages: pages.length,
    coucheTexte: aUneCoucheTexte(objets),
    octetsImages,
    avant,
    apres,
    pagesMesurees: mesurees,
  };
}

const fichiers = (await readdir(dossier)).filter((nom) => extname(nom).toLowerCase() === ".pdf").sort();
const mesures: Mesure[] = [];
for (const nom of fichiers) {
  process.stderr.write(`${nom}…\n`);
  mesures.push(await mesurer(join(dossier, nom)));
}

console.log("\n| Document | Poids | Pages dominantes | Pages | Couche texte | Images | Hors images | Échantillon | Rapport |");
console.log("|---|---:|---|---:|---|---:|---:|---:|---:|");
for (const m of mesures) {
  const rapport = m.avant > 0 ? (m.apres / m.avant).toFixed(2) : "—";
  console.log(
    `| ${m.nom} | ${mo(m.octets)} | ${m.nature} | ${m.pages} | ${m.coucheTexte ? "oui" : "non"} | ` +
      `${mo(m.octetsImages)} | ${mo(m.octets - m.octetsImages)} | ${m.pagesMesurees} p. | ×${rapport} |`,
  );
}

const avant = mesures.reduce((s, m) => s + m.avant, 0);
const apres = mesures.reduce((s, m) => s + m.apres, 0);
const octets = mesures.reduce((s, m) => s + m.octets, 0);
const images = mesures.reduce((s, m) => s + m.octetsImages, 0);
const rapport = avant > 0 ? apres / avant : 1;

console.log(`\nÉchantillon encodé : ${mo(avant)} → ${mo(apres)}, soit ×${rapport.toFixed(3)}`);
console.log(`Documents lus : ${mo(octets)}, dont ${mo(images)} d'images de page (${((images / octets) * 100).toFixed(0)} %)`);
console.log(`Poids optimisé de ces documents, au rapport mesuré : ${mo(octets - images + images * rapport)}`);
