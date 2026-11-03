/** Lire un nombre près d'un signe, sans rien supposer de sa polarité ni de son échelle.
 *
 *  ## Ce que la mesure cherche
 *
 *  Le lecteur de marque reçoit trois choses de la voie, et sur certains documents les trois sont
 *  fausses ensemble :
 *
 *  1. **la fenêtre** — la boîte de la forme qui revient, élargie d'un dixième. Or cette forme
 *     désigne un endroit, pas forcément le nombre : rendu en image le 2 novembre 2026, un
 *     document du corpus pose son nombre **sous** le pictogramme, hors cadre ;
 *  2. **la polarité** — ses deux motifs s'appellent `..._sombre_chiffres_clairs` : ils nomment
 *     leur supposition. Ce document porte un pavé clair avec son chiffre en noir ;
 *  3. **l'échelle** — `hauteurNumero` vaut la hauteur de la forme qui revient, et le lecteur
 *     écarte toute forme plus étroite que six dixièmes de cette hauteur. Un « 1 » posé à côté
 *     d'un pictogramme deux fois plus haut que lui est éliminé pour cause de minceur.
 *
 *  Les essais du 2 novembre ont tenté les deux premières, séparément puis ensemble : vingt
 *  combinaisons de fenêtres, de motifs et de polarités, aucune ne rendant la suite attendue. Mais
 *  ces essais renversaient la **page entière** avant de la donner au lecteur — ce qui ne lit pas
 *  un chiffre sombre, cela fabrique une page noire où la recherche de forme sombre trouve le
 *  papier. La troisième supposition, elle, n'a jamais été touchée.
 *
 *  Ce banc prend le problème autrement : il lit la fenêtre **telle qu'elle est imprimée**, sans
 *  chercher de pavé, sans renverser, sans échelle attendue — l'encre sombre sur le papier clair,
 *  comme n'importe quel texte. Et il la lit aussi comme le produit la lit, pour que les deux
 *  figurent côte à côte sur les mêmes pixels.
 *
 *  Usage : lire-sans-supposer.ts <doc.pdf> <dossier du vivier> <largeur %> <hauteur %> <abscisse %> [attendu séparé par des virgules]
 */
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  agrandir,
  border,
  enGris,
  formesSombres,
  inverser,
  recadrer,
  seuiller,
  versPgm,
  type Boite,
  type ImageGrise,
} from "@lienotheque/images";
import { lireParOcr, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { lireDansLaFenetre, tonClair, vote } from "@lienotheque/recettes";

const MOTEURS = realpathSync(
  "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-main-fusion-wt/tools/lienotheque/apps/app/src-tauri/moteurs",
);
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const LARGEUR_DE_RENDU = 1800;
const APPARITIONS_POUR_JUGER = 12;
const RAPPORT = 1.5;
const MEME_ABSCISSE = 0.03;
const CHIFFRES = "0123456789";

const pdf = process.argv[2]!;
const dossier = process.argv[3]!;
const cible = {
  l: Number.parseFloat(process.argv[4]!) / 100,
  h: Number.parseFloat(process.argv[5]!) / 100,
  x: Number.parseFloat(process.argv[6]!) / 100,
};
const attendu = process.argv[7]?.split(",").map((valeur) => Number.parseInt(valeur, 10));
const vivier = readdirSync(dossier).filter((nom) => /\.(mp3|m4a|wav)$/iu.test(nom)).length;

// ── Une lecture nue : ces pixels-là, cet alphabet-là, rien d'autre ──────────────────────
const atelier = mkdtempSync(join(tmpdir(), "lienotheque-mesure-"));
let compteur = 0;
function lireLesChiffres(image: ImageGrise, segmentation: number): string {
  if (image.largeur === 0 || image.hauteur === 0) return "";
  const chemin = join(atelier, `vue-${(compteur += 1)}.pgm`);
  writeFileSync(chemin, versPgm(image));
  try {
    return lireParOcr(chemin, image.largeur, image.hauteur, 1, { segmentation, alphabet: CHIFFRES, ...OCR }).mots
      .map((mot) => mot.texte)
      .join("");
  } finally {
    rmSync(chemin, { force: true });
  }
}
const premierEntier = (texte: string): number | undefined => {
  const trouve = /(\d+)/.exec(texte.trim());
  return trouve === null ? undefined : Number(trouve[1]);
};

/** Lire la fenêtre comme un texte imprimé : encre sombre, papier clair, aucune forme cherchée.
 *
 *  C'est le contraire de ce que fait le produit, qui cherche d'abord un pavé sombre à la taille
 *  attendue et lit ses chiffres clairs. Ici, rien n'est attendu : on seuille, on agrandit, on
 *  borde, on lit. Les votes de plusieurs seuils et de deux segmentations tiennent lieu de
 *  prudence, comme ailleurs. */
function lireLEncre(zone: ImageGrise): number | undefined {
  const clair = Math.max(1, tonClair(zone));
  const votes: number[] = [];
  for (const seuil of [0.45, 0.6, 0.75]) {
    const net = border(agrandir(seuiller(zone, Math.round(clair * seuil)), 5), 25);
    for (const segmentation of [7, 8]) {
      const lu = premierEntier(lireLesChiffres(net, segmentation));
      if (lu !== undefined && lu > 0 && lu < 100) votes.push(lu);
    }
  }
  return vote(votes)?.valeur;
}

/** La même chose, pour un chiffre clair sur fond sombre : on renverse **la fenêtre**, pas la page.
 *
 *  La distinction est tout : renverser la page fait du papier une surface noire, et la recherche
 *  de forme sombre y trouve alors le papier. Renverser la fenêtre ne change que ce qu'on lit. */
function lireLeCreux(zone: ImageGrise): number | undefined {
  const clair = Math.max(1, tonClair(zone));
  const votes: number[] = [];
  for (const seuil of [0.45, 0.6, 0.75]) {
    const net = border(agrandir(inverser(seuiller(zone, Math.round(clair * seuil))), 5), 25);
    for (const segmentation of [7, 8]) {
      const lu = premierEntier(lireLesChiffres(net, segmentation));
      if (lu !== undefined && lu > 0 && lu < 100) votes.push(lu);
    }
  }
  return vote(votes)?.valeur;
}

/** Lire ce qui est **écrit** dans la fenêtre, avec tout l'alphabet, et n'en garder que les nombres.
 *
 *  C'est la voie la plus générique des quatre, et la seule qui ne suppose rien de la forme du
 *  signe. Une étiquette imprimée à côté du chiffre — le mot qui annonce la piste — revient alors
 *  en lettres et s'écarte d'elle-même, au lieu d'être forcée en chiffres par une liste blanche.
 *  Les segmentations tentées vont du bloc au texte épars : un nombre posé sous un pictogramme
 *  n'est pas sur la même ligne que lui. */
function lireLeTexte(zone: ImageGrise): number | undefined {
  const clair = Math.max(1, tonClair(zone));
  const votes: number[] = [];
  for (const seuil of [0.45, 0.6, 0.75]) {
    const net = border(agrandir(seuiller(zone, Math.round(clair * seuil)), 4), 20);
    for (const segmentation of [6, 7, 11]) {
      const chemin = join(atelier, `texte-${(compteur += 1)}.pgm`);
      writeFileSync(chemin, versPgm(net));
      try {
        const mots = lireParOcr(chemin, net.largeur, net.hauteur, 1, { segmentation, ...OCR }).mots;
        for (const mot of mots) {
          const nombre = /^\s*(\d{1,2})\s*$/.exec(mot.texte);
          if (nombre !== null) {
            const lu = Number(nombre[1]);
            if (lu > 0 && lu < 100) votes.push(lu);
          }
        }
      } finally {
        rmSync(chemin, { force: true });
      }
    }
  }
  return vote(votes)?.valeur;
}

// ── Les apparitions de la cible ─────────────────────────────────────────────────────────
const rendu = await ouvrirRenduPdf(pdf);
const pages = rendu.nombreDePages;
console.log(`document : ${pdf.split("/").pop()}`);
console.log(`vivier   : ${vivier} ; ${pages} page(s)\n`);

const prises: { page: number; boite: Boite; image: ImageGrise }[] = [];
for (let numero = 1; numero <= pages && prises.length < APPARITIONS_POUR_JUGER; numero += 1) {
  const image = enGris(await rendu.page(numero, LARGEUR_DE_RENDU));
  for (const { boite } of formesSombres(image)) {
    const l = boite.l / image.largeur;
    const h = boite.h / image.hauteur;
    const x = boite.x / image.largeur;
    const taille =
      Math.max(l, cible.l) <= Math.min(l, cible.l) * RAPPORT && Math.max(h, cible.h) <= Math.min(h, cible.h) * RAPPORT;
    if (!taille || Math.abs(x - cible.x) > MEME_ABSCISSE) continue;
    prises.push({ page: numero, boite, image });
    break;
  }
}
await rendu.fermer();
console.log(
  `cible ${(cible.l * 100).toFixed(1)}×${(cible.h * 100).toFixed(1)} % vers ${(cible.x * 100).toFixed(0)} % ` +
    `— ${prises.length} apparition(s) : pages ${prises.map(({ page }) => page).join(", ")}`,
);
if (attendu !== undefined) console.log(`attendu  : [${attendu.join(", ")}]`);
console.log();

// ── Les fenêtres essayées, en multiples de la forme ─────────────────────────────────────
const FENETRES = [
  { nom: "la sienne", haut: 0, bas: 0, gauche: 0, droite: 0 },
  { nom: "+1 bas   ", haut: 0, bas: 1, gauche: 0, droite: 0 },
  { nom: "+2 bas   ", haut: 0, bas: 2, gauche: 0, droite: 0 },
  // Sans direction : le nombre est **près** du signe, et rien ne dit de quel côté. Une fenêtre
  // qui s'ouvre également des quatre côtés ne choisit pas pour l'auteur du document.
  { nom: "+1 autour", haut: 1, bas: 1, gauche: 1, droite: 1 },
  { nom: "+2 autour", haut: 2, bas: 2, gauche: 2, droite: 2 },
] as const;
const fenetreDe = (
  boite: Boite,
  image: ImageGrise,
  cotes: { haut: number; bas: number; gauche: number; droite: number },
): Boite => {
  const x = Math.max(0, Math.round(boite.x - boite.l * (0.1 + cotes.gauche)));
  const y = Math.max(0, Math.round(boite.y - boite.h * (0.1 + cotes.haut)));
  return {
    x,
    y,
    l: Math.min(image.largeur - x, Math.round(boite.l * (1.2 + cotes.gauche + cotes.droite))),
    h: Math.min(image.hauteur - y, Math.round(boite.h * (1.2 + cotes.haut + cotes.bas))),
  };
};

const juste = (valeurs: readonly (number | undefined)[]): string =>
  attendu === undefined
    ? ""
    : `  justes ${valeurs.filter((valeur, rang) => valeur !== undefined && valeur === attendu[rang]).length}/${attendu.length}`;

for (const fenetre of FENETRES) {
  const vues = prises.map(({ boite, image }) => recadrer(image, fenetreDe(boite, image, fenetre)));
  const parLeProduit = prises.map(({ boite, image }) =>
    vote(
      lireDansLaFenetre(
        image,
        fenetreDe(boite, image, fenetre),
        Math.round(cible.h * image.hauteur),
        "losange_sombre_chiffres_clairs",
        false,
        OCR,
      ).votes,
    )?.valeur,
  );
  for (const [nom, valeurs] of [
    ["le produit", parLeProduit],
    ["l'encre   ", vues.map(lireLEncre)],
    ["le creux  ", vues.map(lireLeCreux)],
    ["le texte  ", vues.map(lireLeTexte)],
  ] as const)
    console.log(
      `  ${fenetre.nom}  ${nom}  ` +
        `lues ${valeurs.filter((valeur) => valeur !== undefined).length}/${prises.length}${juste(valeurs)}  ` +
        `[${valeurs.map((valeur) => valeur ?? "—").join(", ")}]`,
    );
  console.log();
}
rmSync(atelier, { recursive: true, force: true });
