/** Quels documents ont une couche texte **lisible** ? (lot E2, étape 2, second relevé)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/couche-saine.ts <inventaire.json>
 *
 *  La question de départ — « peut-on se fier à la couche texte existante ? » — n'avait pas de
 *  réponse unique, et c'est la comparaison avec l'OCR qui l'a montré : deux documents rendaient
 *  95 à 100 % d'accord, un troisième rendait 2 %. En regardant ce que ce troisième disait
 *  vraiment, la cause est apparue : sa couche n'est pas médiocre, elle est **illisible** —
 *  « Â w èuw Â ë} »· é » là où l'OCR lit une phrase française. Le PDF ne dit pas à quel caractère
 *  correspond chaque glyphe, et tout ce qu'on en extrait est du bruit.
 *
 *  Un tel défaut se reconnaît **sans océriser**, et c'est tout l'intérêt : du texte français
 *  est fait de mots, et un mot est fait de lettres. Une couche cassée rend des suites de
 *  symboles. Comparer à l'OCR coûtait une minute par page ; ce contrôle-ci coûte une seconde par
 *  document, et il peut donc passer sur les deux cent vingt-quatre.
 *
 *  Il ne tranche pas pour autant tout seul : il classe, et la zone grise revient à l'œil.
 */
import { readFile } from "node:fs/promises";
import { lireCoucheTexte } from "@lienotheque/lecteur-texte";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";

const chemin = process.argv[2];
if (chemin === undefined) {
  console.error("Attendu : <inventaire.json>");
  process.exit(2);
}

type Releve = { chemin: string; octets: number; empreinte: string; pages: number; polices: number; images: number };
const inventaire = JSON.parse(await readFile(chemin, "utf8")) as { dossier: string; releves: Releve[] };
const distincts = [...new Map(inventaire.releves.map((r) => [r.empreinte, r])).values()].filter(
  (r) => r.pages > 0 && r.polices > 0,
);

/** Les mots qu'aucune page de ce corpus ne peut éviter.
 *
 *  Pas du vocabulaire de domaine — de la grammaire. Une page de français en contient quinze à
 *  trente pour cent ; une couche sans correspondance de glyphes n'en contient aucun, parce
 *  qu'elle ne contient aucun mot. L'anglais est là aussi : une dizaine d'ouvrages en sont. */
const OUTILS_FR = new Set(
  ("le la les un une des de du au aux et ou mais donc or ni car que qui quoi dont ou si ce cet cette ces son sa ses leur " +
    "leurs mon ma mes ton ta tes notre nos votre vos il elle ils elles on nous vous je tu me te se lui y en dans sur sous " +
    "pour par avec sans vers chez entre pas ne plus moins tres bien aussi comme quand alors est sont etait ont avoir etre " +
    "fait peut doit tout tous toute toutes meme autre").split(" "),
);
const OUTILS_EN = new Set(
  ("the a an and or but of to in on at for with from by as is are was were be been have has had do does did not no " +
    "this that these those it its he she they we you his her their our your can will would should could about more than").split(" "),
);

/** La part des mots d'une page qui sont des mots-outils.
 *
 *  **Première version, et elle était fausse** : elle demandait qu'un mot soit fait de lettres et
 *  rien d'autre. En prose, un mot sur cinq porte une virgule ou un point collé, sans compter les
 *  nombres, les URL et les codes. Elle notait donc 59 % un DSM-5 dont la couche est impeccable,
 *  et la zone grise s'était remplie de documents parfaitement sains. Vérifier avant de conclure
 *  a coûté trois extraits de texte.
 *
 *  Et elle laissait passer le défaut qu'elle cherchait : « èuw » est fait de lettres et porte une
 *  voyelle. Chercher des mots **connus** plutôt que des mots **plausibles** sépare les deux
 *  familles sans ambiguïté. */
function partDeMots(texte: string): number {
  const morceaux = texte
    .toLowerCase()
    .split(/\s+/)
    .map((mot) => mot.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
    .filter((mot) => mot.length >= 1);
  if (morceaux.length < 20) return 0;
  const sansAccent = (mot: string) => mot.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const outils = morceaux.filter((mot) => OUTILS_FR.has(sansAccent(mot)) || OUTILS_EN.has(mot));
  return outils.length / morceaux.length;
}

/** Huit pages du corps, jamais la couverture.
 *
 *  Trois ne suffisaient pas, et c'est une mesure qui l'a montré : un document rendait 3 % sur
 *  une page, 16 % sur la suivante, 38 % sur la troisième. La moyenne le déclarait sain et
 *  noyait les pages cassées dans les bonnes. */
const rangsDe = (combien: number): readonly number[] => {
  const premier = Math.min(2, Math.max(0, combien - 1));
  const dernier = Math.max(premier, combien - 2);
  const pas = Math.max(1, Math.floor((dernier - premier) / 7));
  const rangs: number[] = [];
  for (let rang = premier; rang <= dernier && rangs.length < 8; rang += pas) rangs.push(rang);
  return [...new Set(rangs)];
};

/** Une page de prose est faite de dix à trente pour cent de mots-outils ; une couche sans
 *  correspondance de glyphes n'en a aucun. Le creux entre les deux est immense, et les seuils
 *  sont posés dedans — là où ils ne départagent presque rien, ce qui est la seule place
 *  honnête pour un seuil. */
const SEUIL_SAIN = 0.08;
const SEUIL_CASSE = 0.02;

type Verdict = "saine" | "cassée" | "à regarder" | "illisible";

/** On juge **page par page**, et non document par document.
 *
 *  Un document rendait 3 % sur une page et 38 % sur une autre : son défaut d'encodage ne touche
 *  qu'une partie de ses pages. Une moyenne par document aurait condamné ses bonnes pages ou
 *  sauvé ses mauvaises, selon le côté où elle penche — et aucune des deux erreurs ne se voit.
 *
 *  C'est aussi la bonne unité pour le traitement : le moteur lit page par page, et peut donc
 *  décider page par page. Là où la couche tient, il la prend ; ailleurs, il océrise. Aucun
 *  arbitrage à demander pour ce qui est franc. */
const classement: { releve: Releve; part: number; verdict: Verdict; saines: number; cassees: number; grises: number }[] = [];

for (const [rang, releve] of distincts.entries()) {
  let saines = 0;
  let cassees = 0;
  let grises = 0;
  let part = 0;
  let verdict: Verdict = "illisible";
  try {
    const donnees = await readFile(releve.chemin);
    const pages = pagesPdf(objetsPdf(donnees));
    const couche = await lireCoucheTexte(releve.chemin);
    const parts = rangsDe(Math.min(pages.length, couche.pages.length))
      .map((r) => couche.pages[r])
      .filter((p) => p !== undefined)
      .map((p) => partDeMots(p.mots.map((m) => m.texte).join(" ")))
      .filter((valeur) => valeur > 0 || true);
    const mesurables = parts.filter((valeur) => valeur >= 0);
    for (const valeur of mesurables) {
      if (valeur >= SEUIL_SAIN) saines += 1;
      else if (valeur <= SEUIL_CASSE) cassees += 1;
      else grises += 1;
    }
    if (mesurables.length > 0) {
      part = mesurables.reduce((s, v) => s + v, 0) / mesurables.length;
      // Le verdict du document n'est qu'un résumé : ce qui compte est le compte des pages.
      verdict = cassees === 0 && grises === 0 ? "saine" : saines === 0 ? "cassée" : "à regarder";
    }
  } catch {
    verdict = "illisible";
  }
  classement.push({ releve, part, verdict, saines, cassees, grises });
  if ((rang + 1) % 25 === 0) console.error(`  ${rang + 1} / ${distincts.length}`);
}

const par = (quoi: Verdict) => classement.filter((c) => c.verdict === quoi);
const pages = (liste: typeof classement) => liste.reduce((somme, c) => somme + c.releve.pages, 0);

console.log(`\n## La couche texte, document par document — ${new Date().toISOString().slice(0, 10)}\n`);
console.log("| Verdict | Documents | Pages |");
console.log("|---|---:|---:|");
for (const quoi of ["saine", "à regarder", "cassée", "illisible"] as const)
  console.log(`| ${quoi} | ${par(quoi).length} | ${pages(par(quoi))} |`);

const echantillonnees = classement.reduce((s, c) => s + c.saines + c.cassees + c.grises, 0);
const sainesVues = classement.reduce((s, c) => s + c.saines, 0);
const casseesVues = classement.reduce((s, c) => s + c.cassees, 0);
const grisesVues = classement.reduce((s, c) => s + c.grises, 0);
const totalPages = classement.reduce((s, c) => s + c.releve.pages, 0);
const partSaine = echantillonnees === 0 ? 0 : sainesVues / echantillonnees;

console.log(`\n### Le compte qui décide de la durée : les pages\n`);
console.log("| Pages de l'échantillon | Part | Rapporté aux " + totalPages + " pages |");
console.log("|---|---:|---:|");
for (const [quoi, combien] of [["couche utilisable", sainesVues], ["couche cassée", casseesVues], ["à regarder", grisesVues]] as const)
  console.log(
    `| ${quoi} | ${((combien / Math.max(echantillonnees, 1)) * 100).toFixed(0)} % | ` +
      `~${Math.round((combien / Math.max(echantillonnees, 1)) * totalPages)} |`,
  );
console.log(`\n${echantillonnees} pages échantillonnées sur ${distincts.length} documents.`);
console.log(`**${(partSaine * 100).toFixed(0)} % des pages ont une couche utilisable.**`);

for (const quoi of ["à regarder", "cassée"] as const) {
  const liste = par(quoi);
  if (liste.length === 0) continue;
  console.log(`\n### ${liste.length} document(s) « ${quoi} »\n`);
  console.log("| Document | Mots reconnus | Pages |");
  console.log("|---|---:|---:|");
  for (const c of [...liste].sort((a, b) => a.part - b.part).slice(0, 20))
    console.log(
      `| ${c.releve.chemin.slice(inventaire.dossier.length + 1, inventaire.dossier.length + 53)} | ${(c.part * 100).toFixed(0)} % | ${c.releve.pages} |`,
    );
}
