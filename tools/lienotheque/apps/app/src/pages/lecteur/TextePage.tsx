import { useId, useState, type JSX } from "react";
import type { TraductionDePage } from "@lienotheque/contrats";
import { Icone } from "../../composants/index.js";

/** Texte reconnu de la page, repliable, avec sa bascule original / traduction (B1, OUT-11).
 *
 *  La bascule choisie prend le style de sélection, pas le cuivre plein : un écran ne porte qu'un
 *  seul élément cuivre plein, et c'est son bouton principal. */

type Props = {
  readonly original: readonly string[];
  readonly traduction: readonly string[];
  readonly onTraduire?: () => Promise<TraductionDePage>;
};

export function TextePage({ original, traduction, onTraduire }: Props): JSX.Element | null {
  const [ouvert, setOuvert] = useState(true);
  const [vue, setVue] = useState<"original" | "traduction">("original");
  const [traduite, setTraduite] = useState<readonly string[]>(traduction);
  const [etat, setEtat] = useState<"repos" | "en_cours" | "echec" | "deja_francais">("repos");
  const id = useId();
  if (original.length === 0) return null;

  const lignes = vue === "traduction" && traduite.length > 0 ? traduite : original;
  const demander = async (): Promise<void> => {
    if (onTraduire === undefined) return;
    setEtat("en_cours");
    try {
      const reponse = await onTraduire();
      if (reponse.etat === "deja_en_francais") {
        setEtat("deja_francais");
        setVue("original");
        return;
      }
      setTraduite(reponse.traduction);
      setVue("traduction");
      setEtat("repos");
    } catch {
      setVue("original");
      setEtat("echec");
    }
  };

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
          {traduite.length > 0 ? (
            <>
              <div className="ln-bascule" role="group" aria-label="Langue du texte">
                {(["original", "traduction"] as const).map((lequel) => (
                  <button
                    key={lequel}
                    type="button"
                    className={vue === lequel ? "ln-bascule__choix ln-bascule__choix--choisi" : "ln-bascule__choix"}
                    onClick={() => setVue(lequel)}
                    aria-pressed={vue === lequel}
                  >
                    {lequel === "original" ? "Original" : "Traduction"}
                  </button>
                ))}
              </div>
              <div className="ln-texte__traduction-commandes">
                <span className="ln-texte__badge">Traduction automatique</span>
                <button
                  type="button"
                  className="ln-texte__action"
                  onClick={() => setVue(vue === "original" ? "traduction" : "original")}
                >
                  {vue === "original" ? "Voir la traduction" : "Voir le texte original"}
                </button>
              </div>
            </>
          ) : onTraduire === undefined ? null : (
            <div className="ln-texte__traduction-commandes">
              <button type="button" className="ln-texte__action" onClick={() => void demander()} disabled={etat === "en_cours"}>
                {etat === "en_cours" ? "Traduction en cours…" : etat === "echec" ? "Réessayer" : "Traduire en français"}
              </button>
            </div>
          )}

          {etat === "echec" ? <p className="ln-texte__erreur" role="alert">Échec de la traduction automatique. Le texte original est conservé.</p> : null}
          {etat === "deja_francais" ? <p className="ln-texte__information">Cette page est déjà en français.</p> : null}

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
