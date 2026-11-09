/** Banc de mesure (4 novembre 2026) : pourquoi l'association de F3 ne rend-elle plus
 *  d'orphelins ? On rejoue exactement l'appel du critère et on imprime l'association
 *  entière — abstention comprise. Aucune modification du produit. */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demandeDeTraitement, executerTravail } from "../src/index.js";

const RACINE = join(import.meta.dirname, "..", "..", "..");
const F3 = join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf");

const resultat = await executerTravail(
  demandeDeTraitement(randomUUID(), randomUUID(), {
    document: F3,
    medias: join(RACINE, "fixtures/fichiers/F3"),
    recette: join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json"),
    description: join(RACINE, "fixtures/bibliotheques/F3.json"),
    cache: mkdtempSync(join(tmpdir(), "mesure-f3-")),
  }),
);

const charge = (resultat as { charge?: unknown }).charge ?? resultat;
const assoc = (charge as { association?: Record<string, unknown> }).association;
const res = (charge as { resultat?: Record<string, unknown> }).resultat;

console.log("── association");
console.log("   appariements :", Array.isArray(assoc?.["appariements"]) ? (assoc["appariements"] as unknown[]).length : "?");
console.log("   orphelins    :", JSON.stringify(assoc?.["orphelins"]));
console.log("   manquants    :", JSON.stringify(assoc?.["manquants"]));
console.log("   ABSTENTION   :", JSON.stringify(assoc?.["abstention"], null, 2));
console.log("── résultat");
console.log("   lignes       :", Array.isArray(res?.["lignes"]) ? (res["lignes"] as unknown[]).length : "?");
console.log("   pagesAbsentes:", JSON.stringify(res?.["pagesAbsentes"]));
console.log("   écartés      :", Array.isArray(res?.["ecartes"]) ? (res["ecartes"] as unknown[]).length : "?");
