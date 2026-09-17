#!/usr/bin/env node
"use strict";
/**
 * MONO-10 v0.18 — test/test-mono10-v0.18-documentary.js
 *
 * CONTROLES DE VERITE DOCUMENTAIRE. Aucun run, aucun reseau, aucun LLM,
 * AUCUNE ECRITURE, NULLE PART : ni dans le paquet, ni dans un repertoire
 * temporaire. Les temoins negatifs sont des mutations EN MEMOIRE du contenu
 * reel des documents livres.
 *
 * CE QUE v0.18 CORRIGE (audit final de v0.17) :
 *   B1  DOC-19 n'etait PAS causal contre la faute reelle de v0.16 : le marqueur
 *       generique « a l'epoque » (dans CITED_BEFORE) etait evalue AVANT le
 *       couplage de version et la detection de « depuis », et blanchissait
 *       « a l'epoque de v0.14 ; NOT_FIXED_IN_V015 depuis ». Les claims de v0.17
 *       (« depuis refuse », « meme NN ») etaient donc fausses.
 *       ORDRE IMPERATIF desormais : (1) continuite (depuis, encore, toujours,
 *       a ce jour, aujourd'hui, reste, demeure, desormais) -> FAIL ; (2) couplage
 *       version du cadre / version du token -> FAIL si differentes ; (3) cadre
 *       couple et sans continuite -> PASS ; (4) seulement ensuite, une citation
 *       (« … », annoncait, was) — « a l'epoque » n'est plus un marqueur de
 *       citation pour DOC-19. Temoin OBLIGATOIRE : la faute B2 de v0.16 verbatim,
 *       dans le document reel qui la portait ; sept variantes adversariales ;
 *       trois controles PASS.
 *   DOC-25 : « plus executionMode » exige aussi dans R1 ; aucune dimension
 *       fantome apres executionMode ; la permutation d'ordre passe (ensembles).
 *   Temoins de CONTROLE (control: true) : une mutation qui ne doit PAS mordre.
 *
 * CE QUE v0.17 AJOUTAIT (audit final de v0.16 : verite d'origine, statut perime) :
 *   B1/B3 DOC-24 : chaque document a titre d'origine est declare avec sa version
 *       d'origine CONCEPTUELLE (le H1), sa version d'origine DE CONTENU (premier
 *       lot scelle ou le contenu courant apparait a l'identique), le chemin, les
 *       deux empreintes et le verdict byte-identique ; la comparaison vise le
 *       LOT NOMME, pas v0.11 ; le premier lot identique est re-mesure sur tous
 *       les lots joignables. HISTORICAL-INPUT-AUTHORITY.md et LINEAGE.md :
 *       concu en v0.7, contenu de v0.10.
 *   DOC-27 : l'historique de modification de chaque document (MANIFEST.
 *       documentHistory) est re-mesure sur les lots joignables ; aucun H1 ne
 *       porte plus de parenthese « corrige en » ecrite a la main.
 *   B2  DOC-19 : un ancien token NOT_FIXED_IN_V0NN n'est tolere que dans la
 *       phrase « a l'epoque de v0.NN » (le MEME NN) ou cite ; « depuis » apres
 *       un ancien token est une faussete.
 *   DOC-22 : borne de heading et borne de colonne verifiees SEPAREMENT ;
 *   DOC-25 : enumerations comparees comme des ENSEMBLES au code (REQUIRED,
 *       SUBJECT_FIELDS), executionMode exige ;
 *   DOC-06 : non-imputabilite lue comme une NEGATION, pas comme un mot.
 *   Temoins qui exigent les lots historiques (needsLots) : SKIP explicite quand
 *   le paquet est extrait seul, jamais un PASS a la place.
 *
 * CE QUE v0.16 AJOUTAIT (audit final de v0.15 : bloqueurs B1, B2 et lacunes
 * non bloquantes) :
 *   B1  DOC-03 reconnait le quantificateur POST-VERBAL : « (sont|figurent|se
 *       trouvent|restent|demeurent) tou(s|tes) (attest|prouv|garanti|certifi)… »
 *       — l'alternative « sont tous » de v0.15 n'etait atteignable qu'apres un
 *       quantificateur pre-verbal, ou l'ancien patron mordait deja ; les cinq
 *       phrases manquees par l'audit sont des temoins exacts ;
 *   B2  DOC-22 : dans un registre multi-versions, aucune ligne ne decrit une
 *       correction d'une version POSTERIEURE a celle du heading ou de la colonne
 *       « Statut en v0.NN » qui la coiffe ;
 *   DOC-11 / DOC-12 : chiffres en gras (« **cinq** hypothèses ») reconnus ;
 *   DOC-15 : noms de fichiers racine pointes (audit.notes.md) reconnus ;
 *   DOC-23 : statut de CHAQUE reserve R1..R5 verifie individuellement ;
 *   DOC-05 : un chiffre de cadre CADRE mais FAUX est detecte ;
 *   DOC-24 : aucun titre de version perime sur un document modifie depuis v0.11 ;
 *   DOC-25 : sujet de decision — champs enregistres et dimensions exigees sont
 *       DERIVES du code (SUBJECT_FIELDS, REQUIRED) et compares aux documents.
 *
 * CE QUE v0.15 AJOUTAIT (audit final de v0.14 : residus B1, B2 et lacunes de
 * detecteurs) :
 *   B1  DOC-05 detecte desormais tout chiffre de cadre (« 24 lots », « 1 577
 *       references »...) cite SANS son cadre, en phrase libre, ligne de tableau,
 *       puce, parenthese, gras ou chaine JSON ;
 *   B2  DOC-20 recalcule buildWindowOpened depuis la methode canonique
 *       (mtime minimal des fichiers du lot, arrondi a la seconde paire) et le
 *       compare au MANIFEST ; une derive d'une seconde fait echouer ;
 *   DOC-03 : verbes « se trouvent », « sont presents », « figurent », « sont
 *       tous attestes », sujets « toutes les proprietes », « chaque attribut » ;
 *   DOC-04 : flexions genre/nombre de inscrit / enregistre / atteste ;
 *   DOC-09 : « au nombre de N », « il existe N reserves », « les N constats » ;
 *   DOC-14 : structure DECLAREE (MANIFEST.documentStructure) : un deplacement
 *       de puces, meme separe par des lignes vides, change les comptes ;
 *   DOC-21 : toute section « Mesures » d'un registre multi-versions nomme sa
 *       version.
 *
 * POURQUOI CE FICHIER AVAIT ETE REECRIT EN v0.14 (audit final de v0.13,
 * constats F1 a F4, detecteurs obligatoires D-A a D-D).
 *
 *   F1  DOC-04 etait inoperant : sa portee etait la SECTION, et la section
 *       visee contenait deja les mots de qualification. La faute cible seule
 *       (une phrase trompeuse ajoutee dans cette section) ne le faisait pas
 *       echouer. La portee est desormais la PHRASE : l'affirmation doit etre
 *       qualifiee dans la phrase qui la porte.
 *   F2  DOC-08 etait satisfait par un MOT : « inatteignable » n'importe ou dans
 *       la section suffisait, meme si la phrase qui cite le code le presentait
 *       comme observe. La portee est desormais la phrase qui contient le code.
 *   F3  aucun `.json` n'etait balaye : MANIFEST.json echappait au scan. Le
 *       balayage couvre desormais `.md` ET `.json`, recursivement.
 *   F4  DOC-03 etait contournable par des variantes realistes ; huit variantes
 *       sont desormais chacune un temoin negatif distinct.
 *   D-A nombre d'hypotheses declarees, compte reellement dans README ;
 *   D-B nombre de champs non attestes, derive de l'enumeration canonique ;
 *   D-C rejouabilite des commandes imprimees (seal-inventory, diff d'identite) ;
 *   D-D structure markdown (liste collee a un paragraphe, heading colle a une
 *       liste, heading sans separation).
 *
 * REGLE DES TEMOINS CAUSAUX (§5 du mandat). Pour CHAQUE detecteur :
 *   PASS_CLEAN                : paquet livre -> 0 faussete ;
 *   FAIL_SINGLE_TARGET_FAULT  : UNE faute cible injectee dans UN document reel
 *                               -> au moins 1 faussete ;
 *   PASS_AFTER_REVERT         : ce seul document restaure -> 0 faussete.
 * Un detecteur dont l'un des trois manque n'est PAS valide.
 *
 * Usage : node test/test-mono10-v0.18-documentary.js [racineDuPaquet]
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOT = path.resolve(__dirname, "..");
const BUNDLE = process.argv[2] || path.resolve(LOT, "..", "..");
/** La version courante est lue dans le NOM DE CE FICHIER, pas dans le nom du
 *  repertoire : une extraction du zip peut s'appeler n'importe comment. */
const VERSION_TAG = (path.basename(__filename).match(/v0\.\d+/) || ["v0.18"])[0];   // "v0.18"
const CHARTE = "governance/EvidenceForge-CHARTE-IDENTITE-ADN-GOUVERNANCE.md";

let pass = 0, fail = 0, skipped = 0, caught = 0, total = 0;
const check = (id, ok, detail) => {
  if (ok) { pass++; console.log("  PASS  " + id); }
  else { fail++; console.log("  FAIL  " + id + (detail !== undefined ? "  -> " + String(detail).slice(0, 300) : "")); }
};
const skip = (id, why) => { skipped++; console.log("  SKIP  " + id + " -> " + why + " ; aucun PASS n'est emis a la place"); };

/* ============================ collecte ============================ */

/** F3 — balayage RECURSIF de `.md` ET `.json`. MANIFEST.json, governance/,
 *  migrations, sous-dossiers profonds : rien n'est un angle mort. */
function collectDocs(root) {
  const out = {};
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).sort(function (a, b) { return a.name < b.name ? -1 : 1; })
      .forEach(function (e) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git") return; return walk(p); }
        if (/\.(md|json)$/.test(e.name)) out[path.relative(root, p)] = fs.readFileSync(p, "utf8");
      });
  })(root);
  return out;
}
const isJson = function (f) { return /\.json$/.test(f); };
const isRuntimeJson = function (f) { return /^(schemas|contracts)\//.test(f); };

/**
 * BLOCS d'un document : l'unite de lecture d'un lecteur humain.
 *   - markdown : un paragraphe (lignes consecutives non vides), une ligne de
 *     tableau, un item de liste, un bloc de code (ignore par les detecteurs de
 *     prose) ;
 *   - json : une ligne.
 * Chaque bloc porte son numero de ligne et la section (heading) qui le contient.
 */
function blocksOf(f, text) {
  const lines = text.split("\n");
  const out = [];
  if (isJson(f)) {
    lines.forEach(function (l, i) {
      const k = l.match(/^\s*"([^"]+)"\s*:/);
      out.push({ text: l, line: i + 1, section: "(json)", kind: "json", key: k ? k[1] : null });
    });
    return out;
  }
  let section = "(preambule)", fence = false, cur = null;
  const flush = function () { if (cur) { out.push(cur); cur = null; } };
  lines.forEach(function (l, i) {
    if (/^```/.test(l)) { flush(); fence = !fence; out.push({ text: l, line: i + 1, section: section, kind: "code" }); return; }
    if (fence) { out.push({ text: l, line: i + 1, section: section, kind: "code" }); return; }
    if (/^#{1,6}\s/.test(l)) { flush(); section = l.replace(/^#+\s*/, ""); out.push({ text: l, line: i + 1, section: section, kind: "heading" }); return; }
    if (!l.trim()) { flush(); return; }
    if (/^\s*\|/.test(l)) { flush(); out.push({ text: l, line: i + 1, section: section, kind: "table" }); return; }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) { flush(); cur = { text: l, line: i + 1, section: section, kind: "list" }; return; }
    if (cur && (cur.kind === "list" || cur.kind === "para" || cur.kind === "quote")) { cur.text += " " + l.trim(); return; }
    flush();
    cur = { text: l, line: i + 1, section: section, kind: /^\s*>/.test(l) ? "quote" : "para" };
  });
  flush();
  return out;
}

/** Phrases d'un bloc : cellules de tableau, puis coupure aux fins de phrase
 *  suivies d'une majuscule, d'un backtick, d'un guillemet ou d'une parenthese. */
function sentencesOf(block) {
  const cells = block.kind === "table" ? block.text.split("|") : [block.text];
  const out = [];
  cells.forEach(function (c) {
    c.split(/(?<=[.!?](?:\*\*|\*|_|»|"|\))*)\s+(?=[A-ZÀ-Ý`«(*_])/).forEach(function (s) { if (s.trim()) out.push(s.trim()); });
  });
  return out;
}

/** Une valeur ancienne EXPLICITEMENT citee comme erreur historique corrigee
 *  n'est pas une faussete (§6 du mandat). */
const CITED = /annon[cç]ai(?:t|ent)|d[eé]clarai(?:t|ent)|affirmai(?:t|ent)|[eé]crivai(?:t|ent)|comptai(?:t|ent)|portai(?:t|ent)|publiai(?:t|ent)|relevai(?:t|ent)|trouvai(?:t|ent)|donnai(?:t|ent)|mesurai(?:t|ent)|rendai(?:t|ent)|pr[eé]sent(?:[eé]e?s?|ait|er) comme|au lieu de|corrig[eé]|faux|fausse|sous-d[eé]clar|r[eé]alit[eé] mesur[eé]e|valeur courante|\[v0\.1\d — |historique|[aà] l'[eé]poque|«|mesure de v0\.1\d|jusqu'[aà] v0\.1\d|avant v0\.1\d|remplac[eé]|a [eé]t[eé] mesur[eé]/i;
/** Citation ADJACENTE : le marqueur precede le chiffre dans la meme phrase.
 *  Plus etroit que CITED : « non corrigees par v0.15 » ou « lots historiques »
 *  ne doivent pas blanchir un chiffre cite au present. */
const CITED_BEFORE = /annon[cç]ai(?:t|ent)|d[eé]clarai(?:t|ent)|affirmai(?:t|ent)|[eé]crivai(?:t|ent)|comptai(?:t|ent)|portai(?:t|ent)|publiai(?:t|ent)|relevai(?:t|ent)|trouvai(?:t|ent)|donnai(?:t|ent)|mesurai(?:t|ent)|rendai(?:t|ent)|pr[eé]sent(?:[eé]e?s?|ait|er) comme|au lieu de|«|\[v0\.1\d — |mesure de v0\.1\d|jusqu'[aà] v0\.1\d|avant v0\.1\d|[aà] l'[eé]poque|r[eé]sidu B1|c'[eé]tait|[eé]tait|t[eé]moins?\s*:|faute|\ble token\b/i;
const isCitedBefore = function (block, sentence, idx) {
  if (block.kind === "json" && /^(was|before|claim|replaces|where)$/.test(block.key || "")) return true;
  return CITED_BEFORE.test(sentence.slice(Math.max(0, idx - 90), idx + 6));
};
const isCited = function (block, sentence) {
  if (block.kind === "json" && /^(was|before|claim|replaces)$/.test(block.key || "")) return true;
  return CITED.test(sentence);
};

/* ============================ detecteurs ============================ */
/**
 * Un detecteur recoit la CARTE des documents ({chemin: texte}) et rend la
 * liste des faussetes trouvees. Vide = documentation propre.
 * `mutations` : UNE faute cible chacune, sur UN document reel ; chacune est un
 * temoin negatif distinct et doit faire mordre le detecteur.
 */
const DETECTORS = [];
function detector(id, label, find, mutations) {
  DETECTORS.push({ id: id, label: label, find: find, mutations: mutations });
}
const mut = function (label, file, fn, needsLots) { return { label: label, file: file, apply: fn, needsLots: !!needsLots }; };
/** Temoin de CONTROLE : une mutation legitime, qui ne doit PAS faire mordre le detecteur. */
const ctl = function (label, file, fn) { return { label: label, file: file, apply: fn, control: true }; };
/** Lots historiques scelles joignables (freres du lot) : v0.1 .. v0.16 */
function reachableLots() {
  const out = {};
  const parent = path.resolve(LOT, "..");
  try {
    fs.readdirSync(parent).forEach(function (n) {
      /** un lot scelle = un repertoire v0.N portant SHA256SUMS.txt (v0.1 n'a pas de core/) */
      if (/^v0\.\d+$/.test(n) && n !== VERSION_TAG && fs.existsSync(path.join(parent, n, "SHA256SUMS.txt"))) out[n] = path.join(parent, n);
    });
  } catch (e) { /* aucun */ }
  return out;
}
const LOTS = reachableLots();
const LOTS_REACHABLE = Object.keys(LOTS).length > 0;
const sortedLotNames = function () { return Object.keys(LOTS).sort(function (a, b) { return parseInt(a.slice(3), 10) - parseInt(b.slice(3), 10); }); };
const sha256Of = function (buf) { return crypto.createHash("sha256").update(buf).digest("hex"); };
const mustReplace = function (text, re, by, what) {
  if (!re.test(text)) throw new Error("mutation inapplicable : " + what + " introuvable");
  return text.replace(re, by);
};

/* ----- DOC-01 — asymetrie de preparation qualifiee par couche ----- */
detector("DOC-01", "l'asymetrie de preparation est qualifiee par couche",
  function (docs) {
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      blocksOf(f, docs[f]).forEach(function (b) {
        if (b.kind === "code") return;
        const re = /ne peut pas l'am[eé]liorer|jamais am[eé]liorer/gi;
        let m;
        while ((m = re.exec(b.text)) !== null) {
          if (isCited(b, b.text)) continue;
          if (!/par couche|assertReadinessPhase|de bout en bout|couche d'assertion|pas [aà] la couche/i.test(b.text)) {
            hits.push(f + ":" + b.line + " :: " + b.text.slice(0, 80));
          }
        }
      });
    });
    return hits;
  },
  [mut("READINESS.md : la qualification de couche est retiree", "READINESS.md", function (t) {
    return mustReplace(t, /## Asym[eé]trie : [aà] quelle couche \?[\s\S]*$/,
      "## Asymetrie\n\nL'appelant peut degrader une preparation, il ne peut pas l'ameliorer.\n", "section Asymetrie");
  })]);

/* ----- D-B / DOC-02 — enumeration canonique des champs non attestes ----- */
/** La SOURCE CANONIQUE est le bloc balise de LLM-CAPABILITY-BOUNDARY.md. Le
 *  nombre n'est jamais recopie : il est DERIVE de cette enumeration. */
function canonicalFields(docs) {
  const t = docs["LLM-CAPABILITY-BOUNDARY.md"] || "";
  const m = t.match(/<!-- CANONICAL:NON_ATTESTED_FIELDS -->([\s\S]*?)<!-- \/CANONICAL:NON_ATTESTED_FIELDS -->/);
  if (!m) return null;
  const out = [];
  m[1].split("\n").forEach(function (l) {
    const x = l.match(/^\s*(?:-|\d+\.)\s+`([A-Za-z]+)(?:\[\])?`/);
    if (x) out.push(x[1]);
  });
  return out;
}
function r3TableFields(docs) {
  const t = docs["OPEN-FINDINGS.md"] || "";
  const sec = (t.match(/^## R3[\s\S]*?(?=^## R4)/m) || [""])[0];
  const out = [];
  sec.split("\n").forEach(function (l) {
    const x = l.match(/^\|\s*`([A-Za-z]+)(?:\[\])?`\s*\|/);
    if (x) out.push(x[1]);
  });
  return out;
}
detector("DOC-02", "l'enumeration canonique des champs non attestes existe et OPEN-FINDINGS R3 porte exactement les memes champs",
  function (docs) {
    const canon = canonicalFields(docs);
    if (!canon) return ["LLM-CAPABILITY-BOUNDARY.md : bloc CANONICAL:NON_ATTESTED_FIELDS absent"];
    if (canon.length === 0) return ["LLM-CAPABILITY-BOUNDARY.md : enumeration canonique vide"];
    const r3 = r3TableFields(docs);
    const hits = [];
    canon.forEach(function (c) { if (r3.indexOf(c) === -1) hits.push("OPEN-FINDINGS.md R3 n'enumere pas " + c); });
    r3.forEach(function (c) { if (canon.indexOf(c) === -1) hits.push("OPEN-FINDINGS.md R3 enumere " + c + ", absent de la source canonique"); });
    return hits;
  },
  [mut("OPEN-FINDINGS.md : la ligne `costUsd` du tableau R3 est retiree", "OPEN-FINDINGS.md", function (t) {
    return mustReplace(t, /^\|\s*`costUsd`[^\n]*\n/m, "", "ligne costUsd");
  })]);

/* ----- DOC-03 — sur-promesse d'attestation (F4 : huit variantes) ----- */
detector("DOC-03", "aucun document ne sur-promet l'attestation des champs",
  function (docs) {
    const QUANT = "(tous les|tous des|toutes les|chaque|l['’]ensemble des|l['’]int[eé]gralit[eé] des|tout le|toute la|l['’]artefact entier|l['’]artefact tout entier|le payload entier|tout l['’]artefact)";
    const SUJET = "(champs?|propri[eé]t[eé]s?|valeurs?|attributs?|payload|contenu|artefact)?";
    /** v0.15 : « se trouvent? » ne rendait optionnel que le « t » final — « se
     *  trouve » n'etait jamais reconnu. Verbes d'etat et de presence ajoutes. */
    const VERBE = "(sont|est|seraient|serait|se trouv(?:e|ent)|figure(?:nt)?|sont pr[eé]sente?s?|sont tous|sont toutes)\\s+(tous\\s+|toutes\\s+)?(attest|prouv|garanti|certifi)";
    /** v0.16 (B1) : quantificateur POST-VERBAL — « les champs sont tous attestés »,
     *  « figurent tous attestés », « se trouvent toutes prouvées ». */
    const POSTV = "(sont|figurent|se trouv(?:e|ent)|restent|demeurent|seraient|[eé]taient)\\s+tou(?:s|tes)\\s+(attest|prouv|garanti|certifi)";
    const res = [
      new RegExp(POSTV, "i"),
      new RegExp(QUANT + "\\s*" + SUJET + "[^.\\n|]{0,90}" + VERBE, "i"),
      new RegExp("(atteste|prouve|garantit|certifie)\\s+" + QUANT + "\\s*" + SUJET, "i"),
      new RegExp("(certification|d[eé]cision|concession)[^.\\n|]{0,60}(garantit|prouve|atteste)[^.\\n|]{0,40}" + QUANT + "\\s*" + SUJET, "i"),
      new RegExp("(garantit|prouve|atteste)\\s+la\\s+v[eé]racit[eé]\\s+(de|du)\\s+" + QUANT, "i"),
    ];
    const NEG = /\b(ne|n'|pas|jamais|non|aucun)\b[^.\n|]{0,30}(sont|est|atteste|prouve|garantit)|(sont|est)\s+(pas|jamais)|n'(est|atteste|a)|ni\b/i;
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      if (f === CHARTE) return;  // document du proprietaire : lu, jamais accuse ici (il ne parle pas de l'artefact de capacite)
      blocksOf(f, docs[f]).forEach(function (b) {
        if (b.kind === "code") return;
        sentencesOf(b).forEach(function (s) {
          res.forEach(function (re) {
            const m = s.match(re);
            if (m && !NEG.test(s) && !isCited(b, s)) hits.push(f + ":" + b.line + " :: " + m[0].slice(0, 70));
          });
        });
      });
    });
    return hits;
  },
  [
    "Une concession atteste tous les champs de l'artefact.",
    "Une concession atteste tous des champs de l'artefact.",
    "Chaque champ de l'artefact est attesté par la décision.",
    "Une concession atteste l'ensemble des champs de l'artefact.",
    "Tous les attributs de l'artefact sont attestés par l'émetteur.",
    "Chaque propriété de l'artefact est attestée.",
    "Tout le payload est attesté par la certification.",
    "L'artefact entier est attesté par la décision.",
    "Tous les champs se trouvent attestés par la concession.",
    "Tous les champs de l'artefact se trouve attesté par la concession.",
    "Toutes les propriétés sont présentes attestées dans la décision.",
    "Chaque attribut figure attesté dans la décision d'émetteur.",
    "Tous les champs sont tous attestés par l'émetteur.",
    "Toutes les propriétés de l'artefact sont attestées.",
    "Chaque attribut de l'artefact est attesté.",
    /** v0.16 — les cinq phrases manquees par l'audit final de v0.15, EXACTEMENT. */
    "Les champs de l'artefact sont tous attestés par la décision.",
    "Les propriétés de l'artefact sont toutes attestées par la décision.",
    "Les champs de l'artefact figurent tous attestés dans la décision.",
    "Les champs de l'artefact se trouvent tous attestés par la décision.",
    "Les attributs sont tous garantis par la concession.",
    "Les données sont toutes prouvées.",
  ].map(function (phrase, i) {
    return mut("variante " + (i + 1) + " : « " + phrase + " »", "ARTIFACT-REGISTRY-TRUST.md", function (t) {
      return t + "\n\n" + phrase + "\n";
    });
  }));

/* ----- DOC-04 — callerTransportIgnored : qualification DANS LA PHRASE (F1) ----- */
detector("DOC-04", "toute phrase affirmant l'inscription du transport la qualifie dans la phrase meme",
  function (docs) {
    /** v0.15 : flexions genre / nombre de inscrit, enregistre, atteste (F1 bis). */
    const PART = "(inscrit|enregistr[eé]|attest[eé]|consign[eé])(e|s|es)?";
    const AFFIRME = new RegExp("le fait qu'il ait essay[eé] (est|soit) \\**" + PART
      + "|\\b(est|sont|soit|soient|reste|restent)\\s+\\**" + PART + "\\**\\s+(dans|[aà]) l'artefact"
      + "|" + PART + " dans l'artefact de capacit[eé]", "i");
    const QUALIFIE = /d[eé]claratif|tra[cç]abilit[eé]|pas une garantie|pas une autorit[eé]|auto-d[eé]faisant|sans (changer|effet|valeur)|effa[cç]able/i;
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      blocksOf(f, docs[f]).forEach(function (b) {
        if (b.kind === "code") return;
        sentencesOf(b).forEach(function (s) {
          if (!AFFIRME.test(s)) return;
          if (isCited(b, s)) return;
          if (!QUALIFIE.test(s)) hits.push(f + ":" + b.line + " :: phrase non qualifiee « " + s.slice(0, 70) + " »");
        });
      });
    });
    return hits;
  },
  [
    /** F1 — TEST D'ISOLEMENT : paquet propre, UNE phrase trompeuse ajoutee dans
     *  la section §3 visee — qui garde par ailleurs toutes ses qualifications. */
    mut("LLM-CAPABILITY-BOUNDARY.md §3 : une phrase trompeuse nue est ajoutee, la section garde ses qualifications", "LLM-CAPABILITY-BOUNDARY.md", function (t) {
      return mustReplace(t, /(comme une protection\.\n)/,
        "$1\nLe fait qu'il ait essayé est inscrit dans l'artefact de capacité.\n", "fin de §3");
    }),
    mut("LLM-CAPABILITY-BOUNDARY.md §3 : « à titre déclaratif » est retire de la phrase existante", "LLM-CAPABILITY-BOUNDARY.md", function (t) {
      return mustReplace(t, /\*\*inscrit\s*\n?à titre déclaratif\*\*/, "inscrit", "phrase « inscrit à titre déclaratif »");
    }),
  ].concat([
    "La tentative de l'appelant est inscrite dans l'artefact de capacité.",
    "Les transports présentés sont inscrits dans l'artefact de capacité.",
    "Les tentatives sont inscrites dans l'artefact de capacité.",
    "Le transport présenté est enregistré dans l'artefact de capacité.",
    "La tentative est enregistrée dans l'artefact de capacité.",
    "Les transports présentés sont enregistrés dans l'artefact de capacité.",
    "Les tentatives sont enregistrées dans l'artefact de capacité.",
    "Le transport présenté est attesté dans l'artefact de capacité.",
    "La tentative est attestée dans l'artefact de capacité.",
    "Les transports sont attestés dans l'artefact de capacité.",
    "Les tentatives sont attestées dans l'artefact de capacité.",
  ].map(function (phrase) {
    return mut("LLM-CAPABILITY-BOUNDARY.md §3 : flexion « " + phrase + " »", "LLM-CAPABILITY-BOUNDARY.md", function (t) {
      return mustReplace(t, /(comme une protection\.\n)/, "$1\n" + phrase + "\n", "fin de §3");
    });
  })));

/* ----- DOC-05 — mesures de sceaux fausses ou perimees presentees comme courantes ----- */
let FRAMES = null, LOT_VALUES = {}, REF_VALUES = {};
function loadFrames(docs) {
  FRAMES = null; LOT_VALUES = {}; REF_VALUES = {};
  try {
    const si = JSON.parse(docs["MANIFEST.json"] || "").sealInventory || {};
    FRAMES = {};
    Object.keys(si).filter(function (k) { return /^frameV0\d+$/.test(k); }).forEach(function (k) {
      FRAMES[k] = si[k]; LOT_VALUES[si[k].sealedHistoricalLots] = 1; REF_VALUES[si[k].sealedReferences] = 1;
    });
  } catch (e) { FRAMES = null; }
}
detector("DOC-05", "aucune mesure de sceau fausse ou perimee n'est AFFIRMEE comme courante, ni cadree avec un chiffre d'un autre cadre",
  function (docs) {
    loadFrames(docs);
    const FAUX = [
      { re: /UNVERIFIABLE_HISTORICAL_LOTS[^\n|]*?\b9\b/, vrai: /\b0\b/ },
      { re: /SEALED_(REFERENCE_)?DIVERGENCES[^\n|]*?\b0\b/, vrai: /\b9\b/ },
      { re: /\b14 lots scell[eé]s\b/i, vrai: /\b2[4-7]\b/ },
      { re: /\b514 r[eé]f[eé]rences?\b/i, vrai: /\b1\s?(577|644|715|787)\b/ },
      { re: /\b3\s?127\b/, vrai: /cadre|arbre\s*\**\s*d[e']/i },              // ancien total v0.12, sans cadre
      /** v0.15 (B1) : un chiffre de CADRE — lots scelles ou references d'un
       *  cadre v0.11..v0.15 — cite sans nommer son cadre dans la meme phrase ou
       *  cellule est une inexactitude (regle de NON-REGRESSION.md §2). */
      { re: /(?<![-\w.])(24|25|26|27|28)\b\s*\**\s*(lots?|sceaux)|\b(lots?|sceaux)\b[^.\n|]{0,30}(?<![-\w.])(24|25|26|27|28)\b(?!\s*(comparaisons|\/\s*\d+\s*\/))|\b1\s?(577|644|715|787|860)\b\s*\**\s*(r[eé]f[eé]rences?|refs?)|\b(r[eé]f[eé]rences?|refs?)\b[^.\n|]{0,30}\b1\s?(577|644|715|787|860)\b/i,
        vrai: /cadre|frame|arbre|historique\s*\(?\s*v0\.1\d|dans le cadre|v0\.1\d\s*(:|—|-)\s*\d|\(v0\.1\d\)|excluded/i, sentence: true },
      { re: /\b35\b\s*(\*\*)?\s*(sceaux|fichiers de sceau)|\|\s*\*\*35\*\*\s*\|/i, vrai: /cadre|arbre\s*\**\s*d[e']/i },
    ];
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      blocksOf(f, docs[f]).forEach(function (b) {
        if (b.kind === "code") return;
        /** v0.16 — un chiffre de cadre CADRE mais FAUX : les valeurs de chaque cadre
         *  viennent de MANIFEST.sealInventory.frameV0NN (elles-memes comparees a la
         *  mesure par SEAL-01..08). Unite : la phrase en prose, la ligne entiere en tableau. */
        const framedUnits = b.kind === "table" ? [b.text] : sentencesOf(b);
        framedUnits.forEach(function (u) {
          const named = []; const reF = /cadre\s*\**\s*(?:historique\s+|courant\s+)?v0\.(1\d)|historique\s*\(?\s*v0\.(1\d)/gi; let mm;
          while ((mm = reF.exec(u)) !== null) named.push("frameV0" + (mm[1] || mm[2]));
          if (!named.length || !FRAMES) return;
          const allowed = {};
          named.forEach(function (k) { const fr = FRAMES[k]; if (fr) { allowed[fr.sealedHistoricalLots] = 1; allowed[fr.sealedReferences] = 1; } });
          const nums = (u.replace(/(\d)[\s\u202f\u00a0](\d{3})\b/g, "$1$2").match(/\b\d{2,4}\b/g) || []).map(Number);
          nums.forEach(function (n) {
            if (!LOT_VALUES[n] && !REF_VALUES[n]) return;
            if (!allowed[n] && !isCitedBefore(b, u, u.indexOf(String(n)))) hits.push(f + ":" + b.line + " :: cadre " + named.join("+") + " avec le chiffre " + n + " qui ne lui appartient pas");
          });
        });
        FAUX.forEach(function (x) {
          /** portee : la phrase (ou cellule) pour les chiffres de cadre, le bloc sinon */
          const units = x.sentence ? sentencesOf(b) : [b.text];
          units.forEach(function (u) {
            const m = x.re.exec(u);
            if (!m || x.vrai.test(u)) return;
            const cited = x.sentence ? isCitedBefore(b, u, m.index) : isCited(b, u);
            if (!cited) hits.push(f + ":" + b.line + " :: " + u.trim().slice(0, 80));
          });
        });
      });
    });
    return hits;
  },
  [
    mut("governance/README.md : la faussete B1 de v0.12 est reintroduite a sa place d'origine", "governance/README.md", function (t) {
      return mustReplace(t, /\| `NON-REGRESSION\.md` §2 — [^|]*\|/,
        "| `NON-REGRESSION.md` — `UNVERIFIABLE_HISTORICAL_LOTS = 9` maintenu, non dissimulé |", "ligne §10 NON-REGRESSION §2");
    }),
    mut("NON-REGRESSION.md : l'ancien total « 35 sceaux / 3 127 » est reintroduit sans cadre", "NON-REGRESSION.md", function (t) {
      return mustReplace(t, /(\| \*\*tous sceaux confondus\*\* \|)[^\n]*/,
        "$1 **35** | **3 127** | **9** |", "ligne tous sceaux confondus");
    }),
    /** B1 — six formes d'un chiffre de cadre sans cadre. */
    mut("OPEN-FINDINGS.md R4 : phrase libre « trouve 24 lots historiques scellés, 1 577 références » sans cadre (residu B1 de v0.14)", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /(\*\*Fait\.\*\* Une recherche \*\*récursive\*\* des sceaux)/,
        "Une recherche récursive des sceaux trouve 24 lots historiques scellés, 1 577 références et 9 divergences.\n\n$1", "debut de R4");
    }),
    mut("README.md : ligne de tableau « | `SEALED_HISTORICAL_LOTS_COUNT` | **24** | » sans cadre", "README.md", function (t) {
      return mustReplace(t, /\| `SEALED_HISTORICAL_LOTS_COUNT` \|[^\n]*/, "| `SEALED_HISTORICAL_LOTS_COUNT` | **24** lots |", "ligne SEALED_HISTORICAL_LOTS_COUNT");
    }),
    mut("NON-REGRESSION.md §5 : puce « - il mesure 24 lots scellés et 1 577 références ; » sans cadre", "NON-REGRESSION.md", function (t) {
      return mustReplace(t, /(- il ne corrige \*\*pas\*\* les neuf divergences historiques ;\n)/, "$1- il mesure 24 lots scellés et 1 577 références ;\n", "puce §5");
    }),
    mut("THREAT-MODEL.md §7 : parenthese « (24 lots scellés, 1 577 références) » sans cadre", "THREAT-MODEL.md", function (t) {
      return mustReplace(t, /\*\*Neuf divergences de sceau historiques subsistent\*\*/, "**Neuf divergences de sceau historiques subsistent** (24 lots scellés, 1 577 références)", "neuf divergences");
    }),
    mut("TRUST-MODEL.md : gras « **24 lots scellés / 1 577 références** » sans cadre", "TRUST-MODEL.md", function (t) {
      return t + "\n\nLa mesure des sceaux donne **24 lots scellés / 1 577 références**.\n";
    }),
    mut("MANIFEST.json : chaine « 24 lots scelles, 1577 references » sans cadre", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); man.measurements.sealedHistoricalLotsCount = "24 lots scelles, 1577 references"; return JSON.stringify(man, null, 2);
    }),
    /** v0.16 — cadre correct, chiffre faux. */
    mut("NON-REGRESSION.md : ligne « cadre v0.12 » du tableau des cadres, 25 -> 26 (chiffre du cadre v0.13)", "NON-REGRESSION.md", function (t) {
      return mustReplace(t, /(\| \*\*cadre v0\.12\*\* \|[^|]*\|) 25 \|/, "$1 26 |", "ligne cadre v0.12");
    }),
    mut("OPEN-FINDINGS.md R4 : « cadre historique v0.11 … : 24 lots » devient « 25 lots »", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /(cadre historique v0\.11\*\* \(v0\.11 à v0\.18 exclus\) : )24 lots/, "$125 lots", "cadre historique v0.11");
    }),
    mut("AUDIT-VERDICTS.v0.12-v0.18.md (fichier racine a nom pointe) : « 24 lots / 1 577 références » sans cadre", "AUDIT-VERDICTS.v0.12-v0.18.md", function (t) {
      return t + "\n\nLa mesure des sceaux donne 24 lots scellés et 1 577 références.\n";
    }),
  ]);

/* ----- DOC-06 — divergences documentees, localisees, attribuees (dans R4) ----- */
detector("DOC-06", "OPEN-FINDINGS R4 documente, localise et attribue les 9 divergences",
  function (docs) {
    const sec = ((docs["OPEN-FINDINGS.md"] || "").match(/^## R4[\s\S]*?(?=^## R5)/m) || [""])[0];
    const manque = [];
    if (!/\*\*9 divergences\*\*|9 divergences/.test(sec)) manque.push("le nombre 9");
    if (!/`MONO-07`/.test(sec) || !/`MONO-08\/v0\.6`/.test(sec)) manque.push("les deux lots");
    if (!/ant[eé]rieures?|pr[eé][eé]xistantes?|avant/i.test(sec)) manque.push("leur anteriorite");
    /** v0.17 — la non-imputabilite est une NEGATION portant sur v0.11+ : « ne sont
     *  (pas) imputables ni à v0.11 … » ou « non imputables ». Une phrase affirmative
     *  « sont imputables à v0.11 » n'est pas une non-imputabilite. */
    const NEG = /\bne\s+sont\s+(pas\s+)?imputables\s+(ni\s+)?[aà]\s+v0\.1\d|\bnon\s+imputables\b/i;
    if (!NEG.test(sec)) manque.push("leur non-imputabilite (negation explicite)");
    const AFF = /(?<!ne\s)(?<!non\s)\bsont\s+imputables\s+[aà]\s+v0\.1\d/i;
    if (AFF.test(sec)) manque.push("— au contraire, R4 les impute a un lot MONO-10");
    return manque.map(function (m) { return "OPEN-FINDINGS.md R4 n'enonce pas : " + m; });
  },
  [
    mut("OPEN-FINDINGS.md R4 : le lot MONO-08/v0.6 est anonymise", "OPEN-FINDINGS.md", function (t) {
      const sec = t.match(/^## R4[\s\S]*?(?=^## R5)/m)[0];
      return t.replace(sec, sec.replace(/`MONO-08\/v0\.6`/g, "`(lot anonymisé)`"));
    }),
    mut("OPEN-FINDINGS.md R4 : « ne sont imputables ni à v0.11 … » devient « sont imputables à v0.11 … » (mot-cle conserve)", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /\*\*Elles ne sont imputables ni à v0\.11, ni à v0\.12/, "**Elles sont imputables à v0.11, à v0.12", "phrase de non-imputabilite");
    }),
  ]);

/* ----- DOC-07 — methode de mesure ----- */
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
  [mut("NON-REGRESSION.md : « récursif » et « sans extension » sont retires", "NON-REGRESSION.md", function (t) {
    return mustReplace(t, /r[eé]cursi[a-z]*/gi, "direct", "recursif").replace(/sans extension/gi, "");
  })]);

/* ----- DOC-08 — code de refus sur-promis : SEMANTIQUE, pas mot-cle (F2) ----- */
detector("DOC-08", "aucune PHRASE ne presente LLM_SUBJECT_OUT_OF_ALLOWLIST comme un code observe",
  function (docs) {
    const TOKEN = "LLM_SUBJECT_OUT_OF_ALLOWLIST";
    const QUALIFIE = /inatteignable|non atteignable|jamais (observ|atteint|rendu)|pas observ|n'est pas (le code|observ|atteint)|existe (dans le code )?mais|morte|ne pas la pr[eé]senter|pas garantie de code|inaccessible/i;
    const OBSERVE = /observ[eé]s?|rend(u|s)?\b|l[eè]ve|retourn|sort\b|s'active|produit|refus[eé]e? par|code de refus\b.*\best\b/i;
    const EXISTENCE = /nouveaux codes|codes? (ajout|existant|d[eé]fini)/i;
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      blocksOf(f, docs[f]).forEach(function (b) {
        if (b.kind === "code") return;
        sentencesOf(b).forEach(function (s) {
          if (s.indexOf(TOKEN) === -1) return;
          if (QUALIFIE.test(s)) return;                               // qualifie DANS la phrase
          if (isCited(b, s)) return;                                  // affirmation ancienne citee
          const nu = s.replace(/[`"',\s]/g, "");
          if (nu === TOKEN) return;                                   // simple entree d'enumeration
          if (EXISTENCE.test(s) && !OBSERVE.test(s)) return;         // enumeration d'existence, pas d'observation
          hits.push(f + ":" + b.line + " :: phrase presentant le code sans dire qu'il est inatteignable « " + s.slice(0, 80) + " »");
        });
      });
    });
    return hits;
  },
  [
    /** F2 — faux positif adversarial : le MOT « inatteignable » reste dans la
     *  section, mais la phrase qui cite le code le presente comme observe. */
    mut("governance/README.md : le code est liste parmi les « codes réellement observés », le mot « inatteignable » restant dans la cellule", "governance/README.md", function (t) {
      return mustReplace(t, /Codes réellement observés : `LLM_SUBJECT_MISMATCH`, `LLM_PROBE_ALREADY_CONSUMED`\. `LLM_SUBJECT_OUT_OF_ALLOWLIST` existe dans le code mais \*\*l'ordonnancement actuel rend cette branche inatteignable\*\* : ne pas la présenter comme une garde observée/,
        "Codes réellement observés : `LLM_SUBJECT_MISMATCH`, `LLM_SUBJECT_OUT_OF_ALLOWLIST`, `LLM_PROBE_ALREADY_CONSUMED`. Une autre branche est inatteignable", "cellule §15 codes observes");
    }),
    mut("OPEN-FINDINGS.md R5 : une phrase affirme que le code est observe en pratique, la section restant qualifiee", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /(\*\*Statut\*\* : OUVERT\. Défense en profondeur morte)/,
        "En pratique, le code observé est `LLM_SUBJECT_OUT_OF_ALLOWLIST`.\n\n$1", "statut R5");
    }),
    mut("README.md : « est inatteignable » devient « est le code rendu »", "README.md", function (t) {
      return mustReplace(t, /`LLM_SUBJECT_OUT_OF_ALLOWLIST` est inatteignable\.\*\*/, "`LLM_SUBJECT_OUT_OF_ALLOWLIST` est le code rendu.**", "item 5");
    }),
  ]);

/* ----- DOC-09 — nombre de reserves coherent ----- */
const MOTS = { "une": 1, "deux": 2, "trois": 3, "quatre": 4, "cinq": 5, "six": 6, "sept": 7, "huit": 8, "neuf": 9, "dix": 10, "onze": 11, "douze": 12, "treize": 13, "quatorze": 14 };
const numOf = function (w) { return /^\d+$/.test(w) ? parseInt(w, 10) : MOTS[w.toLowerCase()]; };
detector("DOC-09", "le nombre de reserves est coherent partout, et egal au nombre reel",
  function (docs) {
    const of = docs["OPEN-FINDINGS.md"] || "";
    const reel = (of.match(/^## R[1-9]\s/gm) || []).length;
    const hits = [];
    if (reel !== 5) hits.push("OPEN-FINDINGS.md porte " + reel + " sections R, pas 5");
    /** « reserve » a DEUX sens dans ce lot : constat ouvert, et reserve
     *  anti-rejeu de nonces. Seules les tournures designant les constats
     *  ouverts sont examinees. */
    const CONSTAT = /(r[eé]serves\s+(ouvertes|ci-dessous|consign)|r[eé]serves\s+R1|r[eé]serves\s+de\s+`?OPEN-FINDINGS|R1|OPEN-FINDINGS|knownOpenFindings|openFindings)/i;
    Object.keys(docs).forEach(function (f) {
      blocksOf(f, docs[f]).forEach(function (b) {
        if (b.kind === "code") return;
        sentencesOf(b).forEach(function (sent) {
          /** v0.15 : « N reserves », « au nombre de N », « il existe N reserves »,
           *  « les N constats » — toujours restreint aux CONSTATS OUVERTS. */
          const re = /\b(une|deux|trois|quatre|cinq|six|\d+)(?:\*\*|\*|_)?\s+(r[eé]serves|constats)|au nombre de\s+(?:\*\*)?(une|deux|trois|quatre|cinq|six|\d+)/gi;
          let m;
          while ((m = re.exec(sent)) !== null) {
            const mot = m[1] || m[3];
            if (!CONSTAT.test(sent) && !CONSTAT.test(b.text)) continue;
            if (/anti-rejeu|nonce|technique/i.test(sent)) continue;   // autre sens du mot
            if (isCitedBefore(b, sent, m.index)) continue;
            const n = numOf(mot);
            if (n !== reel) hits.push(f + ":" + b.line + " annonce « " + m[0] + " » au lieu de " + reel);
          }
        });
      });
    });
    if (docs["MANIFEST.json"]) {
      try {
        const man = JSON.parse(docs["MANIFEST.json"]);
        if ((man.knownOpenFindings || []).length !== reel) hits.push("MANIFEST.knownOpenFindings compte " + (man.knownOpenFindings || []).length + ", pas " + reel);
        if (man.measurements && man.measurements.openFindingsCount !== reel) hits.push("MANIFEST.measurements.openFindingsCount = " + man.measurements.openFindingsCount + ", pas " + reel);
      } catch (e) { hits.push("MANIFEST.json illisible : " + e.message); }
    }
    return hits;
  },
  [
    mut("OPEN-FINDINGS.md : « cinq réserves » devient « quatre réserves »", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /Les \*\*cinq\*\* réserves ci-dessous/, "Les **quatre** réserves ci-dessous", "phrase cinq reserves");
    }),
    mut("governance/README.md : « au nombre de **cinq** » devient « au nombre de **quatre** »", "governance/README.md", function (t) {
      return mustReplace(t, /au nombre de \*\*cinq\*\* \(R1 à R5\)/, "au nombre de **quatre** (R1 à R5)", "au nombre de cinq");
    }),
    mut("OPEN-FINDINGS.md : phrase « Il existe quatre réserves ouvertes (R1 à R5). » ajoutee", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /(Toutes restent ouvertes pour un successeur ultérieur\.\n)/, "$1\nIl existe quatre réserves ouvertes (R1 à R5).\n", "phrase toutes restent ouvertes");
    }),
    mut("README.md : phrase « Les quatre constats R1 à R5 restent ouverts. » ajoutee", "README.md", function (t) {
      return mustReplace(t, /(Détail intégral, avec la couche qui compense chacune : `OPEN-FINDINGS\.md`\.\n)/, "$1\nLes quatre constats R1 à R5 restent ouverts.\n", "phrase detail integral");
    }),
  ]);

/* ----- DOC-10 — etiquettes de reserve non ambigues ----- */
detector("DOC-10", "les etiquettes de reserve ne sont jamais ambigues",
  function (docs) {
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      if (f === CHARTE) return;
      docs[f].split("\n").forEach(function (ligne, i) {
        const m = ligne.match(/\((R[1-5])(,[^)]*)?\)/);
        if (!m) return;
        const explicite = /OPEN-FINDINGS\.md`?\s*\(R[1-5]\)|\(R[1-5],\s*(ouverte|OPEN-FINDINGS)|OPEN-FINDINGS\.md`?\s+R[1-5]/.test(ligne)
          || /V011-R[1-5]/.test(ligne);
        if (!explicite) hits.push(f + ":" + (i + 1) + " :: etiquette nue « (" + m[1] + ") »");
      });
    });
    return hits;
  },
  [mut("LLM-CAPABILITY-BOUNDARY.md : un renvoi `OPEN-FINDINGS.md` (R3) devient (R3) nu", "LLM-CAPABILITY-BOUNDARY.md", function (t) {
    return mustReplace(t, /`OPEN-FINDINGS\.md` \(R3\)/, "(R3)", "renvoi R3");
  })]);

/* ----- D-A / DOC-11 — hypotheses declarees : comptees, pas recopiees ----- */
function readmeAssumptionCount(docs) {
  const README = docs["README.md"] || "";
  return (README.match(/^## Hypothèses déclarées[\s\S]*?(?=^## )/m) || [""])[0]
    .split("\n").filter(function (l) { return /^\d+\. /.test(l); }).length;
}
detector("DOC-11", "le nombre d'hypotheses declarees est compte dans README et identique partout",
  function (docs) {
    const reel = readmeAssumptionCount(docs);
    const hits = [];
    if (reel === 0) return ["README.md : aucune hypothese numerotee sous « Hypothèses déclarées »"];
    let man = null;
    try { man = JSON.parse(docs["MANIFEST.json"] || "null"); } catch (e) { hits.push("MANIFEST.json illisible"); }
    if (man && (man.declaredAssumptions || []).length !== reel) {
      hits.push("MANIFEST.declaredAssumptions = " + (man.declaredAssumptions || []).length + " ; README = " + reel);
    }
    Object.keys(docs).forEach(function (f) {
      blocksOf(f, docs[f]).forEach(function (b) {
        if (b.kind === "code") return;
        sentencesOf(b).forEach(function (sent) {
          const re = /\b(une|deux|trois|quatre|cinq|six|sept|\d+)(?:\*\*|\*|_)?\s+hypoth[eè]ses/gi;
          let m;
          while ((m = re.exec(sent)) !== null) {
            if (isCitedBefore(b, sent, m.index)) continue;
            const n = numOf(m[1]);
            if (n !== reel) hits.push(f + ":" + b.line + " annonce « " + m[1] + " hypothèses » ; README en compte " + reel);
          }
        });
      });
    });
    return hits;
  },
  [
    mut("governance/README.md : « six hypothèses » devient « cinq hypothèses »", "governance/README.md", function (t) {
      return mustReplace(t, /six hypothèses déclarées/, "cinq hypothèses déclarées", "six hypotheses");
    }),
    mut("MANIFEST.json : une hypothese est retiree de declaredAssumptions", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); man.declaredAssumptions.pop(); return JSON.stringify(man, null, 2);
    }),
    mut("governance/README.md : « six hypothèses » devient « **cinq** hypothèses » (chiffre en gras)", "governance/README.md", function (t) {
      return mustReplace(t, /six hypothèses déclarées/, "**cinq** hypothèses déclarées", "six hypotheses");
    }),
  ]);

/* ----- D-B / DOC-12 — nombre de champs non attestes : derive, pas recopie ----- */
detector("DOC-12", "le nombre de champs non attestes annonce est partout egal au nombre derive de l'enumeration canonique",
  function (docs) {
    const canon = canonicalFields(docs);
    if (!canon || !canon.length) return ["source canonique absente"];
    const reel = canon.length;
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      blocksOf(f, docs[f]).forEach(function (b) {
        if (b.kind === "code") return;
        sentencesOf(b).forEach(function (sent) {
          const re = /\b(cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|\d+)(?:\*\*|\*|_)?\s+champs?\b/gi;
          let m;
          while ((m = re.exec(sent)) !== null) {
            if (!/attest|R3|non recoup|informatif|jamais recoup/i.test(sent) && !/attest|R3|non recoup|informatif/i.test(b.text)) continue;  // autre sujet
            if (isCitedBefore(b, sent, m.index)) continue;
            const n = numOf(m[1]);
            if (n !== reel) hits.push(f + ":" + b.line + " annonce « " + m[1] + " champs » ; l'enumeration canonique en compte " + reel);
          }
        });
      });
    });
    return hits;
  },
  [
    mut("README.md : « douze champs » devient « treize champs »", "README.md", function (t) {
      return mustReplace(t, /Douze champs de l'artefact/, "Treize champs de l'artefact", "douze champs");
    }),
    mut("MANIFEST.json : le titre de R3 annonce treize champs", "MANIFEST.json", function (t) {
      return mustReplace(t, /"douze champs informatifs non attestes/, "\"treize champs informatifs non attestes", "titre R3");
    }),
    mut("OPEN-FINDINGS.md R3 : « Les **douze** champs » devient « Les **treize** champs » (chiffre en gras)", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /Les \*\*douze\*\* champs suivants/, "Les **treize** champs suivants", "douze champs en gras");
    }),
  ]);

/* ----- D-C / DOC-13 — les commandes imprimees reproduisent le resultat imprime ----- */
/**
 * Convention documentaire : un bloc de code contenant une commande rejouable
 * est suivi, DANS LE MEME BLOC, d'une ligne `# attendu : ...`. Le detecteur
 * execute la commande (en memoire, lecture seule) et compare.
 *   - `node tools/seal-inventory.js <racine> LOTS` -> inventaire ;
 *   - `node tools/seal-inventory.js <racine>`      -> total tous sceaux ;
 *   - boucle `for prev in ...` de diff d'identite   -> nombre de comparaisons, toutes vides.
 */
function printedCommands(docs) {
  const out = [];
  Object.keys(docs).forEach(function (f) {
    if (isJson(f)) return;
    const lines = docs[f].split("\n");
    let fence = false, buf = [], start = 0;
    lines.forEach(function (l, i) {
      if (/^```/.test(l)) {
        if (fence) { out.push({ file: f, line: start, code: buf.join("\n") }); buf = []; }
        fence = !fence; start = i + 2; return;
      }
      if (fence) buf.push(l);
    });
  });
  return out.filter(function (c) { return /# attendu/.test(c.code); });
}
function replayCommand(cmd) {
  const attendu = (cmd.code.match(/# attendu\s*:\s*([^\n]+)/) || [])[1] || "";
  const expect = {};
  attendu.split(";").forEach(function (kv) {
    const m = kv.match(/\s*([A-Z_]+|comparaisons)\s*=\s*(\d+)/);
    if (m) expect[m[1]] = parseInt(m[2], 10);
  });
  const si = cmd.code.match(/node tools\/seal-inventory\.js\s+<[^>]+>\s*([^\s#]*)/);
  if (si) {
    if (!fs.existsSync(path.join(BUNDLE, "MONO-10"))) return { skipped: "paquet non joignable" };
    const SI = require(path.join(LOT, "tools", "seal-inventory.js"));
    const inv = SI.inventory(BUNDLE, si[1] ? si[1].split(",") : null);
    const got = {
      SEALED_HISTORICAL_LOTS_COUNT: inv.sealedHistoricalLots, SEALED_REFERENCES_COUNT: inv.sealedReferences,
      SEALED_DIVERGENCES: inv.sealedDivergences, UNVERIFIABLE_HISTORICAL_LOTS: inv.unverifiableHistoricalLots.length,
      ALL_SEALS_FILE_COUNT: inv.sealFiles, ALL_SEALS_REFERENCE_COUNT: inv.allSeals.references, ALL_SEALS_DIVERGENCES: inv.allSeals.divergences,
    };
    return { expect: expect, got: got };
  }
  /** v0.15 (B2) — commande de fenetre de construction : mtime minimal des
   *  fichiers du lot, hors zip, arrondi a la seconde paire superieure. */
  if (/stat -f %m|stat -c %Y/.test(cmd.code) && /BUILD_WINDOW_OPENED/.test(attendu)) {
    return { expect: expect, got: { BUILD_WINDOW_OPENED: buildWindowOnDisk(LOT) } };
  }
  const loop = cmd.code.match(/for prev in ([^;]+); do/);
  if (loop) {
    const lots = loop[1].trim().split(/\s+/);
    const dirs = ((cmd.code.match(/for d in ([^;]+); do/) || ["", ""])[1]).trim().split(/\s+/).filter(Boolean);
    const files = ((cmd.code.match(/for f in ([\s\S]*?); do/) || ["", ""])[1]).replace(/\\\n/g, " ").trim().split(/\s+/).filter(Boolean);
    const target = (cmd.code.match(/diff -r \$prev\/\$d (v0\.\d+)\/\$d/) || [])[1];
    const missing = lots.filter(function (l) { return !fs.existsSync(path.resolve(LOT, "..", l)) || !fs.existsSync(path.resolve(LOT, "..", l, "core")); });
    if (missing.length) return { skipped: "lots non joignables : " + missing.join(", ") };
    if (!target || target !== VERSION_TAG) return { expect: expect, got: { comparaisons: -1, note: "cible " + target + " ≠ " + VERSION_TAG } };
    let n = 0, nonVides = [];
    lots.forEach(function (l) {
      const prev = path.resolve(LOT, "..", l);
      dirs.concat(files).forEach(function (rel) { n++; if (digestOf(LOT, rel) !== digestOf(prev, rel)) nonVides.push(l + "/" + rel); });
    });
    return { expect: expect, got: { comparaisons: n, VIDES: n - nonVides.length }, nonVides: nonVides };
  }
  return { expect: expect, got: {}, note: "commande non reconnue" };
}
detector("DOC-13", "chaque commande imprimee avec un « # attendu » reproduit exactement le resultat imprime",
  function (docs) {
    const cmds = printedCommands(docs);
    if (cmds.length === 0) return ["aucune commande rejouable trouvee (aucun bloc avec « # attendu »)"];
    const hits = [];
    cmds.forEach(function (c) {
      const r = replayCommand(c);
      if (r.skipped) { hits.push("SKIP:" + c.file + ":" + c.line + " " + r.skipped); return; }
      if (!Object.keys(r.expect).length) { hits.push(c.file + ":" + c.line + " :: « # attendu » illisible"); return; }
      Object.keys(r.expect).forEach(function (k) {
        if (r.got[k] !== r.expect[k]) hits.push(c.file + ":" + c.line + " :: " + k + " attendu " + r.expect[k] + ", mesure " + r.got[k]);
      });
      if (r.nonVides && r.nonVides.length) hits.push(c.file + ":" + c.line + " :: comparaisons non vides " + JSON.stringify(r.nonVides));
    });
    return hits;
  },
  [
    mut("NON-REGRESSION.md : le chiffre attendu du cadre v0.11 est altere (24 -> 26)", "NON-REGRESSION.md", function (t) {
      return mustReplace(t, /(MONO-10\/v0\.11,MONO-10\/v0\.12,MONO-10\/v0\.13,MONO-10\/v0\.14,MONO-10\/v0\.15,MONO-10\/v0\.16,MONO-10\/v0\.17,MONO-10\/v0\.18\n# attendu : SEALED_HISTORICAL_LOTS_COUNT = )24/, "$126", "attendu cadre v0.11");
    }),
    mut("NON-REGRESSION.md : la commande imprimee du cadre v0.11 n'exclut plus que v0.11 (chiffre inchange)", "NON-REGRESSION.md", function (t) {
      return mustReplace(t, /node tools\/seal-inventory\.js <racine> MONO-10\/v0\.11,MONO-10\/v0\.12,MONO-10\/v0\.13,MONO-10\/v0\.14,MONO-10\/v0\.15,MONO-10\/v0\.16,MONO-10\/v0\.17,MONO-10\/v0\.18\n/, "node tools/seal-inventory.js <racine> MONO-10/v0.11\n", "commande cadre v0.11");
    }),
    mut("NON-REGRESSION.md §7 : le BUILD_WINDOW_OPENED attendu est decale d'une seconde", "NON-REGRESSION.md", function (t) {
      return t.replace(/# attendu : BUILD_WINDOW_OPENED = (\d+)/, function (_, n) { return "# attendu : BUILD_WINDOW_OPENED = " + (parseInt(n, 10) + 1); });
    }),
  ]);

/* ----- B2 / DOC-20 — fenetre de construction : derivee, jamais saisie ----- */
/**
 * METHODE CANONIQUE (NON-REGRESSION.md §7) : buildWindowOpened = mtime UNIX
 * minimal de tous les fichiers du lot (hors zip de livraison), ARRONDI A LA
 * SECONDE PAIRE SUPERIEURE — granularite du format zip, pour que l'arbre source
 * et toute extraction du zip donnent la MEME valeur. Le MANIFEST porte le
 * mtime de chaque fichier (files[].mtime) : la valeur se re-derive du MANIFEST
 * seul, et se re-mesure sur disque quand les mtimes y sont d'origine.
 */
const ceilEven = function (t) { return t + (t % 2); };
function buildWindowOnDisk(lot) {
  let min = Infinity;
  (function w(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") w(p); return; }
      if (/\.zip$/.test(e.name) || e.name === ".DS_Store") return;
      const m = Math.floor(fs.statSync(p).mtimeMs / 1000);
      if (m < min) min = m;
    });
  })(lot);
  return ceilEven(min);
}
detector("DOC-20", "MANIFEST.sealInventory.v018BuildWindowOpened est derive de la methode canonique et re-mesurable",
  function (docs) {
    let man;
    try { man = JSON.parse(docs["MANIFEST.json"] || ""); } catch (e) { return ["MANIFEST.json illisible"]; }
    const hits = [];
    const declared = (man.sealInventory || {}).v018BuildWindowOpened;
    const unix = typeof declared === "number" ? declared : parseInt(String(declared || "").replace(/.*unix\s*/, ""), 10);
    if (!(unix > 0)) return ["v018BuildWindowOpened absent ou illisible : " + declared];
    const mt = (man.files || []).map(function (x) { return x.mtime; }).filter(function (x) { return typeof x === "number"; });
    if (mt.length !== (man.files || []).length || !mt.length) hits.push("MANIFEST.files ne porte pas un mtime par fichier");
    else if (ceilEven(Math.min.apply(null, mt)) !== unix) hits.push("v018BuildWindowOpened = " + unix + " ; derive de min(files[].mtime) = " + ceilEven(Math.min.apply(null, mt)));
    if (!/seconde paire|ceilEven|arrondi/i.test((man.sealInventory || {}).buildWindowMethod || "")) hits.push("MANIFEST.sealInventory.buildWindowMethod n'enonce pas la methode canonique");
    /** re-mesure sur disque, si les mtimes sont d'origine (a 2 s pres, granularite zip) */
    const original = (man.files || []).every(function (x) {
      const p = path.join(LOT, x.file);
      return fs.existsSync(p) && Math.abs(Math.floor(fs.statSync(p).mtimeMs / 1000) - x.mtime) <= 2;
    });
    if (original) { const disk = buildWindowOnDisk(LOT); if (disk !== unix) hits.push("re-mesure sur disque = " + disk + " ≠ " + unix); }
    else hits.push("INFO:mtimes sur disque non d'origine (copie sans -p ?) : seule la derivation depuis MANIFEST.files est controlee");
    return hits.filter(function (h) { return !/^INFO:/.test(h); });
  },
  [
    mut("MANIFEST.json : v018BuildWindowOpened est decale d'une seconde", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); man.sealInventory.v018BuildWindowOpened = man.sealInventory.v018BuildWindowOpened + 1; return JSON.stringify(man, null, 2);
    }),
    mut("MANIFEST.json : la methode canonique n'est plus enoncee", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); man.sealInventory.buildWindowMethod = "valeur saisie"; return JSON.stringify(man, null, 2);
    }),
  ]);

/* ----- DOC-21 — sections « Mesures » d'un registre multi-versions versionnees ----- */
detector("DOC-21", "toute section « Mesures » d'un document couvrant plusieurs versions nomme sa version",
  function (docs) {
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      if (isJson(f) || f === CHARTE) return;
      const h1 = (docs[f].match(/^# .*$/m) || [""])[0];
      const multi = /v0\.\d+\s*(à|a|\.\.|→|->)\s*v0\.\d+|plusieurs versions|registre/i.test(h1);
      if (!multi) return;
      docs[f].split("\n").forEach(function (l, i) {
        if (/^#{1,6}\s.*\bMesures?\b/i.test(l) && !/v0\.\d+|historique/i.test(l)) hits.push(f + ":" + (i + 1) + " :: section « " + l.replace(/^#+\s*/, "") + " » sans version dans un registre multi-versions");
      });
    });
    return hits;
  },
  [mut("AUDIT-REMEDIATION-MATRIX.md : « Mesures historiques v0.9 » redevient « Mesures »", "AUDIT-REMEDIATION-MATRIX.md", function (t) {
    return mustReplace(t, /## 4\. Mesures historiques v0\.9[^\n]*/, "## 4. Mesures", "heading Mesures historiques");
  })]);

/* ----- B2 (v0.16) / DOC-22 — registre multi-versions : aucune ligne posterieure a son heading ----- */
/**
 * Dans un document dont le H1 couvre plusieurs versions (registre), chaque
 * section porte une version maximale : celle du heading, ou celle de la colonne
 * « Statut en v0.NN » de son tableau. Une ligne qui y decrit une correction
 * (« corrige », « ferme », « ajoute ») d'une version POSTERIEURE est une
 * affirmation perimee presentee sous un titre qui ne la couvre pas.
 */
detector("DOC-22", "dans un registre multi-versions, aucune ligne ne decrit une correction d'une version posterieure a son heading / sa colonne de statut",
  function (docs) {
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      if (isJson(f) || f === CHARTE) return;
      const h1 = (docs[f].match(/^# .*$/m) || [""])[0];
      if (!/v0\.\d+\s*(à|a|\.\.|→|->)\s*v0\.\d+|plusieurs versions|registre/i.test(h1)) return;
      let secMax = null, colMax = null, fence = false;
      docs[f].split("\n").forEach(function (l, i) {
        if (/^```/.test(l)) { fence = !fence; return; }
        if (fence) return;
        if (/^#{1,6}\s/.test(l)) {
          const vs = (l.match(/v0\.(\d+)/g) || []).map(function (v) { return parseInt(v.slice(3), 10); });
          secMax = vs.length ? Math.max.apply(null, vs) : null; colMax = null; return;
        }
        if (/^\s*\|/.test(l)) {
          const col = l.match(/Statut (?:en|atteint en) v0\.(\d+)/i);
          if (col && /^\|[^|]*\|[^|]*\|/.test(l) && /---/.test((docs[f].split("\n")[i + 1] || ""))) { colMax = parseInt(col[1], 10); return; }
          if (/^\|\s*-+/.test(l)) return;
          /** v0.17 — bornes du HEADING et de la COLONNE verifiees separement :
           *  une colonne juste ne blanchit pas un heading faux, et inversement. */
          const caps = [];
          if (secMax !== null) caps.push(["heading", secMax]);
          if (colMax !== null) caps.push(["colonne de statut", colMax]);
          if (!caps.length) return;
          const later = (l.match(/(?:corrig[eé]e?s?|ferm[eé]e?s?|ajout[eé]e?s?|clos)[^|]{0,40}?en v0\.(\d+)|v0\.(\d+)[^|]{0,15}?(?:corrige|ferme|ajoute)/gi) || []);
          const audit = l.match(/audit final de v0\.(\d+)/i);
          caps.forEach(function (c) {
            later.forEach(function (m) {
              const n = parseInt((m.match(/v0\.(\d+)/) || [])[1], 10);
              if (n > c[1]) hits.push(f + ":" + (i + 1) + " :: ligne decrivant une correction de v0." + n + " sous un " + c[0] + " limite a v0." + c[1]);
            });
            /** un constat « etabli par l'audit final de v0.NN » ne peut etre corrige qu'en v0.NN+1 au plus tot */
            if (audit && parseInt(audit[1], 10) + 1 > c[1]) hits.push(f + ":" + (i + 1) + " :: constat de l'audit final de v0." + audit[1] + " (corrige au plus tot en v0." + (parseInt(audit[1], 10) + 1) + ") sous un " + c[0] + " limite a v0." + c[1]);
          });
        }
      });
    });
    return hits;
  },
  [
    mut("AUDIT-REMEDIATION-MATRIX.md §11 : la colonne « Statut en v0.18 » redevient « Statut en v0.15 » au-dessus de lignes corrigees en v0.16 / v0.17 / v0.18", "AUDIT-REMEDIATION-MATRIX.md", function (t) {
      return mustReplace(t, /\| Statut en v0\.18 \|/, "| Statut en v0.15 |", "colonne Statut en v0.18");
    }),
    mut("AUDIT-REMEDIATION-MATRIX.md §11 : le HEADING « v0.15 à v0.18 » redevient « v0.14 et v0.15 », la colonne « Statut en v0.18 » restant juste", "AUDIT-REMEDIATION-MATRIX.md", function (t) {
      return mustReplace(t, /^## 11\. v0\.15 à v0\.18 — /m, "## 11. v0.14 et v0.15 — ", "heading §11");
    }),
    mut("AUDIT-REMEDIATION-MATRIX.md : la ligne de l'audit v0.15 (corrigee en v0.16) est recollee sous le §10 « v0.13 et v0.14 » (faute B2 de v0.15)", "AUDIT-REMEDIATION-MATRIX.md", function (t) {
      const row = t.match(/^\| B1 \(v0\.15\)[^\n]*\n/m);
      if (!row) throw new Error("ligne B1 (v0.15) introuvable");
      const sans = t.replace(row[0], "");
      return mustReplace(sans, /(\| D-A à D-D : détecteurs manquants[^\n]*\n)/, "$1" + row[0], "ligne D-A a D-D du §10");
    }),
  ]);

/* ----- DOC-23 — statut de CHAQUE reserve, individuellement ----- */
detector("DOC-23", "le tableau de statut de OPEN-FINDINGS porte, pour chacune de R1..R5, OPEN / NON_BLOCKING / NOT_FIXED_IN_V018",
  function (docs) {
    const of = docs["OPEN-FINDINGS.md"] || "";
    const cur = VERSION_TAG.replace(/^v0\./, "");
    const hits = [];
    ["R1", "R2", "R3", "R4", "R5"].forEach(function (r) {
      const row = (of.match(new RegExp("^\\|\\s*\\*\\*" + r + "\\*\\*[^\\n]*$", "m")) || [])[0];
      if (!row) { hits.push("OPEN-FINDINGS.md : aucune ligne de statut pour " + r); return; }
      if (!/`OPEN`/.test(row)) hits.push("OPEN-FINDINGS.md : " + r + " n'est pas `OPEN`");
      if (!/`NON_BLOCKING`/.test(row)) hits.push("OPEN-FINDINGS.md : " + r + " n'est pas `NON_BLOCKING`");
      if (!new RegExp("`NOT_FIXED_IN_V0" + cur + "`").test(row)) hits.push("OPEN-FINDINGS.md : " + r + " n'est pas `NOT_FIXED_IN_V0" + cur + "`");
      const h = of.match(new RegExp("^## " + r + " — [^\\n]*$", "m"));
      if (!h) hits.push("OPEN-FINDINGS.md : section ## " + r + " absente");
    });
    return hits;
  },
  [mut("OPEN-FINDINGS.md : la ligne R5 passe a CLOSED / FIXED_IN_V016, les quatre autres inchangees", "OPEN-FINDINGS.md", function (t) {
    return mustReplace(t, /(^\|\s*\*\*R5\*\*[^\n]*?)`OPEN`([^\n]*?)`NOT_FIXED_IN_V018`/m, "$1`CLOSED`$2`FIXED_IN_V018`", "ligne R5");
  })]);

/* ----- B1/B3 (v0.17) / DOC-24 — verite d'origine documentaire ----- */
/**
 * Un document dont le H1 ne porte pas la version courante est un document A
 * TITRE D'ORIGINE. Il doit etre DECLARE dans MANIFEST.originTitledDocuments avec :
 *   - h1Version                  : la version que son titre affiche ;
 *   - conceptualOriginVersion    : le lot qui l'a concu (== h1Version) ;
 *   - currentContentOriginVersion: le PREMIER lot scelle ou son contenu courant
 *                                  apparait a l'identique, octet pour octet ;
 *   - originPath, currentSha256, originSha256, byteIdentical.
 * Regles :
 *   1. originSha256 == empreinte courante du fichier, byteIdentical == "YES" ;
 *   2. h1Version == conceptualOriginVersion ;
 *   3. si conceptual != currentContent, la distinction est explicite (note) —
 *      v0.7 ne peut pas etre presente comme origine du CONTENU de v0.10 ;
 *   4. (lots joignables) le fichier est byte-identique a LOT_NOMME/originPath,
 *      ET ce lot est bien le PREMIER ou il l'est (le lot precedent differe) ;
 *      v0.11 n'est jamais un substitut du lot nomme.
 * Tout autre H1 non courant est perime.
 */
function measureFirstIdentical(rel, buf) {
  const names = sortedLotNames();
  for (let i = 0; i < names.length; i++) {
    const p = path.join(LOTS[names[i]], rel);
    if (fs.existsSync(p) && fs.readFileSync(p).equals(buf)) return names[i];
  }
  return null;
}
detector("DOC-24", "chaque document a titre d'origine declare une origine de CONTENU vraie (empreintes, lot nomme, premier lot identique) ; aucun autre H1 n'est perime",
  function (docs) {
    let man = null;
    try { man = JSON.parse(docs["MANIFEST.json"] || "null"); } catch (e) { return ["MANIFEST.json illisible"]; }
    const origin = (man && man.originTitledDocuments) || null;
    if (!origin || Array.isArray(origin)) return ["MANIFEST.originTitledDocuments absent ou mal forme"];
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      if (isJson(f) || f === CHARTE) return;
      const h1 = (docs[f].match(/^# MONO-10 (v0\.\d+)\b/m) || [])[1];
      if (!h1) return;
      if (h1 === VERSION_TAG) { if (origin[f]) hits.push(f + " : porte la version courante mais est declare a titre d'origine"); return; }
      const e = origin[f];
      if (!e) { hits.push(f + ":1 :: titre « " + h1 + " » perime : document non declare a titre d'origine"); return; }
      if (e.h1Version !== h1) hits.push(f + " : h1Version declare " + e.h1Version + ", H1 reel " + h1);
      if (e.conceptualOriginVersion !== h1) hits.push(f + " : H1 « " + h1 + " » ≠ conceptualOriginVersion " + e.conceptualOriginVersion);
      if (!/^v0\.\d+$/.test(e.currentContentOriginVersion || "")) hits.push(f + " : currentContentOriginVersion absent");
      if (e.conceptualOriginVersion !== e.currentContentOriginVersion && !/contenu|content/i.test(e.note || "")) {
        hits.push(f + " : origine conceptuelle " + e.conceptualOriginVersion + " ≠ origine de contenu " + e.currentContentOriginVersion + " sans note explicite");
      }
      const cur = sha256Of(Buffer.from(docs[f], "utf8"));
      if (e.currentSha256 !== cur) hits.push(f + " : currentSha256 declare ≠ empreinte du fichier livre");
      if (e.originSha256 !== cur) hits.push(f + " : originSha256 (" + String(e.originSha256).slice(0, 12) + "…) ≠ empreinte courante : le contenu n'est PAS celui du lot d'origine declare");
      if (e.byteIdentical !== "YES") hits.push(f + " : byteIdentical ≠ YES");
      if (e.originPath !== f) hits.push(f + " : originPath " + e.originPath + " ≠ chemin courant");
      /** v0.18 — premiere apparition declaree == documentHistory, et la table de provenance
       *  de NON-REGRESSION.md §8 porte, pour ce fichier, les memes trois versions. */
      const hist = (man.documentHistory || {})[f];
      if (!e.firstAppearedIn) hits.push(f + " : firstAppearedIn absent de l'entree");
      else if (hist && hist.firstAppearedIn !== e.firstAppearedIn) hits.push(f + " : firstAppearedIn " + e.firstAppearedIn + " ≠ documentHistory " + hist.firstAppearedIn);
      const row = ((docs["NON-REGRESSION.md"] || "").split("\n").filter(function (l) { return /^\|/.test(l) && l.indexOf("`" + f + "`") !== -1 && (l.match(/\|/g) || []).length >= 5; }) || [])[0];
      if (!row) hits.push("NON-REGRESSION.md §8 : aucune ligne de provenance pour " + f);
      else {
        const cells = row.split("|").map(function (c) { return c.trim(); });
        const cellHas = function (i, v) { return cells[i] && (cells[i].indexOf(v) !== -1); };
        if (!cellHas(2, e.conceptualOriginVersion)) hits.push("NON-REGRESSION.md §8 : " + f + " colonne H1 ≠ " + e.conceptualOriginVersion);
        if (!cellHas(3, e.firstAppearedIn)) hits.push("NON-REGRESSION.md §8 : " + f + " colonne premiere apparition ≠ " + e.firstAppearedIn);
        if (!cellHas(4, e.currentContentOriginVersion)) hits.push("NON-REGRESSION.md §8 : " + f + " colonne origine de contenu ≠ " + e.currentContentOriginVersion);
      }
      /** lots joignables : comparaison contre le LOT NOMME, et premier lot identique re-mesure */
      if (!LOTS_REACHABLE) { hits.push("SKIP:" + f + " lots historiques non joignables — comparaison au lot nomme non faite"); return; }
      const lotDir = LOTS[e.currentContentOriginVersion];
      const buf = Buffer.from(docs[f], "utf8");
      if (!lotDir) { hits.push(f + " : lot d'origine declare " + e.currentContentOriginVersion + " non joignable"); return; }
      const op = path.join(lotDir, e.originPath || f);
      if (!fs.existsSync(op)) hits.push(f + " : " + e.currentContentOriginVersion + "/" + (e.originPath || f) + " n'existe pas");
      else if (!fs.readFileSync(op).equals(buf)) hits.push(f + " : NON byte-identique a " + e.currentContentOriginVersion + "/" + (e.originPath || f) + " (empreinte " + sha256Of(fs.readFileSync(op)).slice(0, 12) + "…)");
      const first = measureFirstIdentical(f, buf);
      if (first !== e.currentContentOriginVersion) hits.push(f + " : premier lot byte-identique mesure = " + first + ", declare = " + e.currentContentOriginVersion);
    });
    return hits;
  },
  [
    /** A — contenu byte-identique a v0.10, MANIFEST dit v0.7 (necessite les lots) */
    mut("MANIFEST.json : HISTORICAL-INPUT-AUTHORITY.md, currentContentOriginVersion v0.10 -> v0.7 (contenu byte-identique a v0.10)", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); man.originTitledDocuments["HISTORICAL-INPUT-AUTHORITY.md"].currentContentOriginVersion = "v0.7"; return JSON.stringify(man, null, 2);
    }, true),
    /** B — H1 v0.7 presente comme origine courante : la distinction conceptuel / contenu disparait */
    mut("MANIFEST.json : LINEAGE.md, la distinction disparait (conceptual = currentContent = v0.7, note retiree)", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); const e = man.originTitledDocuments["LINEAGE.md"]; e.currentContentOriginVersion = "v0.7"; delete e.note; return JSON.stringify(man, null, 2);
    }, true),
    mut("MANIFEST.json : LINEAGE.md, note explicative retiree (origine conceptuelle ≠ origine de contenu sans explication)", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); delete man.originTitledDocuments["LINEAGE.md"].note; return JSON.stringify(man, null, 2);
    }),
    /** D — currentContentOriginVersion juste, empreinte d'origine fausse */
    mut("MANIFEST.json : LINEAGE.md, originSha256 altere", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); const e = man.originTitledDocuments["LINEAGE.md"]; e.originSha256 = e.originSha256.replace(/^./, e.originSha256[0] === "0" ? "1" : "0"); return JSON.stringify(man, null, 2);
    }),
    mut("MANIFEST.json : ARCHITECTURE.md, currentContentOriginVersion v0.11 -> v0.10 (le lot v0.10 differe)", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); man.originTitledDocuments["ARCHITECTURE.md"].currentContentOriginVersion = "v0.10"; return JSON.stringify(man, null, 2);
    }, true),
    mut("MANIFEST.json : ARCHITECTURE.md, currentContentOriginVersion v0.11 -> v0.12 (identique, mais pas le PREMIER lot identique)", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); man.originTitledDocuments["ARCHITECTURE.md"].currentContentOriginVersion = "v0.12"; return JSON.stringify(man, null, 2);
    }, true),
    mut("ARCHITECTURE.md : le H1 « v0.11 » devient « v0.7 »", "ARCHITECTURE.md", function (t) {
      return mustReplace(t, /^# MONO-10 v0\.11 — architecture/m, "# MONO-10 v0.7 — architecture", "H1 ARCHITECTURE");
    }),
    mut("NON-REGRESSION.md §8 : la premiere apparition de LINEAGE.md redevient « v0.7 » (gloss « conçu en v0.7 » de v0.17)", "NON-REGRESSION.md", function (t) {
      return mustReplace(t, /(\| `LINEAGE\.md` \|[^|]*\|) \*\*v0\.1\*\* — le fichier existe depuis le premier lot \|/, "$1 v0.7 — conçu en v0.7 |", "ligne LINEAGE de la table de provenance");
    }),
    mut("README.md : le H1 redevient « MONO-10 v0.17 »", "README.md", function (t) {
      return mustReplace(t, /^# MONO-10 v0\.18/m, "# MONO-10 v0.17", "H1 README");
    }),
  ]);

/* ----- DOC-27 (v0.17) — historique de modification de chaque document, MESURE ----- */
/**
 * MANIFEST.documentHistory[file] = { firstAppearedIn, changedIn: [...] } : les
 * lots ou le document est apparu puis a change, mesures par le constructeur sur
 * les lots scelles. Re-mesure ici quand les lots sont joignables. Aucun H1 ne
 * porte plus de parenthese « (contenu de vX, corrige en vY) » ecrite a la main :
 * c'est cette convention qui etait fausse pour deux documents (audit de v0.16).
 */
function measureHistory(rel, curBuf) {
  const names = sortedLotNames();
  let first = null, prev = null; const changed = [];
  names.forEach(function (n) {
    const p = path.join(LOTS[n], rel);
    if (!fs.existsSync(p)) return;
    const b = fs.readFileSync(p);
    if (first === null) first = n;
    else if (!b.equals(prev)) changed.push(n);
    prev = b;
  });
  if (first === null) first = VERSION_TAG;
  else if (!prev.equals(curBuf)) changed.push(VERSION_TAG);
  return { firstAppearedIn: first, changedIn: changed };
}
detector("DOC-27", "MANIFEST.documentHistory est present pour chaque .md du lot et egale l'historique re-mesure sur les lots ; aucun H1 ne porte de parenthese de version ecrite a la main",
  function (docs) {
    let man = null;
    try { man = JSON.parse(docs["MANIFEST.json"] || "null"); } catch (e) { return ["MANIFEST.json illisible"]; }
    const hist = (man && man.documentHistory) || null;
    if (!hist) return ["MANIFEST.documentHistory absent"];
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      if (isJson(f) || f === CHARTE) return;
      if (/^# MONO-10 [^\n]*\((?:contenu de|corrig[eé] en)[^\n]*\)/m.test(docs[f])) hits.push(f + ":1 :: parenthese de version ecrite a la main dans le H1 — l'historique est dans MANIFEST.documentHistory");
      if (!hist[f]) { hits.push(f + " : absent de MANIFEST.documentHistory"); return; }
      if (!LOTS_REACHABLE) { hits.push("SKIP:" + f + " lots non joignables — historique non re-mesure"); return; }
      const m = measureHistory(f, Buffer.from(docs[f], "utf8"));
      if (m.firstAppearedIn !== hist[f].firstAppearedIn) hits.push(f + " : firstAppearedIn declare " + hist[f].firstAppearedIn + ", mesure " + m.firstAppearedIn);
      if (JSON.stringify(m.changedIn) !== JSON.stringify(hist[f].changedIn)) hits.push(f + " : changedIn declare " + JSON.stringify(hist[f].changedIn) + ", mesure " + JSON.stringify(m.changedIn));
    });
    return hits;
  },
  [
    mut("MANIFEST.json : documentHistory de TRUST-MODEL.md perd v0.13", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); man.documentHistory["TRUST-MODEL.md"].changedIn = man.documentHistory["TRUST-MODEL.md"].changedIn.filter(function (v) { return v !== "v0.13"; }); return JSON.stringify(man, null, 2);
    }, true),
    mut("TRUST-MODEL.md : le H1 reprend une parenthese « (contenu de v0.12, corrigé en v0.14) »", "TRUST-MODEL.md", function (t) {
      return mustReplace(t, /^# MONO-10 v0\.18 — modèle de confiance/m, "# MONO-10 v0.18 — modèle de confiance (contenu de v0.12, corrigé en v0.14)", "H1 TRUST-MODEL");
    }),
  ]);

/* ----- DOC-25 — sujet de decision : champs et dimensions DERIVES du code ----- */
/**
 * Deux objets distincts, tous deux mesures dans core/operator-llm-capability-boundary.js :
 *   - SUBJECT_FIELDS : les champs inscrits par la sonde dans le sujet enregistre
 *     (six), auxquels la certification ajoute artifactId et artifactHash (huit) ;
 *   - REQUIRED : les dimensions qu'exige verifyDecision (sept), plus executionMode
 *     obligatoire ; requestId n'est compare que si l'appelant le presente.
 * Les documents doivent enumerer ces listes telles quelles et annoncer ces nombres.
 */
function subjectFromCode() {
  const p = path.join(LOT, "core", "operator-llm-capability-boundary.js");
  if (!fs.existsSync(p)) return null;
  const src = fs.readFileSync(p, "utf8");
  const sf = (src.match(/const SUBJECT_FIELDS = \[([^\]]*)\]/) || [])[1];
  const rq = (src.match(/const REQUIRED = \[([^\]]*)\]/) || [])[1];
  if (!sf || !rq) return null;
  const list = function (x) { return x.split(",").map(function (v) { return v.trim().replace(/^"|"$/g, ""); }).filter(Boolean); };
  return { subjectFields: list(sf), required: list(rq) };
}
detector("DOC-25", "champs du sujet enregistre et dimensions exigees par verifyDecision : enumerations et nombres derives du code",
  function (docs) {
    const c = subjectFromCode();
    if (!c) return ["core/operator-llm-capability-boundary.js : SUBJECT_FIELDS ou REQUIRED introuvables"];
    const hits = [];
    const NUM = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];
    const r1 = ((docs["OPEN-FINDINGS.md"] || "").match(/^## R1[\s\S]*?(?=^## R2)/m) || [""])[0];
    /** v0.17 — ENSEMBLES, pas mots-cles : l'enumeration qui precede « (`SUBJECT_FIELDS`) »
     *  et celle qui suit « (`REQUIRED` : » sont lues comme des listes et comparees exactement. */
    const listBefore = function (text, marker) {
      const i = text.indexOf(marker); if (i === -1) return null;
      const seg = text.slice(Math.max(0, i - 400), i);
      const tail = seg.slice(seg.lastIndexOf("—") + 1);
      return (tail.match(/`([A-Za-z]+)`/g) || []).map(function (x) { return x.replace(/`/g, ""); });
    };
    const listAfter = function (text, marker) {
      const i = text.indexOf(marker); if (i === -1) return null;
      const seg = text.slice(i + marker.length, i + marker.length + 300).split(")")[0];
      return (seg.match(/`([A-Za-z]+)`/g) || []).map(function (x) { return x.replace(/`/g, ""); });
    };
    const same = function (a, b) { return a && b && a.length === b.length && a.slice().sort().join() === b.slice().sort().join(); };
    const sfDoc = listBefore(r1, "(`SUBJECT_FIELDS`)");
    if (!same(sfDoc, c.subjectFields)) hits.push("OPEN-FINDINGS.md R1 : enumeration SUBJECT_FIELDS " + JSON.stringify(sfDoc) + " ≠ code " + JSON.stringify(c.subjectFields));
    const rqDoc = listAfter(r1, "(`REQUIRED` :");
    if (!same(rqDoc, c.required)) hits.push("OPEN-FINDINGS.md R1 : enumeration REQUIRED " + JSON.stringify(rqDoc) + " ≠ code " + JSON.stringify(c.required));
    /** v0.18 — executionMode exige aussi dans R1, et RIEN d'autre apres « plus executionMode »
     *  (une dimension fantome ajoutee la serait une sur-promesse) ; requestId reste
     *  mentionne comme compare seulement s'il est presente. */
    const tailOf = function (text, marker) { const i = text.indexOf(marker); return i === -1 ? null : text.slice(i + marker.length).split(/[.;]/)[0]; };
    const r1tail = tailOf(r1.replace(/\n/g, " "), "plus `executionMode`");
    if (r1tail === null) hits.push("OPEN-FINDINGS.md R1 : « plus `executionMode` » absent apres l'enumeration REQUIRED");
    else { const ghost = (r1tail.match(/`([A-Za-z]+)`/g) || []).map(function (x) { return x.replace(/`/g, ""); }).filter(function (x) { return x !== "requestId"; }); if (ghost.length) hits.push("OPEN-FINDINGS.md R1 : dimension(s) ajoutee(s) apres executionMode, absentes du code : " + ghost.join(", ")); }
    if (!new RegExp("\\b" + NUM[c.subjectFields.length] + " champs").test(r1)) hits.push("OPEN-FINDINGS.md R1 n'annonce pas « " + NUM[c.subjectFields.length] + " champs » (SUBJECT_FIELDS)");
    if (!new RegExp("\\b" + NUM[c.subjectFields.length + 2] + " champs").test(r1)) hits.push("OPEN-FINDINGS.md R1 n'annonce pas « " + NUM[c.subjectFields.length + 2] + " champs » (sujet enregistre, artifactId et artifactHash compris)");
    if (!new RegExp("\\b" + NUM[c.required.length] + " dimensions").test(r1)) hits.push("OPEN-FINDINGS.md R1 n'annonce pas « " + NUM[c.required.length] + " dimensions » (REQUIRED)");
    const lb = docs["LLM-CAPABILITY-BOUNDARY.md"] || "";
    const sec = (lb.match(/### Vérification du sujet complet[\s\S]*?(?=^###|^## )/m) || [""])[0];
    const rqSec = listBefore(sec, "(`REQUIRED`)");
    if (!same(rqSec, c.required)) hits.push("LLM-CAPABILITY-BOUNDARY.md « Vérification du sujet complet » : enumeration REQUIRED " + JSON.stringify(rqSec) + " ≠ code " + JSON.stringify(c.required));
    if (!/\(`REQUIRED`\)\s*—\s*plus\s+`executionMode`/.test(sec.replace(/\n/g, " "))) hits.push("LLM-CAPABILITY-BOUNDARY.md : « plus `executionMode` » absent apres l'enumeration REQUIRED");
    else { const lbtail = tailOf(sec.replace(/\n/g, " "), "plus `executionMode`"); const ghost = (lbtail.match(/`([A-Za-z]+)`/g) || []).map(function (x) { return x.replace(/`/g, ""); }).filter(function (x) { return x !== "requestId"; }); if (ghost.length) hits.push("LLM-CAPABILITY-BOUNDARY.md : dimension(s) ajoutee(s) apres executionMode, absentes du code : " + ghost.join(", ")); }
    if (!new RegExp("\\b" + NUM[c.required.length] + " dimensions").test(sec)) hits.push("LLM-CAPABILITY-BOUNDARY.md n'annonce pas « " + NUM[c.required.length] + " dimensions »");
    if (!/requestId/.test(sec) || !/(seulement|uniquement) si|que \**si\**|facultati|optionnel/i.test(sec)) hits.push("LLM-CAPABILITY-BOUNDARY.md ne dit pas que requestId n'est compare que s'il est presente");
    return hits;
  },
  [
    mut("LLM-CAPABILITY-BOUNDARY.md : « sept dimensions » devient « six dimensions »", "LLM-CAPABILITY-BOUNDARY.md", function (t) {
      return mustReplace(t, /exige sept dimensions/, "exige six dimensions", "sept dimensions");
    }),
    mut("OPEN-FINDINGS.md R1 : « six champs » devient « sept champs »", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /compte six champs inscrits par la\s+sonde/, "compte sept champs inscrits par la sonde", "six champs");
    }),
    mut("LLM-CAPABILITY-BOUNDARY.md : `artifactHash` retire de l'enumeration REQUIRED (le mot reste ailleurs dans la section)", "LLM-CAPABILITY-BOUNDARY.md", function (t) {
      return mustReplace(t, /`workerBindingId`, `artifactId`, `artifactHash`, `runId`, `missionHash`\n\(`REQUIRED`\)/, "`workerBindingId`, `artifactId`, `runId`, `missionHash`\n(`REQUIRED`)", "enumeration REQUIRED");
    }),
    mut("LLM-CAPABILITY-BOUNDARY.md : « plus `executionMode` » retire", "LLM-CAPABILITY-BOUNDARY.md", function (t) {
      return mustReplace(t, /\(`REQUIRED`\) — plus `executionMode`\./, "(`REQUIRED`).", "plus executionMode");
    }),
    mut("OPEN-FINDINGS.md R1 : `artifactHash` retire de l'enumeration REQUIRED", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /`artifactId`,\n  `artifactHash`, `runId`, `missionHash`\) plus `executionMode`/, "`artifactId`,\n  `runId`, `missionHash`) plus `executionMode`", "enumeration REQUIRED R1");
    }),
    mut("OPEN-FINDINGS.md R1 : « plus `executionMode` » retire", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /`missionHash`\) plus `executionMode` ;/, "`missionHash`) ;", "plus executionMode R1");
    }),
    mut("OPEN-FINDINGS.md R1 : dimension fantome `ghostDimension` ajoutee apres executionMode", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /`missionHash`\) plus `executionMode` ;/, "`missionHash`) plus `executionMode` et `ghostDimension` ;", "plus executionMode R1");
    }),
    mut("LLM-CAPABILITY-BOUNDARY.md : dimension fantome `ghostDimension` ajoutee apres executionMode", "LLM-CAPABILITY-BOUNDARY.md", function (t) {
      return mustReplace(t, /\(`REQUIRED`\) — plus `executionMode`\./, "(`REQUIRED`) — plus `executionMode` et `ghostDimension`.", "plus executionMode");
    }),
    ctl("CONTROLE : ordre de l'enumeration REQUIRED permute dans LLM-CAPABILITY-BOUNDARY -> ne doit PAS mordre", "LLM-CAPABILITY-BOUNDARY.md", function (t) {
      return mustReplace(t, /`providerId`, `modelId`,\n`workerBindingId`, `artifactId`, `artifactHash`, `runId`, `missionHash`\n\(`REQUIRED`\)/, "`missionHash`, `runId`,\n`artifactHash`, `artifactId`, `workerBindingId`, `modelId`, `providerId`\n(`REQUIRED`)", "enumeration REQUIRED");
    }),
  ]);

/* ----- D-D / DOC-14 — structure markdown ----- */
/** Nombre d'items de liste de PREMIER NIVEAU par section (cle : texte du heading). */
function listCountsBySection(text) {
  const out = {};
  let cur = null, fence = false;
  text.split("\n").forEach(function (l) {
    if (/^```/.test(l)) { fence = !fence; return; }
    if (fence) return;
    const h = l.match(/^#{1,6}\s+(.*)$/);
    if (h) { cur = h[1].trim(); if (out[cur] === undefined) out[cur] = 0; return; }
    if (cur !== null && /^([-*]|\d+\.)\s/.test(l)) out[cur]++;
  });
  return out;
}
function markdownStructureFaults(f, text) {
  const lines = text.split("\n");
  const faults = [];
  let fence = false;
  const isList = function (l) { return /^\s*([-*]|\d+\.)\s/.test(l); };
  const isHeading = function (l) { return /^#{1,6}\s/.test(l); };
  const isTable = function (l) { return /^\s*\|/.test(l); };
  const isQuote = function (l) { return /^\s*>/.test(l); };
  const isProse = function (l) { return l.trim() && !isList(l) && !isHeading(l) && !isTable(l) && !isQuote(l) && !/^\s/.test(l) && !/^```/.test(l) && !/^<!--.*-->\s*$/.test(l); };
  lines.forEach(function (l, i) {
    if (/^```/.test(l)) { fence = !fence; return; }
    if (fence) return;
    const prev = i > 0 ? lines[i - 1] : "";
    const next = i + 1 < lines.length ? lines[i + 1] : "";
    if (isHeading(l)) {
      if (i > 0 && prev.trim()) faults.push(f + ":" + (i + 1) + " :: heading colle a la ligne precedente (" + (isList(prev) || /^\s/.test(prev) ? "liste" : "texte") + ")");
      if (next.trim()) faults.push(f + ":" + (i + 1) + " :: heading sans ligne vide apres");
    }
    if (isList(l) && isProse(prev) && !/[:—]\s*$/.test(prev.trim())) {
      faults.push(f + ":" + (i + 1) + " :: puce collee a un paragraphe qui ne l'introduit pas (« " + prev.trim().slice(-40) + " »)");
    }
  });
  return faults;
}
detector("DOC-14", "aucun document markdown n'a de heading dans une liste, de puce orpheline collee a un paragraphe, ni de heading sans separation",
  function (docs) {
    let hits = [];
    Object.keys(docs).forEach(function (f) {
      if (isJson(f)) return;
      if (f === CHARTE) return;  // document du proprietaire, byte-identique par condition : lu, jamais corrige ici
      hits = hits.concat(markdownStructureFaults(f, docs[f]));
    });
    /** v0.15 — STRUCTURE DECLAREE : MANIFEST.documentStructure donne, pour les
     *  documents structures, le nombre d'items de liste attendu par section. Un
     *  deplacement de puces — meme separe par des lignes vides, meme sans faute
     *  de forme — change les comptes et fait echouer le controle. */
    let man = null;
    try { man = JSON.parse(docs["MANIFEST.json"] || "null"); } catch (e) { hits.push("MANIFEST.json illisible"); }
    const decl = (man && man.documentStructure) || null;
    if (!decl) hits.push("MANIFEST.documentStructure absent");
    else Object.keys(decl).forEach(function (f) {
      if (!docs[f]) { hits.push("documentStructure : " + f + " absent du lot"); return; }
      const counts = listCountsBySection(docs[f]);
      Object.keys(decl[f]).forEach(function (sec) {
        const got = counts[sec];
        if (got === undefined) hits.push(f + " : section « " + sec + " » declaree, introuvable");
        else if (got !== decl[f][sec]) hits.push(f + " : section « " + sec + " » porte " + got + " items de liste, " + decl[f][sec] + " declares");
      });
    });
    /** KF-5, verification NOMMEE : les six puces de « Ce que le lot ne prétend
     *  pas » sont sous le heading §6 du THREAT-MODEL, et nulle part sous §7. */
    const tm = docs["THREAT-MODEL.md"] || "";
    const s6 = (tm.match(/^## 6\.[\s\S]*?(?=^## 7\.)/m) || [""])[0];
    const s7 = (tm.match(/^## 7\.[\s\S]*$/m) || [""])[0];
    ["Il ne prouve pas qu'un humain a décidé", "Il ne prouve pas qu'une étape aval", "La garde de contrats couvre",
      "Le plafond de statut de préparation", "Deux fichiers de configuration de confiance", "Succès technique"].forEach(function (p) {
        if (s6.indexOf("- " + p) === -1) hits.push("THREAT-MODEL.md §6 ne contient pas la puce « " + p + " »");
        if (s7.indexOf("- " + p) !== -1) hits.push("THREAT-MODEL.md §7 contient la puce « " + p + " », qui appartient a §6");
      });
    return hits;
  },
  [
    mut("THREAT-MODEL.md : les six puces de §6 sont recollees apres le dernier paragraphe de §7 (faute KF-5 de v0.13)", "THREAT-MODEL.md", function (t) {
      const m = t.match(/(- Il ne prouve pas qu'un humain a décidé[\s\S]*?- Succès technique ≠ succès scientifique\.\n)/);
      if (!m) throw new Error("puces §6 introuvables");
      const sans = t.replace(m[1], "");
      return mustReplace(sans, /(`NON-REGRESSION\.md` §3\)\.\n)/, "$1" + m[1], "dernier paragraphe de §7");
    }),
    mut("README.md : un heading est insere au milieu de la liste des hypotheses", "README.md", function (t) {
      return mustReplace(t, /(\n3\. Le plafond de statut de préparation)/, "\n### Suite\n$1", "hypothese 3");
    }),
    /** v0.15 — deplacement SANS faute de forme : les six puces partent sous §7,
     *  precedees et suivies d'une ligne vide. Seule la structure declaree le voit. */
    mut("THREAT-MODEL.md : les six puces de §6 sont deplacees sous §7, separees par des lignes vides", "THREAT-MODEL.md", function (t) {
      const m = t.match(/(- Il ne prouve pas qu'un humain a décidé[\s\S]*?- Succès technique ≠ succès scientifique\.\n)/);
      if (!m) throw new Error("puces §6 introuvables");
      const sans = t.replace(m[1], "");
      return mustReplace(sans, /(`NON-REGRESSION\.md` §3\)\.\n)/, "$1\n" + m[1], "dernier paragraphe de §7");
    }),
    mut("README.md : une hypothese est deplacee, apres une ligne vide, sous la section « Lecture »", "README.md", function (t) {
      const item = "6. Une capacité certifiée n'est pas un artefact intégralement prouvé : la\n   décision atteste le **sujet** et l'**empreinte**, pas les champs informatifs.\n";
      if (t.indexOf(item) === -1) throw new Error("hypothese 6 introuvable");
      return t.replace(item, "").replace(/(## Lecture\n\n)/, "$1" + item + "\n");
    }),
  ]);

/* ----- KF-7 / DOC-15 — tout chemin reference par MANIFEST existe ----- */
function manifestPaths(man) {
  const out = [];
  (function walk(node, trail) {
    if (typeof node === "string") {
      const re = /(?:^|[\s"(:>])((?:core|adapters|validators|schemas|contracts|governance|test|tools)\/[A-Za-z0-9_./-]+|[A-Za-z][A-Za-z0-9.-]*\.(?:md|json|txt))/g;
      let m;
      while ((m = re.exec(node)) !== null) out.push({ p: m[1].replace(/[.,;)]+$/, ""), trail: trail });
    } else if (Array.isArray(node)) node.forEach(function (x, i) { walk(x, trail + "[" + i + "]"); });
    else if (node && typeof node === "object") Object.keys(node).forEach(function (k) { walk(node[k], trail + "." + k); });
  })(man, "MANIFEST");
  return out;
}
detector("DOC-15", "tous les chemins references dans MANIFEST.json existent",
  function (docs) {
    let man;
    try { man = JSON.parse(docs["MANIFEST.json"] || ""); } catch (e) { return ["MANIFEST.json illisible : " + e.message]; }
    const hits = [];
    manifestPaths(man).forEach(function (x) {
      if (/\.(was|replaces|where)$/.test(x.trail)) return;  // affirmation ancienne citee, fichier remplace, ou lieu d'une faute historique
      if (/^MANIFEST\.divergences\b|\.divergences\./.test(x.trail)) {
        const lot = (x.trail.match(/divergences\.([^.\[]+(?:\.[^.\[]+)*)\[/) || [])[1];
        if (!fs.existsSync(path.join(BUNDLE, "MONO-10"))) return;  // paquet non joignable : hors portee
        if (!lot || !fs.existsSync(path.join(BUNDLE, lot, x.p))) hits.push(x.trail + " -> " + (lot || "?") + "/" + x.p + " absent du paquet");
        return;
      }
      const rel = x.p.replace(/\/$/, "");
      if (!fs.existsSync(path.join(LOT, rel))) hits.push(x.trail + " -> " + x.p + " absent du lot");
    });
    return hits;
  },
  [
    mut("MANIFEST.json : executableAdditions reference test/test-mono10-v0.12-documentary.js", "MANIFEST.json", function (t) {
      const man = JSON.parse(t);
      man.executableAdditions.push({ file: "test/test-mono10-v0.12-documentary.js", role: "controles" });
      return JSON.stringify(man, null, 2);
    }),
    mut("MANIFEST.json : deltaClassification reference le fichier racine pointe audit.notes.md, absent", "MANIFEST.json", function (t) {
      const man = JSON.parse(t); man.deltaClassification.DOCUMENTATION.push("audit.notes.md"); return JSON.stringify(man, null, 2);
    }),
  ]);

/* ----- KF-6 / DOC-16 — runtimeIdentityProof.paths reflete la decision de perimetre ----- */
detector("DOC-16", "MANIFEST.runtimeIdentityProof.paths ne contient aucun chemin documentaire et egale le perimetre decide",
  function (docs) {
    let man;
    try { man = JSON.parse(docs["MANIFEST.json"] || ""); } catch (e) { return ["MANIFEST.json illisible"]; }
    const paths = (man.runtimeIdentityProof || {}).paths || [];
    const inP = (man.runtimePerimeterDecision || {}).inPerimeter || [];
    const outP = (man.runtimePerimeterDecision || {}).outOfPerimeter || [];
    const hits = [];
    paths.forEach(function (p) {
      if (p === "governance/" || p === "governance") hits.push("runtimeIdentityProof.paths contient governance/ alors que governance/README.md est hors perimetre");
      if (/\.md$/.test(p) && p !== CHARTE) hits.push("runtimeIdentityProof.paths contient un document : " + p);
      if (/MANIFEST|SHA256SUMS|documentary|seal-inventory/.test(p)) hits.push("runtimeIdentityProof.paths contient un chemin documentaire : " + p);
    });
    if (JSON.stringify(paths.slice().sort()) !== JSON.stringify(inP.slice().sort())) hits.push("runtimeIdentityProof.paths ≠ runtimePerimeterDecision.inPerimeter");
    if (!outP.some(function (x) { return /^governance\/README\.md/.test(x); })) hits.push("governance/README.md n'est pas declare hors perimetre");
    return hits;
  },
  [mut("MANIFEST.json : governance/ est ajoute a runtimeIdentityProof.paths", "MANIFEST.json", function (t) {
    const man = JSON.parse(t); man.runtimeIdentityProof.paths.push("governance/"); return JSON.stringify(man, null, 2);
  })]);

/* ----- KF-8 / DOC-17 — knownFalseStatementsRemaining est DERIVE, jamais pre-rempli ----- */
detector("DOC-17", "MANIFEST.knownFalseStatementsRemaining egale le total mesure par tous les autres detecteurs",
  function (docs) {
    let man;
    try { man = JSON.parse(docs["MANIFEST.json"] || ""); } catch (e) { return ["MANIFEST.json illisible"]; }
    let n = 0;
    DETECTORS.forEach(function (d) {
      if (d.id === "DOC-17") return;
      n += d.find(docs).filter(function (h) { return !/^SKIP:/.test(h); }).length;
    });
    const declared = (man.measurements || {}).knownFalseStatementsRemaining;
    if (declared !== n) return ["MANIFEST annonce knownFalseStatementsRemaining = " + declared + " ; mesure = " + n];
    return [];
  },
  [mut("MANIFEST.json : knownFalseStatementsRemaining est pre-rempli a 1 sans mesure", "MANIFEST.json", function (t) {
    const man = JSON.parse(t); man.measurements.knownFalseStatementsRemaining = 1; return JSON.stringify(man, null, 2);
  })]);

/* ----- DOC-18 — toute correction declaree nomme le controle qui la verifie ----- */
detector("DOC-18", "chaque correction declaree dans MANIFEST.correctedStatements nomme un controle existant",
  function (docs) {
    let man;
    try { man = JSON.parse(docs["MANIFEST.json"] || ""); } catch (e) { return ["MANIFEST.json illisible"]; }
    const ids = DETECTORS.map(function (d) { return d.id; }).concat(EXTRA_CHECK_IDS);
    const hits = [];
    (man.correctedStatements || []).forEach(function (c) {
      if (!c.verifiedBy) { hits.push(c.id + " : aucun controle nomme"); return; }
      String(c.verifiedBy).split(/[,\s]+/).filter(Boolean).forEach(function (v) {
        if (ids.indexOf(v) === -1) hits.push(c.id + " : controle inconnu « " + v + " »");
      });
    });
    return hits;
  },
  [mut("MANIFEST.json : une correction renvoie a un controle inexistant DOC-99", "MANIFEST.json", function (t) {
    const man = JSON.parse(t); man.correctedStatements[0].verifiedBy = "DOC-99"; return JSON.stringify(man, null, 2);
  })]);

/* ----- DOC-19 — aucun statut de reserve indexe sur une version anterieure presente comme courant ----- */
/**
 * DOC-19 (v0.18) — ORDRE IMPERATIF des controles pour un ancien token
 * NOT_FIXED_IN_V0NN / resolvedByV0NN (NN ≠ version courante) :
 *   1. CONTINUITE : « depuis », « encore », « toujours », « a ce jour »,
 *      « aujourd'hui », « reste », « demeure », « desormais » dans la meme
 *      phrase, avant ou apres le token  -> FAIL (quel que soit le contexte) ;
 *   2. COUPLAGE : « a l'epoque de v0.MM » / « dans le cadre v0.MM » / « cadre
 *      historique v0.MM » dans la phrase : MM ≠ NN -> FAIL ; MM == NN -> PASS ;
 *   3. sinon, CITATION adjacente (« … », annoncait, disait, was, temoin…) -> PASS
 *      — « a l'epoque » seul N'EST PAS un marqueur de citation ici ;
 *   4. sinon -> FAIL (ancien token dans un contexte courant).
 */
const CITED_BEFORE_NO_EPOQUE = new RegExp(CITED_BEFORE.source.replace("|[aà] l'[eé]poque", ""), "i");
detector("DOC-19", "aucun ancien token NOT_FIXED_IN_V0NN / resolvedByV0NN n'est presente comme courant : continuite refusee, cadre couple a la meme version, « a l'epoque » n'exempte pas",
  function (docs) {
    const cur = VERSION_TAG.replace(/^v0\./, "");
    const CONT = /\b(depuis|encore|toujours|[aà] ce jour|aujourd'hui|reste|demeure|d[eé]sormais)\b/i;
    const hits = [];
    Object.keys(docs).forEach(function (f) {
      blocksOf(f, docs[f]).forEach(function (b) {
        if (b.kind === "code") return;
        sentencesOf(b).forEach(function (sent) {
          const re = /NOT_FIXED_IN_V0(\d{2})\b|resolvedByV0(\d{2})\b/g;
          let m;
          while ((m = re.exec(sent)) !== null) {
            const v = m[1] || m[2];
            if (v === cur) continue;
            const after = sent.slice(m.index + m[0].length, m.index + m[0].length + 40);
            const before = sent.slice(Math.max(0, m.index - 40), m.index);
            /** 1. continuite — ADJACENTE au token (ponctuation, backtick, « est », « et » toleres entre les deux) :
             *  « TOKEN depuis », « TOKEN, encore », « TOKEN est toujours », « aujourd'hui TOKEN », « reste TOKEN » */
            const contAfter = /^[\s`»)]*[,;:—-]?\s*(?:(?:est|et|c'est|le statut est)\s+)?(depuis|encore|toujours|[aà] ce jour|aujourd'hui|reste|demeure|d[eé]sormais)\b/i.test(after);
            const contBefore = /\b(aujourd'hui|[aà] ce jour|d[eé]sormais|encore|toujours|reste|demeure)\s*[,:;—-]?\s*(?:le statut\s+|statut\s+)?`?$/i.test(before);
            if (contAfter || contBefore) {
              hits.push(f + ":" + b.line + " :: " + m[0] + " avec une formulation de continuite : ancien token presente comme courant"); continue;
            }
            /** 2. couplage cadre / token — le cadre le plus proche AVANT le token dans la phrase */
            const frames = []; const reF = /(?:[aà] l'[eé]poque de|dans le cadre(?: historique)?|cadre(?: historique)?) v0\.(\d+)/gi; let fm;
            while ((fm = reF.exec(sent.slice(0, m.index))) !== null) frames.push(fm[1]);
            if (frames.length) {
              const mm = frames[frames.length - 1];
              if (mm !== v) { hits.push(f + ":" + b.line + " :: " + m[0] + " sous un cadre « v0." + mm + " » : version du cadre ≠ version du token"); continue; }
              continue;   // cadre couple, sans continuite : forme historique valide
            }
            /** 3. citation adjacente — SANS « a l'epoque » */
            if (b.kind === "json" && /^(was|before|claim|replaces|where|historicalFaultLocation)$/.test(b.key || "")) continue;
            if (CITED_BEFORE_NO_EPOQUE.test(sent.slice(Math.max(0, m.index - 90), m.index + 6))) continue;
            /** 4. */
            hits.push(f + ":" + b.line + " :: " + m[0] + " presente comme courant");
          }
        });
      });
    });
    return hits;
  },
  [
    /** TEMOIN OBLIGATOIRE — la faute B2 de v0.16, VERBATIM, dans le document reel qui la portait. */
    mut("MIGRATION-v0.13-v0.14.md : faute B2 de v0.16 verbatim « statut NOT_FIXED_IN_V014 à l'époque de v0.14 ; NOT_FIXED_IN_V015 depuis »", "MIGRATION-v0.13-v0.14.md", function (t) {
      return mustReplace(t, /\(à l'époque de v0\.14 : `NOT_FIXED_IN_V014` ; le statut courant est dans `OPEN-FINDINGS\.md`\)/,
        "(statut `NOT_FIXED_IN_V014` à l'époque de v0.14 ; `NOT_FIXED_IN_V015` depuis)", "ligne recadree de MIGRATION-v0.13-v0.14");
    }),
    mut("OPEN-FINDINGS.md : un NOT_FIXED_IN_V018 redevient NOT_FIXED_IN_V015", "OPEN-FINDINGS.md", function (t) {
      return mustReplace(t, /NOT_FIXED_IN_V018/, "NOT_FIXED_IN_V015", "NOT_FIXED_IN_V018");
    }),
    mut("README.md : phrase « Les réserves sont NOT_FIXED_IN_V015. » ajoutee dans un document courant", "README.md", function (t) {
      return mustReplace(t, /(Détail intégral, avec la couche qui compense chacune : `OPEN-FINDINGS\.md`\.\n)/, "$1\nLes réserves sont `NOT_FIXED_IN_V015`.\n", "phrase detail integral");
    }),
    mut("MIGRATION-v0.15-v0.16.md : « à l'époque de v0.16 : NOT_FIXED_IN_V016 » redevient « NOT_FIXED_IN_V016 depuis »", "MIGRATION-v0.15-v0.16.md", function (t) {
      return mustReplace(t, /à l'époque de v0\.16 : `NOT_FIXED_IN_V016`/, "`NOT_FIXED_IN_V016` depuis", "a l'epoque de v0.16");
    }),
  ].concat([
    "À l'époque de v0.14, `NOT_FIXED_IN_V015`.",
    "À l'époque de v0.14 ; `NOT_FIXED_IN_V015` depuis.",
    "À l'époque de v0.14 ; aujourd'hui `NOT_FIXED_IN_V015`.",
    "Comme à l'époque de v0.14, `NOT_FIXED_IN_V015` depuis.",
    "À l'époque de v0.14 : `NOT_FIXED_IN_V015` encore.",
    "À l'époque de v0.14 : `NOT_FIXED_IN_V015` toujours.",
    "À l'époque de v0.14 : `NOT_FIXED_IN_V015` à ce jour.",
  ].map(function (phrase) {
    return mut("MIGRATION-v0.13-v0.14.md : variante adversariale « " + phrase + " »", "MIGRATION-v0.13-v0.14.md", function (t) {
      return mustReplace(t, /(## 7\. Ce que v0\.14 ne fait pas\n\n)/, "$1" + phrase + "\n\n", "section 7 de MIGRATION-v0.13-v0.14");
    });
  })).concat([
    ctl("CONTROLE : « À l'époque de v0.14 : `NOT_FIXED_IN_V014`. » ajoute -> ne doit PAS mordre", "MIGRATION-v0.13-v0.14.md", function (t) {
      return mustReplace(t, /(## 7\. Ce que v0\.14 ne fait pas\n\n)/, "$1À l'époque de v0.14 : `NOT_FIXED_IN_V014`.\n\n", "section 7");
    }),
    ctl("CONTROLE : « À l'époque de v0.15 : `NOT_FIXED_IN_V015`. » ajoute -> ne doit PAS mordre", "MIGRATION-v0.14-v0.15.md", function (t) {
      return mustReplace(t, /(## 6\. Ce que v0\.15 ne fait pas\n\n)/, "$1À l'époque de v0.15 : `NOT_FIXED_IN_V015`.\n\n", "section 6");
    }),
    ctl("CONTROLE : « Statut courant : `NOT_FIXED_IN_V018`. » ajoute -> ne doit PAS mordre", "README.md", function (t) {
      return mustReplace(t, /(Détail intégral, avec la couche qui compense chacune : `OPEN-FINDINGS\.md`\.\n)/, "$1\nStatut courant : `NOT_FIXED_IN_V018`.\n", "phrase detail integral");
    }),
  ]));

const EXTRA_CHECK_IDS = ["COH-01", "COH-02", "COH-03", "COH-04", "COH-05", "COH-06", "RT-01", "RT-02", "RT-03", "RT-04", "RT-05", "RT-06", "RT-07", "RT-08", "RT-09", "RT-10",
  "SEAL-01", "SEAL-02", "SEAL-03", "SEAL-04", "SEAL-05", "SEAL-06", "SEAL-07", "SEAL-08", "SEAL-09", "SEAL-10", "MAN-01", "MAN-02", "MAN-03", "SCAN-01", "SCAN-02", "SCAN-03", "SCAN-04"];

/* ============================ identite runtime ============================ */
const RUNTIME_DIRS = ["core", "adapters", "validators", "schemas", "contracts"];
const RUNTIME_FILES = ["test/fixture-chain.js", "test/test-mono10-v0.11.js",
  "test/test-mono10-v0.11-integration.js", "tools/aggregate-hash.js",
  "tools/operator-provisioning.js", "tools/reference-llm-transport.js", CHARTE];
function digestOf(base, rel) {
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
}

/* ============================ execution ============================ */
(function () {
  console.log("MONO-10 v0.18 — controles de verite documentaire\n");
  console.log("  lots historiques joignables : " + (LOTS_REACHABLE ? sortedLotNames().join(", ") : "AUCUN (extraction isolee : les temoins qui les exigent seront SKIP)"));
  const docs = collectDocs(LOT);
  const md = Object.keys(docs).filter(function (f) { return /\.md$/.test(f); });
  const js = Object.keys(docs).filter(isJson);
  console.log("  documents balayes (recursif) : " + md.length + " .md + " + js.length + " .json");
  check("SCAN-01. le balayage atteint governance/", Object.keys(docs).some(function (f) { return /^governance\//.test(f); }));
  check("SCAN-02. le balayage atteint MANIFEST.json et les .json des sous-dossiers",
    js.indexOf("MANIFEST.json") !== -1 && js.some(function (f) { return /\//.test(f); }), JSON.stringify(js));
  check("SCAN-03. le balayage atteint les migrations", md.some(function (f) { return /^MIGRATION-/.test(f); }));
  check("SCAN-04. le balayage atteint un fichier documentaire racine a nom pointe (AUDIT-VERDICTS.v0.12-v0.18.md)",
    md.indexOf("AUDIT-VERDICTS.v0.12-v0.18.md") !== -1);

  /* ----- temoins causaux, trois etats par detecteur ----- */
  console.log("\n  -- " + DETECTORS.length + " detecteurs, chacun avec PASS_CLEAN / FAIL_SINGLE_TARGET_FAULT / PASS_AFTER_REVERT --");
  let variantsCaught = 0, variantsTotal = 0;
  DETECTORS.forEach(function (d) {
    total++;
    const propre = d.find(Object.assign({}, docs));
    const skips = propre.filter(function (h) { return /^SKIP:/.test(h); });
    const reels = propre.filter(function (h) { return !/^SKIP:/.test(h); });
    if (skips.length && !reels.length) { total--; skip(d.id + ". " + d.label, skips.join(" | ")); return; }
    const passClean = reels.length === 0;
    let allBite = true, allRevert = true;
    const details = [];
    let witnessSkips = 0, controls = 0, controlsOk = 0;
    d.mutations.forEach(function (m) {
      if (m.needsLots && !LOTS_REACHABLE) { witnessSkips++; details.push("SKIP (lots non joignables) : " + m.label); return; }
      if (m.control) {
        controls++;
        try {
          const c = Object.assign({}, docs); c[m.file] = m.apply(docs[m.file]);
          const h = d.find(c).filter(function (x) { return !/^SKIP:/.test(x); });
          if (h.length === reels.length) controlsOk++; else { allBite = false; details.push(m.label + " -> MORD A TORT : " + JSON.stringify(h.slice(0, 2))); }
        } catch (e) { allBite = false; details.push(m.label + " -> ERREUR " + e.message); }
        return;
      }
      let mutated, err = null;
      try {
        mutated = Object.assign({}, docs);
        mutated[m.file] = m.apply(docs[m.file]);
      } catch (e) { err = e.message; }
      if (err) { allBite = false; details.push(m.label + " -> ERREUR " + err); return; }
      const changed = Object.keys(mutated).filter(function (f) { return mutated[f] !== docs[f]; });
      const apres = d.find(mutated).filter(function (h) { return !/^SKIP:/.test(h); });
      const bite = apres.length > reels.length && changed.length === 1 && changed[0] === m.file;
      /** PASS_AFTER_REVERT : ce seul document restaure, le detecteur se tait. */
      mutated[m.file] = docs[m.file];
      const revert = d.find(mutated).filter(function (h) { return !/^SKIP:/.test(h); }).length === reels.length;
      if (d.id === "DOC-03") { variantsTotal++; if (bite && revert) variantsCaught++; }
      if (!bite) { allBite = false; details.push(m.label + " -> NE MORD PAS (" + (changed.length === 1 ? "0 faussete nouvelle" : "fichiers changes : " + changed.join(",")) + ")"); }
      if (!revert) { allRevert = false; details.push(m.label + " -> ne revient pas a PASS apres restauration"); }
    });
    const nFault = d.mutations.length - witnessSkips - controls;
    const ok = passClean && allBite && allRevert && nFault > 0;
    if (ok) caught++;
    check(d.id + ". " + d.label
      + "\n        PASS_CLEAN=" + (passClean ? "YES" : "NO")
      + "  FAIL_SINGLE_TARGET_FAULT=" + (allBite ? "YES" : "NO") + " (" + nFault + " temoin" + (nFault > 1 ? "s" : "") + (controls ? ", " + controlsOk + "/" + controls + " controles PASS" : "") + (witnessSkips ? ", " + witnessSkips + " SKIP" : "") + ")"
      + "  PASS_AFTER_REVERT=" + (allRevert ? "YES" : "NO"),
      ok, (passClean ? "" : "FAUSSETE LIVREE: " + JSON.stringify(reels).slice(0, 400) + " ") + details.join(" ; "));
  });
  console.log("  ATTESTATION_OVERCLAIM_VARIANTS_CAUGHT = " + (variantsCaught === variantsTotal && variantsTotal > 0 ? "ALL" : variantsCaught + "/" + variantsTotal) + " (" + variantsCaught + "/" + variantsTotal + ")");

  /* ----- coherence du paquet ----- */
  console.log("\n  -- coherence du paquet --");
  let manifest = null;
  try { manifest = JSON.parse(docs["MANIFEST.json"] || ""); } catch (e) { manifest = null; }
  if (!manifest) { console.log("  INFO  MANIFEST.json absent ou illisible : les controles COH/MAN echouent"); }
  const man = manifest || {};
  const of = docs["OPEN-FINDINGS.md"] || "";
  check("COH-01. OPEN-FINDINGS.md : chaque ligne R1..R5 du tableau de statut porte OPEN / NON_BLOCKING / NOT_FIXED_IN_V018 (verification individuelle, DOC-23)",
    ["R1", "R2", "R3", "R4", "R5"].every(function (r) {
      const row = (of.match(new RegExp("^\\|\\s*\\*\\*" + r + "\\*\\*[^\\n]*$", "m")) || [""])[0];
      return /`OPEN`/.test(row) && /`NON_BLOCKING`/.test(row) && /`NOT_FIXED_IN_V018`/.test(row);
    }));
  check("COH-02. aucune reserve n'est presentee comme resolue (MANIFEST.knownOpenFindings)",
    (man.knownOpenFindings || []).length === 5
    && (man.knownOpenFindings || []).every(function (r) { return r.resolvedByV018 === false && r.status === "OPEN" && r.blocking === false; }),
    JSON.stringify((man.knownOpenFindings || []).map(function (r) { return r.id + ":" + r.status + ":" + r.resolvedByV018; })));
  check("COH-03. README et MANIFEST annoncent le MEME nombre d'hypotheses",
    readmeAssumptionCount(docs) === (man.declaredAssumptions || []).length,
    "README=" + readmeAssumptionCount(docs) + " MANIFEST=" + (man.declaredAssumptions || []).length);
  check("COH-04. MIGRATION v0.17 -> v0.18 existe et affirme l'absence de changement runtime",
    !!docs["MIGRATION-v0.17-v0.18.md"] && /Aucune API ne change/.test(docs["MIGRATION-v0.17-v0.18.md"] || ""));
  check("COH-05. le MANIFEST declare la nature documentaire et les sept identites runtime",
    /DOCUMENTAIRE/i.test(man.natureOfLot || "")
    && ["MONO-10-v0.11", "MONO-10-v0.12", "MONO-10-v0.13", "MONO-10-v0.14", "MONO-10-v0.15", "MONO-10-v0.16", "MONO-10-v0.17"].every(function (v) { return (man.runtimeByteIdenticalTo || []).indexOf(v) !== -1; }),
    JSON.stringify(man.runtimeByteIdenticalTo));
  const canon = canonicalFields(docs) || [];
  check("COH-06. la source canonique des champs non attestes compte " + canon.length + " champs et MANIFEST.nonAttestedFields l'egale",
    canon.length > 0 && JSON.stringify(canon) === JSON.stringify(man.nonAttestedFields || []),
    JSON.stringify(canon) + " vs " + JSON.stringify(man.nonAttestedFields));

  /* ----- MANIFEST : audit structurel ----- */
  console.log("\n  -- MANIFEST : audit structurel --");
  const listed = (man.files || []).map(function (x) { return x.file; });
  const onDisk = [];
  (function w(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".git") w(p); return; }
      const rel = path.relative(LOT, p);
      if (rel !== "MANIFEST.json" && rel !== "SHA256SUMS.txt") onDisk.push(rel);
    });
  })(LOT);
  onDisk.sort(); listed.sort();
  check("MAN-01. MANIFEST.files enumere exactement les fichiers du lot (hors MANIFEST.json et SHA256SUMS.txt) : " + onDisk.length,
    JSON.stringify(listed) === JSON.stringify(onDisk) && man.fileCount === onDisk.length,
    "manquants=" + JSON.stringify(onDisk.filter(function (f) { return listed.indexOf(f) === -1; })) + " en trop=" + JSON.stringify(listed.filter(function (f) { return onDisk.indexOf(f) === -1; })) + " fileCount=" + man.fileCount);
  const badHash = (man.files || []).filter(function (x) {
    const p = path.join(LOT, x.file);
    return !fs.existsSync(p) || crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") !== x.sha256 || fs.statSync(p).size !== x.size;
  }).map(function (x) { return x.file; });
  check("MAN-02. chaque empreinte de MANIFEST.files correspond au fichier livre", (man.files || []).length > 0 && badHash.length === 0, JSON.stringify(badHash));
  const staleKeys = Object.keys(man.measurements || {}).filter(function (k) { return /V01[0-7]\b/.test(k) && !/runtimeByteIdenticalToV01[0-7]/.test(k); });
  check("MAN-03. MANIFEST : reserves R1-R5 OPEN / NON_BLOCKING / NOT_FIXED_IN_V018, closesFindings vide, aucune mesure indexee sur une version anterieure recopiee comme courante",
    (man.closesFindings || []).length === 0 && (man.knownOpenFindings || []).length === 5
    && (man.knownOpenFindings || []).every(function (r) { return r.status === "OPEN" && r.blocking === false && r.resolvedByV018 === false && r.fixedIn === "NOT_FIXED_IN_V018"; })
    && staleKeys.length === 0 && man.correctsFalseStatementsOf === "MONO-10-v0.17",
    "closes=" + JSON.stringify(man.closesFindings) + " stale=" + JSON.stringify(staleKeys));

  /* ----- identite du runtime ----- */
  console.log("\n  -- identite du runtime : le perimetre EXCLUT les documents corriges --");
  [["v0.11", "RT-01"], ["v0.12", "RT-02"], ["v0.13", "RT-03"], ["v0.14", "RT-06"], ["v0.15", "RT-07"], ["v0.16", "RT-09"], ["v0.17", "RT-10"]].forEach(function (pair) {
    const prev = path.resolve(LOT, "..", pair[0]);
    if (!fs.existsSync(prev)) { skip(pair[1] + ". identite runtime avec " + pair[0], "lot non joignable depuis cette extraction"); return; }
    const diffs = RUNTIME_DIRS.concat(RUNTIME_FILES).filter(function (rel) { return digestOf(LOT, rel) !== digestOf(prev, rel); });
    check(pair[1] + ". RUNTIME_BYTE_IDENTICAL_TO_" + pair[0].toUpperCase().replace(".", "") + " sur " + (RUNTIME_DIRS.length + RUNTIME_FILES.length) + " chemins",
      diffs.length === 0, JSON.stringify(diffs));
  });
  check("RT-04. la Charte est dans le perimetre runtime, governance/README.md non",
    RUNTIME_FILES.indexOf(CHARTE) !== -1 && RUNTIME_DIRS.indexOf("governance") === -1);
  check("RT-05. les outils et tests documentaires ajoutes n'ecrivent rien (aucun appel fs d'ecriture)",
    ["tools/seal-inventory.js", "test/test-mono10-v0.18-documentary.js"].every(function (t) {
      return !/\bfs\.(writeFileSync|appendFileSync|mkdirSync|rmSync|rmdirSync|unlinkSync|createWriteStream|renameSync|chmodSync|chownSync|mkdtempSync|copyFileSync|writeSync|openSync|symlinkSync|truncateSync)\s*\(/
        .test(fs.readFileSync(path.join(LOT, t), "utf8"));
    }));

  /** RT-08 — chaque document a titre d'origine est byte-identique au LOT NOMME comme origine de contenu */
  (function () {
    const origin = man.originTitledDocuments || {};
    if (!LOTS_REACHABLE) { skip("RT-08. documents a titre d'origine identiques a leur lot d'origine declare", "lots historiques non joignables"); return; }
    const bad = Object.keys(origin).filter(function (f) {
      const e = origin[f]; const lot = LOTS[e.currentContentOriginVersion];
      if (!lot) return true;
      const a = path.join(LOT, f), b = path.join(lot, e.originPath || f);
      return !fs.existsSync(a) || !fs.existsSync(b) || !fs.readFileSync(a).equals(fs.readFileSync(b));
    });
    check("RT-08. les " + Object.keys(origin).length + " documents a titre d'origine sont byte-identiques a " + Object.keys(origin).map(function (f) { return origin[f].currentContentOriginVersion; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join("/") + " (lot NOMME par chaque entree, jamais v0.11 par defaut)",
      Object.keys(origin).length > 0 && bad.length === 0, JSON.stringify(bad));
  })();

  /* ----- sceaux : cadres, mesures, jamais postules ----- */
  console.log("\n  -- inventaire des sceaux : huit cadres --");
  if (!fs.existsSync(path.join(BUNDLE, "MONO-10"))) {
    skip("SEAL-01..10. inventaire", "paquet non joignable depuis cette extraction");
  } else {
    const SI = require(path.join(LOT, "tools", "seal-inventory.js"));
    const frames = [
      ["v0.11", "SEAL-01", ["MONO-10/v0.11", "MONO-10/v0.12", "MONO-10/v0.13", "MONO-10/v0.14", "MONO-10/v0.15", "MONO-10/v0.16", "MONO-10/v0.17", "MONO-10/v0.18"], [24, 1577, 9, 0]],
      ["v0.12", "SEAL-02", ["MONO-10/v0.12", "MONO-10/v0.13", "MONO-10/v0.14", "MONO-10/v0.15", "MONO-10/v0.16", "MONO-10/v0.17", "MONO-10/v0.18"], [25, 1644, 9, 0]],
      ["v0.13", "SEAL-03", ["MONO-10/v0.13", "MONO-10/v0.14", "MONO-10/v0.15", "MONO-10/v0.16", "MONO-10/v0.17", "MONO-10/v0.18"], [26, 1715, 9, 0]],
      ["v0.14", "SEAL-07", ["MONO-10/v0.14", "MONO-10/v0.15", "MONO-10/v0.16", "MONO-10/v0.17", "MONO-10/v0.18"], [27, 1787, 9, 0]],
      ["v0.15", "SEAL-08", ["MONO-10/v0.15", "MONO-10/v0.16", "MONO-10/v0.17", "MONO-10/v0.18"], [28, 1860, 9, 0]],
      ["v0.16", "SEAL-09", ["MONO-10/v0.16", "MONO-10/v0.17", "MONO-10/v0.18"], [29, 1934, 9, 0]],
      ["v0.17", "SEAL-10", ["MONO-10/v0.17", "MONO-10/v0.18"], [30, 2010, 9, 0]],
    ];
    let f11 = null;
    frames.forEach(function (fr) {
      const inv = SI.inventory(BUNDLE, fr[2]);
      if (fr[0] === "v0.11") f11 = inv;
      const got = [inv.sealedHistoricalLots, inv.sealedReferences, inv.sealedDivergences, inv.unverifiableHistoricalLots.length];
      check(fr[1] + ". cadre " + fr[0] + " : " + fr[3].join(" / "), JSON.stringify(got) === JSON.stringify(fr[3]), got.join("/"));
    });
    const f14 = SI.inventory(BUNDLE, "MONO-10/v0.18");
    console.log("  INFO  cadre v0.18 mesure : " + f14.sealedHistoricalLots + " lots, " + f14.sealedReferences + " references, "
      + f14.sealedDivergences + " divergences, " + f14.unverifiableHistoricalLots.length + " non scelle(s)"
      + " ; tous sceaux : " + f14.sealFiles + " fichiers, " + f14.allSeals.references + " references, " + f14.allSeals.divergences + " divergences");
    check("SEAL-04. cadre v0.18 : memes 9 divergences, 0 lot non scelle, v0.17 devenu historique (31 lots)",
      f14.sealedDivergences === 9 && f14.unverifiableHistoricalLots.length === 0 && f14.sealedHistoricalLots === 31,
      JSON.stringify(f14.unverifiableHistoricalLots) + " lots=" + f14.sealedHistoricalLots);
    const lots = (f11 ? f11.historical : []).filter(function (r) { return r.divergences.length; }).map(function (r) { return r.lot; }).sort();
    check("SEAL-05. les divergences sont bien MONO-07 et MONO-08/v0.6", JSON.stringify(lots) === JSON.stringify(["MONO-07", "MONO-08/v0.6"]), JSON.stringify(lots));
    const nr = docs["NON-REGRESSION.md"] || "";
    check("SEAL-06. les huit cadres sont nommes dans NON-REGRESSION.md, et le MANIFEST porte le cadre v0.18 mesure",
      ["v0.11", "v0.12", "v0.13", "v0.14", "v0.15", "v0.16", "v0.17", "v0.18"].every(function (v) { return new RegExp("cadre v0\\." + v.slice(3)).test(nr); })
      && man.sealInventory && man.sealInventory.frameV018
      && man.sealInventory.frameV018.sealedHistoricalLots === f14.sealedHistoricalLots
      && man.sealInventory.frameV018.sealedReferences === f14.sealedReferences
      && man.sealInventory.allSeals && man.sealInventory.allSeals.files === f14.sealFiles
      && man.sealInventory.allSeals.references === f14.allSeals.references,
      JSON.stringify(man.sealInventory && man.sealInventory.frameV018));
  }

  console.log("\n" + pass + " PASS, " + fail + " FAIL, " + skipped + " SKIP");
  console.log("DOCUMENTARY_CHECKS_CAUGHT = " + caught + " / DOCUMENTARY_CHECKS_TOTAL = " + total + (skipped ? " (SKIP non comptes : " + skipped + ")" : ""));
  console.log("KNOWN_FALSE_STATEMENTS_REMAINING (mesure, DOC-01..DOC-27 hors DOC-17 qui la compare) = " + DETECTORS.reduce(function (n, d) {
    if (d.id === "DOC-17") return n;
    return n + d.find(Object.assign({}, docs)).filter(function (h) { return !/^SKIP:/.test(h); }).length;
  }, 0));
  console.log("NETWORK_CALLS = 0 | REAL_LLM_CALLS = 0 | REAL_EF02_RUNS = 0 | REAL_PROFESSIONAL_RUNS = 0 | REAL_HUMAN_ACTS = 0");
  process.exit(fail === 0 && caught === total ? 0 : 1);
})();
