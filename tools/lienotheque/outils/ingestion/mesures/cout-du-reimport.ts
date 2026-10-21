/** Ce que coûterait un réimport du corpus, chronométré sur un échantillon (BAS-02)
 *
 *      pnpm --filter @lienotheque/ingestion exec tsx \
 *        mesures/cout-du-reimport.ts <document> [<document>…]
 *
 *  ## Pourquoi ce chiffre avant tout le reste
 *
 *  Deux cent cinquante documents et vingt et un mille cinq cents pages ne disent pas une durée.
 *  Un livre composé en texte se lit à cent soixante-dix pages par seconde ; une feuille numérisée
 *  se lit à quinze secondes par page. Entre les deux il y a un facteur deux mille cinq cents, et
 *  l'on ne sait donc pas si un réimport dure deux heures ou quatre-vingt-dix. Lancer sans ce
 *  chiffre, c'est le découvrir en le subissant.
 *
 *  ## Ce qui est chronométré, et comment
 *
 *  **La porte réelle**, `executerTravail` — pas une lecture de texte prise à part. C'est elle que
 *  l'hôte franchit, images de pages comprises : mesurer plus bas mesurerait autre chose.
 *
 *  **Le cache est neuf à chaque lancement.** Un réimport part d'un cache froid ; réemployer celui
 *  de la journée donnerait des secondes qui ne reviendront jamais.
 *
 *  **Les documents sont pris en entier**, sauf ceux que `--tranche` borne. Une tranche fausse la
 *  numérotation — c'est la décision du 17 octobre — mais **pas la cadence**, qui est tout ce qu'on
 *  lui demande ici. Ce qu'elle rend est donc une vitesse, jamais un résultat.
 *
 *  **Il ne fait que lire.** Aucune œuvre n'entre au dépôt (règle 5) : bibliothèque temporaire,
 *  effacée à la fin.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "../src/index.js";

const arguments_ = process.argv.slice(2);
const borne = arguments_.find((un) => un.startsWith("--tranche="));
const TRANCHE = borne === undefined ? undefined : Number(borne.slice("--tranche=".length));
const chemins = arguments_.filter((un) => !un.startsWith("--"));

if (chemins.length === 0) {
  console.error("Attendu : <document> [<document>…] [--tranche=N]");
  process.exit(2);
}

const dossier = mkdtempSync(join(tmpdir(), "lienotheque-cout-"));
const medias = join(dossier, "medias");
const images = join(dossier, "images");
const cache = join(dossier, "cache");
for (const un of [medias, images, cache]) mkdirSync(un);

const description = join(dossier, "bibliotheque.json");
writeFileSync(
  description,
  JSON.stringify({
    id: "essai-du-cout",
    nom: "Essai",
    mots: {
      element: { un: "élément", plusieurs: "éléments" },
      piste: { un: "piste", plusieurs: "pistes" },
      page: { un: "page", plusieurs: "pages" },
    },
    schema: {
      cle: "essai",
      nom: "Essai",
      langue: "fr",
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

const recette = join(dossier, "maniere.json");
writeFileSync(
  recette,
  JSON.stringify({
    id: "livre-ordinaire",
    version: 1,
    derivee_de: null,
    preparation: { redressement: "aucun", double_page: false },
    lectures: [{ ancre: "page_imprimee", zone: { type: "rectangle_rel", x: 0.05, y: 0.86, l: 0.9, h: 0.12 }, alphabet: "chiffres" }],
    regles: { elements: { ordre: "strictement_croissant", saut_max: 12 }, plusieurs_elements_par_piste: false },
    validation: { seuil_confiance: 0.6 },
  }),
);

type Mesure = {
  readonly nom: string;
  readonly secondes: number;
  readonly pagesDuDocument: number;
  readonly parLaCouche: number;
  readonly parOcr: number;
  readonly sansTexte: number;
  readonly passages: number;
};

const mesures: Mesure[] = [];

try {
  for (const chemin of chemins) {
    const nom = basename(chemin).slice(0, 46);
    if (!existsSync(chemin)) {
      console.log(`  ✗ ${nom} — introuvable`);
      continue;
    }
    let pagesDuDocument = 0;
    const depart = Date.now();
    try {
      const charge = chargeOuEchec(
        await executerTravail(
          demandeDeTraitement(randomUUID(), randomUUID(), {
            document: chemin,
            medias,
            recette,
            description,
            images,
            cache,
            ...(TRANCHE === undefined ? {} : { pages: TRANCHE }),
          }),
          {
            emettre: (message) => {
              if (message.type !== "journal") return;
              const compte = /^(\d+) pages dans le document$/.exec(message.texte);
              if (compte !== null) pagesDuDocument = Number(compte[1]);
            },
          },
        ),
      );
      const secondes = (Date.now() - depart) / 1000;
      const mesure: Mesure = {
        nom,
        secondes,
        pagesDuDocument,
        parLaCouche: charge.lecture.parLaCouche,
        parOcr: charge.lecture.parOcr,
        sansTexte: charge.lecture.sansTexte,
        passages: charge.passages.length,
      };
      mesures.push(mesure);
      const lues = mesure.parLaCouche + mesure.parOcr + mesure.sansTexte;
      console.log(
        `  ${nom} — ${secondes.toFixed(1)} s · ${lues} page(s) lue(s)` +
          ` (${mesure.parLaCouche} couche, ${mesure.parOcr} reconnaissance, ${mesure.sansTexte} sans texte)` +
          ` · ${lues === 0 ? "—" : (secondes / lues).toFixed(2)} s/page`,
      );
    } catch (cause) {
      console.log(`  ✗ ${nom} — ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  // Ce qu'on peut en dire, et rien de plus : une cadence par famille de lecture.
  const pagesLues = (m: Mesure): number => m.parLaCouche + m.parOcr + m.sansTexte;
  const parLaCouche = mesures.filter((m) => m.parOcr === 0 && pagesLues(m) > 0);
  const parOcr = mesures.filter((m) => m.parOcr > 0);

  const cadence = (lot: readonly Mesure[]): string => {
    const pages = lot.reduce((total, m) => total + pagesLues(m), 0);
    const secondes = lot.reduce((total, m) => total + m.secondes, 0);
    return pages === 0 ? "—" : `${(secondes / pages).toFixed(3)} s/page sur ${pages} page(s)`;
  };

  console.log(`\n  Servis par la couche : ${cadence(parLaCouche)}`);
  console.log(`  Passés par la reconnaissance : ${cadence(parOcr)}`);
  console.log(`  Total chronométré : ${mesures.reduce((t, m) => t + m.secondes, 0).toFixed(1)} s`);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
