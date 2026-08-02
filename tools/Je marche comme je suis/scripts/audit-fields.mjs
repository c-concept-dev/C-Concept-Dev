import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function loadRegistries() {
  const context = { console, globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(read("src/core/route-engine-core.js"), context, {
    filename: "src/core/route-engine-core.js",
  });
  return context.JMMJSRouteEngineCore;
}

function visibleFields(template) {
  return [...template.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"[^>]*>/g)]
    .map((match) => match[1]);
}

function chipGroups(template) {
  const groups = new Map();
  for (const match of template.matchAll(/<div\b[^>]*\bdata-group="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)) {
    const values = [...match[2].matchAll(/<button\b[^>]*>([\s\S]*?)<\/button\s*>/g)]
      .map((item) => item[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    groups.set(match[1], values);
  }
  return groups;
}

const IMPLEMENTATION_STATUS = Object.freeze({
  place: ["complete", "Géocodage et génération depuis un départ réel."],
  lat: ["complete", "Coordonnée utilisée par la génération."],
  lon: ["complete", "Coordonnée utilisée par la génération."],
  returnRadius: ["complete", "Fermeture contrôlée après calcul."],
  returnTime: ["complete", "Réduit le budget disponible."],
  duration: ["complete", "Plafond audité sur la durée réelle."],
  timeIncludes: ["complete", "Détermine les composantes incluses dans le budget."],
  margin: ["complete", "Soustraite avant génération et auditée."],
  pace: ["complete", "Transforme le budget de marche en cible de distance."],
  age: ["partial", "N’interdit rien ; son effet de confirmation reste limité."],
  level: ["partial", "Influence la prudence de génération, sans calibration terrain."],
  company: ["partial", "Conservé dans la demande ; isolement et traversées restent incomplets."],
  fitness: ["partial", "Influence la cible, sans calibration terrain."],
  fatigue: ["partial", "Réduit la cible et favorise les replis ; contrôle des replis incomplet."],
  pain: ["partial", "Déclenche une prudence générale ; conséquences structurées à compléter."],
  balance: ["partial", "Favorise régularité et prudence ; largeur/dévers encore incomplets."],
  painDetail: ["partial", "Texte conservé mais aucune extraction automatique non confirmée."],
  footwear: ["complete", "Matrice de surfaces et audit des incompatibilités documentées."],
  equipment: ["partial", "Options ORS et audits présents pour certains équipements seulement."],
  limits: ["partial", "Plusieurs limitations sont traduites ; seuils fonctionnels à structurer."],
  noStairs: ["complete", "Évitement ORS et contrôle des données de marches."],
  noExposure: ["partial", "Contrôle prévu mais preuve d’exposition encore souvent absente."],
  effort: ["complete", "Classement par profil et métriques d’effort."],
  ascentMinutes: ["complete", "Durée maximale de montée continue calculée par le noyau altimétrique D-025."],
  descentMinutes: ["complete", "Durée maximale de descente continue calculée par le noyau altimétrique D-025."],
  upSlope: ["complete", "Pente montante auditée lorsqu’elle est disponible."],
  downSlope: ["complete", "Pente descendante auditée lorsqu’elle est disponible."],
  recovery: ["complete", "Séquence facile mesurée après effort ; banc jamais présumé."],
  terrain: ["partial", "D-026 qualifie la couverture des surfaces et la force de preuve ; largeur et exposition restent invérifiables sans source dédiée."],
  weather: ["complete", "Constat manuel conservé et prévision horaire Open-Meteo analysée sur la durée de sortie."],
  wishes: ["partial", "Classement partiel ; plusieurs envies nécessitent des POI avant sélection."],
  pauses: ["partial", "Temps inclus dans le budget ; positionnement réel à compléter."],
  services: ["complete", "Les services impératifs sont recherchés et audités avant la sélection ; une recherche impossible reste À vérifier."],
  freeText: ["partial", "Texte explicatif uniquement tant qu’il n’est pas confirmé en paramètres."],
  strict: ["complete", "Empêche les assouplissements silencieux."],
  shortcuts: ["partial", "Demande compilée ; calcul de raccourcis réels à compléter."],
  bothWays: ["complete", "Les deux sens sont audités."],
  private: ["partial", "Intention de non-persistance présente ; audit complet du stockage à faire."],
  limitationSide: ["complete", "Côté déclaré, conservé dans la demande et expliqué."],
  limitationTrigger: ["complete", "Déclencheur traduit en conséquence fonctionnelle confirmée."],
  limitationConsequence: ["complete", "Éviter, limiter, ralentir, pause ou repli modifient la demande."],
  limitationTemporality: ["complete", "Contexte temporel conservé dans la règle dérivée."],
  maxWithoutPause: ["complete", "Seuil utilisateur transformé en plan de pause et règle explicite."],
  maxStanding: ["complete", "Seuil utilisateur transformé en règle de préparation contrôlable."],
  helperAvailable: ["complete", "Information de préparation conservée sans bonus de capacité."],
  gpxFile: ["complete", "Import multi-traces/segments ; distance et altitude recalculées ; audit universel ORS/GPX ; données terrain absentes préservées comme invérifiables."],
});

function severityFor(id, entry) {
  if (["returnRadius", "returnTime", "duration", "timeIncludes", "margin", "footwear", "noStairs", "noExposure", "services", "strict", "gpxFile"].includes(id)) return "imperative";
  if (["fatigue", "pain", "balance", "equipment", "limits", "ascentMinutes", "upSlope", "downSlope", "recovery", "shortcuts", "bothWays"].includes(id)) return "conditional";
  if (["effort", "terrain", "wishes", "level", "fitness"].includes(id)) return "preference";
  if (["age", "company", "painDetail", "weather", "pauses", "freeText", "private"].includes(id)) return "preparation";
  return entry.effect.includes("audit") ? "conditional" : "information";
}

export function buildFieldAudit() {
  const template = read("je-marche-comme-je-suis.template.html");
  const { ConstraintRegistry, ChoiceRegistry } = loadRegistries();
  const fields = visibleFields(template);
  const groups = chipGroups(template);
  const orphanFields = fields.filter((id) => !ConstraintRegistry[id]);
  const missingFields = Object.keys(ConstraintRegistry).filter((id) => !fields.includes(id) && !groups.has(id));
  const orphanChoices = [];
  for (const [group, values] of groups) {
    const registered = ChoiceRegistry[group] || {};
    for (const value of values) if (!registered[value]) orphanChoices.push({ group, value });
  }
  const missingChoices = [];
  for (const [group, registry] of Object.entries(ChoiceRegistry)) {
    const visible = new Set(groups.get(group) || []);
    for (const value of Object.keys(registry)) if (!visible.has(value)) missingChoices.push({ group, value });
  }

  const rows = fields.map((id) => {
    const entry = ConstraintRegistry[id];
    const [status, note] = IMPLEMENTATION_STATUS[id] || ["unreviewed", "État fonctionnel non qualifié."];
    return {
      id,
      kind: "field",
      effect: entry?.effect || null,
      severity: entry ? severityFor(id, entry) : null,
      requiredData: entry?.requiredData || [],
      unknownPolicy: entry?.unknownPolicy || null,
      status,
      note,
    };
  });
  for (const [group, values] of groups) {
    const entry = ConstraintRegistry[group];
    const [status, note] = IMPLEMENTATION_STATUS[group] || ["unreviewed", "État fonctionnel non qualifié."];
    rows.push({
      id: group,
      kind: "choice-group",
      choices: values,
      effect: entry?.effect || null,
      severity: entry ? severityFor(group, entry) : null,
      requiredData: entry?.requiredData || [],
      unknownPolicy: entry?.unknownPolicy || null,
      status,
      note,
    });
  }

  return {
    version: "D-021",
    generatedAt: new Date().toISOString(),
    counts: {
      visibleFields: fields.length,
      choiceGroups: groups.size,
      visibleChoices: [...groups.values()].reduce((sum, values) => sum + values.length, 0),
      complete: rows.filter((row) => row.status === "complete").length,
      partial: rows.filter((row) => row.status === "partial").length,
    },
    structuralCoverage: {
      orphanFields,
      missingFields,
      orphanChoices,
      missingChoices,
      passed: !orphanFields.length && !orphanChoices.length,
    },
    rows,
  };
}

export function auditMarkdown(audit) {
  const lines = [
    "# D-021 — Audit exhaustif des champs",
    "",
    "> Cet audit distingue la couverture structurelle de la complétude fonctionnelle. Un champ enregistré n’est pas automatiquement considéré comme entièrement réalisé.",
    "",
    "## Résumé",
    "",
    `- Champs visibles : **${audit.counts.visibleFields}**`,
    `- Groupes de choix : **${audit.counts.choiceGroups}**`,
    `- Choix visibles : **${audit.counts.visibleChoices}**`,
    `- Entrées complètes : **${audit.counts.complete}**`,
    `- Entrées partielles : **${audit.counts.partial}**`,
    `- Champs orphelins : **${audit.structuralCoverage.orphanFields.length}**`,
    `- Choix orphelins : **${audit.structuralCoverage.orphanChoices.length}**`,
    "",
    "## Matrice",
    "",
    "| Champ / groupe | Type | Effet | Sévérité | Données requises | Inconnu | État | Observation |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const row of audit.rows) {
    lines.push(`| ${row.id} | ${row.kind} | ${row.effect || "—"} | ${row.severity || "—"} | ${(row.requiredData || []).join(", ") || "—"} | ${row.unknownPolicy || "—"} | ${row.status} | ${row.note} |`);
  }
  lines.push("", "## Conclusion", "");
  if (audit.structuralCoverage.passed) lines.push("La couverture structurelle passe : aucun contrôle visible ni choix visible n’est orphelin.");
  else lines.push("La couverture structurelle échoue. Corriger les entrées orphelines avant publication.");
  lines.push("", "Les entrées marquées **partial** restent visibles parce qu’elles ont déjà un effet réel, mais elles ne doivent pas être présentées comme complètement conformes au cahier des charges. Elles alimentent la feuille de route P0.2.", "");
  return lines.join("\n");
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const audit = buildFieldAudit();
  writeFileSync(new URL("AUDIT_CHAMPS_D021.json", root), `${JSON.stringify(audit, null, 2)}\n`);
  writeFileSync(new URL("AUDIT_CHAMPS_D021.md", root), auditMarkdown(audit));
  if (!audit.structuralCoverage.passed) {
    console.error(JSON.stringify(audit.structuralCoverage, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`D-021: ${audit.counts.visibleFields} champs, ${audit.counts.visibleChoices} choix, aucune entrée orpheline.`);
  }
}
