/** Des citations retrouvées, à vérifier **à l'œil contre l'image** de la page (BAS-02)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx \
 *        mesures/citations-a-verifier.ts <document.pdf> <dossier de sortie> [combien] [langue]
 *
 *  ## Pourquoi l'œil, et pourquoi pas la couche
 *
 *  Sur un document **natif**, `du-depot-a-la-recherche.ts` vérifie seul : il recherche la phrase
 *  une seconde fois dans le PDF, et la couche **est** le texte imprimé.
 *
 *  Sur un document **numérisé**, ce raisonnement s'effondre : le texte vient de la reconnaissance,
 *  et la couche est précisément ce qu'on cherche à valider. Vérifier la reconnaissance avec la
 *  couche reviendrait à demander à l'accusé de témoigner pour lui-même. **Seule l'image de la
 *  page fait foi**, et seul un œil peut la lire.
 *
 *  Ce banc prépare donc la comparaison et s'arrête là : la citation telle que la recherche la
 *  rend, et l'image de la feuille telle qu'elle est imprimée, côte à côte. Il ne conclut pas.
 *
 *  ## Ce qu'il faut vérifier sur chaque fiche
 *
 *  | | |
 *  |---|---|
 *  | le **texte** | la phrase citée est bien celle qui est imprimée |
 *  | la **moitié** | elle est du côté annoncé, gauche ou droite |
 *  | le **numéro** | le folio imprimé sur cette moitié est celui que la recherche annonce |
 *
 *  Le troisième est le plus important : c'est la promesse « toujours sur la vraie page » (RCH-09).
 *  Une citation juste sur une page mal numérotée reste invérifiable.
 *
 *  ## Les œuvres restent dehors
 *
 *  Le dossier de sortie vit **hors du dépôt** : il porte des pages d'un ouvrage sous droits
 *  (règle 5). Rien n'est publié.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Passage, VueBibliotheque } from "@lienotheque/contrats";
import { objetsPdf, octetsImage, pagesPdf } from "@lienotheque/formats";
import { chercher } from "@lienotheque/noyau";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "../src/index.js";

const [chemin, sortie, combien = "3", langue = "fr"] = process.argv.slice(2);
if (chemin === undefined || sortie === undefined) {
  console.error("Attendu : <document.pdf> <dossier de sortie> [combien] [langue]");
  process.exit(2);
}
if (!existsSync(chemin)) {
  console.error(`Introuvable : ${chemin}`);
  process.exit(2);
}
const COMBIEN = Number.parseInt(combien, 10);

const base = mkdtempSync(join(tmpdir(), "lienotheque-citations-"));
mkdirSync(join(sortie, "pages"), { recursive: true });

try {
  // **Par la porte, et rien qu'elle.**
  //
  // Ce banc lisait par `lireLeTexte` et cherchait dans un dépôt monté à la main : deux chemins
  // que l'application n'emprunte pas. Il a ainsi produit, le 20 octobre 2026, trois citations
  // vérifiées à l'œil **sur une coupe en deux que le produit ne faisait pas** — la manière de
  // lire déclarait « une page par feuille » et la chaîne lui obéissait. Les citations étaient
  // justes ; elles ne disaient rien de ce que l'application rend.
  //
  // Désormais : `executerTravail`, l'aller-retour JSON que l'hôte fait subir au résultat, et
  // `chercher`, la fonction même de l'écran de recherche.
  const medias = join(base, "medias");
  const images = join(base, "images");
  mkdirSync(medias);
  mkdirSync(images);

  const description = join(base, "bibliotheque.json");
  writeFileSync(
    description,
    JSON.stringify({
      id: "essai-des-citations",
      nom: "Essai",
      mots: {
        element: { un: "élément", plusieurs: "éléments" },
        piste: { un: "piste", plusieurs: "pistes" },
        page: { un: "page", plusieurs: "pages" },
      },
      schema: {
        cle: "essai",
        nom: "Essai",
        langue,
        version: 1,
        axes: [
          {
            cle: "un-axe",
            nom: "Un axe",
            nature: "referentiel",
            cardinalite: "une",
            structure: "plat",
            obligatoire: false,
            alias: [],
            valeurs: [{ cle: "une", nom: "Une valeur", alias: [], synonymes: [], retiree: false }],
          },
        ],
      },
    }),
  );

  // **Aucune déclaration de double page** : c'est au document de répondre, et c'est précisément
  // ce qu'on vient vérifier.
  const recette = join(base, "maniere.json");
  writeFileSync(
    recette,
    JSON.stringify({
      id: "livre-ordinaire",
      version: 1,
      derivee_de: null,
      preparation: { redressement: "aucun" },
      lectures: [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", x: 0.05, y: 0.86, l: 0.9, h: 0.12 }, alphabet: "chiffres" }],
      regles: { elements: { ordre: "strictement_croissant", saut_max: 12 }, plusieurs_elements_par_piste: false },
      validation: { seuil_confiance: 0.6 },
    }),
  );

  process.stderr.write(`lecture par la porte (langue de la bibliothèque : « ${langue} »)…\n`);
  const charge = chargeOuEchec(
    await executerTravail(
      demandeDeTraitement(randomUUID(), randomUUID(), { document: chemin, medias, recette, description, images }),
      { emettre: (message) => (message.type === "journal" ? process.stderr.write(`  journal · ${message.texte}\n`) : undefined) },
    ),
  );
  const relu = JSON.parse(JSON.stringify(charge)) as { vue: unknown; passages: unknown[] };
  const vue = VueBibliotheque.parse(relu.vue);
  const passages = relu.passages.map((un) => Passage.parse(un));
  process.stderr.write(`  ${passages.length} passages\n`);

  // Les feuilles du document, pour en tirer l'image de celle qu'une citation désigne.
  const donnees = Buffer.from(await readFile(chemin));
  const objets = objetsPdf(donnees);
  const imagesParFeuille = new Map<number, number>();
  pagesPdf(objets).forEach((feuille, rang) => {
    const premiere = feuille.images[0];
    if (premiere !== undefined) imagesParFeuille.set(rang + 1, premiere.numero);
  });

  // Une feuille porte-t-elle deux pages ? On le déduit du compte : deux fois plus de pages lues
  // que de feuilles dans le document signifie que la chaîne a coupé.
  const feuilles = pagesPdf(objets).length;
  const coupe = passages.length > feuilles * 1.5;

  type Fiche = { numero: number; phrase: string; page: number; folio?: number; feuille: number; moitie: string; image: string };
  const fiches: Fiche[] = [];

  // Des citations prises loin les unes des autres : trois pages voisines diraient trois fois la
  // même chose du même endroit du livre.
  for (let rang = 1; rang <= COMBIEN; rang += 1) {
    const cible = passages[Math.floor((passages.length * rang) / (COMBIEN + 1))];
    if (cible === undefined) continue;
    const mots = cible.texte.split(/\s+/).filter((mot) => mot !== "");
    const depuis = mots.findIndex((mot, index) => index > mots.length / 4 && /^[\p{L}]{6,}$/u.test(mot));
    if (depuis < 0) continue;
    const phrase = mots.slice(depuis, depuis + 6).join(" ");

    // La recherche de l'écran, sur ce que l'hôte lui sert.
    const groupes = chercher(vue, phrase, { passages });
    const rendu = groupes.find((groupe) => groupe.genre === "page")?.resultats[0];
    // Le passage qui porte réellement la phrase : c'est lui qui donne le rang, dont se déduisent
    // la feuille et sa moitié. La recherche, elle, cite par le numéro imprimé.
    const porteur = passages.find((candidat) => candidat.texte.includes(phrase));
    if (rendu === undefined || porteur === undefined) {
      process.stderr.write(`  « ${phrase} » : introuvable, écartée\n`);
      continue;
    }

    const page = porteur.page;
    const feuille = coupe ? Math.ceil(page / 2) : page;
    const numero = imagesParFeuille.get(feuille);
    if (numero === undefined) continue;
    const octets = octetsImage(objets, numero);
    if (octets === undefined || octets.extension !== "jpg") continue;

    const nomImage = `feuille-${String(feuille).padStart(3, "0")}.jpg`;
    writeFileSync(join(sortie, "pages", nomImage), octets.octets);
    fiches.push({
      numero: fiches.length + 1,
      phrase,
      page,
      ...(porteur.pageImprimee === undefined ? {} : { folio: porteur.pageImprimee }),
      feuille,
      moitie: coupe ? (page % 2 === 1 ? "gauche" : "droite") : "la feuille entière",
      image: `pages/${nomImage}`,
    });
  }

  const echapper = (texte: string): string =>
    texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const cartes = fiches
    .map(
      (fiche) => `
<section class="fiche">
  <h2>${fiche.numero} / ${fiches.length}</h2>
  <p class="dit">La recherche dit&nbsp;: <strong>page ${fiche.page}</strong>,
     ${fiche.folio === undefined ? "<em>sans numéro imprimé</em>" : `numéro imprimé <strong>${fiche.folio}</strong>`},
     sur la feuille ${fiche.feuille}, moitié <strong>${fiche.moitie}</strong>.</p>
  <div class="corps">
    <figure><img loading="lazy" src="${echapper(fiche.image)}" alt="Feuille ${fiche.feuille}"></figure>
    <div class="citation">
      <h3>La citation retrouvée</h3>
      <p class="phrase">«&nbsp;${echapper(fiche.phrase)}&nbsp;»</p>
      <ul class="quoi">
        <li>Le <strong>texte</strong> est-il bien celui qui est imprimé&nbsp;?</li>
        <li>Est-il sur la moitié <strong>${fiche.moitie}</strong>&nbsp;?</li>
        <li>${fiche.folio === undefined
          ? "Cette moitié porte-t-elle un numéro imprimé que la recherche n'a pas lu&nbsp;?"
          : `Le folio imprimé sur cette moitié est-il bien <strong>${fiche.folio}</strong>&nbsp;?`}</li>
      </ul>
    </div>
  </div>
</section>`,
    )
    .join("\n");

  const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Citations à vérifier</title>
<style>
  :root { color-scheme: light dark; --fond: #F7F5F2; --encre: #1E2124; --trait: #D5CFC7; --appui: #8A5A3B; }
  @media (prefers-color-scheme: dark) { :root { --fond: #16181A; --encre: #E8E4DE; --trait: #3C4046; --appui: #C98B5E; } }
  body { margin: 0; background: var(--fond); color: var(--encre);
         font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  header, .fiche { max-width: 1180px; margin: 0 auto; padding: 24px 16px; }
  header { border-bottom: 1px solid var(--trait); }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .fiche { border-bottom: 1px solid var(--trait); }
  .fiche h2 { font-size: 15px; margin: 0 0 4px; color: var(--appui); }
  .dit { margin: 0 0 14px; font-size: 14px; }
  .corps { display: grid; grid-template-columns: minmax(300px, 1.3fr) minmax(260px, 1fr); gap: 20px; align-items: start; }
  @media (max-width: 860px) { .corps { grid-template-columns: 1fr; } }
  figure { margin: 0; }
  img { width: 100%; height: auto; border: 1px solid var(--trait); background: #fff; cursor: zoom-in; }
  img.agrandie { position: fixed; inset: 0; z-index: 9; width: 100vw; height: 100vh;
                 object-fit: contain; background: var(--fond); cursor: zoom-out; }
  .citation { border: 1px solid var(--trait); padding: 12px 14px; background: color-mix(in srgb, var(--fond) 80%, #fff); }
  .citation h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; opacity: .7; }
  .phrase { margin: 0 0 14px; font-size: 17px; }
  .quoi { margin: 0; padding-left: 20px; font-size: 14px; }
  .quoi li { margin-bottom: 6px; }
</style>
</head>
<body>
<header>
  <h1>Citations à vérifier</h1>
  <p>${echapper(basename(chemin))} — document numérisé, texte venu de la reconnaissance.</p>
  <p><strong>La couche texte ne peut pas servir de preuve ici</strong>&nbsp;: c'est elle qu'on
     valide. Seule l'image de la feuille fait foi, et seul votre œil peut la lire.</p>
  <p>Cliquez une image pour l'agrandir.</p>
</header>
${cartes}
<script>
  for (const image of document.querySelectorAll("img"))
    image.addEventListener("click", () => image.classList.toggle("agrandie"));
</script>
</body>
</html>
`;

  writeFileSync(join(sortie, "citations.html"), page, "utf8");
  console.log(`\n  ${fiches.length} citation(s) préparée(s).`);
  for (const fiche of fiches)
    console.log(`  ${fiche.numero}. page ${fiche.page}, folio ${fiche.folio ?? "—"}, feuille ${fiche.feuille} (${fiche.moitie})`);
  console.log(`\n  À ouvrir : ${join(sortie, "citations.html")}`);
} finally {
  rmSync(base, { recursive: true, force: true });
}
