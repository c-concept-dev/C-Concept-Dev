/** À quoi les octets d'un PDF sont-ils passés ? Sonde de diagnostic, à usage ponctuel.
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/sonde-pdf.ts <fichier.pdf>
 *
 *  Elle existe parce qu'un relevé de poids a montré, sur un document, 127,6 Mo qui n'étaient ni
 *  images vues ni couche texte plausible. Plutôt que de supposer, on compte.
 *
 *  Ma première hypothèse était fausse et la sonde l'a dit : le document porte neuf marqueurs de
 *  fin de fichier — neuf enregistrements successifs —, mais **les objets périmés pèsent zéro**.
 *  La réponse était ailleurs : 348 objets image pour 158 pages, et **190 images qu'aucune page
 *  ne réclame**. Des pages retirées du document dont les octets n'ont jamais été repris. Elles
 *  ne s'affichent nulle part et personne ne les lira jamais.
 *
 *  D'où les deux derniers blocs : ce que pèsent les flux par nature, en séparant les objets
 *  vivants des périmés, puis ce que pèsent les images **qu'aucune page ne réclame**. Les deux
 *  questions se ressemblent et n'ont pas la même réponse.
 */
import { readFile } from "node:fs/promises";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";

const chemin = process.argv[2];
if (chemin === undefined) {
  console.error("Attendu : <fichier.pdf>");
  process.exit(2);
}

const donnees = await readFile(chemin);
const texte = donnees.toString("latin1");
const mo = (octets: number) => `${(octets / 1e6).toFixed(1)} Mo`;

/** Toutes les occurrences de « N G obj », dans l'ordre du fichier — pas une par numéro. */
type Occurrence = { readonly numero: number; readonly generation: number; readonly nature: string; readonly flux: number };
const occurrences: Occurrence[] = [];

const debutObjet = /(\d+)\s+(\d+)\s+obj\b/g;
let marque: RegExpExecArray | null;
while ((marque = debutObjet.exec(texte)) !== null) {
  const depuis = marque.index + marque[0].length;
  const finObjet = texte.indexOf("endobj", depuis);
  if (finObjet < 0) continue;
  const debutFlux = texte.indexOf("stream", depuis);
  const aUnFlux = debutFlux >= 0 && debutFlux < finObjet;
  const dictionnaire = texte.slice(depuis, aUnFlux ? debutFlux : finObjet);
  const longueur = aUnFlux ? Number(/\/Length\s+(\d+)/.exec(dictionnaire)?.[1] ?? 0) : 0;

  const nature = /\/Subtype\s*\/Image/.test(dictionnaire)
    ? "image"
    : /\/FontFile/.test(dictionnaire)
      ? "police"
      : /\/Subtype\s*\/Form/.test(dictionnaire)
        ? "formulaire"
        : /\/Type\s*\/(ObjStm|XRef)/.test(dictionnaire)
          ? "structure"
          : aUnFlux
            ? "flux divers"
            : "sans flux";

  occurrences.push({ numero: Number(marque[1]), generation: Number(marque[2]), nature, flux: longueur });
}

// La dernière occurrence d'un numéro est celle qui vaut ; les précédentes sont périmées.
const dernier = new Map<number, number>();
occurrences.forEach((occurrence, rang) => dernier.set(occurrence.numero, rang));

const vivants = new Map<string, { nombre: number; octets: number }>();
const perimes = new Map<string, { nombre: number; octets: number }>();
occurrences.forEach((occurrence, rang) => {
  const ou = dernier.get(occurrence.numero) === rang ? vivants : perimes;
  const compte = ou.get(occurrence.nature) ?? { nombre: 0, octets: 0 };
  ou.set(occurrence.nature, { nombre: compte.nombre + 1, octets: compte.octets + occurrence.flux });
});

const somme = (m: Map<string, { nombre: number; octets: number }>) =>
  [...m.values()].reduce((s, c) => s + c.octets, 0);

console.log(`\n${chemin.split("/").pop()} — ${mo(donnees.length)}`);
console.log(`${occurrences.length} occurrences d'objet pour ${dernier.size} numéros distincts`);
console.log(`${(texte.match(/%%EOF/g) ?? []).length} marqueurs de fin de fichier\n`);

console.log("| Nature | Objets vivants | Octets | Objets périmés | Octets |");
console.log("|---|---:|---:|---:|---:|");
for (const nature of new Set([...vivants.keys(), ...perimes.keys()])) {
  const v = vivants.get(nature) ?? { nombre: 0, octets: 0 };
  const p = perimes.get(nature) ?? { nombre: 0, octets: 0 };
  console.log(`| ${nature} | ${v.nombre} | ${mo(v.octets)} | ${p.nombre} | ${mo(p.octets)} |`);
}

const vifs = somme(vivants);
const morts = somme(perimes);
console.log(`\nFlux vivants  : ${mo(vifs)}`);
console.log(`Flux périmés  : ${mo(morts)}  ← rien ne les lit plus`);
console.log(`Hors flux     : ${mo(donnees.length - vifs - morts)} (dictionnaires, tables, mots-clés)`);

// Une image peut être bien vivante et n'être lue par personne : si aucune page ne la réclame,
// elle ne s'affiche jamais. C'est ce que compte ce dernier bloc.
const pages = pagesPdf(objetsPdf(donnees));
const reclamees = new Set(pages.flatMap((page) => page.images.map((image) => image.numero)));
const toutes = occurrences.filter((o) => o.nature === "image" && dernier.get(o.numero) === occurrences.indexOf(o));
const orphelines = toutes.filter((o) => !reclamees.has(o.numero));
console.log(`\n${pages.length} pages réclament ${reclamees.size} images sur ${toutes.length}`);
console.log(`Images qu'aucune page ne réclame : ${orphelines.length}, ${mo(orphelines.reduce((s, o) => s + o.flux, 0))}`);
