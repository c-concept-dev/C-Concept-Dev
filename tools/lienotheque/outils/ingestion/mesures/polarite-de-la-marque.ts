/** Le lecteur de marque suppose des chiffres **clairs** sur une forme **sombre**. Et si la page
 *  porte l'inverse ?
 *
 *  ## Ce que la mesure cherche
 *
 *  Les deux motifs du lecteur s'appellent `losange_sombre_chiffres_clairs` et
 *  `bloc_sombre_chiffres_clairs` : ils nomment leur propre supposition. Rendu en image le
 *  2 novembre 2026, un document du corpus porte un pavé **gris clair** avec son chiffre **en
 *  noir** — l'exact contraire. Le lecteur y rend le même nombre presque partout.
 *
 *  Ce banc lit chaque endroit **deux fois** : l'image telle quelle, puis la même image renversée
 *  en valeurs. Si la seconde rend une numérotation là où la première rend du bruit, le défaut est
 *  dans la supposition de polarité et non dans le critère qui juge les lectures. Rien n'est
 *  touché dans le produit : on compare deux suites de chiffres.
 *
 *  Usage : polarite-de-la-marque.ts <document.pdf> <dossier du vivier> [plancher]
 */
import { readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { enGris, formesSombres, type Boite, type ImageGrise } from "@lienotheque/images";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { COTE_MAXIMAL, COTE_MINIMAL, pagesPourUneMarque, type FormeObservee } from "@lienotheque/noyau";
import { lireDansLaFenetre, vote } from "@lienotheque/recettes";

const MOTEURS = realpathSync(
  "/Users/christophebonnet/Documents/GitHub/C-Concept-Dev-main-fusion-wt/tools/lienotheque/apps/app/src-tauri/moteurs",
);
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const LARGEUR_DE_RENDU = 1800;
const APPARITIONS_POUR_JUGER = 12;
const MOTIFS = ["losange_sombre_chiffres_clairs", "bloc_sombre_chiffres_clairs"] as const;

const pdf = process.argv[2]!;
const dossier = process.argv[3]!;
const plancher = Number.parseFloat(process.argv[4] ?? "0.1");
const vivier = readdirSync(dossier).filter((nom) => /\.(mp3|m4a|wav)$/iu.test(nom)).length;

/** La même image, ses valeurs renversées. Rien d'autre ne change : même taille, mêmes formes. */
const renversee = (image: ImageGrise): ImageGrise => ({
  largeur: image.largeur,
  hauteur: image.hauteur,
  pixels: Uint8Array.from(image.pixels, (valeur) => 255 - valeur),
});

const rendu = await ouvrirRenduPdf(pdf);
const pages = rendu.nombreDePages;
console.log(`document : ${pdf.split("/").pop()}`);
console.log(`vivier   : ${vivier} ; ${pages} page(s)\n`);

const grises = new Map<number, ImageGrise>();
const formes: FormeObservee[] = [];
for (let numero = 1; numero <= pages; numero += 1) {
  const image = enGris(await rendu.page(numero, LARGEUR_DE_RENDU));
  grises.set(numero, image);
  for (const { boite } of formesSombres(image))
    formes.push({
      page: numero,
      x: boite.x / image.largeur,
      y: boite.y / image.hauteur,
      l: boite.l / image.largeur,
      h: boite.h / image.hauteur,
    });
}
await rendu.fermer();

const RAPPORT_DE_TAILLE = 1.5;
const MEME_ABSCISSE = 0.03;
const memeSigne = (un: FormeObservee, autre: FormeObservee): boolean =>
  Math.max(un.l, autre.l) <= Math.min(un.l, autre.l) * RAPPORT_DE_TAILLE &&
  Math.max(un.h, autre.h) <= Math.min(un.h, autre.h) * RAPPORT_DE_TAILLE &&
  Math.abs(un.x - autre.x) <= MEME_ABSCISSE;

let restantes = formes.filter(
  (forme) => forme.l >= COTE_MINIMAL && forme.h >= COTE_MINIMAL && forme.l <= COTE_MAXIMAL && forme.h <= COTE_MAXIMAL,
);
const minimum = Math.max(2, Math.min(Math.ceil(pages * plancher), pagesPourUneMarque(pages, vivier)));
const zones: { apparitions: FormeObservee[]; pages: number[]; taille: { l: number; h: number }; x: number }[] = [];
while (restantes.length >= minimum) {
  let graine: FormeObservee | undefined;
  let meilleur: FormeObservee[] = [];
  for (const candidate of restantes) {
    const semblables = restantes.filter((forme) => memeSigne(candidate, forme));
    if (semblables.length > meilleur.length) [graine, meilleur] = [candidate, semblables];
  }
  if (graine === undefined || meilleur.length < minimum) break;
  const retire = new Set(meilleur);
  restantes = restantes.filter((forme) => !retire.has(forme));
  const sesPages = [...new Set(meilleur.map((forme) => forme.page))].sort((un, autre) => un - autre);
  if (sesPages.length < minimum) continue;
  const medianeDe = (choisir: (forme: FormeObservee) => number): number =>
    [...meilleur].map(choisir).sort((un, autre) => un - autre)[Math.floor(meilleur.length / 2)]!;
  zones.push({
    apparitions: meilleur,
    pages: sesPages,
    taille: { l: medianeDe((forme) => forme.l), h: medianeDe((forme) => forme.h) },
    x: Math.min(...meilleur.map((forme) => forme.x)),
  });
}
console.log(`${zones.length} endroit(s)\n`);

const fenetre = (apparition: FormeObservee, image: ImageGrise): Boite => {
  const l = apparition.l * image.largeur;
  const h = apparition.h * image.hauteur;
  return {
    x: Math.round(apparition.x * image.largeur - l * 0.1),
    y: Math.round(apparition.y * image.hauteur - h * 0.1),
    l: Math.round(l * 1.2),
    h: Math.round(h * 1.2),
  };
};
const echantillon = (apparitions: readonly FormeObservee[]): readonly FormeObservee[] => {
  const triees = [...apparitions].sort((un, autre) => un.page - autre.page || un.y - autre.y);
  if (triees.length <= APPARITIONS_POUR_JUGER) return triees;
  const pas = triees.length / APPARITIONS_POUR_JUGER;
  return Array.from({ length: APPARITIONS_POUR_JUGER }, (_, place) => triees[Math.floor(place * pas)]!);
};

for (const zone of zones) {
  const pris = echantillon(zone.apparitions);
  console.log(
    `endroit ${(zone.taille.l * 100).toFixed(1)}×${(zone.taille.h * 100).toFixed(1)} % vers ${(zone.x * 100).toFixed(0)} % ` +
      `— ${zone.apparitions.length} apparition(s) sur ${zone.pages.length} page(s)`,
  );
  for (const motif of MOTIFS)
    for (const renverser of [false, true]) {
      const valeurs = pris.map((apparition) => {
        const entiere = grises.get(apparition.page)!;
        const image = renverser ? renversee(entiere) : entiere;
        const bloc = lireDansLaFenetre(
          image,
          fenetre(apparition, entiere),
          Math.round(zone.taille.h * entiere.hauteur),
          motif,
          false,
          OCR,
        );
        return vote(bloc.votes)?.valeur;
      });
      console.log(
        `   ${motif.startsWith("losange") ? "losange" : "bloc   "} ${renverser ? "renversé " : "tel quel"} : ` +
          `[${valeurs.map((valeur) => valeur ?? "—").join(", ")}]`,
      );
    }
  console.log();
}
