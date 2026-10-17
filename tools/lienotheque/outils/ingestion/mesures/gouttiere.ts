/** Cette feuille porte-t-elle deux pages ? (lot E2, étape 4)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/gouttiere.ts <inventaire.json>
 *
 *  La question décide d'un paramètre de recette — `double_page` — pour une famille de
 *  quatre-vingt-dix-neuf documents et dix mille pages. S'y tromper ne se verrait pas au
 *  traitement : chaque ancre pointerait une feuille au lieu d'une page, et le Lecteur
 *  afficherait deux pages là où l'on en cherche une. Le défaut n'apparaîtrait qu'à la lecture,
 *  des semaines plus tard.
 *
 *  **Un premier signal, les numéros imprimés, s'est révélé trop fragile.** Il cherche deux
 *  nombres de part et d'autre du bas de feuille — « 306 » à gauche, « 307 » à droite. Quand il
 *  les trouve, il a raison. Mais il ne les trouve que sur vingt-huit documents sur
 *  quatre-vingt-dix-neuf qui ont pourtant la même allure, parce qu'il suffit qu'un numéro soit
 *  mal lu, absent, ou placé ailleurs qu'en pied.
 *
 *  **La gouttière, elle, ne peut pas manquer.** Deux pages côte à côte laissent entre elles une
 *  bande verticale où aucun mot ne tombe — la reliure. Une page unique, même couchée, remplit sa
 *  largeur. On compte donc les mots par tranche verticale et l'on regarde s'il existe un creux
 *  franc au milieu. C'est un fait de géométrie, lisible sur n'importe quelle page qui porte du
 *  texte, et il ne dépend d'aucun chiffre.
 */
import { readFile, writeFile } from "node:fs/promises";
import { lireCoucheTexte } from "@lienotheque/lecteur-texte";

const chemin = process.argv[2];
const sortie = process.argv[3];
if (chemin === undefined) {
  console.error("Attendu : <inventaire.json>");
  process.exit(2);
}

type Releve = { chemin: string; octets: number; empreinte: string; pages: number; format: string };
const inventaire = JSON.parse(await readFile(chemin, "utf8")) as { dossier: string; releves: Releve[] };

/** Combien de tranches verticales. Vingt donne une tranche de cinq pour cent de la largeur :
 *  assez fin pour voir une reliure, assez large pour qu'un mot isolé ne creuse pas un trou. */
const TRANCHES = 40;
/** Où chercher le sillon : le cinquième central. Une reliure n'est jamais exactement au milieu
 *  — les marges de gauche et de droite diffèrent — mais elle n'en est jamais loin.
 *
 *  Vingt tranches ne suffisaient pas : une bande centrale de quinze pour cent noyait une reliure
 *  de quatre dans le texte qui l'entoure, et quarante et un documents tombaient en zone grise.
 *  On cherche un sillon, pas une clairière. */
const MILIEU = [...Array(8).keys()].map((n) => Math.floor(TRANCHES * 0.4) + n);

/** Le creux du milieu, rapporté à ce que portent les côtés.
 *
 *  Zéro quand le milieu est aussi rempli que les côtés — une page unique. Un quand il est vide —
 *  deux pages. Entre les deux, une page unique dont la mise en page laisse un blanc central,
 *  ce qui arrive et qu'il faut donc savoir ne pas trancher. */
export function creuxCentral(positions: readonly number[]): number {
  if (positions.length < 40) return 0;
  const tranches = new Array<number>(TRANCHES).fill(0);
  for (const x of positions) tranches[Math.min(TRANCHES - 1, Math.max(0, Math.floor(x * TRANCHES)))]! += 1;

  // Le creux **le plus profond** du cinquième central, et non la moyenne de la bande : une
  // reliure est un sillon étroit, et une moyenne le comble avec le texte de ses deux bords.
  const auMilieu = Math.min(...MILIEU.map((rang) => tranches[rang] ?? 0));
  const cotes = tranches.filter((_, rang) => !MILIEU.includes(rang) && rang > 2 && rang < TRANCHES - 3);
  const triees = [...cotes].sort((a, b) => a - b);
  const auxCotes = triees[Math.floor(triees.length / 2)] ?? 0;
  if (auxCotes === 0) return 0;
  return Math.max(0, 1 - auMilieu / auxCotes);
}

/** Au-dessus, la feuille porte deux pages ; en dessous, une seule. Entre les deux, on ne tranche
 *  pas : le document part à l'écran Vérifier, et un œil règle la question en deux secondes. */
const SEUIL_DOUBLE = 0.75;
const SEUIL_SIMPLE = 0.45;

type Verdict = "deux pages" | "une page" | "à regarder";
const resultats: { nom: string; pages: number; creux: number; verdict: Verdict }[] = [];

const distincts = [...new Map(inventaire.releves.map((r) => [r.empreinte, r])).values()].filter((r) => r.format === ".pdf" && r.pages > 0);

for (const [rang, releve] of distincts.entries()) {
  try {
    const couche = await lireCoucheTexte(releve.chemin);
    const total = couche.pages.length;
    // Douze pages du corps : une reliure se voit sur toutes, mais une page de titre ou une
    // planche pleine page n'en a pas, et il ne faut pas qu'elles décident à elles seules.
    const rangs = [...Array(12).keys()].map((n) => Math.floor(2 + ((total - 4) * n) / 11)).filter((r) => r > 0 && r < total);
    const creuxParPage = rangs
      .map((r) => couche.pages[r])
      .filter((p) => p !== undefined && p.largeur > p.hauteur && p.mots.length >= 40)
      .map((p) => creuxCentral(p.mots.map((m) => m.x / p.largeur)));
    if (creuxParPage.length < 3) continue;

    const tries = [...creuxParPage].sort((a, b) => a - b);
    const creux = tries[Math.floor(tries.length / 2)]!;
    const verdict: Verdict = creux >= SEUIL_DOUBLE ? "deux pages" : creux <= SEUIL_SIMPLE ? "une page" : "à regarder";
    resultats.push({ nom: releve.chemin.slice(inventaire.dossier.length + 1), pages: releve.pages, creux, verdict });
  } catch {
    // Un document qu'on ne sait pas ouvrir est déjà compté ailleurs : il n'a rien à faire ici.
  }
  if ((rang + 1) % 25 === 0) console.error(`  ${rang + 1} / ${distincts.length}`);
}

const par = (quoi: Verdict) => resultats.filter((r) => r.verdict === quoi);

console.log(`\n## Une page ou deux par feuille — ${new Date().toISOString().slice(0, 10)}\n`);
console.log("| Verdict | Documents | Pages |");
console.log("|---|---:|---:|");
for (const quoi of ["deux pages", "une page", "à regarder"] as const)
  console.log(`| ${quoi} | ${par(quoi).length} | ${par(quoi).reduce((s, r) => s + r.pages, 0)} |`);

for (const quoi of ["à regarder", "deux pages"] as const) {
  const liste = par(quoi);
  if (liste.length === 0) continue;
  console.log(`\n### ${quoi} — ${liste.length} document(s)\n`);
  console.log("| Document | Pages | Creux central |");
  console.log("|---|---:|---:|");
  for (const r of [...liste].sort((a, b) => b.pages - a.pages).slice(0, 10))
    console.log(`| ${r.nom.slice(0, 50)} | ${r.pages} | ${(r.creux * 100).toFixed(0)} % |`);
  if (liste.length > 10) console.log(`| … et ${liste.length - 10} autres | | |`);
}

// Le classement entier, et pas seulement les dix premiers de chaque tableau. Une validation
// menée sur un tableau tronqué ne valide rien : elle confond « absent de la liste montrée » et
// « absent du verdict », ce qui m'est arrivé une fois de trop.
if (sortie !== undefined) {
  await writeFile(sortie, JSON.stringify({ mesure_le: new Date().toISOString(), resultats }, null, 2));
  console.error(`Classement complet écrit dans ${sortie}`);
}
