"use strict";
/**
 * MONO-06 — static-search-runner.js  (T06-13, T06-14, T06-15)
 *
 * Recherche statique sur la BASELINE PRISTINE de chaque artefact.
 *
 * CORRECTION POST-AUDIT INDEPENDANT (30 aout 2026) — BUG T06-15 CRITIQUE :
 * une version anterieure excluait AUTOMATIQUEMENT toute occurrence de
 * secret situee dans .md/test/tests/fixtures/scripts, sur la seule base
 * du chemin. L'audit a demontre que c'est un FAUX VERT : un secret reel
 * place dans README.md ou dans test/fixture.js passait silencieusement
 * en PASS. Le chemin d'un fichier ne prouve JAMAIS qu'une valeur est
 * synthetique.
 *
 * T06-15 est desormais FAIL-CLOSED : recherche sur TOUS les fichiers
 * texte du paquet (baseline pristine), sans aucune exclusion par
 * dossier/extension. Une occurrence est TOUJOURS un hit, sauf si elle
 * correspond EXACTEMENT (fichier + hash de la valeur trouvee) a une
 * entree de l'allowlist explicite ci-dessous — jamais par dossier, jamais
 * par extension, jamais par "ca ressemble a un test".
 *
 * SECURITE — LES VALEURS DETECTEES NE SONT JAMAIS RECOPIEES EN CLAIR
 * (deuxieme correction post-audit) : le rapport ne contient qu'une forme
 * redigee (redactSecret) et un hash — jamais la chaine complete, ni dans
 * stdout, ni dans le JSON, ni dans une exception.
 *
 * T06-13 (hardcoding pilote, scope MONO-00->05 hors dependencies/.md/
 * test/scripts) et T06-14 (derive epistemique, hors .md/test) restent
 * inchanges — l'audit n'a signale aucun defaut sur ces deux checks.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PILOT_TOKENS = ["JMJS", "JMMJS", "S01", "S02", "DIMS", "d4", "d5"];
const EPISTEMIC_FORBIDDEN = [
  "les experts valident",
  "Pr X pense",
  "consensus d'experts",
  "consensus d’experts",
  "preuve scientifique",
  "opinion professionnelle de",
  "truthScore"
];
const SECRET_PATTERNS = [
  { id: "sk-prefix", re: /sk-[A-Za-z0-9_-]{10,}/g },
  { id: "bearer-token", re: /Bearer\s+[A-Za-z0-9._-]{10,}/g },
  { id: "authorization-header", re: /Authorization["']?\s*[:=]\s*["'][^"'\s]{10,}["']/g },
  { id: "api-key-assignment", re: /(api[_-]?key)["']?\s*[:=]\s*["'][^"'\s]{6,}["']/gi },
  { id: "password-assignment", re: /password["']?\s*[:=]\s*["'][^"'\s]{4,}["']/gi }
];

/**
 * ALLOWLIST DE SECRETS SYNTHETIQUES — par valeur exacte + fichier exact
 * UNIQUEMENT, jamais par dossier. Chaque entree a ete verifiee
 * individuellement le 30 aout 2026 : la valeur est un marqueur synthetique
 * documente par le lot gele lui-meme (son propre README/CDC-TRACE la
 * designe explicitement comme jamais reelle), utilisee pour prouver
 * qu'un vrai secret ne fuite jamais (redaction, non-serialisation,
 * non-journalisation). Retirer un lot gele de cette liste sans revalider
 * chaque instance serait une regression de securite du harnais lui-meme.
 */
const KNOWN_SYNTHETIC_SECRETS = [
  // MONO-04 — marqueur synthetique documente dans reports/mono-04-security-report-v1.md
  // et exercee par ses propres tests d'idempotence/redaction (test_t04_15_18_*).
  { artifactId: "MONO-04", file: "reports/mono-04-security-report-v1.md", valueSha256: "1e78a62605ffa200ad76217c1540a1f84da816c7e0e8acba13da37f5301cf350", justification: "Marqueur synthetique documente par le rapport de securite du lot lui-meme (voir redactedSample), jamais une cle reelle." },
  { artifactId: "MONO-04", file: "reports/mono-04-static-search-report-v1.md", valueSha256: "e3d002283512914cb8acb3bcdb64260aeaec15b5feefc481b262a8ddedac2587", justification: "Meme marqueur synthetique que l'entree precedente (prefixe tronque par la prose du rapport)." },
  { artifactId: "MONO-04", file: "test/test_t04_15_18_idempotence_redaction_payload.js", valueSha256: "1e78a62605ffa200ad76217c1540a1f84da816c7e0e8acba13da37f5301cf350", justification: "Fixture du test qui verifie que ce marqueur synthetique est bien redige — jamais serialise." },
  { artifactId: "MONO-04", file: "test/test_t04_15_18_idempotence_redaction_payload.js", valueSha256: "11202a6de18309063b68b33dcb39e10322e69426744de805bc3c4076e2a68943", justification: "Meme marqueur synthetique, forme 'Bearer <marqueur>' utilisee par le meme test de redaction." },
  { artifactId: "MONO-04", file: "test/test_t04_32_38_persistence_diagnostics_secrets.js", valueSha256: "1b69fa4749fff9ff1bf8918dc0a036e2944392dbc275019c53f6490a3a65e758", justification: "Marqueur synthetique (voir redactedSample), verifie par le test comme jamais persiste en clair." },
  { artifactId: "MONO-04", file: "test/test_t04_idempotence_conflict_01_07.js", valueSha256: "a89a9be71bea177966c191e26d430275beca202b6f7d2164809080fd27a6e914", justification: "Marqueur synthetique (voir redactedSample), verifie par le test comme absent du fingerprint/logs." },
  // MONO-05 — marqueur synthetique documente dans son propre README (test XSS/secret-leak)
  { artifactId: "MONO-05", file: "README.md", valueSha256: "f5f057f22290c028654655148cef6ad2e3f247b4ff298f793333fdf7e3a2dda8", justification: "Marqueur synthetique (voir redactedSample) documente explicitement par le README du lot comme jamais reel, utilise par le test de fuite de secret navigateur." },
  { artifactId: "MONO-05", file: "reports/mono-05-security-report-v1.md", valueSha256: "f5f057f22290c028654655148cef6ad2e3f247b4ff298f793333fdf7e3a2dda8", justification: "Meme marqueur synthetique, rapporte dans le rapport de securite du lot." },
  { artifactId: "MONO-05", file: "test/browser/test_t05_browser_core.js", valueSha256: "f5f057f22290c028654655148cef6ad2e3f247b4ff298f793333fdf7e3a2dda8", justification: "Fixture du test navigateur reel qui verifie l'absence de fuite de ce marqueur (DOM/localStorage/sessionStorage/console)." },
  // MONO-05 imbrique dependencies/MONO-04 (copie bytewise) : memes marqueurs MONO-04 ci-dessus, sous un chemin imbrique different.
  { artifactId: "MONO-05", file: "dependencies/MONO-04/reports/mono-04-security-report-v1.md", valueSha256: "1e78a62605ffa200ad76217c1540a1f84da816c7e0e8acba13da37f5301cf350", justification: "Copie bytewise nichee de l'entree MONO-04 ci-dessus, deja verifiee." },
  { artifactId: "MONO-05", file: "dependencies/MONO-04/reports/mono-04-static-search-report-v1.md", valueSha256: "e3d002283512914cb8acb3bcdb64260aeaec15b5feefc481b262a8ddedac2587", justification: "Copie bytewise nichee de l'entree MONO-04 ci-dessus, deja verifiee." },
  { artifactId: "MONO-05", file: "dependencies/MONO-04/test/test_t04_15_18_idempotence_redaction_payload.js", valueSha256: "1e78a62605ffa200ad76217c1540a1f84da816c7e0e8acba13da37f5301cf350", justification: "Copie bytewise nichee de l'entree MONO-04 ci-dessus, deja verifiee." },
  { artifactId: "MONO-05", file: "dependencies/MONO-04/test/test_t04_15_18_idempotence_redaction_payload.js", valueSha256: "11202a6de18309063b68b33dcb39e10322e69426744de805bc3c4076e2a68943", justification: "Copie bytewise nichee de l'entree MONO-04 ci-dessus, deja verifiee." },
  { artifactId: "MONO-05", file: "dependencies/MONO-04/test/test_t04_32_38_persistence_diagnostics_secrets.js", valueSha256: "1b69fa4749fff9ff1bf8918dc0a036e2944392dbc275019c53f6490a3a65e758", justification: "Copie bytewise nichee de l'entree MONO-04 ci-dessus, deja verifiee." },
  { artifactId: "MONO-05", file: "dependencies/MONO-04/test/test_t04_idempotence_conflict_01_07.js", valueSha256: "a89a9be71bea177966c191e26d430275beca202b6f7d2164809080fd27a6e914", justification: "Copie bytewise nichee de l'entree MONO-04 ci-dessus, deja verifiee." }
];

const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".zip", ".ico", ".woff", ".woff2"]);
const SKIP_DIR_NAMES = new Set(["node_modules", ".git"]);

function isTestOrFixturePath(relPath) {
  // Utilise UNIQUEMENT par T06-13/14 (hardcoding pilote / derive epistemique),
  // jamais par T06-15 (secrets) depuis la correction post-audit.
  return /(^|\/)(test|tests|fixtures|scripts)(\/|$)/i.test(relPath);
}

function isDocumentationPath(relPath) {
  if (path.extname(relPath).toLowerCase() === ".md") return true;
  if (/(^|\/)registry\//i.test(relPath) && path.extname(relPath).toLowerCase() === ".json") return true;
  return false;
}

function listTextFiles(rootAbs, { excludeDirNames = [] } = {}) {
  const skip = new Set([...SKIP_DIR_NAMES, ...excludeDirNames]);
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXT.has(ext)) continue;
      out.push(path.join(dir, entry.name));
    }
  })(rootAbs);
  return out;
}

function wordBoundaryRegex(token) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "g");
}

function sha256String(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/**
 * Forme rediguee obligatoire pour tout rapport — ne JAMAIS renvoyer la
 * valeur complete. Conserve seulement de quoi confirmer visuellement le
 * type de motif (prefixe/suffixe courts), jamais assez pour reconstituer
 * la valeur.
 */
function redactSecret(value) {
  if (value.length <= 8) return "[REDACTED]";
  return `${value.slice(0, 4)}…${value.slice(-4)} [REDACTED]`;
}

function searchPilotHardcoding(baselineDir, artifact) {
  if (artifact && artifact.group !== "MONO") {
    return { status: "OUT_OF_SCOPE", reason: "Regle limitee a MONO-00->05 (REGLES-ANTI-DERIVE.md) — non applicable aux lots historiques.", hits: [] };
  }
  const files = listTextFiles(baselineDir, { excludeDirNames: ["dependencies"] });
  const hits = [];
  for (const abs of files) {
    const rel = path.relative(baselineDir, abs);
    if (isDocumentationPath(rel) || isTestOrFixturePath(rel)) continue;
    let content;
    try { content = fs.readFileSync(abs, "utf8"); } catch { continue; }
    for (const token of PILOT_TOKENS) {
      const matches = content.match(wordBoundaryRegex(token));
      if (matches) hits.push({ file: rel, token, count: matches.length });
    }
  }
  return { status: hits.length === 0 ? "PASS" : "FAIL", hits };
}

function searchEpistemicDrift(baselineDir) {
  const files = listTextFiles(baselineDir);
  const hits = [];
  for (const abs of files) {
    const rel = path.relative(baselineDir, abs);
    if (isDocumentationPath(rel) || isTestOrFixturePath(rel)) continue;
    let content;
    try { content = fs.readFileSync(abs, "utf8"); } catch { continue; }
    const lower = content.toLowerCase();
    for (const phrase of EPISTEMIC_FORBIDDEN) {
      if (lower.includes(phrase.toLowerCase())) hits.push({ file: rel, phrase });
    }
  }
  return { status: hits.length === 0 ? "PASS" : "FAIL", hits };
}

/**
 * T06-15 — FAIL-CLOSED (correction post-audit). Aucune exclusion par
 * dossier ou extension. Chaque fichier texte du paquet est scanne.
 * Seule une correspondance EXACTE (artifactId + fichier + hash de la
 * valeur) avec KNOWN_SYNTHETIC_SECRETS exempte une occurrence — et meme
 * alors, elle reste visible dans excludedAsSynthetic (jamais silencieuse).
 * Aucune valeur complete n'est jamais placee dans le resultat retourne.
 */
function searchRealSecrets(baselineDir, artifact) {
  const artifactId = artifact ? artifact.id : undefined;
  const files = listTextFiles(baselineDir);
  const hits = [];
  const excludedAsSynthetic = [];

  for (const abs of files) {
    const rel = path.relative(baselineDir, abs);
    let content;
    try { content = fs.readFileSync(abs, "utf8"); } catch { continue; }

    for (const { id: patternId, re } of SECRET_PATTERNS) {
      const matches = [...content.matchAll(re)];
      for (const m of matches) {
        const value = m[0];
        const valueSha256 = sha256String(value);
        const allowlisted = KNOWN_SYNTHETIC_SECRETS.find(
          (entry) => entry.artifactId === artifactId && entry.file === rel && entry.valueSha256 === valueSha256
        );
        if (allowlisted) {
          excludedAsSynthetic.push({
            file: rel,
            patternId,
            redactedSample: redactSecret(value),
            valueSha256,
            justification: allowlisted.justification
          });
        } else {
          hits.push({
            file: rel,
            patternId,
            redactedSample: redactSecret(value),
            valueSha256
          });
        }
      }
    }
  }

  return { status: hits.length === 0 ? "PASS" : "FAIL", hits, excludedAsSynthetic };
}

module.exports = {
  searchPilotHardcoding,
  searchEpistemicDrift,
  searchRealSecrets,
  listTextFiles,
  isTestOrFixturePath,
  isDocumentationPath,
  redactSecret,
  sha256String,
  KNOWN_SYNTHETIC_SECRETS
};
