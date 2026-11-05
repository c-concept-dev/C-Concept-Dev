/** R2 du plan A1 — écrire dans la vraie bibliothèque la version que le correctif produit.
 *
 *  R1 retraitait à blanc : il prouvait le placement sans rien écrire. R2 écrit, et c'est le geste
 *  que seule une porte de Christophe ouvre (autorisation du 5 novembre 2026).
 *
 *  ## Ce qu'il fait, dans cet ordre
 *
 *  1. **Il refuse de démarrer sans sauvegarde vérifiée de l'état ACTUEL de `base/`.** Pas « une
 *     sauvegarde existe » : le manifeste doit porter `verifiee: true` ET son empreinte d'ensemble
 *     doit être celle de la base telle qu'elle est maintenant. Une sauvegarde d'hier ne protège
 *     pas d'une écriture d'aujourd'hui.
 *  2. Il retraite le document par la chaîne réelle, images de page comprises, sous le numéro de
 *     la version qu'il va écrire — c'est ainsi que l'hôte procède, et les dérivés se rangent par
 *     version.
 *  3. Il écrit `base/versions/<version>.json` avec les sept clés du format réel, puis un travail
 *     dans `base/travaux/`, puis il active — **la version avant le pointeur**, comme l'hôte :
 *     un pointeur vers une version absente ferait un document invisible.
 *  4. Il contrôle le critère d'acceptation, et le dit en clair.
 *
 *  La bascule de voie reste **libre**, comme dans un traitement réel : c'est la décision du
 *  29 octobre 2026, et la règle « aucun retraitement par la voie recette avant A1b » l'exige —
 *  la manière de lire s'abstient, la voie générique prend la main.
 *
 *  Usage :
 *    tsx mesures/r2-ecrire-la-version-oracle.ts <racine> <préfixe> <manifeste-de-sauvegarde> [--pour-de-vrai]
 *
 *  Sans `--pour-de-vrai`, il retraite et montre ce qu'il écrirait, sans écrire une ligne. */
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { instantaneDeLot } from "../src/lot.js";

const arguments_ = process.argv.slice(2);
const pourDeVrai = arguments_.includes("--pour-de-vrai");
const [racine, prefixe, manifesteDonne] = arguments_.filter((un) => !un.startsWith("--"));
if (racine === undefined || prefixe === undefined || manifesteDonne === undefined) {
  console.error(
    "usage : r2-ecrire-la-version-oracle.ts <racine> <préfixe> <manifeste-de-sauvegarde> [--pour-de-vrai]",
  );
  process.exit(2);
}

const lire = <T,>(chemin: string): T => JSON.parse(readFileSync(chemin, "utf8")) as T;
const base = join(racine, "base");

// ── 1. La sauvegarde, et elle doit décrire la base telle qu'elle est maintenant ────────────────
const manifeste = lire<{
  bibliotheque: string;
  verifiee: boolean;
  empreinte_de_l_ensemble: string;
  fichiers: number;
  par_fichier: Record<string, string>;
}>(manifesteDonne);
if (!manifeste.verifiee) {
  console.error("La sauvegarde n'est pas vérifiée. Rien ne sera écrit.");
  process.exit(2);
}
const empreinteDeLaBase = (): string => {
  const fichiers: string[] = [];
  const parcourir = (prefixeRelatif: string): void => {
    for (const entree of readdirSync(join(base, prefixeRelatif), { withFileTypes: true })) {
      const relatif = join(prefixeRelatif, entree.name);
      if (entree.isDirectory()) parcourir(relatif);
      else if (entree.isFile()) fichiers.push(relatif);
    }
  };
  parcourir("");
  const somme = createHash("sha256");
  for (const relatif of fichiers.sort())
    somme
      .update(relatif)
      .update("\0")
      .update(createHash("sha256").update(readFileSync(join(base, relatif))).digest("hex"))
      .update("\n");
  return somme.digest("hex");
};
const maintenant = empreinteDeLaBase();
if (maintenant !== manifeste.empreinte_de_l_ensemble) {
  console.error("La sauvegarde ne décrit pas la base telle qu'elle est maintenant :");
  console.error(`  sauvegardé : ${manifeste.empreinte_de_l_ensemble}`);
  console.error(`  à l'instant : ${maintenant}`);
  console.error("Refaites la sauvegarde. Rien n'a été écrit.");
  process.exit(2);
}
console.log(`Sauvegarde vérifiée de l'état actuel : ${manifeste.fichiers} fichiers · ${maintenant.slice(0, 16)}…`);

// ── Le document, et tout ce que la bibliothèque sait de lui ────────────────────────────────────
const actives = lire<Record<string, { version: string; activee_le: number }>>(join(base, "actives.json"));
const empreintes = Object.keys(actives).filter((cle) => cle.startsWith(prefixe));
if (empreintes.length !== 1) {
  console.error(`« ${prefixe} » désigne ${empreintes.length} document(s) ; il en faut exactement un.`);
  process.exit(2);
}
const empreinte = empreintes[0]!;
const versionAvant = actives[empreinte]!.version;
const avant = lire<{
  resultat: { recette: { id: string; version: number } };
  medias: { nom: string; empreinte: string }[];
  vue: { pages: { index: number; numero?: number; elements: { numero: string }[] }[] };
}>(join(base, "versions", `${versionAvant}.json`));

const provenancesParMedia = new Map<string, readonly string[]>();
for (const media of lire<{ empreinte: string; provenances?: string[] }[]>(join(base, "medias.json")))
  if (media.provenances !== undefined && media.provenances.length > 0)
    provenancesParMedia.set(media.empreinte, media.provenances);
const travaux = join(base, "travaux");
const provenancesDuDocument = ((): readonly string[] | undefined => {
  for (const nom of readdirSync(travaux)) {
    if (!nom.endsWith(".json")) continue;
    const travail = lire<{ empreinte?: string; sujet?: { provenances_medias?: string[] } }>(join(travaux, nom));
    if (travail.empreinte !== empreinte) continue;
    const trouvees = travail.sujet?.provenances_medias;
    if (trouvees !== undefined && trouvees.length > 0) return trouvees;
  }
  return undefined;
})();

const dossierSource = join(racine, "sources", empreinte.slice(0, 2));
const fichier = readdirSync(dossierSource).find((nom) => nom.startsWith(empreinte));
if (fichier === undefined) {
  console.error(`aucune source pour ${empreinte} sous ${dossierSource}`);
  process.exit(2);
}
const recette = ((): string | undefined => {
  const voulue = avant.resultat.recette;
  const dossier = join(base, "recettes");
  for (const nom of readdirSync(dossier)) {
    if (!nom.endsWith(".json")) continue;
    const brut = lire<{ id?: string; version?: number }>(join(dossier, nom));
    if (brut.id === voulue.id && brut.version === voulue.version) return join(dossier, nom);
  }
  return undefined;
})();

const version = randomUUID();
const essaiHorsBibliotheque = join(
  process.env["TMPDIR"] ?? "/tmp",
  `lienotheque-r2-essai-${version.slice(0, 8)}`,
);
const inventaire = avant.medias.map(({ nom, empreinte: e }) => {
  const provenances = provenancesParMedia.get(e);
  return { nom, empreinte: e, ...(provenances === undefined ? {} : { provenances: [...provenances] }) };
});

console.log(`\nDocument    : ${empreinte.slice(0, 8)} (${fichier})`);
console.log(`Version     : ${versionAvant} → ${version}`);
console.log(`Manière     : ${avant.resultat.recette.id} v${avant.resultat.recette.version}, bascule LIBRE`);
console.log(`Médias      : ${inventaire.length}, dont ${inventaire.filter((m) => m.provenances !== undefined).length} avec provenance`);
console.log(`Provenance  : ${provenancesDuDocument?.join(", ") ?? "AUCUNE — l'association s'abstiendra"}`);
console.log(`Écriture    : ${pourDeVrai ? "OUI, dans la vraie bibliothèque" : `non — images d'essai dans ${essaiHorsBibliotheque}`}\n`);

const debut = Date.now();
const traite = await instantaneDeLot({
  pdf: join(dossierSource, fichier),
  medias: join(racine, "sources"),
  inventaireMedias: inventaire,
  ...(provenancesDuDocument === undefined ? {} : { provenancesMedias: provenancesDuDocument }),
  description: join(base, "bibliotheque.json"),
  ...(recette === undefined ? {} : { recette }),
  // Les images de page se rangent par version, comme l'hôte les range. En essai, elles vont
  // AILLEURS : un essai qui laisse cent quinze images orphelines dans la bibliothèque à chaque
  // passage n'est pas un essai à blanc.
  images: pourDeVrai ? join(racine, "derives", version, "pages") : join(essaiHorsBibliotheque, "pages"),
  adresseImages: "/donnees/pages",
  surPhase: (phase) => console.log(`  · ${phase}`),
});
console.log(`\nTraitement : ${((Date.now() - debut) / 1000).toFixed(0)} s`);

const porteuses = traite.vue.pages.filter((page) => page.elements.length > 0).map((page) => page.index);
console.log(`Pages de la vue : ${traite.vue.pages.length} · porteuses : ${porteuses.length}`);
console.log(`Lecture : ${traite.lecture.parLaCouche} par la couche, ${traite.lecture.parOcr} par OCR, ${traite.lecture.sansTexte} sans texte`);
console.log(`Association : ${traite.association.abstention === undefined ? "publie" : `s'abstient — ${traite.association.abstention.raison}`}`);

// ── Le critère d'acceptation, fixé avant le geste (registre du 5 novembre) ─────────────────────
// « Workout 3 doit être lié à la feuille 12, et la page 12 cesser d'être muette. » Dit avec les
// mots du produit : l'élément n° 3 se pose sur la page 12 de la vue, et cette page porte un lien.
// Le numéro de l'élément est une donnée du document, pas un mot de ce code.
const ELEMENT_ATTENDU = "3";
const PAGE_ATTENDUE = 12;
const pageDouze = traite.vue.pages.find((page) => page.index === PAGE_ATTENDUE);
const ouEstLElement = traite.vue.pages
  .filter((page) => page.elements.some((element) => element.numero === ELEMENT_ATTENDU))
  .map((page) => page.index);
const critereTenu = pageDouze !== undefined && pageDouze.elements.some((e) => e.numero === ELEMENT_ATTENDU);

console.log(`\n── le critère ──`);
console.log(`  l'élément « ${ELEMENT_ATTENDU} » se pose sur les pages : ${ouEstLElement.join(", ") || "aucune"}`);
console.log(`  la page ${PAGE_ATTENDUE} porte : ${pageDouze === undefined ? "elle n'existe pas" : pageDouze.elements.map((e) => e.numero).join(", ") || "rien — elle est muette"}`);
console.log(`  ${critereTenu ? "TENU" : "NON TENU"}`);

if (!pourDeVrai) {
  console.log("\nRien n'a été écrit. Ajoutez --pour-de-vrai pour écrire cette version.");
  process.exit(critereTenu ? 0 : 1);
}

// ── 3. L'écriture : la version, le travail, puis le pointeur ───────────────────────────────────
const charge = {
  vue: traite.vue,
  resultat: traite.resultat,
  association: traite.association,
  medias: traite.medias,
  passages: traite.passages,
  lecture: traite.lecture,
  filigranes: traite.filigranes,
};
const ecrireAtomique = (chemin: string, texte: string): void => {
  const transit = `${chemin}.en-cours-${process.pid}`;
  writeFileSync(transit, texte);
  renameSync(transit, chemin);
};
mkdirSync(join(base, "versions"), { recursive: true });
ecrireAtomique(join(base, "versions", `${version}.json`), `${JSON.stringify(charge, null, 1)}\n`);
console.log(`\nversion écrite : base/versions/${version}.json`);

// Le travail : c'est lui qui relie une version à sa source. Sans lui, un retrait de document ne
// retrouverait pas cette version-ci le jour où elle ne serait plus active (depot.rs le dit).
const travailId = randomUUID();
ecrireAtomique(
  join(travaux, `${travailId}.json`),
  `${JSON.stringify(
    {
      id: travailId,
      empreinte,
      version,
      genre: "reprise",
      etat: "fini",
      fini_le: Math.floor(Date.now() / 1000),
      ...(provenancesDuDocument === undefined ? {} : { sujet: { provenances_medias: [...provenancesDuDocument] } }),
      origine: "mesures/r2-ecrire-la-version-oracle.ts — R2 du plan A1, autorisé le 5 novembre 2026",
    },
    null,
    1,
  )}\n`,
);
console.log(`travail écrit  : base/travaux/${travailId}.json`);

// Le pointeur en dernier, et la table entière relue juste avant : une autre entrée écrite entre
// temps ne doit pas disparaître (la faute du 21 octobre, 243 versions pour 239 pointeurs).
const table = lire<Record<string, { version: string; activee_le: number }>>(join(base, "actives.json"));
table[empreinte] = { version, activee_le: Math.floor(Date.now() / 1000) };
ecrireAtomique(join(base, "actives.json"), `${JSON.stringify(table, null, 2)}\n`);
console.log(`pointeur posé  : ${empreinte.slice(0, 8)} → ${version}`);
console.log(`\nversion précédente CONSERVÉE : ${versionAvant} (retour arrière = reposer ce pointeur)`);
console.log(critereTenu ? "\nCritère TENU." : "\nCritère NON TENU — la version est écrite, le retour arrière est à un pointeur près.");
process.exit(critereTenu ? 0 : 1);
