import type { JSX } from "react";
import emblemeClair from "@kit/assets/emblem-light.svg";
import emblemeSombre from "@kit/assets/emblem-dark.svg";
import { ChampRecherche, Etat } from "./composants/index.js";
import type { DonneesAccueil } from "./donnees/modele.js";
import { SelecteurTheme } from "./theme/SelecteurTheme.js";
import type { Theme } from "./theme/theme.js";
import "./EnTete.css";

type Props = {
  readonly theme: Theme;
  readonly onThemeChange: (theme: Theme) => void;
  readonly onRecherche: (texte: string) => void;
  readonly requeteRecherche?: string | undefined;
  readonly onRequeteRecherche?: ((texte: string) => void) | undefined;
  readonly donnees: DonneesAccueil;
  /** Un document est réellement chargé, même si aucune bibliothèque locale ne le porte.
   *  C'est le cas en ligne : la façade sert une bibliothèque sans dossier sur cet ordinateur. */
  readonly rechercheDisponible?: boolean | undefined;
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
export function EnTete({ theme, onThemeChange, onRecherche, requeteRecherche, onRequeteRecherche, donnees, rechercheDisponible = false, enTraitement }: Props): JSX.Element {
  const embleme = theme === "light" ? emblemeClair : emblemeSombre;
  const garnie = donnees.bibliotheques.length > 0 || rechercheDisponible;


  return (
    <header className="ln-shell">
      <div className="ln-brand">
        <img src={embleme} alt="" width={28} height={28} />
        Liénothèque
      </div>

      {/* **Ce champ ne cherche que dans le document ouvert**, et il le dit.
          Il annonçait « toutes vos bibliothèques ». Or la recherche du bureau lit les passages
          du seul document regardé : il n'existe aucun index de bibliothèque sur cette
          plateforme — la façade en ligne en a un, le bureau non (réserve 9.3 du lot E5). Mesuré
          le 22 octobre 2026 sur 243 documents : la recherche ne trouvait rien, et c'était
          conforme à ce qu'elle fait, non à ce qu'elle annonçait.
          Une promesse qu'on ne tient pas coûte plus cher qu'une capacité qu'on n'a pas : on dit
          la portée réelle en attendant l'index, qui est un chantier à lui seul. */}
      {garnie ? (
        <ChampRecherche
          etiquette="Rechercher dans le document ouvert"
          placeholder="Rechercher dans le document ouvert…"
          onRecherche={onRecherche}
          {...(requeteRecherche === undefined ? {} : { valeur: requeteRecherche })}
          {...(onRequeteRecherche === undefined ? {} : { onValeurChange: onRequeteRecherche })}
        />
      ) : null}

      <div className="ln-shell__etats">
        {enTraitement === undefined || enTraitement === 0 ? null : (
          <Etat enCours>{`${enTraitement} traitement${enTraitement > 1 ? "s" : ""} en cours`}</Etat>
        )}
        {/* **Plus de « Synchronisé »** : rien ne synchronisait, et l'étiquette le promettait
            depuis l'origine. Elle disait une capacité de la phase 2 sur une application qui
            n'en a aucune — c'est la plus ancienne des portes peintes, et la seule qui mentait
            sans qu'on puisse même cliquer dessus. Elle reviendra le jour où quelque chose
            synchronisera, et pas avant. */}
        {/* **Deux boutons de moins**, et pour la même raison que l'étiquette ci-dessus.
            « Notifications » et le compte n'avaient aucun gestionnaire de clic : ils étaient
            peints sur le mur, et depuis l'origine. Il n'existe ni écran de notifications ni
            écran de compte ; les annoncer dans l'en-tête de chaque écran promettait deux
            fonctions qui n'ont jamais été écrites.
            Ils reviendront avec ce qu'ils ouvrent. Le filet des portes peintes couvre désormais
            l'en-tête, pour qu'ils ne puissent pas revenir seuls. */}
        {import.meta.env.DEV ? <SelecteurTheme theme={theme} onChange={onThemeChange} /> : null}
      </div>
    </header>
  );
}
