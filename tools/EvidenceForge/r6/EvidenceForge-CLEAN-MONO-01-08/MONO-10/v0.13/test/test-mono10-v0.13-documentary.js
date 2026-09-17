#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.13 — test/test-mono10-v0.13-documentary.js
 *
 * CONTROLES DE VERITE DOCUMENTAIRE. Aucun run, aucun reseau, aucun LLM,
 * aucune ecriture dans le paquet.
 *
 * POURQUOI CE FICHIER A ETE REECRIT (§5 du mandat v0.13).
 *
 * Les detecteurs de v0.12 etaient insuffisants, et de trois facons precises :
 *
 *   1. ils ne balayaient que les `.md` de la RACINE. `governance/README.md`
 *      echappait donc au scan — et c'est exactement la qu'une affirmation
 *      fausse a survecu ;
 *   2. leur temoin negatif etait un SNIPPET isole, ecrit a la main. Il prouvait
 *      que la regex reconnait la phrase qu'on lui montre, pas que le scanner
 *      mord sur le PAQUET REEL. C'est une assertion vacue deguisee ;
 *   3. le controle de `callerTransportIgnored` utilisait une fenetre GLOBALE :
 *      une correction situee cent lignes plus bas neutralisait artificiellement
 *      le detecteur, alors que la phrase trompeuse restait trompeuse pour qui
 *      lisait la section seule.
 *
 * v0.13 corrige les trois :
 *
 *   - balayage RECURSIF de tous les `.md` du lot, `governance/` inclus ;
 *   - temoin negatif par MUTATION CONTROLEE des documents livres, recopies dans
 *     un repertoire temporaire : le detecteur doit mordre sur le paquet mute,
 *     pas sur une phrase fabriquee ;
 *   - portee SECTIONNELLE : un detecteur de phrase trompeuse n'examine que la
 *     section ou la phrase se trouve.
 *
 * Usage : node test/test-mono10-v0.13-documentary.js [racineDuPaquet]
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const LOT = path.resolve(__dirname, "..");
const BUNDLE = process.argv[2] || path.resolve(LOT, "..", "..");

let pass = 0, fail = 0, caught = 0, total = 0;
const check = (id, ok, detail) => {
  if (ok) { pass++; console.log("  PASS  " + id); }
  else { fail++; console.log("  FAIL  " + id + (detail !== undefined ? "  -> " + String(detail).slice(0, 260) : "")); }
};

/** §5.1 — balayage RECURSIF. `governance/` n'est plus un angle mort. */
function collectDocs(root) {
  const out = {};
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git") return; return walk(p); }
      if (/\.md$/.test(e.name)) out[path.relative(root, p)] = fs.readFileSync(p, "utf8");
    });
  })(root);
  return out;
}

/** Sections d'un document markdown, pour une portee LOCALE et non globale. */
function sectionsOf(text) {
  const lines = text.split("\n");
  const secs = [];
  let cur = { title: "(preambule)", body: [] };
  lines.forEach(function (l) {
    if (/^#{1,4}\s/.test(l)) { secs.push(cur); cur = { title: l.replace(/^#+\s*/, ""), body: [] }; }
    else cur.body.push(l);
  });
  secs.push(cur);
  return secs.map(function (s) { return { title: s.title, text: s.body.join("\n") }; });
}

/**
 * Un detecteur recoit la CARTE des documents ({chemin: texte}) et rend la liste
 * des faussetes trouvees. Vide = documentation propre.
 */
const DETECTORS = [];
function detector(id, label, find, mutate) {
  DETECTORS.push({ id: id, label: label, find: find, mutate: mutate });
}

/* ===================== DOC-01 — asymetrie de preparation ===================== */
detector("DOC-01", "l'asymetrie de preparation est qualifiee par couche",
  function (docs) {
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      sectionsOf(docs[f]).forEach(function (sec) {
        const re = /ne peut pas l'am[eé]liorer|jamais am[eé]liorer/g;
        let m;
        while ((m = re.exec(sec.text)) !== null) {
          const ctx = sec.text.slice(Math.max(0, m.index - 900), m.index + 900);
          if (!/par couche|assertReadinessPhase|de bout en bout|couche d'assertion|pas [aà] la couche/.test(ctx)) {
            hits.push(f + " :: " + sec.title);
          }
        }
      });
    });
    return hits;
  },
  /** Mutation : on retire la qualification de couche, en place, dans READINESS.md. */
  function (docs) {
    const f = "READINESS.md";
    docs[f] = docs[f].replace(/## Asym[eé]trie : [aà] quelle couche \?[\s\S]*$/,
      "## Asymetrie\n\nL'appelant peut degrader une preparation, il ne peut pas l'ameliorer.\n");
    return f;
  });

/* ===================== DOC-02 — champs non attestes enumeres ===================== */
const CHAMPS = ["costUsd", "configurationPresent", "llmBoundaryId", "callerVerifierIgnored",
  "schemaVersion", "probeTimestamp", "capabilities", "authMode", "probeContract",
  "failureReason", "credentialPresenceProblem", "callerTransportIgnored"];
detector("DOC-02", "les douze champs non attestes sont enumeres",
  function (docs) {
    const tout = Object.keys(docs).map(function (f) { return docs[f]; }).join("\n");
    if (!/Champs non attest[eé]s/.test(tout)) return ["aucune section « Champs non attestes »"];
    return CHAMPS.filter(function (c) { return tout.indexOf(c) === -1; })
      .map(function (c) { return "champ absent de la documentation : " + c; });
  },
  /** La mutation doit porter sur TOUT le paquet : un champ cite ailleurs
   *  suffirait sinon a masquer son retrait, et le detecteur ne mordrait pas. */
  function (docs) {
    Object.keys(docs).forEach(function (f) {
      docs[f] = docs[f].replace(/costUsd/g, "(retire)").replace(/probeTimestamp/g, "(retire)");
    });
    return "tous les documents";
  });

/* ===================== DOC-03 — sur-promesse d'attestation ===================== */
/**
 * §5.2 — la regex doit attraper des formulations REALISTES, pas une seule
 * tournure litterale. Quatre quantificateurs, trois verbes, dans les deux
 * ordres, avec la negation exclue.
 */
detector("DOC-03", "aucun document ne sur-promet l'attestation des champs",
  function (docs) {
    const QUANT = "(tous les|tous des|toutes les|chaque|l'ensemble des|l['’]int[eé]gralit[eé] des)";
    const SUJET = "(champs?|propri[eé]t[eé]s?|valeurs?)";
    const VERBE = "(sont|est|seraient|serait)\\s+attest";
    const res = [
      new RegExp(QUANT + "\\s+" + SUJET + "[^.\\n]{0,90}" + VERBE, "i"),
      new RegExp("atteste\\s+" + QUANT + "\\s+" + SUJET, "i"),
      new RegExp("(certification|d[eé]cision)[^.\\n]{0,60}(garantit|prouve)[^.\\n]{0,40}" + QUANT + "\\s+" + SUJET, "i"),
      new RegExp("(garantit|prouve)\\s+la\\s+v[eé]racit[eé]\\s+de\\s+" + QUANT, "i"),
    ];
    const NEG = /(ne|n'|pas|jamais|non)\s+(sont|est|atteste)/i;
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      docs[f].split(/\n/).forEach(function (ligne, i) {
        res.forEach(function (re) {
          const m = ligne.match(re);
          if (m && !NEG.test(m[0])) hits.push(f + ":" + (i + 1) + " :: " + m[0].slice(0, 70));
        });
      });
    });
    return hits;
  },
  function (docs) {
    const f = "ARTIFACT-REGISTRY-TRUST.md";
    docs[f] = docs[f] + "\n\nUne concession atteste l'ensemble des champs de l'artefact.\n";
    return f;
  });

/* ===================== DOC-04 — callerTransportIgnored, portee SECTIONNELLE ===================== */
/**
 * §5.3 — le controle analyse la SECTION ou la phrase trompeuse se trouve. Une
 * correction placee cent lignes plus bas ne la neutralise plus : un lecteur de
 * la section seule doit y trouver la qualification.
 */
detector("DOC-04", "toute section affirmant l'inscription du transport la qualifie SUR PLACE",
  function (docs) {
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      sectionsOf(docs[f]).forEach(function (sec) {
        const affirme = /le fait qu'il ait essay[eé] est inscrit|est inscrit\s+dans l'artefact/i.test(sec.text);
        if (!affirme) return;
        const qualifie = /pas une garantie|pas,? [aà] elle seule|tra[cç]abilit[eé] d[eé]clarative|tra[cç]abilit[eé], pas|n'est pas une autorit[eé] critique|auto-d[eé]faisant/i.test(sec.text);
        if (!qualifie) hits.push(f + " :: section « " + sec.title.slice(0, 50) + " » affirme sans qualifier");
      });
    });
    return hits;
  },
  /** Mutation : on retire la qualification LOCALE, en laissant celle du bas du document. */
  function (docs) {
    const f = "LLM-CAPABILITY-BOUNDARY.md";
    docs[f] = docs[f].replace(/> \*\*Attention — ceci n'est pas une garantie de s[eé]curit[eé]\.\*\*[\s\S]*?`OPEN-FINDINGS\.md` \(R3\)\.\n/,
      "");
    docs[f] = docs[f].replace(/\nLe lecteur de cette section seule ne doit donc pas comprendre cette inscription\ncomme une protection\.\n/, "\n");
    docs[f] = docs[f].replace(/\*\*inscrit\n[aà] titre d[eé]claratif\*\*/, "inscrit");
    return f;
  });

/* ===================== DOC-05 — mesures de sceaux ===================== */
detector("DOC-05", "aucune mesure de sceau fausse n'est AFFIRMEE",
  function (docs) {
    const FAUX = [
      { re: /UNVERIFIABLE_HISTORICAL_LOTS[^\n]*?\b9\b/, vrai: /\b0\b/ },
      { re: /SEALED_(REFERENCE_)?DIVERGENCES[^\n]*?\b0\b/, vrai: /\b9\b/ },
      { re: /\b14 lots scell[eé]s\b/i, vrai: /\b24\b|\b25\b/ },
      { re: /\b514 r[eé]f[eé]rences?\b/i, vrai: /\b1\s?577\b|\b1577\b|\b1\s?644\b|\b1644\b/ },
    ];
    const CORRECTION = /annon[cç]ait|d[eé]clarait|faux|fausse|sous-d[eé]clar|corrig|r[eé]alit[eé] mesur[eé]e|au lieu de|valeur courante|\[v0\.11 — corrig[eé] depuis\]/i;
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      docs[f].split("\n").forEach(function (ligne, i) {
        FAUX.forEach(function (x) {
          if (x.re.test(ligne) && !x.vrai.test(ligne) && !CORRECTION.test(ligne)) {
            hits.push(f + ":" + (i + 1) + " :: " + ligne.trim().slice(0, 80));
          }
        });
      });
    });
    return hits;
  },
  /** Mutation : on reintroduit exactement la faussete de v0.12, a sa place d'origine. */
  function (docs) {
    const f = "governance/README.md";
    docs[f] = docs[f].replace(/\| `NON-REGRESSION\.md` §2 — [^|]*\|/,
      "| `NON-REGRESSION.md` — `UNVERIFIABLE_HISTORICAL_LOTS = 9` maintenu, non dissimule |");
    return f;
  });

/* ===================== DOC-06 — divergences attribuees ===================== */
detector("DOC-06", "les 9 divergences sont documentees, localisees et attribuees",
  function (docs) {
    const tout = Object.keys(docs).map(function (f) { return docs[f]; }).join("\n");
    const manque = [];
    if (!/9 divergences|\*\*9\*\* divergences|SEALED_DIVERGENCES[^\n]*\b9\b/.test(tout)) manque.push("le nombre 9");
    if (!/MONO-07/.test(tout) || !/MONO-08\/v0\.6/.test(tout)) manque.push("les deux lots");
    if (!/ant[eé]rieures?|pr[eé][eé]xistantes?/i.test(tout)) manque.push("leur anteriorite");
    if (!/imputables?\s+(ni\s+)?[aà]\s+v0\.1[123]|non imputables/i.test(tout)) manque.push("leur non-imputabilite");
    return manque.map(function (m) { return "absent de la documentation : " + m; });
  },
  function (docs) {
    Object.keys(docs).forEach(function (f) {
      docs[f] = docs[f].replace(/MONO-08\/v0\.6/g, "(lot anonymise)");
    });
    return "tous les documents";
  });

/* ===================== DOC-07 — methode de mesure ===================== */
detector("DOC-07", "la methode de mesure est recursive et cherche les deux noms de sceau",
  function (docs) {
    const nr = docs["NON-REGRESSION.md"] || "";
    const manque = [];
    if (!/r[eé]cursi/i.test(nr)) manque.push("le caractere recursif");
    if (!/manifest\//.test(nr)) manque.push("le sous-repertoire manifest/");
    if (!/sans extension/i.test(nr)) manque.push("le nom sans extension");
    if (!/seal-inventory\.js/.test(nr)) manque.push("l'outil livre");
    return manque.map(function (m) { return "NON-REGRESSION.md n'enonce pas : " + m; });
  },
  function (docs) {
    const f = "NON-REGRESSION.md";
    docs[f] = docs[f].replace(/r[eé]cursi[a-z]*/gi, "direct").replace(/sans extension/gi, "");
    return f;
  });

/* ===================== DOC-08 — code de refus sur-promis (§5.4) ===================== */
detector("DOC-08", "aucun document ne presente LLM_SUBJECT_OUT_OF_ALLOWLIST comme code observe",
  function (docs) {
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      sectionsOf(docs[f]).forEach(function (sec) {
        if (sec.text.indexOf("LLM_SUBJECT_OUT_OF_ALLOWLIST") === -1) return;
        const qualifie = /inatteignable|non atteignable|d[eé]fense en profondeur morte|pas garantie de code|comportementale|ne pas la pr[eé]senter/i.test(sec.text);
        if (!qualifie) hits.push(f + " :: section « " + sec.title.slice(0, 50) + " » cite le code sans dire qu'il est inatteignable");
      });
    });
    return hits;
  },
  function (docs) {
    const f = "governance/README.md";
    docs[f] = docs[f].replace(/garantie \*\*comportementale\*\*[^|]*\|/,
      "`LLM_SUBJECT_MISMATCH`, `LLM_SUBJECT_OUT_OF_ALLOWLIST`, `LLM_PROBE_ALREADY_CONSUMED` |");
    return f;
  });

/* ===================== DOC-09 — nombre de reserves coherent (§4.1, §4.2) ===================== */
detector("DOC-09", "le nombre de reserves est coherent partout, et egal au nombre reel",
  function (docs) {
    const of = docs["OPEN-FINDINGS.md"] || "";
    const reel = (of.match(/^## R[1-5]\s/gm) || []).length;
    const hits = [];
    if (reel !== 5) hits.push("OPEN-FINDINGS.md porte " + reel + " sections R, pas 5");
    /**
     * « reserve » a DEUX sens dans ce lot : un constat ouvert, et une reserve
     * anti-rejeu de nonces. Les confondre produit de faux positifs — le premier
     * jet de ce detecteur accusait REPLAY-PROTECTION.md de mal compter les
     * constats alors qu'il parlait de reserves de nonces. On n'examine donc que
     * les tournures qui designent sans ambiguite les CONSTATS OUVERTS.
     */
    const MOTS = { "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6 };
    const CONSTAT = /(r[eé]serves\s+(ouvertes|ci-dessous)|r[eé]serves\s+R1|r[eé]serves\s+de\s+`OPEN-FINDINGS)/i;
    const CITATION = /annon[cç]ait|au lieu de|« quatre|corrig/i;
    Object.keys(docs).forEach(function (f) {
      docs[f].split("\n").forEach(function (ligne, i) {
        /** « **cinq** réserves » : l'emphase markdown s'interpose. Le premier
         *  jet l'ignorait, et ne matchait donc NI le texte livre NI la mutation. */
        const m = ligne.match(/(une|deux|trois|quatre|cinq|six)(?:\*\*|\*|_)?\s+r[eé]serves/i);
        if (!m) return;
        if (!CONSTAT.test(ligne) && !/R1|OPEN-FINDINGS/.test(ligne)) return;  // autre sens du mot
        if (CITATION.test(ligne)) return;                                     // erreur citee, corrigee
        const n = MOTS[m[1].toLowerCase()];
        if (n !== reel) hits.push(f + ":" + (i + 1) + " annonce « " + m[1] + " reserves » au lieu de " + reel);
      });
    });
    return hits;
  },
  function (docs) {
    const f = "OPEN-FINDINGS.md";
    docs[f] = docs[f].replace(/Les \*\*cinq\*\* réserves ci-dessous/, "Les **quatre** réserves ci-dessous");
    return f;
  });

/* ===================== DOC-10 — etiquettes de reserve non ambigues (§4.4) ===================== */
detector("DOC-10", "les etiquettes de reserve ne sont jamais ambigues",
  function (docs) {
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      docs[f].split("\n").forEach(function (ligne, i) {
        /**
         * Une etiquette est NUE si rien, sur sa ligne, ne dit a quelle serie
         * elle appartient. `OPEN-FINDINGS.md (R3)` et `(V011-R2, residu ferme)`
         * sont explicites ; `(R1)` seul ne l'est pas.
         */
        const m = ligne.match(/\((R[1-5])(,[^)]*)?\)/);
        if (!m) return;
        const explicite = /OPEN-FINDINGS\.md`?\s*\(R[1-5]\)|\(R[1-5],\s*(ouverte|OPEN-FINDINGS)|OPEN-FINDINGS\.md`?\s+R[1-5]/.test(ligne)
          || /V011-R[1-5]/.test(ligne);
        if (!explicite) hits.push(f + ":" + (i + 1) + " :: etiquette nue « (" + m[1] + ") » : ni V011-, ni renvoi a OPEN-FINDINGS.md");
      });
    });
    return hits;
  },
  function (docs) {
    const f = "LLM-CAPABILITY-BOUNDARY.md";
    docs[f] = docs[f].replace(/`OPEN-FINDINGS\.md` \(R3\)/, "(R3)");
    return f;
  });

/* ===================== execution ===================== */
(function () {
  console.log("MONO-10 v0.13 — controles de verite documentaire\n");
  const docs = collectDocs(LOT);
  console.log("  documents balayes (recursif, governance/ inclus) : " + Object.keys(docs).length);
  const gov = Object.keys(docs).filter(function (f) { return /^governance\//.test(f); });
  check("SCAN-01. le balayage atteint governance/", gov.length > 0, JSON.stringify(gov));

  /**
   * §5.5 / §6 — pour chaque detecteur : temoin positif sur le paquet livre, PUIS
   * mutation controlee des documents livres et preuve que le detecteur mord
   * PRECISEMENT sur cette mutation.
   */
  console.log("\n  -- dix detecteurs, chacun avec sa mutation causale --");
  DETECTORS.forEach(function (d) {
    total++;
    const propre = d.find(JSON.parse(JSON.stringify(docs)));
    const mute = JSON.parse(JSON.stringify(docs));
    const cible = d.mutate(mute);
    const change = (cible === "tous les documents")
      ? Object.keys(docs).some(function (f) { return mute[f] !== docs[f]; })
      : mute[cible] !== docs[cible];
    const apres = d.find(mute);
    const mord = apres.length > propre.length;
    if (propre.length === 0 && change && mord) {
      caught++; check(d.id + ". " + d.label, true);
    } else {
      check(d.id + ". " + d.label, false,
        (propre.length ? "FAUSSETE LIVREE: " + JSON.stringify(propre).slice(0, 150) + " " : "")
        + (change ? "" : "la mutation n'a RIEN change dans " + cible + " ")
        + (mord ? "" : "le detecteur NE MORD PAS sur la mutation de " + cible));
    }
  });

  /* ===== coherence du paquet (§13) ===== */
  console.log("\n  -- coherence du paquet --");
  const manifest = JSON.parse(fs.readFileSync(path.join(LOT, "MANIFEST.json"), "utf8"));
  const of = docs["OPEN-FINDINGS.md"] || "";
  check("COH-01. OPEN-FINDINGS.md porte R1 a R5 avec statut explicite",
    ["R1", "R2", "R3", "R4", "R5"].every(function (r) { return new RegExp("\\*\\*" + r + "\\*\\*").test(of); })
    && /NOT_FIXED_IN_V013/.test(of) && /NON_BLOCKING/.test(of) && /`OPEN`/.test(of));
  check("COH-02. aucune reserve n'est presentee comme resolue",
    (manifest.knownOpenFindings || []).length === 5
    && (manifest.knownOpenFindings || []).every(function (r) { return r.resolvedByV013 === false; }),
    JSON.stringify((manifest.knownOpenFindings || []).map(function (r) { return r.id + ":" + r.resolvedByV013; })));
  const README = docs["README.md"] || "";
  const nbREADME = (README.match(/^## Hypothèses déclarées[\s\S]*?(?=^## )/m) || [""])[0]
    .split("\n").filter(function (l) { return /^\d+\. /.test(l); }).length;
  check("COH-03. README et MANIFEST annoncent le MEME nombre d'hypotheses",
    nbREADME === (manifest.declaredAssumptions || []).length,
    "README=" + nbREADME + " MANIFEST=" + (manifest.declaredAssumptions || []).length);
  check("COH-04. MIGRATION v0.12 -> v0.13 existe et affirme l'absence de changement runtime",
    !!docs["MIGRATION-v0.12-v0.13.md"] && /Aucune API ne change/.test(docs["MIGRATION-v0.12-v0.13.md"] || ""));
  check("COH-05. le MANIFEST declare la nature documentaire et les deux identites runtime",
    /DOCUMENTAIRE/i.test(manifest.natureOfLot || "")
    && manifest.runtimeByteIdenticalTo && manifest.runtimeByteIdenticalTo.indexOf("MONO-10-v0.11") !== -1
    && manifest.runtimeByteIdenticalTo.indexOf("MONO-10-v0.12") !== -1,
    JSON.stringify(manifest.runtimeByteIdenticalTo));

  /* ===== identite du runtime (§10) ===== */
  console.log("\n  -- identite du runtime : le perimetre EXCLUT les documents corriges --");
  const RUNTIME_DIRS = ["core", "adapters", "validators", "schemas", "contracts"];
  const RUNTIME_FILES = ["test/fixture-chain.js", "test/test-mono10-v0.11.js",
    "test/test-mono10-v0.11-integration.js", "tools/aggregate-hash.js",
    "tools/operator-provisioning.js", "tools/reference-llm-transport.js",
    "governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md"];
  const digestOf = function (base, rel) {
    const p = path.join(base, rel);
    if (!fs.existsSync(p)) return "ABSENT";
    if (fs.statSync(p).isDirectory()) {
      const acc = [];
      (function w(d) {
        fs.readdirSync(d).sort().forEach(function (e) {
          const q = path.join(d, e);
          if (fs.statSync(q).isDirectory()) return w(q);
          acc.push(path.relative(p, q) + ":" + crypto.createHash("sha256").update(fs.readFileSync(q)).digest("hex"));
        });
      })(p);
      return crypto.createHash("sha256").update(acc.join("\n")).digest("hex");
    }
    return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  };
  [["v0.11", "RT-01"], ["v0.12", "RT-02"]].forEach(function (pair) {
    const prev = path.resolve(LOT, "..", pair[0]);
    if (!fs.existsSync(prev)) {
      console.log("  SKIP  " + pair[1] + ". identite runtime avec " + pair[0]
        + " -> lot non joignable depuis cette extraction ; aucun PASS n'est emis a la place");
      return;
    }
    const diffs = RUNTIME_DIRS.concat(RUNTIME_FILES).filter(function (rel) {
      return digestOf(LOT, rel) !== digestOf(prev, rel);
    });
    check(pair[1] + ". RUNTIME_BYTE_IDENTICAL_TO_" + pair[0].toUpperCase().replace(".", "")
      + " sur " + (RUNTIME_DIRS.length + RUNTIME_FILES.length) + " chemins",
      diffs.length === 0, JSON.stringify(diffs));
  });
  check("RT-03. la Charte est dans le perimetre runtime, governance/README.md non",
    RUNTIME_FILES.indexOf("governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md") !== -1
    && RUNTIME_DIRS.indexOf("governance") === -1);
  check("RT-04. les outils ajoutes n'ecrivent rien",
    ["tools/seal-inventory.js"].every(function (t) {
      return !/writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|createWriteStream|renameSync|chmodSync|chownSync/
        .test(fs.readFileSync(path.join(LOT, t), "utf8"));
    }));

  /* ===== sceaux, trois cadres (§7) ===== */
  console.log("\n  -- inventaire des sceaux : trois cadres --");
  const SI = require(path.join(LOT, "tools", "seal-inventory.js"));
  if (!fs.existsSync(path.join(BUNDLE, "MONO-10"))) {
    console.log("  SKIP  SEAL-01. inventaire -> paquet non joignable depuis cette extraction ;"
      + " aucun PASS n'est emis a la place");
  } else {
    const f11 = SI.inventory(BUNDLE, ["MONO-10/v0.11", "MONO-10/v0.12", "MONO-10/v0.13"]);
    const f12 = SI.inventory(BUNDLE, ["MONO-10/v0.12", "MONO-10/v0.13"]);
    const f13 = SI.inventory(BUNDLE, "MONO-10/v0.13");
    check("SEAL-01. cadre v0.11 : 24 / 1577 / 9 / 0",
      f11.sealedHistoricalLots === 24 && f11.sealedReferences === 1577
      && f11.sealedDivergences === 9 && f11.unverifiableHistoricalLots.length === 0,
      [f11.sealedHistoricalLots, f11.sealedReferences, f11.sealedDivergences,
        f11.unverifiableHistoricalLots.length].join("/"));
    check("SEAL-02. cadre v0.12 : 25 / 1644 / 9 / 0",
      f12.sealedHistoricalLots === 25 && f12.sealedReferences === 1644
      && f12.sealedDivergences === 9 && f12.unverifiableHistoricalLots.length === 0,
      [f12.sealedHistoricalLots, f12.sealedReferences, f12.sealedDivergences,
        f12.unverifiableHistoricalLots.length].join("/"));
    console.log("  INFO  cadre v0.13 mesure : " + f13.sealedHistoricalLots + " lots, "
      + f13.sealedReferences + " references, " + f13.sealedDivergences + " divergences, "
      + f13.unverifiableHistoricalLots.length + " non scelle(s)");
    check("SEAL-03. cadre v0.13 : memes 9 divergences, 0 lot non scelle",
      f13.sealedDivergences === 9 && f13.unverifiableHistoricalLots.length === 0,
      JSON.stringify(f13.unverifiableHistoricalLots));
    const lots = f11.historical.filter(function (r) { return r.divergences.length; })
      .map(function (r) { return r.lot; }).sort();
    check("SEAL-04. les divergences sont bien MONO-07 et MONO-08/v0.6",
      JSON.stringify(lots) === JSON.stringify(["MONO-07", "MONO-08/v0.6"]), JSON.stringify(lots));
    check("SEAL-05. le cadre est nomme dans la documentation, jamais implicite",
      /cadre v0\.11/i.test(docs["NON-REGRESSION.md"] || "") && /cadre v0\.12/i.test(docs["NON-REGRESSION.md"] || ""));
  }

  console.log("\n" + pass + " PASS, " + fail + " FAIL");
  console.log("DOCUMENTARY_CHECKS_CAUGHT = " + caught + " / DOCUMENTARY_CHECKS_TOTAL = " + total);
  console.log("NETWORK_CALLS = 0 | REAL_LLM_CALLS = 0 | REAL_EF02_RUNS = 0"
    + " | REAL_PROFESSIONAL_RUNS = 0 | REAL_HUMAN_ACTS = 0");
  process.exit(fail === 0 && caught === total ? 0 : 1);
})();
