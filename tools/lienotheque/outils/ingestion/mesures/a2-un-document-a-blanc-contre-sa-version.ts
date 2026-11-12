/** Un document réel rejoué à blanc, comparé **lien par lien** à sa version publiée (A2).
 *
 *  Ce que ce banc répond : la relecture des cases en défaut, branchée dans la voie, change-t-elle
 *  ce qu'un document déjà publié rend ? Et combien d'appels au regard distant demanderait-elle ?
 *
 *  **Rien n'est écrit dans la bibliothèque** : ni images, ni cache, ni médias, ni version. Le seul
 *  fichier produit est celui que la ligne de commande demande, hors de la bibliothèque.
 *
 *  **Le relecteur branché ici ne lit rien et ne coûte rien** : il enregistre la demande et rend
 *  `undefined`. C'est exactement ce que fait l'absence de relecteur pour ce qui est publié —
 *  aucune valeur n'est injectée — mais cela laisse la **trace** de chaque case qu'un vrai étage
 *  aurait reçue. Un dénombrement sans dépense.
 *
 *  **Le prélude reproduit celui de la chaîne** (`lot.ts`) : même lecture du texte, mêmes options
 *  passées à la voie. La vérification que la reproduction est fidèle n'est pas une affirmation :
 *  le compte des pages lues par la couche, par l'OCR et sans texte est comparé à celui que la
 *  version publiée porte. S'il diffère, le banc le dit avant toute comparaison de liens.
 *
 *  Usage :
 *    tsx mesures/a2-un-document-a-blanc-contre-sa-version.ts \
 *      <document> <dossier des médias> <description de la bibliothèque> \
 *      <version publiée .json> <préfixe des noms de média> <sortie .json>
 */
import { createHash } from "node:crypto";
import { readdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { langueOcr } from "@lienotheque/lecteur-texte";
import { lireLeTexte } from "../src/texte.js";
import { rejouerParOracle } from "../src/voie-oracle.js";
import type { DemandeDeRelecture, RelecteurDeZone } from "../src/relire-les-zones.js";

const [document, dossierDesMedias, description, versionPubliee, prefixeDesNoms, sortie] = process.argv.slice(
  2,
) as [string, string, string, string, string, string];
if (sortie === undefined) {
  console.error("six arguments attendus : document, médias, description, version publiée, préfixe, sortie");
  process.exit(2);
}

const CHAMPS_DE_LIGNE = ["numero", "pageImprimee", "piste", "disque", "sourcePiste", "confiance"] as const;
const CHAMPS_DE_PAGE = ["feuille", "rang", "pageImprimee", "statut", "elements"] as const;

const enregistrements = (racine: string): string[] =>
  readdirSync(racine, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(racine, entree.name);
    return entree.isDirectory()
      ? enregistrements(chemin)
      : /\.(mp3|m4a|wav|flac)$/iu.test(entree.name)
        ? [chemin]
        : [];
  });

const GROUPE = "lot:mesure-a-blanc";
const sources = enregistrements(dossierDesMedias).sort((un, autre) => un.localeCompare(autre, "fr"));
const inventaireMedias = await Promise.all(
  sources.map(async (chemin) => ({
    // Le nom est une **entrée** : on reproduit celui que la version publiée porte, sinon la
    // comparaison des noms ne comparerait que deux arborescences de disque.
    nom: `${prefixeDesNoms}${basename(chemin)}`,
    empreinte: createHash("sha256").update(await readFile(chemin)).digest("hex"),
    provenances: [GROUPE],
  })),
);
console.log(`médias inventoriés : ${inventaireMedias.length}`);

const publiee = JSON.parse(await readFile(versionPubliee, "utf8")) as {
  resultat: { lignes: readonly Record<string, unknown>[]; pages: readonly Record<string, unknown>[] };
  association: { appariements: readonly Record<string, unknown>[]; orphelins: readonly number[]; manquants: readonly unknown[] };
  lecture: { parLaCouche: number; parOcr: number; sansTexte: number };
};

const schema = (JSON.parse(await readFile(description, "utf8")) as { schema: { langue: string } }).schema;
const langue = langueOcr(schema.langue);
console.log(`langue de la bibliothèque : ${schema.langue} → ${langue ?? "modèle par défaut"}`);

const journal: string[] = [];
const dire = (phase: string): void => {
  journal.push(phase);
  console.log(`  · ${phase}`);
};

const departTexte = Date.now();
const lu = await lireLeTexte(document, {
  ...(langue === undefined ? {} : { langue }),
  surAvertissement: dire,
});
const texteMs = Date.now() - departTexte;
const lecture = { parLaCouche: lu.parLaCouche, parOcr: lu.parOcr, sansTexte: lu.sansTexte };
console.log(`\ntexte lu en ${(texteMs / 1000).toFixed(1)} s : ${JSON.stringify(lecture)}`);
const preludeFidele = JSON.stringify(lecture) === JSON.stringify(publiee.lecture);
console.log(
  preludeFidele
    ? "le prélude reproduit celui de la version publiée (même lecture, page par page)"
    : `PRÉLUDE DIFFÉRENT : la version publiée porte ${JSON.stringify(publiee.lecture)} — la comparaison des liens ne vaudrait rien`,
);

/** Chaque case que la voie a demandé à relire. Aucune n'est lue : c'est un dénombrement. */
const demandes: DemandeDeRelecture[] = [];
const tracer: RelecteurDeZone = async (demande) => {
  demandes.push(demande);
  return undefined;
};

const departVoie = Date.now();
const rejeu = await rejouerParOracle(document, dossierDesMedias, {
  inventaireMedias,
  provenancesMedias: [GROUPE],
  surPhase: dire,
  doublePage: lu.doublePage,
  foliosEtablis: lu.foliosEtablis,
  texteDesPages: lu.pages.map((page) => ({
    page: page.index,
    ...(page.pageImprimee === undefined ? {} : { pageImprimee: page.pageImprimee }),
    texte: page.texte,
    ...(page.mots === undefined ? {} : { mots: page.mots }),
  })),
  relectureDesCases: tracer,
});
const voieMs = Date.now() - departVoie;

const ecarts: string[] = [];
const comparer = (quoi: string, obtenu: unknown, attendu: unknown): void => {
  if (JSON.stringify(obtenu) !== JSON.stringify(attendu))
    ecarts.push(`${quoi} : obtenu ${JSON.stringify(obtenu)}, publié ${JSON.stringify(attendu)}`);
};
const retenir = (objet: Record<string, unknown>, champs: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(champs.map((champ) => [champ, objet[champ]]));

comparer("nombre de liens", rejeu.resultat.lignes.length, publiee.resultat.lignes.length);
comparer("nombre de pages", rejeu.resultat.pages.length, publiee.resultat.pages.length);
comparer("orphelins", rejeu.association.orphelins, publiee.association.orphelins);
comparer("manquants", rejeu.association.manquants, publiee.association.manquants);

// Lien par lien, champ par champ : un décompte égal ne dit rien de ce que portent les liens.
const combienDeLiens = Math.max(rejeu.resultat.lignes.length, publiee.resultat.lignes.length);
for (let place = 0; place < combienDeLiens; place += 1) {
  const obtenu = rejeu.resultat.lignes[place] as Record<string, unknown> | undefined;
  const attendu = publiee.resultat.lignes[place];
  comparer(
    `lien n°${place + 1}`,
    obtenu === undefined ? undefined : retenir(obtenu, CHAMPS_DE_LIGNE),
    attendu === undefined ? undefined : retenir(attendu, CHAMPS_DE_LIGNE),
  );
}

const combienDAppariements = Math.max(
  rejeu.association.appariements.length,
  publiee.association.appariements.length,
);
for (let place = 0; place < combienDAppariements; place += 1) {
  const obtenu = rejeu.association.appariements[place] as
    | { ligne: Record<string, unknown>; media: Record<string, unknown>; segment: unknown; statut: unknown }
    | undefined;
  const attendu = publiee.association.appariements[place] as
    | { ligne: Record<string, unknown>; media: Record<string, unknown>; segment: unknown; statut: unknown }
    | undefined;
  const reduit = (
    paire: { ligne: Record<string, unknown>; media: Record<string, unknown>; segment: unknown; statut: unknown } | undefined,
  ): unknown =>
    paire === undefined
      ? undefined
      : {
          ligne: retenir(paire.ligne, CHAMPS_DE_LIGNE),
          media: retenir(paire.media, ["piste", "nom", "empreinte"]),
          segment: paire.segment,
          statut: paire.statut,
        };
  comparer(`appariement n°${place + 1}`, reduit(obtenu), reduit(attendu));
}

const combienDePages = Math.max(rejeu.resultat.pages.length, publiee.resultat.pages.length);
for (let place = 0; place < combienDePages; place += 1) {
  const obtenu = rejeu.resultat.pages[place] as Record<string, unknown> | undefined;
  const attendu = publiee.resultat.pages[place];
  comparer(
    `page n°${place + 1}`,
    obtenu === undefined ? undefined : retenir(obtenu, CHAMPS_DE_PAGE),
    attendu === undefined ? undefined : retenir(attendu, CHAMPS_DE_PAGE),
  );
}

const releve = rejeu.relectureDesCases;
console.log(`\nvoie parcourue en ${(voieMs / 1000).toFixed(1)} s`);
console.log(`liens : ${rejeu.resultat.lignes.length} · orphelins : ${JSON.stringify(rejeu.association.orphelins)}`);
console.log(
  `relecture des cases : ${demandes.length} demande(s) tracée(s) · relevé ${
    releve === undefined ? "absent (aucune case en défaut)" : JSON.stringify(releve)
  }`,
);
for (const demande of demandes.slice(0, 20))
  console.log(`  demande page ${demande.page} · ${demande.l}×${demande.h} · ${demande.pourquoi}`);
console.log(`\nécarts : ${ecarts.length}`);
for (const ecart of ecarts.slice(0, 40)) console.log(`  ✗ ${ecart}`);

writeFileSync(
  sortie,
  JSON.stringify(
    {
      preludeFidele,
      lecture,
      lecturePubliee: publiee.lecture,
      liens: rejeu.resultat.lignes,
      appariements: rejeu.association.appariements,
      orphelins: rejeu.association.orphelins,
      manquants: rejeu.association.manquants,
      abstention: rejeu.association.abstention ?? null,
      relectureDesCases: releve ?? null,
      demandesDeRelecture: demandes,
      msTexte: texteMs,
      msVoie: voieMs,
      ecarts,
      journal,
    },
    null,
    2,
  ),
);
console.log(`\nécrit : ${sortie}`);
