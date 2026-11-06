/** CLA-01 : trouver les mots de domaine dans un texte source.
 *
 *  Extrait du contrôle pour pouvoir être éprouvé seul : un garde-fou qui accuse à tort finit par
 *  être désarmé, et on ne peut pas le savoir en lisant uniquement du code déjà propre. Il faut le
 *  soumettre à des mots légitimes — « bâche » contient « bach », « desserte » contient
 *  « dessert ».
 *
 *  La frontière d'un mot n'est pas seulement l'espace. Dans du code, un mot de domaine se colle à
 *  un autre sans séparateur (`lirePartition`, `partitionDuTexte`, `PARTITION_LUE`) : le passage
 *  de casse est une frontière aussi réelle qu'un blanc. Et en français le terme se décline, sans
 *  cesser d'être lui : « décrets », « exercices », « desserts ». */

const APOSTROPHES = /[‘’]/gu;

/** Les terminaisons qui prolongent un mot sans en faire un autre. **Liste fermée, pas une
 *  longueur** : « e » est plus court que « es » et reste interdit, parce qu'il transforme le mot
 *  (« dessert » → « desserte », « bach » → « bache »). Chaque entrée porte son cas réel dans la
 *  liste des termes — « s » le pluriel ordinaire, « es » le féminin pluriel d'un participe
 *  (« oblitéré » → « oblitérées »). Une terminaison qu'aucun terme ne réclame n'entre pas ici.
 *
 *  **Dans quel sens cette liste peut coûter** : un terme dont le pluriel sort de la liste est
 *  **laissé passer en silence** — « bijoux » ne rencontrerait pas « bijou », et rien ne le
 *  signalerait. C'est un trou, pas une fausse alarme, donc invisible. Qui ajoute un terme au
 *  pluriel irrégulier (`-aux`, `-oux`, `-eaux`) ajoute sa terminaison ici, avec son contrôle. */
export const FLEXIONS: ReadonlySet<string> = new Set(["s", "es"]);

/** Accents retirés et apostrophes ramenées à une seule forme, la casse conservée : elle porte
 *  la frontière des mots dans les identifiants composés. */
export const sansAccents = (texte: string): string =>
  texte.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(APOSTROPHES, "'");

const estLettre = (caractere: string | undefined): boolean => caractere !== undefined && /[A-Za-z]/.test(caractere);
const estMajuscule = (caractere: string | undefined): boolean => caractere !== undefined && /[A-Z]/.test(caractere);
const estLettreOuChiffre = (caractere: string | undefined): boolean =>
  caractere !== undefined && /[A-Za-z0-9]/.test(caractere);

/** Le mot commence-t-il là ? Soit rien d'alphanumérique avant, soit une entrée en majuscule
 *  après une minuscule — la frontière des identifiants composés. */
function commenceUnMot(contenu: string, place: number): boolean {
  if (place === 0) return true;
  const avant = contenu[place - 1];
  if (!estLettreOuChiffre(avant)) return true;
  return !estMajuscule(avant) && estMajuscule(contenu[place]);
}

/** Le mot finit-il là ? Soit plus de lettre, soit une majuscule qui ouvre le mot suivant, soit
 *  une terminaison de FLEXIONS, qui décline le mot sans en faire un autre. */
function finitUnMot(contenu: string, place: number): boolean {
  const apres = contenu[place];
  if (!estLettre(apres)) return true;
  if (estMajuscule(apres)) return true;
  const suite = /^[a-z]+/.exec(contenu.slice(place));
  return suite !== null && FLEXIONS.has(suite[0]);
}

/** Le terme figure-t-il dans le contenu comme un mot, et non comme une suite de lettres ? */
function figureCommeMot(contenu: string, terme: string): boolean {
  const bas = contenu.toLowerCase();
  for (let place = bas.indexOf(terme); place !== -1; place = bas.indexOf(terme, place + 1)) {
    if (commenceUnMot(contenu, place) && finitUnMot(contenu, place + terme.length)) return true;
  }
  return false;
}

export function termesTrouves(brut: string, termes: readonly string[]): readonly string[] {
  const contenu = sansAccents(brut);
  return termes.filter((terme) => figureCommeMot(contenu, sansAccents(terme).toLowerCase()));
}
