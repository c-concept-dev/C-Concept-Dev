"use strict";
/**
 * MONO-11 v0.1 — test/fixtures/domains.js
 *
 * TROIS MISSIONS SYNTHETIQUES, trois domaines distincts, AUCUN nom reel, AUCUN
 * identifiant reel, AUCUNE donnee du cas d'application courant. Les libelles de
 * dimension sont des chaines abstraites propres a chaque mission : le gate ne
 * les lit jamais comme des regles, il ne lit que des PREUVES.
 *
 * Ces fixtures ne sont PAS des preuves REAL : elles servent aux tests
 * discriminants (Charte §23). Un test qui les confondrait avec un run reel
 * serait un test tautologique.
 */
const path = require("path");

/** Un candidat synthetique : identite, oeuvres, plan de reponse de l'oracle simule. */
function person(ref, opts) {
  opts = opts || {};
  const works = (opts.works || []).map(function (w, i) {
    return { id: "https://example.test/works/" + ref + "-" + (i + 1), display_name: w.title, doi: w.doi || null,
      publication_year: w.year, topics: (w.topics || []).map((t) => ({ display_name: t, name: t })),
      authorships: [{ author: { id: "https://example.test/authors/" + ref, orcid: opts.orcid || null } }].concat(opts.coauthorOrcid ? [{ author: { id: "https://example.test/authors/" + ref + "-co", orcid: opts.coauthorOrcid } }] : []) };
  });
  return { ref: ref, authorId: "https://example.test/authors/" + ref, displayName: "Personne " + ref, orcid: opts.orcid || null,
    affiliation: opts.affiliation || null, works: works, plan: opts.plan || {}, seedWork: opts.seedWork || null, secondary: opts.secondary === true,
    identityAmbiguity: opts.identityAmbiguity || null, attributed: opts.attributed !== false, citations: opts.citations || 0 };
}

/* Chaque mission : question abstraite, dimensions, candidats avec PLAN d'oracle (par dimension). */
const MISSIONS = {
  domainA: {
    missionId: "mission-synth-A", missionQuestion: "Question de mission synthetique A : quelle structure porteuse doit-on retenir pour l'objet examine ?",
    dimensions: [
      { id: "dimA1", label: "dimension A-un", definition: "premier angle de la mission A", weight: 1 },
      { id: "dimA2", label: "dimension A-deux", definition: "second angle de la mission A", weight: 1 },
      { id: "dimA3", label: "dimension A-trois", definition: "troisieme angle de la mission A", weight: 1 },
    ],
    candidates: [
      person("A-ok", { orcid: "https://orcid.example/0000-0001-0000-0001", affiliation: "Institution A1", seedWork: 1,
        works: [{ title: "Oeuvre A-ok-1 sur la structure", doi: "10.5555/a.ok.1", year: 2019, topics: ["theme-A1", "theme-A2"] }, { title: "Oeuvre A-ok-2", doi: "10.5555/a.ok.2", year: 2021, topics: ["theme-A1"] }, { title: "Oeuvre A-ok-3", doi: null, year: 2022, topics: ["theme-A3"] }],
        plan: { dimA1: ["mission_relevant", "documented", [0, 1]], dimA2: ["partially_relevant", "cautious_inference", [1]], dimA3: ["not_determinable", "not_determinable", []] } }),
      person("A-amb", { orcid: "https://orcid.example/0000-0001-0000-0002", identityAmbiguity: "HOMONYM_UNRESOLVED_WITHOUT_PROVIDER_ID",
        works: [{ title: "Oeuvre A-amb-1", doi: "10.5555/a.amb.1", year: 2018, topics: ["theme-A1"] }, { title: "Oeuvre A-amb-2", doi: "10.5555/a.amb.2", year: 2020, topics: ["theme-A2"] }, { title: "Oeuvre A-amb-3", doi: "10.5555/a.amb.3", year: 2021, topics: ["theme-A1"] }],
        plan: { dimA1: ["mission_relevant", "documented", [0]], dimA2: ["mission_relevant", "documented", [1]], dimA3: ["mission_irrelevant", "documented", []] } }),
      person("A-thin", { orcid: "https://orcid.example/0000-0001-0000-0003",
        works: [{ title: "Oeuvre A-thin-1", doi: "10.5555/a.thin.1", year: 2020, topics: ["theme-A1"] }],
        plan: { dimA1: ["mission_relevant", "documented", [0]], dimA2: ["not_determinable", "not_determinable", []], dimA3: ["not_determinable", "not_determinable", []] } }),
      person("A-off", { orcid: "https://orcid.example/0000-0001-0000-0004", citations: 9000,
        works: [{ title: "Oeuvre A-off-1 hors mission", doi: "10.5555/a.off.1", year: 2015, topics: ["theme-Z1", "theme-Z2"] }, { title: "Oeuvre A-off-2 hors mission", doi: "10.5555/a.off.2", year: 2017, topics: ["theme-Z1"] }, { title: "Oeuvre A-off-3 hors mission", doi: "10.5555/a.off.3", year: 2019, topics: ["theme-Z3"] }],
        plan: { dimA1: ["mission_irrelevant", "documented", []], dimA2: ["mission_irrelevant", "documented", []], dimA3: ["mission_irrelevant", "documented", []] } }),
      person("A-und", { orcid: null,
        works: [{ title: "Oeuvre A-und-1", doi: "10.5555/a.und.1", year: 2016, topics: ["theme-A2"] }, { title: "Oeuvre A-und-2", doi: null, year: 2018, topics: ["theme-A2", "theme-A3"] }, { title: "Oeuvre A-und-3", doi: null, year: 2020, topics: ["theme-A1"] }],
        plan: { dimA1: ["not_determinable", "not_determinable", []], dimA2: ["not_determinable", "not_determinable", []], dimA3: ["not_determinable", "not_determinable", []] } }),
      person("A-seedonly", { orcid: "https://orcid.example/0000-0001-0000-0005", seedWork: 1,
        works: [{ title: "Oeuvre A-seedonly-1 (source retenue)", doi: "10.5555/a.seed.1", year: 2019, topics: ["theme-A1"] }, { title: "Oeuvre A-seedonly-2", doi: "10.5555/a.seed.2", year: 2020, topics: ["theme-A2"] }, { title: "Oeuvre A-seedonly-3", doi: "10.5555/a.seed.3", year: 2021, topics: ["theme-A3"] }],
        plan: { dimA1: ["mission_relevant", "documented", [0]], dimA2: ["not_determinable", "not_determinable", []], dimA3: ["not_determinable", "not_determinable", []] } }),
      person("A-second", { orcid: null, secondary: true, affiliation: "Institution A2",
        works: [{ title: "Oeuvre A-second-1", doi: "10.5555/a.sec.1", year: 2017, topics: ["theme-A1", "theme-A2"] }, { title: "Oeuvre A-second-2", doi: "10.5555/a.sec.2", year: 2019, topics: ["theme-A2"] }, { title: "Oeuvre A-second-3", doi: "10.5555/a.sec.3", year: 2022, topics: ["theme-A3"] }],
        plan: { dimA1: ["not_determinable", "not_determinable", []], dimA2: ["mission_relevant", "documented", [0, 1]], dimA3: ["partially_relevant", "cautious_inference", []] } }),
      person("A-orcidonly", { orcid: "https://orcid.example/0000-0001-0000-0006", attributed: false,
        works: [{ title: "Oeuvre A-orcidonly-1", doi: "10.5555/a.oo.1", year: 2019, topics: ["theme-A1"] }, { title: "Oeuvre A-orcidonly-2", doi: "10.5555/a.oo.2", year: 2020, topics: ["theme-A2"] }, { title: "Oeuvre A-orcidonly-3", doi: "10.5555/a.oo.3", year: 2021, topics: ["theme-A3"] }],
        plan: { dimA1: ["mission_relevant", "documented", [0]], dimA2: ["mission_relevant", "documented", [1]], dimA3: ["mission_relevant", "documented", [2]] } }),
    ],
  },
  domainB: {
    missionId: "mission-synth-B", missionQuestion: "Question de mission synthetique B : quel regime s'applique a la situation examinee et avec quelles reserves ?",
    dimensions: [
      { id: "dimB1", label: "dimension B-un", definition: "premier angle de la mission B", weight: 2 },
      { id: "dimB2", label: "dimension B-deux", definition: "second angle de la mission B", weight: 1 },
    ],
    candidates: [
      person("B-ok", { orcid: "https://orcid.example/0000-0002-0000-0001", affiliation: "Institution B1",
        works: [{ title: "Oeuvre B-ok-1", doi: "10.5555/b.ok.1", year: 2012, topics: ["theme-B1"] }, { title: "Oeuvre B-ok-2", doi: "10.5555/b.ok.2", year: 2016, topics: ["theme-B2"] }, { title: "Oeuvre B-ok-3", doi: "10.5555/b.ok.3", year: 2020, topics: ["theme-B1", "theme-B2"] }, { title: "Oeuvre B-ok-4", doi: null, year: 2023, topics: ["theme-B2"] }],
        plan: { dimB1: ["mission_relevant", "documented", [2, 3]], dimB2: ["mission_relevant", "documented", [1]] } }),
      person("B-partial", { orcid: null, affiliation: "Institution B1",
        works: [{ title: "Oeuvre B-partial-1", doi: "10.5555/b.p.1", year: 2014, topics: ["theme-B1"] }, { title: "Oeuvre B-partial-2", doi: "10.5555/b.p.2", year: 2018, topics: ["theme-B3"] }, { title: "Oeuvre B-partial-3", doi: "10.5555/b.p.3", year: 2021, topics: ["theme-B1"] }],
        plan: { dimB1: ["partially_relevant", "cautious_inference", [0]], dimB2: ["not_determinable", "not_determinable", []] } }),
    ],
  },
  domainC: {
    missionId: "mission-synth-C", missionQuestion: "Question de mission synthetique C : quels indicateurs de suivi sont defendables pour le site examine ?",
    dimensions: [
      { id: "dimC1", label: "dimension C-un", definition: "premier angle de la mission C", weight: 1 },
      { id: "dimC2", label: "dimension C-deux", definition: "second angle de la mission C", weight: 1 },
      { id: "dimC3", label: "dimension C-trois", definition: "troisieme angle de la mission C", weight: 1 },
      { id: "dimC4", label: "dimension C-quatre", definition: "quatrieme angle de la mission C", weight: 1 },
    ],
    candidates: [
      person("C-ok", { orcid: "https://orcid.example/0000-0003-0000-0001", affiliation: "Institution C1",
        works: [{ title: "Oeuvre C-ok-1", doi: "10.5555/c.ok.1", year: 2010, topics: ["theme-C1"] }, { title: "Oeuvre C-ok-2", doi: "10.5555/c.ok.2", year: 2015, topics: ["theme-C2"] }, { title: "Oeuvre C-ok-3", doi: "10.5555/c.ok.3", year: 2021, topics: ["theme-C4"] }],
        plan: { dimC1: ["mission_relevant", "documented", [0]], dimC2: ["mission_relevant", "documented", [1]], dimC3: ["not_determinable", "not_determinable", []], dimC4: ["mission_relevant", "documented", [2]] } }),
      person("C-contra", { orcid: "https://orcid.example/0000-0003-0000-0002", coauthorOrcid: "https://orcid.example/0000-0003-0000-0009",
        works: [{ title: "Oeuvre C-contra-1", doi: "10.5555/c.ct.1", year: 2011, topics: ["theme-C1"] }, { title: "Oeuvre C-contra-2", doi: "10.5555/c.ct.2", year: 2014, topics: ["theme-C3"] }, { title: "Oeuvre C-contra-3", doi: "10.5555/c.ct.3", year: 2019, topics: ["theme-C1"] }],
        plan: { dimC1: ["mission_relevant", "documented", [0]], dimC2: ["not_determinable", "not_determinable", []], dimC3: ["mission_relevant", "documented", [1]], dimC4: ["not_determinable", "not_determinable", []] } }),
    ],
  },
};

/**
 * Oracle SIMULE pour les tests : lit le PLAN de la personne et repond dans la forme
 * EF-02D2 en citant des titres EXACTS du corpus. Ce n'est pas une preuve REAL.
 * `tamper` permet aux tests adversariaux de faire mentir l'oracle (titre invente,
 * dimension manquante, JSON casse).
 */
function makeFakeLlm(mission, opts) {
  opts = opts || {};
  const calls = [];
  return Object.assign(async function (prompt) {
    calls.push(prompt);
    const m = /"professionalRef":"([^"]+)"/.exec(prompt);
    const ref = m ? m[1] : null;
    const cand = mission.candidates.find((c) => c.authorId === ref);
    if (!cand) return "{}";
    const titles = cand.works.map((w) => w.display_name);
    const judgments = mission.dimensions.map(function (d) {
      const pl = cand.plan[d.id] || ["not_determinable", "not_determinable", []];
      let refs = pl[2].map((i) => titles[i]).filter(Boolean);
      if (opts.tamper === "invent_ref" && refs.length) refs = ["Titre invente qui n'existe pas"];
      return { dimensionId: d.id, relevanceStatus: pl[0], epistemicStatus: pl[1], rationale: "plan de test", supportingWorkRefs: refs, limitations: [] };
    });
    if (opts.tamper === "drop_dimension") judgments.pop();
    if (opts.tamper === "broken_json") return "{ pas du json";
    return { text: JSON.stringify({ professionalRef: ref, judgments: judgments }), providerId: "fixture-provider", modelId: "fixture-model", providerRequestId: "fixture-" + calls.length, transportKind: "FIXTURE_NOT_REAL", httpStatus: 200 };
  }, { calls: calls });
}

module.exports = { MISSIONS, person, makeFakeLlm };
