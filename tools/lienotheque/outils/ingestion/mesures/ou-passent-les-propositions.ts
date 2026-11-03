/** Pourquoi la règle renforcée des noms rend **moins** de propositions sur certains documents.
 *
 *  ## Ce que la mesure cherche
 *
 *  Mesuré le 3 novembre 2026 sur six documents tirés au hasard, le total des propositions tirées
 *  des noms monte de 14 à 21 — mais deux documents reculent, l'un de huit à deux. Le gain global
 *  ne dit rien de ces deux-là, et une règle qui perd là où l'ancienne trouvait doit s'expliquer
 *  avant qu'on la garde.
 *
 *  L'hypothèse à éprouver : le repli par les noms ne retient un enregistrement que s'il est
 *  retrouvé sur **exactement une** page. Des jetons plus riches le retrouvent sur davantage de
 *  pages — et ce filtre, écrit pour une règle avare, écarterait alors ce que la règle généreuse
 *  a trouvé. Si c'est cela, le défaut n'est pas dans la règle mais dans un filtre qui ne lui
 *  correspond plus.
 *
 *  ## Pourquoi cette mesure ne coûte rien
 *
 *  Le texte des pages est **déjà** dans la bibliothèque : chaque version garde ses passages. On
 *  compare donc les deux règles sur exactement la même entrée, sans relire une seule page. Ce
 *  texte vient de la lecture d'alors, et c'est sans importance ici : ce qu'on compare, ce sont
 *  deux façons de le confronter aux noms.
 *
 *  Usage : ou-passent-les-propositions.ts <racine de la bibliothèque> [combien de documents]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { accordsNomContenu, designationsDesNoms, apresLAdresse } from "@lienotheque/noyau";

const racine = process.argv[2]!;
const combien = Number.parseInt(process.argv[3] ?? "6", 10);
const graine = process.argv[4] ?? "2026-11-02";
/** Donné, le vivier est borné au dossier de dépôt du document au lieu de porter toute la
 *  bibliothèque. C'est la différence entre ce que la chaîne présente aujourd'hui — faute de
 *  provenance — et ce qu'elle présenterait une fois celle-ci rétablie. */
const borner = process.argv[5] === "borne";
const base = join(racine, "base");

const actives = JSON.parse(readFileSync(join(base, "actives.json"), "utf8")) as Record<string, { version: string }>;
const inventaire = JSON.parse(readFileSync(join(base, "medias.json"), "utf8")) as { nom: string }[];
const tousLesNoms = inventaire.filter((media) => media.nom.toLowerCase().endsWith(".mp3")).map((media) => media.nom);
let noms = tousLesNoms;
/** Le dossier d'un document, retrouvé par ressemblance de nom. Cette mesure n'écrit rien et ne
 *  publie rien : une présomption y est recevable là où elle ne le serait pas dans le produit. */
const net = (texte: string): string =>
  texte
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/\.pdf$/u, "")
    .replaceAll(/[^a-z0-9]+/gu, "");
const dossiers = [...new Set(tousLesNoms.filter((nom) => nom.includes("/")).map((nom) => nom.split("/")[0]!))];
const dossierDuDocument = (nomDuDocument: string): string | undefined => {
  const cherche = net(nomDuDocument);
  return (
    dossiers.find((dossier) => net(dossier) === cherche) ??
    dossiers.find((dossier) => net(dossier).includes(cherche) || cherche.includes(net(dossier)))
  );
};

const nomsParEmpreinte = new Map<string, string>();
for (const fichier of readdirSync(join(base, "travaux"))) {
  if (!fichier.endsWith(".json")) continue;
  try {
    const travail = JSON.parse(readFileSync(join(base, "travaux", fichier), "utf8")) as {
      empreinte?: string;
      sujet?: { nom?: string };
    };
    if (travail.empreinte !== undefined && travail.sujet?.nom !== undefined)
      nomsParEmpreinte.set(travail.empreinte, travail.sujet.nom);
  } catch {
    // Un travail illisible n'empêche pas de mesurer les autres.
  }
}

// ── La règle telle qu'elle était, réécrite ici pour comparer ────────────────────────────
//
// Un jeton n'était reçu que s'il n'appartenait qu'à un seul nom, et seuls les mots isolés d'au
// moins quatre caractères comptaient. Elle n'est plus dans le produit : on la garde ici parce
// qu'une comparaison a besoin de ses deux termes.
const CARACTERES = 4;
const NOMBRE_COMPOSE = /\b\d{1,3}[.-]\d{1,3}\b/gu;
const normaliser = (texte: string): string =>
  texte
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();
const corpsDuNom = (nom: string): string => nom.replace(/\.[a-z0-9]+$/iu, "").split("/").pop() ?? nom;

function selonLAncienneRegle(contenus: readonly { page: number; texte: string }[]): Map<number, Set<number>> {
  const jetonsDe = (nom: string): readonly string[] => {
    const corps = apresLAdresse(corpsDuNom(nom));
    const composes = (corps.match(NOMBRE_COMPOSE) ?? []).map((brut) => brut.replace("-", "."));
    const mots = normaliser(corps)
      .split(" ")
      .filter((mot) => mot.length >= CARACTERES && /[a-z]/u.test(mot));
    return [...new Set([...composes, ...mots])];
  };
  const tous = noms.map(jetonsDe);
  const combienDeNoms = new Map<string, number>();
  for (const jetons of tous) for (const jeton of jetons) combienDeNoms.set(jeton, (combienDeNoms.get(jeton) ?? 0) + 1);
  const propres = tous.map((jetons) => jetons.filter((jeton) => combienDeNoms.get(jeton) === 1));

  const pagesParMedia = new Map<number, Set<number>>();
  for (const { page, texte } of contenus) {
    const normalise = ` ${normaliser(texte)} `;
    const composes = new Set((texte.match(NOMBRE_COMPOSE) ?? []).map((brut) => brut.replace("-", ".")));
    const trouves = propres
      .map((jetons, rang) => ({
        rang,
        combien: jetons.filter((jeton) => (composes.has(jeton) ? true : normalise.includes(` ${jeton} `))).length,
      }))
      .filter(({ combien }) => combien > 0);
    if (trouves.length !== 1) continue;
    const rang = trouves[0]!.rang;
    pagesParMedia.set(rang, (pagesParMedia.get(rang) ?? new Set()).add(page));
  }
  return pagesParMedia;
}

function selonLaRegleRenforcee(contenus: readonly { page: number; texte: string }[]): Map<number, Set<number>> {
  const accords = accordsNomContenu(designationsDesNoms(noms), contenus);
  const pagesParMedia = new Map<number, Set<number>>();
  for (const accord of accords)
    for (const rang of accord.rangs) pagesParMedia.set(rang, (pagesParMedia.get(rang) ?? new Set()).add(accord.page));
  return pagesParMedia;
}

// ── Le même tirage que le banc d'échantillon ────────────────────────────────────────────
const { createHash } = await import("node:crypto");
const tires = Object.keys(actives)
  .map((empreinte) => ({ empreinte, rang: createHash("sha256").update(`${graine}:${empreinte}`).digest("hex") }))
  .sort((un, autre) => un.rang.localeCompare(autre.rang))
  .slice(0, combien);

console.log(`${noms.length} nom(s) dans le vivier présenté ; ${combien} document(s), graine « ${graine} »\n`);
console.log("                                          ancienne règle      règle renforcée");
console.log("document                                  pages  retenus      pages  retenus   sur une seule page");

const retenus = (pages: Map<number, Set<number>>): number =>
  [...pages.values()].filter((vues) => vues.size === 1).length;

for (const [place, { empreinte }] of tires.entries()) {
  const nom = nomsParEmpreinte.get(empreinte) ?? empreinte.slice(0, 12);
  const version = actives[empreinte]!.version;
  let passages: { page: number; texte: string }[] = [];
  try {
    const lu = JSON.parse(readFileSync(join(base, "versions", `${version}.json`), "utf8")) as {
      passages?: { page: number; texte: string }[];
    };
    passages = lu.passages ?? [];
  } catch {
    console.log(`${String(place + 1).padStart(2)} ${nom.slice(0, 38).padEnd(38)}  version illisible`);
    continue;
  }
  if (passages.length === 0) {
    console.log(`${String(place + 1).padStart(2)} ${nom.slice(0, 38).padEnd(38)}  aucun passage gardé`);
    continue;
  }
  if (borner) {
    const dossier = dossierDuDocument(nom);
    if (dossier === undefined) {
      console.log(`${String(place + 1).padStart(2)} ${nom.slice(0, 38).padEnd(38)}  aucun dossier de dépôt reconnu`);
      continue;
    }
    noms = tousLesNoms.filter((media) => media.startsWith(`${dossier}/`));
  }
  const avant = selonLAncienneRegle(passages);
  const apres = selonLaRegleRenforcee(passages);
  const plusieursPages = [...apres.values()].filter((vues) => vues.size > 1).length;
  console.log(
    `${String(place + 1).padStart(2)} ${nom.slice(0, 38).padEnd(38)}  ` +
      `${String(passages.length).padStart(4)}  ${String(retenus(avant)).padStart(6)}      ` +
      `${String(passages.length).padStart(4)}  ${String(retenus(apres)).padStart(6)}   ` +
      `${String(apres.size - plusieursPages).padStart(4)} sur ${apres.size} trouvé(s)`,
  );
}
