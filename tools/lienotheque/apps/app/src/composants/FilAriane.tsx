import type { JSX } from "react";
import "./FilAriane.css";

/** Fil d'Ariane (B1 à B4). Le dernier maillon est la page où l'on est : il ne cliquera nulle part.
 *
 *  Une seule implémentation pour tous les écrans, pour qu'aucun n'invente son chemin : « Accueil ›
 *  <bibliothèque> › Vérifier », et non « Accueil › <bibliothèque> › Page 127 › Vérifier ». */

export type Maillon = { readonly libelle: string; readonly href?: string };

export function FilAriane({ chemin }: { readonly chemin: readonly Maillon[] }): JSX.Element {
  return (
    <nav className="ln-ariane" aria-label="Fil d’Ariane">
      <ol className="ln-ariane__liste">
        {chemin.map((maillon, rang) => (
          <li key={maillon.libelle} className="ln-ariane__maillon">
            {maillon.href === undefined || rang === chemin.length - 1 ? (
              <span aria-current="page">{maillon.libelle}</span>
            ) : (
              <a href={maillon.href}>{maillon.libelle}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
