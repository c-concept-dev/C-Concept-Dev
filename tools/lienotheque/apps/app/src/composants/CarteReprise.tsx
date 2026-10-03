import type { JSX } from "react";
import "./CarteReprise.css";

/** Le fil est dessiné, pas écrit : le glyphe « ⟶ » tombe dans une police de repli et rend un
 *  trait maigre et pâle à 13 px. Trait continu et pointe franche, au style des icônes du kit
 *  (1,6 d'épaisseur, bouts arrondis), dans le cuivre clair de la charte (--ln-thread). */
function Fil(): JSX.Element {
  return (
    <svg className="ln-reprise__fil" viewBox="0 0 32 12" aria-hidden="true">
      <path d="M1 6h26M22.5 1.5 27 6l-4.5 4.5" />
    </svg>
  );
}

type Props = {
  readonly titre: string;
  readonly href: string;
  /** Position de départ, lue depuis une ancre (ANC-01) : « Page 127 ». */
  readonly origine: string;
  /** Position reliée, s'il y en a une (ANC-02) : « piste 41 ». */
  readonly cible?: string | undefined;
  readonly quand: string;
};

/** « Reprendre où vous en étiez » de l'Accueil (UX-01).
 *  Le lien dit son action et nomme le document : deux liens ne portent jamais le même nom. */
export function CarteReprise({ titre, href, origine, cible, quand }: Props): JSX.Element {
  return (
    <article className="ln-reprise">
      <div className="ln-reprise__texte">
        <h3 className="ln-reprise__titre">
          <a href={href} aria-label={`Reprendre ${titre}`}>
            {titre}
          </a>
        </h3>
        <p className="ln-muted ln-reprise__position">
          <span>{origine}</span>
          {cible === undefined ? null : (
            <>
              <Fil />
              <span className="ln-sr-only">relié à</span>
              <span>{cible}</span>
            </>
          )}
        </p>
      </div>
      <span className="ln-muted ln-reprise__quand">{quand}</span>
    </article>
  );
}
