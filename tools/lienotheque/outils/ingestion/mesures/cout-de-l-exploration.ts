/** Ce que l'exploration de la voie oracle coûte, et où ce coût passe.
 *
 *  POURQUOI CE PROGRAMME
 *
 *  L'entrée 14 de la file dit : « comprendre pourquoi chaque contrôle prend ~80 s, et réduire ce
 *  coût ». Le registre portait une hypothèse — le budget d'exploration, dimensionné pour la
 *  production, hérité sans borne par 22 des 27 appels du fichier de contrôle. Elle explique le cas
 *  de la machine affamée (3 956 s, le budget exactement), mais pas les 80 à 160 s ordinaires :
 *  le commentaire de `BUDGET_EXPLORATION` dit que sur vingt documents réels l'exploration
 *  « s'arrête d'elle-même, bornée par le contenu ». Le budget n'est donc pas atteint.
 *
 *  Ce programme mesure, au lieu de supposer : le temps, les essais, les reconnaissances avec et
 *  sans élagage, et ce que le journal dit de l'arrêt. On le relance après la réduction, sur le
 *  même document, et les deux relevés se comparent.
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx mesures/cout-de-l-exploration.ts
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rejouerParOracle } from "../src/index.js";
import { nouveauMemoDeReconnaissance } from "@lienotheque/recettes";

/** Où les PDF fabriqués sont écrits. `pdfDePages`, reprise du fichier de contrôle, l'attend
 *  sous ce nom. */
const bac = mkdtempSync(join(tmpdir(), "lienotheque-mesure-pdf-"));

/** Un PDF dont chaque page porte le contenu donné, en coordonnées PDF (origine en bas à gauche). */
function pdfDePages(
  nom: string,
  contenus: readonly string[],
  dimensions: { readonly largeur: number; readonly hauteur: number } = { largeur: 595, hauteur: 842 },
): string {
  const objets: string[] = [];
  const ajouter = (contenu: string): number => objets.push(contenu);

  const catalogue = ajouter("");
  const racinePages = ajouter("");
  const police = ajouter("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pages = contenus.map((contenu) => {
    const flux = ajouter(`<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`);
    return ajouter(
      `<< /Type /Page /Parent ${racinePages} 0 R /MediaBox [0 0 ${dimensions.largeur} ${dimensions.hauteur}]` +
        ` /Resources << /Font << /F1 ${police} 0 R >> >> /Contents ${flux} 0 R >>`,
    );
  });
  objets[catalogue - 1] = `<< /Type /Catalog /Pages ${racinePages} 0 R >>`;
  objets[racinePages - 1] =
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((n) => `${n} 0 R`).join(" ")}] >>`;

  let corps = "%PDF-1.4\n";
  const decalages: number[] = [];
  objets.forEach((objet, rang) => {
    decalages.push(corps.length);
    corps += `${rang + 1} 0 obj\n${objet}\nendobj\n`;
  });
  const xref = corps.length;
  corps += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) corps += `${String(d).padStart(10, "0")} 00000 n \n`;
  corps += `trailer\n<< /Size ${objets.length + 1} /Root ${catalogue} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const chemin = join(bac, nom);
  writeFileSync(chemin, corps, "latin1");
  return chemin;
}

/** Un pavé sombre portant un nombre en clair, à l'abscisse `x` : la forme même d'une marque. */
const marque = (x: number, y: number, valeur: number): string =>
  `0 g ${x} ${y} 54 34 re f 1 g BT /F1 22 Tf ${x + 12} ${y + 9} Td (${valeur}) Tj ET`;

/** Un intitulé imprimé, assez gros pour être du titre : ce que la couche texte doit rendre. */
const titre = (y: number, texte: string): string => `0 g BT /F1 18 Tf 120 ${y} Td (${texte}) Tj ET`;

/** Du texte ordinaire, en noir : ce qui doit rester du texte et non devenir une marque. */
const prose = (y: number): string => `0 g BT /F1 12 Tf 180 ${y} Td (une page ordinaire de ce document) Tj ET`;

const dossier = mkdtempSync(join(tmpdir(), "lienotheque-mesure-exploration-"));
const vivier = [{ nom: "01 - a.mp3", empreinte: "a".repeat(64), provenances: ["lot:mesure"] }];
const commun = { inventaireMedias: vivier, provenancesMedias: ["lot:mesure"] } as const;

/** Les deux documents des contrôles les plus lents : l'un sans aucune marque, l'autre marqué.
 *  Le premier est le pire cas — rien à trouver, donc tous les endroits éprouvés. */
const documents = [
  {
    nom: "prose seule, aucune marque — le document du contrôle le plus lent",
    pdf: () => pdfDePages("mesure-prose.pdf", [prose(700), prose(500), prose(300), prose(200)]),
  },
  {
    nom: "quatre pages marquées — le document des contrôles d'acquis",
    pdf: () =>
      pdfDePages(
        "mesure-marques.pdf",
        [0, 1, 2, 3].map((rang) => [marque(70, 620, rang * 2 + 1), marque(70, 320, rang * 2 + 2), prose(760)].join("\n")),
      ),
  },
];

try {
  for (const document of documents) {
    const pdf = document.pdf();
    const depart = Date.now();
    const memo = nouveauMemoDeReconnaissance();
    const rejeu = await rejouerParOracle(pdf, dossier, { ...commun, memoDeReconnaissance: memo });
    const millisecondes = Date.now() - depart;

    // LE COÛT FIXE, SÉPARÉ DU COÛT PAR ESSAI
    //
    // La même lecture bornée à UN essai : ce qu'elle coûte est ce que le document coûte avant
    // toute exploration — rendre les pages, lire leur couche texte, détecter les formes. La
    // différence entre les deux est le prix des essais. Sans cette séparation, « 80 s » ne dit
    // pas où agir : on pourrait supprimer tous les essais et ne rien gagner.
    const departUnEssai = Date.now();
    await rejouerParOracle(document.pdf(), dossier, { ...commun, budgetExploration: { paires: 1, secondes: 3600 } });
    const fixe = Date.now() - departUnEssai;
    const dit = rejeu.journal.join("\n");
    const essais = /exploration arrêtée après (\d+) essai\(s\) sur les (\d+)/.exec(dit);
    const elagage = /(\d+) reconnaissance\(s\)[^\n]*?(\d+)/.exec(dit);
    console.log(`\n── ${document.nom} ──`);
    console.log(`  temps complet         ${(millisecondes / 1000).toFixed(1)} s`);
    console.log(`  dont coût fixe        ${(fixe / 1000).toFixed(1)} s  (un seul essai : rendu, couche texte, formes)`);
    console.log(`  dont les essais       ${((millisecondes - fixe) / 1000).toFixed(1)} s`);
    console.log(`  reconnaissances       ${memo.faites} faites, ${memo.servies} servies par le mémo ` +
      `(${((memo.servies / Math.max(1, memo.faites + memo.servies)) * 100).toFixed(0)} % évitées)`);
    console.log(`  essais                ${essais === null ? "—" : `${essais[1]} sur ${essais[2]} possibles`}`);
    console.log(`  reconnaissances       ${elagage === null ? "— (non dit)" : elagage[0]}`);
    console.log(`  abstention            ${rejeu.resultat.abstention?.raison ?? "aucune"}`);
    for (const ligne of rejeu.journal.filter((l) => /reconnaissance|essai|élagage|endroit retenu|arrêtée/.test(l)))
      console.log(`    · ${ligne.trim().slice(0, 150)}`);
  }
} finally {
  rmSync(dossier, { recursive: true, force: true });
  rmSync(bac, { recursive: true, force: true });
}
