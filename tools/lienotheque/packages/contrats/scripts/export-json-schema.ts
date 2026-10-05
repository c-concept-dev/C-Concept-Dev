import { mkdirSync, writeFileSync } from "node:fs";
import { z } from "zod";
import * as C from "../src/index.js";

/** Export JSON Schema des contrats, pour les outils hors TypeScript (sidecars Python, Rust). */
const contrats = { Fichier: C.Fichier, Document: C.Document, Oeuvre: C.Oeuvre, VersionDocument: C.VersionDocument, Ancre: C.Ancre, Lien: C.Lien, CarteSynchro: C.CarteSynchro, Recette: C.Recette, Travail: C.Travail, Operation: C.Operation, ResultatOutil: C.ResultatOutil, DemandeVision: C.DemandeVision, ReponseVision: C.ReponseVision };
mkdirSync("dist/schemas", { recursive: true });
for (const [nom, schema] of Object.entries(contrats)) {
  writeFileSync(`dist/schemas/${nom}.schema.json`, JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }), null, 2));
}
console.log(`${Object.keys(contrats).length} schémas exportés dans dist/schemas/`);
