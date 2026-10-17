/** Que contient vraiment la bibliothèque ? (lot E2, étape 5 — contrôle de ce qui est indexé)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx \
 *       mesures/qualite-des-passages.ts <racine de la bibliothèque>
 *
 *  Le compte des passages ne dit pas s'ils sont lisibles. Un document du corpus en rendait 295,
 *  tous servis par sa couche texte, et tous du charabia : l'encodage de police était faux. La
 *  décision page par page a été corrigée — ce banc vérifie le **résultat**, passage par passage,
 *  et non la règle qui l'a produit.
 *
 *  Il n'y a pas de bon chiffre à atteindre ici : il y a un chiffre à connaître avant d'indexer
 *  deux cent cinquante documents. Un passage illisible dans l'index est une citation qu'on
 *  retrouvera un jour sans pouvoir la vérifier (RCH-09).
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Passage } from "@lienotheque/contrats";
import { SEUIL_LISIBILITE, partDeMotsOutils } from "@lienotheque/lecteur-texte";

const racine = process.argv[2];
if (racine === undefined) {
  console.error("Attendu : <racine de la bibliothèque>");
  process.exit(2);
}
const base = join(racine, "base");

const noms = new Map<string, string>();
for (const fichier of readdirSync(join(base, "travaux")).filter((n) => n.endsWith(".json"))) {
  const t = JSON.parse(readFileSync(join(base, "travaux", fichier), "utf8")) as { version_cible?: string; sujet?: { nom?: string } };
  if (t.version_cible !== undefined) noms.set(t.version_cible, t.sujet?.nom ?? t.version_cible);
}

/** Un passage trop court ne se juge pas : un titre de trois mots n'a pas de mots outils. */
const ASSEZ_DE_MOTS = 20;

/** Un texte sans mots outils est-il du charabia, ou une **liste** ?
 *
 *  La part de mots outils est un bon critère pour *comparer deux lectures de la même page* —
 *  l'usage qui décide, et il est juste. Comme **verdict absolu** sur un texte, elle se trompe :
 *  une liste de noms et de titres n'en contient aucun et se lit parfaitement.
 *
 *      « American Psychiatric Association Officers 2012-2013 President Dilip V. Jeste, M.D. »
 *
 *  Trente-deux passages de ce genre étaient comptés illisibles sur un seul document. Un relevé
 *  qui surcompte dans le sens rassurant serait moins grave ; celui-ci surcomptait dans le sens
 *  alarmant, et m'a fait annoncer un chiffre faux.
 *
 *  Ce qui distingue les deux ne se joue pas sur les mots outils mais sur les **mots eux-mêmes** :
 *  une liste est faite de mots bien formés — des suites de lettres d'une langue, avec des
 *  majuscules aux bons endroits. Un encodage cassé rend des suites impossibles : des lettres
 *  isolées, des signes mêlés aux lettres, des capitales au milieu des mots.
 */
function motsBienFormes(texte: string): number {
  const mots = texte.split(/\s+/).filter((m) => m !== "");
  if (mots.length === 0) return 0;
  // Un mot bien formé : au moins deux lettres, et rien que des lettres, apostrophes ou traits
  // d'union. Les nombres et la ponctuation isolée ne comptent ni pour ni contre.
  const candidats = mots.filter((mot) => /\p{L}/u.test(mot));
  if (candidats.length === 0) return 0;
  const bienFormes = candidats.filter((mot) => /^[\p{L}][\p{L}'’-]+$/u.test(mot.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")));
  return bienFormes.length / candidats.length;
}

/** En deçà de quelle part de mots bien formés un texte n'est plus du texte.
 *
 *  Mesuré sur les deux cas réels : **73,9 %** pour la liste de noms du DSM, **42,9 %** pour la
 *  couche cassée de « Reconsolidation », dont les « mots » sont des lettres isolées mêlées de
 *  signes. Soixante pour cent tombe entre, à quatorze points de chacun.
 *
 *  La marge est plus mince que celle du premier critère, qui sépare d'un ordre de grandeur. Ce
 *  critère ne décide donc jamais seul : c'est la conjonction des deux qui accuse. */
const SEUIL_FORME = 0.6;

/** Ce passage est-il illisible ? Les deux critères doivent l'accuser.
 *
 *  Peu de mots outils **et** des mots mal formés : une liste échoue au premier et réussit le
 *  second, un encodage cassé échoue aux deux. Exiger les deux, c'est refuser d'accuser sur un
 *  seul indice — et c'est ce qui manquait. */
const illisible = (texte: string): boolean => partDeMotsOutils(texte) < SEUIL_LISIBILITE && motsBienFormes(texte) < SEUIL_FORME;

type Bilan = {
  nom: string;
  passages: number;
  jugeables: number;
  illisibles: number;
  parOcr: number;
  exemple?: string;
};

const bilans: Bilan[] = [];

for (const fichier of readdirSync(join(base, "versions")).filter((n) => n.endsWith(".json"))) {
  const charge = JSON.parse(readFileSync(join(base, "versions", fichier), "utf8")) as { passages?: unknown[] };
  const passages = (charge.passages ?? []).map((brut) => Passage.parse(brut));
  if (passages.length === 0) continue;

  let jugeables = 0;
  let illisibles = 0;
  let parOcr = 0;
  let exemple: string | undefined;
  for (const p of passages) {
    if (p.source === "ocr") parOcr += 1;
    if (p.texte.split(/\s+/).filter((m) => m !== "").length < ASSEZ_DE_MOTS) continue;
    jugeables += 1;
    if (illisible(p.texte)) {
      illisibles += 1;
      exemple ??= p.texte;
    }
  }

  bilans.push({
    nom: noms.get(basename(fichier, ".json")) ?? fichier,
    passages: passages.length,
    jugeables,
    illisibles,
    parOcr,
    ...(exemple === undefined ? {} : { exemple }),
  });
}

bilans.sort((a, b) => b.illisibles - a.illisibles);

console.log(`\n  ${"document".padEnd(46)} ${"passages".padStart(8)} ${"jugeables".padStart(9)} ${"illisibles".padStart(10)} ${"par OCR".padStart(7)}`);
console.log(`  ${"-".repeat(46)} ${"-".repeat(8)} ${"-".repeat(9)} ${"-".repeat(10)} ${"-".repeat(7)}`);
for (const b of bilans) {
  const part = b.jugeables === 0 ? "" : ` (${((100 * b.illisibles) / b.jugeables).toFixed(1)} %)`;
  console.log(
    `  ${b.nom.slice(0, 46).padEnd(46)} ${String(b.passages).padStart(8)} ${String(b.jugeables).padStart(9)} ` +
      `${(String(b.illisibles) + part).padStart(10)} ${String(b.parOcr).padStart(7)}`,
  );
}

const total = bilans.reduce((s, b) => s + b.passages, 0);
const jugeables = bilans.reduce((s, b) => s + b.jugeables, 0);
const illisibles = bilans.reduce((s, b) => s + b.illisibles, 0);
console.log(`  ${"-".repeat(46)} ${"-".repeat(8)} ${"-".repeat(9)} ${"-".repeat(10)}`);
console.log(
  `  ${"ensemble".padEnd(46)} ${String(total).padStart(8)} ${String(jugeables).padStart(9)} ` +
    `${(String(illisibles) + ` (${((100 * illisibles) / Math.max(jugeables, 1)).toFixed(1)} %)`).padStart(10)}`,
);

for (const b of bilans.filter((x) => x.exemple !== undefined).slice(0, 2))
  console.log(`\n  ${b.nom} — un passage illisible retenu :\n    « ${b.exemple!.split(/\s+/).slice(0, 24).join(" ")} … »`);

const sortie = "/tmp/claude-501/e2/qualite-des-passages.json";
writeFileSync(sortie, JSON.stringify(bilans, null, 2));
console.log(`\nRelevé écrit dans ${sortie}`);
