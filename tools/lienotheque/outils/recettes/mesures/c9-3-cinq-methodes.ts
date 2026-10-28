/** Banc reproductible de C9.3 sur cinq méthodes musicales réelles.
 *
 * Par défaut, les cinq corpus sont rejoués. Pour une preuve ciblée sans masquer les autres cas :
 *
 *   LIENOTHEQUE_C9_3_CAS=paul-westwood,aebersold-026 pnpm --filter @lienotheque/recettes exec tsx mesures/c9-3-cinq-methodes.ts
 *
 * Le banc ne copie rien dans une bibliothèque et ne modifie pas les sources. Ses seules écritures
 * vont dans le cache de travail : lectures réutilisables et rapport JSON daté.
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { coin, ouvrirCache } from "@lienotheque/cache";
import {
  jetonDacces,
  transportValidationCiblesVersWorker,
  validationStructurelleCiblee,
} from "../../vision/src/index.js";
import {
  bilanAssociationCorpus,
  chargerRecette,
  comparer,
  lireNomMedia,
  rejouer,
  type MediaInventorie,
  type Recette,
} from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const CORPUS = process.env["LIENOTHEQUE_CORPUS_MUSICAL"] ?? "/Users/christophebonnet/Music/Basse";
const RECETTE_PASTILLES = join(RACINE, "fixtures/recettes/methode-pastilles-cd.v5.json");
const RECETTE_PAUL_WESTWOOD = join(RACINE, "fixtures/recettes/methode-paul-westwood.v1.json");
const RECETTE_F3 = join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json");
const RECETTE_NUMERO_COMPOSE = join(RACINE, "fixtures/recettes/methode-numero-compose-piste.v2.json");
const REFERENCE_FUNK_FUSION = join(RACINE, "fixtures/references/funk-fusion-bass-appariement.json");
const SERVICE_STRUCTUREL =
  process.env["LIENOTHEQUE_DIAGNOSTIC_URL"] ?? "https://lienotheque-api.11drumboy11.workers.dev";
const cache = ouvrirCache({ avertir: (message) => console.warn(message) });
const lectures = coin(cache, "lectures-c9-3");
const rapports = coin(cache, "rapports-c9-3");
const validations = coin(cache, "vision-structurelle");

type Cas = {
  readonly id: string;
  readonly nom: string;
  readonly pdf: string;
  readonly medias: string;
  readonly recette: string;
  readonly attente: "liens_corroborés" | "abstention";
};

const CAS: readonly Cas[] = [
  {
    id: "paul-westwood",
    nom: "Paul Westwood — Bass Bible",
    pdf: join(CORPUS, "Methodes/Paul westwood.pdf"),
    medias: join(CORPUS, "Paul westwood pdf et MP3"),
    recette: RECETTE_PAUL_WESTWOOD,
    attente: "liens_corroborés",
  },
  {
    id: "hal-leonard-funk-fusion",
    nom: "Hal Leonard — Funk Fusion Bass",
    pdf: join(CORPUS, "Basse/Funk Fusion Bass (Hal Leonard - Bass Builders) [Book+CD]/Funk Fusion Bass.pdf"),
    medias: join(CORPUS, "Basse/Funk Fusion Bass (Hal Leonard - Bass Builders) [Book+CD]"),
    recette: RECETTE_NUMERO_COMPOSE,
    attente: "liens_corroborés",
  },
  {
    id: "bass-aerobics",
    nom: "Jon Liebman — Bass Aerobics",
    pdf: join(CORPUS, "Basse/Methode Basse - Bass Aerobics/Bass Aerobics (mp3)/Jon Liebman - Bass Aerobics.pdf"),
    medias: join(CORPUS, "Basse/Methode Basse - Bass Aerobics"),
    recette: RECETTE_PASTILLES,
    attente: "abstention",
  },
  {
    id: "aebersold-026",
    nom: "Aebersold 026 — Scale Syllabus",
    pdf: join(CORPUS, "AEBERSOLDS/Aebersold - 026 - [Scale Syllabus]/CD1/Aebersold 026 - [Scale Syllabus].pdf"),
    medias: join(CORPUS, "AEBERSOLDS/Aebersold - 026 - [Scale Syllabus]"),
    recette: RECETTE_PASTILLES,
    attente: "abstention",
  },
  {
    id: "bass-play-along-5",
    nom: "Bass Play-Along vol. 5 — Funk",
    pdf: join(CORPUS, "Partitions Basses - Funk (Play Along)/Bass Play Along - Vol. 5 FUNK.pdf"),
    medias: join(CORPUS, "Partitions Basses - Funk (Play Along)/Audio"),
    recette: RECETTE_PASTILLES,
    attente: "abstention",
  },
];

async function fichiersMp3(dossier: string): Promise<string[]> {
  const trouves: string[] = [];
  for (const entree of await readdir(dossier, { recursive: true, withFileTypes: true }))
    if (entree.isFile() && entree.name.toLowerCase().endsWith(".mp3") && !entree.name.startsWith("."))
      trouves.push(join(entree.parentPath, entree.name));
  return trouves.sort((a, b) => a.localeCompare(b, "fr"));
}

async function empreinte(chemin: string): Promise<string> {
  const condensat = createHash("sha256");
  for await (const morceau of createReadStream(chemin)) condensat.update(morceau);
  return condensat.digest("hex");
}

async function inventaire(dossier: string): Promise<MediaInventorie[]> {
  const fichiers = await fichiersMp3(dossier);
  const resultat: MediaInventorie[] = [];
  for (const [index, chemin] of fichiers.entries()) {
    if (index % 25 === 0) console.log(`  empreintes médias : ${index}/${fichiers.length}`);
    resultat.push({ nom: relative(dossier, chemin), empreinte: await empreinte(chemin) });
  }
  return resultat;
}

function recette(chemin: string): Recette {
  return chargerRecette(JSON.parse(readFileSync(chemin, "utf8")));
}

for (const cas of CAS) {
  if (!existsSync(cas.pdf) || !existsSync(cas.medias)) throw new Error(`Corpus absent pour ${cas.nom}`);
}

const choisis = new Set(
  (process.env["LIENOTHEQUE_C9_3_CAS"] ?? CAS.map((cas) => cas.id).join(","))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
);

for (const id of choisis) if (!CAS.some((cas) => cas.id === id)) throw new Error(`Cas C9.3 inconnu : ${id}`);

const jetonStructurel = choisis.has("hal-leonard-funk-fusion") ? jetonDacces() : undefined;
if (choisis.has("hal-leonard-funk-fusion") && jetonStructurel === undefined)
  throw new Error("Funk Fusion exige le jeton Liénothèque pour sa validation structurelle ciblée");
const validationStructurelle =
  jetonStructurel === undefined
    ? undefined
    : validationStructurelleCiblee(
        transportValidationCiblesVersWorker(SERVICE_STRUCTUREL, jetonStructurel),
        { cache: validations },
      );

const rapport: Record<string, unknown> = {
  id: randomUUID(),
  produitLe: new Date().toISOString(),
  corpus: CORPUS,
  applicabilite: [],
  rejeux: [],
};
const applicabilite = rapport["applicabilite"] as unknown[];
const rejeux = rapport["rejeux"] as unknown[];

console.log("\nApplicabilité des cinq méthodes");
for (const cas of CAS) {
  const noms = (await fichiersMp3(cas.medias)).map((chemin) => basename(chemin, ".mp3"));
  const maniere = recette(cas.recette);
  const motif = maniere.audio?.motif_nom;
  const exempleElement = maniere.lectures.find((lecture) => lecture.ancre === "element")?.numero?.exemple;
  const interpretes = noms.filter((nom) => lireNomMedia(nom, motif, exempleElement).piste !== undefined).length;
  const ligne = { id: cas.id, nom: cas.nom, medias: noms.length, nomsInterpretes: interpretes, attente: cas.attente };
  applicabilite.push(ligne);
  console.log(`- ${cas.nom}: ${interpretes}/${noms.length} noms interprétés`);
}

for (const cas of CAS.filter((candidat) => choisis.has(candidat.id))) {
  console.log(`\nRejeu intégral : ${cas.nom}`);
  const debut = Date.now();
  const medias = await inventaire(cas.medias);
  let dernier = -1;
  const recetteLue = recette(cas.recette);
  const joue = await rejouer(cas.pdf, cas.medias, recetteLue, {
    inventaireMedias: medias,
    cache: lectures,
    ...(cas.id === "hal-leonard-funk-fusion" && validationStructurelle !== undefined
      ? { validationStructurelle }
      : {}),
    avancement: (faits, total) => {
      const pourcent = total === 0 ? 0 : Math.floor((faits * 100) / total);
      if (pourcent >= dernier + 5 || faits === total) {
        dernier = pourcent;
        console.log(`  lecture : ${faits}/${total} (${pourcent} %)`);
      }
    },
  });
  const bilan = bilanAssociationCorpus(joue.association);
  const oracle =
    cas.id === "hal-leonard-funk-fusion"
      ? (JSON.parse(readFileSync(REFERENCE_FUNK_FUSION, "utf8")) as { appariements: [number, number][] }).appariements.map(
          ([numero, piste]) => ({ numero, piste }),
        )
      : undefined;
  const scoreOracle = oracle === undefined ? undefined : comparer(joue.resultat.lignes, oracle);
  const mesure = {
    id: cas.id,
    nom: cas.nom,
    dureeSecondes: Math.round((Date.now() - debut) / 1000),
    mediasDisponibles: medias.length,
    mediasInterpretes: joue.medias.length,
    lignes: joue.resultat.lignes.length,
    automatiques: bilan.automatiques,
    aVerifier: bilan.aVerifier,
    fauxAutomatiques: bilan.fauxAutomatiques.map((appariement) => ({
      elementLu: appariement.ligne.numero,
      pageLue: appariement.ligne.pageImprimee,
      media: appariement.media?.nom,
      elementDuNom: appariement.media?.element,
      pageDuNom: appariement.media?.page,
    })),
    pistesManquantes: bilan.pistesManquantes,
    mediasOrphelins: bilan.mediasOrphelins,
    abstention: joue.association.abstention,
    ...(scoreOracle === undefined
      ? {}
      : {
          oracle: {
            justes: scoreOracle.justes,
            attendus: scoreOracle.attendus,
            manquants: scoreOracle.manquants,
            fautifs: scoreOracle.fautifs,
            supplementaires: scoreOracle.supplementaires,
          },
        }),
    elementsLus: joue.resultat.lignes.map((ligne) => ({ numero: ligne.numero, page: ligne.pageImprimee, piste: ligne.piste })),
  };
  rejeux.push(mesure);
  console.log(JSON.stringify(mesure, null, 2));

  if (bilan.fauxAutomatiques.length !== 0) throw new Error(`${cas.nom}: ${bilan.fauxAutomatiques.length} faux lien(s) automatique(s)`);
  if (
    scoreOracle !== undefined &&
    (scoreOracle.justes !== scoreOracle.attendus ||
      scoreOracle.manquants.length !== 0 ||
      scoreOracle.fautifs.length !== 0 ||
      scoreOracle.supplementaires.length !== 0)
  )
    throw new Error(`${cas.nom}: ${scoreOracle.justes}/${scoreOracle.attendus} associations conformes à la vérité terrain`);
  if (cas.attente === "abstention" && (bilan.automatiques !== 0 || joue.association.abstention === undefined))
    throw new Error(`${cas.nom}: le moteur ne s'est pas abstenu explicitement`);
}

// F3 est le témoin positif obligatoire : protéger des faux positifs ne doit pas supprimer ses
// 95 associations exactes.
if (choisis.has("paul-westwood") || choisis.has("aebersold-026")) {
  console.log("\nTémoin F3 : 70s Funk & Disco Bass");
  const pdf = join(CORPUS, "Basse/Funk & Disco Bass/70 Funk & Disco Bass/'70s Funk & Disco Bass.pdf");
  const dossier = join(CORPUS, "Basse/Funk & Disco Bass/70 Funk & Disco Bass");
  const reference = JSON.parse(readFileSync(join(RACINE, "docs/prototypes/70s_Funk_Disco_appariement_mp3.json"), "utf8")) as {
    appariements: { exercice: number; piste: number }[];
  };
  const joue = await rejouer(pdf, dossier, recette(RECETTE_F3), { cache: lectures });
  const score = comparer(
    joue.resultat.lignes,
    reference.appariements.map((attendu) => ({ numero: attendu.exercice, piste: attendu.piste })),
  );
  const mesure = {
    id: "f3-temoin",
    justes: score.justes,
    attendus: score.attendus,
    manquants: score.manquants,
    fautifs: score.fautifs,
    supplementaires: score.supplementaires,
  };
  rejeux.push(mesure);
  console.log(JSON.stringify(mesure, null, 2));
  if (
    score.justes !== 95 ||
    score.attendus !== 95 ||
    score.manquants.length !== 0 ||
    score.fautifs.length !== 0 ||
    score.supplementaires.length !== 0
  )
    throw new Error(`F3 a régressé : ${score.justes}/${score.attendus}`);
}

const sortie = join(rapports, `c9-3-${new Date().toISOString().replaceAll(":", "-")}.json`);
writeFileSync(sortie, JSON.stringify(rapport, null, 2));
console.log(`\nRapport : ${sortie}`);
