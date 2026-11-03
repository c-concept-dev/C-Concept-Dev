/** Un même signe physique reste-t-il entier quand on le regroupe ?
 *
 *  ## Ce que la mesure cherche
 *
 *  « Même signe » — tailles dans un rapport d'un et demi, abscisses à trois centièmes de page —
 *  est une relation de **tolérance** : elle n'est pas transitive. Deux formes peuvent chacune être
 *  le même signe qu'une troisième sans l'être entre elles. Le regroupement actuel part de la forme
 *  qui a le plus de semblables et prend *ses* semblables : les formes du même signe physique qui
 *  ressemblent au groupe sans ressembler à cette graine-là sont laissées, et forment un second
 *  fragment. Mesuré le 2 novembre 2026 sur un document du corpus : une marque unique sortait en
 *  deux morceaux, l'un sur 8 pages, l'autre sur 31.
 *
 *  Ce banc applique **quatre règles** aux mêmes formes et écrit ce que chacune rend. Il ne décide
 *  rien et ne touche à rien.
 *
 *  Une boîte de référence, donnée en argument, désigne les formes qu'on sait appartenir au signe
 *  cherché. Le banc écrit alors deux choses :
 *
 *  1. **l'étendue propre du signe** — celle qui décide tout. Une règle à boule ne peut réunir un
 *     signe dont les tailles s'écartent plus que la tolérance : aucun centre n'atteint les deux
 *     bords. Si ce nombre dépasse le rapport admis, ce n'est pas la règle qu'il faut changer ;
 *  2. **en combien de groupes le signe se disperse**, règle par règle.
 *
 *  Aucune reconnaissance : la question est géométrique. Les formes d'un document sont gardées en
 *  cache, pour qu'essayer une cinquième règle ne coûte pas un nouveau rendu.
 *
 *  Usage : comment-regrouper.ts <document.pdf> <dossier du vivier> [l min,l max,h min,h max[,x min,x max]]
 *          (la boîte de référence en pourcentages de la page)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { enGris, formesSombres } from "@lienotheque/images";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { COTE_MAXIMAL, COTE_MINIMAL, pagesPourUneMarque, type FormeObservee } from "@lienotheque/noyau";

const LARGEUR_DE_RENDU = 1800;
const RAPPORT_DE_TAILLE = 1.5;
const MEME_ABSCISSE = 0.03;
const GROUPES_MONTRES = 40;
/** Au-delà, une composante connexe a soudé autre chose que le signe : inutile de la finir. */
const SOUDURE_AVEREE = 20;

const pdf = process.argv[2]!;
const dossier = process.argv[3]!;
const boite = process.argv[4]?.split(",").map((part) => Number.parseFloat(part) / 100);
const reference =
  boite !== undefined && boite.length >= 4
    ? { lMin: boite[0]!, lMax: boite[1]!, hMin: boite[2]!, hMax: boite[3]!, xMin: boite[4] ?? 0, xMax: boite[5] ?? 1 }
    : undefined;

const vivier = readdirSync(dossier).filter((nom) => /\.(mp3|m4a|wav)$/iu.test(nom)).length;

// ── Les formes sombres de chaque page, en cache ─────────────────────────────────────────
const cache = join(process.env["TMPDIR"] ?? "/tmp", "formes-de-page");
mkdirSync(cache, { recursive: true });
const empreinte = `${pdf.replaceAll(/[^a-z0-9]/giu, "-").slice(-80)}-${statSync(pdf).size}-${LARGEUR_DE_RENDU}`;
const fichier = join(cache, `${empreinte}.json`);

let pages: number;
let formes: FormeObservee[];
if (existsSync(fichier)) {
  ({ pages, formes } = JSON.parse(readFileSync(fichier, "utf8")) as { pages: number; formes: FormeObservee[] });
  console.log(`document : ${pdf.split("/").pop()}  (formes reprises du cache)`);
} else {
  const rendu = await ouvrirRenduPdf(pdf);
  pages = rendu.nombreDePages;
  formes = [];
  for (let numero = 1; numero <= pages; numero += 1) {
    const image = enGris(await rendu.page(numero, LARGEUR_DE_RENDU));
    for (const { boite: vue } of formesSombres(image))
      formes.push({
        page: numero,
        x: vue.x / image.largeur,
        y: vue.y / image.hauteur,
        l: vue.l / image.largeur,
        h: vue.h / image.hauteur,
      });
  }
  await rendu.fermer();
  writeFileSync(fichier, JSON.stringify({ pages, formes }));
  console.log(`document : ${pdf.split("/").pop()}`);
}

const retenues = formes.filter(
  (forme) => forme.l >= COTE_MINIMAL && forme.h >= COTE_MINIMAL && forme.l <= COTE_MAXIMAL && forme.h <= COTE_MAXIMAL,
);
/** Le plancher, donné en argument pour qu'on mesure ce qu'un autre changerait.
 *
 *  Celui du produit demande à une marque d'élément d'être **aussi nombreuse que ce qu'elle
 *  désigne**, c'est-à-dire parfaite : aucun élément sans sa marque imprimée, aucune page qui en
 *  porte deux, aucune manquée par la recherche de formes. Mesuré le 2 novembre 2026, un recueil
 *  du corpus porte huit marques pour neuf enregistrements — et sa marque est écartée avant toute
 *  lecture, par ce seul compte. */
const minimum = Number.parseInt(process.argv[5] ?? String(pagesPourUneMarque(pages, vivier)), 10);
const plancherDePages = minimum;
console.log(
  `vivier   : ${vivier} ; ${pages} page(s) ; ${formes.length} forme(s) dont ${retenues.length} dans les bornes ; ` +
    `plancher ${minimum} apparition(s), ${plancherDePages} page(s)`,
);

const part = (valeur: number): string => (valeur * 100).toFixed(1);
const dansLaReference = (forme: FormeObservee): boolean =>
  reference !== undefined &&
  forme.l >= reference.lMin &&
  forme.l <= reference.lMax &&
  forme.h >= reference.hMin &&
  forme.h <= reference.hMax &&
  forme.x >= reference.xMin &&
  forme.x <= reference.xMax;
const cibles = retenues.filter(dansLaReference);

// ── L'étendue propre du signe : le nombre qui décide ────────────────────────────────────
if (reference !== undefined) {
  const ls = cibles.map((forme) => forme.l);
  const hs = cibles.map((forme) => forme.h);
  const xs = cibles.map((forme) => forme.x);
  const rapport = (valeurs: readonly number[]): number => Math.max(...valeurs) / Math.min(...valeurs);
  console.log(
    `référence: ${cibles.length} forme(s) sur ${new Set(cibles.map((forme) => forme.page)).size} page(s)  ` +
      `l ${part(Math.min(...ls))}–${part(Math.max(...ls))} % (rapport ${rapport(ls).toFixed(2)})  ` +
      `h ${part(Math.min(...hs))}–${part(Math.max(...hs))} % (rapport ${rapport(hs).toFixed(2)})  ` +
      `x ${part(Math.min(...xs))}–${part(Math.max(...xs))} % (écart ${part(Math.max(...xs) - Math.min(...xs))})`,
  );
  const atteignable =
    rapport(ls) <= RAPPORT_DE_TAILLE &&
    rapport(hs) <= RAPPORT_DE_TAILLE &&
    Math.max(...xs) - Math.min(...xs) <= MEME_ABSCISSE;
  console.log(
    `           une règle à boule de rapport ${RAPPORT_DE_TAILLE} et d'écart ${MEME_ABSCISSE} ` +
      `${atteignable ? "**peut**" : "**ne peut pas**"} réunir ce signe`,
  );
}
console.log();

// ── Les relations de ressemblance ───────────────────────────────────────────────────────
const memeTaille = (un: FormeObservee, autre: FormeObservee): boolean =>
  Math.max(un.l, autre.l) <= Math.min(un.l, autre.l) * RAPPORT_DE_TAILLE &&
  Math.max(un.h, autre.h) <= Math.min(un.h, autre.h) * RAPPORT_DE_TAILLE;
const memeSigne = (un: FormeObservee, autre: FormeObservee): boolean =>
  memeTaille(un, autre) && Math.abs(un.x - autre.x) <= MEME_ABSCISSE;

/** Les formes qu'il vaut la peine de comparer à celle-ci : seules les abscisses voisines peuvent
 *  être le même signe, et le reste du document n'a pas à être parcouru pour l'apprendre. */
const indexer = (formes: readonly FormeObservee[]): Map<number, FormeObservee[]> => {
  const casiers = new Map<number, FormeObservee[]>();
  for (const forme of formes) {
    const clef = Math.floor(forme.x / MEME_ABSCISSE);
    const casier = casiers.get(clef);
    if (casier === undefined) casiers.set(clef, [forme]);
    else casier.push(forme);
  }
  return casiers;
};
const voisines = (casiers: Map<number, FormeObservee[]>, forme: FormeObservee): FormeObservee[] => {
  const clef = Math.floor(forme.x / MEME_ABSCISSE);
  return [...(casiers.get(clef - 1) ?? []), ...(casiers.get(clef) ?? []), ...(casiers.get(clef + 1) ?? [])];
};

const medianeDe = (groupe: readonly FormeObservee[], choisir: (forme: FormeObservee) => number): number => {
  const triees = groupe.map(choisir).sort((un, autre) => un - autre);
  return triees[Math.floor(triees.length / 2)] ?? 0;
};
/** Le représentant d'un groupe : sa forme médiane, qui n'a pas à exister. */
const representant = (groupe: readonly FormeObservee[]): FormeObservee => ({
  page: 0,
  y: 0,
  l: medianeDe(groupe, (forme) => forme.l),
  h: medianeDe(groupe, (forme) => forme.h),
  x: medianeDe(groupe, (forme) => forme.x),
});

/** La graine la plus entourée, et ses semblables : le cœur commun des règles A, C et D. */
function laPlusEntouree(restantes: readonly FormeObservee[]): FormeObservee[] {
  const casiers = indexer(restantes);
  let meilleur: FormeObservee[] = [];
  for (const candidate of restantes) {
    const semblables = voisines(casiers, candidate).filter((forme) => memeSigne(candidate, forme));
    if (semblables.length > meilleur.length) meilleur = semblables;
  }
  return meilleur;
}

// ── Règle A : la règle en place, une graine et ses semblables ───────────────────────────
function parGraine(formes: readonly FormeObservee[]): FormeObservee[][] {
  let restantes = [...formes];
  const groupes: FormeObservee[][] = [];
  while (restantes.length >= minimum) {
    const meilleur = laPlusEntouree(restantes);
    if (meilleur.length < minimum) break;
    const retire = new Set(meilleur);
    restantes = restantes.filter((forme) => !retire.has(forme));
    groupes.push(meilleur);
  }
  return groupes;
}

// ── Règle B : la composante connexe du signe, arrêtée dès qu'elle a soudé ───────────────
//
// La fermeture transitive réunit tout ce qui se touche de proche en proche. On ne la calcule pas
// sur le document entier — inutile et coûteux : on part des formes de la référence et on
// s'arrête dès que la composante dépasse de loin ce que le signe peut être. Ce qu'on cherche à
// savoir n'est pas sa taille exacte, c'est **si elle emporte autre chose**.
function composanteDuSigne(formes: readonly FormeObservee[]): {
  taille: number;
  soudee: boolean;
  etendue: { l: [number, number]; h: [number, number]; x: [number, number] };
} | undefined {
  if (cibles.length === 0) return undefined;
  const casiers = indexer(formes);
  const dedans = new Set<FormeObservee>(cibles);
  let frontiere: FormeObservee[] = [...cibles];
  const plafond = Math.max(SOUDURE_AVEREE * cibles.length, 200);
  while (frontiere.length > 0 && dedans.size < plafond) {
    const suivante: FormeObservee[] = [];
    for (const forme of frontiere)
      for (const voisine of voisines(casiers, forme))
        if (!dedans.has(voisine) && memeSigne(forme, voisine)) {
          dedans.add(voisine);
          suivante.push(voisine);
        }
    frontiere = suivante;
  }
  const toutes = [...dedans];
  const borne = (choisir: (forme: FormeObservee) => number): [number, number] => [
    Math.min(...toutes.map(choisir)),
    Math.max(...toutes.map(choisir)),
  ];
  return {
    taille: dedans.size,
    soudee: dedans.size >= plafond,
    etendue: { l: borne((forme) => forme.l), h: borne((forme) => forme.h), x: borne((forme) => forme.x) },
  };
}

// ── Règle C : le représentant raffiné ───────────────────────────────────────────────────
//
// On part de la même graine, puis on recentre : le groupe devient ce qui ressemble à sa propre
// médiane, et l'on recommence jusqu'à ce qu'il ne bouge plus. Rien ne s'enchaîne — on compare
// toujours à un seul représentant — mais ce représentant n'est plus une forme particulière.
function parRepresentant(formes: readonly FormeObservee[]): FormeObservee[][] {
  let restantes = [...formes];
  const groupes: FormeObservee[][] = [];
  while (restantes.length >= minimum) {
    let meilleur = laPlusEntouree(restantes);
    if (meilleur.length < minimum) break;
    const casiers = indexer(restantes);
    for (let tour = 0; tour < 10; tour += 1) {
      const centre = representant(meilleur);
      const autour = voisines(casiers, centre).filter((forme) => memeSigne(centre, forme));
      if (autour.length < minimum) break;
      const avant = new Set(meilleur);
      if (autour.length === avant.size && autour.every((forme) => avant.has(forme))) break;
      meilleur = autour;
    }
    const retire = new Set(meilleur);
    restantes = restantes.filter((forme) => !retire.has(forme));
    groupes.push(meilleur);
  }
  return groupes;
}

// ── Règle E : l'ensemble des formes qui sont le même signe **entre elles** ──────────────
//
// « Même signe » décrit une boîte : un rapport de tailles, un écart d'abscisses. Le groupe est
// alors ce qui tient dans **une** boîte, et non ce qui entoure une forme. La différence n'est pas
// de nuance : une boule centrée sur une forme admet, d'un bord à l'autre, le carré du rapport —
// 2,25 au lieu de 1,5 — et son centre est imposé par une forme particulière au lieu d'être choisi.
//
// On essaie la boîte dont le **coin** est chaque forme : l'optimum se trouve toujours ainsi, une
// boîte pouvant être poussée jusqu'à ce que chacun de ses bords bas touche une forme.
function parBoite(formes: readonly FormeObservee[]): FormeObservee[][] {
  let restantes = [...formes];
  const groupes: FormeObservee[][] = [];
  const dansLaBoite = (coin: FormeObservee, forme: FormeObservee): boolean =>
    forme.l >= coin.l &&
    forme.l <= coin.l * RAPPORT_DE_TAILLE &&
    forme.h >= coin.h &&
    forme.h <= coin.h * RAPPORT_DE_TAILLE &&
    forme.x >= coin.x &&
    forme.x <= coin.x + MEME_ABSCISSE;
  while (restantes.length >= minimum) {
    const casiers = indexer(restantes);
    let meilleur: FormeObservee[] = [];
    for (const coin of restantes) {
      const dedans = voisines(casiers, coin).filter((forme) => dansLaBoite(coin, forme));
      if (dedans.length > meilleur.length) meilleur = dedans;
    }
    if (meilleur.length < minimum) break;
    const retire = new Set(meilleur);
    restantes = restantes.filter((forme) => !retire.has(forme));
    groupes.push(meilleur);
  }
  return groupes;
}

// ── Règle F : la taille en boîte, l'abscisse en boule ───────────────────────────────────
//
// Les deux grandeurs ne disent pas la même chose, et la mesure le montre : sur un document de
// référence, la marque tient sa taille à un rapport de 1,02 d'un bout à l'autre du recueil, et
// son abscisse dérive de cinq points et demi, parce qu'elle suit la marge de sa page. La taille
// est une propriété du signe, à tenir entre tous ses exemplaires ; l'abscisse n'est qu'une
// colonne, à tenir autour d'un centre.
function parTailleEtColonne(formes: readonly FormeObservee[]): FormeObservee[][] {
  let restantes = [...formes];
  const groupes: FormeObservee[][] = [];
  const memeSigneQue = (coin: FormeObservee, forme: FormeObservee): boolean =>
    forme.l >= coin.l &&
    forme.l <= coin.l * RAPPORT_DE_TAILLE &&
    forme.h >= coin.h &&
    forme.h <= coin.h * RAPPORT_DE_TAILLE &&
    Math.abs(forme.x - coin.x) <= MEME_ABSCISSE;
  while (restantes.length >= minimum) {
    const casiers = indexer(restantes);
    let meilleur: FormeObservee[] = [];
    for (const coin of restantes) {
      const dedans = voisines(casiers, coin).filter((forme) => memeSigneQue(coin, forme));
      if (dedans.length > meilleur.length) meilleur = dedans;
    }
    if (meilleur.length < minimum) break;
    const retire = new Set(meilleur);
    restantes = restantes.filter((forme) => !retire.has(forme));
    groupes.push(meilleur);
  }
  return groupes;
}

// ── Règle G : la taille en boîte, puis la colonne la plus fournie ───────────────────────
//
// La règle F demande à une seule forme deux services contradictoires : être le plus petit
// exemplaire, pour borner la taille par le bas, et se tenir au milieu, pour que la colonne porte
// jusqu'aux deux bords. Mesuré sur le document de référence, l'arbitrage lui coûte quatorze
// apparitions. On choisit donc la taille d'abord, et la colonne ensuite — pour elle-même, en la
// faisant glisser sur tout le document plutôt qu'en la centrant sur l'ancre.
function parTaillePuisColonne(formes: readonly FormeObservee[]): FormeObservee[][] {
  let restantes = [...formes];
  const groupes: FormeObservee[][] = [];
  const memeTailleQue = (coin: FormeObservee, forme: FormeObservee): boolean =>
    forme.l >= coin.l && forme.l <= coin.l * RAPPORT_DE_TAILLE && forme.h >= coin.h && forme.h <= coin.h * RAPPORT_DE_TAILLE;
  /** La tranche d'abscisses la plus fournie, large de deux fois l'écart admis. */
  const colonneLaPlusFournie = (candidates: readonly FormeObservee[]): FormeObservee[] => {
    const triees = [...candidates].sort((un, autre) => un.x - autre.x);
    let meilleur: FormeObservee[] = [];
    let debut = 0;
    for (let fin = 0; fin < triees.length; fin += 1) {
      while (triees[fin]!.x - triees[debut]!.x > MEME_ABSCISSE * 2) debut += 1;
      if (fin - debut + 1 > meilleur.length) meilleur = triees.slice(debut, fin + 1);
    }
    return meilleur;
  };
  while (restantes.length >= minimum) {
    // L'ancre se choisit dans le voisinage, comme pour les autres règles : ce qui compte ici est
    // la taille, et deux formes de même taille dans deux colonnes éloignées ne se disputent pas.
    const casiers = indexer(restantes);
    let ancre: FormeObservee | undefined;
    let combien = 0;
    for (const coin of restantes) {
      const dedans = voisines(casiers, coin).filter(
        (forme) => memeTailleQue(coin, forme) && Math.abs(forme.x - coin.x) <= MEME_ABSCISSE,
      ).length;
      if (dedans > combien) [ancre, combien] = [coin, dedans];
    }
    if (ancre === undefined) break;
    const meilleur = colonneLaPlusFournie(restantes.filter((forme) => memeTailleQue(ancre!, forme)));
    if (meilleur.length < minimum) break;
    const retire = new Set(meilleur);
    restantes = restantes.filter((forme) => !retire.has(forme));
    groupes.push(meilleur);
  }
  return groupes;
}

// ── Règle H : les trois fenêtres cherchées chacune pour elle-même ───────────────────────
//
// « Même signe » pose trois fenêtres : une sur la largeur, une sur la hauteur, une sur
// l'abscisse. Les règles précédentes en fixent au moins une d'après une forme particulière — son
// ancre, sa graine —, et c'est toujours là qu'elles perdent des exemplaires : une ancre qui borne
// la taille par le bas écarte tout ce qui est plus petit qu'elle.
//
// Ici, aucune fenêtre n'est accrochée à une forme. On part de la meilleure ancre, puis on fait
// glisser chaque fenêtre à son tour, les deux autres étant tenues, jusqu'à ce que plus aucune ne
// bouge. Chaque glissement ne peut qu'augmenter le compte, donc cela s'arrête.
function parTroisFenetres(formes: readonly FormeObservee[]): FormeObservee[][] {
  let restantes = [...formes];
  const groupes: FormeObservee[][] = [];

  /** Le départ de la fenêtre la plus fournie, parmi les valeurs données. `largeur` dit comment la
   *  fenêtre s'étend : un rapport pour une taille, une addition pour une abscisse. */
  const meilleurDepart = (valeurs: readonly number[], bout: (depart: number) => number): number => {
    const triees = [...valeurs].sort((un, autre) => un - autre);
    let depart = triees[0] ?? 0;
    let combien = 0;
    let debut = 0;
    for (let fin = 0; fin < triees.length; fin += 1) {
      while (triees[fin]! > bout(triees[debut]!)) debut += 1;
      if (fin - debut + 1 > combien) [depart, combien] = [triees[debut]!, fin - debut + 1];
    }
    return depart;
  };

  while (restantes.length >= minimum) {
    const casiers = indexer(restantes);
    let ancre: FormeObservee | undefined;
    let combien = 0;
    for (const coin of restantes) {
      const dedans = voisines(casiers, coin).filter((forme) => memeSigne(coin, forme)).length;
      if (dedans > combien) [ancre, combien] = [coin, dedans];
    }
    if (ancre === undefined) break;

    // Le glissement s'arrête au premier endroit où plus rien ne bouge, et cet endroit dépend
    // d'où l'on part : mesuré, un départ centré sur l'ancre et un départ qui la prend pour bord
    // haut ne rendent pas le même groupe. Aucun des deux n'a de raison d'être le bon — on les
    // essaie donc tous les trois, et c'est le plus fourni qui est retenu.
    let meilleur: FormeObservee[] = [];
    for (const place of [1, Math.sqrt(RAPPORT_DE_TAILLE), RAPPORT_DE_TAILLE]) {
      let [basL, basH, basX] = [ancre.l / place, ancre.h / place, ancre.x - MEME_ABSCISSE];
      const tientEnL = (forme: FormeObservee): boolean => forme.l >= basL && forme.l <= basL * RAPPORT_DE_TAILLE;
      const tientEnH = (forme: FormeObservee): boolean => forme.h >= basH && forme.h <= basH * RAPPORT_DE_TAILLE;
      const tientEnX = (forme: FormeObservee): boolean => forme.x >= basX && forme.x <= basX + MEME_ABSCISSE * 2;
      const dedans = (): FormeObservee[] =>
        restantes.filter((forme) => tientEnL(forme) && tientEnH(forme) && tientEnX(forme));

      // Chaque fenêtre glisse sur ce que les **deux autres** retiennent, et non sur la sélection
      // courante : sinon elle ne pourrait jamais atteindre une forme qu'elle-même exclut, et l'on
      // s'arrêterait au premier choix de l'ancre — le défaut que cette règle corrige.
      for (let tour = 0; tour < 10; tour += 1) {
        const avant = `${basL} ${basH} ${basX}`;
        const parRapport = (depart: number): number => depart * RAPPORT_DE_TAILLE;
        basL = meilleurDepart(
          restantes.filter((forme) => tientEnH(forme) && tientEnX(forme)).map((forme) => forme.l),
          parRapport,
        );
        basH = meilleurDepart(
          restantes.filter((forme) => tientEnL(forme) && tientEnX(forme)).map((forme) => forme.h),
          parRapport,
        );
        basX = meilleurDepart(
          restantes.filter((forme) => tientEnL(forme) && tientEnH(forme)).map((forme) => forme.x),
          (depart) => depart + MEME_ABSCISSE * 2,
        );
        if (`${basL} ${basH} ${basX}` === avant) break;
      }
      const abouti = dedans();
      if (abouti.length > meilleur.length) meilleur = abouti;
    }
    if (meilleur.length < minimum) break;
    const retire = new Set(meilleur);
    restantes = restantes.filter((forme) => !retire.has(forme));
    groupes.push(meilleur);
  }
  return groupes;
}

// ── Règle D : la règle en place, puis les groupes qui sont le même signe sont réunis ────
//
// L'enchaînement est interdit entre formes, autorisé entre **groupes** : deux groupes se
// réunissent si leurs représentants sont le même signe. Le nombre de groupes étant petit, ce qui
// peut se souder est borné — c'est la différence avec la règle B.
function parFusionDesGroupes(formes: readonly FormeObservee[]): FormeObservee[][] {
  const groupes = parGraine(formes);
  let bouge = true;
  while (bouge) {
    bouge = false;
    for (let un = 0; un < groupes.length && !bouge; un += 1)
      for (let autre = un + 1; autre < groupes.length && !bouge; autre += 1)
        if (memeSigne(representant(groupes[un]!), representant(groupes[autre]!))) {
          groupes[un] = [...groupes[un]!, ...groupes[autre]!];
          groupes.splice(autre, 1);
          bouge = true;
        }
  }
  return groupes.sort((un, autre) => autre.length - un.length);
}

// ── Ce que chaque règle rend ────────────────────────────────────────────────────────────
const composante = composanteDuSigne(retenues);
if (composante !== undefined)
  console.log(
    `╔═ B — composante connexe du signe ═ ${composante.taille} forme(s)` +
      `${composante.soudee ? " — **soudée**, arrêtée au plafond" : ""}\n` +
      `║  étendue l ${part(composante.etendue.l[0])}–${part(composante.etendue.l[1])} ` +
      `h ${part(composante.etendue.h[0])}–${part(composante.etendue.h[1])} ` +
      `x ${part(composante.etendue.x[0])}–${part(composante.etendue.x[1])} %\n`,
  );

for (const [nom, regle] of [
  ["A — graine et semblables (en place)", parGraine],
  ["C — représentant raffiné", parRepresentant],
  ["D — graine puis fusion des groupes", parFusionDesGroupes],
  ["E — ce qui tient dans une boîte", parBoite],
  ["F — taille en boîte, abscisse en boule", parTailleEtColonne],
  ["G — taille en boîte, puis colonne cherchée", parTaillePuisColonne],
  ["H — trois fenêtres cherchées", parTroisFenetres],
] as const) {
  const depart = Date.now();
  const groupes = regle(retenues).filter(
    (groupe) => new Set(groupe.map((forme) => forme.page)).size >= plancherDePages,
  );
  const tries = [...groupes].sort((un, autre) => autre.length - un.length);
  console.log(`╔═ ${nom} ═ ${groupes.length} groupe(s) retenu(s)  (${((Date.now() - depart) / 1000).toFixed(0)} s)`);
  if (reference !== undefined) {
    const portant = tries
      .map((groupe, place) => ({ place, combien: groupe.filter(dansLaReference).length }))
      .filter(({ combien }) => combien > 0);
    console.log(
      `║  formes du signe : ${portant.reduce((somme, { combien }) => somme + combien, 0)}/${cibles.length} ` +
        `dans ${portant.length} groupe(s) — ` +
        `${portant.map(({ place, combien }) => `n°${place + 1} : ${combien}`).join(", ") || "aucun"}`,
    );
  }
  const montres = new Set<number>(tries.slice(0, GROUPES_MONTRES).keys());
  for (const [place, groupe] of tries.entries()) if (groupe.some(dansLaReference)) montres.add(place);
  for (const place of [...montres].sort((un, autre) => un - autre)) {
    const groupe = tries[place]!;
    const ls = groupe.map((forme) => forme.l);
    const hs = groupe.map((forme) => forme.h);
    const xs = groupe.map((forme) => forme.x);
    const marque = groupe.filter(dansLaReference).length;
    console.log(
      `║  n°${String(place + 1).padStart(2)} ${String(groupe.length).padStart(5)} apparition(s) ` +
        `sur ${String(new Set(groupe.map((forme) => forme.page)).size).padStart(3)} page(s)  ` +
        `médiane ${part(medianeDe(groupe, (forme) => forme.l))}×${part(medianeDe(groupe, (forme) => forme.h))} % ` +
        `vers ${part(medianeDe(groupe, (forme) => forme.x))} %  ` +
        `étendue l ${part(Math.min(...ls))}–${part(Math.max(...ls))} ` +
        `h ${part(Math.min(...hs))}–${part(Math.max(...hs))} ` +
        `x ${part(Math.min(...xs))}–${part(Math.max(...xs))}` +
        (marque > 0 ? `  ← ${marque} du signe` : ""),
    );
  }
  console.log();
}
