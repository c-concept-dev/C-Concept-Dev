/** Le titre porté par un nom de fichier se retrouve-t-il dans les pages ? (REC-02, OUT-10)
 *
 *  Hypothèse de Christophe, le 6 novembre 2026, **à éprouver et non à adopter** : le titre d'un
 *  enregistrement se lit à **deux endroits** du document — dans le sommaire, qui lui donne un
 *  folio, et en tête de sa propre page, qui lui donne une feuille. Ce sont deux faits distincts,
 *  et ils pourraient faire les **deux lectures** que la corroboration exige.
 *
 *  Pourquoi cela manque aujourd'hui : la chaîne confronte déjà les noms aux pages
 *  (`accordsNomContenu`), mais tout ce qu'elle en tire porte la **même** sorte —
 *  `corroboration_media` — et `corroborationDesLignes` demande deux sortes distinctes. Un signal
 *  qui se répète n'est pas deux signaux ; deux endroits du document, peut-être.
 *
 *  Ce programme ne décide rien. Il compte, pour chaque enregistrement : où son titre se lit, et
 *  si l'une de ces pages porte aussi d'autres titres — ce qui est la forme d'un sommaire.
 *
 *  Lecture seule, aucun appel en ligne.
 *
 *  Usage : le-titre-du-nom-dans-les-pages.ts <mots.json> <entiers/>
 */
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { lignesDeMots, valeurDeCellule, type MotLu } from "@lienotheque/noyau";

type PageGardee = { readonly page: number; readonly largeur: number; readonly mots: readonly MotLu[] };
type Jeu = { readonly jeu: string; readonly vivier: number; readonly pagesDuDocument: number; readonly pages: readonly PageGardee[] };

const [fichierMots, racine] = process.argv.slice(2);
if (fichierMots === undefined || racine === undefined) {
  console.error("usage : le-titre-du-nom-dans-les-pages.ts <mots.json> <entiers/>");
  process.exit(2);
}

/** Les lettres et les chiffres d'un texte, en minuscules, espaces réduits. Rien de plus : la
 *  reconnaissance rend « Song For My Father. » là où le nom dit « Song For My Father ». */
const normaliser = (texte: string): string =>
  texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Ce qu'un nom de fichier dit après son numéro de tête. « 02 - Song For My Father » → « song
 *  for my father ». Sans motif écrit à la main : on retire ce qui précède le premier séparateur,
 *  quand ce qui précède est un nombre. */
function titreDuNom(nom: string): string {
  const base = basename(nom).replace(/\.[^.]+$/u, "");
  const sepere = /^\s*\d+\s*[-.)_]\s*(.+)$/u.exec(base);
  return normaliser(sepere?.[1] ?? base);
}

const jeux = JSON.parse(readFileSync(fichierMots, "utf8")) as readonly Jeu[];
for (const jeu of jeux) {
  const inventaire = JSON.parse(readFileSync(join(racine, jeu.jeu, "inventaire.json"), "utf8")) as readonly {
    nom: string;
  }[];
  const titres = inventaire.map((media) => ({ nom: basename(media.nom), titre: titreDuNom(media.nom) }));
  // Le texte de chaque page, normalisé une fois.
  const pages = jeu.pages.map((page) => ({
    page: page.page,
    texte: normaliser(page.mots.map((mot) => mot.texte).join(" ")),
    // Les premières lignes : un titre de morceau s'imprime en tête de sa page.
    tete: normaliser(
      lignesDeMots(page.mots)
        .slice(0, 3)
        .flatMap((ligne) => ligne.mots.map((mot) => mot.texte))
        .join(" "),
    ),
    nombres: page.mots.filter((mot) => valeurDeCellule(mot.texte) !== undefined).length,
  }));

  const ou = titres.map(({ nom, titre }) => {
    if (titre.length < 3) return { nom, titre, pages: [], tetes: [] };
    const trouvees = pages.filter((page) => page.texte.includes(titre));
    return {
      nom,
      titre,
      pages: trouvees.map((page) => page.page),
      tetes: trouvees.filter((page) => page.tete.includes(titre)).map((page) => page.page),
    };
  });

  // Une page de sommaire : celle où le plus de titres se lisent ensemble.
  const parPage = new Map<number, number>();
  for (const entree of ou) for (const page of entree.pages) parPage.set(page, (parPage.get(page) ?? 0) + 1);
  const sommaire = [...parPage.entries()].sort((un, autre) => autre[1] - un[1])[0];

  const lus = ou.filter((entree) => entree.pages.length > 0);
  const enTete = ou.filter((entree) => entree.tetes.length > 0);
  const deuxEndroits = ou.filter(
    (entree) => sommaire !== undefined && entree.pages.includes(sommaire[0]) && entree.tetes.some((page) => page !== sommaire[0]),
  );

  console.log(`\n── ${jeu.jeu} — ${titres.length} enregistrement(s), ${jeu.pages.length} page(s) ──`);
  console.log(
    `   titre lu quelque part : ${lus.length}/${titres.length} · en tête d'une page : ${enTete.length} · ` +
      `page qui en porte le plus : ${sommaire === undefined ? "aucune" : `p${sommaire[0]} (${sommaire[1]} titres)`}`,
  );
  console.log(`   dont sur la page qui en porte le plus ET en tête d'une autre : ${deuxEndroits.length}`);

  // ── La force du signal unique ──────────────────────────────────────────────────────────────
  //
  // Les pages liminaires — couverture, sommaire, introduction — nomment les morceaux sans dire
  // où ils sont. Un titre qui ne se lit que là n'a pas trouvé sa page.
  //
  // L'ordre sert ici à **juger** quelle page est la bonne, et à rien d'autre : ce n'est pas un
  // second signal, et le compter comme tel affaiblirait la règle des deux lectures sans le dire
  // (mise en garde de Christophe, 6 novembre 2026).
  // Une page qui nomme beaucoup de titres **parle du document** — couverture, sommaire,
  // introduction, discographie. Elle ne porte pas un morceau, et un titre qui ne se lit que là
  // n'a pas trouvé sa page. Le critère est une part, non un nombre choisi : la moitié des
  // enregistrements nommés sur une même page, c'est une liste, pas une partition.
  const liminaires = new Set(
    [...parPage.entries()].filter(([, combien]) => combien * 2 >= titres.length).map(([page]) => page),
  );
  const propres = ou.map((entree) => ({
    ...entree,
    siennes: entree.pages.filter((page) => !liminaires.has(page)),
  }));
  const uniques = propres.filter((entree) => entree.siennes.length === 1);
  const plusieurs = propres.filter((entree) => entree.siennes.length > 1);
  const nullePart = propres.filter((entree) => entree.siennes.length === 0);
  // L'ordre : les pages propres suivent-elles l'ordre des enregistrements ?
  const suite = propres.flatMap((entree) => (entree.siennes.length >= 1 ? [Math.min(...entree.siennes)] : []));
  const croissant = suite.every((page, rang) => rang === 0 || page >= suite[rang - 1]!);
  console.log(
    `   **une seule page propre : ${uniques.length} · plusieurs : ${plusieurs.length} · aucune : ${nullePart.length}** ` +
      `· l'ordre des pages suit celui des pistes : ${croissant ? "oui" : "non"}`,
  );
  if (nullePart.length > 0)
    console.log(`      sans page : ${nullePart.map((entree) => entree.nom.slice(0, 26)).join(" · ")}`);
  for (const entree of ou.slice(0, 14))
    console.log(
      `      ${entree.nom.slice(0, 36).padEnd(36)} « ${entree.titre.slice(0, 28).padEnd(28)} » ` +
        `pages ${entree.pages.join(",") || "—"} · tête ${entree.tetes.join(",") || "—"}`,
    );
}
