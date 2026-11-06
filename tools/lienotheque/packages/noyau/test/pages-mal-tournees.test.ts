import { describe, expect, it } from "vitest";
import {
  orientationDUnePageSeule,
  orientationDuDocument,
  motsFiables,
  pagesQuiLisentMal,
  partHorizontale,
  qualiteDeLecture,
  rotationQuiVaut,
} from "../src/index.js";

/** Une page qu'on lit mal, et la rotation qui vaut la peine (OUT-03, OUT-05).
 *
 *  ## Le défaut
 *
 *  Relevé le 6 novembre 2026 : une page d'un document du corpus est numérisée **à l'envers**.
 *  Lue telle quelle elle rend 1 391 « mots » dont aucun n'est un mot ; tournée de 180° elle rend
 *  son titre et son texte. Le produit sait tourner une page — le redresseur existe — et ne le
 *  demande **jamais** : une seule occurrence de l'option dans tout le dépôt, dans un contrôle
 *  sauté. Et quand bien même : l'avis d'orientation de l'outil **se tait** sur cette page, et la
 *  règle d'alors exigeait que deux lectures convergent.
 *
 *  ## La décision de Christophe, le 6 novembre 2026
 *
 *  Un gain de lecture net **peut décider seul** quand l'avis se tait, sous trois garde-fous :
 *  on n'essaie des rotations que sur une page qui lit mal ; on ne retient une rotation que si
 *  elle lit nettement mieux ; et ce qui a été tourné est tracé, visible, réversible.
 *
 *  Le motif est que le risque n'est pas celui d'un lien : **une page mal tournée se relit, elle
 *  ne publie rien de faux**, et la règle garde la meilleure lecture.
 *
 *  ## Aucun seuil posé
 *
 *  « Lire mal » et « lire nettement mieux » se mesurent **contre les pages du même document**.
 *  Les qualités sont triées et coupées à leur plus grand écart : ce qui tombe sous la coupure lit
 *  mal *par rapport à ses voisines*. Rien n'est choisi — la tolérance est ce que le document
 *  montre, comme la hauteur d'une rangée l'est pour une table.
 */

describe("quelles pages d'un document lisent mal (OUT-03)", () => {
  it("nomme celle qui se détache nettement de ses voisines", () => {
    // Neuf pages qui lisent bien, une qui ne lit rien.
    const qualites = [0.82, 0.79, 0.85, 0.81, 0.08, 0.8, 0.83, 0.78, 0.84, 0.81];
    expect(pagesQuiLisentMal(qualites)).toEqual([4]);
  });

  it("n'en nomme aucune quand toutes se valent", () => {
    expect(pagesQuiLisentMal([0.8, 0.82, 0.79, 0.81, 0.83, 0.78])).toEqual([]);
  });

  it("n'en nomme aucune quand toutes lisent mal : il n'y a rien à redresser", () => {
    // Un document entier illisible n'a pas une page retournée : il a un autre problème, et
    // tourner ses pages une à une coûterait pour rien.
    //
    // Le premier décor écrit ici était une échelle régulière — 0,04 à 0,08 de centième en
    // centième. Il ne disait rien : le plus grand écart y valait **exactement** l'étendue du
    // groupe du dessus, et le résultat tenait au dernier bit du calcul flottant. Un décor dont
    // la réponse se joue à la virgule près n'éprouve pas une règle, il éprouve une addition.
    expect(pagesQuiLisentMal([0.05, 0.14, 0.04, 0.09, 0.06, 0.12])).toEqual([]);
  });

  it("ne nomme rien d'un document trop court pour avoir des voisines", () => {
    expect(pagesQuiLisentMal([0.8, 0.05])).toEqual([]);
  });

  it("en nomme plusieurs quand plusieurs se détachent ensemble", () => {
    const qualites = [0.8, 0.07, 0.82, 0.05, 0.79, 0.81, 0.83, 0.78];
    expect(pagesQuiLisentMal(qualites)).toEqual([1, 3]);
  });
});

describe("quelle rotation vaut la peine d'être retenue (OUT-03)", () => {
  // Les voisines d'un document réel : leurs qualités varient de 0,22.
  // Les douze pages normales d'un document réel : leur qualité et leur nombre de mots. La moins
  // bavarde en rend 25 — c'est le plancher sous lequel une proportion ne veut plus rien dire.
  const voisines = [
    { qualite: 0.967, mots: 2 }, { qualite: 0.961, mots: 80 }, { qualite: 0.964, mots: 374 },
    { qualite: 0.887, mots: 61 }, { qualite: 0.891, mots: 43 }, { qualite: 0.892, mots: 62 },
    { qualite: 0.927, mots: 34 }, { qualite: 0.921, mots: 44 }, { qualite: 0.92, mots: 37 },
    { qualite: 0.797, mots: 25 }, { qualite: 0.751, mots: 32 }, { qualite: 0.961, mots: 547 },
  ];
  /** Une page droite : la majorité de ses mots sont plus larges que hauts. */
  const droite = (qualite: number, motsFiables: number) => ({ qualite, motsFiables, partHorizontale: 0.87 });

  it("retient la rotation qui redresse les lignes et gagne des mots fiables", () => {
    expect(
      rotationQuiVaut({ qualite: 0.242, motsFiables: 244, partHorizontale: 0.1 }, [
        { rotation: 90, qualite: 0.953, mots: 1376, motsFiables: 1232, partHorizontale: 0.87 },
      ], voisines),
    ).toBe(90);
  });

  it("n'en retient aucune quand aucune ne fait nettement mieux", () => {
    expect(
      rotationQuiVaut({ qualite: 0.75, motsFiables: 900, partHorizontale: 0.1 }, [
        { rotation: 90, qualite: 0.76, mots: 980, motsFiables: 950, partHorizontale: 0.87 },
      ], voisines),
    ).toBeUndefined();
  });

  it("ne retient jamais une rotation qui laisse les lignes verticales", () => {
    // Le cas qui a renversé la règle : la reconnaissance lit **aussi bien** une page couchée
    // renversée qu'une page droite. Seule la forme des boîtes les sépare.
    expect(
      rotationQuiVaut({ qualite: 0.242, motsFiables: 244, partHorizontale: 0.1 }, [
        { rotation: 180, qualite: 0.951, mots: 1400, motsFiables: 1248, partHorizontale: 0.12 },
      ], voisines),
    ).toBeUndefined();
  });

  it("choisit la meilleure parmi celles qui redressent les lignes", () => {
    expect(
      rotationQuiVaut({ qualite: 0.242, motsFiables: 244, partHorizontale: 0.1 }, [
        { rotation: 90, qualite: 0.953, mots: 1376, motsFiables: 1232, partHorizontale: 0.87 },
        { rotation: 270, qualite: 0.232, mots: 1392, motsFiables: 251, partHorizontale: 0.88 },
      ], voisines),
    ).toBe(90);
  });

  it("ne retient jamais une rotation qui perd des mots fiables", () => {
    expect(
      rotationQuiVaut(droite(0.9, 950), [
        { rotation: 180, qualite: 0.95, mots: 940, motsFiables: 900, partHorizontale: 0.87 },
      ], voisines),
    ).toBeUndefined();
  });

  it("n'invente rien quand on ne lui propose aucune rotation", () => {
    expect(rotationQuiVaut(droite(0.45, 900), [], voisines)).toBeUndefined();
  });
});

describe("un document entièrement retourné (OUT-03)", () => {
  /** Le trou que Christophe a nommé le 6 novembre 2026 : la règle des pages compare une page à
   *  ses voisines. Un document dont **toutes** les pages sont retournées n'a aucune voisine
   *  droite — rien ne se détache, et rien ne se déclenche. Il faut un recours pour le document
   *  entier.
   *
   *  Le recours emploie le même raisonnement que `orientationDuLot`, déjà au dépôt : **les pages
   *  bavardes décident pour les muettes**. On essaie les orientations sur quelques pages, et on
   *  retient celle qui lit mieux que l'original de plus que ce que les pages varient entre elles
   *  dans leur sens d'origine. Aucun seuil posé. */

  /** Ce qu'un document tout à l'envers donne : chaque page lit mal à 0°, bien à 180°. */
  const retourne = [
    { 0: 0.06, 90: 0.1, 180: 0.78, 270: 0.09 },
    { 0: 0.04, 90: 0.08, 180: 0.81, 270: 0.07 },
    { 0: 0.07, 90: 0.11, 180: 0.8, 270: 0.1 },
  ];
  const droit = [
    { 0: 0.8, 90: 0.1, 180: 0.07, 270: 0.09 },
    { 0: 0.82, 90: 0.09, 180: 0.05, 270: 0.08 },
    { 0: 0.79, 90: 0.12, 180: 0.08, 270: 0.1 },
  ];

  it("trouve les 180° d'un document dont toutes les pages sont retournées", () => {
    expect(orientationDuDocument(retourne)).toBe(180);
  });

  it("ne tourne rien d'un document déjà droit", () => {
    expect(orientationDuDocument(droit)).toBeUndefined();
  });

  it("ne tranche pas sur un seul essai", () => {
    expect(orientationDuDocument([retourne[0]!])).toBeUndefined();
  });

  it("ne tranche pas quand les pages ne s'accordent pas entre elles", () => {
    // Une page dit 180°, une autre dit 90° : ce n'est pas l'orientation d'un document, c'est du
    // bruit. Un document est photographié en une séance, dans un sens.
    expect(
      orientationDuDocument([
        { 0: 0.06, 90: 0.1, 180: 0.78, 270: 0.09 },
        { 0: 0.05, 90: 0.8, 180: 0.11, 270: 0.07 },
        { 0: 0.07, 90: 0.09, 180: 0.1, 270: 0.76 },
      ]),
    ).toBeUndefined();
  });

  it("ne tranche pas quand le gain tient dans ce que les pages varient déjà", () => {
    expect(
      orientationDuDocument([
        { 0: 0.5, 90: 0.52, 180: 0.54, 270: 0.51 },
        { 0: 0.7, 90: 0.69, 180: 0.72, 270: 0.68 },
        { 0: 0.6, 90: 0.61, 180: 0.63, 270: 0.59 },
      ]),
    ).toBeUndefined();
  });
});

describe("un document d'une seule page (OUT-03)", () => {
  /** Le troisième trou, nommé par Christophe le 6 novembre 2026. La règle page par page compare
   *  une page à ses voisines ; le recours compare des pages entre elles. Un document d'une page
   *  n'a ni l'une ni l'autre.
   *
   *  Il reste pourtant de quoi juger : **les quatre sens de cette page**. Le bon se détache des
   *  trois autres, parce que du texte lu à l'envers ou de côté ne rend pas des mots. Et « se
   *  détacher » se mesure sans seuil : l'avance du meilleur sur le suivant doit dépasser ce que
   *  les trois perdants varient entre eux. */

  it("trouve les 180° d'une page unique numérisée à l'envers", () => {
    expect(orientationDUnePageSeule({ 0: 0.06, 90: 0.1, 180: 0.78, 270: 0.09 })).toBe(180);
  });

  it("ne tourne rien d'une page déjà droite", () => {
    expect(orientationDUnePageSeule({ 0: 0.8, 90: 0.1, 180: 0.07, 270: 0.09 })).toBeUndefined();
  });

  it("ne tranche pas quand aucun sens ne se détache", () => {
    // Une page sans texte — une planche gravée — lit également mal dans les quatre sens. Il n'y
    // a rien à redresser, et choisir reviendrait à tirer au sort.
    expect(orientationDUnePageSeule({ 0: 0.08, 90: 0.07, 180: 0.09, 270: 0.06 })).toBeUndefined();
  });

  it("ne tranche pas quand deux sens se valent", () => {
    // Le cas mesuré le 6 novembre : la reconnaissance lit aussi bien un sens de travers que le
    // bon. Deux sens également soutenus ne départagent rien.
    expect(orientationDUnePageSeule({ 0: 0.45, 90: 0.61, 180: 0.61, 270: 0.44 })).toBeUndefined();
  });

  it("ne tranche pas sur moins de quatre sens", () => {
    expect(orientationDUnePageSeule({ 0: 0.06, 180: 0.78 })).toBeUndefined();
  });
});

describe("la page réellement retournée, avec les chiffres du document (OUT-03)", () => {
  /** Le cas qui a tout décidé, et ses vraies mesures. Aebersold 017, quatorze pages : la
   *  treizième est numérisée à l'envers.
   *
   *  **Deux de mes règles sont mortes ici, et c'est ce contrôle qui les a tuées.**
   *
   *  La première était la mesure de qualité : « part des suites de trois lettres ». Elle donnait
   *  45 % à la page retournée et 44 à 46 % aux pages de partition voisines — la page retournée
   *  ne se détachait pas. Du texte à l'envers produit quantité de fausses syllabes.
   *
   *  La seconde était le critère de détachement : « le saut dépasse tous les autres écarts
   *  réunis ». Le saut vaut 0,328 et la somme des autres 0,397 : la règle se taisait.
   *
   *  Ce qui sépare, c'est **ce que l'outil dit de lui-même** : la confiance médiane de chaque
   *  page. 0,242 pour la page retournée, 0,751 à 0,967 pour les pages droites. */

  // Les confiances médianes mesurées, page 1 à 14, dans l'ordre du document.
  const CONFIANCES = [0.967, 0.961, 0.964, 0.887, 0.891, 0.892, 0.927, 0.921, 0.92, 0.797, 0.751, 0.423, 0.242, 0.961];

  it("désigne la page 13, qui est celle qui est à l'envers", () => {
    const places = pagesQuiLisentMal(CONFIANCES);
    expect(places, "les places comptent depuis zéro : 12 est la page 13").toContain(12);
  });

  it("ne désigne aucune des pages droites", () => {
    const places = pagesQuiLisentMal(CONFIANCES);
    const droites = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13];
    for (const place of droites) expect(places, `page ${place + 1}`).not.toContain(place);
  });

  it("retient les 90°, et non les 180° que la confiance seule désignait", () => {
    const voisines = CONFIANCES.filter((_, place) => place !== 11 && place !== 12).map((qualite) => ({
      qualite,
      mots: 200,
    }));
    expect(
      rotationQuiVaut({ qualite: 0.242, motsFiables: 244, partHorizontale: 0.1 }, [
        { rotation: 90, qualite: 0.953, mots: 1376, motsFiables: 1232, partHorizontale: 0.87 },
        { rotation: 180, qualite: 0.951, mots: 1400, motsFiables: 1248, partHorizontale: 0.12 },
        { rotation: 270, qualite: 0.232, mots: 1392, motsFiables: 251, partHorizontale: 0.88 },
      ], voisines),
    ).toBe(90);
  });
});

describe("une seule mesure de la qualité d'une lecture (OUT-03)", () => {
  /** Les trois cas — la page dans un document, le document entier, la page unique — emploient
   *  **la même** mesure. Trois mesures auraient fini par ne plus dire la même chose, et les
   *  comparer n'aurait plus rien voulu dire. */

  it("rend la confiance médiane, et non la moyenne", () => {
    // Deux mots illisibles dans un coin ne condamnent pas une page lisible.
    const mots = [{ confiance: 0.02 }, { confiance: 0.04 }, { confiance: 0.9 }, { confiance: 0.92 }, { confiance: 0.95 }];
    expect(qualiteDeLecture(mots)).toBe(0.9);
  });

  it("tient un mot sans confiance pour certain : une couche texte lit, elle ne reconnaît pas", () => {
    expect(qualiteDeLecture([{}, {}, {}])).toBe(1);
  });

  it("rend zéro d'une page sans un mot", () => {
    expect(qualiteDeLecture([])).toBe(0);
  });

  it("sépare la page retournée de ses voisines, là où compter les lettres échouait", () => {
    // Les deux mesures, sur les mêmes pages réelles. Celle qui comptait les lettres donnait
    // 45 % à la page retournée et 44 à 46 % aux pages de partition : indistinguables.
    const retournee = [{ confiance: 0.2 }, { confiance: 0.24 }, { confiance: 0.3 }];
    const partition = [{ confiance: 0.75 }, { confiance: 0.8 }, { confiance: 0.89 }];
    expect(qualiteDeLecture(retournee)).toBeLessThan(qualiteDeLecture(partition));
  });
});

describe("les trois conditions, avec les chiffres mesurés (OUT-03)", () => {
  /** La course du 6 novembre 2026 sur un document réel, et ce que chaque condition empêche.
   *  Ces contrôles portent les mesures exactes : ce sont eux qui empêcheront la règle de
   *  revenir en arrière. */

  const voisines = [
    { qualite: 0.967, mots: 2 }, { qualite: 0.961, mots: 80 }, { qualite: 0.964, mots: 374 },
    { qualite: 0.887, mots: 61 }, { qualite: 0.891, mots: 43 }, { qualite: 0.892, mots: 62 },
    { qualite: 0.927, mots: 34 }, { qualite: 0.921, mots: 44 }, { qualite: 0.92, mots: 37 },
    { qualite: 0.797, mots: 25 }, { qualite: 0.751, mots: 32 }, { qualite: 0.961, mots: 547 },
  ];

  it("refuse la rotation d'une page qui ne rend plus qu'un mot", () => {
    // Page 12 : 44 mots telle quelle, notés 0,423. Tournée de 90°, elle rend **un seul mot**,
    // noté 0,892 — la médiane d'un mot est ce mot. Sans la condition des mots fiables, une page
    // de partition parfaitement droite aurait été tournée.
    expect(
      rotationQuiVaut({ qualite: 0.423, motsFiables: 18, partHorizontale: 0.8 }, [
        { rotation: 90, qualite: 0.892, mots: 1, motsFiables: 1, partHorizontale: 0.9 },
        { rotation: 180, qualite: 0, mots: 6, motsFiables: 0, partHorizontale: 0.5 },
        { rotation: 270, qualite: 0, mots: 1, motsFiables: 0, partHorizontale: 0.9 },
      ], voisines),
    ).toBeUndefined();
  });

  it("choisit 90° sur la page réellement couchée, là où la confiance désignait 180°", () => {
    // Page 13, les quatre sens mesurés. La confiance ne départage pas 90° (0,953) de 180°
    // (0,951) : l'outil lit aussi bien un texte vertical renversé. La **géométrie**, si :
    // 87 % de boîtes horizontales contre 12 %.
    //
    // Vérifié à l'image : c'est une double page couchée, et 90° la redresse.
    expect(
      rotationQuiVaut({ qualite: 0.242, motsFiables: 244, partHorizontale: 0.1 }, [
        { rotation: 90, qualite: 0.953, mots: 1376, motsFiables: 1232, partHorizontale: 0.87 },
        { rotation: 180, qualite: 0.951, mots: 1400, motsFiables: 1248, partHorizontale: 0.12 },
        { rotation: 270, qualite: 0.232, mots: 1392, motsFiables: 251, partHorizontale: 0.88 },
      ], voisines),
    ).toBe(90);
  });

  it("refuse une page dont la version tournée produit plus de bruit que la droite de vrais mots", () => {
    // Demandé par Christophe : une page droite qui, tournée, rend beaucoup de « mots » dont
    // presque aucun n'est fiable. Le compte brut la ferait tourner ; le compte fiable la garde.
    expect(
      rotationQuiVaut({ qualite: 0.9, motsFiables: 800, partHorizontale: 0.85 }, [
        { rotation: 90, qualite: 0.95, mots: 140, motsFiables: 120, partHorizontale: 0.9 },
      ], voisines),
    ).toBeUndefined();
  });

  it("refuse une version tournée qui s'effondre en nombre de mots", () => {
    // Le trou que Christophe a nommé le 6 novembre 2026, et qu'aucun des autres contrôles ne
    // voyait. Une page qui n'avait **aucun** mot fiable satisfait « ne pas en perdre » par
    // n'importe quoi ; et la part de mots horizontaux d'une page qui en rend trois vaut 0 % ou
    // 100 %. Une proportion sur trois mots ne dit rien.
    //
    // Le plancher vient du document : sa page normale la moins bavarde en rend vingt-cinq.
    expect(
      rotationQuiVaut({ qualite: 0.1, motsFiables: 0, partHorizontale: 0.2 }, [
        { rotation: 90, qualite: 0.99, mots: 3, motsFiables: 3, partHorizontale: 1 },
      ], voisines),
    ).toBeUndefined();
  });

  it("retient la même rotation dès que la page tournée est aussi lue qu'une page normale", () => {
    // Le pendant : au-dessus du plancher — la page normale médiane de ce document en rend
    // quarante-quatre —, les proportions reprennent leur sens.
    expect(
      rotationQuiVaut({ qualite: 0.1, motsFiables: 0, partHorizontale: 0.2 }, [
        { rotation: 90, qualite: 0.99, mots: 60, motsFiables: 55, partHorizontale: 1 },
      ], voisines),
    ).toBe(90);
  });

  it("départage deux sens que la confiance donne pour égaux", () => {
    // Demandé par Christophe : 90° et 180° à la même confiance. Seule la géométrie décide.
    expect(
      rotationQuiVaut({ qualite: 0.3, motsFiables: 200, partHorizontale: 0.1 }, [
        { rotation: 90, qualite: 0.95, mots: 1250, motsFiables: 1200, partHorizontale: 0.88 },
        { rotation: 180, qualite: 0.95, mots: 1250, motsFiables: 1200, partHorizontale: 0.11 },
      ], voisines),
    ).toBe(90);
  });
});

describe("les deux mesures tirées des mots (OUT-03)", () => {
  it("compte comme fiables les mots qui atteignent la norme du document", () => {
    const mots = [{ confiance: 0.2 }, { confiance: 0.8 }, { confiance: 0.9 }, {}];
    expect(motsFiables(mots, 0.751), "un mot sans confiance est certain").toBe(3);
  });

  it("mesure la part des mots plus larges que hauts", () => {
    const mots = [{ l: 40, h: 12 }, { l: 30, h: 10 }, { l: 8, h: 30 }, { l: 50, h: 14 }];
    expect(partHorizontale(mots)).toBe(0.75);
  });

  it("rend zéro d'une page sans un mot", () => {
    expect(partHorizontale([])).toBe(0);
  });
});
