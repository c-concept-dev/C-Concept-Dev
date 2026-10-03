import { inflateSync } from "node:zlib";

/** Lecture de la structure d'un PDF, sans dépendance.
 *
 *  On n'a besoin que de peu : combien de pages, y a-t-il une couche texte, et quelles images
 *  chaque page porte — avec leurs octets d'origine. C'est ce qui permet d'extraire une image à
 *  sa résolution d'origine sans jamais la redécoder (OPT-04). */

export type ObjetPdf = { readonly numero: number; readonly dictionnaire: string; readonly flux?: Buffer };

export type ImagePdf = {
  readonly numero: number;
  readonly largeur: number;
  readonly hauteur: number;
  readonly bits: number;
  readonly espaceCouleur: string;
  readonly filtre: string;
  readonly octets: number;
};

export type PagePdf = {
  readonly index: number;
  readonly numero: number;
  readonly images: readonly ImagePdf[];
  /** Vrai dès qu'une police est déclarée dans les ressources : il y a une couche texte. */
  readonly couchTexte: boolean;
};

const entier = (dictionnaire: string, cle: string): number | undefined => {
  const trouve = new RegExp(`/${cle}\\s+(\\d+)`).exec(dictionnaire);
  return trouve === undefined || trouve === null ? undefined : Number(trouve[1]);
};

const nom = (dictionnaire: string, cle: string): string | undefined =>
  new RegExp(`/${cle}\\s*/(\\w+)`).exec(dictionnaire)?.[1];

/** Tous les objets indirects du fichier, avec leur flux brut quand ils en ont un. */
export function objetsPdf(donnees: Buffer): Map<number, ObjetPdf> {
  const objets = new Map<number, ObjetPdf>();
  const texte = donnees.toString("latin1");
  const debutObjet = /(\d+)\s+\d+\s+obj\b/g;
  let marque: RegExpExecArray | null;

  while ((marque = debutObjet.exec(texte)) !== null) {
    const numero = Number(marque[1]);
    const depuis = marque.index + marque[0].length;
    const finObjet = texte.indexOf("endobj", depuis);
    if (finObjet < 0) continue;

    const debutFlux = texte.indexOf("stream", depuis);
    const aUnFlux = debutFlux >= 0 && debutFlux < finObjet;
    const dictionnaire = texte.slice(depuis, aUnFlux ? debutFlux : finObjet);

    if (!aUnFlux) {
      objets.set(numero, { numero, dictionnaire });
      continue;
    }
    let depart = debutFlux + "stream".length;
    if (texte[depart] === "\r") depart += 1;
    if (texte[depart] === "\n") depart += 1;
    const longueur = entier(dictionnaire, "Length");
    const finFlux = longueur === undefined ? texte.indexOf("endstream", depart) : depart + longueur;
    objets.set(numero, { numero, dictionnaire, flux: donnees.subarray(depart, finFlux) });
  }
  return objets;
}

const references = (dictionnaire: string, cle: string): readonly number[] => {
  const bloc = new RegExp(`/${cle}\\s*(\\[[^\\]]*\\]|\\d+\\s+\\d+\\s+R)`).exec(dictionnaire)?.[1] ?? "";
  return [...bloc.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
};

/** Pages dans l'ordre, en descendant l'arbre /Pages. */
export function pagesPdf(objets: Map<number, ObjetPdf>): readonly PagePdf[] {
  const racine = [...objets.values()].find((o) => /\/Type\s*\/Pages/.test(o.dictionnaire) && !/\/Parent/.test(o.dictionnaire));
  const ordre: number[] = [];
  const descendre = (numero: number, vus: Set<number>): void => {
    if (vus.has(numero)) return;
    vus.add(numero);
    const objet = objets.get(numero);
    if (objet === undefined) return;
    if (/\/Type\s*\/Page\b/.test(objet.dictionnaire)) {
      ordre.push(numero);
      return;
    }
    for (const enfant of references(objet.dictionnaire, "Kids")) descendre(enfant, vus);
  };
  if (racine !== undefined) for (const enfant of references(racine.dictionnaire, "Kids")) descendre(enfant, new Set());
  if (ordre.length === 0) {
    for (const objet of objets.values()) if (/\/Type\s*\/Page\b/.test(objet.dictionnaire)) ordre.push(objet.numero);
  }

  return ordre.map((numero, index) => {
    const page = objets.get(numero)!;
    const ressources = ressourcesDe(page, objets);
    const images = objetsXObject(ressources, objets)
      .map((n) => imageDe(objets.get(n)))
      .filter((i): i is ImagePdf => i !== undefined);
    return { index, numero, images, couchTexte: /\/Font/.test(ressources) || /\/Font/.test(page.dictionnaire) };
  });
}

/** Dictionnaire `<< … >>` qui suit une clé, parenthèses imbriquées comprises. */
export function dictionnaireApres(texte: string, cle: string): string | undefined {
  const depart = new RegExp(`/${cle}\\s*<<`).exec(texte);
  if (depart === null) return undefined;
  let position = depart.index + depart[0].length;
  let profondeur = 1;
  const debut = position;
  while (position < texte.length && profondeur > 0) {
    if (texte.startsWith("<<", position)) {
      profondeur += 1;
      position += 2;
    } else if (texte.startsWith(">>", position)) {
      profondeur -= 1;
      position += 2;
    } else {
      position += 1;
    }
  }
  return texte.slice(debut, position - 2);
}

function ressourcesDe(page: ObjetPdf, objets: Map<number, ObjetPdf>): string {
  const direct = dictionnaireApres(page.dictionnaire, "Resources");
  if (direct !== undefined) return direct;
  const indirect = references(page.dictionnaire, "Resources")[0];
  return indirect === undefined ? "" : (objets.get(indirect)?.dictionnaire ?? "");
}

/** Numéros des objets déclarés dans /XObject, que le dictionnaire soit écrit sur place ou
 *  rangé dans un objet à part — les deux se rencontrent. */
function objetsXObject(ressources: string, objets: Map<number, ObjetPdf>): readonly number[] {
  const surPlace = dictionnaireApres(ressources, "XObject");
  const indirect = references(ressources, "XObject")[0];
  const table = surPlace ?? (indirect === undefined ? undefined : objets.get(indirect)?.dictionnaire);
  if (table === undefined) return [];
  return [...table.matchAll(/\/\w+\s+(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));
}

function imageDe(objet: ObjetPdf | undefined): ImagePdf | undefined {
  if (objet === undefined || !/\/Subtype\s*\/Image/.test(objet.dictionnaire)) return undefined;
  const largeur = entier(objet.dictionnaire, "Width");
  const hauteur = entier(objet.dictionnaire, "Height");
  if (largeur === undefined || hauteur === undefined) return undefined;
  return {
    numero: objet.numero,
    largeur,
    hauteur,
    bits: entier(objet.dictionnaire, "BitsPerComponent") ?? 8,
    espaceCouleur: nom(objet.dictionnaire, "ColorSpace") ?? "inconnu",
    filtre: nom(objet.dictionnaire, "Filter") ?? "aucun",
    octets: objet.flux?.length ?? 0,
  };
}

/** Octets d'une image, tels qu'ils sont dans le PDF. Une image DCTDecode EST un JPEG : on
 *  l'écrit telle quelle, sans jamais la redécoder ni la rééchantillonner (OPT-04). */
export function octetsImage(objets: Map<number, ObjetPdf>, numero: number): { extension: string; octets: Buffer } | undefined {
  const objet = objets.get(numero);
  if (objet?.flux === undefined) return undefined;
  const filtre = nom(objet.dictionnaire, "Filter") ?? "aucun";
  if (filtre === "DCTDecode") return { extension: "jpg", octets: objet.flux };
  if (filtre === "JPXDecode") return { extension: "jp2", octets: objet.flux };
  if (filtre === "FlateDecode") {
    try {
      return { extension: "raw", octets: inflateSync(objet.flux) };
    } catch {
      return undefined;
    }
  }
  return { extension: "bin", octets: objet.flux };
}

/** Texte brut de la couche texte, s'il y en a une. Sert à savoir si le PDF est natif. */
export function aUneCoucheTexte(objets: Map<number, ObjetPdf>): boolean {
  for (const objet of objets.values()) if (/\/Type\s*\/Font/.test(objet.dictionnaire)) return true;
  return false;
}
