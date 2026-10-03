import type { JSX } from "react";
import "./CarteReprise.css";

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
          {origine}
          {cible === undefined ? null : (
            <>
              <span className="ln-reprise__fil" aria-hidden="true">
                {" ⟶ "}
              </span>
              <span className="ln-sr-only"> relié à </span>
              {cible}
            </>
          )}
        </p>
      </div>
      <span className="ln-muted ln-reprise__quand">{quand}</span>
    </article>
  );
}
