/** Banc du 4 novembre 2026 — F3 rejoué avec l'inventaire des médias PRODUIT PAR LA VRAIE CHAÎNE.
 *
 *  Le banc précédent passait `provenancesMedias` (la provenance du LOT) et l'abstention
 *  persistait avec « 99 ne disent pas d'où ils viennent » : ce qui compte est la provenance
 *  de CHAQUE média. On lit donc `base/medias.json` de la bibliothèque de TEST, écrit par la
 *  chaîne lors de l'import réel, et on le passe en `inventaireMedias`.
 *
 *  Aucune modification du produit. */
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demandeDeTraitement, executerTravail } from "../src/index.js";

const RACINE = join(import.meta.dirname, "..", "..", "..");
const F3 = join(RACINE, "fixtures/fichiers/F3/'70s Funk & Disco Bass.pdf");
const BIBLIO_TEST = "/Volumes/Macbook Pro/Bibliotheque TEST F3 provenance 2026-11-04";
const PROVENANCE = "zip:e778c311a3c3bc68f63b044065a69af1f83daac17b6c4c8a4349512aeff9458b";

type MediaLu = { nom: string; empreinte: string; provenances?: string[] };
const bruts = JSON.parse(readFileSync(join(BIBLIO_TEST, "base/medias.json"), "utf8")) as MediaLu[];
const inventaire = bruts.map(({ nom, empreinte, provenances }) => ({
  nom,
  empreinte,
  ...(provenances === undefined ? {} : { provenances }),
}));
console.log(`── inventaire lu de la vraie chaîne : ${inventaire.length} média(s), ` +
  `${inventaire.filter((m) => m.provenances?.length).length} avec provenance`);

const t0 = Date.now();
const brut = await executerTravail(
  demandeDeTraitement(randomUUID(), randomUUID(), {
    document: F3,
    medias: join(RACINE, "fixtures/fichiers/F3"),
    inventaireMedias: inventaire,
    provenancesMedias: [PROVENANCE],
    recette: join(RACINE, "fixtures/recettes/methode-pastille-piste.v2.json"),
    description: join(RACINE, "fixtures/bibliotheques/F3.json"),
    cache: mkdtempSync(join(tmpdir(), "f3-inventaire-")),
  }),
);

const charge = (brut as { charge?: unknown }).charge ?? brut;
const assoc = (charge as { association?: Record<string, unknown> }).association;
const res = (charge as { resultat?: Record<string, unknown> }).resultat;
const app = (assoc?.["appariements"] as { statut?: string }[] | undefined) ?? [];

console.log("\n── association, AVEC l'inventaire réel");
console.log("   appariements :", app.length);
console.log("   dont « auto » :", app.filter((a) => a.statut === "auto").length);
console.log("   dont « a_verifier » :", app.filter((a) => a.statut === "a_verifier").length);
console.log("   orphelins :", JSON.stringify(assoc?.["orphelins"]));
console.log("   manquants :", JSON.stringify(assoc?.["manquants"]));
console.log("   abstention :", JSON.stringify(assoc?.["abstention"]));
console.log("── résultat");
console.log("   lignes :", Array.isArray(res?.["lignes"]) ? (res["lignes"] as unknown[]).length : "?");
console.log("   pagesAbsentes :", JSON.stringify(res?.["pagesAbsentes"]));
console.log("── référence : 95 appariements, orphelins [93..98], pagesAbsentes [30,31]");
console.log(`── durée ${((Date.now() - t0) / 1000).toFixed(1)} s`);
