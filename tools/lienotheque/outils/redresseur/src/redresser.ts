import { PageRedressee, type ReglagesRedressement } from "@lienotheque/contrats";
import { tourner, type ImageGrise } from "@lienotheque/images";
import { binariserAdaptatif, couperDoublePage, effacerVerso, gouttiere, type OptionsBinarisation, type OptionsVerso } from "./pages.js";
import { detecterRotation, type OptionsRotation } from "./rotation.js";

/** Redresseur (OUT-03) : d'un cliché de livre ouvert à des pages lisibles.
 *
 *  Quatre gestes, dans cet ordre : remettre d'aplomb, couper à la pliure, effacer le verso,
 *  binariser. Chacun est facultatif et déclaré par la recette. Rien n'est écrit sur l'original —
 *  ce que l'on rend est un dérivé, et le descripteur dit exactement ce qui a été fait. */

export type OptionsRedressement = OptionsRotation & {
  readonly verso?: OptionsVerso;
  readonly binarisation?: OptionsBinarisation;
  /** Rotation imposée, qui court-circuite la détection. Pour rejouer un lot à l'identique. */
  readonly rotationImposee?: 0 | 90 | 180 | 270;
  /** Garder aussi la page en gris, telle qu'elle était juste avant la binarisation.
   *
   *  Une relecture ciblée ne veut pas du noir et blanc : le seuil qui aide un moteur d'OCR mange
   *  précisément le chiffre qu'on vient faire relire. Elle veut le gris, à la même géométrie, pour
   *  que les zones trouvées sur la page lue désignent le même endroit. D'où ce second exemplaire,
   *  rendu seulement quand on le demande — il double la mémoire tenue par page. */
  readonly garderGris?: boolean;
};

export type PageProduite = {
  readonly image: ImageGrise;
  /** La même page en gris, quand `garderGris` l'a demandée et que la binarisation a eu lieu.
   *  Absente sinon : `image` est alors déjà ce gris, et en garder deux copies ne dirait rien. */
  readonly grise?: ImageGrise;
  readonly descripteur: PageRedressee;
};

export function redresser(
  image: ImageGrise,
  source: number,
  reglages: ReglagesRedressement,
  options: OptionsRedressement = {},
): PageProduite[] {
  const trouvee =
    options.rotationImposee !== undefined
      ? ({ rotation: options.rotationImposee, source: "imposee" } as const)
      : reglages.rotation === "auto"
        ? detecterRotation(image, options)
        : ({ rotation: 0, source: "imposee" } as const);

  const droite = tourner(image, trouvee.rotation);

  const morceaux: { image: ImageGrise; cote?: "gauche" | "droite"; x?: number }[] = reglages.doublePage
    ? (() => {
        const x = gouttiere(droite);
        const coupe = couperDoublePage(droite, x);
        return [
          { image: coupe.gauche, cote: "gauche" as const, x },
          { image: coupe.droite, cote: "droite" as const, x },
        ];
      })()
    : [{ image: droite }];

  return morceaux.map((morceau) => {
    let page = morceau.image;
    if (reglages.effacerVerso) page = effacerVerso(page, options.verso);

    // Le gris se prend ici : après l'effacement du verso, qui enlève ce qui traverse du dos, et
    // avant la binarisation, qui enlève les nuances.
    const grise = options.garderGris === true && reglages.binarisation === "adaptative" ? page : undefined;
    if (reglages.binarisation === "adaptative") page = binariserAdaptatif(page, options.binarisation);

    return {
      image: page,
      ...(grise === undefined ? {} : { grise }),
      descripteur: PageRedressee.parse({
        source,
        rotation: trouvee.rotation,
        sourceRotation: trouvee.source,
        ...(morceau.cote === undefined ? {} : { cote: morceau.cote, gouttiere: morceau.x }),
        largeur: page.largeur,
        hauteur: page.hauteur,
        versoEfface: reglages.effacerVerso,
        binarisee: reglages.binarisation === "adaptative",
      }),
    };
  });
}
