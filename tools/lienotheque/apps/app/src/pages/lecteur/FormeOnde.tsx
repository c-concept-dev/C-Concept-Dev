import { forwardRef, type JSX } from "react";

/** Forme d'onde du média, avec le segment proposé mis en évidence (B1, correction 5).
 *
 *  Hors du segment actif, l'onde est en gris pierre : elle situe, elle n'appelle pas. Le segment
 *  actif est en cuivre clair — la même couleur que le fil qui le relie à sa zone, pour qu'on voie
 *  d'un coup d'œil que les deux parlent du même endroit.
 *
 *  Les hauteurs ne sont pas tirées au hasard : une onde qui change de forme à chaque rendu
 *  donnerait l'impression que le son a changé. */

const BARRES = 96;

/** Hauteur de la barre de rang `rang`, entre 0,15 et 1. Déterministe : même média, même onde. */
export function hauteurDeBarre(graine: number, rang: number): number {
  const x = Math.sin((graine + 1) * 12.9898 + rang * 78.233) * 43758.5453;
  return 0.15 + (x - Math.floor(x)) * 0.85;
}

type Props = {
  readonly graine: number;
  readonly debut: number;
  readonly fin: number;
  readonly avancement: number;
  readonly etiquette: string;
};

export const FormeOnde = forwardRef<SVGRectElement, Props>(function FormeOnde(
  { graine, debut, fin, avancement, etiquette },
  refSegment,
): JSX.Element {
  const barres = Array.from({ length: BARRES }, (_, rang) => {
    const part = (rang + 0.5) / BARRES;
    return { rang, part, hauteur: hauteurDeBarre(graine, rang), dedans: part >= debut && part <= fin };
  });

  return (
    <svg className="ln-onde" viewBox={`0 0 ${BARRES * 4} 64`} preserveAspectRatio="none" role="img" aria-label={etiquette}>
      <rect
        ref={refSegment}
        className="ln-onde__segment"
        x={debut * BARRES * 4}
        y="0"
        width={Math.max(1, (fin - debut) * BARRES * 4)}
        height="64"
      />
      {barres.map(({ rang, hauteur, dedans }) => (
        <rect
          key={rang}
          className={dedans ? "ln-onde__barre ln-onde__barre--actif" : "ln-onde__barre"}
          x={rang * 4}
          y={32 - (hauteur * 60) / 2}
          width="2.4"
          height={hauteur * 60}
        />
      ))}
      <rect className="ln-onde__tete" x={avancement * BARRES * 4} y="0" width="2" height="64" />
    </svg>
  );
});
