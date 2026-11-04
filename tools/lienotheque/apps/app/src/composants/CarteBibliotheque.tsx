import { useId, useState, type CSSProperties, type JSX } from "react";
import { BadgeEtat, Etat } from "./BadgeEtat.js";
import { Icone, type NomIcone } from "./Icone.js";
import "./CarteBibliotheque.css";

/** Bandeaux de collection des jetons v3.0.1. Le test « collections » vérifie
 *  que cette liste reste celle de tokens.json. */
export const COLLECTIONS = ["method", "research", "video", "photos"] as const;
export type Collection = (typeof COLLECTIONS)[number];

type Props = {
  readonly nom: string;
  readonly href: string;
  readonly collection: Collection;
  /** Le bandeau ne porte que des icônes : le taupe passe sous 4,5:1 pour du texte. */
  readonly icones: readonly NomIcone[];
  /** Libellés venus du schéma de la bibliothèque (« 412 éléments », « 380 liens »). */
  readonly compteurs: readonly string[];
  readonly aVerifier?: string | undefined;
  readonly hebergement: { readonly libelle: string; readonly icones: readonly NomIcone[] };
  readonly etat: {
    readonly libelle: string;
    readonly icone?: NomIcone | undefined;
    readonly enCours?: boolean | undefined;
  };
  readonly ouverte: string;
  readonly partages?: number | undefined;
  /** Appelé quand on ouvre cette bibliothèque-ci.
   *
   *  **Toutes les cartes menaient à la même adresse**, `#depot`, et cet écran montre « la dernière
   *  bibliothèque de la liste » : cliquer l'une ou l'autre donnait la même, et l'on se croyait
   *  dans une bibliothèque en regardant les documents d'une autre. Le lien reste un lien — pour
   *  le clavier et le menu contextuel — mais il dit d'abord **laquelle** on ouvre. */
  readonly onOuvrir?: (() => void) | undefined;
  /** Renomme durablement la bibliothèque. Absent en lecture seule, notamment en ligne.
   *
   *  Reçoit le **nouveau nom**, saisi dans la carte. Il appelait auparavant `globalThis.prompt`,
   *  que la WebView de l'application empaquetée n'implémente pas : elle rend `null` sans rien
   *  afficher, et renommer était impossible — sans un mot à l'écran. Trouvé le 4 novembre 2026
   *  en voulant s'en servir dans le paquet installé. */
  readonly onRenommer?: ((nouveau: string) => void) | undefined;
};

export function CarteBibliotheque({
  nom,
  href,
  collection,
  icones,
  compteurs,
  aVerifier,
  hebergement,
  etat,
  ouverte,
  partages,
  onOuvrir,
  onRenommer,
}: Props): JSX.Element {
  const bandeau = { "--ln-collection": `var(--ln-collection-${collection})` } as CSSProperties;
  const champ = useId();
  const [renommage, setRenommage] = useState<string | undefined>(undefined);
  return (
    <article className="ln-carte">
      <div className="ln-carte__bandeau" style={bandeau}>
        {icones.map((nomIcone) => (
          <Icone key={nomIcone} nom={nomIcone} />
        ))}
      </div>
      <div className="ln-carte__corps">
        <h3 className="ln-carte__titre">
          <a href={href} aria-label={`Ouvrir la bibliothèque ${nom}`} onClick={onOuvrir}>
            {nom}
          </a>
        </h3>
        <div className="ln-row ln-carte__compteurs">
          {compteurs.map((compteur) => (
            <BadgeEtat key={compteur}>{compteur}</BadgeEtat>
          ))}
          {aVerifier === undefined ? null : (
            <BadgeEtat ton="avertissement" icone="alerte">
              {aVerifier}
            </BadgeEtat>
          )}
        </div>
        <div className="ln-carte__ligne">
          <span className="ln-etat">
            {hebergement.icones.map((nomIcone) => (
              <Icone key={nomIcone} nom={nomIcone} />
            ))}
            {hebergement.libelle}
          </span>
          <Etat icone={etat.icone} enCours={etat.enCours ?? false}>
            {etat.libelle}
          </Etat>
        </div>
        <div className="ln-carte__pied">
          <span className="ln-muted">Ouverte {ouverte}</span>
          {onRenommer === undefined ? null : (
            <button
              type="button"
              className="ln-lien-action"
              aria-label={`Renommer ${nom}`}
              onClick={() => setRenommage(nom)}
            >
              Renommer
            </button>
          )}
          {partages === undefined ? null : (
            <span className="ln-etat ln-muted">
              <Icone nom="personnes" titre="Personnes ayant accès" />
              {partages}
            </span>
          )}
        </div>
        {onRenommer === undefined || renommage === undefined ? null : (
          <form
            className="ln-carte__renommage"
            onSubmit={(evenement) => {
              evenement.preventDefault();
              const propose = renommage.trim();
              setRenommage(undefined);
              if (propose.length > 0 && propose !== nom) onRenommer(propose);
            }}
          >
            <label className="ln-champ ln-champ--serre" htmlFor={champ}>
              Nouveau nom
              <input
                id={champ}
                className="ln-saisie"
                value={renommage}
                autoFocus
                onChange={(evenement) => setRenommage(evenement.target.value)}
              />
            </label>
            <div className="ln-row">
              <button type="submit" className="ln-lien-action" aria-label="Enregistrer le nom">
                Enregistrer
              </button>
              <button
                type="button"
                className="ln-lien-action"
                aria-label="Renoncer au renommage"
                onClick={() => setRenommage(undefined)}
              >
                Renoncer
              </button>
            </div>
          </form>
        )}
      </div>
    </article>
  );
}
