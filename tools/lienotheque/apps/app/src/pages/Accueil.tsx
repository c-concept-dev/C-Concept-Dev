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
import type { EtatApplicationEmbarquee } from "../pont/port.js";
import "./Accueil.css";

type Props = {
  readonly donnees: DonneesAccueil;
  /** Le dépôt n'existe que sur le bureau. L'Accueil en ligne reste un vrai Accueil, sans
   *  peindre une zone qui ne pourrait remettre aucun fichier au navigateur. */
  readonly onFichiers?: ((fichiers: readonly File[]) => void) | undefined;
  /** Dans le paquet, le sélecteur natif rend des chemins réellement importables. */
  readonly onParcourir?: (() => void) | undefined;
  /** Noms des fichiers dont l'accueil attend encore la bibliothèque de destination. */
  readonly depotEnAttente?: readonly string[] | undefined;
  readonly onChoisirBibliothequePourDepot?: ((id: string) => void) | undefined;
  readonly onAnnulerDepot?: (() => void) | undefined;
  readonly echecDepot?: string | undefined;
  /** Créer une bibliothèque de plus. **Le bouton n'appelait personne** : il s'affichait, se
   *  cliquait, et ne faisait rien — invisible tant qu'on n'avait pas de bibliothèque, puisque
   *  l'écran de premier lancement, lui, était câblé. */
  readonly onCreer?: (() => void) | undefined;
  /** Ouvrir **cette** bibliothèque, désignée par son identifiant. Sans cela, toutes les cartes
   *  menaient au même écran, qui montrait toujours la même bibliothèque. */
  readonly onOuvrir?: ((id: string) => void) | undefined;
  /** Éprouve une copie portable dans cette session, sans changer les réglages persistants. */
  readonly onTesterCopie?: (() => void) | undefined;
  /** Renommer la bibliothèque sur le disque. L'Accueil en ligne n'expose pas cette action. */
  readonly onRenommer?: ((id: string, nom: string) => void | Promise<void>) | undefined;
  readonly applicationEmbarquee?: EtatApplicationEmbarquee | undefined;
  readonly onMettreAJourApplication?: (() => void) | undefined;
};

/** Accueil du CDC : cartes de bibliothèques, « reprendre où vous en étiez », cas à vérifier.
 *  Chaque section n'existe que si elle a du contenu : rien ne s'affiche à vide. */
export function Accueil({
  donnees,
  onFichiers,
  onParcourir,
  depotEnAttente,
  onChoisirBibliothequePourDepot,
  onAnnulerDepot,
  echecDepot,
  onCreer,
  onOuvrir,
  onTesterCopie,
  onRenommer,
  applicationEmbarquee,
  onMettreAJourApplication,
}: Props): JSX.Element {
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
            {onCreer === undefined ? null : (
              <div className="ln-accueil__actions">
                <Bouton variante="principal" icone={<Icone nom="plus" />} onClick={onCreer}>
                  Nouvelle bibliothèque
                </Bouton>
                {onTesterCopie === undefined ? null : (
                  <button type="button" className="ln-lien-action" onClick={onTesterCopie}>
                    <Icone nom="ordinateur" />
                    Tester temporairement une copie
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="ln-grille">
            {bibliotheques.map((bibliotheque) => (
              <CarteBibliotheque
                key={bibliotheque.id}
                {...(onOuvrir === undefined ? {} : { onOuvrir: () => onOuvrir(bibliotheque.id) })}
                {...(onRenommer === undefined
                  ? {}
                  : {
                      onRenommer: () => {
                        const propose = globalThis.prompt("Nouveau nom de la bibliothèque", bibliotheque.nom)?.trim();
                        if (propose !== undefined && propose.length > 0 && propose !== bibliotheque.nom)
                          void onRenommer(bibliotheque.id, propose);
                      },
                    })}
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

        {applicationEmbarquee === undefined ? null : (
          <section className="ln-panneau" aria-labelledby="titre-application-autonome">
            <h2 id="titre-application-autonome" className="ln-accueil__titre">
              Application autonome
            </h2>
            <p>{applicationEmbarquee.message}</p>
            <p className="ln-muted">
              Version ouverte : {applicationEmbarquee.versionCourante}
              {applicationEmbarquee.versionEmbarquee === null
                ? " · version embarquée non référencée"
                : ` · version embarquée : ${applicationEmbarquee.versionEmbarquee}`}
            </p>
            <p className="ln-muted">Données de la bibliothèque inchangées : seules les écritures sous applications/ sont autorisées.</p>
            {!applicationEmbarquee.actionDisponible || onMettreAJourApplication === undefined ? null : (
              <Bouton variante="secondaire" onClick={onMettreAJourApplication}>
                Mettre à jour l’application embarquée
              </Bouton>
            )}
          </section>
        )}
      </div>

      {aVerifier === undefined && traitement === undefined && onFichiers === undefined ? null : (
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

        {depotEnAttente === undefined || depotEnAttente.length === 0 || onChoisirBibliothequePourDepot === undefined ? null : (
          <section className="ln-panneau ln-accueil__destination" aria-labelledby="titre-destination-depot">
            <h2 id="titre-destination-depot" className="ln-accueil__titre">
              Dans quelle bibliothèque l’ajouter ?
            </h2>
            <p className="ln-muted">
              {depotEnAttente.length} fichier{depotEnAttente.length > 1 ? "s" : ""} retenu{depotEnAttente.length > 1 ? "s" : ""} :
            </p>
            <ul className="ln-accueil__fichiers-retenus">
              {depotEnAttente.map((nom, index) => <li key={`${index}-${nom}`}>{nom}</li>)}
            </ul>
            <div className="ln-accueil__choix-destination">
              {bibliotheques.map((bibliotheque) => (
                <button
                  key={bibliotheque.id}
                  type="button"
                  className="ln-btn ln-btn--secondaire"
                  onClick={() => onChoisirBibliothequePourDepot(bibliotheque.id)}
                >
                  Ajouter à {bibliotheque.nom}
                </button>
              ))}
            </div>
            {echecDepot === undefined ? null : <p role="alert">{echecDepot}</p>}
            {onAnnulerDepot === undefined ? null : (
              <button type="button" className="ln-lien-action" onClick={onAnnulerDepot}>Annuler ce dépôt</button>
            )}
          </section>
        )}

        {onFichiers === undefined ? null : (
          <ZoneDepot
            titre="Déposez des fichiers ici"
            aide="Liénothèque proposera la bonne bibliothèque."
            libelleBouton="Choisir des fichiers"
            onFichiers={onFichiers}
            {...(onParcourir === undefined ? {} : { onParcourir })}
          />
        )}
      </aside>
      )}
    </main>
  );
}
