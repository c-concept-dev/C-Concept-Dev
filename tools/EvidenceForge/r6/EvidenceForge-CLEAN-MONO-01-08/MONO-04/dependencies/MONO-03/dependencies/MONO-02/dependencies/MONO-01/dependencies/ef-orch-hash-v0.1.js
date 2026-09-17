// EvidenceForge — EF-ORCH — canonicalJson() + chaîne de hash — v0.1
// Fondation commune à runContractHash, protocolHash (déjà existant, format compatible),
// registrySnapshotHash et documentHashes. Aucune dépendance réseau, aucun LLM.
//
// Principe : deux objets JSON sémantiquement identiques doivent produire le même hash,
// quel que soit l'ordre de saisie de leurs clés ou leur mise en forme — sinon
// runContractHash cesse d'être reproductible d'une exécution à l'autre.
"use strict";

// ---------------------------------------------------------------------------
// canonicalJson(value)
// Sérialise récursivement en tri des clés d'objet, ordre des tableaux conservé,
// aucune indentation, types JSON stricts. Rejette explicitement toute valeur
// qui n'a pas de représentation JSON fiable plutôt que de la convertir en silence
// (cohérent avec le principe déjà établi ailleurs dans EvidenceForge : signaler
// plutôt que masquer).
// ---------------------------------------------------------------------------
function canonicalJson(value) {
  return serialize(value);

  function serialize(v) {
    if (v === null) return "null";

    const t = typeof v;

    if (t === "boolean") return v ? "true" : "false";

    if (t === "number") {
      if (!Number.isFinite(v)) {
        throw new TypeError(
          "canonicalJson: valeur numérique non finie (" + String(v) + ") — NaN/Infinity n'ont pas de représentation JSON stable."
        );
      }
      return String(v);
    }

    if (t === "string") return JSON.stringify(v);

    if (t === "undefined") {
      throw new TypeError("canonicalJson: undefined n'a pas de représentation JSON — omettre la clé explicitement en amont.");
    }

    if (t === "function" || t === "symbol") {
      throw new TypeError("canonicalJson: type non sérialisable (" + t + ").");
    }

    if (t === "bigint") {
      throw new TypeError("canonicalJson: bigint n'a pas de représentation JSON standard — convertir en string en amont si nécessaire.");
    }

    if (Array.isArray(v)) {
      // Ordre des tableaux volontairement conservé : il porte une information
      // (ex. ordre des requêtes, ordre des critères) qu'on ne doit jamais réordonner.
      // Un élément undefined dans un tableau lève déjà TypeError via serialize()
      // ci-dessous (branche t === "undefined") — même politique stricte que pour
      // les propriétés d'objet.
      return "[" + v.map(serialize).join(",") + "]";
    }

    if (t === "object") {
      // Date, RegExp, Map, Set etc. n'ont pas de représentation JSON canonique
      // évidente : on refuse plutôt que de deviner (Date.toJSON() dépend du fuseau
      // d'appel, Map/Set n'ont pas d'équivalent JSON natif).
      const tag = Object.prototype.toString.call(v);
      if (tag !== "[object Object]") {
        throw new TypeError("canonicalJson: objet non sérialisable de façon fiable (" + tag + ") — convertir explicitement en amont.");
      }
      // Politique stricte (durcissement demandé) : une clé ABSENTE et une clé
      // PRÉSENTE valant undefined ne sont pas équivalentes. JSON.stringify natif
      // les confond silencieusement (il omet les deux) ; pour une fonction dont
      // le rôle est l'intégrité cryptographique d'un contrat, ce masquage est
      // précisément ce qu'on veut interdire. Une clé absente ne lève rien ; une
      // clé présente à undefined force l'appelant à la supprimer explicitement
      // avant hachage, plutôt que de laisser la différence d'état disparaître
      // dans le hash.
      const keys = Object.keys(v).sort();
      const parts = [];
      for (const k of keys) {
        const val = v[k];
        parts.push(JSON.stringify(k) + ":" + serialize(val)); // serialize(undefined) lève déjà TypeError via la branche t === "undefined"
      }
      return "{" + parts.join(",") + "}";
    }

    throw new TypeError("canonicalJson: type inattendu (" + t + ").");
  }
}

// ---------------------------------------------------------------------------
// sha256Bytes(bytes) -> hex string
// Fondation unique pour tous les hash du pipeline (documents binaires compris).
// ---------------------------------------------------------------------------
async function sha256Bytes(bytes) {
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// sha256CanonicalJson(value) -> hex string
// UTF-8 explicite (TextEncoder), jamais dépendant de l'encodage par défaut de l'environnement.
// ---------------------------------------------------------------------------
async function sha256CanonicalJson(value) {
  const text = canonicalJson(value);
  const bytes = new TextEncoder().encode(text);
  return sha256Bytes(bytes);
}

// ---------------------------------------------------------------------------
// sha256File(bytes) -> hex string
// Alias explicite : un fichier binaire est haché sur ses octets bruts, jamais
// via canonicalJson (qui ne s'applique qu'aux structures JSON).
// ---------------------------------------------------------------------------
async function sha256File(bytes) {
  return sha256Bytes(bytes);
}

// ---------------------------------------------------------------------------
// computeRunContractHash(runContract) -> hex string
// Exclut uniquement le champ runContractHash lui-même (s'il est déjà présent,
// par exemple lors d'une revérification). Ne modifie jamais l'objet passé.
// ---------------------------------------------------------------------------
async function computeRunContractHash(runContract) {
  const { runContractHash, ...rest } = runContract || {};
  return sha256CanonicalJson(rest);
}

// ---------------------------------------------------------------------------
// computeRegistrySnapshotHash(registry) -> hex string
// Même règle que ci-dessus, appliquée à un ExclusionRegistrySet (EF-GOV-REG-v1).
// ---------------------------------------------------------------------------
async function computeRegistrySnapshotHash(registry) {
  const { registrySnapshotHash, ...rest } = registry || {};
  return sha256CanonicalJson(rest);
}

// ---------------------------------------------------------------------------
// Helpers de vérification — ne recalculent rien de nouveau, ne font que comparer.
// ---------------------------------------------------------------------------
async function verifyCanonicalHash(value, expectedHash) {
  const actual = await sha256CanonicalJson(value);
  return actual === expectedHash;
}

async function verifyFileHash(bytes, expectedHash) {
  const actual = await sha256File(bytes);
  return actual === expectedHash;
}

// Export compatible <script> classique (window.EFOrchHash) et Node (module.exports),
// pour pouvoir être testée ici puis embarquée telle quelle dans le futur monolithe.
const EFOrchHash = {
  canonicalJson,
  sha256Bytes,
  sha256CanonicalJson,
  sha256File,
  computeRunContractHash,
  computeRegistrySnapshotHash,
  verifyCanonicalHash,
  verifyFileHash
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = EFOrchHash;
}
if (typeof window !== "undefined") {
  window.EFOrchHash = EFOrchHash;
}
