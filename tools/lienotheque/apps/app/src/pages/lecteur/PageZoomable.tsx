import { forwardRef, type JSX } from "react";
import { nommer, type ElementAffiche, type MotsBibliotheque, type PageAffichee } from "@lienotheque/contrats";

/** La page elle-même, avec les zones de ses éléments (B1, UX-01).
 *
 *  Les zones se disent en parts de la page : le zoom ne les déplace pas. L'élément actif est
 *  surligné et cadré ; les autres restent discrets, assez pour qu'on les voie sans qu'ils
 *  disputent la page au document. */

type Props = {
  readonly page: PageAffichee;
  readonly mots: MotsBibliotheque;
  readonly actif: string;
  readonly zoom: number;
  readonly onElement: (ancreId: string) => void;
};

export const PageZoomable = forwardRef<HTMLButtonElement, Props>(function PageZoomable(
  { page, mots, actif, zoom, onElement },
  refZoneActive,
): JSX.Element {
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

        {page.elements.map((element) =>
          element.zone === undefined ? null : (
            <button
              key={element.ancreId}
              type="button"
              className={element.ancreId === actif ? "ln-page__zone ln-page__zone--actif" : "ln-page__zone"}
              style={{
                left: `${element.zone.x * 100}%`,
                top: `${element.zone.y * 100}%`,
                width: `${element.zone.l * 100}%`,
                height: `${element.zone.h * 100}%`,
              }}
              onClick={() => onElement(element.ancreId)}
              aria-current={element.ancreId === actif ? "true" : undefined}
              aria-label={nom(element)}
              {...(element.ancreId === actif ? { ref: refZoneActive } : {})}
            >
              <span className="ln-page__zone-numero ln-sur-photo">{element.numero}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
});
