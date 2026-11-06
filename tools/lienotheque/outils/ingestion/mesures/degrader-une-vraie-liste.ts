/** Que devient une vraie liste quand la reconnaissance en perd une case par rangée ? (OUT-10)
 *
 *  Contre-épreuve demandée par Christophe le 6 novembre 2026. Le critère « au moins un
 *  enregistrement complet » tient tant qu'une rangée survit entière. Si la reconnaissance abîme
 *  **chaque** rangée, il n'en reste aucune — et la règle rejetterait une vraie liste.
 *
 *  On retire une case par rangée, en tournant de colonne en colonne : retirer toujours la même
 *  ne dégraderait pas la table, cela supprimerait une colonne.
 *
 *  Usage : degrader-une-vraie-liste.ts <mots.json> [<mots.json>…]
 */
import { readFileSync } from "node:fs";
import { RANGEES_POUR_UNE_TABLE, lignesDeMots, lireLaTable, valeurDeCellule, type MotLu } from "@lienotheque/noyau";

type PageGardee = { readonly page: number; readonly largeur: number; readonly mots: readonly MotLu[] };
type Jeu = { readonly jeu: string; readonly vivier: number; readonly pagesDuDocument: number; readonly pages: readonly PageGardee[] };

/** Les pages dont la vérité est confirmée à l'image, et ce qu'elles sont. */
const VERITE: Record<string, "liste" | "sommaire" | "catalogue" | "partition"> = {
  "jalon-entier/5": "liste",
  "05 - Jon Liebman - Bass Aerobics/5": "liste",
  "02 - Bass Play Along Vol 5 FUNK/2": "liste",
  "06 - J.S. Bach for Electric Bass/2": "liste",
  "jalon-entier/8": "partition",
  "05 - Jon Liebman - Bass Aerobics/8": "partition",
  "01 - 70 Funk & Disco Bass/9": "partition",
  "07 - Keith Rosier - Jump'n'Blues Bass/10": "partition",
  "09 - Paul Westwood 2/9": "partition",
  "jalon-entier/4": "sommaire",
  "05 - Jon Liebman - Bass Aerobics/4": "sommaire",
  "03 - Funk Fusion Bass/3": "sommaire",
  "04 - Jon Liebman - Funk Fusion Bass/2": "sommaire",
  "11 - Aebersold 008 Sonny Rollins/5": "catalogue",
};

/** Retire une case par rangée, en tournant de colonne en colonne. */
function degrader(mots: readonly MotLu[], combienDeColonnes: number): readonly MotLu[] {
  if (combienDeColonnes === 0) return mots;
  const aJeter = new Set<MotLu>();
  lignesDeMots(mots).forEach((ligne, rang) => {
    const nombres = ligne.mots
      .filter((mot) => valeurDeCellule(mot.texte) !== undefined)
      .sort((un, autre) => un.x - autre.x);
    const vise = nombres[rang % combienDeColonnes];
    if (vise !== undefined) aJeter.add(vise);
  });
  return mots.filter((mot) => !aJeter.has(mot));
}

/** La plus longue suite à pas constant, et une colonne bornée : l'adoucissement à l'étude —
 *  garder la table sans exiger qu'une rangée y soit entière. */
function adoucie(mots: readonly MotLu[], vivier: number): boolean {
  const table = lireLaTable(mots, { enregistrements: vivier });
  if (table.colonnes.length < 2) return false;
  const porteuses = table.rangees.filter((rangee) => rangee.cellules.some((cellule) => cellule !== undefined));
  const hauteurs = mots.map((mot) => mot.h).sort((un, autre) => un - autre);
  const hauteur = hauteurs[Math.floor(hauteurs.length / 2)] ?? 0;
  const ecarts = porteuses.slice(1).map((rangee, rang) => rangee.y - porteuses[rang]!.y);
  let meilleur = { depuis: 0, combien: 1 };
  for (let depart = 0; depart < ecarts.length; depart += 1) {
    const pas = ecarts[depart]!;
    if (pas <= 0) continue;
    let combien = 2;
    for (let suivant = depart + 1; suivant < ecarts.length; suivant += 1) {
      if (Math.abs(ecarts[suivant]! - pas) > hauteur) break;
      combien += 1;
    }
    if (combien > meilleur.combien) meilleur = { depuis: depart, combien };
  }
  const suite = porteuses.slice(meilleur.depuis, meilleur.depuis + meilleur.combien);
  if (suite.length < RANGEES_POUR_UNE_TABLE) return false;
  return table.colonnes.some((_, colonne) => {
    const valeurs = suite
      .map((rangee) => rangee.cellules[colonne])
      .filter((valeur): valeur is number => valeur !== undefined);
    return valeurs.length > 0 && valeurs.every((valeur) => valeur >= 1 && valeur <= vivier);
  });
}

console.log(
  `${"page".padEnd(42)} ${"nature".padEnd(10)} ${"intacte".padStart(7)} ${"dégradée".padStart(8)} ` +
    `${"adoucie".padStart(7)} ${"adoucie dégradée".padStart(16)} cases`,
);
let listesPerdues = 0;
let faussesGardeesParLAdoucissement = 0;
for (const fichier of process.argv.slice(2)) {
  const jeux = JSON.parse(readFileSync(fichier, "utf8")) as readonly Jeu[];
  for (const jeu of jeux)
    for (const page of jeu.pages) {
      const clef = `${jeu.jeu}/${page.page}`;
      const nature = VERITE[clef];
      if (nature === undefined) continue;
      const intacte = lireLaTable(page.mots, { enregistrements: jeu.vivier });
      const abimee = degrader(page.mots, intacte.colonnes.length);
      const degradee = lireLaTable(abimee, { enregistrements: jeu.vivier });
      const douce = adoucie(page.mots, jeu.vivier);
      const douceDegradee = adoucie(abimee, jeu.vivier);
      if (nature === "liste" && intacte.estUneTable && !degradee.estUneTable) listesPerdues += 1;
      if (nature === "partition" && douce) faussesGardeesParLAdoucissement += 1;
      console.log(
        `${clef.slice(0, 42).padEnd(42)} ${nature.padEnd(10)} ` +
          `${(intacte.estUneTable ? "oui" : "non").padStart(7)} ${(degradee.estUneTable ? "oui" : "non").padStart(8)} ` +
          `${(douce ? "oui" : "non").padStart(7)} ${(douceDegradee ? "oui" : "non").padStart(16)} ` +
          `col ${intacte.colonnes.length}→${degradee.colonnes.length} · ` +
          `rang ${intacte.rangees.filter((r) => r.cellules.some((c) => c !== undefined)).length}` +
          `→${degradee.rangees.filter((r) => r.cellules.some((c) => c !== undefined)).length} · ` +
          `pleines ${degradee.utilisables.length} · ${intacte.aRelire.length} cases`,
      );
    }
}
console.log(`\n${listesPerdues} vraie(s) liste(s) perdue(s) par la dégradation.`);
console.log(`${faussesGardeesParLAdoucissement} partition(s) que l'adoucissement laisserait passer.`);
