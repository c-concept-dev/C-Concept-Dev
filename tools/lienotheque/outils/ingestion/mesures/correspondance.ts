/** Quel fichier correspond à quel ouvrage de l'ancienne base ? (lot E2, étape 3)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/correspondance.ts <inventaire.json> <ouvrages.json>
 *
 *  Sans cette correspondance, la comparaison du lot E3 confronterait deux bibliothèques qui ne
 *  parlent pas des mêmes livres, et son verdict ne vaudrait rien.
 *
 *  **Ce banc ne tranche que l'évident, et montre tout le reste.** Un titre identique au
 *  caractère près, une fois mis à plat, est une correspondance. Tout le reste — titres
 *  approchants, fichiers sans ouvrage, ouvrages sans fichier — est une **proposition**, pas une
 *  décision. Une correspondance devinée est pire qu'une correspondance manquante : elle ne se
 *  voit pas, et c'est le lecteur qui la découvrira, le jour où il cherchera un livre et en
 *  trouvera un autre.
 */
import { readFile, writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const [cheminInventaire, cheminOuvrages, sortie] = process.argv.slice(2);
if (cheminInventaire === undefined || cheminOuvrages === undefined) {
  console.error("Attendu : <inventaire.json> <ouvrages.json> [sortie.json]");
  process.exit(2);
}

type Releve = { chemin: string; octets: number; empreinte: string; pages: number };
type Ouvrage = { book_id: string; book_title: string; author: string | null; passages: number };

const inventaire = JSON.parse(await readFile(cheminInventaire, "utf8")) as { dossier: string; releves: Releve[] };
const ouvrages = JSON.parse(await readFile(cheminOuvrages, "utf8")) as Ouvrage[];
const fichiers = [...new Map(inventaire.releves.map((r) => [r.empreinte, r])).values()];

/** Le même titre, écrit de deux façons, doit se ressembler.
 *
 *  On retire les accents, la ponctuation, les numéros de tête et les mots vides de sens pour
 *  une comparaison — rien qui change le sens, tout ce qui change l'écriture. */
const aplatir = (texte: string): string =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const motsDe = (texte: string): Set<string> => new Set(aplatir(texte).split(" ").filter((mot) => mot.length >= 3));

/** Combien deux titres ont de mots en commun, rapporté au plus court des deux.
 *
 *  Rapporté au plus court, et non à l'union : « Thérapie des schémas » et « Thérapie des schémas
 *  en pratique » désignent peut-être le même ouvrage, et une mesure qui les éloigne parce que
 *  l'un est plus long que l'autre ne rendrait pas service. */
function ressemblance(a: string, b: string): number {
  const motsA = motsDe(a);
  const motsB = motsDe(b);
  if (motsA.size === 0 || motsB.size === 0) return 0;
  const communs = [...motsA].filter((mot) => motsB.has(mot)).length;
  return communs / Math.min(motsA.size, motsB.size);
}

/** Le titre que porte un nom de fichier, débarrassé de ce qui n'est pas le titre.
 *
 *  Les noms de ce corpus traînent des restes de téléchargement : un préfixe « utf-8'' » laissé
 *  par un en-tête HTTP, des mentions de bibliothèque, l'auteur accolé, des points en guise
 *  d'espaces. Les laisser, c'est faire échouer des rapprochements évidents — « Métaphores et
 *  suggestions hypnotiques » ne ressemble pas à « utf-8''Hammond Corydon - M?taphores… » tant
 *  qu'on n'a pas retiré le bruit. */
const titreDuFichier = (chemin: string): string =>
  basename(chemin, extname(chemin))
    .replace(/^utf-8''/i, "")
    .replace(/\((Z-Library|z-lib[^)]*)\)/gi, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

type Lien = { readonly fichier: Releve; readonly ouvrage: Ouvrage; readonly score: number; readonly sur: string };

const certains: Lien[] = [];
const proposes: Lien[] = [];
const restants = new Map(ouvrages.map((o) => [o.book_id, o]));

// Première passe : l'évident. Un titre qui s'aplatit à l'identique, ou un identifiant qui
// s'aplatit comme le nom du fichier — les deux sont des faits, pas des suppositions.
for (const fichier of fichiers) {
  const titre = aplatir(titreDuFichier(fichier.chemin));
  const trouve = [...restants.values()].find((o) => aplatir(o.book_title) === titre || aplatir(o.book_id) === titre);
  if (trouve !== undefined) {
    certains.push({ fichier, ouvrage: trouve, score: 1, sur: "titre identique" });
    restants.delete(trouve.book_id);
  }
}

// Seconde passe : ce qui se ressemble, et qu'on ne tranchera pas seul.
const sansOuvrage = fichiers.filter((f) => !certains.some((c) => c.fichier.empreinte === f.empreinte));
for (const fichier of sansOuvrage) {
  const titre = titreDuFichier(fichier.chemin);
  const candidats = [...restants.values()]
    .map((ouvrage) => ({ ouvrage, score: ressemblance(titre, ouvrage.book_title) }))
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  const meilleur = candidats[0];
  if (meilleur !== undefined) proposes.push({ fichier, ouvrage: meilleur.ouvrage, score: meilleur.score, sur: "titres proches" });
}

// Troisième passe, pour les ouvrages que rien n'a réclamé : on les cherche **dans l'autre
// sens**, parmi tous les fichiers, avec une exigence plus basse. Un sous-titre, une traduction
// ou un nom de fichier abîmé suffit à faire manquer un rapprochement évident, et chercher
// depuis l'ouvrage plutôt que depuis le fichier change ce qu'on trouve.
const repeches: Lien[] = [];
for (const ouvrage of [...restants.values()]) {
  if (proposes.some((p) => p.ouvrage.book_id === ouvrage.book_id)) continue;
  const candidats = sansOuvrage
    .filter((f) => !proposes.some((p) => p.fichier.empreinte === f.empreinte))
    .map((fichier) => ({ fichier, score: ressemblance(ouvrage.book_title, titreDuFichier(fichier.chemin)) }))
    .filter((c) => c.score >= 0.4)
    .sort((a, b) => b.score - a.score);
  const meilleur = candidats[0];
  if (meilleur !== undefined)
    repeches.push({ fichier: meilleur.fichier, ouvrage, score: meilleur.score, sur: "repêché depuis l'ouvrage" });
}

const fichiersSeuls = sansOuvrage.filter(
  (f) => !proposes.some((p) => p.fichier.empreinte === f.empreinte) && !repeches.some((r) => r.fichier.empreinte === f.empreinte),
);
const proposesIds = new Set([...proposes, ...repeches].map((p) => p.ouvrage.book_id));
const ouvragesSeuls = [...restants.values()].filter((o) => !proposesIds.has(o.book_id));

const court = (chemin: string) => chemin.slice(inventaire.dossier.length + 1);

console.log(`\n## Correspondance — ${new Date().toISOString().slice(0, 10)}\n`);
console.log("| | |");
console.log("|---|---:|");
console.log(`| Fichiers distincts | ${fichiers.length} |`);
console.log(`| Ouvrages dans l'ancienne base | ${ouvrages.length} |`);
console.log(`| **Correspondances certaines** | **${certains.length}** |`);
console.log(`| Propositions à valider | ${proposes.length} |`);
console.log(`| Repêchés depuis l'ouvrage | ${repeches.length} |`);
console.log(`| Fichiers sans ouvrage | ${fichiersSeuls.length} |`);
console.log(`| Ouvrages sans fichier | ${ouvragesSeuls.length} |`);

if (proposes.length > 0) {
  console.log(`\n### ${proposes.length} proposition(s) — à valider une par une, rien n'est décidé\n`);
  console.log("| Fichier | Ouvrage proposé | Mots communs |");
  console.log("|---|---|---:|");
  for (const p of [...proposes].sort((a, b) => b.score - a.score))
    console.log(`| ${court(p.fichier.chemin).slice(0, 48)} | ${p.ouvrage.book_title.slice(0, 44)} | ${(p.score * 100).toFixed(0)} % |`);
}

if (repeches.length > 0) {
  console.log(`\n### ${repeches.length} rapprochement(s) trouvé(s) en cherchant depuis l'ouvrage\n`);
  console.log("| Ouvrage de l'ancienne base | Fichier trouvé | Mots communs |");
  console.log("|---|---|---:|");
  for (const r of [...repeches].sort((a, b) => b.score - a.score))
    console.log(`| ${r.ouvrage.book_title.slice(0, 40)} | ${court(r.fichier.chemin).slice(0, 44)} | ${(r.score * 100).toFixed(0)} % |`);
}

if (fichiersSeuls.length > 0) {
  console.log(`\n### ${fichiersSeuls.length} fichier(s) qu'aucun ouvrage ne réclame\n`);
  console.log("Nouveaux depuis le dernier import, ou rangés sous un autre titre.\n");
  console.log("| Fichier | Pages |");
  console.log("|---|---:|");
  for (const f of [...fichiersSeuls].sort((a, b) => b.pages - a.pages))
    console.log(`| ${court(f.chemin).slice(0, 60)} | ${f.pages} |`);
}

if (ouvragesSeuls.length > 0) {
  console.log(`\n### ${ouvragesSeuls.length} ouvrage(s) dont le fichier est introuvable\n`);
  console.log("Le passage par la façade les cherchera : s'ils manquent, la comparaison le dira.\n");
  console.log("| Ouvrage | Passages |");
  console.log("|---|---:|");
  for (const o of [...ouvragesSeuls].sort((a, b) => b.passages - a.passages))
    console.log(`| ${o.book_title.slice(0, 56)} | ${o.passages} |`);
}

if (sortie !== undefined) {
  await writeFile(
    sortie,
    JSON.stringify(
      {
        etabli_le: new Date().toISOString(),
        certains: certains.map((c) => ({ fichier: court(c.fichier.chemin), book_id: c.ouvrage.book_id })),
        proposes: proposes.map((p) => ({ fichier: court(p.fichier.chemin), book_id: p.ouvrage.book_id, score: p.score })),
        repeches: repeches.map((r) => ({ fichier: court(r.fichier.chemin), book_id: r.ouvrage.book_id, score: r.score })),
        fichiers_seuls: fichiersSeuls.map((f) => court(f.chemin)),
        ouvrages_seuls: ouvragesSeuls.map((o) => ({ book_id: o.book_id, titre: o.book_title })),
      },
      null,
      2,
    ),
  );
  console.error(`\nRelevé écrit dans ${sortie}`);
}
