/** Éprouver des règles de détection de table sur des mots déjà lus (OUT-10, REC-02).
 *
 *  Rapide par construction : la reconnaissance a été faite une fois par
 *  `garder-les-mots-des-tables.ts`. Ici on ne fait que relire ces mots et compter.
 *
 *  **Deux taux, et jamais un seul.** Rejeter une fausse table économise des reconnaissances ;
 *  manquer une vraie liste perd des liens. Les confondre dans un seul chiffre les rendrait
 *  tous les deux invisibles.
 *
 *  **Le rappel ne se mesure que sur des pages confirmées à l'image.** Le texte trie, l'image
 *  tranche : une page que le détecteur ne signale pas n'a pas d'autre juge.
 *
 *  Usage : eprouver-le-detecteur.ts <mots.json> [<mots.json>…]
 */
import { readFileSync } from "node:fs";
import { RANGEES_POUR_UNE_TABLE, lireLaTable, type MotLu, type RangeeDeTable } from "@lienotheque/noyau";

type PageGardee = { readonly page: number; readonly largeur: number; readonly mots: readonly MotLu[] };
type Jeu = {
  readonly jeu: string;
  readonly vivier: number;
  readonly pagesDuDocument: number;
  readonly pages: readonly PageGardee[];
};

type Nature = "liste" | "sommaire" | "catalogue" | "partition" | "autre";
type Verite = { readonly quoi: Nature; readonly source: "image" | "texte" };

/** Ce que chaque page est, et **d'où on le sait**.
 *
 *  « liste » : une table dont les colonnes désignent un enregistrement et une page — la seule
 *  qui puisse produire un lien. « sommaire » et « catalogue » : de vraies tables, mais dont
 *  rien ne lie. « partition » : des nombres alignés par la gravure, pas par un tableau. */
const VERITE: Record<string, Verite> = {
  // ── Vraies listes de pistes, trois familles ──
  "jalon-entier/5": { quoi: "liste", source: "image" },
  "05 - Jon Liebman - Bass Aerobics/5": { quoi: "liste", source: "image" },
  "02 - Bass Play Along Vol 5 FUNK/2": { quoi: "liste", source: "image" },
  "06 - J.S. Bach for Electric Bass/2": { quoi: "liste", source: "image" },
  // ── Partitions, quatre familles ──
  "jalon-entier/8": { quoi: "partition", source: "image" },
  "05 - Jon Liebman - Bass Aerobics/8": { quoi: "partition", source: "image" },
  "01 - 70 Funk & Disco Bass/9": { quoi: "partition", source: "image" },
  "07 - Keith Rosier - Jump'n'Blues Bass/10": { quoi: "partition", source: "image" },
  "09 - Paul Westwood 2/9": { quoi: "partition", source: "image" },
  // ── Sommaires, trois familles ──
  "jalon-entier/4": { quoi: "sommaire", source: "image" },
  "05 - Jon Liebman - Bass Aerobics/4": { quoi: "sommaire", source: "image" },
  "03 - Funk Fusion Bass/3": { quoi: "sommaire", source: "image" },
  "04 - Jon Liebman - Funk Fusion Bass/2": { quoi: "sommaire", source: "image" },
  // ── Un catalogue : une vraie table dont aucune valeur ne peut désigner un enregistrement ──
  "11 - Aebersold 008 Sonny Rollins/5": { quoi: "catalogue", source: "image" },
};

const mediane = (valeurs: readonly number[]): number => {
  if (valeurs.length === 0) return 0;
  const triees = [...valeurs].sort((un, autre) => un - autre);
  return triees[Math.floor(triees.length / 2)]!;
};

/** La plus longue suite de rangées consécutives dont les écarts sont tous égaux, à la hauteur
 *  d'une rangée près. La tolérance ne vient pas d'un réglage : c'est ce que la page imprime. */
function plusLongueSuiteAPasConstant<T extends { readonly y: number }>(
  rangees: readonly T[],
  hauteurDUneRangee: number,
): readonly T[] {
  if (rangees.length < 2) return rangees;
  const ecarts = rangees.slice(1).map((rangee, rang) => rangee.y - rangees[rang]!.y);
  let meilleur = { depuis: 0, combien: 1 };
  for (let depart = 0; depart < ecarts.length; depart += 1) {
    const pas = ecarts[depart]!;
    if (pas <= 0) continue;
    let combien = 2;
    for (let suivant = depart + 1; suivant < ecarts.length; suivant += 1) {
      if (Math.abs(ecarts[suivant]! - pas) > hauteurDUneRangee) break;
      combien += 1;
    }
    if (combien > meilleur.combien) meilleur = { depuis: depart, combien };
  }
  return rangees.slice(meilleur.depuis, meilleur.depuis + meilleur.combien);
}

/** Les rangées qui tombent sur la grille que la suite définit.
 *
 *  Une table est une grille : un pas, une origine, et des rangées posées dessus. La suite la
 *  plus longue donne le pas ; la grille retient ensuite **toutes** les rangées qui s'y alignent,
 *  y compris celles qu'un intertitre a séparées de la suite. Sans cela on perdrait les trois
 *  quarts d'une vraie liste — mesuré le 6 novembre 2026 : 13 rangées retenues sur 52. */
function rangeesSurLaGrille<T extends { readonly y: number }>(
  rangees: readonly T[],
  suite: readonly T[],
  tolerance: number,
): readonly T[] {
  if (suite.length < 2) return suite;
  const pas = (suite.at(-1)!.y - suite[0]!.y) / (suite.length - 1);
  if (pas <= 0) return suite;
  const origine = suite[0]!.y;
  return rangees.filter((rangee) => {
    const ecart = Math.abs(rangee.y - origine) % pas;
    return Math.min(ecart, pas - ecart) <= tolerance;
  });
}

type Releve = {
  readonly clef: string;
  readonly verite: Verite | undefined;
  readonly signalee: boolean;
  readonly suite: number;
  readonly partPleinesDeLaSuite: number;
  readonly colonnesDansLeVivier: number;
  readonly aRelire: number;
  /** Les cases à relire des seules rangées de la suite : la table, et non la page. */
  readonly aRelireDeLaSuite: number;
  /** Les cases à relire des rangées posées sur la grille de la table. */
  readonly aRelireDeLaGrille: number;
  readonly surLaGrille: number;
  /** Une rangée porteuse au moins remplit-elle toutes ses colonnes ? Compté sur **toutes** les
   *  rangées porteuses, et non sur celles de la suite : sans suite, il n'y a pas de suite. */
  readonly unEnregistrementComplet: boolean;
  /** Une colonne au moins dont toutes les valeurs tiennent dans le vivier, sur toutes les
   *  rangées porteuses. */
  readonly colonnesDansLeVivierPartout: number;
};

const releves: Releve[] = [];
for (const fichier of process.argv.slice(2)) {
  const jeux = JSON.parse(readFileSync(fichier, "utf8")) as readonly Jeu[];
  for (const jeu of jeux)
    for (const page of jeu.pages) {
      const table = lireLaTable(page.mots);
      const porteuses = table.rangees
        .map((rangee, place) => ({ ...rangee, place }))
        .filter((rangee) => rangee.cellules.some((cellule) => cellule !== undefined));
      const hauteur = mediane(page.mots.map((mot) => mot.h));
      const suite = plusLongueSuiteAPasConstant(porteuses, hauteur);
      const pleines = suite.filter((rangee) => rangee.cellules.every((cellule) => cellule !== undefined));
      let dansLeVivier = 0;
      for (let colonne = 0; colonne < table.colonnes.length; colonne += 1) {
        const valeurs = suite
          .map((rangee) => rangee.cellules[colonne])
          .filter((valeur): valeur is number => valeur !== undefined);
        if (valeurs.length > 0 && valeurs.every((valeur) => valeur >= 1 && valeur <= jeu.vivier)) dansLeVivier += 1;
      }
      // La tolérance est le quart d'une hauteur de rangée : une rangée qui s'écarte de plus que
      // cela n'est plus sur la grille. Ce n'est pas un réglage — c'est ce que la page imprime.
      const grille = rangeesSurLaGrille(porteuses, suite, hauteur / 4);
      const placesDeLaGrille = new Set(grille.map((rangee) => rangee.place));
      const aRelireDeLaGrille = table.aRelire.filter((zone) => placesDeLaGrille.has(zone.rangee)).length;
      const placesDeLaSuite = new Set(suite.map((rangee) => rangee.place));
      const aRelireDeLaSuite = table.aRelire.filter((zone) => placesDeLaSuite.has(zone.rangee)).length;
      const unEnregistrementComplet = porteuses.some((rangee) =>
        rangee.cellules.every((cellule) => cellule !== undefined),
      );
      let dansLeVivierPartout = 0;
      for (let colonne = 0; colonne < table.colonnes.length; colonne += 1) {
        const valeurs = porteuses
          .map((rangee) => rangee.cellules[colonne])
          .filter((valeur): valeur is number => valeur !== undefined);
        if (valeurs.length > 0 && valeurs.every((valeur) => valeur >= 1 && valeur <= jeu.vivier))
          dansLeVivierPartout += 1;
      }
      const clef = `${jeu.jeu}/${page.page}`;
      if (releves.some((releve) => releve.clef === clef)) continue;
      releves.push({
        clef,
        verite: VERITE[clef],
        signalee: table.estUneTable,
        suite: suite.length,
        partPleinesDeLaSuite: suite.length === 0 ? 0 : pleines.length / suite.length,
        colonnesDansLeVivier: dansLeVivier,
        aRelire: table.aRelire.length,
        aRelireDeLaSuite,
        aRelireDeLaGrille,
        surLaGrille: grille.length,
        unEnregistrementComplet,
        colonnesDansLeVivierPartout: dansLeVivierPartout,
      });
    }
}

const REGLES: { readonly nom: string; readonly garde: (releve: Releve) => boolean }[] = [
  { nom: "R0 — l'actuelle", garde: (releve) => releve.signalee },
  {
    nom: "R1 — + une suite à pas constant",
    garde: (releve) => releve.signalee && releve.suite >= RANGEES_POUR_UNE_TABLE,
  },
  {
    nom: "R2 — R1 + une colonne dans le vivier",
    garde: (releve) => releve.signalee && releve.suite >= RANGEES_POUR_UNE_TABLE && releve.colonnesDansLeVivier >= 1,
  },
  {
    nom: "R3 — R1 + la moitié des rangées pleines",
    garde: (releve) =>
      releve.signalee && releve.suite >= RANGEES_POUR_UNE_TABLE && releve.partPleinesDeLaSuite >= 0.5,
  },
  {
    nom: "R4 — R1 + vivier + moitié pleines",
    garde: (releve) =>
      releve.signalee &&
      releve.suite >= RANGEES_POUR_UNE_TABLE &&
      releve.colonnesDansLeVivier >= 1 &&
      releve.partPleinesDeLaSuite >= 0.5,
  },
  {
    nom: "R5 — R1 + un enregistrement complet",
    garde: (releve) =>
      releve.signalee && releve.suite >= RANGEES_POUR_UNE_TABLE && releve.partPleinesDeLaSuite > 0,
  },
  {
    nom: "R6 — R5 + une colonne dans le vivier",
    garde: (releve) =>
      releve.signalee &&
      releve.suite >= RANGEES_POUR_UNE_TABLE &&
      releve.partPleinesDeLaSuite > 0 &&
      releve.colonnesDansLeVivier >= 1,
  },
  {
    nom: "R7 — un enregistrement complet + vivier",
    garde: (releve) =>
      releve.signalee && releve.unEnregistrementComplet && releve.colonnesDansLeVivierPartout >= 1,
  },
  {
    nom: "R7 sans l'enregistrement complet",
    garde: (releve) => releve.signalee && releve.colonnesDansLeVivierPartout >= 1,
  },
  {
    nom: "R7 sans le vivier",
    garde: (releve) => releve.signalee && releve.unEnregistrementComplet,
  },
  // Chaque critère doit gagner sa place : voici R6 privée d'un critère à la fois.
  {
    nom: "R6 sans la suite à pas constant",
    garde: (releve) => releve.signalee && releve.partPleinesDeLaSuite > 0 && releve.colonnesDansLeVivier >= 1,
  },
  {
    nom: "R6 sans l'enregistrement complet",
    garde: (releve) =>
      releve.signalee && releve.suite >= RANGEES_POUR_UNE_TABLE && releve.colonnesDansLeVivier >= 1,
  },
  {
    nom: "R6 sans le vivier",
    garde: (releve) =>
      releve.signalee && releve.suite >= RANGEES_POUR_UNE_TABLE && releve.partPleinesDeLaSuite > 0,
  },
];

const surImage = releves.filter((releve) => releve.verite?.source === "image");
const listes = surImage.filter((releve) => releve.verite!.quoi === "liste");
const fausses = surImage.filter((releve) => releve.verite!.quoi === "partition");

console.log(`${releves.length} page(s) lue(s) · ${surImage.length} de vérité confirmée à l'image`);
console.log(`  dont ${listes.length} liste(s) de pistes et ${fausses.length} partition(s)\n`);
console.log(
  `${"règle".padEnd(34)} ${"gardées".padStart(7)} ${"relire".padStart(7)} ${"suite".padStart(7)} ${"grille".padStart(7)} ` +
    `${"listes".padStart(8)} ${"partitions".padStart(11)}`,
);
for (const regle of REGLES) {
  const gardees = releves.filter((releve) => regle.garde(releve));
  const relire = gardees.reduce((somme, releve) => somme + releve.aRelire, 0);
  const relireSuite = gardees.reduce((somme, releve) => somme + releve.aRelireDeLaSuite, 0);
  const relireGrille = gardees.reduce((somme, releve) => somme + releve.aRelireDeLaGrille, 0);
  const listesGardees = listes.filter((releve) => regle.garde(releve)).length;
  const faussesGardees = fausses.filter((releve) => regle.garde(releve)).length;
  console.log(
    `${regle.nom.padEnd(34)} ${String(gardees.length).padStart(7)} ${String(relire).padStart(7)} ` +
      `${String(relireSuite).padStart(7)} ${String(relireGrille).padStart(7)} ${`${listesGardees}/${listes.length}`.padStart(8)} ${`${faussesGardees}/${fausses.length}`.padStart(11)}`,
  );
}

console.log("\nPage par page, sur la vérité confirmée à l'image :");
console.log(
  `${"page".padEnd(42)} ${"nature".padEnd(10)} ${"signalée".padStart(8)} ${"suite".padStart(5)} ` +
    `${"pleines".padStart(7)} ${"vivier".padStart(6)} relire`,
);
for (const releve of surImage.sort((un, autre) => (un.verite!.quoi < autre.verite!.quoi ? -1 : 1)))
  console.log(
    `${releve.clef.slice(0, 42).padEnd(42)} ${releve.verite!.quoi.padEnd(10)} ` +
      `${(releve.signalee ? "oui" : "non").padStart(8)} ${String(releve.suite).padStart(5)} ` +
      `${releve.partPleinesDeLaSuite.toFixed(2).padStart(7)} ${String(releve.colonnesDansLeVivier).padStart(6)} ${releve.aRelire} → suite ${releve.aRelireDeLaSuite} → grille ${releve.aRelireDeLaGrille} (${releve.surLaGrille} rangées)`,
  );

// Ce que la règle retenue garde encore, du plus cher au moins cher : c'est là que se décide
// s'il reste un critère à trouver.
const retenue = REGLES.find((regle) => regle.nom.startsWith("R7 —"))!;
console.log(`\nCe que « ${retenue.nom} » garde encore, du plus cher au moins cher :`);
for (const releve of releves
  .filter((r) => retenue.garde(r))
  .sort((un, autre) => autre.aRelire - un.aRelire)
  .slice(0, 30))
  console.log(
    `${releve.clef.slice(0, 44).padEnd(44)} ${String(releve.aRelire).padStart(5)} cases · suite ${String(releve.suite).padStart(3)} · ` +
      `pleines ${releve.partPleinesDeLaSuite.toFixed(2)} · vivier ${releve.colonnesDansLeVivier} · ${releve.verite?.quoi ?? "?"}`,
  );
