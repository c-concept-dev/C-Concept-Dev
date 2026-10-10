/** Combien de manières de lire faut-il écrire ? (lot E2, étape 4)
 *
 *     pnpm --filter @lienotheque/ingestion exec tsx mesures/familles.ts <inventaire.json>
 *
 *  Une manière de lire décrit où regarder sur une page : où se trouve le numéro imprimé, où
 *  commence le texte, à quoi ressemble un élément. Deux documents de même facture se lisent
 *  pareil ; deux documents de factures différentes ne se lisent pas pareil, et c'est tout ce
 *  qu'il faut savoir pour compter les recettes.
 *
 *  **On ne devine pas les familles, on les mesure.** Quatre traits suffisent à séparer ce qui se
 *  lit différemment : la **forme de la page**, la **densité de texte**, la **nature** —
 *  photographiée ou native —, et surtout **le nombre de numéros imprimés par feuille**.
 *
 *  Ce dernier a renversé un classement. Une famille de soixante-quatorze documents était rangée
 *  en « diaporama » parce que ses pages sont couchées ; elle portait pourtant quatre cent
 *  trente-six mots par page, ce qu'aucun diaporama ne fait. En cherchant les nombres isolés en
 *  bas de feuille, la réponse est apparue : **306 à gauche, 307 à droite**. Ce sont des livres
 *  scannés deux pages à la fois, et leur recette doit couper la feuille en deux.
 *
 *  Le banc ne décide pas du nombre de recettes : il montre les groupes et leur poids. Deux
 *  familles qui se lisent de la même façon peuvent partager une recette, et c'est à l'éditeur
 *  visuel de le dire — pas à un calcul.
 */
import { readFile } from "node:fs/promises";
import { objetsPdf, pagesPdf } from "@lienotheque/formats";
import { lireCoucheTexte } from "@lienotheque/lecteur-texte";

const chemin = process.argv[2];
if (chemin === undefined) {
  console.error("Attendu : <inventaire.json>");
  process.exit(2);
}

type Releve = { chemin: string; octets: number; empreinte: string; pages: number; format: string };
const inventaire = JSON.parse(await readFile(chemin, "utf8")) as { dossier: string; releves: Releve[] };
const distincts = [...new Map(inventaire.releves.map((r) => [r.empreinte, r])).values()];

const median = (valeurs: readonly number[]): number => {
  if (valeurs.length === 0) return 0;
  const triees = [...valeurs].sort((a, b) => a - b);
  return triees[Math.floor(triees.length / 2)]!;
};

type Trait = {
  readonly releve: Releve;
  /** Largeur sur hauteur. Au-dessus de 1, la page est couchée : un diaporama, pas un livre. */
  readonly forme: number;
  readonly motsParPage: number;
  readonly photographiee: boolean;
  readonly famille: string;
  readonly doublePage?: boolean;
};

const traits: Trait[] = [];
for (const [rang, releve] of distincts.entries()) {
  if (releve.format !== ".pdf") {
    traits.push({ releve, forme: 0, motsParPage: 0, photographiee: false, famille: "sans pages fixes" });
    continue;
  }
  try {
    const donnees = await readFile(releve.chemin);
    const pages = pagesPdf(objetsPdf(donnees));
    if (pages.length === 0) {
      traits.push({ releve, forme: 0, motsParPage: 0, photographiee: false, famille: "illisible" });
      continue;
    }
    const couche = await lireCoucheTexte(releve.chemin);
    const echantillon = [...Array(Math.min(5, couche.pages.length)).keys()].map((n) =>
      Math.floor((n * (couche.pages.length - 1)) / Math.max(1, Math.min(5, couche.pages.length) - 1)),
    );
    const lues = echantillon.map((r) => couche.pages[r]).filter((p) => p !== undefined);
    const forme = median(lues.map((p) => p.largeur / Math.max(p.hauteur, 1)));
    const motsParPage = median(lues.map((p) => p.mots.length));
    const photographiee = pages.filter((p) => p.images.length > 0).length > pages.length / 2;

    // Deux numéros imprimés sur la même feuille, un de chaque côté, qui se suivent : la feuille
    // porte deux pages. C'est un fait qu'on lit, pas une proportion qu'on interprète.
    const doublePage =
      lues.filter((p) => {
        const nombres = p.mots
          .filter((m) => /^\d{1,4}$/.test(m.texte) && m.y > p.hauteur * 0.82)
          .map((m) => ({ valeur: Number(m.texte), gauche: m.x < p.largeur / 2 }));
        // Deux numéros de part et d'autre suffisent. Exiger qu'ils se suivent rendait le
        // contrôle trop strict : il suffit que l'un des deux soit mal lu — et sur un scan, cela
        // arrive — pour qu'une double page passe pour une simple. On rend donc deux verdicts :
        // ceux qui se suivent, qui sont sûrs, et ceux qui se font face, qui sont probables.
        const face = nombres.some((a) => nombres.some((b) => a.gauche && !b.gauche));
        const suite = nombres.some((a) => nombres.some((b) => a.gauche && !b.gauche && b.valeur === a.valeur + 1 && a.valeur > 1));
        return face || suite;
      }).length >
      lues.length / 2;

    const famille = !photographiee
      ? "natif"
      : doublePage
        ? "livre photographié, deux pages par feuille"
        : motsParPage < 150
          ? "feuillet photographié"
          : "livre photographié, une page par feuille";
    traits.push({ releve, forme, motsParPage, photographiee, famille, doublePage });
  } catch {
    traits.push({ releve, forme: 0, motsParPage: 0, photographiee: false, famille: "illisible" });
  }
  if ((rang + 1) % 25 === 0) console.error(`  ${rang + 1} / ${distincts.length}`);
}

const familles = new Map<string, Trait[]>();
for (const trait of traits) familles.set(trait.famille, [...(familles.get(trait.famille) ?? []), trait]);

console.log(`\n## Les familles de mise en page — ${new Date().toISOString().slice(0, 10)}\n`);
console.log("| Famille | Documents | Pages | Forme | Mots par page |");
console.log("|---|---:|---:|---:|---:|");
for (const [nom, membres] of [...familles.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const pages = membres.reduce((s, m) => s + m.releve.pages, 0);
  const avecForme = membres.filter((m) => m.forme > 0);
  console.log(
    `| ${nom} | ${membres.length} | ${pages} | ${avecForme.length === 0 ? "—" : median(avecForme.map((m) => m.forme)).toFixed(2)} | ` +
      `${avecForme.length === 0 ? "—" : Math.round(median(avecForme.map((m) => m.motsParPage)))} |`,
  );
}

for (const [nom, membres] of [...familles.entries()].sort((a, b) => b[1].length - a[1].length)) {
  if (nom === "sans pages fixes") continue;
  console.log(`\n### ${nom} — ${membres.length} document(s)\n`);
  const montres = [...membres].sort((a, b) => b.releve.pages - a.releve.pages).slice(0, 6);
  console.log("| Document | Pages | Mots/page |");
  console.log("|---|---:|---:|");
  for (const m of montres)
    console.log(
      `| ${m.releve.chemin.slice(inventaire.dossier.length + 1, inventaire.dossier.length + 50)} | ${m.releve.pages} | ${Math.round(m.motsParPage)} |`,
    );
  if (membres.length > 6) console.log(`| … et ${membres.length - 6} autres | | |`);
}
