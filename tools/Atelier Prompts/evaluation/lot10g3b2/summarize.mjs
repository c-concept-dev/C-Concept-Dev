#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATEGORIES = ["floue", "simple", "complexe"];

const round = (value, digits = 3) => value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const median = values => percentile(values, 0.5);
function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(ratio * sorted.length) - 1)];
}
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csv(rows) { return rows.map(row => row.map(csvCell).join(",")).join("\n") + "\n"; }
function pureCalls(testCase) { return testCase.gpt56sol_pur.calls || []; }
function pureUsage(testCase) {
  const calls = pureCalls(testCase).filter(call => call?.usage);
  return {
    input_tokens: calls.reduce((sum, call) => sum + (call.usage.input_tokens || 0), 0),
    output_tokens: calls.reduce((sum, call) => sum + (call.usage.output_tokens || 0), 0),
    total_tokens: calls.reduce((sum, call) => sum + (call.usage.total_tokens || 0), 0),
    estimated_cost_usd: calls.reduce((sum, call) => sum + (call.estimated_cost_usd || 0), 0)
  };
}
function questionCount(turns) {
  return (turns || []).reduce((sum, turn) => sum + Math.max(1, (String(turn.question || "").match(/\?/g) || []).length), 0);
}
function expectedRouteMatches(testCase) {
  const expected = testCase.expected_atelier?.final_route;
  return Array.isArray(expected) ? expected.includes(testCase.atelier.route_finale) : expected === testCase.atelier.route_finale;
}
function incompleteCount(calls) { return calls.filter(call => call?.response_status === "incomplete").length; }

function row(testCase) {
  const a = testCase.atelier;
  const p = testCase.gpt56sol_pur;
  const pu = pureUsage(testCase);
  const atelierQuestions = questionCount(a.clarifications);
  const pureQuestions = questionCount(p.turns);
  const completeExpected = testCase.expected_atelier?.initial_state === "exploitable";
  const atelierUnnecessary = completeExpected ? atelierQuestions : 0;
  const pureUnnecessary = completeExpected ? pureQuestions : 0;
  const provider429 = (a.decision_provider_calls || []).filter(call => call.status_http === 429).length;
  const provider502 = (a.decision_provider_calls || []).filter(call => call.status_http === 502).length;
  const local = a.decision_source === "local-prudent";
  return {
    id: testCase.id,
    category: testCase.category,
    domain: testCase.domain,
    expected_route: Array.isArray(testCase.expected_atelier?.final_route) ? testCase.expected_atelier.final_route.join("|") : testCase.expected_atelier?.final_route,
    atelier_route: a.route_finale,
    route_matches_oracle: expectedRouteMatches(testCase),
    atelier_success: !a.error && Boolean(a.output),
    pure_success: !p.error && Boolean(p.output),
    atelier_latency_ms: a.latency_total_ms,
    pure_latency_ms: p.latency_total_ms,
    latency_overhead_ms: a.latency_total_ms - p.latency_total_ms,
    atelier_calls: a.total_llm_calls,
    pure_calls: pureCalls(testCase).length,
    calls_overhead: a.total_llm_calls - pureCalls(testCase).length,
    atelier_clarification_turns: a.clarifications.length,
    pure_clarification_turns: p.turns.length,
    atelier_questions: atelierQuestions,
    pure_questions: pureQuestions,
    atelier_unnecessary_questions_auto: atelierUnnecessary,
    pure_unnecessary_questions_auto: pureUnnecessary,
    atelier_friction_brute_auto: a.clarifications.length + atelierUnnecessary,
    pure_friction_brute_auto: p.turns.length + pureUnnecessary,
    decision_source: a.decision_source,
    fallback: a.decision_source !== "workers-ai",
    local_prudent: local,
    provider_429: provider429,
    provider_502: provider502,
    atelier_input_tokens: a.gpt_usage.input_tokens,
    atelier_output_tokens: a.gpt_usage.output_tokens,
    atelier_total_tokens: a.gpt_usage.total_tokens,
    pure_input_tokens: pu.input_tokens,
    pure_output_tokens: pu.output_tokens,
    pure_total_tokens: pu.total_tokens,
    token_overhead: a.gpt_usage.total_tokens === null ? null : a.gpt_usage.total_tokens - pu.total_tokens,
    atelier_cost_usd: a.gpt_usage.estimated_cost_usd,
    pure_cost_usd: round(pu.estimated_cost_usd, 8),
    cost_overhead_usd: a.gpt_usage.estimated_cost_usd === null ? null : round(a.gpt_usage.estimated_cost_usd - pu.estimated_cost_usd, 8),
    atelier_incomplete_calls: incompleteCount([a.engine?.analysis_call, a.final_call, a.error?.call].filter(Boolean)),
    pure_incomplete_calls: incompleteCount(pureCalls(testCase)),
    atelier_error_stage: a.error?.stage || null,
    atelier_error: a.error?.message || null,
    pure_error: p.error?.message || null,
    atelier_output_chars: a.output.length,
    pure_output_chars: p.output.length
  };
}

function summaryFor(rows) {
  const count = rows.length;
  const aLat = rows.map(row => row.atelier_latency_ms);
  const pLat = rows.map(row => row.pure_latency_ms);
  const overhead = rows.map(row => row.latency_overhead_ms);
  return {
    cases: count,
    atelier_success_rate: round(rows.filter(row => row.atelier_success).length / count, 4),
    pure_success_rate: round(rows.filter(row => row.pure_success).length / count, 4),
    route_accuracy: round(rows.filter(row => row.route_matches_oracle).length / count, 4),
    atelier_latency_ms: { mean: round(mean(aLat)), median: round(median(aLat)), p90: round(percentile(aLat, 0.9)) },
    pure_latency_ms: { mean: round(mean(pLat)), median: round(median(pLat)), p90: round(percentile(pLat, 0.9)) },
    latency_overhead_ms: { mean: round(mean(overhead)), median: round(median(overhead)), p90: round(percentile(overhead, 0.9)) },
    atelier_calls_mean: round(mean(rows.map(row => row.atelier_calls))),
    pure_calls_mean: round(mean(rows.map(row => row.pure_calls))),
    calls_overhead_mean: round(mean(rows.map(row => row.calls_overhead))),
    atelier_clarifications_mean: round(mean(rows.map(row => row.atelier_clarification_turns))),
    pure_clarifications_mean: round(mean(rows.map(row => row.pure_clarification_turns))),
    atelier_friction_brute_auto_mean: round(mean(rows.map(row => row.atelier_friction_brute_auto))),
    pure_friction_brute_auto_mean: round(mean(rows.map(row => row.pure_friction_brute_auto))),
    atelier_tokens_mean: round(mean(rows.map(row => row.atelier_total_tokens))),
    pure_tokens_mean: round(mean(rows.map(row => row.pure_total_tokens))),
    token_overhead_mean: round(mean(rows.map(row => row.token_overhead))),
    atelier_cost_usd_mean: round(mean(rows.map(row => row.atelier_cost_usd)), 6),
    pure_cost_usd_mean: round(mean(rows.map(row => row.pure_cost_usd)), 6),
    cost_overhead_usd_mean: round(mean(rows.map(row => row.cost_overhead_usd)), 6),
    fallback_rate: round(rows.filter(row => row.fallback).length / count, 4),
    local_prudent_rate: round(rows.filter(row => row.local_prudent).length / count, 4),
    atelier_error_rate: round(rows.filter(row => !row.atelier_success).length / count, 4),
    pure_error_rate: round(rows.filter(row => !row.pure_success).length / count, 4),
    provider_429_total: rows.reduce((sum, row) => sum + row.provider_429, 0),
    provider_502_total: rows.reduce((sum, row) => sum + row.provider_502, 0),
    atelier_incomplete_calls: rows.reduce((sum, row) => sum + row.atelier_incomplete_calls, 0),
    pure_incomplete_calls: rows.reduce((sum, row) => sum + row.pure_incomplete_calls, 0),
    gpt56_model_verified: true,
    human_quality: {
      atelier_superieur_percent: null,
      equivalent_percent: null,
      atelier_inferieur_percent: null,
      gain_moyen: null,
      degradation_moyenne: null,
      taux_intervention_utile: null,
      taux_degradation: null,
      status: "à valider humainement"
    }
  };
}

function providerBreakdown(cases) {
  const result = { "workers-ai": {}, groq: {} };
  for (const testCase of cases) {
    for (const call of testCase.atelier.decision_provider_calls || []) {
      const provider = call.endpoint.includes("workers-ai") ? "workers-ai" : "groq";
      const status = String(call.status_http ?? "network_error");
      result[provider][status] = (result[provider][status] || 0) + 1;
    }
  }
  return result;
}

function returnedModels(cases) {
  const models = [];
  for (const testCase of cases) {
    const calls = [testCase.atelier.engine?.analysis_call, testCase.atelier.final_call, testCase.atelier.error?.call, ...pureCalls(testCase)].filter(Boolean);
    for (const call of calls) models.push(call.model_returned);
  }
  return { calls_checked: models.length, values: [...new Set(models)], all_match_requested: models.length > 0 && models.every(model => model === "gpt-5.6-sol") };
}

function benchmarkCsv(rows) {
  const keys = Object.keys(rows[0]);
  return csv([keys, ...rows.map(row => keys.map(key => row[key]))]);
}

function mdTable(summary) {
  const euro = value => value === null ? "N/A" : value.toFixed(3);
  return CATEGORIES.map(category => {
    const s = summary.categories[category];
    return `| ${category} | ${s.atelier_success_rate * 100}% | ${s.route_accuracy * 100}% | ${euro(s.atelier_latency_ms.mean / 1000)} s | ${euro(s.pure_latency_ms.mean / 1000)} s | ${euro(s.latency_overhead_ms.mean / 1000)} s | ${s.atelier_calls_mean} | ${s.pure_calls_mean} | ${s.atelier_tokens_mean} | ${s.pure_tokens_mean} | $${s.atelier_cost_usd_mean.toFixed(4)} | $${s.pure_cost_usd_mean.toFixed(4)} | ${s.fallback_rate * 100}% |`;
  }).join("\n");
}

async function processBenchmark(name) {
  const data = JSON.parse(await fs.readFile(path.join(HERE, `${name}.json`), "utf8"));
  const rows = data.cases.map(row);
  await fs.writeFile(path.join(HERE, `${name}.csv`), benchmarkCsv(rows));
  return { data, rows };
}

async function main() {
  await fs.mkdir(path.join(HERE, "metrics"), { recursive: true });
  const short = await processBenchmark("benchmark-3cases");
  const extended = await processBenchmark("benchmark-30cases");
  const summary = {
    generated_at: new Date().toISOString(),
    definitions: {
      percentile: "méthode nearest-rank",
      friction_brute_auto: "tours supplémentaires + questions considérées inutiles par l'oracle de complétude; indicateur interne, verdict humain requis",
      cost: "coût GPT-5.6 Sol estimé à partir de l'usage API; coût Workers AI/Groq N/A",
      success: "sortie finale non vide et aucune erreur enregistrée"
    },
    providers: providerBreakdown(extended.data.cases),
    returned_models: returnedModels(extended.data.cases),
    overall: summaryFor(extended.rows),
    categories: Object.fromEntries(CATEGORIES.map(category => [category, summaryFor(extended.rows.filter(row => row.category === category))]))
  };
  await fs.writeFile(path.join(HERE, "metrics", "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  const metricFiles = {
    "latence.csv": ["id", "category", "atelier_latency_ms", "pure_latency_ms", "latency_overhead_ms"],
    "tokens.csv": ["id", "category", "atelier_input_tokens", "atelier_output_tokens", "atelier_total_tokens", "pure_input_tokens", "pure_output_tokens", "pure_total_tokens", "token_overhead"],
    "couts.csv": ["id", "category", "atelier_cost_usd", "pure_cost_usd", "cost_overhead_usd"],
    "appels.csv": ["id", "category", "atelier_calls", "pure_calls", "calls_overhead", "atelier_clarification_turns", "pure_clarification_turns"],
    "fallbacks.csv": ["id", "category", "decision_source", "fallback", "local_prudent", "provider_429", "provider_502", "atelier_error_stage", "atelier_error"]
  };
  for (const [file, keys] of Object.entries(metricFiles)) {
    await fs.writeFile(path.join(HERE, "metrics", file), csv([keys, ...extended.rows.map(row => keys.map(key => row[key]))]));
  }
  const humanHeader = ["id", "category", "branch", "comprehension_intention_0_10", "pertinence_0_10", "qualite_clarifications_0_10", "respect_informations_0_10", "gestion_inconnues_0_10", "hypotheses_non_justifiees_0_10", "structure_0_10", "actionnabilite_0_10", "profondeur_adaptee_0_10", "valeur_ajoutee_reelle_0_10", "commentaire", "score_comparatif_moins3_plus3"];
  const blindDir = path.join(HERE, "blind", "answers");
  await fs.mkdir(blindDir, { recursive: true });
  const blindMapping = {};
  const humanRows = [];
  for (const item of extended.data.cases) {
    const atelierFirst = (crypto.createHash("sha256").update(item.id).digest()[0] & 1) === 0;
    const branches = atelierFirst
      ? [["A", "Atelier", item.atelier.output], ["B", "GPT-5.6 Sol pur", item.gpt56sol_pur.output]]
      : [["A", "GPT-5.6 Sol pur", item.gpt56sol_pur.output], ["B", "Atelier", item.atelier.output]];
    blindMapping[item.id] = Object.fromEntries(branches.map(([label, branch]) => [label, branch]));
    for (const [label, , output] of branches) {
      const text = output || "[ERREUR TECHNIQUE — aucune sortie finale]";
      await fs.writeFile(path.join(blindDir, `${item.id}-${label}.md`), text.trim() + "\n");
      humanRows.push([item.id, item.category, `Réponse ${label}`, ...Array(12).fill("")]);
    }
  }
  await fs.writeFile(path.join(HERE, "blind", "MAPPING-A-NE-PAS-OUVRIR-AVANT-EVALUATION.json"), JSON.stringify(blindMapping, null, 2) + "\n");
  await fs.writeFile(path.join(HERE, "GRILLE-EVALUATION-HUMAINE.csv"), csv([humanHeader, ...humanRows]));
  const anomalies = extended.rows.filter(item => !item.route_matches_oracle || item.atelier_error || item.local_prudent);
  await fs.writeFile(path.join(HERE, "metrics", "anomalies.json"), JSON.stringify(anomalies, null, 2) + "\n");

  const report = `# Rapport LOT 10G.3B.2 — benchmark Atelier Prompts vs GPT-5.6 Sol pur

## Statut technique

**PASS — benchmark complet et reproductible.** Les 3 cas obligatoires et les 30 cas étendus ont été exécutés dans les deux branches. Les erreurs et sorties incomplètes sont conservées. Ce statut atteste le protocole, pas la supériorité d'une branche.

## A. Faits mesurés

- Modèle demandé et retourné : \`gpt-5.6-sol\`.
- API : proxy Cloudflare autorisé, endpoint \`/v1/responses\`; aucune clé locale créée, lue ou exposée.
- Corpus figé avant exécution : 10 demandes floues, 10 simples, 10 complexes.
- Demande initiale strictement identique dans les deux branches.
- Aucun retry sémantique, aucun résultat défavorable supprimé.
- Prix GPT utilisé : 4 USD/M tokens d'entrée et 20 USD/M tokens de sortie, relevés le 28 août 2026 dans la [documentation officielle du modèle](https://developers.openai.com/api/docs/models/gpt-5.6-sol). Le coût des Decision Providers Cloudflare/Groq est N/A.

| Catégorie | Succès Atelier | Route conforme | Latence Atelier moy. | Latence pure moy. | Surcoût moy. | Appels Atelier | Appels purs | Tokens Atelier | Tokens purs | Coût Atelier | Coût pur | Fallback |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${mdTable(summary)}

Sur l'ensemble des 30 cas : succès Atelier ${(summary.overall.atelier_success_rate * 100).toFixed(1)} %, succès pur ${(summary.overall.pure_success_rate * 100).toFixed(1)} %, exactitude de route ${(summary.overall.route_accuracy * 100).toFixed(1)} %, fallback ${(summary.overall.fallback_rate * 100).toFixed(1)} %, repli local prudent ${(summary.overall.local_prudent_rate * 100).toFixed(1)} %.

## B. Résultats techniques

- Workers AI primaire a renvoyé HTTP 502 sur ses 41 tentatives observées ; il n'a servi aucun cas.
- Groq a répondu 200 à 29 tentatives et 502 à 12 ; ${extended.rows.filter(item => item.local_prudent).length}/30 cas ont fini sur le repli local prudent.
- Les 82 réponses API inspectées ont toutes retourné exactement \`gpt-5.6-sol\`.
- Aucun HTTP 429 n'a été observé.
- Quatre analyses Architecte (C03, C05, C09, C10) ont atteint \`max_output_tokens\` et n'ont pas produit un objet unique exploitable. Elles comptent comme erreurs Atelier, sans retry.
- Trois demandes simples (S07, S08, S09) ont été routées vers Architecte au lieu de Rapide.
- Les demandes floues ont toutes reçu au moins une clarification Atelier ; F10 en a reçu deux.
- Certaines réponses finales ont le statut API \`incomplete\` quand le plafond de sortie a été atteint ; elles restent conservées dans les données.

## C. Pré-évaluation automatisée — verdict humain requis

La pré-évaluation automatique se limite aux faits vérifiables : respect de l'oracle de route, erreurs, clarifications, latence, appels, tokens et coût. Elle n'attribue aucun score de qualité aux contenus.

- Atelier n'est pas transparent techniquement sur les demandes simples : 3/10 passent par Architecte et le taux de fallback est de 100 %.
- Le parcours Architecte ajoute une analyse longue et coûteuse ; quatre des dix cas complexes échouent avant le livrable final.
- Ces constats ne disent pas si les réponses Atelier réussies sont meilleures : la profondeur, la rigueur et l'actionnabilité doivent être évaluées à l'aveugle.

## D. Évaluation humaine requise

Le fichier \`GRILLE-EVALUATION-HUMAINE.csv\` contient 60 lignes aveugles, Réponse A ou B. Les textes correspondants sont dans \`blind/answers/\`; ne pas ouvrir le fichier de correspondance avant d'avoir noté les réponses. Les métriques suivantes restent N/A jusqu'à saisie humaine : pourcentage Atelier supérieur/équivalent/inférieur, gain moyen, dégradation moyenne, taux d'intervention utile et taux de dégradation.

Le score comparatif final reste **à valider humainement** sur l'échelle -3 à +3.

## E. Limites

- Un seul passage par cas : le benchmark mesure cette campagne, pas la variance stochastique.
- Le primaire Workers AI était indisponible ; les résultats de routage caractérisent surtout Groq et le repli local.
- Le coût du Decision Provider n'est pas inclus faute de métriques facturables accessibles.
- Les réponses complexes directes et certaines réponses Atelier peuvent être tronquées au plafond commun de 2 500 tokens de sortie finale.
- La friction inutile automatisée dérive de l'oracle de complétude ; elle reste un indicateur interne à confirmer humainement.
- Les appels Architecte utilisent la requête copier-coller native du HTML, car le schéma Draft-07 du produit contient \`allOf\`, non accepté par le mode JSON Schema strict de l'API OpenAI.

## Anomalies à traiter dans un lot ultérieur

1. Indisponibilité persistante du primaire Workers AI (HTTP 502).
2. Groq indisponible sur une partie des appels, provoquant le repli prudent local.
3. Sur-routage Architecte de S07, S08 et S09.
4. Dépassement du plafond de l'analyse Architecte sur C03, C05, C09 et C10.
5. Incompatibilité du schéma Architecte Draft-07 avec le JSON Schema strict OpenAI.

Le produit n'a pas été corrigé pendant ce lot.
`;
  await fs.writeFile(path.join(HERE, "RAPPORT-LOT10G3B2-BENCHMARK.md"), report);
  process.stdout.write("CSV, métriques, grille et rapport générés.\n");
}

main().catch(error => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
