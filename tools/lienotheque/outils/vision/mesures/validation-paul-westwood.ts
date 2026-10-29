/** Rejeu réel de Paul Westwood sur ses deux PDF et l'inventaire commun des deux disques.
 *
 * L'oracle ne vient pas des sorties du lecteur : il est construit depuis le motif structuré des
 * noms de médias (`disque-piste ... - element Pg.page`). Comme l'application, chaque PDF reçoit
 * tout l'inventaire audio de la bibliothèque : le disque 1 continue jusqu'à la page 196, donc
 * cinquante-trois de ses pistes appartiennent au second PDF. Le rejeu utilise la recette Paul
 * Westwood déjà sécurisée, sans écrire dans une bibliothèque. */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import {
  bilanAssociationCorpus,
  chargerRecette,
  comparer,
  lireNomMedia,
  mediasDuDossier,
  rejouer,
} from "@lienotheque/recettes";

const RACINE = join(import.meta.dirname, "../../..");
const recette = chargerRecette(
  JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-paul-westwood.v1.json"), "utf8")),
);
const motif = recette.audio?.motif_nom;
if (motif === undefined) throw new Error("La recette Paul Westwood ne déclare aucun motif média");

const RACINE_PAUL_WESTWOOD =
  process.env["LIENOTHEQUE_PAUL_WESTWOOD"] ??
  "/Volumes/Macbook Pro/Basse/Paul westwood pdf et MP3";
const MEDIAS_1 = join(
  RACINE_PAUL_WESTWOOD,
  "Paul Westwood 1/Bass Bible Vol 1 - World History Of Styles & Techniques [Disc 1]",
);
const MEDIAS_2 = join(
  RACINE_PAUL_WESTWOOD,
  "Paul Westwood 2/Bass Bible Vol 2 - World History Of Styles (Book)",
);

const VOLUMES = [
  {
    id: "paul-westwood-volume-1",
    pdf:
      process.env["LIENOTHEQUE_PAUL_WESTWOOD_VOLUME_1"] ??
      join(MEDIAS_1, "Paul westwood 1-2.pdf"),
    pageMin: 0,
    pageMax: 113,
    attendus: 39,
  },
  {
    id: "paul-westwood-volume-2",
    pdf:
      process.env["LIENOTHEQUE_PAUL_WESTWOOD_VOLUME_2"] ??
      join(MEDIAS_2, "Paul westwood 2-5.pdf"),
    pageMin: 114,
    pageMax: Number.POSITIVE_INFINITY,
    attendus: 126,
  },
] as const;

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const medias = await mediasDuDossier(RACINE_PAUL_WESTWOOD, recette);
const inventaireMedias = medias.map(({ nom, empreinte }) => ({ nom, empreinte }));
const resultats = [];
for (const volume of VOLUMES) {
  const oracle = medias.flatMap((media) => {
    const indices = lireNomMedia(basename(media.nom, ".mp3"), motif);
    return indices.element === undefined ||
      indices.piste === undefined ||
      indices.page === undefined ||
      indices.page < volume.pageMin ||
      indices.page > volume.pageMax
      ? []
      : [{ numero: indices.element, piste: indices.piste, disque: indices.disque, page: indices.page }];
  });
  if (oracle.length !== volume.attendus)
    throw new Error(`${volume.id}: ${oracle.length} médias dans l'oracle au lieu de ${volume.attendus}`);

  const debut = Date.now();
  let dernier = -1;
  const joue = await rejouer(volume.pdf, RACINE_PAUL_WESTWOOD, recette, {
    inventaireMedias,
    cache: coin(cache, "lectures-c9-3"),
    avancement: (faits, total) => {
      const pourcent = total === 0 ? 0 : Math.floor((faits * 100) / total);
      if (pourcent >= dernier + 10 || faits === total) {
        dernier = pourcent;
        console.log(`${volume.id}: ${faits}/${total} (${pourcent} %)`);
      }
    },
  });
  const score = comparer(joue.resultat.lignes, oracle.map(({ numero, piste }) => ({ numero, piste })));
  const bilan = bilanAssociationCorpus(joue.association);
  resultats.push({
    id: volume.id,
    pdf: basename(volume.pdf),
    pagesOracle: { min: volume.pageMin, max: Number.isFinite(volume.pageMax) ? volume.pageMax : null },
    dureeSecondes: Math.round((Date.now() - debut) / 1000),
    pagesLogiques: joue.resultat.pages.length,
    mediasDansInventaire: medias.length,
    mediasAttendus: oracle.length,
    lignes: joue.resultat.lignes.length,
    automatiques: bilan.automatiques,
    aVerifier: bilan.aVerifier,
    fauxAutomatiques: bilan.fauxAutomatiques.map((appariement) => ({
      numero: appariement.ligne.numero,
      page: appariement.ligne.pageImprimee,
      piste: appariement.ligne.piste,
      media: appariement.media?.nom,
    })),
    pistesManquantes: bilan.pistesManquantes,
    mediasOrphelins: bilan.mediasOrphelins,
    oracle: score,
  });
}

const sortie = join(coin(cache, "rapports-c9-3"), `paul-westwood-global-${new Date().toISOString().replaceAll(":", "-")}.json`);
writeFileSync(sortie, JSON.stringify({ sortie, resultats }, null, 2));
console.log(JSON.stringify({ sortie, resultats }, null, 2));
if (
  resultats.some(
    (resultat) =>
      resultat.fauxAutomatiques.length > 0 ||
      resultat.oracle.justes !== resultat.oracle.attendus ||
      resultat.oracle.manquants.length > 0 ||
      resultat.oracle.fautifs.length > 0 ||
      resultat.oracle.supplementaires.length > 0,
  )
)
  process.exitCode = 2;
