/** Les empreintes de commit citées dans les documents du projet, et le moyen de les vérifier
 *  (dette D12, lot 0m).
 *
 *  ## D'où vient ce garde-fou
 *
 *  D'une faute à moi, le 11 novembre 2026. L'entrée **37** du registre des poussées annonce
 *  « `0ee45c0e` ou son équivalent » : une empreinte **pariée avant que le commit existe**, là où
 *  le vrai est `29d4ed06`. J'enfreignais ainsi une règle déjà écrite — « les chiffres d'un message
 *  de commit sont écrits par la commande » (10 novembre 2026) —, appliquée jusque-là aux chiffres
 *  de mesure et pas aux empreintes. **Un numéro de commit s'écrit après le commit, jamais avant.**
 *
 *  ## Pourquoi la forme seule ne peut pas trancher, et comment on l'a su
 *
 *  Mesuré sur les documents, avant d'écrire une ligne de ce module : le motif naïf
 *  — un jeton entièrement hexadécimal entre accents graves — relève **142** jetons, dont **19**
 *  qu'aucun commit ne porte. Un seul est le défaut. Les dix-huit autres sont :
 *
 *  | ce que c'est vraiment | combien |
 *  |---|---|
 *  | courses d'intégration continue | 8 |
 *  | versions d'un document | 3 |
 *  | travaux de la file | 3 |
 *  | documents d'une bibliothèque | 3 |
 *  | empreinte d'un fichier | 1 |
 *
 *  Ce dépôt écrit donc entre accents graves, et de la même façon, des commits, des versions, des
 *  travaux, des documents, des fichiers et des numéros de course. La ligne du lot ne nommait que
 *  deux pièges — archives et fichiers ; il y en a cinq.
 *
 *  ## La règle retenue, et la mesure qui a tué la première
 *
 *  J'allais écarter les courses parce qu'elles sont **entièrement décimales**. Mesure :
 *  **4 citations de commits réels le sont aussi** — `18039497`, `64165025`, `59968260`,
 *  `79228947`. Cette règle aurait créé un angle mort **silencieux** sur 3,3 % des citations, soit
 *  exactement le genre de garde-fou qui rassure sans garder.
 *
 *  Les **longueurs**, elles, séparent proprement : une citation de commit fait ici 8 signes (120
 *  fois), 9 signes (3 fois), ou 40 quand elle est entière. Une course en fait 11, une empreinte de
 *  fichier 16, une empreinte d'archive 64. Le garde-fou porte donc sur les longueurs que ce dépôt
 *  emploie réellement pour un commit — déclarées en donnée ci-dessous, mesure à l'appui.
 *
 *  **L'angle mort assumé** : un commit cité sur 10 à 39 signes échapperait. Aucun ne l'est, et
 *  l'ajouter à la liste serait rouvrir la porte aux courses. Si la forme change un jour, c'est
 *  cette liste qu'on modifie, et elle est faite pour être relue.
 */

/** Les longueurs sous lesquelles ce dépôt cite un commit. **Donnée, et non règle en dur** : elles
 *  ont été comptées sur les documents, et c'est ce compte qui les justifie. */
export const LONGUEURS_DE_CITATION = [7, 8, 9, 40] as const;

/** Un jeton entre accents graves, entièrement hexadécimal. Les accents graves comptent : un
 *  nombre écrit en prose n'est pas une citation, et ce dépôt cite toujours ainsi. */
const JETON = /`([0-9a-f]+)`/gu;

/** Les citations de commit d'un texte, dans l'ordre où elles paraissent. Les doublons sont gardés :
 *  qui lit un rapport veut savoir **combien de fois** une empreinte fausse a été recopiée. */
export function citationsDeCommit(texte: string): readonly string[] {
  const longueurs = new Set<number>(LONGUEURS_DE_CITATION);
  return [...texte.matchAll(JETON)]
    .map((trouve) => trouve[1] ?? "")
    .filter((jeton) => longueurs.has(jeton.length));
}
