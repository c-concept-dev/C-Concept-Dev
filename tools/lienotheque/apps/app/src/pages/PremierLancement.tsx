import type { JSX } from "react";
import logoClair from "@kit/assets/logo-horizontal-light.svg";
import logoSombre from "@kit/assets/logo-horizontal-dark.svg";
import { Bouton, Icone, ZoneDepot } from "../composants/index.js";
import type { Theme } from "../theme/theme.js";
import "./PremierLancement.css";

type Props = {
  readonly theme: Theme;
  readonly onCreer: () => void;
  readonly onFichiers: (fichiers: readonly File[]) => void;
};

/** Premier lancement : aucune bibliothèque, donc aucune section. Une seule chose importante
 *  à l'écran et un seul bouton principal (UX-09) ; le dépôt garde son alternative clavier (UX-06). */
export function PremierLancement({ theme, onCreer, onFichiers }: Props): JSX.Element {
  const logo = theme === "light" ? logoClair : logoSombre;
  return (
    <main id="contenu" className="ln-layout ln-premier" tabIndex={-1}>
      <h1 className="ln-premier__titre">
        <img className="ln-premier__logo" src={logo} alt="Liénothèque" />
      </h1>
      <p className="ln-premier__signature">Vos documents et médias, enfin reliés.</p>

      <Bouton variante="principal" icone={<Icone nom="plus" />} onClick={onCreer}>
        Créer ma première bibliothèque
      </Bouton>

      <ZoneDepot
        titre="ou déposez directement un dossier"
        aide="Liénothèque lira ce qu'il contient et vous proposera une bibliothèque."
        libelleBouton="Choisir un dossier"
        dossier
        onFichiers={onFichiers}
      />
    </main>
  );
}
