/** F5 — l'épreuve Funk Fusion en réel, chaque appel tracé (REC-07).
 *
 *  Les appels en ligne sont autorisés depuis le 5 novembre 2026 pour éprouver le système, à une
 *  condition : **chaque appel est tracé dans un journal versionnable**. Le transport du Worker
 *  accepte un `fetch` injectable ; c'est par là que le journal se branche, **sans toucher ni au
 *  produit ni au contrôle**. Le contrôle officiel (`test/funk-fusion-corpus.test.ts`) reste la
 *  référence : ce banc fait les mêmes appels, avec le même cache, pour que le contrôle puisse
 *  ensuite tourner sur les réponses déjà obtenues — et ne rien coûter une seconde fois.
 *
 *  Le journal porte ce que la réponse dit vraiment : les jetons d'entrée et de sortie, comptés
 *  par le Worker. Le coût en argent est **calculé depuis un tarif déclaré dans le journal**, pour
 *  qu'il soit corrigible : un chiffre dont on ne sait pas d'où il vient ne vaut rien.
 *
 *  Usage : tsx mesures/epreuve-funk-fusion.ts */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chargerRecette, comparer, rejouer } from "@lienotheque/recettes";
import { jetonDacces, transportValidationCiblesVersWorker, validationStructurelleCiblee } from "../src/index.js";

const RACINE = join(import.meta.dirname, "../../..");
const F5 = join(RACINE, "fixtures/fichiers/F5");
/** Le document est **trouvé**, pas nommé en dur : la fixture a changé de numérisation le
 *  5 novembre 2026 et le nom du PDF avec elle. Un nom écrit ici fait échouer le banc sur une
 *  fixture parfaitement valide, et c'est arrivé. Un seul PDF dans F5 ; s'il y en avait deux, il
 *  faudrait choisir, et ce banc n'a pas à deviner. */
const pdfsDeF5 = existsSync(F5) ? readdirSync(F5).filter((nom) => nom.toLowerCase().endsWith(".pdf")) : [];
if (pdfsDeF5.length !== 1) {
  console.error(
    `F5 doit porter exactement un PDF ; il en porte ${pdfsDeF5.length}` +
      (pdfsDeF5.length === 0 ? ` (dossier ${existsSync(F5) ? "vide ou sans PDF" : "absent"} : ${F5})` : ` : ${pdfsDeF5.join(", ")}`),
  );
  process.exit(2);
}
const PDF = join(F5, pdfsDeF5[0]!);
const JOURNAL = join(RACINE, "docs/journal-appels-en-ligne.jsonl");
const BASE = process.env["LIENOTHEQUE_DIAGNOSTIC_URL"] ?? "https://lienotheque-api.11drumboy11.workers.dev";

/** Tarif **public**, en dollars par million de jetons, et sa source.
 *
 *  Le modèle n'est pas supposé : il est lu dans le Worker — `apps/worker/src/vision.ts` déclare
 *  `MODELE = "claude-haiku-4-5"`, et `diagnostic-structurel.ts` importe la même constante pour la
 *  validation des cibles comme pour la relecture. Les deux routes appellent donc le même modèle,
 *  par l'API Anthropic directe.
 *
 *  Le tarif est celui de la documentation Anthropic, relevé le 5 novembre 2026 :
 *  https://platform.claude.com/docs/en/about-claude/pricing — ligne « Claude Haiku 4.5 » :
 *  entrée 1 $/MTok, sortie 5 $/MTok, lecture de cache 0,10 $/MTok. Les 0,50 $/2,50 $ de la même
 *  page relèvent du **traitement par lots**, que ce chemin n'emploie pas.
 *
 *  Les jetons comptés par le Worker restent le fait de référence ; le tarif ne fait que les
 *  convertir, et il est écrit dans chaque ligne du journal pour rester vérifiable. */
const TARIF = {
  entree: 1.0,
  sortie: 5.0,
  lectureDeCache: 0.1,
  modele: "claude-haiku-4-5",
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  releveLe: "2026-11-05",
} as const;

const jeton = jetonDacces();
if (jeton === undefined) {
  console.error("Aucun jeton au trousseau du système. Rien n'est appelé.");
  process.exit(2);
}
mkdirSync(join(RACINE, "docs"), { recursive: true });
const cout = (entree: number, sortie: number): number =>
  (entree * TARIF.entree + sortie * TARIF.sortie) / 1_000_000;

let appels = 0;
let jetonsEntree = 0;
let jetonsSortie = 0;

/** Le `fetch` journalisant. Il ne change rien à l'appel : il le note. */
const fetchTrace: typeof fetch = async (entree, options) => {
  const adresse = typeof entree === "string" ? entree : entree instanceof URL ? entree.toString() : entree.url;
  const corps = typeof options?.body === "string" ? (JSON.parse(options.body) as { document?: string; pages?: { numero: number }[]; cibles?: string[] }) : undefined;
  const debut = Date.now();
  let statut = 0;
  let jetonsDeLAppel: { entree: number; sortie: number } | undefined;
  let resultat = "échec";
  try {
    const vue = await fetch(entree, options);
    statut = vue.status;
    // La réponse est lue ici puis rendue telle quelle : on ne consomme pas le flux de l'appelant.
    const texte = await vue.text();
    if (vue.ok) {
      const lu = JSON.parse(texte) as { jetons?: { entree: number; sortie: number }; resultats?: { etat: string }[] };
      jetonsDeLAppel = lu.jetons;
      resultat = (lu.resultats ?? []).map((r) => r.etat).join(",") || "sans résultat";
    } else resultat = `refusé (${vue.status})`;
    return new Response(texte, { status: vue.status, statusText: vue.statusText, headers: vue.headers });
  } finally {
    appels += 1;
    jetonsEntree += jetonsDeLAppel?.entree ?? 0;
    jetonsSortie += jetonsDeLAppel?.sortie ?? 0;
    appendFileSync(
      JOURNAL,
      `${JSON.stringify({
        quand: new Date().toISOString(),
        route: adresse,
        statut,
        document: corps?.document,
        feuilles: corps?.pages?.map((p) => p.numero),
        cibles: corps?.cibles,
        resultat,
        duree_ms: Date.now() - debut,
        jetons: jetonsDeLAppel ?? null,
        cout_estime_usd: jetonsDeLAppel === undefined ? null : Number(cout(jetonsDeLAppel.entree, jetonsDeLAppel.sortie).toFixed(6)),
        tarif: TARIF,
        etape: "F5 — épreuve Funk Fusion (REC-07)",
      })}\n`,
    );
  }
};

const recette = chargerRecette(
  JSON.parse(readFileSync(join(RACINE, "fixtures/recettes/methode-numero-compose-piste.v2.json"), "utf8")),
);
const reference = JSON.parse(
  readFileSync(join(RACINE, "fixtures/references/funk-fusion-bass-appariement.json"), "utf8"),
) as { appariements: [number, number][] };

console.log(`  document : ${PDF}`);
console.log(`  médias   : ${F5} (99 MP3 attendus)`);
console.log(`  Worker   : ${BASE}`);
console.log(`  journal  : ${JOURNAL}`);
console.log();

const debut = Date.now();
const joue = await rejouer(PDF, F5, recette, {
  vivierAffirmeParLAppelant: true,
  ...(process.env["LIENOTHEQUE_CACHE_LECTURES"] === undefined ? {} : { cache: process.env["LIENOTHEQUE_CACHE_LECTURES"] }),
  validationStructurelle: validationStructurelleCiblee(
    transportValidationCiblesVersWorker(BASE, jeton, fetchTrace),
    process.env["LIENOTHEQUE_CACHE_VALIDATIONS"] === undefined
      ? {}
      : { cache: process.env["LIENOTHEQUE_CACHE_VALIDATIONS"] },
  ),
});

const score = comparer(
  joue.resultat.lignes,
  reference.appariements.map(([numero, piste]) => ({ numero, piste })),
);

console.log(`  durée de l'épreuve : ${((Date.now() - debut) / 1000).toFixed(0)} s`);
console.log();
console.log("  ── résultat contre l'attendu ──");
const attendu = { justes: 98, manquants: 0, fautifs: 0, supplementaires: 0, orphelins: 0 };
const obtenu = {
  justes: score.justes,
  manquants: score.manquants.length,
  fautifs: score.fautifs.length,
  supplementaires: score.supplementaires.length,
  orphelins: (joue.association.orphelins ?? []).length,
};
for (const cle of Object.keys(attendu) as (keyof typeof attendu)[])
  console.log(`  ${cle.padEnd(16)} attendu ${String(attendu[cle]).padStart(3)}   obtenu ${String(obtenu[cle]).padStart(3)}   ${attendu[cle] === obtenu[cle] ? "=" : "ÉCART"}`);
if (score.manquants.length > 0) console.log(`     manquants : ${JSON.stringify(score.manquants)}`);
if (score.fautifs.length > 0) console.log(`     fautifs : ${JSON.stringify(score.fautifs)}`);
if (score.supplementaires.length > 0) console.log(`     supplémentaires : ${JSON.stringify(score.supplementaires)}`);
if ((joue.association.orphelins ?? []).length > 0) console.log(`     orphelins : ${JSON.stringify(joue.association.orphelins)}`);
if (joue.association.abstention !== undefined)
  console.log(`     abstention : ${joue.association.abstention.raison} — ${joue.association.abstention.pourquoi ?? ""}`);

// La sortie est gardée : une mesure qu'on ne peut pas reprendre sans tout relancer n'est pas une
// mesure, c'est un souvenir. Sans elle, la portée des éléments de F5 aurait demandé un second
// passage de seize minutes pour une question qui n'avait pas été posée le premier jour.
const SORTIE = join(RACINE, "outils/vision/mesures/sorties/f5-5nov");
mkdirSync(SORTIE, { recursive: true });
writeFileSync(
  join(SORTIE, "f5-apres.json"),
  `${JSON.stringify({ resultat: joue.resultat, association: joue.association, medias: joue.medias }, null, 1)}\n`,
);
console.log(`  sortie gardée : ${join(SORTIE, "f5-apres.json")}`);

console.log();
console.log("  ── coût de l'étape ──");
console.log(`  appels en ligne : ${appels}`);
console.log(`  jetons          : ${jetonsEntree} en entrée, ${jetonsSortie} en sortie`);
console.log(`  coût            : ${cout(jetonsEntree, jetonsSortie).toFixed(4)} $  (tarif public claude-haiku-4-5 : 1 $ / 5 $ par MTok)`);

// Le cumul se lit dans le journal, qui fait foi — s'il existe. **Zéro appel est un résultat**,
// pas une panne : le 5 novembre 2026, une épreuve qui s'abstenait sans appeler personne faisait
// mourir ce banc sur l'empreinte d'un fichier jamais créé, et le code de sortie accusait
// l'épreuve au lieu du banc.
if (!existsSync(JOURNAL)) {
  console.log("  aucun appel : le journal n'a pas été créé, et il n'y a donc rien à cumuler.");
  console.log("  cumul depuis le 5 novembre : 0.0000 $ sur 0 appel");
} else {
  let total = 0;
  let lignes = 0;
  for (const ligne of readFileSync(JOURNAL, "utf8").split("\n").filter((l) => l.trim() !== "")) {
    const lu = JSON.parse(ligne) as { cout_estime_usd?: number | null };
    total += lu.cout_estime_usd ?? 0;
    lignes += 1;
  }
  console.log(`  cumul depuis le 5 novembre : ${total.toFixed(4)} $ sur ${lignes} appel(s) — lu dans le journal`);
  console.log(`  empreinte du journal : ${createHash("sha256").update(readFileSync(JOURNAL)).digest("hex").slice(0, 16)}`);
}
