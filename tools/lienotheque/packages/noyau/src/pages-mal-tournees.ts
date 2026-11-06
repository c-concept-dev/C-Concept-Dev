/** Une page qu'on lit mal, et la rotation qui vaut la peine (OUT-03, OUT-05).
 *
 *  ## Le défaut que ce module existe pour empêcher
 *
 *  Relevé le 6 novembre 2026 : une page d'un document du corpus est numérisée **couchée** — une
 *  double page scannée de travers. Lue telle quelle, elle rend 1 391 « mots » dont 244 seulement
 *  sont fiables ; tournée de 90°, elle en rend 1 232 sur 1 376. Le produit sait tourner une page,
 *  et ne le demandait **jamais**. L'avis d'orientation de l'outil, lui, se taisait.
 *
 *  **J'ai d'abord cru cette page à l'envers**, et deux mesures le confirmaient : à 180° elle se
 *  lit, et bien. Faux — l'outil déchiffre aussi un texte vertical renversé. Seule la forme des
 *  boîtes le dit, et c'est Christophe qui l'a vue. Vérifié à l'image ensuite.
 *
 *  ## Décision de Christophe, 6 novembre 2026
 *
 *  Un gain de lecture net **peut décider seul** quand l'avis se tait, sous trois garde-fous : on
 *  n'essaie des rotations que sur une page qui lit mal ; on ne retient une rotation que si elle
 *  lit nettement mieux ; et ce qui a été tourné est tracé, visible, réversible.
 *
 *  Le motif tient en une phrase : **une page mal tournée se relit, elle ne publie rien de faux.**
 *  C'est ce qui distingue ce cas de la règle des deux signaux, qui garde une publication.
 *
 *  ## Aucun seuil posé
 *
 *  « Lire mal » et « lire nettement mieux » se mesurent **contre les pages du même document**.
 *  Les qualités sont triées et coupées à leur plus grand écart : ce qui tombe sous la coupure lit
 *  mal *par rapport à ses voisines*. Rien n'est choisi — la tolérance est ce que le document
 *  montre, comme la hauteur d'une rangée l'est pour une table. */

/** Ce que vaut la lecture d'une page, entre 0 et 1 (OUT-03, OUT-05).
 *
 *  **Une seule définition pour les trois cas** — la page dans un document, le document entier,
 *  la page unique. Trois mesures auraient fini par ne plus dire la même chose, et la comparaison
 *  entre elles n'aurait plus rien voulu dire.
 *
 *  C'est **la confiance médiane des mots**, c'est-à-dire ce que l'outil de reconnaissance dit de
 *  lui-même. Médiane et non moyenne : quelques mots illisibles dans un coin ne condamnent pas une
 *  page lisible.
 *
 *  ## Ce que cette mesure a remplacé, et pourquoi
 *
 *  La première version comptait la part des mots faits d'au moins trois lettres. **Réfutée par la
 *  mesure du 6 novembre 2026** sur la page réellement couchée : elle notait 45 %, et
 *  les pages gravées voisines 44 à 46 %. Du texte retourné produit quantité de fausses
 *  syllabes — « satoya », « ajeos », « Suturewar » — qui passent pour des mots. La page ne se
 *  détachait pas, et la règle ne se serait jamais déclenchée sur le seul cas qu'elle visait.
 *
 *  En confiance, la même page note **0,242** là où les douze pages droites notent 0,751 à 0,967.
 *
 *  ## Un mot sans confiance est un mot certain
 *
 *  La couche texte d'un document natif ne reconnaît rien : elle **lit** ce qui est écrit. Ses
 *  mots n'ont donc pas de confiance, et leur en prêter une faible ferait passer pour douteux ce
 *  qui est exact. */
export function qualiteDeLecture(mots: readonly { readonly confiance?: number | undefined }[]): number {
  if (mots.length === 0) return 0;
  const confiances = mots.map((mot) => mot.confiance ?? 1).sort((un, autre) => un - autre);
  return confiances[Math.floor(confiances.length / 2)]!;
}

/** Combien de mots d'une page sont **fiables** : ceux dont la confiance atteint la norme du
 *  document.
 *
 *  Compter les mots tout court comparait du bruit à du signal. Mesuré le 6 novembre 2026 sur une
 *  page couchée : elle rendait 1 391 « mots » dont 244 seulement étaient fiables, contre 1 232
 *  sur 1 376 une fois redressée. Le compte brut variait de 1 % ; le compte fiable, de cinq fois. */
export function motsFiables(
  mots: readonly { readonly confiance?: number | undefined }[],
  norme: number,
): number {
  return mots.filter((mot) => (mot.confiance ?? 1) >= norme).length;
}

/** La part des mots plus larges que hauts.
 *
 *  **C'est ce qui départage un sens que la confiance ne départage pas.** Une ligne de texte est
 *  horizontale, et un mot y est donc plus large que haut : c'est un fait de la composition.
 *
 *  Mesuré le 6 novembre 2026 sur une page réellement couchée : telle quelle 10 %, tournée de
 *  90° **87 %**, de 180° 12 %, de 270° 88 %. L'outil de reconnaissance, lui, notait 0,953 à 90°
 *  et 0,951 à 180° — il lit aussi bien un texte vertical renversé, et aurait laissé la page
 *  couchée. Vérifié à l'image : la page est une double page couchée, et 90° est le bon sens. */
export function partHorizontale(mots: readonly { readonly l: number; readonly h: number }[]): number {
  if (mots.length === 0) return 0;
  return mots.filter((mot) => mot.l > mot.h).length / mots.length;
}

/** Ce qu'une rotation a donné, quand on l'a essayée : ce qu'elle vaut, et **combien de mots elle
 *  rend**. Les deux, parce que la qualité seule se laisse tromper — la confiance médiane d'une
 *  page qui ne rend qu'un mot est celle de ce mot. */
export type RotationEssayee = {
  readonly rotation: number;
  readonly qualite: number;
  /** Combien de mots en tout. Une proportion calculée sur trois mots ne dit rien. */
  readonly mots: number;
  /** Les mots dont la confiance atteint la norme du document. */
  readonly motsFiables: number;
  /** La part des mots plus larges que hauts. */
  readonly partHorizontale: number;
};

/** Ce qu'une page **normale** de ce document donne : de quoi juger les autres. */
export type PageNormale = { readonly qualite: number; readonly mots: number };

/** La valeur du milieu. Elle résiste à une page aberrante, là où le minimum la suit. */
function mediane(valeurs: readonly number[]): number {
  const triees = [...valeurs].sort((un, autre) => un - autre);
  return triees[Math.floor(triees.length / 2)] ?? 0;
}

/** Où se coupe une suite de qualités triées : à son plus grand écart.
 *
 *  Rend l'indice du premier élément *au-dessus* de la coupure, ou `undefined` quand rien ne se
 *  détache — c'est-à-dire quand le plus grand écart ne dépasse pas ce que les autres montrent. */
function coupure(triees: readonly number[]): number | undefined {
  if (triees.length < 3) return undefined;
  const ecarts = triees.slice(1).map((valeur, rang) => valeur - triees[rang]!);
  let meilleur = { rang: -1, ecart: 0 };
  for (const [rang, ecart] of ecarts.entries()) if (ecart > meilleur.ecart) meilleur = { rang, ecart };
  if (meilleur.rang < 0) return undefined;
  // Le saut ne vaut coupure que s'il dépasse **ce que les pages normales varient entre elles** :
  // l'étendue du groupe qui reste au-dessus. C'est la phrase de Christophe, et c'est la seule
  // comparaison disponible — le document est son propre étalon.
  //
  // Une première version exigeait que le saut dépasse **tous** les autres écarts réunis.
  // Réfutée par la mesure du 6 novembre 2026 : sur les quatorze pages d'un document réel, le
  // saut qui isole la page couchée vaut 0,328 et la somme des autres 0,397 — la règle se
  // taisait sur le seul cas qu'elle visait.
  //
  // Et quand le groupe du dessus se réduit à **une** page, il n'a pas d'étendue : n'importe quel
  // écart la dépasserait. On prend alors celle de tout le document — une page seule ne dit rien
  // d'une variation. Sans cette précaution, le bruit du calcul flottant suffisait à faire
  // désigner cinq pages sur six d'un document qui lit également mal partout.
  const dessus = triees.slice(meilleur.rang + 1);
  const etendue = (xs: readonly number[]): number => (xs.at(-1) ?? 0) - (xs[0] ?? 0);
  const reference = dessus.length >= 2 ? etendue(dessus) : etendue(triees);
  if (meilleur.ecart <= reference) return undefined;
  return meilleur.rang + 1;
}

/** Les pages qui lisent nettement moins bien que les autres pages du même document.
 *
 *  `qualites[i]` est la part de vrais mots de la page `i` : une grandeur du document, pas un
 *  réglage. Rend les places des pages sous la coupure, dans l'ordre. */
export function pagesQuiLisentMal(qualites: readonly number[]): readonly number[] {
  const triees = [...qualites].sort((un, autre) => un - autre);
  const place = coupure(triees);
  if (place === undefined) return [];
  // Pas de garde « toutes sous la coupure » : `coupure` ne rend jamais une place qui couvre
  // toute la suite, et une page au moins reste donc au-dessus. Une telle garde a été écrite puis
  // retirée le 6 novembre 2026 — aucune mutation ne la tuait, parce qu'elle était inatteignable.
  const plafond = triees[place - 1]!;
  return qualites.flatMap((qualite, rang) => (qualite <= plafond ? [rang] : []));
}

/** La rotation à retenir pour une page qui lit mal, s'il y en a une.
 *
 *  Le gain demandé n'est pas un pourcentage choisi : **il doit dépasser ce que les pages de ce
 *  document varient déjà entre elles**. Une rotation dont le gain tient dans cette variation
 *  ordinaire ne prouve rien ; celle qui la dépasse a fait autre chose que du bruit.
 *
 *  Une première version exigeait que la page tournée rejoigne ses voisines. **Réfutée par la
 *  mesure du 6 novembre 2026** : la page couchée passe de 45 % à 61 % de vrais mots quand ses
 *  voisines sont à 80 %. Une page de syllabus numérisé ne lira jamais aussi bien qu'une page de
 *  prose — exiger qu'elle y parvienne aurait écarté le seul cas réel connu. */
export function rotationQuiVaut(
  telleQuelle: { readonly qualite: number; readonly motsFiables: number; readonly partHorizontale: number },
  essais: readonly RotationEssayee[],
  voisines: readonly PageNormale[],
): number | undefined {
  if (essais.length === 0 || voisines.length === 0) return undefined;
  const qualites = voisines.map((voisine) => voisine.qualite);
  const variation = Math.max(...qualites) - Math.min(...qualites);
  // **Une rotation ne doit pas perdre de texte.** Une page tournée dans le mauvais sens rend
  // quelques mots au lieu de mille, et la médiane de ces quelques mots peut être excellente :
  // mesuré le 6 novembre 2026 sur une page gravée dont la rotation à 90° rendait **un
  // seul mot**, noté 0,892 là où la page entière valait 0,423.
  //
  // Compter les mots **tout court** ne suffisait pas, et m'a trompé : une page couchée rend
  // autant de « mots » qu'une page droite — 1 391 contre 1 376 — mais un sur six seulement est
  // fiable. Le compte brut faisait gagner 180°, qui laisse la page couchée.
  // **Quatre conditions, et chacune a son défaut à empêcher.**
  //
  // 1. Il faut assez de mots pour que les proportions veuillent dire quelque chose. Une version
  //    tournée qui s'effondre en nombre de mots ne peut pas l'emporter, quelle que soit sa
  //    confiance : la part de mots horizontaux d'une page qui en rend **un** vaut 0 % ou 100 %,
  //    et sa confiance médiane est celle de ce mot.
  //
  //    Le plancher est la page normale **médiane**, et non la moins bavarde. Mesuré le
  //    6 novembre 2026 : la couverture d'un document ne rend que deux mots, et le minimum
  //    laissait alors passer une version tournée qui en rendait trois. La médiane résiste à une
  //    page aberrante — c'est le même raisonnement que pour la norme de fiabilité, et il vaut
  //    mieux qu'elles aient la même logique que chacune la sienne.
  const assezLue = essais.filter((essai) => essai.mots >= mediane(voisines.map((voisine) => voisine.mots)));
  //
  // 2. Les lignes doivent être horizontales. Une page dont la majorité des mots sont plus hauts
  //    que larges est couchée, quoi qu'en dise la reconnaissance — qui lit très bien un texte
  //    vertical. C'est le seul critère qui sépare 90° de 180° : mesuré, 0,953 contre 0,951 en
  //    confiance, mais 87 % contre 12 % en boîtes horizontales.
  // « Une majorité » est le sens du mot, non un seuil réglé.
  const droites = assezLue.filter((essai) => essai.partHorizontale > 0.5);
  // 3. La rotation ne doit pas perdre de **mots fiables**. Compter les mots tout court
  //    comparait du bruit à du signal : une page couchée rend autant de « mots », dont un sur
  //    six seulement est fiable. Et c'est ce qui écarte une page qui, tournée, ne rend plus rien.
  const sansPerte = droites.filter((essai) => essai.motsFiables >= telleQuelle.motsFiables);
  if (sansPerte.length === 0) return undefined;
  // 4. Et le gain doit dépasser ce que les pages de ce document varient déjà entre elles.
  const meilleure = [...sansPerte].sort((un, autre) => autre.qualite - un.qualite)[0]!;
  return meilleure.qualite - telleQuelle.qualite > variation ? meilleure.rotation : undefined;
}

/** Ce qu'un essai d'orientation a donné sur une page : une qualité par sens. */
export type EssaiDOrientation = Readonly<Record<number, number>>;

/** L'orientation d'un document entier, quand il est retourné tout entier (OUT-03).
 *
 *  ## Le trou que cette fonction comble
 *
 *  `pagesQuiLisentMal` compare une page à ses voisines. Un document dont **toutes** les pages
 *  sont mal tournées n'a aucune voisine droite : rien ne se détache, et rien ne se déclenche.
 *  Signalé par Christophe le 6 novembre 2026.
 *
 *  ## Le raisonnement, déjà au dépôt
 *
 *  Le même que celui d'`orientationDuLot` : **un livre est photographié en une séance, dans un
 *  sens**. L'orientation est une propriété du document, pas du cliché. On essaie donc les sens
 *  sur quelques pages, et on exige qu'elles **s'accordent** : une page qui dit 180° et une autre
 *  90°, ce n'est pas l'orientation d'un document, c'est du bruit.
 *
 *  ## Aucun seuil posé
 *
 *  Le gain demandé est le même qu'ailleurs dans ce module : il doit dépasser **ce que les pages
 *  varient déjà entre elles dans leur sens d'origine**. Un document dont les pages lisent entre
 *  50 % et 70 % ne se tourne pas pour trois points de mieux. */
export function orientationDuDocument(essais: readonly EssaiDOrientation[]): number | undefined {
  // Une seule page ne dit rien d'un document : il faut que des pages s'accordent, donc deux au
  // moins. C'est ce que « s'accorder » veut dire, et non un échantillon choisi.
  if (essais.length < 2) return undefined;

  /** Le meilleur sens de chaque page, et ce qu'il lui rapporte. */
  const avis = essais.map((essai) => {
    const sens = Object.keys(essai)
      .map(Number)
      .sort((un, autre) => (essai[autre] ?? 0) - (essai[un] ?? 0));
    const meilleur = sens[0] ?? 0;
    return { sens: meilleur, gain: (essai[meilleur] ?? 0) - (essai[0] ?? 0) };
  });

  // Elles doivent dire la même chose. Un document a un sens, pas plusieurs.
  const propose = avis[0]!.sens;
  if (!avis.every((un) => un.sens === propose)) return undefined;
  // Pas de garde « le sens proposé est zéro » : s'il l'est, le gain vaut zéro et la comparaison
  // qui suit refuse déjà. Une telle garde a été écrite puis retirée le 6 novembre 2026 — aucune
  // mutation ne la tuait.

  // Et le gain doit dépasser ce que les pages varient déjà entre elles, telles qu'elles sont.
  const telles = essais.map((essai) => essai[0] ?? 0);
  const variation = Math.max(...telles) - Math.min(...telles);
  const gain = Math.min(...avis.map((un) => un.gain));
  return gain > variation ? propose : undefined;
}

/** L'orientation d'une page seule, quand il n'y a rien d'autre à comparer (OUT-03).
 *
 *  ## Le troisième trou
 *
 *  `pagesQuiLisentMal` compare une page à ses voisines ; `orientationDuDocument` compare des
 *  pages entre elles. **Un document d'une seule page n'a ni l'une ni l'autre.** Signalé par
 *  Christophe le 6 novembre 2026, après les deux premiers.
 *
 *  ## Ce qu'il reste à comparer
 *
 *  Les quatre sens de cette page. Du texte lu à l'envers ou de côté ne rend pas des mots : le
 *  bon sens se détache des trois autres, et c'est tout ce dont on a besoin.
 *
 *  ## Aucun seuil posé
 *
 *  « Se détacher » se mesure ici comme ailleurs dans ce module : **l'avance du meilleur sur le
 *  suivant doit dépasser ce que les trois perdants varient entre eux**. Une planche gravée, qui
 *  lit également mal dans les quatre sens, ne départage rien — et choisir y reviendrait à tirer
 *  au sort. */
export function orientationDUnePageSeule(essai: EssaiDOrientation): number | undefined {
  const sens = Object.keys(essai).map(Number);
  // Quatre sens, ou la comparaison n'en est pas une : il faut des perdants pour mesurer ce qui
  // se détache.
  if (sens.length < 4) return undefined;
  const classes = [...sens].sort((un, autre) => (essai[autre] ?? 0) - (essai[un] ?? 0));
  const meilleur = classes[0]!;
  if (meilleur === 0) return undefined;
  const notes = classes.map((un) => essai[un] ?? 0);
  const perdants = notes.slice(1);
  const avance = notes[0]! - perdants[0]!;
  const variation = Math.max(...perdants) - Math.min(...perdants);
  return avance > variation ? meilleur : undefined;
}
