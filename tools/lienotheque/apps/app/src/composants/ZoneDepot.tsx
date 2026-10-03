import { useId, useState, type DragEvent, type JSX } from "react";
import { Icone } from "./Icone.js";
import "./ZoneDepot.css";

type Props = {
  readonly titre: string;
  readonly aide: string;
  readonly libelleBouton: string;
  readonly onFichiers: (fichiers: readonly File[]) => void;
};

/** Dépôt universel (HER-01) avec son alternative clavier obligatoire (UX-06) :
 *  le champ de fichiers natif reste focalisable, la zone montre son focus. */
export function ZoneDepot({ titre, aide, libelleBouton, onFichiers }: Props): JSX.Element {
  const id = useId();
  const [compte, setCompte] = useState<number | null>(null);

  const recevoir = (liste: FileList | null): void => {
    const fichiers = [...(liste ?? [])];
    setCompte(fichiers.length);
    onFichiers(fichiers);
  };

  const surDepot = (evenement: DragEvent<HTMLDivElement>): void => {
    evenement.preventDefault();
    recevoir(evenement.dataTransfer.files);
  };

  return (
    <div className="ln-depot" onDragOver={(evenement) => evenement.preventDefault()} onDrop={surDepot}>
      <Icone nom="depot" />
      <p className="ln-depot__titre">{titre}</p>
      <p className="ln-muted">{aide}</p>
      <label className="ln-btn ln-btn--secondaire" htmlFor={id}>
        {libelleBouton}
      </label>
      <input
        id={id}
        className="ln-sr-only"
        type="file"
        multiple
        onChange={(evenement) => recevoir(evenement.target.files)}
      />
      <output className="ln-muted" aria-live="polite">
        {compte === null ? "" : `${compte} fichier${compte > 1 ? "s" : ""} retenu${compte > 1 ? "s" : ""}.`}
      </output>
    </div>
  );
}
