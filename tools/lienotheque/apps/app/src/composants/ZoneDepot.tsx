import { useId, useState, type DragEvent, type JSX } from "react";
import { Icone } from "./Icone.js";
import "./ZoneDepot.css";

type Props = {
  readonly titre: string;
  readonly aide: string;
  readonly libelleBouton: string;
  /** Choisir un dossier entier plutôt que des fichiers (premier lancement). */
  readonly dossier?: boolean | undefined;
  readonly onFichiers: (fichiers: readonly File[]) => void;
  /** Ouvre le sélecteur du système au lieu du champ de fichiers de la page.
   *
   *  L'application de bureau en a besoin : un fichier choisi dans la page n'a pas de chemin, et
   *  l'hôte ne peut rien copier d'un fichier dont il ne sait pas où il est. */
  readonly onParcourir?: (() => void) | undefined;
};

/** `webkitdirectory` n'est pas dans les types React : c'est un attribut de la plateforme. */
const CHOIX_DOSSIER = { webkitdirectory: "", directory: "" } as Record<string, string>;

/** Dépôt universel (HER-01) avec son alternative clavier obligatoire (UX-06) :
 *  le champ de fichiers natif reste focalisable, la zone montre son focus. */
export function ZoneDepot({ titre, aide, libelleBouton, dossier = false, onFichiers, onParcourir }: Props): JSX.Element {
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
      {onParcourir === undefined ? null : (
        <button type="button" className="ln-btn ln-btn--secondaire" onClick={onParcourir}>
          {libelleBouton}
        </button>
      )}
      <label className={`ln-btn ln-btn--secondaire${onParcourir === undefined ? "" : " ln-sr-only"}`} htmlFor={id}>
        {libelleBouton}
      </label>
      <input
        id={id}
        className="ln-sr-only"
        type="file"
        multiple
        {...(dossier ? CHOIX_DOSSIER : {})}
        onChange={(evenement) => recevoir(evenement.target.files)}
      />
      <output className="ln-muted" aria-live="polite">
        {compte === null ? "" : `${compte} fichier${compte > 1 ? "s" : ""} retenu${compte > 1 ? "s" : ""}.`}
      </output>
    </div>
  );
}
