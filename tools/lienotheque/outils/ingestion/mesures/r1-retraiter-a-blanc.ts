/** R1 du plan A1 — retraiter un document **à blanc** : rien n'est écrit dans la bibliothèque.
 *
 *  `instantaneDeLot` ne touche à la bibliothèque que si on lui donne `images` ; on ne le fait
 *  pas. La relecture ciblée est un port qu'on ne branche pas : sans elle ni
 *  `validationStructurelle`, aucun appel en ligne n'est possible, donc aucune clé n'est
 *  nécessaire. Et pas de `cache` : les entrées d'avant le 5 novembre 2026 portent l'ancien compte
 *  de feuilles (`VERSION_LECTURE` 10), et une lecture gardée ramènerait le défaut qu'on corrige.
 *
 *  À lancer par `env -u LIENOTHEQUE_JETON`, hors de l'application, règle de Christophe du
 *  4 novembre 2026.
 *
 *  Usage :
 *    tsx mesures/r1-retraiter-a-blanc.ts <racine-bibliothèque> <préfixe-empreinte> <recette.json?>
 *
 *  La sortie va dans `mesures/sorties/`, jamais dans la bibliothèque. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { instantaneDeLot } from "../src/lot.js";

const arguments_ = process.argv.slice(2);
/** `--garder-la-recette` interdit la bascule vers la seconde voie : c'est la seule façon de
 *  comparer un retraitement à une version écrite par la recette, sur le MÊME producteur. */
const garderLaRecette = arguments_.includes("--garder-la-recette");
// Les drapeaux sont retirés avant de lire les arguments de position : sans cela
// `--garder-la-recette` était pris pour un chemin de recette, et la lecture mourait sur un
// `ENOENT` qui nommait le drapeau.
const [racine, prefixe, recetteDonnee] = arguments_.filter((a) => !a.startsWith("--"));
if (racine === undefined || prefixe === undefined) {
  console.error("usage : r1-retraiter-a-blanc.ts <racine-bibliothèque> <préfixe-empreinte> [recette.json]");
  process.exit(2);
}

const SORTIE = join(import.meta.dirname, "sorties/a1-r1-5nov");
mkdirSync(SORTIE, { recursive: true });

const lireJson = <T,>(chemin: string): T => JSON.parse(readFileSync(chemin, "utf8")) as T;

const actives = lireJson<Record<string, { version: string }>>(join(racine, "base/actives.json"));
const empreintes = Object.keys(actives).filter((cle) => cle.startsWith(prefixe));
if (empreintes.length !== 1) {
  console.error(`« ${prefixe} » désigne ${empreintes.length} document(s) ; il en faut exactement un.`);
  process.exit(2);
}
const empreinte = empreintes[0]!;
const versionActive = actives[empreinte]!.version;
const avant = lireJson<{
  resultat: { pages: { feuille?: number; index?: number; pageImprimee?: number; elements: unknown[] }[]; recette: { id: string; version: number } };
  medias: { nom: string; empreinte: string }[];
  vue: { pages: { index: number; numero?: number; elements: { numero: string }[] }[] };
}>(join(racine, "base/versions", `${versionActive}.json`));

// La provenance borne le vivier des médias (REC-02). Sans elle, `qualifierAssociation` s'abstient
// AVANT tout calcul — `vivier_non_borne` — et la vue ne porte plus un seul élément, ce qui rendrait
// la comparaison avant/après muette. Elle se trouve à deux endroits dans la bibliothèque, et nulle
// part ailleurs : les groupes de dépôt du document dans le travail qui l'a traité, et les
// provenances de chaque média dans `base/medias.json`. C'est la bibliothèque qui le dit, pas nous.
const travaux = join(racine, "base/travaux");
const provenancesDuDocument = (() => {
  for (const nom of readdirSync(travaux)) {
    if (!nom.endsWith(".json")) continue;
    const travail = lireJson<{ empreinte?: string; sujet?: { provenances_medias?: string[] } }>(join(travaux, nom));
    if (travail.empreinte !== empreinte) continue;
    const trouvees = travail.sujet?.provenances_medias;
    if (trouvees !== undefined && trouvees.length > 0) return trouvees;
  }
  return undefined;
})();

const provenancesParMedia = new Map<string, readonly string[]>();
for (const media of lireJson<{ empreinte: string; provenances?: string[] }[]>(join(racine, "base/medias.json")))
  if (media.provenances !== undefined && media.provenances.length > 0)
    provenancesParMedia.set(media.empreinte, media.provenances);

// Le PDF source est rangé par son empreinte : son nom **est** son contenu.
const dossier = join(racine, "sources", empreinte.slice(0, 2));
const fichier = readdirSync(dossier).find((nom) => nom.startsWith(empreinte));
if (fichier === undefined) {
  console.error(`aucune source pour ${empreinte} sous ${dossier}`);
  process.exit(2);
}
const pdf = join(dossier, fichier);

// La manière de lire, prise dans la bibliothèque si l'appelant ne la donne pas.
const trouverRecette = (): string | undefined => {
  if (recetteDonnee !== undefined) return recetteDonnee;
  const voulue = avant.resultat.recette;
  const dossierRecettes = join(racine, "base/recettes");
  for (const nom of readdirSync(dossierRecettes)) {
    if (!nom.endsWith(".json")) continue;
    const brut = JSON.parse(readFileSync(join(dossierRecettes, nom), "utf8")) as { id?: string; version?: number };
    if (brut.id === voulue.id && brut.version === voulue.version) return join(dossierRecettes, nom);
  }
  return undefined;
};
const recette = trouverRecette();

console.log(`  document   : ${empreinte.slice(0, 8)}  (${fichier})`);
console.log(`  version    : ${versionActive}`);
console.log(`  recette    : ${avant.resultat.recette.id} v${avant.resultat.recette.version} → ${recette ?? "AUCUNE (voie sans manière de lire)"}`);
const inventaire = avant.medias.map(({ nom, empreinte: e }) => {
  const provenances = provenancesParMedia.get(e);
  return { nom, empreinte: e, ...(provenances === undefined ? {} : { provenances: [...provenances] }) };
});
console.log(`  médias     : ${inventaire.length} de l'inventaire de la version, dont ${inventaire.filter((m) => m.provenances !== undefined).length} avec provenance`);
console.log(`  provenance du document : ${provenancesDuDocument?.join(", ") ?? "AUCUNE — l'association s'abstiendra (vivier_non_borne)"}`);
console.log(`  bascule    : ${garderLaRecette ? "INTERDITE — la recette est gardée (même producteur que la version comparée)" : "libre, comme un traitement réel"}`);
console.log(`  jeton      : ${process.env["LIENOTHEQUE_JETON"] === undefined ? "absent de l'environnement ✓" : "PRÉSENT — arrêt"}`);
if (process.env["LIENOTHEQUE_JETON"] !== undefined) process.exit(2);
console.log();

const debut = Date.now();
const traite = await instantaneDeLot({
  pdf,
  // Requis par le contrat du lot, mais jamais parcouru : l'inventaire est donné.
  medias: join(racine, "sources"),
  inventaireMedias: inventaire,
  ...(provenancesDuDocument === undefined ? {} : { provenancesMedias: provenancesDuDocument }),
  ...(garderLaRecette ? { reserveAuxComparaisons_sansBascule: true } : {}),
  description: join(racine, "base/bibliotheque.json"),
  ...(recette === undefined ? {} : { recette }),
  // Pas d'`images` : aucune écriture. Pas de `cache` : voir l'en-tête. Pas de `relecture`.
  surPhase: (phase) => console.log(`  · ${phase}`),
});

const feuilleDe = (page: { feuille?: number; index?: number }): number => page.feuille ?? page.index ?? -1;
const apres = traite.resultat;
console.log(`\n  durée : ${((Date.now() - debut) / 1000).toFixed(0)} s`);
console.log(`  resultat.pages : ${avant.resultat.pages.length} → ${apres.pages.length}`);

// Ce qui compte : chaque page de résultat désigne-t-elle maintenant une autre feuille ?
const avantParRang = avant.resultat.pages.map((page) => ({ feuille: feuilleDe(page), elements: page.elements.length }));
const apresParRang = apres.pages.map((page) => ({ feuille: page.feuille, elements: page.elements.length }));
let deplacees = 0;
for (let rang = 0; rang < Math.min(avantParRang.length, apresParRang.length); rang += 1)
  if (avantParRang[rang]!.feuille !== apresParRang[rang]!.feuille) deplacees += 1;
console.log(`  pages dont la feuille change : ${deplacees} / ${Math.min(avantParRang.length, apresParRang.length)}`);

// Le placement dans `resultat.pages` ne dépend pas de la publication : il est juste ou faux, que
// l'association publie ou s'abstienne. C'est donc lui qui prouve le correctif.
const placement = (pages: readonly { feuille?: number; index?: number; elements: unknown[] }[]) =>
  pages.filter((page) => page.elements.length > 0).map((page) => feuilleDe(page));
const avantPlacement = placement(avant.resultat.pages);
const apresPlacement = placement(apres.pages);
console.log(`\n  ── feuilles de résultat portant un élément (0-based) ──`);
console.log(`  avant : ${avantPlacement.join(" ")}`);
console.log(`  après : ${apresPlacement.join(" ")}`);
const ecarts = [...new Set(avantPlacement.map((f, i) => (apresPlacement[i] ?? f) - f))].sort((x, y) => x - y);
console.log(`  décalages observés : ${ecarts.join(", ")}`);

// Et la vue, qui est ce que l'écran montre.
const porteurs = (pages: readonly { index: number; numero?: number; elements: { numero: string }[] }[]) =>
  pages.filter((page) => page.elements.length > 0).map((page) => ({ page: page.index, numero: page.numero, elements: page.elements.map((e) => e.numero) }));
const avantPorteurs = porteurs(avant.vue.pages);
const apresPorteurs = porteurs(traite.vue.pages as never);
console.log(`\n  ── pages de la VUE portant un élément (1-based, ce que l'écran cite) ──`);
console.log(`  avant : ${avantPorteurs.map((p) => p.page).join(" ")}`);
console.log(`  après : ${apresPorteurs.map((p) => p.page).join(" ")}`);
if (apresPorteurs.length === 0)
  console.log(`  (vide : l'association s'est abstenue — ${traite.association.abstention?.raison ?? "sans motif"})`);
console.log(`\n  ── les premiers éléments dans la vue, avant et après ──`);
for (let i = 0; i < Math.min(6, avantPorteurs.length, apresPorteurs.length); i += 1) {
  const a = avantPorteurs[i]!;
  const b = apresPorteurs[i]!;
  console.log(`  élément ${a.elements.join(",")} : page ${a.page} (folio ${a.numero ?? "—"}) → page ${b.page} (folio ${b.numero ?? "—"})`);
}

const chemin = join(SORTIE, `${empreinte.slice(0, 8)}-apres${garderLaRecette ? "-recette-gardee" : "-voie-libre"}.json`);
// Les passages aussi : la mesure du folio lu en marge en a besoin, et sans eux elle rend
// « 0 égal, 48 muets » — elle ne mesure rien, et on peut croire qu'elle mesure quelque chose.
// Mesuré le 5 novembre 2026, sur la version oracle de `ca36cf98`.
writeFileSync(
  chemin,
  `${JSON.stringify(
    {
      vue: traite.vue,
      resultat: traite.resultat,
      association: traite.association,
      passages: traite.passages,
      medias: traite.medias,
      lecture: traite.lecture,
    },
    null,
    1,
  )}\n`,
);
console.log(`\n  nouvelle version écrite HORS de la bibliothèque : ${chemin}`);
