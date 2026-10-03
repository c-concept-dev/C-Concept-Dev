import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";
import "./Bouton.css";

export type VarianteBouton = "secondaire" | "principal" | "danger";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
  readonly variante?: VarianteBouton | undefined;
  /** Affiche le rouage et neutralise le bouton, sans changer sa largeur de place. */
  readonly chargement?: boolean | undefined;
  readonly icone?: ReactNode | undefined;
  /** Carré à la taille d'une icône : le libellé reste lisible par les lecteurs d'écran. */
  readonly compact?: boolean | undefined;
  readonly children: ReactNode;
};

/** Bouton du kit : repos, survol, focus, chargement, désactivé.
 *  Un seul bouton principal par écran (UX-09) : c'est l'écran qui en décide, pas le composant. */
export function Bouton({
  variante = "secondaire",
  chargement = false,
  icone,
  compact = false,
  children,
  disabled = false,
  type = "button",
  ...reste
}: Props): JSX.Element {
  return (
    <button
      {...reste}
      type={type}
      className={`ln-btn ln-btn--${variante}${compact ? " ln-btn--compact" : ""}`}
      disabled={disabled || chargement}
      aria-busy={chargement ? true : undefined}
    >
      {chargement ? <span className="ln-rouage" aria-hidden="true" /> : icone}
      {children}
    </button>
  );
}
