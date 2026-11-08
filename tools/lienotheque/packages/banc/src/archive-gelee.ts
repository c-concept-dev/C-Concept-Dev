import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Une archive gelée ne change plus, et une mécanique le tient.
 *
 *  ## Pourquoi un gel
 *
 *  Pendant deux jours, chaque lot a dû **découper** `docs/decisions.md` pour n'en commiter que sa
 *  part. Le procédé a produit trois incidents en une seule journée : des lignes d'autorisation
 *  posées sous le mauvais titre — l'ancre était une ligne de tableau, qui ne dit pas dans quelle
 *  section on se trouve —, une section effacée par une copie, un décompte recopié à côté d'un
 *  tableau et faux trois fois de suite.
 *
 *  Aucun n'était une faute d'attention isolée. **Supprimer le découpage supprime la classe
 *  entière** : une décision, un fichier. Décision de Christophe du 7 novembre 2026.
 *
 *  ## Pourquoi une empreinte, et non une interdiction d'écriture
 *
 *  Un fichier en lecture seule se rend inscriptible d'une commande, sans trace. Une empreinte
 *  enregistrée comme **donnée** rend l'écriture visible : le contrôle complet rougit, nomme le
 *  fichier, et dit où écrire à la place. Et l'on gèle une autre archive en ajoutant une ligne au
 *  fichier de données, sans toucher à ce code.
 *
 *  ## Ce que ce garde-fou ne fait pas
 *
 *  Il juge la **copie de travail**, non l'index : le gel porte sur le contenu du dépôt, et c'est
 *  dans la copie de travail qu'une écriture distraite se produit. Un commit qui modifierait
 *  l'archive sans que la copie de travail l'ait gardée est hors de sa portée — un filet, pas un
 *  mur, comme les autres. */

/** Une archive, telle que la donnée la décrit. */
export interface ArchiveGelee {
  readonly chemin: string;
  readonly octets: number;
  readonly empreinte_sha256: string;
}

export interface GelDesArchives {
  readonly archives: readonly ArchiveGelee[];
}

const DONNEE = "fixtures/archive-gelee.json";
const DOSSIER_DES_DECISIONS = "docs/decisions";
const SOMMAIRE = "README.md";

export function gelDesArchives(projet: string): GelDesArchives {
  return JSON.parse(readFileSync(join(projet, DONNEE), "utf8")) as GelDesArchives;
}

/** Ce qui a bougé dans une archive gelée. Vide quand tout est en ordre. */
export function ecartsDesArchivesGelees(projet: string, gel = gelDesArchives(projet)): readonly string[] {
  const ecarts: string[] = [];
  if (gel.archives.length === 0) ecarts.push(`${DONNEE} ne gèle aucune archive : le garde-fou ne garde rien`);
  for (const archive of gel.archives) {
    const chemin = join(projet, archive.chemin);
    if (!existsSync(chemin)) {
      ecarts.push(`${archive.chemin} : gelé, mais absent du dépôt`);
      continue;
    }
    const octets = readFileSync(chemin);
    const empreinte = createHash("sha256").update(octets).digest("hex");
    if (octets.length !== archive.octets)
      ecarts.push(
        `${archive.chemin} : ${octets.length} octets au lieu des ${archive.octets} gelés — ` +
          `une archive ne change plus. Écrire dans ${DOSSIER_DES_DECISIONS}/AAAA-MM-JJ-sujet.md`,
      );
    else if (empreinte !== archive.empreinte_sha256)
      ecarts.push(
        `${archive.chemin} : même taille, autre contenu (${empreinte.slice(0, 16)}… au lieu de ` +
          `${archive.empreinte_sha256.slice(0, 16)}…) — une archive ne change plus. ` +
          `Écrire dans ${DOSSIER_DES_DECISIONS}/AAAA-MM-JJ-sujet.md`,
      );
  }
  return ecarts;
}

/** Les décisions que le sommaire oublie, et celles qu'il invente.
 *
 *  Un sommaire incomplet fait disparaître une décision sans l'effacer : elle existe, et personne
 *  ne la trouve. C'est le défaut que le fichier unique n'avait pas, et qu'un dossier introduit —
 *  il se paie ici. */
export function decisionsSansSommaire(projet: string): readonly string[] {
  const dossier = join(projet, DOSSIER_DES_DECISIONS);
  if (!existsSync(dossier)) return [`${DOSSIER_DES_DECISIONS} : absent`];
  const fichiers = readdirSync(dossier).filter((nom) => nom.endsWith(".md") && nom !== SOMMAIRE);
  const sommaire = readFileSync(join(dossier, SOMMAIRE), "utf8");
  const manques = fichiers.filter((nom) => !sommaire.includes(`(${nom})`)).map((nom) => `${nom} : absent du sommaire`);
  const nommes = [...sommaire.matchAll(/\(([^()]+\.md)\)/gu)].map((trouve) => trouve[1]!);
  const fantomes = [...new Set(nommes)]
    .filter((nom) => !existsSync(join(dossier, nom)))
    .map((nom) => `${nom} : nommé par le sommaire, absent du dossier`);
  return [...manques, ...fantomes];
}
