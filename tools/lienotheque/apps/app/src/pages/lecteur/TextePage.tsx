import { useId, useState, type JSX } from "react";
import { Icone } from "../../composants/index.js";

/** Texte reconnu de la page, repliable, avec sa bascule original / traduction (B1, OUT-11).
 *
 *  La bascule choisie prend le style de sélection, pas le cuivre plein : un écran ne porte qu'un
 *  seul élément cuivre plein, et c'est son bouton principal. */

type Props = {
  readonly original: readonly string[];
  readonly traduction: readonly string[];
};

export function TextePage({ original, traduction }: Props): JSX.Element | null {
  const [ouvert, setOuvert] = useState(true);
  const [vue, setVue] = useState<"original" | "traduction">("original");
  const id = useId();
  if (original.length === 0) return null;

  const lignes = vue === "traduction" && traduction.length > 0 ? traduction : original;

  return (
    <section className="ln-texte ln-panneau" aria-labelledby={`${id}-titre`}>
      <button type="button" className="ln-texte__entete" onClick={() => setOuvert(!ouvert)} aria-expanded={ouvert} aria-controls={`${id}-corps`}>
        <span id={`${id}-titre`} className="ln-texte__titre">
          Texte de la page
        </span>
        <Icone nom={ouvert ? "moins" : "plus"} />
      </button>

      {ouvert ? (
        <div id={`${id}-corps`}>
          <div className="ln-bascule" role="group" aria-label="Langue du texte">
            {(["original", "traduction"] as const).map((lequel) => (
              <button
                key={lequel}
                type="button"
                className={vue === lequel ? "ln-bascule__choix ln-bascule__choix--choisi" : "ln-bascule__choix"}
                onClick={() => setVue(lequel)}
                aria-pressed={vue === lequel}
                disabled={lequel === "traduction" && traduction.length === 0}
              >
                {lequel === "original" ? "Original" : "Traduction"}
              </button>
            ))}
          </div>

          <ol className="ln-texte__lignes">
            {lignes.map((ligne, rang) => (
              <li key={`${rang}-${ligne.slice(0, 12)}`} className={rang === 0 ? "ln-texte__ligne ln-texte__ligne--lue" : "ln-texte__ligne"}>
                {ligne}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
