import type { JSX } from "react";
import {
  Bouton,
  CarteBibliotheque,
  CarteReprise,
  Icone,
  Progression,
  ZoneDepot,
} from "../composants/index.js";
import {
  A_VERIFIER,
  BIBLIOTHEQUES,
  REPRISES,
  TRAITEMENT,
  TRAVAIL_EN_COURS,
  decrireCompteur,
  nombreFrancais,
} from "../donnees/accueil.js";
import { decrireParcours, decrirePosition } from "../donnees/positions.js";
import "./Accueil.css";

type Props = { readonly onFichiers: (fichiers: readonly File[]) => void };

/** Accueil du CDC : cartes de bibliothèques, « reprendre où vous en étiez », cas à vérifier.
 *  Une seule chose importante par écran et un seul bouton principal (UX-09). */
export function Accueil({ onFichiers }: Props): JSX.Element {
  return (
    <main id="contenu" className="ln-layout ln-accueil" tabIndex={-1}>
      <div className="ln-accueil__principal">
        <div className="ln-panneau-titre">
          <h1 className="ln-bonjour">Bonjour</h1>
          <p className="ln-accueil__resume">
            {BIBLIOTHEQUES.length} bibliothèques <span aria-hidden="true">·</span>{" "}
            <a href={A_VERIFIER.href}>{A_VERIFIER.nombre} éléments à vérifier</a>
          </p>
        </div>

        <section aria-labelledby="titre-reprendre">
          <h2 id="titre-reprendre" className="ln-accueil__titre ln-panneau-titre">
            Reprendre
          </h2>
          <div className="ln-pile">
            {REPRISES.map((reprise) => (
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
            {BIBLIOTHEQUES.map((bibliotheque) => (
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
        <section className="ln-panneau" aria-labelledby="titre-verifier">
          <h2 id="titre-verifier" className="ln-accueil__titre">
            À vérifier
          </h2>
          <p className="ln-accueil__nombre">{nombreFrancais(A_VERIFIER.nombre)}</p>
          <p className="ln-accueil__precision">dans {A_VERIFIER.bibliotheque}</p>
          <a href={A_VERIFIER.href}>Ouvrir la vérification</a>
        </section>

        <section className="ln-panneau" aria-labelledby="titre-traitement">
          <h2 id="titre-traitement" className="ln-accueil__titre">
            Traitement en cours
          </h2>
          <p className="ln-accueil__precision">{TRAITEMENT.libelle}</p>
          <Progression
            valeur={TRAVAIL_EN_COURS.progression}
            etiquette={TRAITEMENT.libelle}
            complement={TRAITEMENT.reste}
          />
        </section>

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
