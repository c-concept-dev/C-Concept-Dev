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
  /** Ouvre une bibliothèque qui existe déjà sur le disque. Absent sur le web, qui n'a pas de
   *  disque à parcourir : l'écran n'offre alors pas une action qui ne mènerait nulle part. */
  readonly onOuvrir?: (() => void) | undefined;
  /** Ce qui s'est passé à la dernière tentative d'ouverture, quand elle n'a mené à rien. */
  readonly echec?: string | undefined;
};

/** Premier lancement : aucune bibliothèque, donc aucune section. Une seule chose importante
 *  à l'écran et un seul bouton principal (UX-09) ; le dépôt garde son alternative clavier (UX-06). */
export function PremierLancement({ theme, onCreer, onFichiers, onOuvrir, echec }: Props): JSX.Element {
  const logo = theme === "light" ? logoClair : logoSombre;
  return (
    <main id="contenu" className="ln-layout ln-premier" tabIndex={-1}>
      {/* Un seul panneau : logo, signature et l'action unique. Invisible en clair, opaque sur
          la photo, où le texte et le bouton se perdraient sur un fond changeant. */}
      <div className="ln-premier__accroche ln-panneau-titre">
        <h1 className="ln-premier__titre">
          <img className="ln-premier__logo" src={logo} alt="Liénothèque" />
        </h1>
        <p className="ln-premier__signature">Vos documents et médias, enfin reliés.</p>
        <Bouton variante="principal" icone={<Icone nom="plus" />} onClick={onCreer}>
          Créer ma première bibliothèque
        </Bouton>
        {onOuvrir === undefined ? null : (
          <button type="button" className="ln-lien-action ln-premier__ouvrir" onClick={onOuvrir}>
            <Icone nom="dossier" />
            J’en ai déjà une : l’ouvrir
          </button>
        )}
        {echec === undefined ? null : (
          <p className="ln-premier__echec" role="alert">
            <Icone nom="alerte" />
            {echec}
          </p>
        )}
      </div>

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
