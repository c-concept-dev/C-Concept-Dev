// @vitest-environment node
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { demandeDeTraitement, executerTravail, lireLeTexte } from "../src/index.js";

/** Un document dont rien n'a pu être lu n'est pas un document traité (JOB-05, OUT-15).
 *
 *  Mesuré sur le corpus réel : un ouvrage de neuf cent quatre-vingt-onze pages a été annoncé
 *  « terminé » en cinq secondes, avec zéro page et zéro élément. C'est la faute la plus coûteuse
 *  de sa famille parce qu'elle **passe** : elle franchit les contrôles, part dans la
 *  bibliothèque, et ne se découvre qu'à la recherche, quand il n'y a rien à trouver.
 *
 *  Deux chemins mènent à un document lu, et il suffit qu'un seul aboutisse : la chaîne d'images,
 *  qui ne voit que les pages portant une image, et la lecture du texte, qui sert un document
 *  natif entièrement. L'échec n'est donc dû que lorsque les **deux** sont revenus vides.
 *
 *  La fixture est fabriquée ici, en quelques lignes : un PDF de deux pages sans contenu. Une
 *  version antérieure de ce contrôle pointait une recette de `fixtures/` qui a été retirée une
 *  heure plus tard — il est alors passé « sauté », et un contrôle vert qui ne tourne pas ne
 *  prouve rien. Celui-ci ne peut pas l'être.
 */

const RACINE = join(import.meta.dirname, "../../..");
const RECETTE = join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json");
const DESCRIPTION = join(RACINE, "fixtures/bibliotheques/F3.json");

const bac = mkdtempSync(join(tmpdir(), "lienotheque-aucune-page-"));
afterAll(() => rmSync(bac, { recursive: true, force: true }));

/** Un PDF de `combien` pages vides : ni couche texte, ni image. Rien à lire, et c'est voulu. */
function pdfSansRien(combien: number): string {
  const objets: string[] = [];
  const ajouter = (contenu: string): number => objets.push(contenu);

  const catalogue = ajouter("");
  const racinePages = ajouter("");
  const pages = Array.from({ length: combien }, () =>
    ajouter(`<< /Type /Page /Parent ${racinePages} 0 R /MediaBox [0 0 595 842] /Resources << >> >>`),
  );
  objets[catalogue - 1] = `<< /Type /Catalog /Pages ${racinePages} 0 R >>`;
  objets[racinePages - 1] = `<< /Type /Pages /Count ${combien} /Kids [${pages.map((n) => `${n} 0 R`).join(" ")}] >>`;

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

  const chemin = join(bac, `vide-${combien}.pdf`);
  writeFileSync(chemin, corps, "latin1");
  return chemin;
}

/** Deux contrôles, et non un seul, et ce n'est pas un détail de présentation (lot 16b).
 *
 *  Les deux affirmations ci-dessous sont indépendantes : l'une porte sur la lecture ordinaire,
 *  l'autre sur la feuille double. Chacune demande **sa** lecture du document. Rassemblées en un
 *  contrôle, elles payaient leurs deux lectures contre **un seul** délai de 5 000 ms — 2 493 ms de
 *  corps ici, et 4 842 ms sur le coureur macOS, soit une marge de ×1,03 : la plus courte du
 *  dépôt, et un rouge qui n'attendait qu'une machine chargée.
 *
 *  Séparées, chacune a son délai, et rien n'est affaibli : les mêmes assertions, sur le même
 *  document, avec le même travail réel. Ce qui change est qu'un délai borne désormais **une**
 *  lecture.
 *
 *  ## Pourquoi une page vide coûte deux cent quarante millisecondes
 *
 *  Mesuré le 10 novembre 2026, et c'est voulu. Une page sans image dont la couche de texte est
 *  insuffisante **n'est pas tenue pour vide** : `texte.ts` la rend entière par pdf.js, à 1 800
 *  pixels, et la donne à la reconnaissance. Prouvé par l'exécution — un faux `tesseract` placé en
 *  tête du chemin journalise **cinq appels, un par page**, avant de déléguer au vrai. La raison
 *  est écrite là où la décision se prend : les objets compressés de treize PDF réels échappent au
 *  lecteur structurel, alors que pdf.js rend parfaitement leur page. Tenir ces pages pour vides
 *  les perdrait.
 *
 *  Le coût est donc **linéaire et assumé** : 240 ms par page vide, mesuré sur 1, 5 et 20 pages
 *  (240, 1 200 et 4 909 ms). On ne le réduit pas en rognant le produit ; on cesse d'en payer deux
 *  fois le prix contre un seul délai. */
/** Trois feuilles, et non cinq.
 *
 *  Le nombre ne porte aucun sens : « trois, pas six » distingue une feuille d'une page exactement
 *  comme « cinq, pas dix ». Il porte un **prix**, lui : 240 ms par page vide, soit 480 ms de
 *  corps économisés par contrôle sur cette machine, et près du double sur le coureur. Baisser ce
 *  chiffre ne retire donc rien à la preuve ; le garder coûtait la marge. */
const TROIS_FEUILLES = 3;

describe("ce qu'on compte quand une page n'a rien rendu (OUT-05, OUT-15)", () => {
  it("compte des pages, une par feuille, et n'en invente aucune", async () => {
    const simple = await lireLeTexte(pdfSansRien(TROIS_FEUILLES), {});

    expect(simple.sansTexte, "trois pages vides font trois pages sans texte").toBe(3);

    // Les pages restent celles du document. Ce contrôle tenait l'inverse jusqu'au
    // 2 novembre 2026 — « aucune page de texte ne sort d'une feuille vide » — et le prix en a
    // été mesuré sur la bibliothèque entière : 46 documents sur 250 décrivaient un document plus
    // court qu'il n'est, et tout ce qui s'aligne sur leurs pages écartait leur texte **en bloc**,
    // l'un d'eux pour une seule page blanche sur trois cent soixante-six.
    //
    // Rien n'est inventé pour autant, et c'est la ligne d'après qui le dit : ces pages ne
    // portent aucun texte, donc aucune n'entre dans ce qui se cherche.
    expect(simple.pages.map((page) => page.index), "trois feuilles, trois pages").toEqual([1, 2, 3]);
    expect(simple.pages.every((page) => page.texte === "")).toBe(true);
  });

  it("n'en double pas le nombre sur une feuille double", async () => {
    const double = await lireLeTexte(pdfSansRien(TROIS_FEUILLES), { doublePage: true });

    // `sansTexte` est documenté « combien de pages n'ont rien rendu ». Il s'incrémentait de deux
    // par feuille double, là où `parLaCouche` et `parOcr` s'incrémentent d'une par page : la
    // même phrase du journal mêlait alors deux unités. Mesuré sur un livre de quatre-vingt-seize
    // pages, elle annonçait « 27 passage(s) : 0 par la couche texte, 14 par reconnaissance,
    // 164 sans texte » — un total de 178 pour 96 pages. Le compte juste était 82 pages, doublé.
    expect(double.sansTexte, "une feuille double reste une feuille : trois, pas six").toBe(3);

    // Les pages logiques, elles, doublent bien : c'est la feuille qui ne double pas.
    expect(double.pages, "trois feuilles doubles, six pages logiques").toHaveLength(6);
    expect(double.pages.every((page) => page.texte === "")).toBe(true);
  });
});

describe("un document dont rien n'a pu être lu", () => {
  it("échoue en nommant le nombre de pages, au lieu de se dire terminé (JOB-05)", async () => {
    expect(existsSync(RECETTE), "la recette de référence doit exister, sinon ce contrôle ne prouve rien").toBe(true);

    const dits: string[] = [];
    const message = await executerTravail(
      demandeDeTraitement(randomUUID(), randomUUID(), {
        document: pdfSansRien(7),
        medias: bac,
        recette: RECETTE,
        description: DESCRIPTION,
      }),
      { emettre: (m) => (m.type === "journal" ? dits.push(m.texte) : undefined) },
    );

    expect(message.type, `la chaîne a conclu : ${JSON.stringify(message).slice(0, 200)}`).toBe("echec");
    if (message.type !== "echec") return;

    // Le nombre de pages doit figurer dans la cause : « rien n'a été lu » n'aide personne,
    // « aucune des 7 pages » dit à la fois l'ampleur et que le document n'était pas vide.
    expect(message.cause).toContain("7");
    // Et la cause doit dire que les deux chemins ont été tentés, sans quoi on soupçonne le
    // mauvais : « cette manière de lire ne convient pas » envoie régler une recette, quand le
    // problème est que le document n'a ni texte ni image.
    expect(message.cause).toMatch(/couche texte/i);
    // Rien à reprendre : relancer la même manière de lire sur le même document relira zéro page.
    expect(message.reprisePossible, "une reprise relirait zéro page").toBe(false);
    expect(dits.some((texte) => texte.includes("7 pages dans le document"))).toBe(true);
  }, 120_000);
});
