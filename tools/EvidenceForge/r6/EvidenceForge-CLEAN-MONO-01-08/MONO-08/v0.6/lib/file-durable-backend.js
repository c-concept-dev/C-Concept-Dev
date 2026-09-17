"use strict";
/**
 * MONO-08 — lib/file-durable-backend.js
 *
 * REMEDIATION (mission de remediation MONO-01-08, section 5 — preuve
 * CROSS_PROCESS) : implementation de PRODUCTION (fichiers disque) du
 * contrat de backend durable abstrait deja defini et GELE par :
 *   - MONO-01/dependencies/ef-orch-durable-backend-v0.1.js (get/put/has/keys)
 *   - MONO-03/lib/persistence-backend.js (get/put/has/delete/keys)
 * Les DEUX modules documentent explicitement, dans leur propre commentaire
 * d'en-tete, qu'une implementation de production ("IndexedDB ou
 * equivalent") est HORS de leur perimetre et attendue en injection
 * externe — createMono01({efOrchDurableBackend}) / createMono03(
 * {persistenceBackend}) sont la frontiere d'injection deja prevue a cet
 * effet. Ceci EST cet "equivalent" : composition pure, AUCUNE ligne de
 * MONO-01/MONO-03 modifiee.
 *
 * Chaque (namespace, key) devient un fichier JSON individuel sur disque,
 * ecrit de facon atomique (fichier temporaire + rename, jamais une
 * ecriture directe) pour qu'un put() interrompu ne laisse jamais un
 * fichier partiellement ecrit lisible par un futur get(). Le SEUL etat
 * conserve par ce module en memoire de processus est le chemin racine
 * (baseDir) : un second processus Node pointant vers le meme baseDir lit
 * INTEGRALEMENT depuis le disque — aucune structure JS n'est jamais
 * partagee entre deux instances de ce backend, meme dans le meme
 * processus (get() retourne toujours une valeur desincapsulee du JSON
 * relu, jamais une reference vivante).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function keyFileName(key) {
  return crypto.createHash("sha256").update(String(key)).digest("hex") + ".json";
}

function namespaceDirName(namespace) {
  return crypto.createHash("sha256").update(String(namespace)).digest("hex").slice(0, 40);
}

function createFileDurableBackend(baseDir) {
  if (!baseDir) throw new Error("createFileDurableBackend: baseDir requis — jamais un chemin implicite pour un backend de PRODUCTION.");
  fs.mkdirSync(baseDir, { recursive: true });

  function dirFor(namespace) { return path.join(baseDir, namespaceDirName(namespace)); }
  function fileFor(namespace, key) { return path.join(dirFor(namespace), keyFileName(key)); }

  return {
    schema: "EvidenceForge.PersistenceBackend",
    bindingType: "FILE_DURABLE",
    baseDir: baseDir,

    async get(namespace, key) {
      try {
        const raw = await fs.promises.readFile(fileFor(namespace, key), "utf8");
        return JSON.parse(raw).value;
      } catch (e) {
        if (e.code === "ENOENT") return undefined;
        throw e;
      }
    },
    async put(namespace, key, value) {
      const dir = dirFor(namespace);
      await fs.promises.mkdir(dir, { recursive: true });
      const target = fileFor(namespace, key);
      const tmp = target + ".tmp-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
      await fs.promises.writeFile(tmp, JSON.stringify({ namespace: String(namespace), key: String(key), value: value }), "utf8");
      await fs.promises.rename(tmp, target); // rename = commit atomique (jamais une ecriture directe visible partielle)
      return true;
    },
    async has(namespace, key) {
      try {
        await fs.promises.access(fileFor(namespace, key), fs.constants.F_OK);
        return true;
      } catch (e) {
        return false;
      }
    },
    async delete(namespace, key) {
      try {
        await fs.promises.unlink(fileFor(namespace, key));
        return true;
      } catch (e) {
        if (e.code === "ENOENT") return false;
        throw e;
      }
    },
    async keys(namespace) {
      const dir = dirFor(namespace);
      let entries;
      try {
        entries = await fs.promises.readdir(dir);
      } catch (e) {
        if (e.code === "ENOENT") return [];
        throw e;
      }
      const out = [];
      for (const entry of entries) {
        if (entry.includes(".tmp-")) continue; // ecriture concurrente en cours, jamais une cle valide
        // REMEDIATION R2 (M-03) : avant ce correctif, TOUTE erreur ici
        // (fichier disparu entre readdir()/readFile(), permission refusee,
        // erreur IO reelle, JSON corrompu) etait absorbee de facon
        // identique et silencieuse — une corruption disque reelle
        // n'etait donc jamais distinguable d'une simple course benigne de
        // suppression concurrente. Distingue desormais explicitement :
        //   - ENOENT sur readFile() : course benigne (le fichier a
        //     legitimement disparu entre le readdir() et ce readFile(),
        //     ex. delete() concurrent) — silencieusement ignore, une cle
        //     qui n'existe plus n'est jamais une erreur.
        //   - toute autre erreur readFile() (permission/IO reelle) : JAMAIS
        //     absorbee — relancee, fail-closed comme le reste de ce
        //     backend.
        //   - JSON invalide (fichier present, lu avec succes, mais
        //     contenu corrompu) : JAMAIS traite comme une absence de cle
        //     — relance explicitement, une cle existante mais illisible
        //     n'est jamais silencieusement equivalente a une cle absente.
        let raw;
        try {
          raw = await fs.promises.readFile(path.join(dir, entry), "utf8");
        } catch (e) {
          if (e.code === "ENOENT") continue;
          throw new Error("createFileDurableBackend.keys(\"" + namespace + "\"): lecture de \"" + entry + "\" a echoue (" + e.code + ") — jamais silencieusement ignoree.");
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          throw new Error("createFileDurableBackend.keys(\"" + namespace + "\"): contenu corrompu (JSON invalide) pour \"" + entry + "\" — une cle existante et illisible n'est jamais silencieusement traitee comme une absence de cle.");
        }
        out.push(parsed.key);
      }
      return out;
    },
  };
}

module.exports = { createFileDurableBackend };
