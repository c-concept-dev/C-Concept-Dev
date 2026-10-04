import {
  type Ancre,
  type CarteSynchro,
  type DecoupeMedia,
  type Document,
  type Empreinte,
  type Fichier,
  type Identifiant,
  type Lien,
  type LigneInterpretee,
  type PaireSynchro,
  type Preuve,
  type SchemaBibliotheque,
  type Segment,
  type SourcePiste,
  type VersionDocument,
} from "@lienotheque/contrats";
import { createHash } from "node:crypto";
import type { Depot } from "@lienotheque/noyau";
import type { Association } from "@lienotheque/recettes";

/** D'un rejeu de recette au dépôt réel.
 *
 *  Le moteur rend des lignes : un élément, sa page, sa piste, d'où vient cette piste et à quel
 *  point on y croit. Le dépôt, lui, ne connaît que des ancres, des cartes et des liens. Ce module
 *  fait le passage, et rien d'autre : il n'interprète pas, il range.
 *
 *  Deux règles s'y jouent. Un lien porte toujours sa preuve et sa confiance (ANC-02), pour que
 *  l'interface puisse dire « pourquoi ce lien ». Et faute de segment vérifié, la paire de
 *  synchronisation est « inconnue » (ANC-03) : la lecture commencera au début de la piste. */

/** Comment la piste a été obtenue, dit dans le vocabulaire des preuves (ANC-02).
 *
 *  Jamais `nom_de_fichier` : un nom ne vaut qu'indice de recoupement, et le moteur ne s'en sert
 *  jamais pour décider d'une piste (REC-05). */
export function preuveDe(source: SourcePiste | undefined): Preuve {
  return source === "pastille" ? "lu" : "sequence";
}

export type MediaIngere = {
  readonly empreinte: Empreinte;
  readonly piste: number;
  readonly nom?: string | undefined;
  readonly disque?: number | undefined;
  readonly dureeS?: number | undefined;
  readonly decoupe?: DecoupeMedia | undefined;
};

export type Lot = {
  readonly document: Document;
  readonly version: VersionDocument;
  readonly schema: SchemaBibliotheque;
  readonly fichiers: readonly Fichier[];
  readonly lignes: readonly LigneInterpretee[];
  readonly association: Association;
  readonly medias: readonly MediaIngere[];
  /** Comment nommer une ancre d'élément. Déterministe : rejouer un lot rend les mêmes ancres. */
  readonly ancreDe?: (ligne: LigneInterpretee) => Identifiant;
};

export type Bilan = {
  readonly ancres: number;
  readonly liens: number;
  readonly cartes: number;
  /** Éléments sans piste : ils existent, ils n'ont simplement pas d'enregistrement. */
  readonly sansPiste: number;
  /** Paires dont le segment n'a pas été vérifié (ANC-03). */
  readonly segmentsInconnus: number;
};

/** Espace de noms du projet, tiré une fois et figé : il rend les identifiants reproductibles
 *  d'une machine à l'autre. */
const ESPACE = "6f0d7b18-5a2c-4c5e-9f3a-1d7b2e8c4a60";

/** Identifiant dérivé d'un nom, à la manière d'un UUID de version 5.
 *
 *  Rien n'est tiré au hasard : rejouer le même lot rend exactement les mêmes identifiants, et
 *  deux machines qui traitent le même document s'accordent sans se parler. C'est ce qui rend la
 *  synchronisation possible, et c'est ce qui rend un rejeu comparable au précédent (REC-02). */
export function identifiantDe(nom: string): Identifiant {
  const espace = Buffer.from(ESPACE.replace(/-/g, ""), "hex");
  const condensat = createHash("sha1").update(espace).update(nom, "utf8").digest();
  const octets = Buffer.from(condensat.subarray(0, 16));
  octets[6] = (octets[6]! & 0x0f) | 0x50;
  octets[8] = (octets[8]! & 0x3f) | 0x80;
  const hexa = octets.toString("hex");
  return `${hexa.slice(0, 8)}-${hexa.slice(8, 12)}-${hexa.slice(12, 16)}-${hexa.slice(16, 20)}-${hexa.slice(20)}`;
}

const identifiant = (document: Identifiant, suffixe: string): Identifiant => identifiantDe(`${document}/${suffixe}`);

/** Le segment qui correspond au rang d'un élément dans sa piste, s'il a été vérifié.
 *
 *  Les éléments d'une piste s'y suivent dans l'ordre, et les segments aussi. Le rang suffit donc
 *  à les apparier — mais seulement quand il y a autant de segments que d'éléments. Sinon on ne
 *  sait pas lequel est lequel, et on ne le devine pas. */
export function segmentDuRang(decoupe: DecoupeMedia | undefined, rang: number, total: number): Segment | undefined {
  if (decoupe === undefined || decoupe.segments.length !== total) return undefined;
  return decoupe.segments[rang];
}

export async function ingerer(depot: Depot, lot: Lot): Promise<Bilan> {
  await depot.enregistrerSchema(lot.schema);
  for (const fichier of lot.fichiers) await depot.enregistrerFichier(fichier);
  await depot.enregistrerDocument(lot.document);
  await depot.enregistrerVersion(lot.version);

  const nommer = lot.ancreDe ?? ((ligne: LigneInterpretee) => identifiant(lot.document.id, `element-${ligne.numero}`));
  const parMedia = new Map(lot.medias.map((media) => [`${media.disque ?? 1}/${media.piste}`, media]));

  // Les éléments d'une même piste, dans l'ordre : leur rang y désigne leur segment.
  const parPiste = new Map<string, LigneInterpretee[]>();
  for (const ligne of lot.lignes) {
    if (ligne.piste === undefined) continue;
    const clef = `${ligne.disque}/${ligne.piste}`;
    parPiste.set(clef, [...(parPiste.get(clef) ?? []), ligne]);
  }

  let ancres = 0;
  let liens = 0;
  let segmentsInconnus = 0;
  let sansPiste = 0;

  const paires = new Map<Empreinte, PaireSynchro[]>();

  for (const ligne of lot.lignes) {
    const ancreId = nommer(ligne);
    const ancre: Ancre = {
      id: ancreId,
      versionId: lot.version.id,
      fichier: lot.version.fichiers[0]!,
      selecteur: { type: "element", page: ligne.pageImprimee, valeur: String(ligne.numero) },
    };
    await depot.enregistrerAncre(ancre);
    ancres += 1;

    if (ligne.piste === undefined) {
      sansPiste += 1;
      continue;
    }

    const clef = `${ligne.disque}/${ligne.piste}`;
    const media = parMedia.get(clef);
    if (media === undefined) continue;

    const surLaPiste = parPiste.get(clef) ?? [];
    const rang = surLaPiste.indexOf(ligne);
    const segment = segmentDuRang(media.decoupe, rang, surLaPiste.length);

    paires.set(media.empreinte, [
      ...(paires.get(media.empreinte) ?? []),
      segment === undefined
        ? { segment: "inconnu", ancre: ancreId }
        : { segment: "connu", ancre: ancreId, debut: segment.debut, fin: segment.fin },
    ]);
    if (segment === undefined) segmentsInconnus += 1;

    // L'ancre du média : le segment quand il est vérifié, la piste entière sinon. Dire « la
    // piste » n'invente aucune position — dire « à 42 secondes » en inventerait une.
    const ancreMedia: Ancre = {
      id: identifiant(lot.document.id, `media-${media.empreinte.slice(0, 12)}-${ligne.numero}`),
      versionId: lot.version.id,
      fichier: media.empreinte,
      selecteur:
        segment === undefined
          ? { type: "temps", debut: 0, fin: media.dureeS ?? 1 }
          : { type: "temps", debut: segment.debut, fin: segment.fin },
    };
    await depot.enregistrerAncre(ancreMedia);
    ancres += 1;

    const lien: Lien = {
      id: identifiant(lot.document.id, `lien-${ligne.numero}`),
      de: ancreId,
      vers: ancreMedia.id,
      nature: "piste_de",
      preuve: preuveDe(ligne.sourcePiste),
      confiance: ligne.confiance,
      auteur: { type: "outil", outil: { nom: "interpreteur-de-recettes", version: "0.1.0" } },
    };
    await depot.enregistrerLien(lien);
    liens += 1;
  }

  let cartes = 0;
  for (const [empreinte, liste] of paires) {
    if (liste.length === 0) continue;
    const carte: CarteSynchro = {
      id: identifiant(lot.document.id, `carte-${empreinte.slice(0, 12)}`),
      versionId: lot.version.id,
      media: empreinte,
      paires: liste,
    };
    await depot.enregistrerCarte(carte);
    cartes += 1;
  }

  return { ancres, liens, cartes, sansPiste, segmentsInconnus };
}

export * from "./instantane.js";
export * from "./lot.js";
export * from "./pages-images.js";
