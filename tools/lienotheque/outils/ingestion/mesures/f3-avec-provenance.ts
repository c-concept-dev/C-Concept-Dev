/** Banc du 4 novembre 2026 : F3 rejoué avec la provenance que la vraie chaîne a enregistrée.
 *
 *  Deux questions d'un coup :
 *   1. la provenance lève-t-elle l'abstention « vivier_non_borne » ?
 *   2. la mort du moteur observée dans l'application se reproduit-elle hors d'elle ?
 *
 *  Aucune modification du produit. */
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demandeDeTraitement, executerTravail } from "../src/index.js";

const RACINE = join(import.meta.dirname, "..", "..", "..");
const F3 = join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf");
// La provenance relevée dans base/medias.json de la bibliothèque de TEST, après import réel.
const PROVENANCE = "zip:e778c311a3c3bc68f63b044065a69af1f83daac17b6c4c8a4349512aeff9458b";

const t0 = Date.now();
let etape = "démarrage";
process.on("exit", (code) => {
  console.log(`\n── sortie code=${code} après ${((Date.now() - t0) / 1000).toFixed(1)} s, dernière étape : ${etape}`);
  const m = process.memoryUsage();
  console.log(`   mémoire : rss ${(m.rss / 1e6).toFixed(0)} Mo, tas ${(m.heapUsed / 1e6).toFixed(0)} Mo`);
});

etape = "executerTravail";
const brut = await executerTravail(
  demandeDeTraitement(randomUUID(), randomUUID(), {
    document: F3,
    medias: join(RACINE, "fixtures/fichiers/F3"),
    provenancesMedias: [PROVENANCE],
    recette: join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json"),
    description: join(RACINE, "fixtures/bibliotheques/F3.json"),
    cache: mkdtempSync(join(tmpdir(), "f3-provenance-")),
  }),
);
etape = "lecture du résultat";

const charge = (brut as { charge?: unknown }).charge ?? brut;
const assoc = (charge as { association?: Record<string, unknown> }).association;
const res = (charge as { resultat?: Record<string, unknown> }).resultat;
const app = (assoc?.["appariements"] as { statut?: string }[] | undefined) ?? [];

console.log("── association, AVEC provenance");
console.log("   appariements :", app.length);
console.log("   dont « auto » :", app.filter((a) => a.statut === "auto").length);
console.log("   dont « a_verifier » :", app.filter((a) => a.statut === "a_verifier").length);
console.log("   orphelins :", JSON.stringify(assoc?.["orphelins"]));
console.log("   manquants :", JSON.stringify(assoc?.["manquants"]));
console.log("   abstention :", JSON.stringify(assoc?.["abstention"]));
console.log("── résultat");
console.log("   lignes :", Array.isArray(res?.["lignes"]) ? (res["lignes"] as unknown[]).length : "?");
console.log("   pagesAbsentes :", JSON.stringify(res?.["pagesAbsentes"]));
console.log("   écartés :", Array.isArray(res?.["ecartes"]) ? (res["ecartes"] as unknown[]).length : "?");
console.log("── référence attendue : 95 appariements, orphelins [93..98], pagesAbsentes [30,31]");
