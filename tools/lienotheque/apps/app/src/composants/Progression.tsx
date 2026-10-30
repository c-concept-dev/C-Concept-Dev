import type { JSX } from "react";
import "./Progression.css";

type Props = {
  /** Avancement entre 0 et 1, comme le champ `progression` du contrat Travail. */
  readonly valeur: number;
  readonly etiquette: string;
  /** Une phase réelle est en cours, mais elle ne rend aucun total honnête. */
  readonly indetermine?: boolean | undefined;
  /** Temps restant ou précision affichée à côté du pourcentage. */
  readonly complement?: string | undefined;
};

const pourcent = (valeur: number): number => Math.round(Math.min(1, Math.max(0, valeur)) * 100);

/** Trait de 3 px, liseré graphite et pourcentage toujours écrit : le trait seul ne suffit pas
 *  (jetons v3.0.1, réserves de la charte ; UX-07). */
export function Progression({ valeur, etiquette, indetermine = false, complement }: Props): JSX.Element {
  const part = pourcent(valeur);
  return (
    <div className="ln-progression">
      <div
        className="ln-progression__piste"
        role="progressbar"
        aria-label={etiquette}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(indetermine ? { "aria-valuetext": "Progression non mesurable" } : { "aria-valuenow": part })}
      >
        <div
          className={`ln-progression__trait${indetermine ? " ln-progression__trait--indetermine" : ""}`}
          {...(indetermine ? {} : { style: { width: `${part}%` } })}
        />
      </div>
      <p className="ln-muted ln-progression__legende">
        {indetermine ? "Progression non mesurable" : `${part} %${complement === undefined ? "" : ` · ${complement}`}`}
      </p>
    </div>
  );
}
