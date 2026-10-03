import type { JSX } from "react";
import emblemeClair from "@kit/assets/emblem-light.svg";
import emblemeSombre from "@kit/assets/emblem-dark.svg";
import { Bouton, ChampRecherche, Etat, Icone } from "./composants/index.js";
import type { DonneesAccueil } from "./donnees/modele.js";
import { SelecteurTheme } from "./theme/SelecteurTheme.js";
import type { Theme } from "./theme/theme.js";
import "./EnTete.css";

type Props = {
  readonly theme: Theme;
  readonly onThemeChange: (theme: Theme) => void;
  readonly onRecherche: (texte: string) => void;
  readonly donnees: DonneesAccueil;
};

/** Barre permanente : chaque commande y garde sa place (UX-09), mais n'apparaît que si elle a
 *  un objet — au premier lancement il n'y a rien à chercher, rien à synchroniser, rien à vérifier.
 *  Le logo est le vectoriel validé du kit ; l'hybride garde la barre graphite, donc l'emblème sombre. */
export function EnTete({ theme, onThemeChange, onRecherche, donnees }: Props): JSX.Element {
  const embleme = theme === "light" ? emblemeClair : emblemeSombre;
  const garnie = donnees.bibliotheques.length > 0;
  const traitement = donnees.traitement;

  return (
    <header className="ln-shell">
      <div className="ln-brand">
        <img src={embleme} alt="" width={28} height={28} />
        Liénothèque
      </div>

      {garnie ? (
        <ChampRecherche
          etiquette="Rechercher dans toutes vos bibliothèques"
          placeholder="Rechercher dans toutes vos bibliothèques…"
          onRecherche={onRecherche}
        />
      ) : null}

      <div className="ln-shell__etats">
        {traitement === undefined ? null : <Etat enCours>1 traitement en cours</Etat>}
        {garnie ? <Etat icone="nuage">Synchronisé</Etat> : null}
        {donnees.aVerifier === undefined ? null : (
          <Bouton compact icone={<Icone nom="cloche" />}>
            <span className="ln-sr-only">Notifications</span>
          </Bouton>
        )}
        {donnees.compte === undefined ? null : (
          <Bouton compact>
            <span aria-hidden="true">{donnees.compte.initiales}</span>
            <span className="ln-sr-only">{donnees.compte.nom}</span>
          </Bouton>
        )}
        <SelecteurTheme theme={theme} onChange={onThemeChange} />
      </div>
    </header>
  );
}
