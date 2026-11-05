/** A2, pièce 2 — isoler les mots en difficulté SANS seuil posé.
 *
 *  Ce qu'on cherche : un critère qui désigne les cases illisibles d'une page sans qu'aucun
 *  nombre ne soit calibré sur un document (doctrine du 5 novembre 2026).
 *
 *  **Deux idées, et la seconde est celle qu'on éprouve.**
 *
 *  1. Un seuil fixe sur la confiance — « sous 0,60 » — est un nombre posé, et il est aveugle :
 *     mesuré le 5 novembre, la page du sommaire aux huit lignes abîmées a 6 % de mots sous 0,60,
 *     moins qu'une page de partition qui n'a pourtant aucun problème.
 *  2. **Comparer chaque mot à ses semblables du même document.** Deux mots de même hauteur de
 *     glyphes, dans la même bande de page, jouent le même rôle — un folio n'a pas la taille d'un
 *     titre, ni une case de tableau celle d'un paragraphe. Dans un groupe de semblables, la
 *     lecture habituelle est haute ; un mot illisible s'en détache. On cherche alors **la plus
 *     grande rupture** dans la suite triée des confiances du groupe : pas de seuil, une rupture.
 *
 *  Ce banc ne modifie rien. Il lit, applique les deux règles et compte, contre une vérité
 *  attendue donnée en argument — les mots qu'on sait abîmés.
 *
 *  Usage : a2-mots-en-difficulte.ts <document.pdf> <première> <dernière>
 */
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MotLu, PageLue } from "@lienotheque/contrats";
import { enGris } from "@lienotheque/images";
import { ouvrirRenduPdf } from "@lienotheque/lecteur-texte";
import { ocrDUnePageGrise } from "@lienotheque/ingestion";

const MOTEURS = realpathSync(join(import.meta.dirname, "../../../apps/app/src-tauri/moteurs"));
const LARGEUR_DE_RENDU = 1800;

/** Le gabarit d'un mot : sa hauteur de glyphes, arrondie à une classe relative à la page.
 *
 *  Pourquoi la hauteur : c'est ce qui distingue un rôle d'un autre dans une page, sans rien
 *  savoir du domaine. Pourquoi relative : une page rendue plus large a des glyphes plus grands,
 *  et un gabarit en pixels absolus ne voyagerait pas d'un document à l'autre. */
const gabarit = (mot: MotLu, page: PageLue): string => {
  const classe = Math.round((mot.h / page.hauteur) * 200);
  return String(classe);
};

/** La plus grande rupture dans une suite triée : l'endroit où elle se coupe en deux le plus net.
 *
 *  Rend la valeur au-dessous de laquelle on est « de l'autre côté », ou rien si la suite est trop
 *  courte pour qu'une rupture veuille dire quelque chose. */
function rupture(valeurs: readonly number[]): { seuil: number; ecart: number } | undefined {
  if (valeurs.length < 4) return undefined;
  const triees = [...valeurs].sort((un, autre) => un - autre);
  let meilleur = { seuil: 0, ecart: 0 };
  for (let i = 0; i < triees.length - 1; i += 1) {
    const ecart = triees[i + 1]! - triees[i]!;
    if (ecart > meilleur.ecart) meilleur = { seuil: triees[i + 1]!, ecart };
  }
  return meilleur.ecart === 0 ? undefined : meilleur;
}

const [pdf, premiereBrute, derniereBrute] = process.argv.slice(2);
if (pdf === undefined) {
  console.error("usage : a2-mots-en-difficulte.ts <document.pdf> [première] [dernière]");
  process.exit(2);
}
const rendu = await ouvrirRenduPdf(pdf);
const premiere = Number(premiereBrute ?? 1);
const derniere = Math.min(Number(derniereBrute ?? rendu.nombreDePages), rendu.nombreDePages);
const bac = mkdtempSync(join(tmpdir(), "lienotheque-a2d-"));

try {
  for (let rang = premiere; rang <= derniere; rang += 1) {
    const page = ocrDUnePageGrise(enGris(await rendu.page(rang, LARGEUR_DE_RENDU)), rang, bac, {
      binaire: join(MOTEURS, "bin/tesseract"),
      tessdata: join(MOTEURS, "tessdata"),
    });
    // Les groupes de semblables, par gabarit.
    const groupes = new Map<string, MotLu[]>();
    for (const mot of page.mots) {
      if (mot.confiance === undefined) continue;
      const clef = gabarit(mot, page);
      if (!groupes.has(clef)) groupes.set(clef, []);
      groupes.get(clef)!.push(mot);
    }
    const parRupture: MotLu[] = [];
    for (const [, mots] of groupes) {
      const coupe = rupture(mots.map((mot) => mot.confiance!));
      if (coupe === undefined) continue;
      for (const mot of mots) if (mot.confiance! < coupe.seuil) parRupture.push(mot);
    }
    const parSeuilFixe = page.mots.filter((mot) => (mot.confiance ?? 1) < 0.6);
    console.log(
      `\nfeuille ${rang} · ${page.mots.length} mots · ${groupes.size} gabarits · ` +
        `rupture : ${parRupture.length} · seuil fixe 0,60 : ${parSeuilFixe.length}`,
    );
    const montrer = (quoi: string, mots: readonly MotLu[]) =>
      console.log(
        `  ${quoi} : ${mots
          .slice(0, 14)
          .map((mot) => `${mot.texte}(${(mot.confiance ?? -1).toFixed(2)})`)
          .join(" ")}${mots.length > 14 ? " …" : ""}`,
      );
    montrer("par rupture ", parRupture);
    montrer("par seuil   ", parSeuilFixe);
  }
} finally {
  rmSync(bac, { recursive: true, force: true });
  await rendu.fermer();
}
