import type { JSX } from "react";
import {
  Bouton,
  CarteBibliotheque,
  CarteReprise,
  Icone,
  Progression,
  ZoneDepot,
} from "../composants/index.js";
import { decrireCompteur, nombreFrancais, type DonneesAccueil } from "../donnees/modele.js";
import { decrireParcours, decrirePosition } from "../donnees/positions.js";
import "./Accueil.css";

type Props = {
  readonly donnees: DonneesAccueil;
  readonly onFichiers: (fichiers: readonly File[]) => void;
};

/** Accueil du CDC : cartes de bibliothèques, « reprendre où vous en étiez », cas à vérifier.
 *  Chaque section n'existe que si elle a du contenu : rien ne s'affiche à vide. */
export function Accueil({ donnees, onFichiers }: Props): JSX.Element {
  const { bibliotheques, reprises, aVerifier, traitement } = donnees;

  return (
    <main id="contenu" className="ln-layout ln-accueil" tabIndex={-1}>
      <div className="ln-accueil__principal">
        <div className="ln-panneau-titre">
          <h1 className="ln-bonjour">Bonjour</h1>
          <p className="ln-accueil__resume">
            {bibliotheques.length} bibliothèque{bibliotheques.length > 1 ? "s" : ""}
            {aVerifier === undefined ? null : (
              <>
                {" "}
                <span aria-hidden="true">·</span>{" "}
                <a href={aVerifier.href}>
                  {aVerifier.nombre} élément{aVerifier.nombre > 1 ? "s" : ""} à vérifier
                </a>
              </>
            )}
          </p>
        </div>

        {reprises.length === 0 ? null : (
          <section aria-labelledby="titre-reprendre">
            <h2 id="titre-reprendre" className="ln-accueil__titre ln-panneau-titre">
              Reprendre
            </h2>
            <div className="ln-pile">
              {reprises.map((reprise) => (
                <CarteReprise
                  key={reprise.documentId}
                  titre={reprise.titre}
                  href={reprise.href}
                  origine={decrireParcours(reprise.origine)}
                  cible={reprise.cible && decrirePosition(reprise.cible)}
                  quand={reprise.quand}
                />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="titre-bibliotheques">
          <div className="ln-accueil__entete ln-panneau-titre">
            <h2 id="titre-bibliotheques" className="ln-accueil__titre">
              Vos bibliothèques
            </h2>
            <Bouton variante="principal" icone={<Icone nom="plus" />}>
              Nouvelle bibliothèque
            </Bouton>
          </div>
          <div className="ln-grille">
            {bibliotheques.map((bibliotheque) => (
              <CarteBibliotheque
                key={bibliotheque.id}
                nom={bibliotheque.nom}
                href={bibliotheque.href}
                collection={bibliotheque.collection}
                icones={bibliotheque.icones}
                compteurs={bibliotheque.compteurs.map(decrireCompteur)}
                aVerifier={bibliotheque.aVerifier === undefined ? undefined : `${bibliotheque.aVerifier} à vérifier`}
                hebergement={bibliotheque.hebergement}
                etat={bibliotheque.etat}
                ouverte={bibliotheque.ouverte}
                partages={bibliotheque.partages}
              />
            ))}
          </div>
        </section>
      </div>

      <aside className="ln-accueil__cote" aria-label="Ce qui demande votre attention">
        {aVerifier === undefined ? null : (
          <section className="ln-panneau" aria-labelledby="titre-verifier">
            <h2 id="titre-verifier" className="ln-accueil__titre">
              À vérifier
            </h2>
            <p className="ln-accueil__nombre">{nombreFrancais(aVerifier.nombre)}</p>
            <p className="ln-accueil__precision">dans {aVerifier.bibliotheque}</p>
            <a href={aVerifier.href}>Ouvrir la vérification</a>
          </section>
        )}

        {traitement === undefined ? null : (
          <section className="ln-panneau" aria-labelledby="titre-traitement">
            <h2 id="titre-traitement" className="ln-accueil__titre">
              Traitement en cours
            </h2>
            <p className="ln-accueil__precision">{traitement.libelle}</p>
            <Progression
              valeur={traitement.progression}
              etiquette={traitement.libelle}
              complement={traitement.reste}
            />
          </section>
        )}

        <ZoneDepot
          titre="Déposez des fichiers ici"
          aide="Liénothèque proposera la bonne bibliothèque."
          libelleBouton="Choisir des fichiers"
          onFichiers={onFichiers}
        />
      </aside>
    </main>
  );
}
