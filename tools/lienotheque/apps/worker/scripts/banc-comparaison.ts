import { readFileSync, writeFileSync } from "node:fs";
import {
  centile,
  citationsNonVerifiees,
  cleDeResultat,
  ouvragesPerdus,
  recouvrement,
  verdict,
  type ResultatRendu,
} from "@lienotheque/noyau";

/** Le banc qui autorisera la bascule (BAS-03).
 *
 *      pnpm --filter @lienotheque/worker exec tsx scripts/banc-comparaison.ts \
 *        <adresse ancienne> <adresse nouvelle> <fichier de questions> [rapport.md]
 *
 *  Les jetons se lisent dans l'environnement — `JETON_ANCIENNE` et `JETON_NOUVELLE` —, jamais sur
 *  la ligne de commande : une ligne de commande se retrouve dans l'historique du terminal.
 *
 *  Il interroge les deux côtés avec **exactement le même corps**, et rend un rapport daté. Les
 *  seuils sont dans `@lienotheque/noyau` et ont été écrits avant la première mesure : un seuil
 *  choisi après coup mesure la patience de celui qui l'a choisi.
 *
 *  Ce qu'il ne fait pas : juger l'exactitude des pages. Elle se relit à la main sur un
 *  échantillon, parce que c'est le seul endroit où une divergence entre les deux systèmes est
 *  une **amélioration** — et aucune mesure automatique ne sait faire cette différence. */

const [ancienneAdresse, nouvelleAdresse, fichierQuestions, sortie] = process.argv.slice(2);
if (ancienneAdresse === undefined || nouvelleAdresse === undefined || fichierQuestions === undefined) {
  console.error("Attendu : <adresse ancienne> <adresse nouvelle> <fichier de questions> [rapport.md]");
  process.exit(2);
}

const questions = readFileSync(fichierQuestions, "utf8")
  .split("\n")
  .map((ligne) => ligne.trim())
  .filter((ligne) => ligne.length > 0 && !ligne.startsWith("#"));

type Cote = { readonly nom: string; readonly adresse: string; readonly jeton: string | undefined };
const cotes: readonly [Cote, Cote] = [
  { nom: "ancienne", adresse: ancienneAdresse, jeton: process.env["JETON_ANCIENNE"] },
  { nom: "nouvelle", adresse: nouvelleAdresse, jeton: process.env["JETON_NOUVELLE"] },
];

async function interroger(cote: Cote, question: string): Promise<{ resultats: readonly ResultatRendu[]; duree: number }> {
  const debut = performance.now();
  try {
    const reponse = await fetch(`${cote.adresse.replace(/\/$/, "")}/search-library`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cote.jeton === undefined ? {} : { "x-api-key": cote.jeton }) },
      body: JSON.stringify({ query: question, topK: 10 }),
    });
    const duree = performance.now() - debut;
    if (!reponse.ok) return { resultats: [], duree };
    const corps = (await reponse.json()) as { results?: ResultatRendu[]; chunks?: ResultatRendu[] };
    return { resultats: corps.results ?? corps.chunks ?? [], duree };
  } catch {
    // Une question qui échoue compte comme une question sans réponse, et sa durée ne compte pas :
    // mélanger une panne à une latence rendrait les deux illisibles.
    return { resultats: [], duree: Number.NaN };
  }
}

const lignes: string[] = [];
const dureesAncienne: number[] = [];
const dureesNouvelle: number[] = [];
const perdusPartout: string[] = [];
const citationsFautives: string[] = [];
let recouvrementTotal = 0;

for (const question of questions) {
  const [ancienne, nouvelle] = await Promise.all([interroger(cotes[0], question), interroger(cotes[1], question)]);
  if (!Number.isNaN(ancienne.duree)) dureesAncienne.push(ancienne.duree);
  if (!Number.isNaN(nouvelle.duree)) dureesNouvelle.push(nouvelle.duree);

  const perdus = ouvragesPerdus(ancienne.resultats, nouvelle.resultats);
  perdusPartout.push(...perdus);
  const recouvre = recouvrement(ancienne.resultats, nouvelle.resultats);
  recouvrementTotal += recouvre;

  // Chaque extrait rendu doit exister mot pour mot dans ce que le même côté rend comme texte.
  const sources = new Map(nouvelle.resultats.map((r) => [cleDeResultat(r), typeof r.content === "string" ? r.content : ""]));
  citationsFautives.push(...citationsNonVerifiees(nouvelle.resultats, (r) => sources.get(cleDeResultat(r))));

  lignes.push(
    `| ${question.slice(0, 40)} | ${ancienne.resultats.length} | ${nouvelle.resultats.length} | ` +
      `${perdus.length} | ${(recouvre * 100).toFixed(0)} % | ${Math.round(ancienne.duree)} | ${Math.round(nouvelle.duree)} |`,
  );
}

const p95Ancienne = centile(dureesAncienne, 0.95);
const p95Nouvelle = centile(dureesNouvelle, 0.95);
const rendu = verdict({
  ouvragesPerdus: [...new Set(perdusPartout)],
  citationsNonVerifiees: citationsFautives,
  p95Ancienne,
  p95Nouvelle,
});

const rapport = [
  `# Comparaison des deux bibliothèques — ${new Date().toISOString().slice(0, 10)}`,
  "",
  `${questions.length} question(s), posées à l'identique des deux côtés.`,
  "",
  "| Question | Anciens | Nouveaux | Perdus | Recouvrement | Ancienne (ms) | Nouvelle (ms) |",
  "|---|---:|---:|---:|---:|---:|---:|",
  ...lignes,
  "",
  `**Latence** : médiane ${Math.round(centile(dureesAncienne, 0.5))} / ${Math.round(centile(dureesNouvelle, 0.5))} ms, ` +
    `95ᵉ centile ${Math.round(p95Ancienne)} / ${Math.round(p95Nouvelle)} ms (ancienne / nouvelle).`,
  `**Recouvrement moyen** : ${((recouvrementTotal / Math.max(questions.length, 1)) * 100).toFixed(0)} %, rapporté et non bloquant.`,
  `**Ouvrages perdus** : ${new Set(perdusPartout).size}.`,
  `**Citations non vérifiées** : ${citationsFautives.length}.`,
  "",
  rendu.tenu
    ? "**Les seuils sont tenus.** Reste l'exactitude des pages, qui se relit à la main sur un échantillon."
    : `**Les seuils ne sont pas tenus :**\n${rendu.motifs.map((motif) => `- ${motif}`).join("\n")}`,
  "",
].join("\n");

console.log(rapport);
if (sortie !== undefined) {
  writeFileSync(sortie, rapport);
  console.error(`Rapport écrit dans ${sortie}`);
}
process.exit(rendu.tenu ? 0 : 1);
