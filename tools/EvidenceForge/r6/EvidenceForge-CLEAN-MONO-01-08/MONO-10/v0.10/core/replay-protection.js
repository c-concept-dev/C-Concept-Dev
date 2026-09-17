"use strict";
/**
 * MONO-10 v0.10 — core/replay-protection.js   (§9, §10, §11, §12)
 *
 * FERMETURE B3. L'audit de v0.6 a rejoue une attestation deja consommee :
 *
 *   frontiere A (autorite X, cle K) consomme le nonce      -> valid
 *   frontiere B (autorite X, cle K), REPERTOIRE DISTINCT   -> valid AUSSI
 *
 * v0.6 verifiait seulement qu'un store couvrait les autorites de SA frontiere.
 * Le partage effectif du namespace reposait donc sur une CONVENTION de
 * configuration : pointer deux fichiers de configuration vers le meme
 * repertoire. `authorityNamespaceHash` etait calcule, publie… et jamais compare.
 *
 * v0.7 rend le namespace anti-rejeu DERIVE, donc non choisissable :
 *
 *   replayNamespaceId = H( namespace , { authorityId -> keyIds } )
 *   repertoire        = <replayRoot>/<replayNamespaceId>
 *
 * Une frontiere de PRODUCTION ne declare plus de repertoire : elle declare une
 * RACINE, et l'emplacement en decoule. Deux frontieres portant la meme autorite
 * et la meme cle calculent necessairement le meme identifiant, donc partagent
 * la meme reserve — dans le meme processus comme dans un autre.
 *
 * Trois verrous complementaires :
 *   1. derivation      — l'identifiant ne peut pas etre choisi ;
 *   2. marqueur        — la reserve porte `.replay-namespace` ; une reserve dont
 *                        le marqueur diverge est refusee (§11) ;
 *   3. registre de processus — deux frontieres de la meme autorite/cle avec des
 *                        identifiants differents echouent (§10).
 *
 * FERMETURE v0.8 (§21-§24). L'audit A de v0.7 a montre que deux `replayRoot`
 * declarees par le meme exploitant acceptaient le meme nonce : le partage
 * dependait encore d'une VALEUR DE CONFIGURATION. La cle
 * `ANTI_REPLAY_SHARED_AT_AUTHORITY_KEY_SCOPE = YES` etait donc surevaluee.
 *
 * v0.8 : la racine de la reserve n'est plus une valeur de configuration du
 * tout. Elle est ANCREE au fichier de configuration de confiance lui-meme :
 *
 *     reserve = dirname(trustConfigPath)/.evidenceforge-replay/<replayNamespaceId>
 *
 * Pour une configuration de confiance donnee — c'est-a-dire pour une racine de
 * confiance donnee — il existe donc EXACTEMENT UNE reserve par autorite et par
 * cle. `replayRoot` et `directory` sont refuses.
 *
 * Le residu se reduit exactement a l'hypothese deja declaree : deux fichiers de
 * configuration distincts sont DEUX RACINES DE CONFIANCE distinctes
 * (TRUST-MODEL.md §7), pas deux reserves d'une meme racine.
 *
 * DECISION §15 (v0.10) — RENOMMAGE DE LA CONFIGURATION DE CONFIANCE.
 *
 * L'ancre est H(chemin canonique, identite physique). Un RENOMMAGE ou un
 * DEPLACEMENT du fichier de configuration change donc l'ancre, donc
 * `replayNamespaceId`, donc la reserve.
 *
 * Decision retenue : NOUVELLE GENERATION DE CONFIANCE. Renommer la
 * configuration de confiance est un acte d'exploitation qui ouvre une nouvelle
 * generation, avec une reserve neuve. L'alternative — n'ancrer que sur
 * `dev`/`ino` pour que le renommage soit transparent — a ete ECARTEE : les
 * numeros d'inode sont reutilises par le systeme apres suppression, et une
 * configuration sans rapport pourrait alors heriter de la reserve d'une autre.
 *
 * Ce que le contrat garantit : aucun nonce n'est accepte deux fois DANS une
 * generation de confiance. Ce que le contrat NE garantit PAS : la protection
 * anti-rejeu ne traverse pas un changement de generation. Le lot ne pretend pas
 * proteger plus que cela.
 *
 * Ce n'est pas silencieux. `trustConfigAnchor` est engage dans
 * `boundaryDescriptorHash`, donc dans le manifeste de run, donc dans chaque
 * attestation : un changement de generation est visible dans tout artefact
 * produit apres lui. Et seul le detenteur de la racine de confiance peut
 * renommer ce fichier — capacite deja incluse dans la TCB declaree
 * (TRUST-MODEL.md §7), et qui permet de toute facon de remplacer les cles.
 *
 * NOTE DE CONCEPTION (§23). `replayNamespaceId` n'inclut PAS
 * `operatorBoundaryId` : deux frontieres de la meme autorite et de la meme cle
 * doivent PARTAGER la reserve, et inclure leur identifiant respectif
 * detruirait precisement la propriete a garantir. Il inclut en revanche
 * l'identite de la configuration de confiance, et il est engage dans
 * `boundaryDescriptorHash`.
 */

const fs = require("fs");
const path = require("path");
const { isNonEmptyStr, fail, sha256Of } = require("./canonical.js");

const STORE_BRAND = new WeakSet();
const KIND = { MEMORY: "MEMORY", FILE: "FILE" };
const MARKER = ".replay-namespace";

/** §10 — registre de processus : autorite|cle -> namespace anti-rejeu. */
const NAMESPACE_BY_AUTHORITY_KEY = new Map();

/** §9 — la cle logique du nonce : autorite + cle + nonce. Rien d'autre. */
function nonceKey(authorityId, keyId, nonce) { return sha256Of({ a: authorityId, k: keyId || null, n: nonce }); }

/**
 * deriveReplayNamespaceId({ namespace, authorities })
 * `authorities` : [{ authorityId, keyIds: [...] }]
 * La derivation est stable, ordonnee et independante du systeme de fichiers.
 */
function deriveReplayNamespaceId(input) {
  input = input || {};
  const ns = input.namespace === "TEST" ? "TEST" : "PRODUCTION";
  /** §23 — l'ancre de configuration de confiance entre dans la derivation. */
  const anchor = isNonEmptyStr(input.trustConfigAnchor) ? input.trustConfigAnchor : null;
  const list = (input.authorities || []).map(function (a) {
    if (!a || !isNonEmptyStr(a.authorityId)) throw fail("REPLAY_NAMESPACE_INPUT_INVALID", "authorityId requis.");
    return { authorityId: a.authorityId, keyIds: (a.keyIds || []).filter(isNonEmptyStr).slice().sort() };
  }).sort((x, y) => (x.authorityId < y.authorityId ? -1 : x.authorityId > y.authorityId ? 1 : 0));
  if (list.length === 0) throw fail("REPLAY_NAMESPACE_INPUT_INVALID", "au moins une autorite requise.");
  return sha256Of({ namespace: ns, authorities: list, trustConfigAnchor: anchor });
}

/**
 * §6/§7 (v0.9) — FERMETURE R2. L'ancre repose sur l'identite PHYSIQUE du
 * fichier, pas sur la chaine du chemin.
 *
 * v0.8 utilisait `path.resolve`, qui normalise une chaine mais ne suit pas les
 * liens : `/reel/config.json` et `/alias/config.json -> /reel/config.json`
 * donnaient deux ancres differentes, donc deux reserves, donc un nonce
 * rejouable via l'alias. L'audit A l'a montre.
 *
 * v0.9 resout le chemin canonique (`realpathSync`) et, quand le systeme le
 * permet, ajoute l'identite d'inode du fichier. Deux alias du MEME fichier
 * donnent la meme ancre ; deux fichiers reellement distincts restent deux
 * racines de confiance distinctes (§8).
 *
 * Si le chemin canonique ne peut pas etre etabli, on echoue ferme : une ancre
 * approximative vaudrait une reserve approximative.
 */
function trustConfigAnchorOf(trustConfigPath) {
  if (!isNonEmptyStr(trustConfigPath)) return null;
  let real;
  try { real = fs.realpathSync(trustConfigPath); }
  catch (e) {
    throw fail("TRUST_CONFIG_ANCHOR_UNRESOLVABLE",
      "impossible d'etablir le chemin canonique de la configuration de confiance (" + trustConfigPath
      + ") : " + ((e && e.message) || e) + ". Une ancre approximative vaudrait une reserve approximative — fail closed.");
  }
  let physical = null;
  try { const st = fs.statSync(real); physical = { dev: String(st.dev), ino: String(st.ino) }; }
  catch (e) { physical = null; }
  return sha256Of({ trustConfigRealPath: real, physical: physical });
}
/** §22 — l'emplacement de la reserve est DERIVE, jamais configure. */
function reserveDirectoryFor(trustConfigPath, replayNamespaceId) {
  if (!isNonEmptyStr(trustConfigPath)) {
    throw fail("REPLAY_ANCHOR_MISSING",
      "aucune configuration de confiance a laquelle ancrer la reserve : une reserve de PRODUCTION ne se choisit pas.");
  }
  /**
   * §6 (v0.9) — l'EMPLACEMENT aussi doit etre canonique. v0.8 derivait l'ancre
   * d'un cote et le repertoire de l'autre avec `path.resolve` : deux alias du
   * meme fichier produisaient la meme ancre mais DEUX repertoires, donc deux
   * reserves. Le chemin canonique est resolu ici aussi.
   */
  let real;
  try { real = fs.realpathSync(trustConfigPath); }
  catch (e) {
    throw fail("TRUST_CONFIG_ANCHOR_UNRESOLVABLE",
      "impossible d'etablir le chemin canonique de la configuration de confiance (" + trustConfigPath + ") — fail closed.");
  }
  return path.join(path.dirname(real), ".evidenceforge-replay", replayNamespaceId);
}

/** §10 — un couple autorite/cle ne peut pas relever de deux namespaces. */
function assertNamespaceConsistency(replayNamespaceId, authorities, label) {
  const conflicts = [];
  (authorities || []).forEach(function (a) {
    (a.keyIds || []).forEach(function (k) {
      const key = a.authorityId + "|" + k;
      const known = NAMESPACE_BY_AUTHORITY_KEY.get(key);
      if (known && known !== replayNamespaceId) conflicts.push(key);
    });
  });
  if (conflicts.length) {
    throw fail("REPLAY_NAMESPACE_CONFLICT",
      (label || "frontiere") + " : " + conflicts.join(", ") + " releve deja d'un autre namespace anti-rejeu. "
      + "Deux frontieres partageant autorite et cle doivent partager la meme reserve — fail closed.");
  }
  (authorities || []).forEach(function (a) {
    (a.keyIds || []).forEach(function (k) { NAMESPACE_BY_AUTHORITY_KEY.set(a.authorityId + "|" + k, replayNamespaceId); });
  });
  return true;
}

function assertStoreContract(store, label) {
  if (!store || typeof store !== "object") throw fail("REPLAY_STORE_MISSING", (label || "store") + " : absent.");
  ["hasSeen", "getSeen", "markSeen", "checkAndConsume", "coversAuthority"].forEach(function (m) {
    if (typeof store[m] !== "function") throw fail("REPLAY_STORE_INVALID", (label || "store") + " : methode \"" + m + "\" absente.");
  });
  return true;
}
function isProvisionedStore(store) { return !!store && STORE_BRAND.has(store); }
function brand(store) { STORE_BRAND.add(store); return Object.freeze(store); }

/** Reserve EN MEMOIRE — jamais admise en PRODUCTION. */
function createMemoryReplayStore(o) {
  o = o || {};
  const seen = new Map();
  const scope = new Set(o.authorityScope || []);
  if (scope.size === 0) throw fail("REPLAY_STORE_SCOPE_MISSING", "une reserve doit declarer les autorites qu'elle couvre.");
  return brand({
    kind: KIND.MEMORY, persistent: false, shared: false,
    storeId: "memory:" + (o.replayNamespaceId || "anonymous").slice(0, 16),
    replayNamespaceId: o.replayNamespaceId || null,
    authorityScope: Array.from(scope),
    coversAuthority(authorityId) { return scope.has(authorityId); },
    hasSeen(a, k, n) { return seen.has(nonceKey(a, k, n)); },
    getSeen(a, k, n) { return seen.get(nonceKey(a, k, n)) || null; },
    markSeen(a, k, n, meta) { seen.set(nonceKey(a, k, n), meta || {}); return true; },
    checkAndConsume(a, k, n, meta) {
      const key = nonceKey(a, k, n);
      if (seen.has(key)) return { consumed: false, reason: "nonce deja consomme pour cette autorite et cette cle" };
      seen.set(key, Object.assign({ consumedAt: new Date().toISOString() }, meta || {}));
      return { consumed: true, reason: null };
    },
  });
}

/**
 * createFileReplayStore({ replayRoot, replayNamespaceId, authorityScope })
 * Le repertoire est DERIVE : <replayRoot>/<replayNamespaceId>. Aucun appelant,
 * aucune frontiere ne le choisit.
 */
function createFileReplayStore(o) {
  o = o || {};
  if (isNonEmptyStr(o.replayRoot) || isNonEmptyStr(o.directory)) {
    throw fail("REPLAY_LOCATION_REFUSED",
      "replayRoot et directory ne sont plus acceptes : l'emplacement de la reserve est ANCRE au fichier de "
      + "configuration de confiance. Un emplacement choisi permettrait d'ouvrir une seconde reserve pour la meme "
      + "autorite et la meme cle, donc de rejouer un nonce.");
  }
  if (!isNonEmptyStr(o.trustConfigPath)) {
    throw fail("REPLAY_ANCHOR_MISSING", "ancre de configuration de confiance requise pour une reserve persistante.");
  }
  if (!isNonEmptyStr(o.replayNamespaceId) || !/^[0-9a-f]{64}$/.test(o.replayNamespaceId)) {
    throw fail("REPLAY_NAMESPACE_MISSING", "replayNamespaceId derive requis (empreinte du namespace d'autorite).");
  }
  const scope = new Set(o.authorityScope || []);
  if (scope.size === 0) {
    throw fail("REPLAY_STORE_SCOPE_MISSING", "une reserve doit declarer les autorites qu'elle couvre — fail closed.");
  }
  const dir = reserveDirectoryFor(o.trustConfigPath, o.replayNamespaceId);
  fs.mkdirSync(dir, { recursive: true });

  // §11 — marqueur de reserve : une reserve dont le namespace diverge est refusee.
  const markerPath = path.join(dir, MARKER);
  const expected = { replayNamespaceId: o.replayNamespaceId, authorityScope: Array.from(scope).slice().sort() };
  if (fs.existsSync(markerPath)) {
    let found = null;
    try { found = JSON.parse(fs.readFileSync(markerPath, "utf8")); } catch (e) { found = null; }
    if (!found || found.replayNamespaceId !== expected.replayNamespaceId) {
      throw fail("REPLAY_NAMESPACE_MARKER_MISMATCH",
        "la reserve presente porte le namespace \"" + ((found && found.replayNamespaceId) || "illisible")
        + "\" alors que la frontiere derive \"" + expected.replayNamespaceId + "\" — reserve etrangere, fail closed.");
    }
    const missing = expected.authorityScope.filter((a) => (found.authorityScope || []).indexOf(a) === -1);
    if (missing.length) {
      // Le perimetre s'etend : on le consigne, sans jamais le reduire.
      const merged = Array.from(new Set((found.authorityScope || []).concat(expected.authorityScope))).sort();
      fs.writeFileSync(markerPath, JSON.stringify({ replayNamespaceId: expected.replayNamespaceId, authorityScope: merged }));
    }
  } else {
    fs.writeFileSync(markerPath, JSON.stringify(expected));
  }

  const entry = (a, k, n) => path.join(dir, nonceKey(a, k, n) + ".nonce");
  return brand({
    kind: KIND.FILE, persistent: true, shared: true,
    storeId: "file:" + sha256Of({ anchor: trustConfigAnchorOf(o.trustConfigPath), ns: o.replayNamespaceId }).slice(0, 16),
    trustConfigAnchor: trustConfigAnchorOf(o.trustConfigPath),
    /** §11 — identifiant DERIVE, engage par le descripteur de frontiere. */
    replayNamespaceId: o.replayNamespaceId,
    authorityNamespaceHash: sha256Of({ ns: o.replayNamespaceId, scope: expected.authorityScope }),
    authorityScope: Array.from(scope),
    coversAuthority(authorityId) { return scope.has(authorityId); },
    hasSeen(a, k, n) { return fs.existsSync(entry(a, k, n)); },
    getSeen(a, k, n) { try { return JSON.parse(fs.readFileSync(entry(a, k, n), "utf8")); } catch (e) { return null; } },
    markSeen(a, k, n, meta) { try { fs.writeFileSync(entry(a, k, n), JSON.stringify(meta || {}), { flag: "wx" }); return true; } catch (e) { return false; } },
    checkAndConsume(a, k, n, meta) {
      try {
        fs.writeFileSync(entry(a, k, n), JSON.stringify(Object.assign({ consumedAt: new Date().toISOString() }, meta || {})), { flag: "wx" });
        return { consumed: true, reason: null };
      } catch (e) {
        if (e && e.code === "EEXIST") return { consumed: false, reason: "nonce deja consomme (entree persistante existante)" };
        return { consumed: false, reason: "reserve indisponible : " + ((e && e.message) || e) };
      }
    },
  });
}

/**
 * §23 (v0.9) — le helper de reinitialisation du registre de processus n'est
 * PLUS exporte. v0.8 l'exposait sur la surface de production, ce qui permettait
 * d'effacer un garde-fou anti-rejeu par un simple appel.
 *
 * Il n'est plus necessaire : depuis v0.9, `replayNamespaceId` est derive de
 * l'ancre PHYSIQUE de la configuration de confiance, donc deux frontieres de la
 * meme configuration derivent toujours le meme namespace — y compris via un
 * alias — et deux processus distincts n'ont plus besoin d'etre simules.
 */

module.exports = { createMemoryReplayStore, createFileReplayStore, assertStoreContract, isProvisionedStore,
  nonceKey, deriveReplayNamespaceId, trustConfigAnchorOf, reserveDirectoryFor, assertNamespaceConsistency,
  KIND, MARKER };
