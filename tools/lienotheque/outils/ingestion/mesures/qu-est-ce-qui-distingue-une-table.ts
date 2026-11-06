/** Qu'est-ce qui distingue une table d'une page qui n'en est pas une ? (OUT-10, REC-02)
 *
 *  Mesure d'ouverture. Le détecteur ne demande aujourd'hui que deux colonnes de nombres et quatre
 *  rangées. Mesuré le 6 novembre 2026 sur un livre entier : **57 pages sur 116 passent ce test**,
 *  et 111 de ces pages ne sont pas des tables — ce sont des partitions, dont les nombres
 *  s'alignent par hasard. 99,5 % du coût d'A2 y partait.
 *
 *  Ce programme ne décide rien. Il relève, pour chaque page qui passe le test actuel, des
 *  propriétés **de forme** — aucune ne nomme un domaine — et les écrit pour qu'on puisse voir
 *  lesquelles séparent, et sur combien de familles.
 *
 *  Usage : qu-est-ce-qui-distingue-une-table.ts <dossier> [<dossier>…]
 *          (chaque dossier porte un PDF et ses enregistrements)
 */
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { lireLaTable, valeurDeCellule, type RangeeDeTable, type TableLue } from "@lienotheque/noyau";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const dossiers = process.argv.slice(2);
if (dossiers.length === 0) {
  console.error("usage : qu-est-ce-qui-distingue-une-table.ts <dossier> [<dossier>…]");
  process.exit(2);
}

const mediane = (valeurs: readonly number[]): number => {
  if (valeurs.length === 0) return 0;
  const triees = [...valeurs].sort((un, autre) => un - autre);
  return triees[Math.floor(triees.length / 2)]!;
};

/** La racine d'un intitulé : ses lettres seules, en minuscules. « Workout 12 » et « Workout 3 »
 *  ont la même. Un intitulé sans une seule lettre n'a pas de racine. */
const racine = (intitule: string): string =>
  intitule
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "")
    .trim();

/** Combien de rangées partagent la racine d'intitulé la plus fréquente. */
function plusGrandGroupeDIntitules(rangees: readonly RangeeDeTable[]): { combien: number; racine: string } {
  const comptes = new Map<string, number>();
  for (const rangee of rangees) {
    const clef = racine(rangee.intitule);
    if (clef.length === 0) continue;
    comptes.set(clef, (comptes.get(clef) ?? 0) + 1);
  }
  let meilleur = { combien: 0, racine: "" };
  for (const [clef, combien] of comptes) if (combien > meilleur.combien) meilleur = { combien, racine: clef };
  return meilleur;
}

/** La plus longue suite strictement croissante d'une colonne, trous ignorés. */
function plusLongueMontee(valeurs: readonly (number | undefined)[]): number {
  const lues = valeurs.filter((valeur): valeur is number => valeur !== undefined);
  let meilleure = lues.length === 0 ? 0 : 1;
  let courante = lues.length === 0 ? 0 : 1;
  for (let rang = 1; rang < lues.length; rang += 1) {
    if (lues[rang]! > lues[rang - 1]!) courante += 1;
    else courante = 1;
    if (courante > meilleure) meilleure = courante;
  }
  return meilleure;
}

type Releve = {
  readonly jeu: string;
  readonly page: number;
  readonly vivier: number;
  readonly pagesDuDocument: number;
  readonly colonnes: number;
  readonly panneaux: number;
  readonly rangees: number;
  readonly rangeesPorteuses: number;
  readonly utilisables: number;
  readonly aRelire: number;
  /** Rangées dont l'intitulé n'est pas vide, sur les rangées porteuses. */
  readonly avecIntitule: number;
  /** La plus grande famille d'intitulés qui se répètent, et sa racine. */
  readonly groupeDIntitules: number;
  readonly racineDuGroupe: string;
  /** Par colonne : son maximum et sa plus longue montée. */
  readonly maxParColonne: readonly number[];
  readonly monteeParColonne: readonly number[];
  /** Le pas vertical des rangées porteuses : sa médiane, et sa dispersion relative. */
  readonly pasMedian: number;
  readonly dispersionDuPas: number;
  readonly nombresParRangee: number;
  readonly motsParRangee: number;
};

function relever(jeu: string, page: number, vivier: number, pagesDuDocument: number, table: TableLue): Releve {
  const porteuses = table.rangees.filter((rangee) => rangee.cellules.some((cellule) => cellule !== undefined));
  const groupe = plusGrandGroupeDIntitules(porteuses);
  const combienDeColonnes = table.colonnes.length;
  const maxParColonne: number[] = [];
  const monteeParColonne: number[] = [];
  for (let colonne = 0; colonne < combienDeColonnes; colonne += 1) {
    const valeurs = porteuses.map((rangee) => rangee.cellules[colonne]);
    const lues = valeurs.filter((valeur): valeur is number => valeur !== undefined);
    maxParColonne.push(lues.length === 0 ? 0 : Math.max(...lues));
    monteeParColonne.push(plusLongueMontee(valeurs));
  }
  const pas = porteuses.slice(1).map((rangee, rang) => rangee.y - porteuses[rang]!.y);
  const pasMedian = mediane(pas);
  const dispersion =
    pasMedian === 0 ? 0 : mediane(pas.map((un) => Math.abs(un - pasMedian))) / pasMedian;
  return {
    jeu,
    page,
    vivier,
    pagesDuDocument,
    colonnes: combienDeColonnes,
    panneaux: table.panneaux,
    rangees: table.rangees.length,
    rangeesPorteuses: porteuses.length,
    utilisables: table.utilisables.length,
    aRelire: table.aRelire.length,
    avecIntitule: porteuses.filter((rangee) => racine(rangee.intitule).length > 0).length,
    groupeDIntitules: groupe.combien,
    racineDuGroupe: groupe.racine,
    maxParColonne,
    monteeParColonne,
    pasMedian: Number(pasMedian.toFixed(1)),
    dispersionDuPas: Number(dispersion.toFixed(3)),
    nombresParRangee: mediane(
      porteuses.map((rangee) => rangee.cellules.filter((cellule) => cellule !== undefined).length),
    ),
    motsParRangee: 0,
  };
}

const releves: Releve[] = [];
const bac = mkdtempSync(join(tmpdir(), "lienotheque-distingue-"));
try {
  for (const dossier of dossiers) {
    const noms = readdirSync(dossier);
    const nomPdf = noms.find((n) => n.toLowerCase().endsWith(".pdf"));
    if (nomPdf === undefined) {
      console.log(`${basename(dossier)} — aucun PDF, passé`);
      continue;
    }
    const pdf = join(dossier, nomPdf);
    const vivier = noms.filter((n) => /\.(mp3|m4a|wav|flac|ogg|aac)$/i.test(n)).length;
    const parMedias = join(dossier, "medias");
    const vivierReel =
      vivier > 0
        ? vivier
        : (() => {
            try {
              return readdirSync(parMedias).filter((n) => /\.(mp3|m4a|wav|flac|ogg|aac)$/i.test(n)).length;
            } catch {
              return 0;
            }
          })();
    const couche = await lireCoucheTexte(pdf);
    const parRang = new Map(couche.pages.map((page) => [page.index, page]));
    const rendu = await ouvrirRenduPdf(pdf);
    const combien = rendu.nombreDePages;
    let passent = 0;
    try {
      for (let rang = 1; rang <= combien; rang += 1) {
        const deLaCouche = parRang.get(rang);
        const page =
          deLaCouche !== undefined && coucheSuffisante(deLaCouche)
            ? deLaCouche
            : ocrDUnePageGrise(enGris(await rendu.page(rang, 1800)), rang, bac, OCR);
        const table = lireLaTable(page.mots);
        if (!table.estUneTable) continue;
        passent += 1;
        const releve = relever(basename(dossier), rang, vivierReel, combien, table);
        const lignesDeMotsParRangee = table.rangees
          .filter((rangee) => rangee.cellules.some((cellule) => cellule !== undefined))
          .map((rangee) => rangee.intitule.split(/\s+/).filter((mot) => mot.length > 0 && valeurDeCellule(mot) === undefined).length);
        releves.push({ ...releve, motsParRangee: mediane(lignesDeMotsParRangee) });
      }
    } finally {
      await rendu.fermer();
    }
    console.log(`${basename(dossier)} — ${passent} page(s) sur ${combien} passent le test actuel, vivier ${vivierReel}`);
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
}

const sortie =
  process.env["LIENOTHEQUE_SORTIE"] ??
  join(import.meta.dirname, "sorties", "qu-est-ce-qui-distingue-une-table.json");
writeFileSync(sortie, `${JSON.stringify(releves, undefined, 2)}\n`);
console.log(`\n${releves.length} relevé(s) écrit(s) : ${sortie}`);
