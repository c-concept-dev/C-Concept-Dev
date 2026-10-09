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
  /** Combien de travaux tournent vraiment, lus de la file de l'hôte.
   *
   *  Le bandeau annonçait « 1 traitement en cours » quoi qu'il arrive — un chiffre écrit dans le
   *  code, qui disait toujours la même chose et ne disait donc rien. Absent ou nul, le bandeau
   *  disparaît : il n'y a alors rien à annoncer. */
  readonly enTraitement?: number | undefined;
};

/** Barre permanente : chaque commande y garde sa place (UX-09), mais n'apparaît que si elle a
 *  un objet — au premier lancement il n'y a rien à chercher, rien à synchroniser, rien à vérifier.
 *  Le thème se règle dans les réglages, pas ici : la barre ne le montre qu'en développement, où
 *  l'on bascule sans cesse entre les trois variantes.
 *  Le logo est le vectoriel validé du kit ; l'hybride garde la barre graphite, donc l'emblème sombre. */
export function EnTete({ theme, onThemeChange, onRecherche, donnees, enTraitement }: Props): JSX.Element {
  const embleme = theme === "light" ? emblemeClair : emblemeSombre;
  const garnie = donnees.bibliotheques.length > 0;


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
        {enTraitement === undefined || enTraitement === 0 ? null : (
          <Etat enCours>{`${enTraitement} traitement${enTraitement > 1 ? "s" : ""} en cours`}</Etat>
        )}
        {garnie ? <Etat icone="nuage">Synchronisé</Etat> : null}
        {donnees.aVerifier === undefined ? null : (
          <Bouton compact icone={<Icone nom="cloche" />}>
            Notifications
          </Bouton>
        )}
        {donnees.compte === undefined ? null : (
          <Bouton compact icone={<span aria-hidden="true">{donnees.compte.initiales}</span>}>
            {donnees.compte.nom}
          </Bouton>
        )}
        {import.meta.env.DEV ? <SelecteurTheme theme={theme} onChange={onThemeChange} /> : null}
      </div>
    </header>
  );
}
