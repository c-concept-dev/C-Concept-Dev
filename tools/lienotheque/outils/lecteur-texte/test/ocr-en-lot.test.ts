// @vitest-environment node
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyserTsvEnLot, lireParOcrEnLot } from "../src/ocr.js";

/** Lire plusieurs images en **un seul appel** de l'outil de reconnaissance (lot 14 bis, D7).
 *
 *  ## Pourquoi, et combien cela vaut
 *
 *  Mesuré le 11 novembre 2026 : un contrôle de lecture passe **33,9 de ses 49,2 secondes** dans
 *  `tesseract`, en **920 appels** — un processus par image. Sur vingt-quatre images identiques,
 *  **70 ms l'image en appels séparés contre 8 ms en un appel groupé** : près de **90 % du coût
 *  est le démarrage du processus**, et le regroupement rend ×8,6.
 *
 *  Et il n'y avait rien à retirer : sur les 99 fenêtres du contrôle, ôter la seule cinquième
 *  valeur de seuil — 128 appels sur 920 — change déjà **douze** votes gagnants. Les dimensions
 *  de lecture gagnent toutes leur place ; c'est le **nombre de processus** qui est de trop.
 *
 *  ## Ce que ce module doit garantir, et que ces épreuves tiennent
 *
 *  Un appel groupé rend une sortie unique pour plusieurs images. Trois choses peuvent donc mal
 *  tourner, et aucune ne doit passer en silence : l'appel échoue en entier, il rend **moins** de
 *  résultats qu'on n'a envoyé d'images, ou son délai de sécurité se trouve réparti sur un lot
 *  alors qu'il avait été mesuré pour une image.
 *
 *  Le faux binaire suffit à tout éprouver : ce qu'on juge est le **protocole**, pas la
 *  reconnaissance. */

let bac: string;
/** Un outil qui rend un TSV groupé conforme : une en-tête, puis `page_num` 1, 2, 3… */
let groupeur: string;
/** Un outil qui rend **deux** pages quoi qu'on lui envoie : le trou silencieux à attraper. */
let avare: string;
/** Un outil qui refuse une liste et n'accepte qu'une image à la fois. */
let refuseLesListes: string;
/** Un outil qui dort : pour éprouver le délai. */
let muetAuMilieu: string;
let sauteLeMilieu: string;
let dormeur: string;

const ENTETE = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const ligne = (page: number, texte: string) => `5\t${page}\t1\t1\t1\t1\t10\t20\t30\t40\t88.5\t${texte}`;

beforeAll(() => {
  bac = mkdtempSync(join(tmpdir(), "lienotheque-ocr-lot-"));
  const poser = (nom: string, corps: string): string => {
    const chemin = join(bac, nom);
    writeFileSync(chemin, corps);
    chmodSync(chemin, 0o755);
    return chemin;
  };
  // Le premier argument est soit une image, soit une liste de chemins : l'outil compte ses lignes.
  groupeur = poser(
    "groupeur",
    `#!/bin/sh
case "$1" in
  *.txt) n=$(wc -l < "$1" | tr -d ' ') ;;
  *) n=1 ;;
esac
printf '%s\\n' "${ENTETE}"
i=1
while [ "$i" -le "$n" ]; do
  printf '1\\t%s\\t0\\t0\\t0\\t0\\t0\\t0\\t250\\t180\\t-1\\t\\n' "$i"
  printf '5\\t%s\\t1\\t1\\t1\\t1\\t10\\t20\\t30\\t40\\t88.5\\tmot%s\\n' "$i" "$i"
  i=$((i + 1))
done
`,
  );
  avare = poser(
    "avare",
    `#!/bin/sh
printf '%s\\n' "${ENTETE}"
printf '1\\t1\\t0\\t0\\t0\\t0\\t0\\t0\\t250\\t180\\t-1\\t\\n'
printf '5\\t1\\t1\\t1\\t1\\t1\\t10\\t20\\t30\\t40\\t88.5\\tun\\n'
printf '1\\t2\\t0\\t0\\t0\\t0\\t0\\t0\\t250\\t180\\t-1\\t\\n'
printf '5\\t2\\t1\\t1\\t1\\t1\\t10\\t20\\t30\\t40\\t88.5\\tdeux\\n'
`,
  );
  refuseLesListes = poser(
    "refuse-les-listes",
    `#!/bin/sh
case "$1" in
  *.txt) exit 1 ;;
esac
printf '%s\\n' "${ENTETE}"
printf '5\\t1\\t1\\t1\\t1\\t1\\t10\\t20\\t30\\t40\\t88.5\\tseul\\n'
`,
  );
  // Trois lignes de page, mais un mot seulement sur la première et la troisième : c'est ce que
  // Tesseract rend d'une image blanche au milieu d'un lot — mesuré sur la vraie sortie.
  muetAuMilieu = poser(
    "muet-au-milieu",
    `#!/bin/sh
printf '%s\\n' "${ENTETE}"
printf '1\\t1\\t0\\t0\\t0\\t0\\t0\\t0\\t250\\t180\\t-1\\t\\n'
printf '5\\t1\\t1\\t1\\t1\\t1\\t10\\t20\\t30\\t40\\t88.5\\tun\\n'
printf '1\\t2\\t0\\t0\\t0\\t0\\t0\\t0\\t250\\t180\\t-1\\t\\n'
printf '1\\t3\\t0\\t0\\t0\\t0\\t0\\t0\\t250\\t180\\t-1\\t\\n'
printf '5\\t3\\t1\\t1\\t1\\t1\\t10\\t20\\t30\\t40\\t88.5\\ttrois\\n'
`,
  );
  // La même sortie, mais SANS la ligne de page du milieu : l'image a été sautée, pas lue blanche.
  sauteLeMilieu = poser(
    "saute-le-milieu",
    `#!/bin/sh
case "$1" in
  *.txt) printf '%s\\n' "${ENTETE}"
    printf '1\\t1\\t0\\t0\\t0\\t0\\t0\\t0\\t250\\t180\\t-1\\t\\n'
    printf '5\\t1\\t1\\t1\\t1\\t1\\t10\\t20\\t30\\t40\\t88.5\\tun\\n'
    printf '1\\t3\\t0\\t0\\t0\\t0\\t0\\t0\\t250\\t180\\t-1\\t\\n'
    printf '5\\t3\\t1\\t1\\t1\\t1\\t10\\t20\\t30\\t40\\t88.5\\ttrois\\n'
    exit 0 ;;
esac
printf '%s\\n' "${ENTETE}"
printf '1\\t1\\t0\\t0\\t0\\t0\\t0\\t0\\t250\\t180\\t-1\\t\\n'
printf '5\\t1\\t1\\t1\\t1\\t1\\t10\\t20\\t30\\t40\\t88.5\\tseul\\n'
`,
  );
  dormeur = poser("dormeur", "#!/bin/sh\nsleep 30\n");
});
afterAll(() => rmSync(bac, { recursive: true, force: true }));

const troisImages = () => [
  { chemin: join(bac, "a.pgm"), largeur: 10, hauteur: 20 },
  { chemin: join(bac, "b.pgm"), largeur: 11, hauteur: 21 },
  { chemin: join(bac, "c.pgm"), largeur: 12, hauteur: 22 },
];

describe("un TSV groupé se découpe par image (lot 14 bis)", () => {
  it("rend une liste de mots par page, dans l'ordre de la liste envoyée", () => {
    const tsv = [ENTETE, ligne(1, "un"), ligne(2, "deux"), ligne(2, "encore"), ligne(3, "trois")].join("\n");
    const pages = analyserTsvEnLot(tsv, 3);
    expect(pages).toHaveLength(3);
    expect(pages[0]?.map((mot) => mot.texte)).toEqual(["un"]);
    expect(pages[1]?.map((mot) => mot.texte)).toEqual(["deux", "encore"]);
    expect(pages[2]?.map((mot) => mot.texte)).toEqual(["trois"]);
  });

  it("rend une liste VIDE pour une image que l'outil n'a pas nommée, et non un décalage", () => {
    // Une image sans un mot lisible ne produit aucune ligne. Si l'on se contentait de grouper ce
    // qui arrive, la troisième image hériterait des mots de la quatrième, et tout glisserait.
    const tsv = [ENTETE, ligne(1, "un"), ligne(3, "trois")].join("\n");
    const pages = analyserTsvEnLot(tsv, 3);
    expect(pages).toHaveLength(3);
    expect(pages[1]).toEqual([]);
    expect(pages[2]?.map((mot) => mot.texte)).toEqual(["trois"]);
  });

  it("ne rend rien de plus que ce qu'on attend, même si l'outil en dit davantage", () => {
    const tsv = [ENTETE, ligne(1, "un"), ligne(2, "deux")].join("\n");
    expect(analyserTsvEnLot(tsv, 1)).toHaveLength(1);
  });
});

describe("plusieurs images en un seul appel (lot 14 bis, OUT-05)", () => {
  it("rend autant de pages lues que d'images envoyées, avec leurs dimensions", () => {
    const images = troisImages();
    const lues = lireParOcrEnLot(images, { binaire: groupeur });
    expect(lues).toHaveLength(3);
    expect(lues.map((page) => page.largeur)).toEqual([10, 11, 12]);
    expect(lues.map((page) => page.mots.map((mot) => mot.texte).join(""))).toEqual(["mot1", "mot2", "mot3"]);
  });

  it("reprend image par image quand l'appel groupé échoue, et le dit", () => {
    // On ne perd que l'image fautive, jamais le lot : un outil qui refuse une liste doit coûter
    // un repli, pas une lecture.
    const dits: string[] = [];
    const lues = lireParOcrEnLot(troisImages(), { binaire: refuseLesListes, dire: (texte) => dits.push(texte) });
    expect(lues).toHaveLength(3);
    expect(lues.every((page) => page.mots.length === 1)).toBe(true);
    expect(dits.join(" "), "le journal dit le repli, et sur combien d'images").toMatch(/image par image|une à une/i);
  });

  it("attrape le trou silencieux : moins de résultats que d'images envoyées", () => {
    // Le défaut le plus dangereux d'un appel groupé : trois images, deux réponses, et la
    // troisième lecture qui prend la place de la deuxième sans que personne le sache.
    const dits: string[] = [];
    const lues = lireParOcrEnLot(troisImages(), { binaire: avare, dire: (texte) => dits.push(texte) });
    expect(lues, "trois images envoyées, trois pages rendues").toHaveLength(3);
    expect(dits.join(" "), "et le journal nomme l'image qui manque").toMatch(/n'a pas nommé l'image 3/);
  });

  it("attrape une image SAUTÉE AU MILIEU du lot, que le dernier rang ne montrerait pas", () => {
    // Le défaut que le seul « plus grand rang nommé » laisse passer : l'outil rend les rangs 1 et
    // 3, le 3 prend la place du 2, et le plus grand rang vaut 3 sur trois images — tout paraît
    // juste. Ce sont les lignes de page qui tranchent.
    const dits: string[] = [];
    const lues = lireParOcrEnLot(troisImages(), { binaire: sauteLeMilieu, dire: (texte) => dits.push(texte) });
    expect(lues).toHaveLength(3);
    expect(lues.map((page) => page.mots.map((mot) => mot.texte).join("")), "chacune lue pour elle-même").toEqual([
      "seul",
      "seul",
      "seul",
    ]);
    expect(dits.join(" ")).toMatch(/n'a pas nommé l'image 2/);
  });

  it("ne replie PAS sur une image muette : elle a sa ligne de page", () => {
    // Mesuré sur la vraie sortie de l'outil : une image blanche au milieu d'un lot de trois rend
    // sa ligne de niveau 1 et rien d'autre. Elle n'est pas un trou, et la faire relire une à une
    // serait payer un repli pour rien.
    const dits: string[] = [];
    const lues = lireParOcrEnLot(troisImages(), { binaire: muetAuMilieu, dire: (texte) => dits.push(texte) });
    expect(lues).toHaveLength(3);
    expect(lues.map((page) => page.mots.map((mot) => mot.texte).join(""))).toEqual(["un", "", "trois"]);
    expect(dits, "aucun repli, donc rien à dire").toEqual([]);
  });

  it("garde un délai effectif, adapté au nombre d'images", () => {
    // Le délai a été mesuré pour UNE image. Sur un lot, il se multiplie — sinon un lot de dix
    // serait coupé dix fois plus tôt qu'il ne faut, et chaque lecture deviendrait un faux délai.
    const debut = Date.now();
    expect(() => lireParOcrEnLot(troisImages(), { binaire: dormeur, delaiMs: 200 })).toThrow();
    const passe = Date.now() - debut;
    expect(passe, "trois images, donc au moins trois fois le délai d'une").toBeGreaterThanOrEqual(600);
    expect(passe, "et pas davantage que le repli image par image ne demande").toBeLessThan(4000);
  });

  it("ne lance rien du tout quand on ne lui envoie aucune image", () => {
    expect(lireParOcrEnLot([], { binaire: "/aucun/outil/ici" })).toEqual([]);
  });
});
