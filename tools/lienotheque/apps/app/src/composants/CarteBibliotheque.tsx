import type { CSSProperties, JSX } from "react";
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
}: Props): JSX.Element {
  const bandeau = { "--ln-collection": `var(--ln-collection-${collection})` } as CSSProperties;
  return (
    <article className="ln-carte">
      <div className="ln-carte__bandeau" style={bandeau}>
        {icones.map((nomIcone) => (
          <Icone key={nomIcone} nom={nomIcone} />
        ))}
      </div>
      <div className="ln-carte__corps">
        <h3 className="ln-carte__titre">
          <a href={href}>{nom}</a>
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
          {partages === undefined ? null : (
            <span className="ln-etat ln-muted">
              <Icone nom="personnes" titre="Personnes ayant accès" />
              {partages}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
