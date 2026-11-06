/** Combien de documents du corpus sont des numérisations partielles ? (OUT-01)
 *
 *  Relevé le 6 novembre 2026 : Aebersold 017 annonce ses sections aux pages imprimées 1, 10, 19,
 *  28, 37 et 38 — et le PDF de l'archive porte **quatorze feuilles**. Les trois sections
 *  transposées manquent.
 *
 *  Un document amputé n'est pas un document difficile : c'est un document dont la moitié n'est
 *  pas là, et aucune lecture ne le rattrapera. Le mesurer avant de mesurer autre chose évite
 *  d'attribuer à la chaîne ce qui vient du corpus.
 *
 *  La méthode ne suppose rien d'un éditeur : on lit la **première page qui porte un sommaire** —
 *  celle dont les nombres de fin de ligne montent — et on compare le plus grand folio annoncé au
 *  nombre de feuilles du PDF.
 *
 *  Lecture seule. Les archives sont ouvertes, jamais modifiées.
 *
 *  Usage : numerisations-partielles.ts <dossier des PDF> <sortie.json>
 */
import { mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { lignesDeMots, valeurDeCellule } from "@lienotheque/noyau";
import { enGris } from "@lienotheque/images";
import { coucheSuffisante, lireCoucheTexte, ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

if (process.env["LIENOTHEQUE_JETON"] !== undefined) {
  console.error("Un jeton est présent dans l'environnement : arrêt (règle du 4 novembre 2026).");
  process.exit(2);
}
const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const OCR = { binaire: join(MOTEURS, "bin/tesseract"), tessdata: join(MOTEURS, "tessdata") };
const [racine, sortie] = process.argv.slice(2);
if (racine === undefined || sortie === undefined) {
  console.error("usage : numerisations-partielles.ts <dossier des PDF> <sortie.json>");
  process.exit(2);
}
/** Jusqu'où chercher le sommaire. Il est au début, et chercher plus loin coûterait la lecture de
 *  tout le document pour une page. */
const PREMIERES = 5;

type Releve = {
  readonly jeu: string;
  readonly feuilles: number;
  readonly pageDuSommaire: number | null;
  readonly folioMaximalAnnonce: number | null;
  readonly folios: readonly number[];
  readonly partiel: boolean | null;
};

const releves: Releve[] = [];
const bac = mkdtempSync(join(tmpdir(), "lienotheque-partiel-"));
try {
  for (const nom of readdirSync(racine).filter((n) => n.toLowerCase().endsWith(".pdf")).sort()) {
    const pdf = join(racine, nom);
    try {
      const couche = await lireCoucheTexte(pdf);
      const parRang = new Map(couche.pages.map((page) => [page.index, page]));
      const rendu = await ouvrirRenduPdf(pdf);
      const feuilles = rendu.nombreDePages;
      let meilleur: { page: number; folios: number[] } | undefined;
      try {
        for (let rang = 1; rang <= Math.min(PREMIERES, feuilles); rang += 1) {
          const deLaCouche = parRang.get(rang);
          const page =
            deLaCouche !== undefined && coucheSuffisante(deLaCouche)
              ? deLaCouche
              : ocrDUnePageGrise(enGris(await rendu.page(rang, 1800)), rang, bac, OCR);
          // Un sommaire : des lignes qui finissent par un nombre, et ces nombres montent.
          const fins = lignesDeMots(page.mots).flatMap((ligne) => {
            const dernier = ligne.mots.at(-1);
            const valeur = dernier === undefined ? undefined : valeurDeCellule(dernier.texte);
            return valeur === undefined || ligne.mots.length < 2 ? [] : [valeur];
          });
          if (fins.length < 4) continue;
          const montants = fins.filter((valeur, rangFin) => rangFin === 0 || valeur >= fins[rangFin - 1]!);
          if (montants.length * 2 < fins.length) continue;
          if (meilleur === undefined || fins.length > meilleur.folios.length)
            meilleur = { page: rang, folios: fins };
        }
      } finally {
        await rendu.fermer();
      }
      const maximum = meilleur === undefined ? null : Math.max(...meilleur.folios);
      releves.push({
        jeu: basename(nom, ".pdf"),
        feuilles,
        pageDuSommaire: meilleur?.page ?? null,
        folioMaximalAnnonce: maximum,
        folios: meilleur?.folios ?? [],
        // Partiel quand le plus grand folio annoncé dépasse nettement le nombre de feuilles.
        // « Nettement » : le sommaire ne compte pas ses propres pages liminaires, et un écart
        // d'une poignée de feuilles ne prouve rien. Au-delà du double, il n'y a plus de doute.
        partiel: maximum === null ? null : maximum > feuilles,
      });
      const dernier = releves.at(-1)!;
      console.log(
        `  ${dernier.jeu.slice(0, 44).padEnd(44)} ${String(feuilles).padStart(3)} feuille(s) · ` +
          `sommaire ${dernier.pageDuSommaire ?? "—"} · folio max annoncé ${dernier.folioMaximalAnnonce ?? "—"} · ` +
          `${dernier.partiel === null ? "indéterminé" : dernier.partiel ? "PARTIEL" : "complet"}`,
      );
    } catch (souci) {
      console.log(`  ${nom.slice(0, 44).padEnd(44)} ÉCHEC : ${String((souci as Error).message)}`);
    }
    writeFileSync(sortie, `${JSON.stringify(releves, undefined, 1)}\n`);
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
}
const juges = releves.filter((releve) => releve.partiel !== null);
console.log(
  `\n${releves.length} document(s) · ${juges.filter((releve) => releve.partiel === true).length} partiel(s) sur ${juges.length} jugeable(s)`,
);
console.log(`écrit : ${sortie}`);
