/** Ce que le seuil de corroboration coûte, sur des documents entiers (REC-02, OUT-10).
 *
 *  Le seuil est un **nombre nu** : `Math.min(vivier, Math.max(8, Math.ceil(vivier / 2)))`. Il vaut
 *  8 pour la moitié de la collection — les cinquante-deux documents de neuf à douze
 *  enregistrements. D'où vient ce 8 n'est pas établi, et **ce qu'il coûte n'a jamais été mesuré**.
 *
 *  Christophe l'a demandé le 6 novembre 2026, et il a corrigé l'erreur de raisonnement qui
 *  m'avait fait écarter la tranche 9–12 : **un vivier de neuf publie avec huit rangées justes**.
 *  C'est le cas le plus tendu, pas un cas exclu.
 *
 *  **Documents entiers.** Un extrait de huit pages sur cent seize ne peut structurellement pas
 *  porter huit rangées de table — le banc d'extraits ne mesure donc pas le seuil, il mesure sa
 *  propre découpe.
 *
 *  Lecture seule, sortie hors de toute bibliothèque, aucun appel en ligne.
 *
 *  Usage : le-seuil-de-corroboration.ts <dossier des documents> <sortie.json>
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { instantaneDeLot } from "../src/lot.js";
import type { ConstatDeTable } from "../src/index.js";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const [racine, sortie] = process.argv.slice(2);
if (racine === undefined || sortie === undefined) {
  console.error("usage : le-seuil-de-corroboration.ts <dossier des documents> <sortie.json>");
  process.exit(2);
}
const DESCRIPTION = join(import.meta.dirname, "../../../fixtures/bibliotheques/banc-extraits.json");

const jeux = readdirSync(racine)
  .map((nom) => join(racine, nom))
  .filter((d) => statSync(d).isDirectory() && existsSync(join(d, "inventaire.json")));

type Ligne = {
  readonly jeu: string;
  readonly pages: number;
  readonly enregistrements: number;
  readonly elements: number;
  readonly folios: number;
  readonly abstention: string | null;
  readonly minimumRequis: number;
  /** La meilleure table du document : ce qu'elle portait, ce qu'elle recoupe, et ce qui l'a écartée. */
  readonly meilleure: ConstatDeTable | null;
  readonly constats: readonly ConstatDeTable[];
  readonly secondes: number;
};

const resultats: Ligne[] = [];
for (const jeu of jeux) {
  const nom = basename(jeu);
  const pdf = readdirSync(jeu).find((n) => n.toLowerCase().endsWith(".pdf"));
  if (pdf === undefined) {
    console.log(`  ${nom} : aucun PDF`);
    continue;
  }
  const inventaire = JSON.parse(readFileSync(join(jeu, "inventaire.json"), "utf8")) as readonly {
    nom: string;
    empreinte: string;
  }[];
  const debut = Date.now();
  try {
    const traite = await instantaneDeLot({
      pdf: join(jeu, pdf),
      // Aucun fichier audio n'est extrait : la chaîne ne lit d'un enregistrement que son nom et
      // son empreinte, et les empreintes ont été calculées en flux sur les octets de l'archive.
      medias: join(jeu, "medias-absents"),
      provenancesMedias: [`seuil:${nom}`],
      inventaireMedias: inventaire.map((media) => ({ ...media, provenances: [`seuil:${nom}`] })),
      description: DESCRIPTION,
    });
    const vue = traite.vue;
    const constats = traite.constatsDeTable;
    // La meilleure : celle qui recoupe le plus, et à égalité celle qui portait le plus de rangées.
    const meilleure =
      [...constats].sort(
        (un, autre) => autre.recoupees - un.recoupees || autre.utilisables - un.utilisables,
      )[0] ?? null;
    const ligne: Ligne = {
      jeu: nom,
      pages: vue.pages.length,
      enregistrements: inventaire.length,
      elements: vue.pages.reduce((somme, page) => somme + page.elements.length, 0),
      folios: vue.pages.filter((page) => page.numero !== undefined).length,
      abstention: traite.association.abstention?.raison ?? null,
      minimumRequis: constats[0]?.minimumRequis ?? 0,
      meilleure,
      constats,
      secondes: Number(((Date.now() - debut) / 1000).toFixed(1)),
    };
    resultats.push(ligne);
    console.log(
      `  ${nom.slice(0, 40).padEnd(40)} ${String(ligne.pages).padStart(3)} p · ` +
        `${String(ligne.enregistrements).padStart(3)} enr · ${String(ligne.elements).padStart(3)} élém · ` +
        `seuil ${String(ligne.minimumRequis).padStart(2)} · ` +
        `meilleure table : ${meilleure === null ? "aucune" : `${meilleure.recoupees} recoupée(s) sur ${meilleure.utilisables} — ${meilleure.verdict}`} · ` +
        `${ligne.abstention ?? "publie"} · ${ligne.secondes} s`,
    );
  } catch (souci) {
    console.log(`  ${nom.slice(0, 40).padEnd(40)} ÉCHEC : ${String((souci as Error).message)}`);
  }
  writeFileSync(sortie, `${JSON.stringify(resultats, undefined, 1)}\n`);
}
console.log(`\nécrit : ${sortie}`);
