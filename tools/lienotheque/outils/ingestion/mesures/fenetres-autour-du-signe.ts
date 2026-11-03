/** Le nombre est-il dans la forme qui revient, ou à côté d'elle ?
 *
 *  ## Ce que la mesure cherche
 *
 *  La voie lit un endroit dans **une** fenêtre : la boîte de la forme, élargie d'un dixième. Rendu
 *  en image le 2 novembre 2026, un document du corpus montre que cette fenêtre ne contient qu'un
 *  pictogramme — le nombre est posé dessous, hors cadre. Aucun critère et aucune polarité ne
 *  peuvent lire ce qui n'est pas dans l'image qu'on leur donne.
 *
 *  Ce banc lit la même forme dans plusieurs fenêtres ancrées sur elle : la sienne, puis la même
 *  étendue d'une hauteur vers le bas, d'une largeur vers la droite, et des deux. Il n'ajoute aucune
 *  forme connue : il cherche le nombre **autour** du signe au lieu de le supposer dedans.
 *
 *  Sans géométrie donnée, il se contente de lister les endroits que la régularité propose, sans
 *  aucune reconnaissance — de quoi choisir la cible sans payer la lecture.
 *
 *  Usage : fenetres-autour-du-signe.ts <doc.pdf> <dossier du vivier> [largeur %] [hauteur %] [abscisse %]
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
const RAPPORT = 1.5;
const MEME_ABSCISSE = 0.03;

const pdf = process.argv[2]!;
const dossier = process.argv[3]!;
const cible =
  process.argv.length >= 7
    ? { l: Number.parseFloat(process.argv[4]!) / 100, h: Number.parseFloat(process.argv[5]!) / 100, x: Number.parseFloat(process.argv[6]!) / 100 }
    : undefined;
const vivier = readdirSync(dossier).filter((nom) => /\.(mp3|m4a|wav)$/iu.test(nom)).length;

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

if (cible === undefined) {
  // ── Sans cible : les endroits que la régularité propose, sans lire ────────────────────
  const memeSigne = (un: FormeObservee, autre: FormeObservee): boolean =>
    Math.max(un.l, autre.l) <= Math.min(un.l, autre.l) * RAPPORT &&
    Math.max(un.h, autre.h) <= Math.min(un.h, autre.h) * RAPPORT &&
    Math.abs(un.x - autre.x) <= MEME_ABSCISSE;
  let restantes = formes.filter(
    (forme) => forme.l >= COTE_MINIMAL && forme.h >= COTE_MINIMAL && forme.l <= COTE_MAXIMAL && forme.h <= COTE_MAXIMAL,
  );
  const minimum = pagesPourUneMarque(pages, vivier);
  const trouvees: { l: number; h: number; x: number; apparitions: number; pages: number }[] = [];
  while (restantes.length >= minimum) {
    let meilleur: FormeObservee[] = [];
    for (const candidate of restantes) {
      const semblables = restantes.filter((forme) => memeSigne(candidate, forme));
      if (semblables.length > meilleur.length) meilleur = semblables;
    }
    if (meilleur.length < minimum) break;
    const retire = new Set(meilleur);
    restantes = restantes.filter((forme) => !retire.has(forme));
    const sesPages = new Set(meilleur.map((forme) => forme.page));
    if (sesPages.size < minimum) continue;
    const medianeDe = (choisir: (forme: FormeObservee) => number): number =>
      [...meilleur].map(choisir).sort((un, autre) => un - autre)[Math.floor(meilleur.length / 2)]!;
    trouvees.push({
      l: medianeDe((forme) => forme.l),
      h: medianeDe((forme) => forme.h),
      x: Math.min(...meilleur.map((forme) => forme.x)),
      apparitions: meilleur.length,
      pages: sesPages.size,
    });
  }
  console.log(`${trouvees.length} endroit(s), plancher ${minimum} page(s) :`);
  for (const zone of trouvees.slice(0, 16))
    console.log(
      `  ${(zone.l * 100).toFixed(1)}×${(zone.h * 100).toFixed(1)} % vers ${(zone.x * 100).toFixed(0)} %  ` +
        `— ${zone.apparitions} apparition(s) sur ${zone.pages} page(s)`,
    );
  process.exit(0);
}

// ── Avec cible : la même forme, lue dans plusieurs fenêtres ancrées sur elle ────────────
/** Les fenêtres essayées, en multiples de la forme. `bas` et `droite` étendent au-delà d'elle. */
const FENETRES = [
  { nom: "la sienne", bas: 0, droite: 0 },
  { nom: "+1 bas   ", bas: 1, droite: 0 },
  { nom: "+2 bas   ", bas: 2, droite: 0 },
  { nom: "+1 droite", bas: 0, droite: 1 },
  { nom: "+1 des 2 ", bas: 1, droite: 1 },
] as const;

/** La même image, ses valeurs renversées : un chiffre sombre sur fond clair devient ce que le
 *  lecteur sait lire. Les deux essais vont ensemble — une fenêtre juste lue à l'envers ne rend
 *  rien, et une polarité juste sur une fenêtre qui ne contient pas le nombre non plus. */
const renversee = (image: ImageGrise): ImageGrise => ({
  largeur: image.largeur,
  hauteur: image.hauteur,
  pixels: Uint8Array.from(image.pixels, (valeur) => 255 - valeur),
});

const fenetreDe = (boite: Boite, image: ImageGrise, bas: number, droite: number): Boite => {
  const x = Math.max(0, Math.round(boite.x - boite.l * 0.1));
  const y = Math.max(0, Math.round(boite.y - boite.h * 0.1));
  return {
    x,
    y,
    l: Math.min(image.largeur - x, Math.round(boite.l * (1.2 + droite))),
    h: Math.min(image.hauteur - y, Math.round(boite.h * (1.2 + bas))),
  };
};

const prises: { page: number; boite: Boite }[] = [];
for (let numero = 1; numero <= pages && prises.length < APPARITIONS_POUR_JUGER; numero += 1) {
  const image = grises.get(numero)!;
  for (const { boite } of formesSombres(image)) {
    const l = boite.l / image.largeur;
    const h = boite.h / image.hauteur;
    const x = boite.x / image.largeur;
    const taille =
      Math.max(l, cible.l) <= Math.min(l, cible.l) * RAPPORT && Math.max(h, cible.h) <= Math.min(h, cible.h) * RAPPORT;
    if (!taille || Math.abs(x - cible.x) > MEME_ABSCISSE) continue;
    prises.push({ page: numero, boite });
    break;
  }
}
console.log(
  `cible ${(cible.l * 100).toFixed(1)}×${(cible.h * 100).toFixed(1)} % vers ${(cible.x * 100).toFixed(0)} % ` +
    `— ${prises.length} apparition(s) retenue(s) : pages ${prises.map(({ page }) => page).join(", ")}\n`,
);

for (const fenetre of FENETRES)
  for (const motif of MOTIFS)
    for (const renverser of [false, true]) {
    const valeurs = prises.map(({ page, boite }) => {
      const entiere = grises.get(page)!;
      const image = renverser ? renversee(entiere) : entiere;
      const vue = fenetreDe(boite, entiere, fenetre.bas, fenetre.droite);
      const lu = lireDansLaFenetre(image, vue, Math.round(cible.h * entiere.hauteur), motif, false, OCR);
      return vote(lu.votes)?.valeur;
    });
    const lues = valeurs.filter((valeur) => valeur !== undefined).length;
    const dansLeVivier = valeurs.filter((valeur) => valeur !== undefined && valeur >= 1 && valeur <= vivier).length;
    console.log(
      `  ${fenetre.nom}  ${motif.startsWith("losange") ? "losange" : "bloc   "}  ${renverser ? "renversé" : "tel quel"}  ` +
        `lues ${lues}/${prises.length}, dans le vivier ${dansLeVivier}  ` +
        `[${valeurs.map((valeur) => valeur ?? "—").join(", ")}]`,
    );
  }
