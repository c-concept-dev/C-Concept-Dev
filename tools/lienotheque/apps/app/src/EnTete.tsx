import type { JSX } from "react";
import emblemeClair from "@kit/assets/emblem-light.svg";
import emblemeSombre from "@kit/assets/emblem-dark.svg";
import { Bouton, ChampRecherche, Etat, Icone } from "./composants/index.js";
import { COMPTE } from "./donnees/accueil.js";
import { SelecteurTheme } from "./theme/SelecteurTheme.js";
import type { Theme } from "./theme/theme.js";
import "./EnTete.css";

type Props = {
  readonly theme: Theme;
  readonly onThemeChange: (theme: Theme) => void;
  readonly onRecherche: (texte: string) => void;
  readonly traitements: number;
};

/** Barre permanente : l'emplacement des commandes principales ne change jamais (UX-09).
 *  Le logo est le vectoriel validé du kit ; l'hybride garde la barre graphite, donc l'emblème sombre. */
export function EnTete({ theme, onThemeChange, onRecherche, traitements }: Props): JSX.Element {
  const embleme = theme === "light" ? emblemeClair : emblemeSombre;
  const enCours = `${traitements} traitement${traitements > 1 ? "s" : ""} en cours`;
  return (
    <header className="ln-shell">
      <div className="ln-brand">
        <img src={embleme} alt="" width={28} height={28} />
        Liénothèque
      </div>

      <ChampRecherche
        etiquette="Rechercher dans toutes vos bibliothèques"
        placeholder="Rechercher dans toutes vos bibliothèques…"
        onRecherche={onRecherche}
      />

      <div className="ln-shell__etats">
        <Etat enCours>{enCours}</Etat>
        <Etat icone="nuage">Synchronisé</Etat>
        <Bouton compact icone={<Icone nom="cloche" />}>
          <span className="ln-sr-only">Notifications</span>
        </Bouton>
        <Bouton compact>
          <span aria-hidden="true">{COMPTE.initiales}</span>
          <span className="ln-sr-only">{COMPTE.nom}</span>
        </Bouton>
        <SelecteurTheme theme={theme} onChange={onThemeChange} />
      </div>
    </header>
  );
}
