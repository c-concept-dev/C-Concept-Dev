import { inflateRawSync } from "node:zlib";

/** Lire une archive ZIP, parce qu'un EPUB en est une (FMT-01).
 *
 *  ## Pourquoi l'écrire plutôt que l'emprunter
 *
 *  Un EPUB n'emploie que deux façons de ranger un fichier : **tel quel** ou **dégonflé**.
 *  `node:zlib` sait dégonfler ; le reste est un format de table qui tient en quelques dizaines de
 *  lignes. Le dépôt a déjà écrit son encodeur CCITT groupe 4 et sa table d'objets PDF plutôt que
 *  d'ajouter des dépendances pour les lire : c'est la même décision, et pour la même raison —
 *  une dépendance qu'on n'a pas est une dépendance qu'on n'a pas à suivre.
 *
 *  ## La table centrale fait foi
 *
 *  Un ZIP décrit ses entrées deux fois : un en-tête devant chaque fichier, et une table à la fin.
 *  **On ne lit que la table.** C'est elle qui fait autorité, et un fichier dont les deux se
 *  contredisent est précisément celui qu'on ne veut pas lire au hasard — suivre les en-têtes
 *  locaux reviendrait à se fier à ce qu'un fichier dit de lui-même au fil de l'eau.
 */

const FIN_TABLE = 0x06054b50;
const ENTREE_TABLE = 0x02014b50;
const ENTETE_LOCAL = 0x04034b50;

/** Les méthodes qu'un EPUB emploie, et les seules qu'on lise.
 *
 *  Un ZIP en autorise une dizaine. Les autres se disent plutôt que de se deviner : rendre des
 *  octets qui ressemblent à du texte sans en être est pire que refuser. */
const TELQUEL = 0;
const DEGONFLE = 8;

/** Où commence la table centrale, cherchée depuis la fin.
 *
 *  Le marqueur de fin est précédé d'un commentaire de longueur libre, donc on remonte. Soixante-
 *  cinq mille octets suffisent : c'est la longueur maximale qu'un commentaire peut avoir. */
function finDeTable(donnees: Buffer): number {
  const depuis = Math.max(0, donnees.length - 0xffff - 22);
  for (let position = donnees.length - 22; position >= depuis; position -= 1)
    if (donnees.readUInt32LE(position) === FIN_TABLE) return position;
  return -1;
}

/** Le contenu de chaque fichier de l'archive, par son chemin dedans.
 *
 *  Tout est lu d'un coup : un EPUB du corpus pèse au plus une dizaine de mégaoctets, et le lire
 *  par morceaux coûterait de la complexité pour une mémoire qu'on a. Un format plus lourd
 *  demanderait autre chose, et ce serait une autre fonction.
 *
 *  Les dossiers n'y figurent pas : ils n'ont pas de contenu, et une entrée vide parmi les
 *  chapitres obligerait chaque appelant à la reconnaître. */
export function entreesZip(donnees: Buffer): ReadonlyMap<string, Buffer> {
  const fin = finDeTable(donnees);
  if (fin < 0) throw new Error("Ce fichier n'est pas une archive ZIP : sa table centrale est introuvable.");

  const combien = donnees.readUInt16LE(fin + 10);
  let position = donnees.readUInt32LE(fin + 16);
  const entrees = new Map<string, Buffer>();

  for (let rang = 0; rang < combien; rang += 1) {
    if (donnees.readUInt32LE(position) !== ENTREE_TABLE)
      throw new Error("Archive ZIP abîmée : une entrée de la table centrale est illisible.");

    const methode = donnees.readUInt16LE(position + 10);
    const comprime = donnees.readUInt32LE(position + 20);
    const brut = donnees.readUInt32LE(position + 24);
    const tailleNom = donnees.readUInt16LE(position + 28);
    const tailleExtra = donnees.readUInt16LE(position + 30);
    const tailleCommentaire = donnees.readUInt16LE(position + 32);
    const debutLocal = donnees.readUInt32LE(position + 42);
    const nom = donnees.subarray(position + 46, position + 46 + tailleNom).toString("utf8");
    position += 46 + tailleNom + tailleExtra + tailleCommentaire;

    // Un dossier se reconnaît à sa barre finale, et n'a rien à rendre.
    if (nom.endsWith("/")) continue;

    if (methode !== TELQUEL && methode !== DEGONFLE)
      throw new Error(`Archive ZIP : méthode de compression inconnue (${methode}) pour « ${nom} ».`);

    if (donnees.readUInt32LE(debutLocal) !== ENTETE_LOCAL)
      throw new Error(`Archive ZIP abîmée : l'en-tête de « ${nom} » est illisible.`);

    // Les longueurs du nom et du supplément se relisent **dans l'en-tête local** : elles peuvent
    // y différer de celles de la table, et c'est l'en-tête qui dit où ses propres octets
    // commencent.
    const debut = debutLocal + 30 + donnees.readUInt16LE(debutLocal + 26) + donnees.readUInt16LE(debutLocal + 28);
    const octets = donnees.subarray(debut, debut + comprime);
    entrees.set(nom, methode === TELQUEL ? Buffer.from(octets) : inflateRawSync(octets, { maxOutputLength: brut }));
  }

  return entrees;
}
