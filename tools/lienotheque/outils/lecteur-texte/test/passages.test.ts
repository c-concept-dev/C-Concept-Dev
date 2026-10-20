// @vitest-environment node
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PageLue, PassagesDuDocument } from "@lienotheque/contrats";
import {
  BANDE_MARGE,
  MOTS_MINIMUM,
  SEUIL_FORME,
  SEUIL_LISIBILITE,
  coucheSuffisante,
  couperEnDeux,
  enPassages,
  lireCoucheTexte,
  lisible,
  motsBienFormes,
  deuxPagesParFeuille,
  numeroImprime,
  pageDeTexte,
  partDeMotsOutils,
  texteIllisible,
} from "../src/index.js";

/** Du texte lu aux passages cherchables (RCH-07, RCH-09, ANC-01).
 *
 *  Étapes 2 et 4 du chemin du texte. La chaîne ne produisait aucun texte : elle repérait des
 *  numéros d'éléments à un endroit fixe de la page. Ces contrôles éprouvent ce qui la remplace
 *  pour un document natif — dont le texte est déjà là, et dont le numéro imprimé se lit dans la
 *  couche plutôt que par OCR d'un coin d'image.
 */

const RACINE = join(import.meta.dirname, "../../..");
const NATIF = join(RACINE, "fixtures/fichiers/500-pages.pdf");
const siNatif = existsSync(NATIF) ? it : it.skip;

/** Une page fabriquée, pour éprouver une règle sans dépendre d'un fichier. */
const page = (mots: { texte: string; y: number }[], hauteur = 1000): PageLue =>
  PageLue.parse({
    index: 1,
    source: "couche_texte",
    unite: "point",
    largeur: 600,
    hauteur,
    mots: mots.map((m) => ({ texte: m.texte, x: 72, y: m.y, l: 20, h: 11 })),
  });

describe("le numéro imprimé se lit dans la couche texte (ANC-01)", () => {
  it("le prend dans la bande du bas", () => {
    expect(numeroImprime(page([{ texte: "corps", y: 400 }, { texte: "42", y: 950 }]))).toBe(42);
  });

  it("le prend dans la bande du haut", () => {
    expect(numeroImprime(page([{ texte: "17", y: 30 }, { texte: "corps", y: 400 }]))).toBe(17);
  });

  it("ignore un nombre au milieu de la page : un chiffre dans le corps n'est pas un numéro de page", () => {
    expect(numeroImprime(page([{ texte: "1914", y: 400 }]))).toBeUndefined();
  });

  it("ignore un titre courant qui contient des chiffres hors de la bande", () => {
    // Le cas réel de la fixture : « Lienotheque — page 3 sur 500 » à 14 % de la hauteur, et le
    // vrai numéro à 91,6 %. Sans la bande, « 500 » l'emporterait une page sur deux.
    const avecTitre = page([
      { texte: "page", y: 140 },
      { texte: "3", y: 140 },
      { texte: "sur", y: 140 },
      { texte: "500", y: 140 },
      { texte: "3", y: 916 },
    ]);
    expect(numeroImprime(avecTitre)).toBe(3);
  });

  it("retient un numéro répété en haut et en bas quand les deux s'accordent", () => {
    expect(numeroImprime(page([{ texte: "88", y: 30 }, { texte: "88", y: 950 }]))).toBe(88);
  });

  it("ne tranche pas entre deux nombres qui se contredisent : mieux pas de numéro qu'un faux (RCH-09)", () => {
    expect(numeroImprime(page([{ texte: "12", y: 30 }, { texte: "99", y: 950 }]))).toBeUndefined();
  });

  it("ignore ce qui n'est pas entièrement un nombre", () => {
    expect(numeroImprime(page([{ texte: "page", y: 950 }, { texte: "12a", y: 955 }]))).toBeUndefined();
  });

  it("ignore un nombre invraisemblable pour une page", () => {
    expect(numeroImprime(page([{ texte: "0", y: 950 }]))).toBeUndefined();
    expect(numeroImprime(page([{ texte: "99999", y: 950 }]))).toBeUndefined();
  });

  it("la bande est une part de la hauteur, pas un nombre de points : un A5 et un A3 se lisent pareil", () => {
    expect(BANDE_MARGE).toBeGreaterThan(0);
    expect(BANDE_MARGE).toBeLessThan(0.5);
    for (const hauteur of [420, 842, 1684])
      expect(numeroImprime(page([{ texte: "7", y: hauteur * 0.95 }], hauteur)), `hauteur ${hauteur}`).toBe(7);
  });
});

describe("une couche texte peut exister et n'être pas lisible (étape 3)", () => {
  /** Une page de vrai texte français. */
  const vraiTexte = "Au terme de cette recherche nous avons publié les premiers articles sur nos résultats et réuni des données sur les enfants et leurs parents afin d'établir que le trouble couvrait toute la gamme de leurs problèmes";

  /** Le charabia réel d'un document du corpus : la couche existe, son encodage de police est
   *  faux, et elle rend des milliers de « mots » qui n'en sont pas. */
  const charabia = "Xï Œè é }u} ï w Â sèw ëzè éw ëè è é }° Â »èë s· ëw 0 Hï x} vw é x»è° së} »· é é»ï é sŒ »· é é»ï Œ w · ë u»· éësëé çï w ëë w";

  it("mesure la part de mots outils, qui sépare les deux sans ambiguïté", () => {
    // Mesuré sur le document fautif : 0,2 à 2,8 % pour la couche cassée, 26 à 40 % pour l'OCR
    // de la même image. L'écart est d'un ordre de grandeur, et le seuil tombe largement entre.
    expect(partDeMotsOutils(vraiTexte)).toBeGreaterThan(SEUIL_LISIBILITE);
    expect(partDeMotsOutils(charabia)).toBeLessThan(SEUIL_LISIBILITE);
  });

  it("le seuil laisse de la marge des deux côtés plutôt que de raser l'un", () => {
    expect(SEUIL_LISIBILITE).toBeGreaterThan(0.03);
    expect(SEUIL_LISIBILITE).toBeLessThan(0.2);
  });

  it("ne juge pas la lisibilité d'une page qui n'a presque pas de mots", () => {
    // Une page de titre de cinq mots peut n'en contenir aucun d'outil sans être cassée pour
    // autant. On ne juge que ce dont on a de quoi juger.
    expect(partDeMotsOutils("Chapitre premier")).toBe(0);
    expect(lisible(page([{ texte: "Chapitre", y: 400 }, { texte: "premier", y: 420 }]))).toBe(true);
  });

  it("déclare illisible une page fournie mais brouillée", () => {
    const brouillee = page(charabia.split(" ").map((texte, rang) => ({ texte, y: 300 + rang })));
    expect(brouillee.mots.length).toBeGreaterThan(MOTS_MINIMUM);
    expect(lisible(brouillee)).toBe(false);
    expect(coucheSuffisante(brouillee), "une couche brouillée ne suffit pas, même fournie").toBe(false);
  });

  it("déclare lisible une page fournie et claire", () => {
    const claire = page(vraiTexte.split(" ").map((texte, rang) => ({ texte, y: 300 + rang })));
    expect(lisible(claire)).toBe(true);
    expect(coucheSuffisante(claire)).toBe(true);
  });
});

describe("un texte illisible demande **deux** indices, pas un (FMT-04)", () => {
  /** Les deux textes réels du corpus, et c'est tout l'enjeu : l'un se lit, l'autre non, et un
   *  seul critère ne les sépare pas. */
  const listeDeNoms =
    "Conseillers et autres contributeurs du DSM-5 1163 David Brent, M.D. John Campo, M.D. Gabrielle Carlson, M.D. Ellen T.M. Laan, Ph.D. Stephen B. Levine, M.D. Mark Hauser, M.D. Steven K. Hoge, M.D., M.B.A.";
  const encodageCasse = "Xï Œè é }u} ï w Â sèw · ëzè éw ëè è é }° Â »èë s· ëw 0 Hï x} vw é x»è° së} »· é é»ï é sŒ »· é";

  it("une liste de noms n'a pas de mots outils — et se lit parfaitement", () => {
    // Quinze passages de ce genre étaient comptés illisibles sur le seul DSM-5, vérifiés un par
    // un. Un relevé qui alarme à tort coûte autant qu'un relevé qui rassure à tort.
    expect(partDeMotsOutils(listeDeNoms)).toBeLessThan(SEUIL_LISIBILITE);
    expect(motsBienFormes(listeDeNoms)).toBeGreaterThan(SEUIL_FORME);
    expect(texteIllisible(listeDeNoms), "une liste de noms a été déclarée illisible").toBe(false);
  });

  it("un encodage cassé échoue aux deux critères", () => {
    expect(partDeMotsOutils(encodageCasse)).toBeLessThan(SEUIL_LISIBILITE);
    expect(motsBienFormes(encodageCasse)).toBeLessThan(SEUIL_FORME);
    expect(texteIllisible(encodageCasse)).toBe(true);
  });

  it("du texte courant réussit les deux", () => {
    const courant = "Au terme de cette recherche nous avons publié les premiers articles sur nos résultats et réuni des données sur les enfants";
    expect(texteIllisible(courant)).toBe(false);
  });

  it("ne juge pas un texte trop court : un titre de trois mots n'a ni mots outils ni statistique", () => {
    expect(texteIllisible("Chapitre premier")).toBe(false);
    expect(texteIllisible("")).toBe(false);
  });
});

describe("le passage porte son marqueur de qualité (FMT-04)", () => {
  it("marque illisible sans l'écarter : la page existe, et il faut qu'on le sache", () => {
    const passages = enPassages([
      { index: 1, texte: "Au terme de cette recherche nous avons publié les premiers articles sur nos résultats et réuni des données", source: "couche_texte" },
      { index: 2, texte: "Xï Œè é }u} ï w Â sèw · ëzè éw ëè è é }° Â »èë s· ëw 0 Hï x} vw é x»è° së} »· é é»ï é sŒ »· é", source: "couche_texte" },
    ]);
    expect(passages, "un passage illisible a été écarté en silence").toHaveLength(2);
    expect(passages.map((p) => p.lisible)).toEqual([true, false]);
    // Et il garde sa place dans la suite des rangs : l'écarter aurait décalé tous les suivants.
    expect(passages.map((p) => p.rang)).toEqual([0, 1]);
    expect(() => PassagesDuDocument.parse(passages)).not.toThrow();
  });
});

describe("une couche texte suffit-elle pour cette page ? (étape 3)", () => {
  /** Du texte qui ressemble à du texte. Une suite de « mot0, mot1, … » n'en est pas : elle ne
   *  contient aucun mot outil, et la lisibilité la rejette — à juste titre. */
  const motsReels = (combien: number): { texte: string; y: number }[] =>
    Array.from({ length: combien }, (_, n) => ({ texte: ["le", "corps", "de", "la", "page", "et", "ce", "qui", "est", "dans"][n % 10]!, y: 300 + n }));

  it("oui quand elle rend assez de mots, et du langage", () => {
    expect(coucheSuffisante(page(motsReels(MOTS_MINIMUM)))).toBe(true);
  });

  it("non quand elle n'en rend presque aucun : une page scannée sans passe d'OCR rend zéro mot", () => {
    expect(coucheSuffisante(page([{ texte: "12", y: 950 }]))).toBe(false);
    expect(coucheSuffisante(page([]))).toBe(false);
  });

  it("décide page par page, et non document par document", () => {
    // Mesuré à l'étape 2 : un même ouvrage rend 3 % sur une page et 38 % sur une autre. Une
    // décision par document océriserait des milliers de pages déjà lisibles, ou en manquerait
    // autant.
    const pleine = page(motsReels(MOTS_MINIMUM + 5));
    const vide = page([]);
    expect([pleine, vide].map(coucheSuffisante)).toEqual([true, false]);
  });
});

describe("une feuille qui porte deux pages se coupe en deux (OUT-03)", () => {
  /** Une feuille large, trois mots à gauche, trois à droite. */
  const feuille = PageLue.parse({
    index: 4,
    source: "couche_texte",
    unite: "point",
    largeur: 1000,
    hauteur: 800,
    mots: [
      { texte: "gauche", x: 80, y: 300, l: 50, h: 11 },
      { texte: "encore", x: 150, y: 300, l: 50, h: 11 },
      { texte: "toujours", x: 420, y: 300, l: 50, h: 11 },
      { texte: "droite", x: 560, y: 300, l: 50, h: 11 },
      { texte: "aussi", x: 700, y: 300, l: 50, h: 11 },
      { texte: "fin", x: 880, y: 300, l: 50, h: 11 },
    ],
  });

  it("répartit les mots de part et d'autre du milieu", () => {
    const [gauche, droite] = couperEnDeux(feuille);
    expect(gauche.mots.map((m) => m.texte)).toEqual(["gauche", "encore", "toujours"]);
    expect(droite.mots.map((m) => m.texte)).toEqual(["droite", "aussi", "fin"]);
  });

  it("ramène l'abscisse à l'origine de chaque demi-page : une ancre se lit dans sa page, pas dans la feuille (ANC-01)", () => {
    const [gauche, droite] = couperEnDeux(feuille);
    expect(gauche.mots[0]?.x).toBe(80);
    // 560 sur la feuille, soit 60 dans la page de droite, qui commence à 500.
    expect(droite.mots[0]?.x).toBe(60);
    expect(gauche.largeur).toBe(500);
    expect(droite.largeur).toBe(500);
    expect(droite.mots.every((m) => m.x >= 0 && m.x < droite.largeur)).toBe(true);
  });

  it("garde la hauteur, la provenance et l'unité des deux côtés", () => {
    for (const moitie of couperEnDeux(feuille)) {
      expect(moitie.hauteur).toBe(800);
      expect(moitie.source).toBe("couche_texte");
      expect(moitie.unite).toBe("point");
    }
  });

  it("rend deux moitiés même quand tout le texte est d'un seul côté, et n'en invente pas le contenu", () => {
    const dun_cote = PageLue.parse({ ...feuille, mots: feuille.mots.filter((m) => m.x < 500) });
    const [gauche, droite] = couperEnDeux(dun_cote);
    expect(gauche.mots).toHaveLength(3);
    expect(droite.mots).toHaveLength(0);
  });

  it("chaque moitié permet de lire son propre numéro imprimé, et non celui du voisin", () => {
    // Le cas qui compte : un livre photographié en doubles pages porte deux folios par cliché,
    // un par page. Lus sur la feuille entière, ils se contredisent et aucun n'est retenu ;
    // lus après la coupe, chacun est le numéro de sa page.
    const avecFolios = PageLue.parse({
      ...feuille,
      mots: [
        ...feuille.mots,
        { texte: "12", x: 90, y: 760, l: 20, h: 11 },
        { texte: "13", x: 890, y: 760, l: 20, h: 11 },
      ],
    });
    expect(numeroImprime(avecFolios), "sur la feuille entière, deux folios se contredisent").toBeUndefined();
    const [gauche, droite] = couperEnDeux(avecFolios);
    expect(numeroImprime(gauche)).toBe(12);
    expect(numeroImprime(droite)).toBe(13);
  });
});

describe("la coupe en passages : un par page (RCH-07)", () => {
  it("rend un passage par page, numéroté à partir de zéro, et le contrat l'accepte", () => {
    const pages = [
      { index: 1, texte: "Le premier.", source: "couche_texte" as const, pageImprimee: 1 },
      { index: 2, texte: "Le second.", source: "ocr" as const },
    ];
    const passages = enPassages(pages);
    expect(PassagesDuDocument.parse(passages)).toHaveLength(2);
    expect(passages.map((p) => p.rang)).toEqual([0, 1]);
    expect(passages.map((p) => p.page)).toEqual([1, 2]);
    expect(passages[1]?.pageImprimee).toBeUndefined();
  });

  it("saute une page sans texte, **sans laisser de trou dans les rangs**", () => {
    // Une page blanche, une planche, une page dont l'OCR n'a rien tiré : elle n'a pas de passage.
    // Si le rang suivait l'index de page, il y aurait un trou, et le contrat le refuserait à
    // l'écriture — une transaction plus loin, pour une raison illisible.
    const passages = enPassages([
      { index: 1, texte: "Avant.", source: "couche_texte" as const },
      { index: 2, texte: "   ", source: "couche_texte" as const },
      { index: 3, texte: "Après.", source: "couche_texte" as const },
    ]);
    expect(passages.map((p) => p.rang)).toEqual([0, 1]);
    expect(passages.map((p) => p.page)).toEqual([1, 3]);
    expect(() => PassagesDuDocument.parse(passages)).not.toThrow();
  });

  it("ne rend aucun passage pour un document dont rien n'a été lu, et n'en invente pas", () => {
    expect(enPassages([{ index: 1, texte: "", source: "ocr" as const }])).toEqual([]);
  });
});

describe("sur la fixture native de cinq cents pages (OUT-05, RCH-07)", () => {
  siNatif(
    "rend cinq cents passages, chacun portant son vrai numéro imprimé",
    async () => {
      const lu = await lireCoucheTexte(NATIF);
      const passages = enPassages(lu.pages.map(pageDeTexte));

      expect(passages).toHaveLength(500);
      expect(() => PassagesDuDocument.parse(passages)).not.toThrow();

      // Le numéro imprimé de chaque page est son rang : c'est ce que la fixture dessine, et le
      // seul moyen de prouver que le numéro vient de la page et non du compteur de la boucle.
      const faux = passages.filter((p) => p.pageImprimee !== p.page);
      expect(faux.slice(0, 3), `${faux.length} passage(s) au mauvais numéro`).toEqual([]);

      // Et le texte est bien celui de la page, pas celui d'une autre.
      expect(passages[0]?.texte).toContain("page 1 sur 500");
      expect(passages[249]?.texte).toContain("page 250 sur 500");
      expect(passages.every((p) => p.source === "couche_texte")).toBe(true);
    },
    120_000,
  );
});


/** Une feuille porte-t-elle deux pages ? (BAS-02, 20 octobre 2026)
 *
 *  ## Pourquoi la chaîne doit le voir elle-même
 *
 *  Le classement en familles le déclare, et **il se trompe sur 34 documents du corpus sur 53
 *  examinés** dans la famille « une page par feuille » — 64 %, mesuré le 20 octobre. Lu selon son
 *  classement, un de ces documents mêle les textes de deux pages dans un même passage et perd les
 *  trois quarts de ses numéros imprimés, sans rien signaler. Une citation en sort invérifiable,
 *  et « toujours sur la vraie page » est la promesse du produit.
 *
 *  ## Le signe, et pourquoi il ne coûte rien
 *
 *  Une feuille qui porte deux pages porte **deux folios consécutifs** dans ses bandes de marge.
 *  C'est exactement ce que `numeroImprime` a sous les yeux au moment où il renonce à trancher —
 *  « s'ils se contredisent, on ne tranche pas ». Il suffisait de regarder ce qu'il jette.
 *
 *  Et cela se lit dans la **couche texte**, sans reconnaissance : un folio est fait de chiffres,
 *  et les chiffres n'ont pas d'accents à perdre. Cinq millisecondes la page.
 *
 *  ## Deux pages au moins, et c'est mesuré
 *
 *  Une seule paire ne suffit pas : un document rendait « 2003+2004 » — une plage d'années dans
 *  une bibliographie, non deux folios. Un vrai livre à deux pages par feuille en montre sur
 *  presque toutes ses feuilles ; une plage d'années n'apparaît qu'une fois. D'où le seuil : **au
 *  moins deux feuilles** parmi celles qu'on regarde.
 */
describe("une feuille qui porte deux pages se reconnaît à ses deux folios", () => {
  /** Une feuille de livre : du texte au milieu, et ses folios dans la marge basse. */
  const feuille = (folios: readonly number[], texte = "le texte courant de cette page"): PageLue =>
    page([
      ...texte.split(" ").map((mot) => ({ texte: mot, y: 500 })),
      ...folios.map((numero) => ({ texte: String(numero), y: 960 })),
    ]);

  /** Vingt feuilles, soit la longueur d'un vrai ouvrage : la fonction refuse de trancher sur un
   *  document trop court, et c'est une épreuve à part. `folios` reçoit le rang de la feuille. */
  const ouvrage = (folios: (rang: number) => readonly number[]): readonly PageLue[] =>
    Array.from({ length: 20 }, (_, rang) => feuille(folios(rang)));

  it("reconnaît un livre numérisé deux pages à la fois", () => {
    expect(deuxPagesParFeuille(ouvrage((rang) => [64 + rang * 2, 65 + rang * 2]))).toBe(true);
  });

  it("laisse tranquille un livre d'une page par feuille", () => {
    expect(deuxPagesParFeuille(ouvrage((rang) => [64 + rang]))).toBe(false);
  });

  it("ne se laisse pas prendre par une paire isolée", () => {
    // Le faux positif mesuré : « 2003+2004 », une plage d'années dans une bibliographie. Une
    // seule feuille la montre ; un vrai livre double en montre sur presque toutes.
    expect(deuxPagesParFeuille(ouvrage((rang) => (rang === 9 ? [2003, 2004] : [64 + rang])))).toBe(false);
  });

  it("exige que les deux folios se suivent", () => {
    // Deux nombres quelconques dans la marge ne font pas une double page : un numéro de partie
    // et un folio cohabitent très bien sur une feuille simple.
    expect(deuxPagesParFeuille(ouvrage((rang) => [7, 64 + rang * 2]))).toBe(false);
  });

  it("ne lit que les marges, jamais le corps du texte", () => {
    // Un texte qui cite « 64 » et « 65 » au fil des lignes n'est pas une double page. La bande de
    // marge est la même que celle de `numeroImprime`, et pour la même raison.
    const pages = Array.from({ length: 20 }, () =>
      page([
        { texte: "voir", y: 500 },
        { texte: "64", y: 500 },
        { texte: "et", y: 500 },
        { texte: "65", y: 500 },
      ]),
    );
    expect(deuxPagesParFeuille(pages)).toBe(false);
  });

  it("supporte des folios manquants : une couche en oublie souvent", () => {
    // Mesuré sur le corpus : la couche rend parfois un seul des deux folios d'une feuille. Deux
    // feuilles franches suffisent, et c'est pourquoi le seuil porte sur un compte et non sur une
    // proportion.
    // Deux feuilles franches suffisent au milieu de huit où la couche n'a rendu qu'un folio.
    expect(
      deuxPagesParFeuille(ouvrage((rang) => (rang === 10 || rang === 13 ? [140 + rang * 2, 141 + rang * 2] : [140 + rang * 2]))),
    ).toBe(true);
  });

  it("ne dit rien d'un document sans aucun folio", () => {
    expect(deuxPagesParFeuille(ouvrage(() => []))).toBe(false);
  });

  it("ne dit rien d'un document trop court pour en juger", () => {
    expect(deuxPagesParFeuille([feuille([64, 65])])).toBe(false);
  });

  it("regarde le milieu du document, pas ses pages liminaires", () => {
    // Couverture, faux-titre, table : elles ne portent pas de folio imprimé, et les lire ferait
    // conclure « une page par feuille » sur un ouvrage qui en porte deux.
    const liminaires = Array.from({ length: 10 }, () => feuille([]));
    const corps = Array.from({ length: 10 }, (_, rang) => feuille([100 + rang * 2, 101 + rang * 2]));
    expect(deuxPagesParFeuille([...liminaires, ...corps])).toBe(true);
  });
});
