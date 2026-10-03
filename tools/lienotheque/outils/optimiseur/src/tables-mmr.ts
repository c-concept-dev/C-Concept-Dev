/** Tables de codes de l'ITU-T T.4 et T.6, figées depuis 1988.
 *
 *  Codes de terminaison pour les longueurs de 0 à 63, codes de rallonge par multiples de 64.
 *  Au-delà de 1728, les rallonges sont communes aux deux couleurs. Rien ici n'est à inventer :
 *  l'aller-retour par libtiff vérifie chaque entrée. */

export const BLANC_TERMINAISON: readonly string[] = [
  "00110101", "000111", "0111", "1000", "1011", "1100", "1110", "1111",
  "10011", "10100", "00111", "01000", "001000", "000011", "110100", "110101",
  "101010", "101011", "0100111", "0001100", "0001000", "0010111", "0000011", "0000100",
  "0101000", "0101011", "0010011", "0100100", "0011000", "00000010", "00000011", "00011010",
  "00011011", "00010010", "00010011", "00010100", "00010101", "00010110", "00010111", "00101000",
  "00101001", "00101010", "00101011", "00101100", "00101101", "00000100", "00000101", "00001010",
  "00001011", "01010010", "01010011", "01010100", "01010101", "00100100", "00100101", "01011000",
  "01011001", "01011010", "01011011", "01001010", "01001011", "00110010", "00110011", "00110100",
];

export const NOIR_TERMINAISON: readonly string[] = [
  "0000110111", "010", "11", "10", "011", "0011", "0010", "00011",
  "000101", "000100", "0000100", "0000101", "0000111", "00000100", "00000111", "000011000",
  "0000010111", "0000011000", "0000001000", "00001100111", "00001101000", "00001101100", "00000110111", "00000101000",
  "00000010111", "00000011000", "000011001010", "000011001011", "000011001100", "000011001101", "000001101000", "000001101001",
  "000001101010", "000001101011", "000011010010", "000011010011", "000011010100", "000011010101", "000011010110", "000011010111",
  "000001101100", "000001101101", "000011011010", "000011011011", "000001010100", "000001010101", "000001010110", "000001010111",
  "000001100100", "000001100101", "000001010010", "000001010011", "000000100100", "000000110111", "000000111000", "000000100111",
  "000000101000", "000001011000", "000001011001", "000000101011", "000000101100", "000001011010", "000001100110", "000001100111",
];

/** Rallonges blanches, de 64 à 1728 par pas de 64. */
export const BLANC_RALLONGE: readonly string[] = [
  "11011", "10010", "010111", "0110111", "00110110", "00110111", "01100100", "01100101",
  "01101000", "01100111", "011001100", "011001101", "011010010", "011010011", "011010100", "011010101",
  "011010110", "011010111", "011011000", "011011001", "011011010", "011011011", "010011000", "010011001",
  "010011010", "011000", "010011011",
];

/** Rallonges noires, de 64 à 1728 par pas de 64. */
export const NOIR_RALLONGE: readonly string[] = [
  "0000001111", "000011001000", "000011001001", "000001011011", "000000110011", "000000110100", "000000110101", "0000001101100",
  "0000001101101", "0000001001010", "0000001001011", "0000001001100", "0000001001101", "0000001110010", "0000001110011", "0000001110100",
  "0000001110101", "0000001110110", "0000001110111", "0000001010010", "0000001010011", "0000001010100", "0000001010101", "0000001011010",
  "0000001011011", "0000001100100", "0000001100101",
];

/** Rallonges communes aux deux couleurs, de 1792 à 2560 par pas de 64. */
export const RALLONGE_COMMUNE: readonly string[] = [
  "00000001000", "00000001100", "00000001101", "000000010010", "000000010011", "000000010100", "000000010101", "000000010110",
  "000000010111", "000000011100", "000000011101", "000000011110", "000000011111",
];

/** Modes de codage bidimensionnel (T.6). */
export const PASSE = "0001";
export const HORIZONTAL = "001";
/** Codes verticaux, indexés par l'écart a1 − b1, de −3 à +3. */
export const VERTICAL: Readonly<Record<number, string>> = {
  [-3]: "0000010",
  [-2]: "000010",
  [-1]: "010",
  0: "1",
  1: "011",
  2: "000011",
  3: "0000011",
};

/** Fin de bloc : deux codes de fin de ligne enchaînés. */
export const FIN_DE_BLOC = "000000000001000000000001";

/** La plus grande rallonge commune, et son pas. */
export const RALLONGE_MAX = 2560;
export const PAS_RALLONGE = 64;

/** Écrit une longueur de plage dans la couleur donnée, en rallonges puis terminaison. */
export function codesDePlage(longueur: number, encre: boolean): string[] {
  const codes: string[] = [];
  let reste = longueur;

  while (reste >= RALLONGE_MAX + PAS_RALLONGE) {
    codes.push(RALLONGE_COMMUNE[RALLONGE_COMMUNE.length - 1]!);
    reste -= RALLONGE_MAX;
  }
  if (reste > 1728 + 63) {
    const rang = Math.floor(reste / PAS_RALLONGE) - 1792 / PAS_RALLONGE;
    codes.push(RALLONGE_COMMUNE[rang]!);
    reste -= (rang + 1792 / PAS_RALLONGE) * PAS_RALLONGE;
  } else if (reste > 63) {
    const rang = Math.floor(reste / PAS_RALLONGE) - 1;
    codes.push((encre ? NOIR_RALLONGE : BLANC_RALLONGE)[rang]!);
    reste -= (rang + 1) * PAS_RALLONGE;
  }
  codes.push((encre ? NOIR_TERMINAISON : BLANC_TERMINAISON)[reste]!);
  return codes;
}
