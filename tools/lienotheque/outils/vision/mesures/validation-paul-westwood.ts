/** Rejeu réel de Paul Westwood après séparation en deux dépôts, un disque par dépôt.
 *
 * L'oracle ne vient pas des sorties du lecteur : il est construit depuis le motif structuré des
 * noms de médias (`disque-piste ... - element Pg.page`). Le rejeu utilise la recette Paul
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

const VOLUMES = [
  {
    id: "paul-westwood-volume-1",
    pdf:
      process.env["LIENOTHEQUE_PAUL_WESTWOOD_VOLUME_1"] ??
      "/Volumes/Macbook Pro/Basse/Paul westwood pdf et MP3/Paul Westwood 1/Bass Bible Vol 1 - World History Of Styles & Techniques [Disc 1]/Paul westwood 1-2.pdf",
    medias:
      process.env["LIENOTHEQUE_PAUL_WESTWOOD_MEDIAS_1"] ??
      "/Volumes/Macbook Pro/Basse/Paul westwood pdf et MP3/Paul Westwood 1/Bass Bible Vol 1 - World History Of Styles & Techniques [Disc 1]",
    disque: 1,
  },
  {
    id: "paul-westwood-volume-2",
    pdf:
      process.env["LIENOTHEQUE_PAUL_WESTWOOD_VOLUME_2"] ??
      "/Volumes/Macbook Pro/Basse/Paul westwood pdf et MP3/Paul Westwood 2/Bass Bible Vol 2 - World History Of Styles (Book)/Paul westwood 2-5.pdf",
    medias:
      process.env["LIENOTHEQUE_PAUL_WESTWOOD_MEDIAS_2"] ??
      "/Volumes/Macbook Pro/Basse/Paul westwood pdf et MP3/Paul Westwood 2/Bass Bible Vol 2 - World History Of Styles (Book)",
    disque: 2,
  },
] as const;

const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const resultats = [];
for (const volume of VOLUMES) {
  const medias = await mediasDuDossier(volume.medias, recette);
  const oracle = medias.flatMap((media) => {
    const indices = lireNomMedia(basename(media.nom, ".mp3"), motif);
    return indices.element === undefined || indices.piste === undefined
      ? []
      : [{ numero: indices.element, piste: indices.piste, disque: indices.disque }];
  });
  if (oracle.length !== medias.length || oracle.some((attendu) => attendu.disque !== volume.disque))
    throw new Error(`${volume.id}: oracle média incomplet ou disque inattendu`);

  const debut = Date.now();
  let dernier = -1;
  const joue = await rejouer(volume.pdf, volume.medias, recette, {
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
    disque: volume.disque,
    dureeSecondes: Math.round((Date.now() - debut) / 1000),
    pagesLogiques: joue.resultat.pages.length,
    medias: medias.length,
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

const sortie = join(coin(cache, "rapports-c9-3"), `paul-westwood-separe-${new Date().toISOString().replaceAll(":", "-")}.json`);
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
