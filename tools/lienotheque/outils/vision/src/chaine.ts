import {
  appui,
  clefDeVision,
  interpreter,
  preparerLot,
  type LectureParVision,
  type PageLue,
  type Relecture,
} from "@lienotheque/recettes";
import type { ImageGrise } from "@lienotheque/images";
import { candidatsDePage, type Candidat } from "./candidats.js";
import { cacheDansDossier, relire, type CacheVision, type Transport } from "./relecture.js";
import { seContredisent, troisTemoins } from "./accord.js";

/** La relecture ciblée, branchée sur la chaîne de traitement (OUT-08, ANC-02).
 *
 *  Tout l'enchaînement est ici, et nulle part ailleurs : l'application et le banc d'essai
 *  parcourent le même chemin de code, sans quoi le critère mesuré ne serait pas celui de
 *  l'application. C'est la seule façon qu'une mesure veuille dire quelque chose.
 *
 *  Quatre temps :
 *
 *  1. **Une première interprétation, sans rien demander.** Elle révèle les pistes dont plusieurs
 *     éléments portent un repère localisé — la dispute ne se connaît pas avant d'avoir attribué
 *     une fois.
 *  2. **La sélection.** Un pavé part s'il n'a rien rendu, si le comptage des chiffres dit que sa
 *     lecture est incomplète, ou s'il est en dispute. Le reste ne part pas.
 *  3. **Une première relecture**, à l'agrandissement que la recette déclare, qui rend un nombre
 *     et un verdict de présence.
 *  4. **Un troisième témoin** sur les contradictions, au double de cet agrandissement. Deux voix
 *     sur trois l'emportent ; sans majorité, rien n'est retenu et l'élément part se faire
 *     vérifier.
 *
 *  Budget, cache par empreinte et arrêt net valent sur tout ce chemin : ce sont ceux de `relire`,
 *  et les deux passes les partagent. */

export type OptionsChaine = {
  /** Où garder les réponses, par empreinte de recadrage. Sans cache, un rejeu redemande tout. */
  readonly cacheDuLot?: string;
  /** Le cache de la seconde passe, quand il doit être ailleurs. Par défaut, à côté du premier,
   *  dans un dossier qui porte son agrandissement : une autre image n'est pas la même. */
  readonly cacheSecond?: string;
  /** Ce que chaque passe a coûté, pour le rapport. Appelé une fois par passe. */
  readonly compter?: (passe: "premiere" | "seconde", bilan: { zones: number; appels: number; cout: number; depuisLeCache: number }) => void;
};

/** Construit la relecture à brancher sur `rejouer`. */
export function relectureCiblee(transport: Transport, options: OptionsChaine = {}): Relecture {
  return async ({ chemin, recette, lues, nombreDePistes, supports, options: optionsDuLot }) => {
    const vide = new Map<string, LectureParVision>();
    if (recette.vision === undefined) return vide;

    // 1. Ce que la chaîne dit sans rien demander : c'est là que les disputes apparaissent.
    const dAbord = interpreter(lues, recette, { nombreDePistes, supports });
    const repereLocalise = new Set<number>();
    for (const page of lues) for (const element of page.elements) if (element.zoneRepere !== undefined) repereLocalise.add(element.numero);

    const parPiste = new Map<string, number[]>();
    for (const ligne of dAbord.lignes) {
      if (ligne.piste === undefined) continue;
      const clef = `${ligne.disque}/${ligne.piste}`;
      parPiste.set(clef, [...(parPiste.get(clef) ?? []), ligne.numero]);
    }
    const enDispute = new Set<number>();
    for (const numeros of parPiste.values()) {
      const avecRepere = numeros.filter((numero) => repereLocalise.has(numero));
      if (avecRepere.length >= 2) for (const numero of avecRepere) enDispute.add(numero);
    }

    // 2. Les pages à nouveau, pour leurs pixels en gris, et la sélection des pavés. Aucun moteur
    //    de lecture ici : le rendu et le redressement seulement, la part la moins chère.
    const parPage = new Map<string, PageLue>();
    for (const page of lues) parPage.set(`${page.index}/${page.cote ?? "—"}`, page);

    const candidats: Candidat[] = [];
    const grises = new Map<string, ImageGrise>();
    for await (const page of preparerLot(chemin, recette, optionsDuLot)) {
      const clef = `${page.index}/${page.cote ?? "—"}`;
      const lue = parPage.get(clef);
      if (lue === undefined) continue;
      const source = page.grise ?? page.image;
      const trouves = candidatsDePage(
        {
          index: page.index,
          image: source,
          ...(page.cote === undefined ? {} : { cote: page.cote }),
          elements: lue.elements.map((element) => ({
            numero: element.numero,
            y: element.y,
            ...(element.zoneRepere === undefined ? {} : { zoneRepere: element.zoneRepere }),
            ...(element.pisteLue === undefined ? {} : { pisteLue: element.pisteLue }),
            ...(element.chiffresComptes === undefined ? {} : { chiffresComptes: element.chiffresComptes }),
          })),
        },
        recette,
        { enDispute },
      );
      if (trouves.length > 0) grises.set(clef, source);
      candidats.push(...trouves);
    }
    if (candidats.length === 0) return vide;

    const image = (candidat: Candidat): ImageGrise | undefined => grises.get(`${candidat.page}/${candidat.cote ?? "—"}`);
    const attendu = { min: 1, max: nombreDePistes };
    const echelle = recette.vision.agrandissement ?? 1;
    const premierCache: CacheVision | undefined = options.cacheDuLot === undefined ? undefined : cacheDansDossier(options.cacheDuLot);

    // 3. La première relecture.
    const premiere = await relire(candidats, image, recette, transport, {
      ...(premierCache === undefined ? {} : { cache: premierCache }),
      attendu,
    });
    options.compter?.("premiere", {
      zones: premiere.relues.length,
      appels: premiere.appels,
      cout: premiere.cout,
      depuisLeCache: premiere.depuisLeCache,
    });

    const vision = new Map<string, LectureParVision>();
    for (const relue of premiere.relues)
      vision.set(clefDeVision(relue.candidat.page, relue.candidat.cote, relue.candidat.numero), {
        ...(relue.zone.numero === null ? {} : { numero: relue.zone.numero }),
        confiance: relue.zone.confiance,
        ...(relue.zone.repere === undefined ? {} : { repere: relue.zone.repere }),
        outil: relue.outil,
      });

    // 4. Le troisième témoin, sur les seules contradictions.
    const locale = new Map<number, number>();
    for (const page of lues) for (const e of page.elements) if (e.pisteLue !== undefined) locale.set(e.numero, e.pisteLue);

    const contestes = premiere.relues.filter(
      (relue) =>
        relue.candidat.cherche === "repere" &&
        relue.zone.numero !== null &&
        seContredisent(locale.get(relue.candidat.numero), relue.zone.numero, appui),
    );
    if (contestes.length === 0) return vision;

    const autreEchelle = echelle * 2;
    const secondCache =
      options.cacheSecond ?? (options.cacheDuLot === undefined ? undefined : `${options.cacheDuLot}-x${autreEchelle}`);
    const seconde = await relire(
      contestes.map((relue) => relue.candidat),
      image,
      recette,
      transport,
      {
        ...(secondCache === undefined ? {} : { cache: cacheDansDossier(secondCache) }),
        attendu,
        agrandissement: autreEchelle,
      },
    );
    options.compter?.("seconde", {
      zones: seconde.relues.length,
      appels: seconde.appels,
      cout: seconde.cout,
      depuisLeCache: seconde.depuisLeCache,
    });

    const second = new Map<number, number | null>();
    for (const relue of seconde.relues) second.set(relue.candidat.numero, relue.zone.numero);

    for (const relue of contestes) {
      const numero = relue.candidat.numero;
      const clef = clefDeVision(relue.candidat.page, relue.candidat.cote, numero);
      const avant = vision.get(clef);
      if (avant === undefined) continue;
      const verdict = troisTemoins([locale.get(numero), relue.zone.numero ?? undefined, second.get(numero) ?? undefined]);
      vision.set(
        clef,
        verdict.valeur === undefined
          ? { confiance: avant.confiance, ...(avant.repere === undefined ? {} : { repere: avant.repere }), sansMajorite: true, outil: avant.outil }
          : { ...avant, numero: verdict.valeur },
      );
    }
    return vision;
  };
}
