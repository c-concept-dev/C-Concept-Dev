import { forwardRef, useMemo, type JSX } from "react";
import { nommer, type ElementAffiche, type MotsBibliotheque, type PageAffichee, type ZoneRelative } from "@lienotheque/contrats";

/** La page elle-même, avec les zones de ses éléments (B1, UX-01, UX-07).
 *
 *  Une zone n'est pas le numéro, c'est **la bande de l'élément** : du numéro lu jusqu'à celui qui
 *  le suit. C'est ce qu'on désigne quand on montre un passage du doigt, et c'est ce qu'on veut
 *  pouvoir atteindre — un numéro de marge mesure huit pixels sur seize à l'écran, et viser cela
 *  à la souris ou au doigt n'est pas raisonnable (WCAG 2.2, critère 2.5.8).
 *
 *  Le cadre reste discret : la page est le document, pas un formulaire. L'élément actif est
 *  surligné, les autres se devinent au survol.
 *
 *  Les zones se disent en parts de la page : le zoom ne les déplace pas. */

type Props = {
  readonly page: PageAffichee;
  readonly mots: MotsBibliotheque;
  readonly actif: string;
  readonly zoom: number;
  readonly onElement: (ancreId: string) => void;
};

/** Ce qu'une bande garde au-dessus du numéro qui l'ouvre : un titre se pose souvent
 *  juste avant le numéro, et la bande doit le couvrir. En part de la hauteur du numéro. */
const COIFFE = 0.75;

export type Bande = { readonly element: ElementAffiche; readonly zone: ZoneRelative };

/** Les bandes d'une page : de chaque numéro lu jusqu'au suivant.
 *
 *  La dernière descend jusqu'au bas de la page. Un élément dont la lecture n'a pas donné de
 *  position n'a pas de bande — il n'a été lu nulle part, et une bande posée au hasard désignerait
 *  n'importe quoi. */
export function bandesDeLaPage(elements: readonly ElementAffiche[]): Bande[] {
  const places = elements
    .filter((element): element is ElementAffiche & { zone: ZoneRelative } => element.zone !== undefined)
    .sort((a, b) => a.zone.y - b.zone.y);

  return places.map((element, rang) => {
    const haut = Math.max(0, element.zone.y - element.zone.h * COIFFE);
    const suivant = places[rang + 1];
    const bas = suivant === undefined ? 1 : Math.max(haut, suivant.zone.y - suivant.zone.h * COIFFE);
    return { element, zone: { x: 0, y: haut, l: 1, h: Math.max(Number.EPSILON, bas - haut) } };
  });
}

export const PageZoomable = forwardRef<HTMLSpanElement, Props>(function PageZoomable(
  { page, mots, actif, zoom, onElement },
  refAncreActive,
): JSX.Element {
  const bandes = useMemo(() => bandesDeLaPage(page.elements), [page.elements]);

  const nom = (element: ElementAffiche): string =>
    `${nommer(mots.element, element.numero)}${element.titre === undefined ? "" : ` — ${element.titre}`}`;

  return (
    <div className="ln-page" style={{ width: `${zoom}%` }}>
      <div className="ln-page__feuille">
        {page.image === undefined ? (
          <div className="ln-page__attente" role="img" aria-label={nommer(mots.page, page.numero)}>
            <span className="ln-page__numero">{page.numero}</span>
            {page.titre === undefined ? null : <span className="ln-page__titre">{page.titre}</span>}
          </div>
        ) : (
          <img className="ln-page__image" src={page.image} alt={nommer(mots.page, page.numero)} />
        )}

        {bandes.map(({ element, zone }) => (
          <button
            key={element.ancreId}
            type="button"
            className={element.ancreId === actif ? "ln-page__zone ln-page__zone--actif" : "ln-page__zone"}
            style={{
              left: `${zone.x * 100}%`,
              top: `${zone.y * 100}%`,
              width: `${zone.l * 100}%`,
              height: `${zone.h * 100}%`,
            }}
            onClick={() => onElement(element.ancreId)}
            aria-current={element.ancreId === actif ? "true" : undefined}
            aria-label={nom(element)}
          >
            {/* Le fil part d'ici, et non du bord de la bande : c'est l'endroit où le numéro a
                été lu qui désigne l'élément, pas la largeur de page qu'on rend cliquable.
                Décoratif et sans taille : il ne sert qu'à donner un point au tracé. */}
            <span
              className="ln-page__zone-ancre"
              aria-hidden="true"
              style={{
                left: `${(element.zone!.x + element.zone!.l) * 100}%`,
                top: `${((element.zone!.y + element.zone!.h / 2 - zone.y) / zone.h) * 100}%`,
              }}
              {...(element.ancreId === actif ? { ref: refAncreActive } : {})}
            />
            {/* Le numéro n'est rappelé que sur une page sans image : la vraie page le porte déjà,
                et le doubler encombrait le document de pastilles qui répétaient ce qu'il dit. */}
            {page.image === undefined ? <span className="ln-page__zone-numero ln-sur-photo">{element.numero}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
});
