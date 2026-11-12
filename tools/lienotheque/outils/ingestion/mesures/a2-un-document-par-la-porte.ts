/** Un document réel traité **par la porte**, avec le regard distant branché (A2).
 *
 *  Ce que ce banc répond : la relecture des cases, appelée par la chaîne réelle et payée pour de
 *  vrai, rattrape-t-elle des liens que la première lecture laissait à vérifier ? Et combien ?
 *
 *  **Rien n'est écrit dans la bibliothèque** : ni images, ni médias, ni version. Le cache et le
 *  fichier de sortie vivent hors d'elle, aux chemins que la ligne de commande donne.
 *
 *  **Par la porte, et pas plus bas.** `executerTravail` est ce que l'application franchit : une
 *  mesure prise sous elle ne prouverait qu'un script. Le jeton est lu par la porte, dans son
 *  propre processus, et ne passe ni par ici ni par la ligne de commande.
 *
 *  **Le plafond de dépense est obligatoire.** Un banc qui appelle un modèle sans plafond peut
 *  dépenser ce qu'il veut si une table se révèle plus trouée que prévu.
 *
 *  Usage :
 *    tsx mesures/a2-un-document-par-la-porte.ts \
 *      <document> <dossier des médias> <description> <version publiée .json> \
 *      <préfixe des noms de média> <adresse du Worker> <dossier de cache> <plafond en euros> \
 *      <sortie .json>
 */
import { createHash } from "node:crypto";
import { readdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { chargeOuEchec, demandeDeTraitement, executerTravail } from "../src/index.js";

const [document, dossierDesMedias, description, versionPubliee, prefixeDesNoms, adresse, cache, plafond, sortie] =
  process.argv.slice(2) as [string, string, string, string, string, string, string, string, string];
if (sortie === undefined) {
  console.error(
    "neuf arguments attendus : document, médias, description, version publiée, préfixe, adresse du Worker, cache, plafond en euros, sortie",
  );
  process.exit(2);
}
const coutMaxEur = Number(plafond);
if (!Number.isFinite(coutMaxEur) || coutMaxEur <= 0) {
  console.error(`plafond de dépense illisible : « ${plafond} »`);
  process.exit(2);
}

const CHAMPS_DE_LIGNE = ["numero", "pageImprimee", "piste", "disque", "sourcePiste", "confiance"] as const;

const enregistrements = (racine: string): string[] =>
  readdirSync(racine, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(racine, entree.name);
    return entree.isDirectory()
      ? enregistrements(chemin)
      : /\.(mp3|m4a|wav|flac)$/iu.test(entree.name)
        ? [chemin]
        : [];
  });

async function principal(): Promise<void> {
  const GROUPE = "lot:mesure-par-la-porte";
  const sources = enregistrements(dossierDesMedias).sort((un, autre) => un.localeCompare(autre, "fr"));
  const inventaireMedias = await Promise.all(
    sources.map(async (chemin) => ({
      nom: `${prefixeDesNoms}${basename(chemin)}`,
      empreinte: createHash("sha256").update(await readFile(chemin)).digest("hex"),
      provenances: [GROUPE],
    })),
  );
  console.log(`médias inventoriés : ${inventaireMedias.length}`);

  const publiee = JSON.parse(await readFile(versionPubliee, "utf8")) as {
    resultat: { lignes: readonly Record<string, unknown>[]; pages: readonly unknown[] };
    association: { appariements: readonly unknown[]; orphelins: readonly number[] };
    lecture: { parLaCouche: number; parOcr: number; sansTexte: number };
  };

  const journal: string[] = [];
  const depart = Date.now();
  const message = await executerTravail(
    demandeDeTraitement(randomUUID(), randomUUID(), {
      document,
      medias: dossierDesMedias,
      description,
      inventaireMedias,
      provenancesMedias: [GROUPE],
      relecture: adresse,
      cache,
      // Le plafond est **donné**, jamais laissé au défaut : un banc qui appelle un modèle doit
      // dire ce qu'il s'autorise, et son rapport doit pouvoir le citer.
      coutMaxEur,
    }),
    {
      emettre: (un) => {
        if (un.type !== "journal") return;
        journal.push(un.texte);
        console.log(`  · ${un.texte}`);
      },
    },
  );
  const millisecondes = Date.now() - depart;
  const traite = chargeOuEchec(message);

  const ecarts: string[] = [];
  const comparer = (quoi: string, obtenu: unknown, attendu: unknown): void => {
    if (JSON.stringify(obtenu) !== JSON.stringify(attendu))
      ecarts.push(`${quoi} : obtenu ${JSON.stringify(obtenu)}, publié ${JSON.stringify(attendu)}`);
  };
  const retenir = (objet: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(CHAMPS_DE_LIGNE.map((champ) => [champ, objet[champ]]));

  const lecture = traite.lecture;
  const preludeFidele = JSON.stringify(lecture) === JSON.stringify(publiee.lecture);
  console.log(
    `\nlecture : ${JSON.stringify(lecture)} — ${preludeFidele ? "identique à la version publiée" : `DIFFÉRENTE de ${JSON.stringify(publiee.lecture)}`}`,
  );

  // Les liens publiés avant, et ceux d'aujourd'hui : chacun par ses six champs. Le gain se lit
  // dans ce qui s'ajoute, jamais dans un décompte.
  const avant = new Map(publiee.resultat.lignes.map((ligne) => [String(ligne["numero"]), retenir(ligne)]));
  const apres = new Map(
    traite.resultat.lignes.map((ligne) => [String(ligne.numero), retenir(ligne as unknown as Record<string, unknown>)]),
  );
  const ajoutes = [...apres.keys()].filter((clef) => !avant.has(clef));
  const perdus = [...avant.keys()].filter((clef) => !apres.has(clef));
  for (const clef of [...avant.keys()].filter((une) => apres.has(une)))
    comparer(`lien n°${clef}`, apres.get(clef), avant.get(clef));

  console.log(`\nliens : ${avant.size} publiés → ${apres.size} aujourd'hui`);
  console.log(`  ajoutés : ${ajoutes.length === 0 ? "aucun" : ajoutes.join(", ")}`);
  console.log(`  perdus  : ${perdus.length === 0 ? "aucun" : perdus.join(", ")}`);
  console.log(`  écarts sur les liens communs : ${ecarts.length}`);
  for (const ecart of ecarts.slice(0, 20)) console.log(`    ✗ ${ecart}`);
  console.log(`orphelins : ${JSON.stringify(traite.association.orphelins)} · publiés ${JSON.stringify(publiee.association.orphelins)}`);
  console.log(`relecture des cases : ${JSON.stringify(traite.relectureDesCases ?? null)}`.slice(0, 600));
  console.log(`\ndurée totale : ${(millisecondes / 1000).toFixed(1)} s`);

  writeFileSync(
    sortie,
    JSON.stringify(
      {
        plafondEnEuros: coutMaxEur,
        preludeFidele,
        lecture,
        lecturePubliee: publiee.lecture,
        liensPublies: avant.size,
        liensAujourdHui: apres.size,
        ajoutes,
        perdus,
        ecarts,
        orphelins: traite.association.orphelins,
        orphelinsPublies: publiee.association.orphelins,
        liens: traite.resultat.lignes,
        appariements: traite.association.appariements,
        relectureDesCases: traite.relectureDesCases ?? null,
        millisecondes,
        journal,
      },
      null,
      2,
    ),
  );
  console.log(`\nécrit : ${sortie}`);
}

void principal();
