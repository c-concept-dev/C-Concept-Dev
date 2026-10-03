import { useEffect, useId, useRef, type JSX } from "react";
import { Icone } from "./Icone.js";
import "./ChampRecherche.css";

type Props = {
  readonly etiquette: string;
  readonly placeholder: string;
  readonly onRecherche: (texte: string) => void;
  /** Cmd+K (ou Ctrl+K) place le curseur dans le champ, où que soit le focus. */
  readonly raccourci?: boolean | undefined;
};

/** Champ de recherche du kit : étiquette permanente, champ natif de type « search »,
 *  soumission au clavier seul (UX-06) et raccourci Cmd+K du CDC. */
export function ChampRecherche({ etiquette, placeholder, onRecherche, raccourci = true }: Props): JSX.Element {
  const id = useId();
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!raccourci) return;
    const surTouche = (evenement: KeyboardEvent): void => {
      if ((evenement.metaKey || evenement.ctrlKey) && evenement.key.toLowerCase() === "k") {
        evenement.preventDefault();
        champ.current?.focus();
      }
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [raccourci]);

  return (
    <form
      className="ln-recherche"
      role="search"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        onRecherche(champ.current?.value.trim() ?? "");
      }}
    >
      <label className="ln-sr-only" htmlFor={id}>
        {etiquette}
      </label>
      <span className="ln-recherche__loupe">
        <Icone nom="recherche" />
      </span>
      <input ref={champ} id={id} className="ln-recherche__champ" type="search" placeholder={placeholder} />
      {raccourci ? (
        <kbd className="ln-recherche__raccourci" aria-hidden="true">
          ⌘K
        </kbd>
      ) : null}
    </form>
  );
}
